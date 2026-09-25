# 🔵 Deploy TaskFlow on Azure

You have two practical approaches to deploy TaskFlow on Microsoft Azure:

| Feature | **Option A — Azure Virtual Machine** | **Option B — Azure Container Apps (Serverless)** |
|:---|:---|:---|
| **Simplicity** | ⭐ Easiest (Runs standard `docker compose`) | ⭐⭐ Medium (Managed containers) |
| **Docker Hub Direct Pull** | ✅ Yes | ✅ Yes (pulls straight from Docker Hub) |
| **Cost** | Fixed (Standard_B1s or B2s) | Pay-as-you-go |
| **SSL/HTTPS** | Manual (Certbot or Application Gateway) | Automatic Azure SSL certificate |

---

## Option A — Azure Linux VM (Docker Compose)

### 1. Create the Virtual Machine
1. In Azure Portal &rarr; **Virtual machines** &rarr; **Create** &rarr; **Azure virtual machine**.
2. **Name**: `taskflow-vm`, **OS**: Ubuntu Server 24.04 LTS.
3. **Size**: `Standard_B2s` (2 vCPU, 4 GB RAM recommended) or `Standard_B1s` if pulling pre-built images.
4. **Authentication**: SSH public key (download `.pem` file).
5. **Inbound Port Rules**: Allow **SSH (22)** and **HTTP (80)**.
6. Click **Review + create** &rarr; **Create**. Copy the Public IP address.

### 2. Connect via SSH
```bash
chmod 400 taskflow-vm.pem
ssh -i taskflow-vm.pem azureuser@<YOUR_AZURE_PUBLIC_IP>
```

### 3. Install Docker & Docker Compose
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt-get install -y git
exit
```
*Reconnect with SSH.*

### 4. Clone & Run TaskFlow
```bash
git clone -b v4 https://github.com/AkhilNikhil/todo-management-system.git
cd todo-management-system
cp .env.example .env
nano .env
```
Set:
- `FRONTEND_URL=http://<YOUR_AZURE_PUBLIC_IP>`
- `CORS_ORIGINS=http://<YOUR_AZURE_PUBLIC_IP>`
- Supabase connection details

Run directly with Docker Hub images:
```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

---

## Option B — Azure Container Apps (Managed Containers)

Azure Container Apps can pull images directly from public Docker Hub.

### 1. Initialize Resources with Azure CLI
```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App

export RG=taskflow-rg
export LOC=centralindia
export ENVNAME=taskflow-env

az group create --name $RG --location $LOC
az containerapp env create --name $ENVNAME --resource-group $RG --location $LOC
```

### 2. Deploy Backend Container
```bash
az containerapp create \
  --name taskflow-backend \
  --resource-group $RG \
  --environment $ENVNAME \
  --image docker.io/akhilbm/todo-backend:v4.9 \
  --target-port 5000 \
  --ingress external \
  --min-replicas 1 \
  --env-vars \
      DATABASE_URL="<YOUR_SUPABASE_SESSION_POOLER_URI>" \
      SUPABASE_URL="https://<YOUR-PROJECT-REF>.supabase.co" \
      SUPABASE_ANON_KEY="<YOUR_SUPABASE_ANON_KEY>" \
      ROOT_ARCHITECT_EMAIL="akhilbm13@gmail.com" \
      RUN_SCHEMA_SYNC=true
```

Get backend FQDN URL:
```bash
export BACKEND_FQDN=$(az containerapp show --name taskflow-backend --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "Backend URL: https://$BACKEND_FQDN"
```

### 3. Deploy Frontend Container
```bash
az containerapp create \
  --name taskflow-frontend \
  --resource-group $RG \
  --environment $ENVNAME \
  --image docker.io/akhilbm/todo-frontend:v4.9 \
  --target-port 80 \
  --ingress external \
  --min-replicas 1 \
  --env-vars BACKEND_URL="https://$BACKEND_FQDN"

export FRONTEND_FQDN=$(az containerapp show --name taskflow-frontend --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "Frontend URL: https://$FRONTEND_FQDN"
```

### 4. Wire Backend CORS & Supabase
```bash
az containerapp update --name taskflow-backend --resource-group $RG \
  --set-env-vars FRONTEND_URL="https://$FRONTEND_FQDN" CORS_ORIGINS="https://$FRONTEND_FQDN"
```
Configure Supabase **Site URL** & **Redirect URLs** to `https://$FRONTEND_FQDN`.
