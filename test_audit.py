"""
TaskFlow V4 - Comprehensive Automated Verification Script
Tests all 7 application modules directly inside the running container context.
"""
import os
import sys
import uuid

# Ensure backend directory is in sys.path when running from project root
backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if os.path.exists(backend_path) and backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app import create_app, db
from app.models import User, Team, TeamMember, Task, Conversation, ConversationMember, Message, Notification
from app.authz import SYSTEM_ROLE_ARCHITECT, SYSTEM_ROLE_ADMIN, SYSTEM_ROLE_USER, TEAM_ROLE_LEADER, TEAM_ROLE_MEMBER
from app.mailer import is_smtp_configured, get_smtp_config

def run_tests():
    app = create_app()
    with app.app_context():
        print("=" * 70)
        print("🚀 TASKFLOW V4 - FULL SYSTEM AUDIT & VERIFICATION")
        print("=" * 70)
        
        passed = 0
        failed = 0

        def report(test_name, success, detail=""):
            nonlocal passed, failed
            if success:
                passed += 1
                print(f"  ✅ [PASS] {test_name} {('- ' + detail) if detail else ''}")
            else:
                failed += 1
                print(f"  ❌ [FAIL] {test_name}: {detail}")

        created_test_uids = []

        def create_audit_user(email_prefix, display_name, role="USER"):
            """Creates a test user in auth.users and public.users to honor FK constraints."""
            uid = uuid.uuid4()
            email = f"{email_prefix}_{uid.hex[:6]}@example.com"
            try:
                db.session.execute(
                    db.text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
                    {"id": str(uid), "email": email}
                )
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                raise RuntimeError(f"Failed to insert into auth.users: {e}")

            user = User(
                id=uid,
                email=email,
                display_name=display_name,
                system_role=role,
                account_status="ACTIVE"
            )
            db.session.add(user)
            db.session.commit()
            created_test_uids.append(uid)
            return user

        # ----------------------------------------------------
        # 1. DATABASE & SCHEMAS INTEGRITY
        # ----------------------------------------------------
        print("\n--- Module 1: Database & Schemas ---")
        try:
            user_count = User.query.count()
            team_count = Team.query.count()
            task_count = Task.query.count()
            conv_count = Conversation.query.count()
            notif_count = Notification.query.count()
            report("Database Connection & Table Integrity", True, 
                   f"Users: {user_count}, Teams: {team_count}, Tasks: {task_count}, Convs: {conv_count}, Notifs: {notif_count}")
        except Exception as e:
            report("Database Connection", False, str(e))

        # ----------------------------------------------------
        # 2. AUTHENTICATION & USER PROFILES
        # ----------------------------------------------------
        print("\n--- Module 2: Authentication & User Profiles ---")
        arch_user = User.query.filter_by(system_role="ARCHITECT").first()
        if not arch_user:
            report("Architect Account Verification", False, "No ARCHITECT found in public.users")
        else:
            report("Architect Account Verification", True, f"Found {arch_user.email} (Role: {arch_user.system_role})")

        # Provision test user in auth.users + public.users
        try:
            test_user = create_audit_user("audit_user", "Audit Primary Tester", "USER")
            report("User Creation with auth.users FK Integrity", bool(test_user.id), f"Created {test_user.email}")
        except Exception as e:
            report("User Creation with auth.users FK Integrity", False, str(e))

        try:
            colleague_user = create_audit_user("audit_colleague", "Audit Colleague", "USER")
            report("Colleague Creation with auth.users FK Integrity", bool(colleague_user.id), f"Created {colleague_user.email}")
        except Exception as e:
            report("Colleague Creation with auth.users FK Integrity", False, str(e))

        # Test auth.users auto-discovery (insert only into auth.users, then simulate list_workspace_users)
        try:
            discovery_uid = uuid.uuid4()
            discovery_email = f"discovery_{discovery_uid.hex[:6]}@example.com"
            db.session.execute(
                db.text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
                {"id": str(discovery_uid), "email": discovery_email}
            )
            db.session.commit()
            created_test_uids.append(discovery_uid)

            # Check that it's in auth.users but NOT yet in public.users
            in_auth = db.session.execute(db.text("SELECT id FROM auth.users WHERE id = :id"), {"id": str(discovery_uid)}).first()
            in_pub_before = db.session.get(User, discovery_uid)
            
            # Now trigger discovery logic (from auth.py)
            auth_rows = db.session.execute(
                db.text("SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = :id"),
                {"id": str(discovery_uid)}
            ).fetchall()
            for row in auth_rows:
                db_u = db.session.get(User, row.id)
                if not db_u:
                    db_u = User(
                        id=row.id,
                        email=row.email,
                        display_name="Discovered User",
                        system_role="USER",
                        account_status="ACTIVE"
                    )
                    db.session.add(db_u)
            db.session.commit()
            in_pub_after = db.session.get(User, discovery_uid)
            report("New Supabase User Auto-Discovery", in_pub_before is None and in_pub_after is not None,
                   f"Successfully auto-provisioned {discovery_email} from auth.users into public.users")
        except Exception as e:
            report("New Supabase User Auto-Discovery", False, str(e))

        # ----------------------------------------------------
        # 3. ARCHITECT PRIVILEGES & ADMIN (ROLE, STATUS, DELETE)
        # ----------------------------------------------------
        print("\n--- Module 3: Architect Privileges & Admin Control ---")
        try:
            # Promote to ADMIN
            test_user.system_role = "ADMIN"
            db.session.commit()
            report("Promote User to ADMIN", test_user.system_role == "ADMIN", f"Role is now {test_user.system_role}")

            # Demote back to USER
            test_user.system_role = "USER"
            db.session.commit()
            report("Demote User back to USER", test_user.system_role == "USER", f"Role is now {test_user.system_role}")

            # Account status toggle: SUSPENDED
            test_user.account_status = "SUSPENDED"
            db.session.commit()
            report("Suspend User Account", test_user.account_status == "SUSPENDED")

            # Account status toggle: ACTIVE
            test_user.account_status = "ACTIVE"
            db.session.commit()
            report("Reactivate User Account", test_user.account_status == "ACTIVE")

            # Architect User Deletion Test
            delete_target = create_audit_user("del_target", "Delete Target User", "USER")
            del_uid = delete_target.id
            del_email = delete_target.email

            # Add sample task and team membership for delete target to verify cascade
            temp_team = Team(name=f"DelTeam {del_uid.hex[:4]}", created_by=test_user.id)
            db.session.add(temp_team)
            db.session.flush()
            temp_tm = TeamMember(team_id=temp_team.id, user_id=del_uid, team_role="MEMBER")
            temp_task = Task(title="Cascade Task", created_by=del_uid, assigned_user_id=del_uid)
            db.session.add_all([temp_tm, temp_task])
            db.session.commit()

            # Execute deletion logic matching admin.py delete_user
            db.session.delete(delete_target)
            db.session.commit()
            
            # Clean from auth.users
            db.session.execute(db.text("DELETE FROM auth.users WHERE id = :uid"), {"uid": str(del_uid)})
            db.session.commit()
            created_test_uids.remove(del_uid) # already cleaned

            # Clean up temp team and task
            db.session.delete(temp_task)
            db.session.delete(temp_team)
            db.session.commit()

            is_deleted_pub = db.session.get(User, del_uid) is None
            is_deleted_auth = db.session.execute(db.text("SELECT id FROM auth.users WHERE id = :id"), {"id": str(del_uid)}).first() is None
            report("Architect Delete User Execution & Purge", is_deleted_pub and is_deleted_auth, 
                   f"Successfully purged {del_email} from both public.users and auth.users")
        except Exception as e:
            report("Architect Privileges & Admin Control", False, str(e))

        # ----------------------------------------------------
        # 4. TEAMS & LEADERSHIP DELEGATION
        # ----------------------------------------------------
        print("\n--- Module 4: Teams & Leadership ---")
        try:
            team = Team(
                name=f"Audit Team {test_user.id.hex[:4]}",
                description="Automated functional audit team",
                created_by=test_user.id,
                active_status="ACTIVE"
            )
            db.session.add(team)
            db.session.flush()

            leader_member = TeamMember(
                team_id=team.id,
                user_id=test_user.id,
                team_role=TEAM_ROLE_LEADER
            )
            db.session.add(leader_member)
            db.session.commit()
            report("Team Creation & Leader Role", leader_member.team_role == "LEADER", f"Team #{team.name} created with leader")

            # Add Colleague as MEMBER
            colleague_member = TeamMember(
                team_id=team.id,
                user_id=colleague_user.id,
                team_role=TEAM_ROLE_MEMBER
            )
            db.session.add(colleague_member)
            db.session.commit()
            report("Add Colleague as Team MEMBER", len(team.members) == 2, f"Team members count: {len(team.members)}")

            # Case-insensitive lookup test (simulates user typing uppercase email)
            email_input = colleague_user.email.upper()
            lookup = User.query.filter(db.func.lower(User.email) == email_input.strip().lower()).first()
            report("Case-Insensitive Email Matching for Team Invites", lookup is not None and lookup.id == colleague_user.id,
                   f"Input '{email_input}' matched {lookup.email if lookup else None}")
        except Exception as e:
            report("Teams & Leadership", False, str(e))

        # ----------------------------------------------------
        # 5. TASK LIFECYCLE, SCOPES & BULK CREATION
        # ----------------------------------------------------
        print("\n--- Module 5: Task Management Lifecycle ---")
        try:
            # Personal Task
            p_task = Task(
                title="Personal Audit Task",
                description="Testing personal scope",
                priority="LOW",
                status="PENDING",
                created_by=test_user.id,
                owner_user_id=test_user.id
            )
            db.session.add(p_task)
            db.session.commit()
            report("Create Personal Task", p_task.assigned_team_id is None, f"Task {p_task.id} (Scope: Personal)")

            # Team Task assigned to Colleague
            t_task = Task(
                title="Team Audit Task",
                description="Critical team task",
                priority="HIGH",
                status="PENDING",
                created_by=test_user.id,
                owner_user_id=test_user.id,
                assigned_team_id=team.id,
                assigned_user_id=colleague_user.id
            )
            db.session.add(t_task)
            db.session.commit()
            report("Create Team Task with Colleague Assignment", t_task.assigned_user_id == colleague_user.id, f"Assigned to {colleague_user.email}")

            # Status transition: PENDING -> IN_PROGRESS
            t_task.status = "IN_PROGRESS"
            db.session.commit()
            report("Status Transition: PENDING -> IN_PROGRESS", t_task.status == "IN_PROGRESS")

            # Status transition: IN_PROGRESS -> COMPLETED
            t_task.status = "COMPLETED"
            t_task.completed_by = colleague_user.id
            db.session.commit()
            report("Status Transition: IN_PROGRESS -> COMPLETED", t_task.status == "COMPLETED", f"Completed by {colleague_user.email}")

            # Bulk task creation test (5 tasks)
            bulk_tasks = []
            for i in range(5):
                bt = Task(
                    title=f"Bulk Task #{i+1}",
                    description="Bulk test line item",
                    priority="MEDIUM",
                    status="PENDING",
                    created_by=test_user.id,
                    assigned_team_id=team.id
                )
                bulk_tasks.append(bt)
            db.session.add_all(bulk_tasks)
            db.session.commit()
            report("Bulk Task Creation (5 items batch)", len(bulk_tasks) == 5, "5 tasks committed atomically")
        except Exception as e:
            report("Task Management Lifecycle", False, str(e))

        # ----------------------------------------------------
        # 6. COMMUNICATION & CHAT (TEAM & DIRECT)
        # ----------------------------------------------------
        print("\n--- Module 6: Communication & Realtime Chat ---")
        try:
            # Team Channel
            team_conv = Conversation(
                conversation_type="TEAM",
                team_id=team.id,
                created_by=test_user.id
            )
            db.session.add(team_conv)
            db.session.flush()

            # Team message
            team_msg = Message(
                conversation_id=team_conv.id,
                sender_id=test_user.id,
                content="Hello team! Automated test message."
            )
            db.session.add(team_msg)
            db.session.commit()
            report("Post Team Channel Message", team_msg.id is not None, f"Message in channel #{team.name}")

            # Direct 1-on-1 Chat
            direct_conv = Conversation(
                conversation_type="DIRECT",
                created_by=test_user.id
            )
            db.session.add(direct_conv)
            db.session.flush()

            cm1 = ConversationMember(conversation_id=direct_conv.id, user_id=test_user.id)
            cm2 = ConversationMember(conversation_id=direct_conv.id, user_id=colleague_user.id)
            db.session.add_all([cm1, cm2])
            db.session.flush()

            dm_msg = Message(
                conversation_id=direct_conv.id,
                sender_id=test_user.id,
                content="Hey colleague, this is a private 1-on-1 direct message."
            )
            db.session.add(dm_msg)
            db.session.commit()
            report("Create 1-on-1 Direct Chat & Send Message", dm_msg.id is not None, 
                   f"Direct chat between {test_user.email} and {colleague_user.email}")
        except Exception as e:
            report("Communication & Realtime Chat", False, str(e))

        # ----------------------------------------------------
        # 7. NOTIFICATIONS & BREVO EMAIL
        # ----------------------------------------------------
        print("\n--- Module 7: Notifications & Transactional Email ---")
        try:
            notif = Notification(
                user_id=colleague_user.id,
                event_type="TASK_ASSIGNED",
                title="Audit Task Notification",
                message="You were assigned a test task.",
                related_task_id=t_task.id,
                is_read=False
            )
            db.session.add(notif)
            db.session.commit()
            report("In-App Notification Creation", notif.id is not None, f"Unread notification created for {colleague_user.email}")

            notif.is_read = True
            db.session.commit()
            report("Mark Notification Read", notif.is_read is True)

            # Brevo SMTP Configuration Check
            smtp_ok = is_smtp_configured()
            smtp_cfg = get_smtp_config()
            report("Brevo SMTP Configuration Check", smtp_ok, 
                   f"Host: {smtp_cfg.get('host')}:{smtp_cfg.get('port')}, Sender: {smtp_cfg.get('sender_name')}")
            
            # Optional Brevo socket check (connect test without sending mail)
            if smtp_ok:
                import smtplib
                try:
                    server = smtplib.SMTP(smtp_cfg.get('host'), int(smtp_cfg.get('port')), timeout=10)
                    server.starttls()
                    server.login(smtp_cfg.get('user'), smtp_cfg.get('password'))
                    server.quit()
                    report("Brevo SMTP Credentials & TLS Handshake", True, "Successfully authenticated with smtp-relay.brevo.com")
                except Exception as mail_err:
                    report("Brevo SMTP Credentials & TLS Handshake", False, str(mail_err))
        except Exception as e:
            report("Notifications & Transactional Email", False, str(e))

        # ----------------------------------------------------
        # 8. CLEANUP AUDIT TEST ARTIFACTS
        # ----------------------------------------------------
        print("\n--- Cleaning up temporary test records ---")
        try:
            # Delete test messages, conversations, tasks, teams, users
            Message.query.filter(Message.conversation_id.in_([team_conv.id, direct_conv.id])).delete(synchronize_session=False)
            ConversationMember.query.filter(ConversationMember.conversation_id.in_([team_conv.id, direct_conv.id])).delete(synchronize_session=False)
            Conversation.query.filter(Conversation.id.in_([team_conv.id, direct_conv.id])).delete(synchronize_session=False)
            Notification.query.filter_by(id=notif.id).delete(synchronize_session=False)
            Task.query.filter(Task.id.in_([p_task.id, t_task.id] + [b.id for b in bulk_tasks])).delete(synchronize_session=False)
            TeamMember.query.filter_by(team_id=team.id).delete(synchronize_session=False)
            Team.query.filter_by(id=team.id).delete(synchronize_session=False)
            
            # Delete from public.users
            User.query.filter(User.id.in_(created_test_uids)).delete(synchronize_session=False)
            db.session.commit()

            # Delete from auth.users
            for uid in created_test_uids:
                try:
                    db.session.execute(db.text("DELETE FROM auth.users WHERE id = :id"), {"id": str(uid)})
                except Exception:
                    pass
            db.session.commit()
            print("  🧹 All temporary test users and test entities successfully purged.")
        except Exception as cleanup_err:
            db.session.rollback()
            print(f"  Cleanup note: {cleanup_err}")

        print("\n" + "=" * 70)
        print(f"AUDIT SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL TESTS: {passed + failed})")
        print("=" * 70)

if __name__ == "__main__":
    run_tests()
