# V4 Architecture Specification

This document defines the architectural specification, design decisions, data models, security parameters, and implementation roadmap for **TaskFlow** (`taskflow-app`).

---

## 1. Authentication

* **Provider:** Supabase Auth handles all user authentication, token issuance, and password management.
* **Email Verification:** Email verification is required before an account becomes fully active.
* **Identity Mapping:** `public.users.id` maps directly to `auth.users.id` (1:1 relationship).
* **Password Storage:** No passwords or password hashes are stored in the application database (`public.users`). Authentication verification is delegated entirely to Supabase Auth.

---

## 2. System Roles

The application defines three hierarchical system roles:

| System Role | Description & Authority |
|---|---|
| `ARCHITECT` | Highest-level authority. Initially, there is exactly one Architect. Can promote an existing User to Admin, invite/create an Admin, and review Admin authority changes. |
| `ADMIN` | Administrative authority for system oversight and team-level sensitive request approvals. Cannot create or remove an Architect, and cannot promote or demote Admins. |
| `USER` | Standard system user. Normal registration always creates a `USER`. |

### Role Rules
* Normal user registration always defaults to the `USER` role.
* Initially, there is one Architect.
* The Architect can promote an existing User to Admin.
* The Architect can invite or create an Admin.
* Admins cannot create or remove an Architect.
* Admins cannot promote or demote other Admins.

---

## 3. Team Roles

Team-level roles govern collaboration within teams and operate independently of system roles:

| Team Role | Description |
|---|---|
| `LEADER` | Can manage team tasks, assign or reassign task ownership among team members, and oversee team communications. |
| `MEMBER` | Standard team collaborator. Can claim available team tasks, participate in team conversations, and complete assigned work. |

### Team Role Rules
* Team roles are strictly separated from system roles.
* Users can belong to multiple teams simultaneously.
* A team can have multiple Leaders.
* A user can be a `LEADER` in one team and a `MEMBER` in another team.

---

## 4. Core Data Model

The V4 schema consists of ten primary entities. *(No raw SQL is defined here; tables are defined by purpose and responsibilities).*

### 1. `users`
* **Purpose:** Stores application-level user profiles and system role assignments.
* **Key Details:** Primary key `id` maps directly to `auth.users.id`. Stores email, display details, system role (`ARCHITECT`, `ADMIN`, `USER`), status, and timestamps. No passwords or password hashes are stored.

### 2. `teams`
* **Purpose:** Represents organizational units or working groups.
* **Key Details:** Stores team metadata (name, description, active status, creation timestamp, creator reference).

### 3. `team_members`
* **Purpose:** Junction table mapping users to teams with associated team roles.
* **Key Details:** Associates a user with a team, stores the team-specific role (`LEADER` or `MEMBER`), and records joined timestamp.

### 4. `tasks`
* **Purpose:** Represents tasks with extended assignment and ownership models.
* **Key Details:** Supports personal tasks, individual assignments, and team assignments. Tracks title, description, priority (`LOW`, `MEDIUM`, `HIGH`), status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), creator, assigned team, current owner/assignee, and audit timestamps.

### 5. `notifications`
* **Purpose:** Stores persistent system notifications for individual users.
* **Key Details:** Tracks recipient user, event type (e.g., assignment, ownership claim, team membership, approvals, messages, role changes), payload/reference link, read/unread status, and creation timestamp.

### 6. `conversations`
* **Purpose:** Represents chat channels and threads.
* **Key Details:** Supports both direct (one-to-one) and team conversations. Stores conversation type, optional team reference, creation timestamp, and metadata.

### 7. `conversation_members`
* **Purpose:** Junction table connecting participants to conversations.
* **Key Details:** Associates users with conversations they participate in, tracking join time and read receipts.

### 8. `messages`
* **Purpose:** Stores individual messages within conversations.
* **Key Details:** References conversation, sender user, message body/content, sent timestamp, and edit/deletion state.

