# 🐳 Docker Hub Images Guide

TaskFlow V4.9.2 provides pre-built production container images published on Docker Hub:

| Component | Tag | Docker Hub Repository | Default Port |
|:---|:---:|:---|:---:|
| **Backend API** | `v4.9.2`, `latest` | [`akhilbm/todo-backend:v4.9.2`](https://hub.docker.com/r/akhilbm/todo-backend) | `5000` |
| **Frontend Web** | `v4.9.2`, `latest` | [`akhilbm/todo-frontend:v4.9.2`](https://hub.docker.com/r/akhilbm/todo-frontend) | `80` |

---

## 1. Pulling and Running Ready-to-Use Images

You can run TaskFlow with zero build time using Docker Compose:

```bash
# 1. Download compose file and sample env
curl -O https://raw.githubusercontent.com/AkhilNikhil/todo-management-system/v4/docker-compose.hub.yml
curl -O https://raw.githubusercontent.com/AkhilNikhil/todo-management-system/v4/.env.example
cp .env.example .env

# 2. Fill in your DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY in .env

# 3. Pull and launch!
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

### Running Manually via Docker CLI
```bash
docker network create taskflow-net

docker run -d --name todo-backend \
  --network taskflow-net \
  -p 5000:5000 \
  --env-file .env \
  akhilbm/todo-backend:v4.9.2

docker run -d --name todo-frontend \
  --network taskflow-net \
  -p 80:80 \
  -e BACKEND_URL=http://todo-backend:5000 \
  akhilbm/todo-frontend:v4.9.2
```

---

## 2. Re-Building & Publishing to Your Own Docker Hub

If you wish to build custom images under your own Docker Hub organization:

```bash
docker login

# Build & Push Backend
docker build -t <YOUR_DOCKER_USERNAME>/todo-backend:v4.9 ./backend
docker tag <YOUR_DOCKER_USERNAME>/todo-backend:v4.9 <YOUR_DOCKER_USERNAME>/todo-backend:latest
docker push <YOUR_DOCKER_USERNAME>/todo-backend:v4.9
docker push <YOUR_DOCKER_USERNAME>/todo-backend:latest

# Build & Push Frontend (pass your own Supabase build args)
docker build \
  --build-arg VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="YOUR_KEY" \
  -t <YOUR_DOCKER_USERNAME>/todo-frontend:v4.9 ./frontend
docker tag <YOUR_DOCKER_USERNAME>/todo-frontend:v4.9 <YOUR_DOCKER_USERNAME>/todo-frontend:latest
docker push <YOUR_DOCKER_USERNAME>/todo-frontend:v4.9
docker push <YOUR_DOCKER_USERNAME>/todo-frontend:latest
```

---

## 3. Multi-Architecture Builds (Apple Silicon / Mac M1/M2/M3)
Cloud servers (EC2, Render, Azure) typically run on `linux/amd64`. If building from an Apple Silicon Mac, use `docker buildx` to ensure compatibility:

```bash
docker buildx build --platform linux/amd64 -t <YOUR_DOCKER_USERNAME>/todo-backend:v4.9 --push ./backend
docker buildx build --platform linux/amd64 -t <YOUR_DOCKER_USERNAME>/todo-frontend:v4.9 --push ./frontend
```
