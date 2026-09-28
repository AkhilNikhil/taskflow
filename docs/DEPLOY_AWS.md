# 🟠 Deploy TaskFlow on AWS EC2 (Pure Image Pull)

This guide documents the **verified, production-standard deployment** of TaskFlow V4.9.2 on an AWS EC2 Ubuntu instance using pre-built immutable images from Docker Hub.

> 🔒 **Zero Source Code Rule:**  
> We do **NOT** run `git clone`, copy source files, or install compilers/runtimes (Node.js, Python, npm) on the production server. We deploy strictly using pre-built images from Docker Hub (`akhilbm/todo-frontend` and `akhilbm/todo-backend`).

---

## 📌 Architecture Overview

```
                                  [ AWS Internet Gateway ]
                                             │
                                    Inbound HTTP Port 80
                                             ▼
                      ┌─────────────────────────────────────────────┐
                      │         AWS EC2 HOST (Ubuntu 24.04)         │
                      │  Security Group: Inbound 80 (HTTP), 22 (SSH)│
                      └──────────────────────┬──────────────────────┘
                                             │ Docker Port Forward :80
                                             ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                     DOCKER USER-DEFINED BRIDGE NETWORK (taskflow-net)                     │
│                                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ FRONTEND CONTAINER: todo-frontend (Nginx 1.27 Alpine | 25 MB)                       │  │
│  │   • Port 80 Ingress                                                                 │  │
│  │   • Route /       ──> Serves React 19 Static Bundle                                 │  │
│  │   • Route /api/*  ──> Reverse Proxy to http://backend:5000/api/*                    │  │
│  └─────────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                            │ Internal DNS: http://backend:5000            │
│                                            ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ BACKEND CONTAINER: todo-backend (Python 3.12-Slim | appuser Non-Root)               │  │
│  │   • Gunicorn WSGI :5000 (2 Workers, 4 Threads)                                      │  │
│  │   • Native Healthcheck: curl -f http://localhost:5000/api/health (Every 30s)        │  │
│  └─────────────────────────────────────────┬───────────────────────────────────────────┘  │
└────────────────────────────────────────────┼──────────────────────────────────────────────┘
                                             │ Outbound TLS (Port 5432/6543)
                                             ▼
                      ┌─────────────────────────────────────────────┐
                      │      SUPABASE MANAGED DATA PLATFORM         │
                      │  • PgBouncer Connection Pooler (Port 6543)  │
                      │  • PostgreSQL 15 Relational Store           │
                      │  • Supabase Auth & JWT Validator            │
                      └─────────────────────────────────────────────┘
```

---

## 🚀 Step-by-Step Deployment Runbook