### 9. `approval_requests`
* **Purpose:** Manages workflow approval gates for sensitive operations.
* **Key Details:** Records requester, target action/resource, target role or team, designated reviewer role/user, current status (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), reviewer notes, and decision timestamp.

### 10. `audit_logs`
* **Purpose:** Immutable audit trail for administrative, security, and governance events.
* **Key Details:** Records actor ID, action type, entity type, entity ID, previous/new state details, timestamp, and client metadata.

---

## 5. Tasks

* **Task Scope & Assignment Types:**
  * **Personal Tasks:** Created and managed by individual users for their own workflow.
  * **Individual Assignment:** Assigned directly to a specific user.
  * **Team Assignment:** Assigned to a team as a pool task.
* **Ownership Workflow:**
  * Team assignment remains associated with the team even when an individual member takes ownership.
  * Any eligible team member can take ownership of an available team task.
  * Team Leaders can assign or reassign task ownership among team members.
* **Task Priorities:**
  * `LOW`
  * `MEDIUM`
  * `HIGH`
* **Task Statuses:**
  * `PENDING`
  * `IN_PROGRESS`
  * `COMPLETED`
  * `CANCELLED`
* **Bulk Creation Limits:**
  * Bulk creation is strictly capped at a maximum of **10 tasks per API request**.
  * The backend must explicitly validate and enforce this limit.

---

## 6. Notifications

* **Persistence:** Notifications are stored in the database with explicit unread/read state tracking. The database remains the permanent source of truth.
* **Covered Events:**
  * Task assignment, reassignment, and ownership claims.
  * Team membership additions, removals, and role updates.
  * Incoming direct and team messages.
  * Approval submissions, approvals, rejections, and cancellations.
  * System role changes.
* **Realtime Delivery:** Realtime transport (such as WebSockets or Supabase Realtime) may be used for immediate client dispatch, but does not replace database persistence.

---

## 7. Messaging

* **Conversation Types:**
  * **Direct Conversations:** One-to-one private exchanges between two users.
  * **Team Conversations:** Shared team communication channels for team members.
* **Architect Access:**
  * The Architect can send and participate in messages normally.
  * The Architect possesses elevated access to inspect private User-to-User conversations for system governance and dispute resolution.
  * Any access to private conversations by the Architect **must be recorded in the audit log**.
* **Admin Access:**
  * Admins **cannot** access private User-to-User conversations.
* **Team Access:**
  * Team Leaders and Members have communication access restricted strictly to their designated team channels and authorized direct messages.
* **Server-Side Enforcement:**
  * All access controls—especially elevated private-message access—must be enforced at the server/database layer, never solely in the frontend.

---

## 8. Approvals

* **Approval States:**
  * `PENDING`
  * `APPROVED`
  * `REJECTED`
  * `CANCELLED`
* **Routing Hierarchy:**
  * **Team-Level Sensitive Requests:** Routed to an `ADMIN` for review.
  * **Admin Authority Changes:** (e.g. promoting a user to Admin, modifying Admin authority) Routed to the `ARCHITECT`.
* **Governance Constraints:**
  * **No Self-Approval:** A user can never approve their own request.
  * Normal daily actions do not trigger approvals unless explicitly classified as sensitive.

---

## 9. Audit Logging

A centralized audit log captures security, administrative, and sensitive data access events, including:

1. User lifecycle: creation, disabling, activation, and deletion.
2. System role promotions and demotions.
3. Team membership additions, removals, and team role adjustments.
4. Task assignments, reassignments, and ownership claims.
5. Approval workflow actions (requests submitted, approved, rejected, cancelled).
6. Architect access to private user-to-user conversations.

---

## 10. Security

