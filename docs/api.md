# TaskFlow V4 – REST API Specification

> **Base URL (Local / EC2):** `http://<HOST>/api`  
> **Base URL (Render):** `https://<RENDER_BACKEND_URL>/api`  
> **Protocol:** HTTP / HTTPS  
> **Authentication:** Bearer Token (Supabase JWT)  
> **Payload Format:** `application/json`  

---

## 1. Overview & Authentication

All protected endpoints require a valid Supabase JWT access token passed in the HTTP `Authorization` header:

```http
Authorization: Bearer <SUPABASE_JWT_ACCESS_TOKEN>
```

### Common HTTP Status Codes
| Status Code | Meaning | Description |
|---|---|---|
| `200 OK` | Success | Request succeeded and data is returned in the response body. |
| `201 Created` | Created | Resource successfully created. |
| `400 Bad Request` | Validation Error | Missing required fields, invalid format, or malformed JSON. |
| `401 Unauthorized` | Auth Required | Missing, expired, or cryptographically invalid JWT token. |
| `403 Forbidden` | Access Denied | Authenticated user lacks permission (e.g., standard user accessing Admin endpoints). |
| `404 Not Found` | Resource Missing | Requested task, team, user, or conversation does not exist. |
| `500 Server Error` | Internal Failure | Unhandled server error. |

### Standard Error Response Format
```json
{
  "error": "Error description message",
  "code": "ERROR_CODE_IDENTIFIER"
}
```

---

## 2. System Health

### Check Service Health
```http
GET /api/health
```
Public endpoint used by container health checks, load balancers, and monitoring agents.

#### Response (`200 OK`)
```json
{
  "status": "healthy"
}
```

---

## 3. Authentication & User Directory

### 3.1 Synchronize User Profile
```http
POST /api/auth/sync
```
Synchronizes the authenticated Supabase user into the application's `public.users` table upon initial login or profile update.

#### Request Headers
```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

#### Response (`200 OK`)
```json
{
  "message": "User profile synchronized successfully",
  "user": {
    "id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
    "email": "user000@gmail.com",
    "system_role": "ADMIN",
    "account_status": "ACTIVE",
    "created_at": "2026-09-22T13:21:26.427966Z"
  }
}
```

---

### 3.2 Get Current User Profile
```http
GET /api/auth/me
```
Retrieves the logged-in user's profile, system authority, and active team memberships.

#### Response (`200 OK`)
```json
{
  "user": {
    "id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
    "email": "user000@gmail.com",
    "system_role": "ADMIN",
    "account_status": "ACTIVE",
    "teams": [
      {
        "team_id": "372b8168-c61f-4dbf-9f95-5d768add4bb1",
        "team_name": "DevOps Engineering",
        "team_role": "LEADER",
        "joined_at": "2026-09-22T14:10:00Z"
      }
    ]
  }
}
```

---

### 3.3 List Active Workspace Users
```http
GET /api/auth/users
```
Returns a list of active users across the workspace. Used to populate the task assignment and direct messaging user pickers.

#### Response (`200 OK`)
```json
[
  {
    "id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
    "email": "user000@gmail.com",
    "system_role": "ADMIN"
  },
  {
    "id": "63f10118-2e87-42e0-8bb3-1a2c8da7f998",
    "email": "akhilbm1810@gmail.com",
    "system_role": "USER"
  }
]
```

---

## 4. Tasks API

Tasks support dual scoping: they can belong to personal scope, a specific team, an individual assignee, or both simultaneously.

### 4.1 List Tasks
```http
GET /api/tasks
```

#### Query Parameters (Optional)
* `scope`: Filter by `personal`, `team`, or `all` (Admin/Architect only).
* `team_id`: Filter tasks belonging to a specific team UUID.
* `status`: Filter by `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
* `priority`: Filter by `LOW`, `MEDIUM`, `HIGH`.
* `search`: Text query searching task titles and descriptions.

