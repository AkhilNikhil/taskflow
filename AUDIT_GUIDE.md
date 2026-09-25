# 🧪 TaskFlow Automated System Audit Guide

This guide explains how to run the comprehensive automated audit script (`test_audit.py`), why it is essential for the TaskFlow application, and how to interpret the results.

---

## 🎯 1. Why Do We Need This Audit?

When developing a multi-tenant full-stack application with Role-Based Access Control (RBAC), database relationships, realtime chat, and transactional emails, manual testing becomes slow, error-prone, and incomplete.

### The Problem with Manual Testing:
- Manually verifying 15+ features (creating users, assigning teams, testing leadership permissions, sending chat messages, checking email delivery, testing deletion cascade) takes 15–20 minutes every time code changes.
- Edge cases (like PostgreSQL check constraints, foreign key cascades, case-insensitive email searches, and architect privilege elevation) are easily missed.

### What This Audit Provides:
- **Instant Confidence:** Runs **26 automated checks** across all 7 core modules in under **10 seconds**.
- **Database & Constraint Integrity:** Validates foreign key relationships (`auth.users` ↔ `public.users`) and constraints (`chk_user_account_status`).
- **Zero Pollution:** Automatically creates and purges isolated test records (`audit_user_*`, test teams, test channels), leaving your real database 100% clean.
- **CI/CD Ready:** Can be executed in Docker, locally, or as an automated gatekeeper in GitHub Actions before deploying to Docker Hub or Render.

---

## 🔍 2. What the Audit Tests (The 7 Core Modules)

| Module | What is Tested |
| :--- | :--- |
| **1. Database & Schemas** | PostgreSQL connectivity, table record counts, and schema availability. |
| **2. Authentication & Profiles** | Architect account verification (`akhilbm13@gmail.com`), persistent user presence, and **automatic discovery** of newly registered Supabase auth users into the public profile table. |
| **3. Architect Privileges** | System role promotion (`USER` → `ADMIN`), demotion (`ADMIN` → `USER`), account status toggle (`ACTIVE` ↔ `SUSPENDED`), and permanent user deletion with authentication cleanup. |
| **4. Teams & Leadership** | Team creation, designating creator as `LEADER`, member invitations, and **case-insensitive colleague email matching** (`func.lower()`). |
| **5. Task Lifecycle** | Personal task creation, team task assignment, status transitions (`PENDING` → `IN_PROGRESS` → `COMPLETED`), completed-by attribution, and atomic bulk task creation (5 tasks at once). |
| **6. Realtime Communication** | Team channel message broadcasting and private 1-on-1 direct message conversation creation. |
| **7. Notifications & SMTP** | In-app notification creation, read status toggle, Brevo SMTP configuration, and live TLS handshake/authentication with `smtp-relay.brevo.com`. |

---

## 🚀 3. How to Run the Audit

### Method A: Inside the Local Docker Container (Recommended)

When your Docker containers are running locally via Docker Desktop or `docker compose`:

```bash
# 1. Ensure containers are up
docker compose up -d

# 2. Execute the audit inside the running backend container
docker exec -it todo-backend python test_audit.py
```

If you made recent modifications to `test_audit.py` and want to run the latest version:
```bash
docker cp test_audit.py todo-backend:/app/test_audit.py
docker exec -it todo-backend python test_audit.py
```

---

### Method B: Directly on Your Host Machine (Python Virtual Environment)

If running outside Docker on your host machine:

```bash
# 1. Navigate to backend directory and activate your virtual environment
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Ensure your .env file is present with DATABASE_URL
# 4. Run the audit script from the root directory:
cd ..
python test_audit.py
```

---

### Method C: Automated in GitHub Actions (CI/CD Pipeline)

You can run this test in GitHub Actions before every Docker Hub push. Whenever code is pushed to branch `v4`:
1. GitHub spins up a runner.
2. Builds and starts the container with `docker compose up -d`.
3. Runs `docker exec todo-backend python test_audit.py`.
4. If all 26 tests pass ✅, it automatically publishes images to Docker Hub (`akhilbm/todo-backend:v4.7`).
5. If any test fails ❌, it halts the pipeline, alerting you before broken images reach production.

---

## 📊 4. Understanding Audit Results

### Example Success Output:
```text
======================================================================
🚀 TASKFLOW V4 - FULL SYSTEM AUDIT & VERIFICATION
======================================================================

--- Module 1: Database & Schemas ---
  ✅ [PASS] Database Connection & Table Integrity

--- Module 2: Authentication & User Profiles ---
  ✅ [PASS] Architect Account Verification
  ✅ [PASS] Persistent User akhilbm1810@gmail.com
  ✅ [PASS] New Supabase User Auto-Discovery

--- Module 3: Architect Privileges & Admin Control ---
  ✅ [PASS] Promote User to ADMIN
  ✅ [PASS] Suspend User Account
  ✅ [PASS] Architect Delete User Execution & Purge

--- Module 4: Teams & Leadership ---
  ✅ [PASS] Team Creation & Leader Role
  ✅ [PASS] Case-Insensitive Email Matching for Team Invites

--- Module 5: Task Management Lifecycle ---
  ✅ [PASS] Status Transition: IN_PROGRESS -> COMPLETED
  ✅ [PASS] Bulk Task Creation (5 items batch)

--- Module 6: Communication & Realtime Chat ---
  ✅ [PASS] Post Team Channel Message
  ✅ [PASS] Create 1-on-1 Direct Chat & Send Message

--- Module 7: Notifications & Transactional Email ---
  ✅ [PASS] In-App Notification Creation
  ✅ [PASS] Brevo SMTP Credentials & TLS Handshake

--- Cleaning up temporary test records ---
  🧹 All temporary test users and test entities successfully purged.

======================================================================
AUDIT SUMMARY: 26 PASSED, 0 FAILED (TOTAL TESTS: 26)
======================================================================
```

### What to Do if a Test Fails:
- **Module 1 Failure:** Check your `DATABASE_URL` in `.env` and verify Supabase PostgreSQL is reachable.
- **Module 3 Failure:** Verify that `chk_user_account_status` in Supabase includes `'ACTIVE'`, `'SUSPENDED'`, and `'DISABLED'`.
- **Module 7 Failure:** Check Brevo SMTP credentials (`BREVO_SMTP_USER`, `BREVO_SMTP_KEY`) in `.env`.
