# 🟠 Deploy TaskFlow on AWS

You have two deployment strategies on AWS:

| Feature | **Option A — Standalone EC2 (Recommended)** | **Option B — AWS App Runner** |
|:---|:---|:---|
| **ECR Registry Needed?** | ❌ **No ECR Needed!** Pull directly from Docker Hub or build locally | ✅ Yes (App Runner pulls only from ECR) |
| **Simplicity** | ⭐ Easiest (Single Ubuntu instance with Docker) | ⭐⭐ Medium (Managed containers) |
| **How it runs** | Standard `docker compose` | Managed serverless containers |
| **Cost** | Fixed (`t3.micro` or `t3.small`) | Pay-per-use CPU/RAM |
| **HTTPS** | Elastic IP + Nginx Certbot / ALB | Automatic AWS SSL certificate |

---

## 📌 Do I Need AWS ECR to Deploy on EC2?

> 💡 **Answer: NO, ECR is NOT required for EC2!**
> 
> When deploying to an EC2 instance, you are running a standard Linux VM. You can either:
> 1. Pull the pre-built public Docker images **directly from Docker Hub** (`akhilbm/todo-backend:v4.9`, `akhilbm/todo-frontend:v4.9`), or
> 2. Clone the repository and run `docker compose up -d --build`.
> 
> You do **not** need to create or pay for Amazon ECR repositories when using EC2. ECR is only needed if using App Runner or ECS with private container registries.

---

## Option A — Deploy on EC2 with Docker Compose (Recommended)

### Step 1: Launch an EC2 Instance
1. Open the [AWS EC2 Console](https://console.aws.amazon.com/ec2).
2. Click **Launch instance**:
   - **Name**: `taskflow-prod`
   - **OS**: Ubuntu Server 24.04 LTS (64-bit x86)
   - **Instance Type**: `t3.small` (2 vCPU, 2 GB RAM recommended if building from source; `t3.micro` is sufficient if pulling pre-built Docker Hub images)
   - **Key pair**: Create or select an existing `.pem` key pair
   - **Network Settings**:
     - Allow SSH (`22`) from *My IP*
     - Allow HTTP (`80`) from *Anywhere* (`0.0.0.0/0`)
     - Allow HTTPS (`443`) from *Anywhere* (if adding SSL later)
   - **Storage**: 20 GB gp3
3. Click **Launch instance**.
4. *(Recommended)* Under **EC2 → Network & Security → Elastic IPs**, allocate an Elastic IP and associate it with your instance so the public IP never changes on reboot.

### Step 2: Connect to your Server
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

### Step 3: Install Docker & Docker Compose
Run the official automated Docker installation script:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo apt-get install -y git
exit
```
*Reconnect via SSH so the docker group permissions take effect.*

### Step 4: Clone Code & Configure Environment
```bash
git clone https://github.com/AkhilNikhil/taskflow.git
cd taskflow
cp .env.example .env
nano .env
```
Fill in your configuration:
- `DATABASE_URL`: Your Supabase Session pooler connection string
- `SUPABASE_URL`: Your Supabase Project URL
- `SUPABASE_ANON_KEY`: Your Supabase Anon Key
- `ROOT_ARCHITECT_EMAIL`: Your email address
- `FRONTEND_URL=http://<YOUR_EC2_PUBLIC_IP>`
- `CORS_ORIGINS=http://<YOUR_EC2_PUBLIC_IP>`

*(Save with `Ctrl+O`, `Enter`, and exit with `Ctrl+X`)*

### Step 5: Start the Application

You can start using either approach:

#### Way 1: Pull Pre-built Images from Docker Hub (Fastest, zero compilation)
```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

#### Way 2: Build Locally on the Server
```bash
docker compose up -d --build
```

### Step 6: Verify
```bash
docker compose ps
```
Both `todo-backend` and `todo-frontend` should show as **Up / Healthy**.

1. In Supabase dashboard: **Authentication → URL Configuration** &rarr; Set **Site URL** and **Redirect URLs** to `http://<YOUR_EC2_PUBLIC_IP>`.
2. Open your browser: `http://<YOUR_EC2_PUBLIC_IP>`.
3. Register using the email defined in `ROOT_ARCHITECT_EMAIL`. Confirm your email, sign in, and you will see the **👑 Architect Panel**!

---

## Option B — Deploy on AWS App Runner (Serverless Managed Containers)

If you prefer serverless containers without managing an EC2 server, App Runner pulls images from Amazon ECR.

### Step 1: Create ECR Repositories
Run from your local terminal with AWS CLI configured:
```bash
export AWS_REGION=ap-south-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

aws ecr create-repository --repository-name taskflow-backend --region $AWS_REGION
aws ecr create-repository --repository-name taskflow-frontend --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR
```

### Step 2: Push Images to ECR
```bash
# Pull images from Docker Hub and retag for ECR:
docker pull --platform linux/amd64 akhilbm/todo-backend:v4.9
docker pull --platform linux/amd64 akhilbm/todo-frontend:v4.9

docker tag akhilbm/todo-backend:v4.9 $ECR/taskflow-backend:v4.9
docker tag akhilbm/todo-frontend:v4.9 $ECR/taskflow-frontend:v4.9

docker push $ECR/taskflow-backend:v4.9
docker push $ECR/taskflow-frontend:v4.9
```

### Step 3: Create App Runner Services
1. **Backend Service**:
   - Source: ECR `taskflow-backend:v4.9`
   - Port: `5000`
   - Health check: HTTP `/api/health`
   - Environment variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ROOT_ARCHITECT_EMAIL`
2. **Frontend Service**:
   - Source: ECR `taskflow-frontend:v4.9`
   - Port: `80`
   - Environment variables: `BACKEND_URL=https://<your-backend-apprunner-domain>`
3. Wire the frontend domain into the backend's `FRONTEND_URL` and `CORS_ORIGINS`.