#### Response (`200 OK`)
```json
[
  {
    "id": "3fda10c9-e7e3-4b52-89e3-f3da0c16651c",
    "title": "Configure AWS Security Group",
    "description": "Expose port 80 and port 22 only. Keep port 5000 private.",
    "priority": "HIGH",
    "status": "IN_PROGRESS",
    "creator_id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
    "creator_email": "user000@gmail.com",
    "assigned_team_id": "372b8168-c61f-4dbf-9f95-5d768add4bb1",
    "assigned_team_name": "DevOps Engineering",
    "assigned_user_id": "63f10118-2e87-42e0-8bb3-1a2c8da7f998",
    "assigned_user_email": "akhilbm1810@gmail.com",
    "due_date": "2026-09-30T18:00:00Z",
    "created_at": "2026-09-22T18:50:00Z",
    "updated_at": "2026-09-22T18:55:00Z"
  }
]
```

---

### 4.2 Create Task
```http
POST /api/tasks
```
Creates a task. If assigned to an individual user, triggers an asynchronous Brevo notification email to that user. If assigned to a team without an assignee, triggers an email to the **Team Leader**.

#### Request Body
```json
{
  "title": "Configure AWS Security Group",
  "description": "Expose port 80 and port 22 only. Keep port 5000 private.",
  "priority": "HIGH",
  "due_date": "2026-09-30T18:00:00Z",
  "team_id": "372b8168-c61f-4dbf-9f95-5d768add4bb1",
  "assigned_user_id": "63f10118-2e87-42e0-8bb3-1a2c8da7f998"
}
```

#### Response (`201 Created`)
```json
{
  "message": "Task created successfully",
  "task": {
    "id": "3fda10c9-e7e3-4b52-89e3-f3da0c16651c",
    "title": "Configure AWS Security Group",
    "priority": "HIGH",
    "status": "PENDING"
  }
}
```

---

### 4.3 Update Task
```http
PUT /api/tasks/<task_id>
```
Updates task attributes or status.

#### Request Body (All fields optional)
```json
{
  "title": "Updated Task Title",
  "description": "Updated description",
  "priority": "MEDIUM",
  "status": "COMPLETED",
  "assigned_user_id": "63f10118-2e87-42e0-8bb3-1a2c8da7f998"
}
```

#### Response (`200 OK`)
```json
{
  "message": "Task updated successfully",
  "task": {
    "id": "3fda10c9-e7e3-4b52-89e3-f3da0c16651c",
    "status": "COMPLETED"
  }
}
```

---

### 4.4 Delete Task
```http
DELETE /api/tasks/<task_id>
```
Deletes a task. Restricted to the task creator, assigned team leader, or an Admin/Architect.

#### Response (`200 OK`)
```json
{
  "message": "Task deleted successfully"
}
```

---

## 5. Teams API

### 5.1 List User Teams
```http
GET /api/teams
```
Returns all teams that the authenticated user belongs to.

#### Response (`200 OK`)
```json
{
  "teams": [
    {
      "id": "372b8168-c61f-4dbf-9f95-5d768add4bb1",
      "name": "DevOps Engineering",
      "description": "Infrastructure, CI/CD, and AWS deployments",
      "my_role": "LEADER",
      "member_count": 4,
      "created_at": "2026-09-20T10:00:00Z"
    }
  ]
}
```

---

### 5.2 Create Team
```http
POST /api/teams
```
Creates a new collaborative team. The creator automatically receives the `LEADER` role.

#### Request Body
```json
{
  "name": "Cloud Operations",
  "description": "Production monitoring and cloud infrastructure"
}
```

#### Response (`201 Created`)
```json
{
  "message": "Team created successfully",
  "team": {
    "id": "489c7168-c61f-4dbf-9f95-5d768add4cc2",
    "name": "Cloud Operations"
  }
}
```

---

### 5.3 Add Member to Team
```http
POST /api/teams/<team_id>/members
```
Invites a user to a team. Triggers an asynchronous invitation email via Brevo.

#### Request Body
```json
{
  "user_id": "63f10118-2e87-42e0-8bb3-1a2c8da7f998",
  "team_role": "MEMBER"
}
```

#### Response (`200 OK`)
```json
{
  "message": "Member added to team successfully"
}
```

---

