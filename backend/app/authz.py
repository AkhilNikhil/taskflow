import os
import uuid
from functools import wraps
from typing import Optional
from flask import request, jsonify, g
from app import db
from app.jwt_verifier import verify_supabase_jwt, AuthError
from app.models import User, TeamMember

SYSTEM_ROLE_ARCHITECT = "ARCHITECT"
SYSTEM_ROLE_ADMIN = "ADMIN"
SYSTEM_ROLE_USER = "USER"

# No hardcoded fallback on purpose: create_app() validates this is set at
# boot (same as DATABASE_URL), so a missing value fails loudly instead of
# silently promoting whoever the previous deployer's email was.
ROOT_ARCHITECT_EMAIL = (os.getenv("ROOT_ARCHITECT_EMAIL") or "").strip().lower()

TEAM_ROLE_LEADER = "LEADER"
TEAM_ROLE_MEMBER = "MEMBER"


def get_token_from_header() -> Optional[str]:
    """Extracts the Bearer token from the incoming Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def auth_required(fn):
    """
    Decorator that verifies the Supabase Auth JWT, maps auth.uid() to public.users.id,
    confirms account status is ACTIVE, and injects the user into Flask's application context (g).
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_token_from_header()
        if not token:
            return jsonify({"message": "Authorization header missing or invalid"}), 401

        try:
            payload = verify_supabase_jwt(token)
        except AuthError as e:
            return jsonify({"message": e.message}), e.status_code
        except Exception as e:
            return jsonify({"message": f"Authentication verification failed: {str(e)}"}), 401

        sub = payload.get("sub")
        try:
            user_id = uuid.UUID(str(sub))
        except (ValueError, TypeError):
            return jsonify({"message": "Invalid user identity in token"}), 401

        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"message": "User profile not found. Please sync profile."}), 401

        if user.account_status in ("DISABLED", "SUSPENDED"):
            return jsonify({"message": f"Account is {user.account_status.lower()}"}), 403

        g.current_user = user
        g.current_user_id = user.id
        g.jwt_payload = payload

        return fn(*args, **kwargs)
    return wrapper


def system_role_required(*allowed_roles: str):
    """
    Decorator enforcing that the authenticated user holds one of the specified system roles.
    Executes authentication first if not already authenticated.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not hasattr(g, "current_user") or g.current_user is None:
                token = get_token_from_header()
                if not token:
                    return jsonify({"message": "Authorization header missing or invalid"}), 401

                try:
                    payload = verify_supabase_jwt(token)
                    user_id = uuid.UUID(str(payload.get("sub")))
                    user = db.session.get(User, user_id)
                    if not user:
                        return jsonify({"message": "User profile not found. Please sync profile."}), 401
                    if user.account_status in ("DISABLED", "SUSPENDED"):
                        return jsonify({"message": f"Account is {user.account_status.lower()}"}), 403

                    g.current_user = user
                    g.current_user_id = user.id
                    g.jwt_payload = payload
                except AuthError as e:
                    return jsonify({"message": e.message}), e.status_code
                except Exception as e:
                    return jsonify({"message": f"Authentication verification failed: {str(e)}"}), 401

            if g.current_user.system_role not in allowed_roles:
                return jsonify({
                    "message": "Forbidden: Insufficient system permissions"
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def architect_required(fn):
    """Decorator restricting access strictly to the ARCHITECT system role."""
    return system_role_required(SYSTEM_ROLE_ARCHITECT)(fn)


def admin_required(fn):
    """Decorator restricting access to ADMIN or ARCHITECT system roles."""
    return system_role_required(SYSTEM_ROLE_ADMIN, SYSTEM_ROLE_ARCHITECT)(fn)


def get_user_team_role(user_id: uuid.UUID, team_id: uuid.UUID) -> Optional[str]:
    """Retrieves the team role ('LEADER' or 'MEMBER') for a user in a team, or None."""
    if not user_id or not team_id:
        return None
    membership = TeamMember.query.filter_by(
        user_id=user_id,
        team_id=team_id
    ).first()
    return membership.team_role if membership else None


def is_team_leader(user_id: uuid.UUID, team_id: uuid.UUID) -> bool:
    """Returns True if the user is a LEADER of the specified team."""
    return get_user_team_role(user_id, team_id) == TEAM_ROLE_LEADER


def is_team_member(user_id: uuid.UUID, team_id: uuid.UUID) -> bool:
    """Returns True if the user is a member (MEMBER or LEADER) of the specified team."""
    role = get_user_team_role(user_id, team_id)
    return role in (TEAM_ROLE_LEADER, TEAM_ROLE_MEMBER)


def require_team_role(*allowed_team_roles: str, allow_admin: bool = True):
    """
    Decorator verifying that the authenticated user holds an authorized team role
    in the team identified by 'team_id' (passed in route kwargs or request JSON).
    ARCHITECT and ADMIN users bypass this restriction when allow_admin=True.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not hasattr(g, "current_user") or g.current_user is None:
                return jsonify({"message": "Authentication required"}), 401

            if allow_admin and g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN):
                return fn(*args, **kwargs)

            raw_team_id = kwargs.get("team_id")
            if not raw_team_id:
                json_data = request.get_json(silent=True) or {}
                raw_team_id = json_data.get("team_id")

            if not raw_team_id:
                return jsonify({"message": "team_id is required to verify team role"}), 400

            try:
                team_uuid = uuid.UUID(str(raw_team_id))
            except (ValueError, TypeError):
                return jsonify({"message": "Invalid team_id format"}), 400

            role = get_user_team_role(g.current_user.id, team_uuid)
            if not role or role not in allowed_team_roles:
                return jsonify({
                    "message": "Forbidden: Insufficient team role permissions"
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
