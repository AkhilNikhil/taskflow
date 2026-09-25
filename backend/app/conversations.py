import uuid
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g
from sqlalchemy import or_, and_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app import db
from app.models import (User, Team, TeamMember, Conversation, ConversationMember,
                        Message, Notification)
from app.authz import auth_required, SYSTEM_ROLE_ARCHITECT


conversations_bp = Blueprint("conversations", __name__, url_prefix="/api/conversations")

PAGE_SIZE = 100
OLDER_PAGE_SIZE = 50


def utc_now():
    return datetime.now(timezone.utc)


def _parse_ts(raw):
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _is_participant(conv, user_id):
    if conv.conversation_type == "TEAM":
        return TeamMember.query.filter_by(team_id=conv.team_id, user_id=user_id).first() is not None
    return ConversationMember.query.filter_by(conversation_id=conv.id, user_id=user_id).first() is not None


def _mark_read(conv, user_id):
    """Upserts last_read_at for a participant. Returns True if the user is a participant."""
    if not _is_participant(conv, user_id):
        return False
    now = utc_now()
    cm = ConversationMember.query.filter_by(conversation_id=conv.id, user_id=user_id).first()
    try:
        if cm:
            cm.last_read_at = now
        else:   # team channels get a row lazily, the first time someone reads them
            db.session.add(ConversationMember(conversation_id=conv.id, user_id=user_id, last_read_at=now))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        cm = ConversationMember.query.filter_by(conversation_id=conv.id, user_id=user_id).first()
        if cm:
            cm.last_read_at = now
            db.session.commit()
    return True


def _user_conversations(user):
    """Conversations the user actually participates in (team channels + direct chats)."""
    team_ids = [m.team_id for m in user.team_memberships]
    direct_ids = [cm.conversation_id for cm in ConversationMember.query.filter_by(user_id=user.id).all()]
    conds = []
    if team_ids:
        conds.append(and_(Conversation.conversation_type == "TEAM", Conversation.team_id.in_(team_ids)))
    if direct_ids:
        conds.append(and_(Conversation.conversation_type == "DIRECT", Conversation.id.in_(direct_ids)))
    if not conds:
        return []
    return Conversation.query.filter(or_(*conds)).order_by(Conversation.updated_at.desc()).all()


def _compute_unread(user, convs):
    """{conversation_id: unread_count}. Incoming pending DM requests count as 1."""
    if not convs:
        return {}
    conv_ids = [c.id for c in convs]
    cms = {
        cm.conversation_id: cm
        for cm in ConversationMember.query.filter(
            ConversationMember.user_id == user.id,
            ConversationMember.conversation_id.in_(conv_ids),
        ).all()
    }
    team_joined = {m.team_id: m.joined_at for m in user.team_memberships}

    result = {}
    for c in convs:
        cm = cms.get(c.id)
        if cm:
            baseline = cm.last_read_at or cm.joined_at
        elif c.conversation_type == "TEAM" and c.team_id in team_joined:
            baseline = team_joined[c.team_id]     # never opened: only count messages since joining
        else:
            result[c.id] = 0                      # not a participant (e.g. Architect supervising)
            continue

        q = Message.query.filter(
            Message.conversation_id == c.id,
            Message.is_deleted.is_(False),
            Message.created_at > baseline,
            or_(Message.sender_id != user.id, Message.sender_id.is_(None)),
        )
        count = q.count()
        if c.conversation_type == "DIRECT" and c.dm_status == "PENDING" and c.created_by != user.id:
            count += 1
        result[c.id] = count
    return result


