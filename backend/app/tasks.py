import uuid
from datetime import date
from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_, and_
from app import db
from app.models import Task, Team, TeamMember, User
from app.authz import (
    auth_required,
    is_team_leader,
    is_team_member,
    get_user_team_role,
    SYSTEM_ROLE_ARCHITECT,
    SYSTEM_ROLE_ADMIN,
)

tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")

VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH"}
VALID_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
MAX_BULK_LIMIT = 10


def parse_due_date(raw):
    """Returns (date | None, error | None). Accepts 'YYYY-MM-DD', empty or None."""
    if raw in (None, ""):
        return None, None
    try:
        return date.fromisoformat(str(raw)[:10]), None
    except ValueError:
        return None, "Invalid due_date. Use YYYY-MM-DD"


def format_tasks_output(tasks) -> list:
    """Batch-format tasks: 2 queries total instead of up to 3 per task (N+1 fix)."""
    tasks = list(tasks)
    if not tasks:
        return []

    user_ids, team_ids = set(), set()
    for t in tasks:
        for uid in (t.owner_user_id, t.assigned_user_id, t.created_by):
            if uid:
                user_ids.add(uid)
        if t.assigned_team_id:
            team_ids.add(t.assigned_team_id)

    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
    teams = {tm.id: tm for tm in Team.query.filter(Team.id.in_(team_ids)).all()} if team_ids else {}

    def put_person(d, prefix, uid):
        u = users.get(uid) if uid else None
        d[f"{prefix}_name"] = u.display_name if u else None
        d[f"{prefix}_email"] = u.email if u else None

    result = []
    for t in tasks:
        d = t.to_dict()
        team = teams.get(t.assigned_team_id) if t.assigned_team_id else None
        d["assigned_team_name"] = team.name if team else None
        put_person(d, "owner", t.owner_user_id)
        put_person(d, "assigned_user", t.assigned_user_id)
        put_person(d, "created_by", t.created_by)
        result.append(d)
    return result


def format_task_output(task: Task) -> dict:
    return format_tasks_output([task])[0]


@tasks_bp.route("", methods=["GET"])
@auth_required
def list_tasks():
    """
    Lists tasks accessible to the authenticated user:
    - Tasks created by user
    - Tasks assigned to user directly
    - Tasks owned by user
    - Tasks assigned to teams the user belongs to
    - System ARCHITECT / ADMIN can see all tasks
    """
    is_privileged = g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN)
    user_team_ids = [m.team_id for m in g.current_user.team_memberships]

    query = Task.query

    # Access filter unless privileged admin
    if not is_privileged:
        conditions = [
            Task.created_by == g.current_user.id,
            Task.assigned_user_id == g.current_user.id,
            Task.owner_user_id == g.current_user.id,
        ]
        if user_team_ids:
            conditions.append(Task.assigned_team_id.in_(user_team_ids))
        query = query.filter(or_(*conditions))

    # Optional query filters
    status_filter = request.args.get("status")
    if status_filter and status_filter.upper() in VALID_STATUSES:
        query = query.filter(Task.status == status_filter.upper())

    priority_filter = request.args.get("priority")
    if priority_filter and priority_filter.upper() in VALID_PRIORITIES:
        query = query.filter(Task.priority == priority_filter.upper())

    team_id_filter = request.args.get("team_id")
    if team_id_filter:
        try:
            team_uuid = uuid.UUID(team_id_filter)
            query = query.filter(Task.assigned_team_id == team_uuid)
        except ValueError:
            return jsonify({"message": "Invalid team_id filter format"}), 400

    scope_filter = request.args.get("scope")
    if scope_filter == "personal":
        query = query.filter(Task.assigned_team_id.is_(None))
    elif scope_filter == "team":
        query = query.filter(Task.assigned_team_id.isnot(None))
    elif scope_filter == "owned":
        query = query.filter(Task.owner_user_id == g.current_user.id)

    user_id_filter = request.args.get("user_id")
    if user_id_filter:
        try:
            target_user_uuid = uuid.UUID(user_id_filter)
            query = query.filter(or_(
                Task.assigned_user_id == target_user_uuid,
                Task.owner_user_id == target_user_uuid,
                Task.created_by == target_user_uuid
            ))
        except ValueError:
            return jsonify({"message": "Invalid user_id filter format"}), 400

    tasks = query.order_by(Task.created_at.desc()).all()
    result = format_tasks_output(tasks)

    return jsonify({"tasks": result, "total": len(result)}), 200


