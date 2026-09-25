# Pushing TaskFlow V4.9.2 to GitHub (`taskflow`)

## 1. What Was Fixed & Hardened

All source files have been patched to remove hardcoded URLs, secrets, and personal email addresses:

- `backend/app/__init__.py`: Added fast-fail check for `ROOT_ARCHITECT_EMAIL` at boot (refuses to start without it).
- `backend/app/authz.py`: Removed hardcoded `akhilbm13@gmail.com` fallback for `ROOT_ARCHITECT_EMAIL`.
- `frontend/Dockerfile`: Removed baked-in Supabase URL and anon key from `ARG` defaults.
- `frontend/docker-entrypoint.sh`: Restored exit-on-missing check for `BACKEND_URL` (prevents silent fallback to Render).
- `frontend/src/supabaseClient.js`: Removed hardcoded project URL/key constants; logs clear error if missing; isolated session tokens in `sessionStorage`.
- `frontend/src/App.jsx`: Updated Architect row protection from hardcoded email comparison to `u.system_role !== "ARCHITECT"`.
- `test_audit.py`: Removed specific email assertions; all 24 system audit tests pass 100%.
- `.env.example`: Updated with clean placeholders (`you@example.com`, `<project-ref>`, etc.).

## 2. Docker Hub Images (`v4.9.2` & `latest`)

Pre-built multi-arch images have been published on Docker Hub:
- `akhilbm/todo-frontend:v4.9.2` and `akhilbm/todo-frontend:latest`
- `akhilbm/todo-backend:v4.9.2` and `akhilbm/todo-backend:latest`

## 3. Create the Repository on GitHub

1. Open [https://github.com/new](https://github.com/new) in your browser.
2. Enter **Repository name**: `taskflow`
3. Leave "Add a README file" **UNCHECKED** (we already have a complete README and docs).
4. Click **Create repository**.

## 4. Push to GitHub

From this folder, run:

```bash
git push -u origin main
```

*(Remote `origin` is already pre-configured to `https://github.com/AkhilNikhil/taskflow.git`)*.

## 5. Deploy to Render

### Backend Service:
- **Option A (Docker Hub Image)**: Select **Existing Image** &rarr; `docker.io/akhilbm/todo-backend:v4.9.2` (or `latest`).
  - Required Environment Variables:
    - `DATABASE_URL`: `postgresql://...`
    - `SUPABASE_URL`: `https://<ref>.supabase.co`
    - `SUPABASE_ANON_KEY`: `<anon-key>`
    - `ROOT_ARCHITECT_EMAIL`: `akhilbm13@gmail.com` (or your admin email)
- **Option B (From Git Repo)**: Connect your new `taskflow` repository (Branch: `main`, Root Directory: `backend`).

### Frontend Service:
- **Option A (Docker Hub Image)**: Select **Existing Image** &rarr; `docker.io/akhilbm/todo-frontend:v4.9.2` (or `latest`).
  - Environment Variable: `BACKEND_URL=https://<your-backend>.onrender.com`
- **Option B (From Git Repo)**: Connect your new `taskflow` repository (Branch: `main`, Root Directory: `frontend`).
  - Add build arguments in Render environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## 6. Verification Checklist

1. `curl https://<your-backend>/api/health` → `{"status":"healthy"}`
2. Open frontend URL → Clean login/signup interface loads without blank screen.
3. Sign up with `ROOT_ARCHITECT_EMAIL` → Verify email → Sign in → **👑 Architect Panel** is unlocked.