def format_conversation_for_user(conv: Conversation, current_user_id: uuid.UUID,
                                 is_architect: bool, unread: int = 0) -> dict:
    d = conv.to_dict()

    members_info = [
        {
            "user_id": str(m.user_id),
            "email": m.user.email if m.user else None,
            "display_name": m.user.display_name if m.user else None,
        }
        for m in conv.members
    ]
    d["members"] = members_info

    if conv.conversation_type == "TEAM":
        team_name = conv.team.name if conv.team else "Unnamed Team"
        d["title"] = f"# {team_name}"
        d["subtitle"] = f"{len(conv.team.members if conv.team else [])} team members"
        d["can_send"] = True
    else:
        other_members = [m for m in members_info if m["user_id"] != str(current_user_id)]
        if other_members:
            d["title"] = other_members[0]["display_name"] or other_members[0]["email"] or "Direct Chat"
            d["subtitle"] = other_members[0]["email"] or "Direct Message"
        elif is_architect and members_info:
            emails = [m["email"] or m["display_name"] or "User" for m in members_info]
            d["title"] = " & ".join(emails)
            d["subtitle"] = "Direct Chat (Supervised)"
        else:
            d["title"] = "Direct Chat"
            d["subtitle"] = "Private Message"

        status = conv.dm_status or "ACCEPTED"
        me_in = any(m["user_id"] == str(current_user_id) for m in members_info)
        d["dm_status"] = status
        d["requested_by"] = str(conv.created_by) if conv.created_by else None
        d["is_incoming_request"] = bool(me_in and status == "PENDING" and conv.created_by != current_user_id)
        d["can_send"] = status == "ACCEPTED"

    d["unread_count"] = unread

    last_msg = Message.query.filter_by(conversation_id=conv.id, is_deleted=False) \
        .order_by(Message.created_at.desc()).first()
    if last_msg:
        d["last_message"] = {
            "content": last_msg.content,
            "sender_name": last_msg.sender.display_name or last_msg.sender.email if last_msg.sender else "Unknown",
            "created_at": last_msg.created_at.isoformat(),
        }
    else:
        d["last_message"] = None

    return d


# ---------------------------------------------------------------------------
# Listing / unread
# ---------------------------------------------------------------------------
@conversations_bp.route("", methods=["GET"])
@auth_required
def list_conversations():
    """
    - ARCHITECT sees ALL conversations (supervision).
    - Everyone else sees their team channels and their direct chats.
    """
    is_architect = g.current_user.system_role == SYSTEM_ROLE_ARCHITECT

    # Make sure each of the user's teams has a TEAM channel
    for m in g.current_user.team_memberships:
        existing = Conversation.query.filter_by(conversation_type="TEAM", team_id=m.team_id).first()
        if not existing:
            db.session.add(Conversation(conversation_type="TEAM", team_id=m.team_id,
                                        created_by=g.current_user.id))
            db.session.commit()

    if is_architect:
        convs = Conversation.query.order_by(Conversation.updated_at.desc()).all()
    else:
        convs = _user_conversations(g.current_user)

    unread = _compute_unread(g.current_user, convs)
    result = [format_conversation_for_user(c, g.current_user.id, is_architect, unread.get(c.id, 0)) for c in convs]
    return jsonify({"conversations": result, "total": len(result)}), 200


@conversations_bp.route("/unread-count", methods=["GET"])
@auth_required
def unread_count():
    convs = _user_conversations(g.current_user)
    unread = _compute_unread(g.current_user, convs)
    return jsonify({"unread_count": sum(unread.values())}), 200


@conversations_bp.route("/<uuid:conversation_id>/read", methods=["POST"])
@auth_required
def mark_conversation_read(conversation_id):
    conv = db.session.get(Conversation, conversation_id)
    if not conv:
        return jsonify({"message": "Conversation not found"}), 404

    participant = _mark_read(conv, g.current_user.id)
    if participant:
        # Opening a chat also clears its bell notifications
        Notification.query.filter_by(
            user_id=g.current_user.id, related_conversation_id=conv.id, is_read=False
        ).update({"is_read": True, "read_at": utc_now()}, synchronize_session=False)
        db.session.commit()
    return jsonify({"message": "ok", "participant": participant}), 200