## 6. Conversations & Messaging API

### 6.1 List Active Conversations
```http
GET /api/conversations
```
Returns all channels and 1-on-1 direct conversations available to the user. (The Architect has unrestricted visibility into all channels).

#### Response (`200 OK`)
```json
[
  {
    "id": "781a20c9-e7e3-4b52-89e3-f3da0c166444",
    "type": "TEAM",
    "title": "#DevOps Engineering",
    "team_id": "372b8168-c61f-4dbf-9f95-5d768add4bb1",
    "last_message": "Docker stack build completed.",
    "unread_count": 0
  },
  {
    "id": "991b30c9-e7e3-4b52-89e3-f3da0c166555",
    "type": "DIRECT",
    "title": "user000@gmail.com",
    "other_user_email": "user000@gmail.com",
    "last_message": "Please review the EC2 deployment guide.",
    "unread_count": 1
  }
]
```

---

### 6.2 Get Conversation Messages
```http
GET /api/conversations/<conversation_id>/messages
```

#### Response (`200 OK`)
```json
[
  {
    "id": "111a30c9-e7e3-4b52-89e3-f3da0c166111",
    "sender_id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
    "sender_email": "user000@gmail.com",
    "content": "Docker stack build completed.",
    "created_at": "2026-09-22T18:45:00Z"
  }
]
```

---

### 6.3 Send Message
```http
POST /api/conversations/<conversation_id>/messages
```
Sends a text message into the conversation. For direct 1-on-1 messages, dispatches an asynchronous email notification to the recipient via Brevo.

#### Request Body
```json
{
  "content": "Please verify the Nginx reverse proxy routing."
}
```

#### Response (`201 Created`)
```json
{
  "message": "Message sent successfully",
  "data": {
    "id": "222a30c9-e7e3-4b52-89e3-f3da0c166222",
    "content": "Please verify the Nginx reverse proxy routing.",
    "created_at": "2026-09-22T19:00:00Z"
  }
}
```

---

## 7. Notifications API

### 7.1 List Notifications
```http
GET /api/notifications
```

#### Response (`200 OK`)
```json
{
  "notifications": [
    {
      "id": "444a30c9-e7e3-4b52-89e3-f3da0c166444",
      "type": "TASK_ASSIGNED",
      "title": "New Task Assigned",
      "message": "You were assigned to 'Configure AWS Security Group'",
      "is_read": false,
      "created_at": "2026-09-22T18:50:00Z"
    }
  ],
  "unread_count": 1
}
```

---

### 7.2 Mark Notification as Read
```http
PUT /api/notifications/<notification_id>/read
```

#### Response (`200 OK`)
```json
{
  "message": "Notification marked as read"
}
```

---

## 8. Admin & Governance API

All admin endpoints require an authenticated user with `system_role: "ADMIN"` or `"ARCHITECT"`.

### 8.1 List All Users (Admin)
```http
GET /api/admin/users
```

#### Response (`200 OK`)
```json
{
  "users": [
    {
      "id": "ad573276-2e87-42e0-8bb3-1a2c8da7f887",
      "email": "user000@gmail.com",
      "system_role": "ADMIN",
      "account_status": "ACTIVE",
      "created_at": "2026-09-22T13:21:26Z"
    }
  ],
  "total_users": 1
}
```

---

### 8.2 Promote / Demote User Role
```http
PUT /api/admin/users/<user_id>/role
```
Restricted exclusively to the **Architect (`akhilbm13@gmail.com`)**. Standard Admins receive `403 Forbidden`.

#### Request Body
```json
{
  "system_role": "ADMIN"
}
```

#### Response (`200 OK`)
```json
{
  "message": "User role updated successfully"
}
```

---

## 👨‍💻 Author & Maintainer

**Akhil**
* **GitHub:** [@AkhilNikhil](https://github.com/AkhilNikhil)
* **Docker Hub:** [@akhilbm](https://hub.docker.com/u/akhilbm)
* **Email:** [akhilbm13@gmail.com](mailto:akhilbm13@gmail.com)
* **Role:** Lead Architect & System Maintainer