@tasks_bp.route("", methods=["POST"])
@auth_required
def create_tasks():
    """
    Creates one or multiple tasks.
    Supports single task object or {"tasks": [...]} list.
    Strictly enforces maximum bulk creation limit of 10 tasks per request.
    """
    data = request.get_json() or {}

    is_bulk = False
    task_items = []

    if isinstance(data, list):
        is_bulk = True
        task_items = data
    elif "tasks" in data and isinstance(data["tasks"], list):
        is_bulk = True
        task_items = data["tasks"]
    else:
        task_items = [data]

    # Enforce bulk creation limit
    if len(task_items) > MAX_BULK_LIMIT:
        return jsonify({
            "message": f"Bulk task creation exceeds maximum limit of {MAX_BULK_LIMIT} tasks per request"
        }), 400

    if not task_items or len(task_items) == 0:
        return jsonify({"message": "No task data provided"}), 400

    created_tasks = []
    is_privileged = g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN)

    for idx, item in enumerate(task_items):
        if not isinstance(item, dict):
            return jsonify({"message": f"Task at index {idx} must be an object"}), 400

        title = (item.get("title") or "").strip()
        if not title:
            return jsonify({"message": f"Task at index {idx} requires a non-empty title"}), 400

        if len(title) > 255:
            return jsonify({"message": f"Task title at index {idx} exceeds 255 characters"}), 400

        description = (item.get("description") or "").strip() or None
        priority = (item.get("priority") or "MEDIUM").upper()
        status = (item.get("status") or "PENDING").upper()

        if priority not in VALID_PRIORITIES:
            return jsonify({
                "message": f"Invalid priority '{priority}' at index {idx}. Must be one of: {', '.join(VALID_PRIORITIES)}"
            }), 400

        if status not in VALID_STATUSES:
            return jsonify({
                "message": f"Invalid status '{status}' at index {idx}. Must be one of: {', '.join(VALID_STATUSES)}"
            }), 400

        due, due_err = parse_due_date(item.get("due_date"))
        if due_err:
            return jsonify({"message": f"{due_err} (task at index {idx})"}), 400

        raw_team_id = item.get("assigned_team_id")
        raw_user_id = item.get("assigned_user_id")

        team_uuid = None
        user_uuid = None

        if raw_team_id:
            try:
                team_uuid = uuid.UUID(str(raw_team_id))
            except ValueError:
                return jsonify({"message": f"Invalid assigned_team_id format at index {idx}"}), 400

            team = Team.query.get(team_uuid)
            if not team:
                return jsonify({"message": f"Assigned team at index {idx} does not exist"}), 404

            # Must be a team member or admin/architect
            if not is_privileged and not is_team_member(g.current_user.id, team_uuid):
                return jsonify({
                    "message": f"Forbidden: You are not a member of team '{team.name}'"
                }), 403

        if raw_user_id:
            try:
                user_uuid = uuid.UUID(str(raw_user_id))
            except ValueError:
                return jsonify({"message": f"Invalid assigned_user_id format at index {idx}"}), 400

            target_user = User.query.get(user_uuid)
            if not target_user:
                return jsonify({"message": f"Assigned user at index {idx} does not exist"}), 404
            if target_user.account_status in ("DISABLED", "SUSPENDED"):
                return jsonify({"message": f"Assigned user at index {idx} is {target_user.account_status.lower()}"}), 400
            if team_uuid and not is_team_member(user_uuid, team_uuid):
                return jsonify({
                    "message": f"Assigned user at index {idx} is not a member of the selected team"
                }), 400
            if not team_uuid and not is_privileged and user_uuid != g.current_user.id:
                return jsonify({
                    "message": f"Personal tasks can only be assigned to yourself"
                }), 400

        new_task = Task(
            title=title,
            description=description,
            priority=priority,
            status=status,
            created_by=g.current_user.id,
            assigned_team_id=team_uuid,
            assigned_user_id=user_uuid,
            owner_user_id=user_uuid if user_uuid else (g.current_user.id if not team_uuid else None),
            due_date=due,
        )
        db.session.add(new_task)
        created_tasks.append(new_task)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Failed to save task: {str(e)}"}), 500

    # Dispatch in-app & email notifications
    try:
        from app.notifications import create_notification
        creator_name = g.current_user.display_name or g.current_user.email or "A teammate"
        for t in created_tasks:
            target_uid = t.assigned_user_id or t.owner_user_id
            team = Team.query.get(t.assigned_team_id) if t.assigned_team_id else None

            # 1. Direct user assignee gets direct assignment notification and email
            if target_uid and target_uid != g.current_user.id:
                create_notification(
                    user_id=target_uid,
                    event_type="TASK_ASSIGNED",
                    title=f"New Task Assigned: {t.title}",
                    message=f"{creator_name} assigned you a task: '{t.title}' (Priority: {t.priority})",
                    related_task_id=t.id,
                    related_team_id=t.assigned_team_id,
                    send_email=True
                )

            # 2. Team notifications
            if team:
                for tm in team.members:
                    if tm.user_id == g.current_user.id:
                        continue
                    # Skip if member was already notified as direct assignee
                    if target_uid and tm.user_id == target_uid:
                        continue

                    # Email the team leader if there's no specific assignee
                    should_email_leader = (tm.team_role == "LEADER" and not target_uid)

                    create_notification(
                        user_id=tm.user_id,
                        event_type="TASK_ASSIGNED",
                        title=f"New Team Task in #{team.name}",
                        message=f"{creator_name} added task '{t.title}' to #{team.name}" + (f" (Assigned to teammate)" if target_uid else " (Ready to claim)"),
                        related_task_id=t.id,
                        related_team_id=team.id,
                        send_email=should_email_leader
                    )
    except Exception as notif_err:
        pass

    if not is_bulk:
        return jsonify({
            "message": "Task created successfully",
            "task": format_task_output(created_tasks[0])
        }), 201

    return jsonify({
        "message": f"{len(created_tasks)} tasks created successfully",
        "tasks": format_tasks_output(created_tasks)
    }), 201