# ---------------------------------------------------------------------------
# Direct messages (with approval)
# ---------------------------------------------------------------------------
@conversations_bp.route("/direct", methods=["POST"])
@auth_required
def get_or_create_direct_conversation():
    """
    Starts (or returns) a 1-on-1 chat. A NEW chat is a *request*: the other person must accept
    before anyone can send messages.
    """
    from app.notifications import create_notification

    data = request.get_json() or {}
    target_user_id = data.get("target_user_id")
    target_email = data.get("target_email")

    target_user = None
    if target_user_id:
        try:
            target_user = db.session.get(User, uuid.UUID(str(target_user_id)))
        except (ValueError, TypeError):
            return jsonify({"message": "Invalid target_user_id format"}), 400
    elif target_email:
        clean_email = str(target_email).strip().lower()
        target_user = User.query.filter(db.func.lower(User.email) == clean_email).first()

        # Registered in Supabase but never logged in: provision from auth.users
        if not target_user:
            try:
                row = db.session.execute(text(
                    "SELECT id, email, raw_user_meta_data->>'display_name' AS display_name "
                    "FROM auth.users WHERE LOWER(email) = :email"
                ), {"email": clean_email}).fetchone()
                if row:
                    target_user = User(
                        id=row.id, email=row.email,
                        display_name=row.display_name or row.email.split('@')[0],
                        system_role="USER", account_status="ACTIVE",
                    )
                    db.session.add(target_user)
                    db.session.commit()
            except Exception as auth_lookup_err:
                db.session.rollback()
                print(f"[Conversations auth.users lookup notice] {auth_lookup_err}")

    if not target_user:
        return jsonify({"message": f"User with email '{target_email}' not found. Please ensure they have registered an account."}), 404
    if target_user.id == g.current_user.id:
        return jsonify({"message": "Cannot create a direct conversation with yourself"}), 400
    if target_user.account_status in ("DISABLED", "SUSPENDED"):
        return jsonify({"message": "This user's account is not active"}), 400

    me = g.current_user
    is_architect = me.system_role == SYSTEM_ROLE_ARCHITECT
    sender_label = me.display_name or me.email

    # Existing DIRECT chat between the two of us? (team channels are excluded on purpose)
    my_direct_ids = [
        row[0] for row in db.session.query(ConversationMember.conversation_id)
        .join(Conversation, Conversation.id == ConversationMember.conversation_id)
        .filter(ConversationMember.user_id == me.id, Conversation.conversation_type == "DIRECT")
        .all()
    ]
    existing_conv = None
    if my_direct_ids:
        shared = ConversationMember.query.filter(
            ConversationMember.user_id == target_user.id,
            ConversationMember.conversation_id.in_(my_direct_ids),
        ).first()
        if shared:
            existing_conv = db.session.get(Conversation, shared.conversation_id)

    if existing_conv:
        # They already asked to message ME -> me starting a chat with them means "accept"
        if existing_conv.dm_status == "PENDING" and existing_conv.created_by == target_user.id:
            existing_conv.dm_status = "ACCEPTED"
            db.session.commit()
            create_notification(
                user_id=target_user.id, event_type="DM_ACCEPTED",
                title=f"{sender_label} accepted your message request",
                message="You can start chatting now.",
                related_conversation_id=existing_conv.id,
            )
        return jsonify({
            "conversation": format_conversation_for_user(existing_conv, me.id, is_architect),
            "created": False,
        }), 200

    new_conv = Conversation(conversation_type="DIRECT", created_by=me.id, dm_status="PENDING")
    db.session.add(new_conv)
    db.session.flush()
    db.session.add_all([
        ConversationMember(conversation_id=new_conv.id, user_id=me.id),
        ConversationMember(conversation_id=new_conv.id, user_id=target_user.id),
    ])
    db.session.commit()
    db.session.refresh(new_conv)

    create_notification(
        user_id=target_user.id, event_type="DM_REQUEST",
        title=f"{sender_label} wants to message you",
        message="Open Team & Direct Chat to accept or decline this request.",
        related_conversation_id=new_conv.id, send_email=True,
    )

    return jsonify({
        "conversation": format_conversation_for_user(new_conv, me.id, is_architect),
        "created": True,
    }), 201