* **Authentication:** Supabase Auth verifies identities and manages JSON Web Tokens (JWT).
* **Application Authorization:** The Flask backend verifies claims, roles, team memberships, and business logic before processing requests.
* **Database-Level Protection:** PostgreSQL Row Level Security (RLS) is applied to all tables to enforce tenant isolation and access constraints directly in the database engine.
* **Secrets Management:**
  * Supabase secret/service credentials (e.g. `SUPABASE_SERVICE_ROLE_KEY`) must remain backend-only.
  * Secrets must never be bundled into or exposed by the frontend client.

---

## 11. V3 Technical Debt to Address During V4

The following technical debt items identified in V3 are planned to be resolved during V4 implementation:

1. **Monolithic Frontend:** Decompose the 1,523-line monolithic `App.jsx` into modular components, dedicated view routes, and separated state stores.
2. **Database Migration Tooling:** Introduce structured database migration tooling (e.g. Alembic / Flask-Migrate) to replace unversioned manual schema management.
3. **Environment-Based API URL:** Replace the hardcoded backend URL in the frontend with environment-variable-driven configuration (`import.meta.env.VITE_API_URL` / runtime proxy).
4. **N+1 Query Optimization:** Refactor task retrieval and admin user lookups to use joined queries or batch lookups instead of looping `User.query.get()` calls.
5. **Authorization Enhancements:** Embed role and permission claims in tokens or request contexts to avoid redundant database lookups on every protected endpoint.
6. **Complete `.env.example`:** Expand the template environment file to specify all required variables, including database connection strings and Supabase keys.
7. **Task Priority Handling:** Enable users to select and update task priority on standard task creation and edit endpoints.
8. **Automated Testing:** Introduce comprehensive automated unit and integration test suites for both backend API endpoints and frontend components.
9. **Deprecated Methods:** Replace all instances of `datetime.utcnow` with timezone-aware alternatives (`datetime.now(timezone.utc)`).
10. **Docker/Compose Configuration:** Update `docker-compose.yml` to include build definitions and local multi-service testing orchestration.
11. **Deployment Configuration:** Review and align deployment scripts and container configurations across environments.

---

## 12. V4 AWS Architecture

The planned AWS architecture for V4 maintains strict network boundaries:

```text
       Internet
          │
          ▼ (HTTP Port 80)
   +──────────────+
   │    Nginx     │
   +──────┬───────+
          │
          ├───► Static Assets / React Frontend
          │
          └───► /api Reverse Proxy (Internal)
                     │
                     ▼ (Port 5000)
              +──────────────+
              │ Flask Backend│
              +──────┬───────+
                     │
                     ▼ (PostgreSQL / SSL)
              +──────────────+
              │   Supabase   │
              │  PostgreSQL  │
              +──────────────+
```

* **Ingress:** All incoming traffic enters through Nginx (Port 80).
* **Frontend:** Nginx directly serves the React SPA static build.
* **API Routing:** Requests matching `/api` are reverse-proxied internally by Nginx to the Flask backend on port `5000`.
* **Backend Isolation:** Backend port `5000` is **not publicly exposed** to the internet.
* **Database:** Supabase PostgreSQL remains the external managed database service.
* **Deferred Infrastructure:** Custom domain configuration, DNS setup, AWS Elastic IP, HTTPS termination, and Let's Encrypt SSL certificates are explicitly deferred to a later version.

---

## 13. Implementation Order

The V4 implementation will proceed in the following ordered phases:

1. Architecture and data model design
2. Database migrations and schema setup
3. Supabase Auth integration
4. Backend authorization foundation
5. Users and system roles
6. Teams and memberships
7. Tasks, ownership workflow, and bulk creation validation
8. Approvals workflow
9. Notifications service
10. Messaging service (direct and team)
11. Audit logging service
12. Frontend refactoring and component modularization
13. V3 technical-debt fixes
14. Security hardening and Row Level Security (RLS) policies
15. Automated testing (backend and frontend)
16. Docker containerization updates
17. Nginx and AWS configuration
18. Documentation updates