@tasks_bp.route("/<uuid:task_id>", methods=["GET"])
@auth_required
def get_task(task_id):
    """Retrieves a single task by ID."""
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404

    is_privileged = g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN)
    is_involved = (
        task.created_by == g.current_user.id
        or task.assigned_user_id == g.current_user.id
        or task.owner_user_id == g.current_user.id
    )
    is_in_team = task.assigned_team_id and is_team_member(g.current_user.id, task.assigned_team_id)

    if not is_privileged and not is_involved and not is_in_team:
        return jsonify({"message": "Forbidden: You do not have access to this task"}), 403

    return jsonify({"task": format_task_output(task)}), 200


@tasks_bp.route("/<uuid:task_id>", methods=["PUT"])
@auth_required
def update_task(task_id):
    """
    Updates a task:
    - Normal field updates: title, description, priority, status
    - Ownership claim: Any team member can claim an unowned team task
    - Assignment/Reassignment: Team Leaders can reassign tasks within their team
    """
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404

    is_privileged = g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN)
    is_creator = task.created_by == g.current_user.id
    is_owner = task.owner_user_id == g.current_user.id
    is_assigned = task.assigned_user_id == g.current_user.id
    is_member = task.assigned_team_id and is_team_member(g.current_user.id, task.assigned_team_id)
    is_leader = task.assigned_team_id and is_team_leader(g.current_user.id, task.assigned_team_id)

    # Basic authorization check
    if not is_privileged and not is_creator and not is_owner and not is_assigned and not is_member:
        return jsonify({"message": "Forbidden: You do not have permission to modify this task"}), 403

    data = request.get_json() or {}

    can_edit_details = bool(is_privileged or is_creator or is_owner or is_assigned or is_leader)
    if not can_edit_details and any(f in data for f in ("title", "description", "priority", "due_date")):
        return jsonify({"message": "Only the task creator, owner, assignee or a team leader can edit task details"}), 403

    # Handle Ownership Claim
    if data.get("claim") is True:
        if not task.assigned_team_id:
            return jsonify({"message": "Only team tasks can be claimed by team members"}), 400
        if not is_member and not is_privileged:
            return jsonify({"message": "Forbidden: Only members of this team can claim this task"}), 403
        if task.owner_user_id and task.owner_user_id != g.current_user.id and not is_leader and not is_privileged:
            return jsonify({"message": "Task is already owned by another team member"}), 409

        task.owner_user_id = g.current_user.id
        if task.status == "PENDING":
            task.status = "IN_PROGRESS"

    # Handle Team Leader Reassignment
    if "owner_user_id" in data and not data.get("claim"):
        new_owner_id = data["owner_user_id"]
        if new_owner_id:
            try:
                target_owner = uuid.UUID(str(new_owner_id))
            except ValueError:
                return jsonify({"message": "Invalid owner_user_id format"}), 400

            if not is_leader and not is_privileged:
                # Regular members may only assign THEMSELVES...
                if target_owner != g.current_user.id:
                    return jsonify({"message": "Forbidden: Only team leaders can assign tasks to other members"}), 403
                # ...and only if nobody else already owns it (same rule as "claim")
                if task.owner_user_id and task.owner_user_id != g.current_user.id:
                    return jsonify({"message": "Task is already owned by another team member"}), 409

            if task.assigned_team_id:
                if not is_team_member(target_owner, task.assigned_team_id):
                    return jsonify({"message": "Target owner must be a member of the assigned team"}), 400

            old_owner = task.owner_user_id
            task.owner_user_id = target_owner

            if target_owner and target_owner != old_owner and target_owner != g.current_user.id:
                from app.notifications import create_notification
                updater_name = g.current_user.display_name or g.current_user.email or "A teammate"
                create_notification(
                    user_id=target_owner,
                    event_type="TASK_ASSIGNED",
                    title=f"Task Assigned: {task.title}",
                    message=f"{updater_name} assigned you to task: '{task.title}' (Priority: {task.priority})",
                    related_task_id=task.id,
                    send_email=True
                )
        else:
            # Unassigning owner
            if not is_leader and not is_privileged and not is_owner:
                return jsonify({"message": "Forbidden: Insufficient permissions to remove ownership"}), 403
            task.owner_user_id = None

    # Handle Normal Updates
    if "title" in data:
        new_title = (data["title"] or "").strip()
        if not new_title:
            return jsonify({"message": "Task title cannot be empty"}), 400
        if len(new_title) > 255:
            return jsonify({"message": "Task title exceeds 255 characters"}), 400
        task.title = new_title

    if "description" in data:
        task.description = (data["description"] or "").strip() or None

    if "priority" in data:
        new_priority = (data["priority"] or "").upper()
        if new_priority not in VALID_PRIORITIES:
            return jsonify({"message": f"Invalid priority. Must be one of: {', '.join(VALID_PRIORITIES)}"}), 400
        task.priority = new_priority

    if "due_date" in data:
        due, due_err = parse_due_date(data["due_date"])
        if due_err:
            return jsonify({"message": due_err}), 400
        task.due_date = due

    if "status" in data:
        new_status = (data["status"] or "").upper()
        if new_status not in VALID_STATUSES:
            return jsonify({"message": f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"}), 400
        task.status = new_status

    db.session.commit()

    return jsonify({
        "message": "Task updated successfully",
        "task": format_task_output(task)
    }), 200


@tasks_bp.route("/<uuid:task_id>", methods=["DELETE"])
@auth_required
def delete_task(task_id):
    """
    Deletes a task.
    Allowed for task creator, team leader (for team tasks), or system admin/architect.
    """
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404

    is_privileged = g.current_user.system_role in (SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN)
    is_creator = task.created_by == g.current_user.id
    is_leader = task.assigned_team_id and is_team_leader(g.current_user.id, task.assigned_team_id)

    if not is_privileged and not is_creator and not is_leader:
        return jsonify({"message": "Forbidden: Only the task creator or team leader can delete this task"}), 403

    db.session.delete(task)
    db.session.commit()

    return jsonify({"message": "Task deleted successfully"}), 200