### Step 1: Launch an AWS EC2 Instance
1. Open the [AWS EC2 Console](https://console.aws.amazon.com/ec2).
2. Click **Launch instance**:
   * **Name**: `taskflow-prod`
   * **AMI**: `Ubuntu Server 24.04 LTS (HVM), SSD Volume Type` (64-bit x86)
   * **Instance Type**: `t3.micro` or `t2.micro` (Free tier eligible, 1 vCPU, 1 GB RAM — *1 GB RAM is fully sufficient because we pull pre-compiled images directly from Docker Hub*).
   * **Key Pair**: Create or select an RSA `.pem` key pair (e.g., `taskflow-key.pem`).
   * **Network Settings**:
     * ☑ **Allow SSH traffic from**: `Anywhere (0.0.0.0/0)` or `My IP`
     * ☑ **Allow HTTP traffic from the internet**: Port `80` (`0.0.0.0/0`)
     * ☑ **Allow HTTPS traffic from the internet**: Port `443` (`0.0.0.0/0`)
   * **Storage**: `15` to `20 GiB gp3` SSD.
3. Click **Launch instance** and copy the **Public IPv4 address** (e.g., `13.60.15.82`).

---

### Step 2: Connect via SSH
From your local terminal (PowerShell, Command Prompt, or Git Bash):

```bash
chmod 400 taskflow-key.pem
ssh -i "taskflow-key.pem" ubuntu@<YOUR_EC2_PUBLIC_IP>
```
*(Type `yes` when prompted to verify host authenticity).*

---

### Step 3: Install Docker Engine & Compose Plugin
Run the automated Docker installation script directly on the server:

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu && exit
```
*(This installs Docker Engine, enables the systemd service, adds `ubuntu` to the `docker` group, and logs you out to apply permissions).*

Reconnect immediately:
```bash
ssh -i "taskflow-key.pem" ubuntu@<YOUR_EC2_PUBLIC_IP>

# Verify Docker installation
docker --version && docker compose version
```

---

### Step 4: Create Production Workspace & Secrets (`.env`)
Create an isolated directory `/opt/taskflow` to manage production configurations:

```bash
sudo mkdir -p /opt/taskflow && sudo chown ubuntu:ubuntu /opt/taskflow && cd /opt/taskflow
```

Create the `.env` file with **zero hardcoded IPs** (using `CORS_ORIGINS=*` to remain completely cloud-agnostic):

```bash
cat << 'EOF' > .env
# Database Connection (Supabase PostgreSQL Session Pooler)
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

# Supabase Auth
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_DB_PASSWORD=<your-db-password>
SUPABASE_JWT_SECRET=<your-jwt-secret>

# App Behaviour (Zero Hardcoded IPs)
ROOT_ARCHITECT_EMAIL=akhilbm13@gmail.com
CORS_ORIGINS=*
RUN_SCHEMA_SYNC=true

# Transactional Email Pipeline (Brevo SMTP Relay)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your-brevo-smtp-user>
SMTP_PASSWORD=<your-brevo-smtp-key>
SMTP_SENDER=akhilbm13@gmail.com
SMTP_SENDER_NAME=TaskFlow

# Frontend Config
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
BACKEND_URL=http://backend:5000
EOF
```

---

### Step 5: Create Production `docker-compose.yml`
Create the orchestration file pointing directly to the Docker Hub registry:

```bash
cat << 'EOF' > docker-compose.yml
services:
  backend:
    image: akhilbm/todo-backend:v4.9.2
    container_name: todo-backend
    restart: unless-stopped
    env_file:
      - .env
    expose:
      - "5000"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:5000/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  frontend:
    image: akhilbm/todo-frontend:v4.9.2
    container_name: todo-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    environment:
      - BACKEND_URL=http://backend:5000
    depends_on:
      - backend
EOF
```

---

### Step 6: Pull Pre-Built Images & Launch Containers
```bash
# 1. Pull the pre-built images from Docker Hub
docker compose pull

# 2. Launch the containers in detached mode
docker compose up -d
```

---

### Step 7: Verify Running State & Healthcheck
```bash
# Check container status
docker compose ps
```
*Expected Output:*
```text
NAME            IMAGE                         COMMAND                  SERVICE    STATUS              PORTS
todo-backend    akhilbm/todo-backend:v4.9.2    "sh -c 'gunicorn --b…"   backend    running (healthy)   5000/tcp
todo-frontend   akhilbm/todo-frontend:v4.9.2   "/docker-entrypoint.…"   frontend   running             0.0.0.0:80->80/tcp
```

```bash
# Test internal Nginx reverse proxy endpoint
curl -i http://localhost/api/health
```
*Expected Output:* `HTTP/1.1 200 OK`

---

### Step 8: Supabase URL Configuration
1. Open your **Supabase Dashboard**.
2. Navigate to: **Authentication &rarr; URL Configuration**.
3. Under **Redirect URLs**, click **Add URL** and add:
   * `http://<YOUR_EC2_PUBLIC_IP>`
   * `http://<YOUR_EC2_PUBLIC_IP>/*`
4. Click **Save**.

---

### Step 9: Open in Browser
Open your browser and navigate to:
👉 **`http://<YOUR_EC2_PUBLIC_IP>`**

---

### Step 10: Run the 26 Automated Test Cases Audit Suite
Verify the entire system (Auth, Teams, Tasks, Chat, Notifications, Roles) against the live running container and database:

```bash
# 1. Download test_audit.py into /opt/taskflow
curl -O https://raw.githubusercontent.com/AkhilNikhil/taskflow/main/test_audit.py

# 2. Copy the test script into the running backend container
docker cp test_audit.py todo-backend:/app/test_audit.py

# 3. Execute the full system audit suite inside the container
docker exec todo-backend python /app/test_audit.py
```
*Expected Result:* `🎉 ALL 26/26 TESTS PASSED! SYSTEM VERIFIED 100% HEALTHY`

---

## 🔍 Log Inspection & Diagnostic Commands

Run these inside `/opt/taskflow` to monitor your production services:

```bash
# 1. Live stream backend Gunicorn / Flask logs (tail last 50 lines)
docker compose logs -f --tail=50 backend

# 2. Live stream frontend Nginx reverse proxy access & error logs
docker compose logs -f --tail=50 frontend

# 3. Inspect deep container healthcheck state & failure streak
docker inspect --format='{{json .State.Health}}' todo-backend

# 4. View real-time container CPU & Memory utilization
docker stats --no-stream

# 5. Open an interactive shell inside the backend container
docker exec -it todo-backend sh

# 6. Apply .env or compose changes without downtime
docker compose up -d
```

---

## 🩺 Common Errors & Immediate Solutions Matrix

| Error / Symptom | Root Cause | Immediate Solution |
| :--- | :--- | :--- |
| **`ERR_CONNECTION_REFUSED` in Browser** | **Cause 1:** Port 80 not open in AWS Security Group.<br><br>**Cause 2:** Brave / Chrome forcing `https://` on Port 443 where no SSL exists. | **Fix 1:** Go to AWS EC2 &rarr; Security Groups &rarr; Edit Inbound Rules &rarr; Add **HTTP (Port 80)** from `0.0.0.0/0`.<br><br>**Fix 2:** In Brave, click the **Lion Shield** icon &rarr; toggle **"Upgrade connections to HTTPS" to OFF**, or test in Chrome with explicit `http://`. |
| **HTTP 502 Bad Gateway** | Nginx cannot connect to `http://backend:5000` because the backend container crashed or is still initializing. | Run `docker compose ps` to check container state.<br>Inspect logs: `docker compose logs --tail=50 backend`. Usually caused by a typo in `DATABASE_URL` or an unreachable Supabase pooler. |
| **HTTP 504 Gateway Timeout** | Gunicorn backend took >60s to respond due to a slow unindexed database query or thread starvation. | Inspect database latency in Supabase dashboard.<br>Verify backend connection pooler port `6543`.<br>Run `docker stats` to ensure CPU is not pegged at 100%. |
| **Container Exited with `Exit Code 137`** | Linux Kernel Out-Of-Memory (OOM) Killer terminated the container process. | Run `dmesg -T \| grep -i oom`.<br>On a 1 GB RAM instance (`t3.micro`), ensure Gunicorn is using 2 workers (`--workers 2 --threads 4`). Do not increase workers beyond 2 on small instances. |
| **Database Pool Exhaustion (`max_connections`)** | Application opened too many direct PostgreSQL connections instead of using the session pooler. | In `.env`, ensure `DATABASE_URL` connects through Supabase's **Session Pooler port (6543)** on `aws-0-...pooler.supabase.com`, NOT direct port 5432. |
| **Email Verification Redirects to `localhost`** | Supabase Auth does not have your EC2 IP in its allowed redirect list. | In Supabase Dashboard &rarr; **Authentication &rarr; URL Configuration**, add `http://<YOUR_EC2_PUBLIC_IP>` and `http://<YOUR_EC2_PUBLIC_IP>/*` under **Redirect URLs**. |
