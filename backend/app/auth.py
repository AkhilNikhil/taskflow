import time
import uuid

from flask import Blueprint, request, jsonify, g
from sqlalchemy import text

from app import db
from app.models import User, TeamMember
from app.authz import auth_required, get_token_from_header, ROOT_ARCHITECT_EMAIL
from app.jwt_verifier import verify_supabase_jwt, AuthError

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_last_discovery = 0.0
DISCOVERY_INTERVAL = 300  # seconds


@auth_bp.route("/me", methods=["GET"])
@auth_required
def get_current_user_profile():
    user = g.current_user
    user_dict = user.to_dict()
    user_dict["teams"] = [
        {
            "team_id": str(m.team_id),
            "team_name": m.team.name if m.team else None,
            "team_role": m.team_role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in user.team_memberships
    ]
    return jsonify({"user": user_dict}), 200


@auth_bp.route("/sync", methods=["POST"])
def sync_user_profile():
    token = get_token_from_header()
    if not token:
        return jsonify({"message": "Authorization header missing or invalid"}), 401

    try:
        payload = verify_supabase_jwt(token)
    except AuthError as e:
        return jsonify({"message": e.message}), e.status_code

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        return jsonify({"message": "Invalid user identity in token"}), 401

    email = payload.get("email")
    if not email:
        return jsonify({"message": "Token missing email claim"}), 400

    data = request.get_json(silent=True) or {}
    display_name = (data.get("display_name") or "").strip() or None
    is_root = email.strip().lower() == ROOT_ARCHITECT_EMAIL

    try:
        user = db.session.get(User, user_id)
        if user:
            if user.account_status in ("DISABLED", "SUSPENDED"):
                return jsonify({"message": f"Account is {user.account_status.lower()}"}), 403

            changed = False
            if is_root and user.system_role != "ARCHITECT":
                user.system_role = "ARCHITECT"
                changed = True
            if display_name and display_name != user.display_name:
                user.display_name = display_name
                changed = True
            if changed:
                db.session.commit()
            return jsonify({"message": "User profile already synchronized", "user": user.to_dict()}), 200

        meta_name = (payload.get("user_metadata") or {}).get("display_name")
        new_user = User(
            id=user_id,
            email=email,
            display_name=display_name or meta_name or email.split("@")[0],
            system_role="ARCHITECT" if is_root else "USER",
            account_status="ACTIVE",
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "User profile created successfully", "user": new_user.to_dict()}), 201
    except Exception:
        db.session.rollback()
        # Two parallel first-time syncs can race; if the row now exists, that's fine.
        existing = db.session.get(User, user_id)
        if existing:
            return jsonify({"message": "User profile already synchronized", "user": existing.to_dict()}), 200
        return jsonify({"message": "Could not synchronize profile. Please retry."}), 500


def _discover_auth_users():
    """Provision public.users rows for Supabase auth.users that never logged in. Throttled."""
    global _last_discovery
    now = time.time()
    if now - _last_discovery < DISCOVERY_INTERVAL:
        return
    _last_discovery = now
    try:
        rows = db.session.execute(text(
            "SELECT id, email, raw_user_meta_data->>'display_name' AS display_name "
            "FROM auth.users WHERE email IS NOT NULL"
        )).fetchall()
        changed = False
        for r in rows:
            if not db.session.get(User, r.id):
                is_root = r.email.strip().lower() == ROOT_ARCHITECT_EMAIL
                db.session.add(User(
                    id=r.id, email=r.email,
                    display_name=r.display_name or r.email.split("@")[0],
                    system_role="ARCHITECT" if is_root else "USER",
                    account_status="ACTIVE",
                ))
                changed = True
        if changed:
            db.session.commit()
    except Exception as err:
        db.session.rollback()   # IMPORTANT: otherwise the next query fails
        print(f"[Workspace users discovery notice] {err}")


@auth_bp.route("/users", methods=["GET"])
@auth_required
def list_workspace_users():
    _discover_auth_users()
    current_user = g.current_user

    # Privileged roles (ARCHITECT, ADMIN) see all active users in workspace
    if current_user.system_role in ("ADMIN", "ARCHITECT"):
        users = User.query.filter_by(account_status="ACTIVE").order_by(User.email.asc()).all()
    else:
        # Regular USER: Only teammates from shared teams + self
        my_team_ids = [m.team_id for m in current_user.team_memberships]
        if my_team_ids:
            teammate_user_ids = db.session.query(TeamMember.user_id).filter(
                TeamMember.team_id.in_(my_team_ids)
            ).subquery()
            users = User.query.filter(
                User.account_status == "ACTIVE",
                (User.id.in_(teammate_user_ids) | (User.id == current_user.id))
            ).order_by(User.email.asc()).all()
        else:
            users = [current_user]

    return jsonify({
        "users": [
            {"id": str(u.id), "email": u.email, "display_name": u.display_name, "system_role": u.system_role}
            for u in users
        ]
    }), 200


@auth_bp.route("/me", methods=["PUT"])
@auth_required
def update_my_profile():
    data = request.get_json(silent=True) or {}
    name = (data.get("display_name") or "").strip()
    if not name:
        return jsonify({"message": "Display name cannot be empty"}), 400
    if len(name) > 100:
        return jsonify({"message": "Display name cannot exceed 100 characters"}), 400

    g.current_user.display_name = name
    db.session.commit()
    return jsonify({"message": "Profile updated", "user": g.current_user.to_dict()}), 200