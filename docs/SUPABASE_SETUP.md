# 🟢 Supabase & Brevo Setup Guide

Every deployment needs this setup first. **Time:** ~10 minutes.

Keep a notepad open. You will collect 4 essential values:

| # | Value | Used as |
|:---:|:---|:---|
| **1** | Project URL | `SUPABASE_URL`, `VITE_SUPABASE_URL` |
| **2** | Anon / Publishable key | `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` |
| **3** | Session pooler connection string | `DATABASE_URL` |
| **4** | Your database password | inside `DATABASE_URL` |

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) → **Sign up / Sign in** → **New project**.
2. Choose a project name and select a region near your users (e.g., `ap-south-1` for India / Asia).
3. Set a strong **Database password** (use alphanumeric characters; avoid special characters like `@ : / # ?` to avoid URL encoding issues in connection strings).
4. Click **Create new project** and wait 1–2 minutes for provisioning.

---

## 2. Copy the Project URL and Anon Key

1. Navigate to **Project Settings** → **API** (or **API Keys**):
   - **Project URL** &rarr; Copy this (Value #1)
   - **anon public** key (called *publishable* on newer projects) &rarr; Copy this (Value #2)

> ⚠️ **Security Notice:** Never use the `service_role` (secret) key in the frontend or public configurations. TaskFlow only requires the `anon` key.

---

## 3. Copy the Database Connection String (Session Pooler)

1. Click **Connect** in the top navigation bar of your Supabase dashboard.
2. Under Connection method, choose **Session pooler** (Port 5432).
3. Copy the URI string.
4. Replace `[YOUR-PASSWORD]` with your actual database password.
   - Example:
     ```
     postgresql://postgres.<project-ref>:MySecurePass123@aws-0-<region>.pooler.supabase.com:5432/postgres
     ```
   - This complete string becomes your `DATABASE_URL`.

> 💡 **Why the Session Pooler?** The "Direct connection" address uses IPv6, which is not supported by default on many cloud free tiers (e.g. Render, AWS EC2 basic VPCs). The **Session pooler** uses IPv4 and works reliably everywhere.

---

## 4. Configure Authentication URLs

1. In Supabase, go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to your frontend address:
   - For Local testing: `http://localhost`
   - For AWS EC2: `http://<YOUR_EC2_PUBLIC_IP>`
   - For Render: `https://<YOUR_RENDER_FRONTEND>.onrender.com`
3. Under **Redirect URLs**, add the same URL.
4. Under **Authentication** → **Providers** → **Email**, ensure **Confirm email** is enabled.

---

## 5. Setup Transactional Email (Brevo SMTP)

Supabase's built-in email sender allows only 3–4 emails per hour. Using Brevo (free tier allows 300 emails/day) ensures reliable delivery for signups and TaskFlow task/chat alerts.

1. Sign up at [https://www.brevo.com](https://www.brevo.com).
2. Go to **Senders, Domains & Dedicated IPs** → **Senders** → Add and verify your sender email.
3. Go to **SMTP & API** → **SMTP** → Click **Generate a new SMTP key**.
   - **SMTP Host**: `smtp-relay.brevo.com`
   - **SMTP Port**: `587`
   - **SMTP Login**: (e.g. `xxxx@smtp-brevo.com`) &rarr; `SMTP_USER`
   - **SMTP Key**: &rarr; `SMTP_PASSWORD`
   - **Verified Sender**: &rarr; `SMTP_SENDER`
4. *(Recommended)* In Supabase dashboard: **Authentication** → **SMTP Settings** → Enable **Custom SMTP** with these same Brevo credentials so Supabase verification emails also route through Brevo!

---

## 6. Database Tables & Migrations

**No manual SQL required!** When the TaskFlow backend starts, its boot-time schema synchronizer automatically runs and creates all necessary tables (`users`, `teams`, `team_members`, `tasks`, `conversations`, `conversation_members`, `messages`, `notifications`) and applies missing columns (`due_date`, `dm_status`).

---

## ✅ Checklist Complete

- [x] `SUPABASE_URL` saved
- [x] `SUPABASE_ANON_KEY` saved
- [x] `DATABASE_URL` saved with real password
- [x] Supabase **Site URL** configured
- [x] *(Optional)* Brevo SMTP credentials configured

**Next Step:** Proceed to [Local Quickstart](../README.md#-quick-start--run-on-your-computer), [Deploy on AWS](DEPLOY_AWS.md), or [Deploy on Render](DEPLOY_RENDER.md).
