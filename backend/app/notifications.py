import time
import uuid
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g

from app import db
from app.models import Notification
from app.authz import auth_required


notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

_last_email_sent = {}
EMAIL_THROTTLE_SECONDS = 600


def _should_email(user_id, event_type, conversation_id):
    """Throttle only chat-message emails; everything else is always sent."""
    if event_type != "MESSAGE":
        return True
    key = (str(user_id), str(conversation_id))
    now = time.time()
    if now - _last_email_sent.get(key, 0) < EMAIL_THROTTLE_SECONDS:
        return False
    if len(_last_email_sent) > 5000:
        _last_email_sent.clear()
    _last_email_sent[key] = now
    return True


def utc_now():
    return datetime.now(timezone.utc)


def create_notification(
    user_id: uuid.UUID,
    event_type: str,
    title: str,
    message: str,
    related_task_id=None,
    related_team_id=None,
    related_conversation_id=None,
    send_email: bool = False
):
    """
    Creates a persistent notification, with optional asynchronous email.
    Chat-message notifications are collapsed: one unread notification per conversation.
    """
    try:
        notif = None
        if event_type == "MESSAGE" and related_conversation_id:
            notif = Notification.query.filter_by(
                user_id=user_id,
                event_type="MESSAGE",
                related_conversation_id=related_conversation_id,
                is_read=False,
            ).first()
            if notif:
                notif.title = title
                notif.message = message
                notif.created_at = utc_now()

        if notif is None:
            notif = Notification(
                user_id=user_id,
                event_type=event_type,
                title=title,
                message=message,
                related_task_id=related_task_id,
                related_team_id=related_team_id,
                related_conversation_id=related_conversation_id,
                is_read=False,
                created_at=utc_now()
            )
            db.session.add(notif)
        db.session.commit()

        if send_email and _should_email(user_id, event_type, related_conversation_id):
            try:
                from app.models import User
                from app.mailer import send_notification_email_async
                recipient = db.session.get(User, user_id)
                if recipient and recipient.email:
                    send_notification_email_async(
                        to_email=recipient.email,
                        recipient_name=recipient.display_name or recipient.email,
                        title=title,
                        message=message,
                        event_type=event_type
                    )
            except Exception as mail_err:
                print(f"[Notification Mailer Warning] {mail_err}")

        return notif
    except Exception as e:
        db.session.rollback()
        print(f"Failed to create notification: {e}")
        return None


@notifications_bp.route("", methods=["GET"])
@auth_required
def list_notifications():
    unread_only = request.args.get("unread", "false").lower() == "true"

    query = Notification.query.filter_by(user_id=g.current_user.id)
    if unread_only:
        query = query.filter_by(is_read=False)

    notifications = query.order_by(Notification.created_at.desc()).limit(50).all()
    unread_count = Notification.query.filter_by(user_id=g.current_user.id, is_read=False).count()

    return jsonify({
        "notifications": [n.to_dict() for n in notifications],
        "unread_count": unread_count,
        "total": len(notifications)
    }), 200


@notifications_bp.route("/<uuid:notification_id>/read", methods=["PUT"])
@auth_required
def mark_notification_read(notification_id):
    notif = Notification.query.filter_by(id=notification_id, user_id=g.current_user.id).first()
    if not notif:
        return jsonify({"message": "Notification not found"}), 404

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = utc_now()
        db.session.commit()

    return jsonify({"message": "Notification marked as read", "notification": notif.to_dict()}), 200


@notifications_bp.route("/read-all", methods=["PUT"])
@auth_required
def mark_all_read():
    Notification.query.filter_by(user_id=g.current_user.id, is_read=False).update(
        {"is_read": True, "read_at": utc_now()}
    )
    db.session.commit()
    return jsonify({"message": "All notifications marked as read"}), 200