@conversations_bp.route("/<uuid:conversation_id>/respond", methods=["POST"])
@auth_required
def respond_to_direct_request(conversation_id):
    """The person who RECEIVED a message request accepts or declines it."""
    from app.notifications import create_notification

    conv = db.session.get(Conversation, conversation_id)
    if not conv or conv.conversation_type != "DIRECT":
        return jsonify({"message": "Conversation not found"}), 404

    me = g.current_user
    if not ConversationMember.query.filter_by(conversation_id=conv.id, user_id=me.id).first():
        return jsonify({"message": "Forbidden: you are not part of this conversation"}), 403
    if conv.created_by == me.id:
        return jsonify({"message": "You sent this request. Only the other person can respond."}), 400

    action = ((request.get_json(silent=True) or {}).get("action") or "").strip().lower()
    if action not in ("accept", "decline"):
        return jsonify({"message": "action must be 'accept' or 'decline'"}), 400

    if action == "accept":
        was_accepted = conv.dm_status == "ACCEPTED"
        conv.dm_status = "ACCEPTED"
    else:
        if conv.dm_status == "ACCEPTED":
            return jsonify({"message": "This chat is already accepted"}), 400
        conv.dm_status = "DECLINED"
    db.session.commit()

    if action == "accept" and not was_accepted and conv.created_by:
        create_notification(
            user_id=conv.created_by, event_type="DM_ACCEPTED",
            title=f"{me.display_name or me.email} accepted your message request",
            message="You can start chatting now.",
            related_conversation_id=conv.id,
        )

    is_architect = me.system_role == SYSTEM_ROLE_ARCHITECT
    return jsonify({"conversation": format_conversation_for_user(conv, me.id, is_architect)}), 200


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------
def _check_conversation_access(conv, user, is_architect, verb):
    """Returns an error response tuple, or None if the user may access the conversation."""
    if is_architect:
        return None
    if conv.conversation_type == "TEAM":
        if not TeamMember.query.filter_by(team_id=conv.team_id, user_id=user.id).first():
            return jsonify({"message": f"Forbidden: You cannot {verb} a team you are not a member of"}), 403
    else:
        if not ConversationMember.query.filter_by(conversation_id=conv.id, user_id=user.id).first():
            return jsonify({"message": f"Forbidden: You cannot {verb} this conversation"}), 403
    return None


@conversations_bp.route("/<uuid:conversation_id>/messages", methods=["GET"])
@auth_required
def get_conversation_messages(conversation_id):
    """
    Message history.
      (none)         -> newest 100 messages
      ?before=<ts>   -> 50 messages older than <ts>   (load older)
      ?since=<ts>    -> new + edited + deleted messages since <ts>  (polling)
    """
    conv = db.session.get(Conversation, conversation_id)
    if not conv:
        return jsonify({"message": "Conversation not found"}), 404

    is_architect = g.current_user.system_role == SYSTEM_ROLE_ARCHITECT
    denied = _check_conversation_access(conv, g.current_user, is_architect, "view")
    if denied:
        return denied

    query = Message.query.options(joinedload(Message.sender)).filter_by(conversation_id=conv.id)
    since_raw = request.args.get("since")
    before_raw = request.args.get("before")
    has_more = False

    try:
        if since_raw:
            since_dt = _parse_ts(since_raw)
            messages = query.filter(or_(
                Message.created_at > since_dt,
                Message.edited_at > since_dt,
                Message.deleted_at > since_dt,
            )).order_by(Message.created_at.asc()).all()
        else:
            limit = OLDER_PAGE_SIZE if before_raw else PAGE_SIZE
            if before_raw:
                query = query.filter(Message.created_at < _parse_ts(before_raw))
            rows = query.order_by(Message.created_at.desc()).limit(limit + 1).all()
            has_more = len(rows) > limit
            messages = rows[:limit]
            messages.reverse()
    except ValueError:
        return jsonify({"message": "Invalid timestamp"}), 400

    formatted = []
    for m in messages:
        item = m.to_dict()
        item["is_self"] = str(m.sender_id) == str(g.current_user.id)
        formatted.append(item)

    payload = {"messages": formatted, "total": len(formatted), "has_more": has_more}
    if not since_raw and not before_raw:
        payload["conversation"] = format_conversation_for_user(conv, g.current_user.id, is_architect)
    return jsonify(payload), 200


