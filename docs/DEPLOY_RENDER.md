# 🟣 Deploy TaskFlow on Render

**Time:** ~15–20 minutes · **Cost:** Free tier supported (backend sleeps when idle).

**Prerequisite:** Complete [Supabase & Brevo Setup](SUPABASE_SETUP.md) first.

The order of operations is crucial: **Deploy Backend first &rarr; Deploy Frontend second &rarr; Wire URLs together.**

---

## Strategy Comparison

| Approach | **Option 1: Deploy from GitHub Repository** | **Option 2: Deploy from Docker Hub Images** |
|:---|:---|:---|
| **Best For** | Automatic continuous redeployment upon `git push` | Quickest setup, zero source compilation on Render |
| **Backend Source** | `backend/Dockerfile` in your repo | `docker.io/akhilbm/todo-backend:v4.9.2` |
| **Frontend Source** | `frontend/Dockerfile` in your repo | `docker.io/akhilbm/todo-frontend:v4.9.2` |

---

## Option 1 — Deploy from GitHub Repository

### Step 1: Deploy Backend Web Service
1. Log in to [https://render.com](https://render.com) using your GitHub account.
2. Click **New +** &rarr; **Web Service**.
3. Select your repository: `taskflow-app` (Branch: `main`).
4. Configure service details:
   - **Name**: `taskflow-backend`
   - **Language / Runtime**: `Docker`
   - **Root Directory**: `backend`
   - **Instance Type**: `Free` (or Starter to eliminate cold-sleeps)
5. Expand **Advanced**:
   - **Health Check Path**: `/api/health`
6. Add Environment Variables:
   - `DATABASE_URL`: *(Your Supabase Session pooler URI)*
   - `SUPABASE_URL`: *(Your Supabase Project URL)*
   - `SUPABASE_ANON_KEY`: *(Your Supabase Anon Key)*
   - `ROOT_ARCHITECT_EMAIL`: `your-email@example.com` *(REQUIRED: Backend refuses to boot without this!)*
   - *(Optional Brevo)*: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SENDER`, `SMTP_SENDER_NAME`
7. Click **Create Web Service**. Wait for the status to show **Live**.
8. Copy your backend URL (e.g., `https://taskflow-backend-xxxx.onrender.com`).
9. Verify health check in browser: `https://taskflow-backend-xxxx.onrender.com/api/health` &rarr; `{"status":"healthy"}`.

### Step 2: Deploy Frontend Web Service
1. In Render, click **New +** &rarr; **Web Service**.
2. Select the same repository.
3. Configure details:
   - **Name**: `taskflow-frontend`
   - **Language / Runtime**: `Docker`
   - **Root Directory**: `frontend`
   - **Instance Type**: `Free`
4. Add Environment Variables:
   - `VITE_SUPABASE_URL`: *(Your Supabase Project URL)*
   - `VITE_SUPABASE_ANON_KEY`: *(Your Supabase Anon Key)*
   - `BACKEND_URL`: `https://taskflow-backend-xxxx.onrender.com` *(No trailing slash!)*
   - `PORT`: `80`
5. Click **Create Web Service**. Wait for **Live**, and copy your frontend URL (e.g., `https://taskflow-frontend-xxxx.onrender.com`).

---

## Option 2 — Deploy from Docker Hub Images

1. **Backend Web Service**:
   - Click **New +** &rarr; **Web Service** &rarr; Select tab **Existing Image**.
   - Image URL: `docker.io/akhilbm/todo-backend:v4.9.2`
   - Port: `5000`
   - Health Check Path: `/api/health`
   - Add the same backend environment variables as in Option 1.
2. **Frontend Web Service**:
   - Click **New +** &rarr; **Web Service** &rarr; Select tab **Existing Image**.
   - Image URL: `docker.io/akhilbm/todo-frontend:v4.9.2`
   - Environment Variable: `BACKEND_URL=https://taskflow-backend-xxxx.onrender.com`
   - Port: `80`

---

## Step 3: Wire Services Together (Both Options)

1. Open your **Backend Service** on Render &rarr; **Environment** &rarr; Add:
   - `FRONTEND_URL`: `https://taskflow-frontend-xxxx.onrender.com`
   - `CORS_ORIGINS`: `https://taskflow-frontend-xxxx.onrender.com`
   - Click **Save Changes** (Render will automatically redeploy backend).
2. In Supabase Dashboard &rarr; **Authentication** &rarr; **URL Configuration**:
   - Set **Site URL**: `https://taskflow-frontend-xxxx.onrender.com`
   - Add **Redirect URLs**: `https://taskflow-frontend-xxxx.onrender.com`

---

## Step 4: First Login & Becoming Architect

1. Open your frontend URL in your browser.
2. Note: Free tier instances on Render sleep when idle. The frontend features built-in cold-start auto-wake indicators. First load might take ~30–60s while the container wakes.
3. Register using the email specified in `ROOT_ARCHITECT_EMAIL`.
4. Click verification link in inbox, sign in, and access the **👑 Architect Panel**!
