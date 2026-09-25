# Pushing this fixed V4.9.1 to GitHub

## 1. What Was Fixed

All source files have been patched to remove hardcoded URLs, secrets, and personal email addresses:

- `backend/app/__init__.py`: Added fast-fail check for `ROOT_ARCHITECT_EMAIL` at boot (refuses to start without it).
- `backend/app/authz.py`: Removed hardcoded `akhilbm13@gmail.com` fallback for `ROOT_ARCHITECT_EMAIL`.
- `frontend/Dockerfile`: Removed baked-in Supabase URL and anon key from `ARG` defaults.
- `frontend/docker-entrypoint.sh`: Restored exit-on-missing check for `BACKEND_URL` (prevents silent fallback to Render).
- `frontend/src/supabaseClient.js`: Removed hardcoded project URL/key constants; logs clear error if missing; session persistence maintained.
- `frontend/src/App.jsx`: Updated Architect row protection from hardcoded email comparison to `u.system_role !== "ARCHITECT"`.
- `test_audit.py`: Removed specific email assertions for `akhilbm1810@gmail.com` and `u1@gmail.com`.
- `.env.example`: Updated with clean placeholders (`you@example.com`, `<project-ref>`, etc.).

## 2. Update Your Local `.env`

Confirm your local `.env` contains:
```env
ROOT_ARCHITECT_EMAIL=akhilbm13@gmail.com
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
DATABASE_URL=postgresql://...
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```
Remember: `.env` is in `.gitignore` and must **never** be committed to GitHub.

## 3. Rebuild and Push Docker Hub Images

Because `frontend/Dockerfile` no longer has hardcoded project keys, always supply the build arguments:

```bash
# Build frontend with explicit Supabase build args
docker build --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="<your-anon-key>" \
  -t akhilbm/todo-frontend:v4.9.1 \
  -t akhilbm/todo-frontend:v4.9 \
  -t akhilbm/todo-frontend:latest \
  ./frontend

# Build backend
docker build --platform linux/amd64 \
  -t akhilbm/todo-backend:v4.9.1 \
  -t akhilbm/todo-backend:v4.9 \
  -t akhilbm/todo-backend:latest \
  ./backend

# Push to Docker Hub
docker push akhilbm/todo-frontend:v4.9.1
docker push akhilbm/todo-frontend:v4.9
docker push akhilbm/todo-frontend:latest
docker push akhilbm/todo-backend:v4.9.1
docker push akhilbm/todo-backend:v4.9
docker push akhilbm/todo-backend:latest
```

## 4. Commit and Push to GitHub

```bash
git checkout -b v4.9.1
git add todo-management-system/
git status                      # Confirm .env is NOT listed!
git commit -m "V4.9.1: remove hardcoded secrets/emails, fail fast on missing config, add docs"
git push -u origin v4.9.1
```

## 5. Redeploy

- **Render:** Push triggers auto-deploy if connected to branch `v4.9.1`, or trigger **Manual Deploy → Deploy latest commit**.
  - If deploying from source on Render, ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured in the frontend service Environment settings.
  - If deploying Docker Hub images on Render, trigger **Deploy latest image**.
- **Docker Compose (Local or EC2):**
  ```bash
  docker compose down
  docker compose up -d --build
  ```

## 6. Verification Checklist

1. `curl https://<your-backend>/api/health` → `{"status":"healthy"}`
2. Open the frontend URL in browser → Clean login screen (no blank page!).
3. Sign in as Architect → Confirm **👑 Architect Panel** is accessible.
4. Verify user list in Architect Panel hides role change / suspend / delete controls for Architect account.