@conversations_bp.route("/<uuid:conversation_id>/messages", methods=["POST"])
@auth_required
def send_message(conversation_id):
    conv = db.session.get(Conversation, conversation_id)
    if not conv:
        return jsonify({"message": "Conversation not found"}), 404

    is_architect = g.current_user.system_role == SYSTEM_ROLE_ARCHITECT
    denied = _check_conversation_access(conv, g.current_user, is_architect, "post to")
    if denied:
        return denied

    if conv.conversation_type == "DIRECT" and (conv.dm_status or "ACCEPTED") != "ACCEPTED":
        return jsonify({"message": "This chat isn't active yet. The other person must accept the message request first."}), 403

    data = request.get_json() or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"message": "Message content cannot be empty"}), 400
    if len(content) > 5000:
        return jsonify({"message": "Message exceeds maximum length of 5000 characters"}), 400

    new_msg = Message(conversation_id=conv.id, sender_id=g.current_user.id, content=content)
    conv.updated_at = utc_now()
    db.session.add(new_msg)
    db.session.commit()

    _mark_read(conv, g.current_user.id)     # your own reply means you've read everything before it

    try:
        from app.notifications import create_notification
        sender_label = g.current_user.display_name or g.current_user.email or "Teammate"
        snippet = content if len(content) <= 80 else content[:77] + "..."

        if conv.conversation_type == "DIRECT":
            members = ConversationMember.query.filter_by(conversation_id=conv.id).all()
            for m in members:
                if m.user_id != g.current_user.id:
                    create_notification(
                        user_id=m.user_id, event_type="MESSAGE",
                        title=f"New message from {sender_label}", message=snippet,
                        related_conversation_id=conv.id, send_email=True,
                    )
        elif conv.conversation_type == "TEAM" and conv.team:
            for tm in conv.team.members:
                if tm.user_id != g.current_user.id:
                    create_notification(
                        user_id=tm.user_id, event_type="MESSAGE",
                        title=f"New message in #{conv.team.name}",
                        message=f"{sender_label}: {snippet}",
                        related_conversation_id=conv.id, related_team_id=conv.team_id,
                    )
    except Exception as notify_err:
        print(f"[Send Message Notification Warning] {notify_err}")

    output = new_msg.to_dict()
    output["is_self"] = True
    return jsonify({"message": "Message sent", "chat_message": output}), 201


@conversations_bp.route("/<uuid:conversation_id>/messages/<uuid:message_id>", methods=["PUT"])
@auth_required
def edit_message(conversation_id, message_id):
    msg = Message.query.filter_by(id=message_id, conversation_id=conversation_id).first()
    if not msg or msg.is_deleted:
        return jsonify({"message": "Message not found"}), 404
    if msg.sender_id != g.current_user.id:
        return jsonify({"message": "You can only edit your own messages"}), 403

    content = ((request.get_json(silent=True) or {}).get("content") or "").strip()
    if not content:
        return jsonify({"message": "Message content cannot be empty"}), 400
    if len(content) > 5000:
        return jsonify({"message": "Message exceeds maximum length of 5000 characters"}), 400

    if content != msg.content:
        msg.content = content
        msg.is_edited = True
        msg.edited_at = utc_now()
        db.session.commit()

    out = msg.to_dict()
    out["is_self"] = True
    return jsonify({"message": "Message updated", "chat_message": out}), 200


@conversations_bp.route("/<uuid:conversation_id>/messages/<uuid:message_id>", methods=["DELETE"])
@auth_required
def delete_message(conversation_id, message_id):
    msg = Message.query.filter_by(id=message_id, conversation_id=conversation_id).first()
    if not msg or msg.is_deleted:
        return jsonify({"message": "Message not found"}), 404

    is_architect = g.current_user.system_role == SYSTEM_ROLE_ARCHITECT
    if msg.sender_id != g.current_user.id and not is_architect:
        return jsonify({"message": "You can only delete your own messages"}), 403

    msg.is_deleted = True
    msg.deleted_at = utc_now()
    db.session.commit()

    out = msg.to_dict()
    out["is_self"] = str(msg.sender_id) == str(g.current_user.id)
    return jsonify({"message": "Message deleted", "chat_message": out}), 200