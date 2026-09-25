from flask import Blueprint, jsonify, request, g

from sqlalchemy import text



from app import db

from app.models import (User, Team, TeamMember, Task, Conversation,

                        ConversationMember, Message, Notification)

from app.authz import (

    auth_required, architect_required, ROOT_ARCHITECT_EMAIL,

    SYSTEM_ROLE_ADMIN, SYSTEM_ROLE_USER,

)



admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")





@admin_bp.route("/users", methods=["GET"])

@auth_required

@architect_required

def list_users():

    users = User.query.order_by(User.created_at.desc()).all()

    return jsonify({

        "users": [

            {

                "id": str(u.id), "email": u.email, "display_name": u.display_name,

                "system_role": u.system_role, "account_status": u.account_status,

                "created_at": u.created_at.isoformat() if u.created_at else None,

            }

            for u in users

        ],

        "total": len(users),

    }), 200





@admin_bp.route("/users/<uuid:user_id>/role", methods=["PUT"])

@auth_required

@architect_required

def update_user_system_role(user_id):

    """Promote/demote between USER and ADMIN only."""

    target = db.session.get(User, user_id)

    if not target:

        return jsonify({"message": "User not found"}), 404

    if target.id == g.current_user.id:

        return jsonify({"message": "Architect cannot alter their own system role"}), 400

    if target.email and target.email.strip().lower() == ROOT_ARCHITECT_EMAIL:

        return jsonify({"message": "The root Architect role cannot be changed"}), 400



    data = request.get_json(silent=True) or {}

    new_role = (data.get("system_role") or "").strip().upper()

    if new_role not in (SYSTEM_ROLE_USER, SYSTEM_ROLE_ADMIN):   # ARCHITECT removed on purpose

        return jsonify({"message": "Invalid system_role. Must be USER or ADMIN"}), 400



    target.system_role = new_role

    db.session.commit()

    return jsonify({"message": f"Updated {target.email} role to {new_role}", "user": target.to_dict()}), 200





@admin_bp.route("/users/<uuid:user_id>/status", methods=["PUT"])
@auth_required
@architect_required
def update_user_status(user_id):
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"message": "User not found"}), 404
    if target.id == g.current_user.id:
        return jsonify({"message": "Architect cannot alter their own account status"}), 400
    if target.email and target.email.strip().lower() == ROOT_ARCHITECT_EMAIL:
        return jsonify({"message": "The root Architect account cannot be suspended"}), 400

    data = request.get_json(silent=True) or {}
    new_status = (data.get("account_status") or "").strip().upper()
    if new_status not in ("ACTIVE", "SUSPENDED", "DISABLED"):
        return jsonify({"message": "Invalid account_status. Must be ACTIVE, SUSPENDED or DISABLED"}), 400

    target.account_status = new_status
    db.session.flush()

    # Mirror into Supabase Auth so the person cannot sign in while suspended
    try:
        with db.session.begin_nested():
            if new_status == "ACTIVE":
                db.session.execute(text("UPDATE auth.users SET banned_until = NULL WHERE id = :u"),
                                   {"u": str(user_id)})
            else:
                db.session.execute(text("UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = :u"),
                                   {"u": str(user_id)})
    except Exception as e:
        print(f"[Auth ban sync notice] {e}")

    if new_status != "ACTIVE":
        try:
            with db.session.begin_nested():
                db.session.execute(text("DELETE FROM auth.sessions WHERE user_id = :u"), {"u": str(user_id)})
        except Exception as e:
            print(f"[Auth session revoke notice] {e}")

    db.session.commit()
    return jsonify({"message": f"Updated {target.email} status to {new_status}", "user": target.to_dict()}), 200





def _purge_user_rows(uid):

    """Detach or remove everything that references the user, then remove the user row."""

    # Teams where this user is a leader (to re-elect a leader afterwards)

    led_team_ids = [m.team_id for m in TeamMember.query.filter_by(user_id=uid, team_role="LEADER").all()]



    # Rows that merely REFERENCE the user -> keep the row, clear the reference

    Task.query.filter_by(created_by=uid).update({"created_by": None}, synchronize_session=False)

    Task.query.filter_by(assigned_user_id=uid).update({"assigned_user_id": None}, synchronize_session=False)

    Task.query.filter_by(owner_user_id=uid).update({"owner_user_id": None}, synchronize_session=False)

    Team.query.filter_by(created_by=uid).update({"created_by": None}, synchronize_session=False)

    Conversation.query.filter_by(created_by=uid).update({"created_by": None}, synchronize_session=False)

    Message.query.filter_by(sender_id=uid).update({"sender_id": None}, synchronize_session=False)



    # Rows that BELONG to the user -> delete

    Notification.query.filter_by(user_id=uid).delete(synchronize_session=False)

    ConversationMember.query.filter_by(user_id=uid).delete(synchronize_session=False)

    TeamMember.query.filter_by(user_id=uid).delete(synchronize_session=False)



    # Make sure no team is left without a leader

    for tid in led_team_ids:

        if not TeamMember.query.filter_by(team_id=tid, team_role="LEADER").first():

            nxt = TeamMember.query.filter_by(team_id=tid).order_by(TeamMember.joined_at.asc()).first()

            if nxt:

                nxt.team_role = "LEADER"



    db.session.query(User).filter(User.id == uid).delete(synchronize_session=False)





@admin_bp.route("/users/<uuid:user_id>", methods=["DELETE"])

@auth_required

@architect_required

def delete_user(user_id):

    target = db.session.get(User, user_id)

    if not target:

        return jsonify({"message": "User not found"}), 404

    if target.id == g.current_user.id:

        return jsonify({"message": "Architect cannot delete their own account"}), 400

    if target.email and target.email.strip().lower() == ROOT_ARCHITECT_EMAIL:

        return jsonify({"message": "The root Architect account cannot be deleted"}), 400



    email = target.email

    try:

        _purge_user_rows(user_id)



        try:

            with db.session.begin_nested():   # savepoint

                db.session.execute(text("DELETE FROM auth.users WHERE id = :uid"), {"uid": str(user_id)})

        except Exception as auth_err:

            # Could not remove the login account: undo everything and DISABLE instead,

            # so /sync can never silently re-create this person.

            db.session.rollback()

            print(f"[Admin delete auth.users failed] {auth_err}")

            user = db.session.get(User, user_id)

            if user:

                user.account_status = "DISABLED"

                db.session.commit()

            return jsonify({

                "message": f"Could not remove the login account for {email}; the user was DISABLED instead.",

                "deleted_user_id": str(user_id),

            }), 200



        db.session.commit()

        return jsonify({"message": f"User {email} deleted successfully", "deleted_user_id": str(user_id)}), 200

    except Exception as e:

        db.session.rollback()

        print(f"[Admin delete user error] {e}")

        return jsonify({"message": "Failed to delete user. Please try again."}), 500
