# SpokesBot — Production Deployment Guide

This document is the single source of truth for provisioning and deploying SpokesBot to production. Follow the sections in order on first setup. After that, every push to `main` deploys automatically.

---

## Architecture Overview

```
GitHub (main branch)
    │
    ├── CI workflow (ci.yml)       lint → test → docker build
    │         │ passes
    └── Deploy workflow (deploy.yml)
              ├── Backend  → Docker image → GHCR → Render (Web Service)
              └── Frontend → Vercel build → Vercel CDN
                                    │
                         Both call Supabase (Postgres + RLS + Storage)
                         Backend calls OpenAI API (GPT-4o)
```

**Deploy order is enforced in the pipeline:**
1. Backend image is built, pushed to GHCR, and Render redeploys.
2. The pipeline polls `/health` until the new backend is live.
3. Frontend is then deployed to Vercel.

This guarantees the new frontend JavaScript (which calls `GET /threads/{id}`) is never served against a stale backend that doesn't have that endpoint.

---

## Prerequisites

Before you begin you need accounts at:

| Service | Purpose | Free tier sufficient? |
|---|---|---|
| [Supabase](https://supabase.com) | Postgres DB, Auth, Storage | Yes |
| [Vercel](https://vercel.com) | Frontend hosting | Yes |
| [Render](https://render.com) | Backend hosting (Docker) | Yes (with sleep) |
| [OpenAI](https://platform.openai.com) | GPT-4o API | Pay-as-you-go |
| [GitHub](https://github.com) | Source + CI/CD + GHCR | Yes |

---

## Step 1 — Supabase Setup

### 1.1 Create a project

1. Go to [app.supabase.com](https://app.supabase.com) → **New Project**.
2. Note down:
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_KEY` *(keep this private)*

### 1.2 Run database migrations

In the Supabase SQL editor, run each migration file from `backend/migrations/` in order (001, 002, … etc). These create the `organizations`, `datasets`, `threads`, and `messages` tables with all required RLS policies.

### 1.3 Create the Storage bucket

1. Supabase dashboard → **Storage** → **New bucket**.
2. Name: `datasets`
3. **Public**: off
4. Add a policy allowing the service role to read/write (the backend uses the service key for storage access).

### 1.4 Enable Email Auth

Supabase dashboard → **Authentication** → **Providers** → enable **Email**.

---

## Step 2 — Backend Setup (Render)

### 2.1 Create a Render Web Service

1. [render.com](https://render.com) → **New** → **Web Service**.
2. Select **Deploy an existing image from a registry**.
3. Image URL: `ghcr.io/YOUR_GITHUB_ORG/YOUR_REPO/backend:latest`
   - Replace with your actual GitHub org/repo (lowercase). Example: `ghcr.io/acme/spokesbot/backend:latest`
4. Instance type: **Free** (or Starter for always-on).
5. Port: `8000`

### 2.2 Configure environment variables on Render

In the Render service → **Environment** → add each variable:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `FRONTEND_URL` | Your Vercel production URL, e.g. `https://spokesbot.vercel.app` |
| `ENVIRONMENT` | `production` |
| `LOG_LEVEL` | `WARNING` |
| `RATE_LIMIT_CHAT` | `20/minute` |

### 2.3 Allow Render to pull from GHCR

GHCR images from public repositories are accessible without credentials. If your repository is **private**:

1. Create a GitHub Personal Access Token with `read:packages` scope.
2. Render → **Registry Credentials** → add a credential for `ghcr.io` with your GitHub username and the PAT as the password.
3. Select that credential on your Render Web Service.

### 2.4 Get the deploy hook URL

Render service → **Settings** → **Deploy Hook** → copy the URL.
This is your `RENDER_DEPLOY_HOOK_URL` GitHub Secret (see Step 4).

### 2.5 Verify the backend is live

```bash
curl https://your-render-url.onrender.com/health
# Expected: {"status": "ok", "environment": "production"}
```

---

## Step 3 — Frontend Setup (Vercel)

### 3.1 Import the project

1. [vercel.com](https://vercel.com) → **Add New Project** → **Import Git Repository**.
2. Select your GitHub repo.
3. Set **Root Directory** to `frontend`.
4. Framework: **Next.js** (auto-detected).

### 3.2 Configure environment variables on Vercel

In the Vercel project → **Settings** → **Environment Variables** → add for **Production**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Your Render backend URL, e.g. `https://spokesbot-api.onrender.com` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel domain, e.g. `https://spokesbot.vercel.app` |

> **Note:** `NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at build time. After adding or changing them you must trigger a new deployment.

### 3.3 Disable Vercel's automatic Git deployments

Since the GitHub Actions pipeline manages deployments, disable Vercel's built-in Git integration to avoid double-deploys:

Vercel project → **Settings** → **Git** → **Ignored Build Step** → set to `exit 1`.

This tells Vercel to ignore all pushes from Git. The pipeline deploys using the Vercel CLI with a token instead.

### 3.4 Get the project IDs

You need two values for GitHub Secrets:

```bash
# Install Vercel CLI locally
npm i -g vercel

# Link the frontend directory to your Vercel project
cd frontend
vercel link

# The IDs are now in frontend/.vercel/project.json
cat .vercel/project.json
# {"projectId": "prj_xxx", "orgId": "team_xxx"}
```

- `projectId` → `VERCEL_PROJECT_ID`
- `orgId` → `VERCEL_ORG_ID`

### 3.5 Get a Vercel API token

Vercel dashboard → **Settings** → **Tokens** → **Create** → scope: full account.
This is your `VERCEL_TOKEN` GitHub Secret.

---

## Step 4 — GitHub Secrets

In your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → add each secret:

| Secret name | Where to get it | Used by |
|---|---|---|
| `VERCEL_TOKEN` | Vercel → Settings → Tokens | deploy.yml frontend job |
| `VERCEL_ORG_ID` | `frontend/.vercel/project.json` → `orgId` | deploy.yml frontend job |
| `VERCEL_PROJECT_ID` | `frontend/.vercel/project.json` → `projectId` | deploy.yml frontend job |
| `RENDER_DEPLOY_HOOK_URL` | Render → Service → Settings → Deploy Hook | deploy.yml backend job |
| `BACKEND_HEALTH_URL` | Your Render service URL, e.g. `https://spokesbot-api.onrender.com` | deploy.yml backend job |

> `GITHUB_TOKEN` is provided automatically by GitHub Actions — you do not need to create it.

---

## Step 5 — CORS Configuration

The backend CORS `allow_origins` must include your Vercel domain. In `backend/app/main.py`, the origin is read from `settings.FRONTEND_URL`. Set this on Render to match your Vercel domain exactly (no trailing slash).

If you use a custom domain on Vercel (e.g. `app.spokesbot.io`), update `FRONTEND_URL` on Render to match.

---

## Step 6 — First Deployment

After completing Steps 1–5:

```bash
# On your local machine, push to main
git push origin main
```

The pipeline runs automatically:

1. **CI** (ci.yml): lint → test → docker build (~3 min)
2. **Deploy** (deploy.yml) — only if CI passes:
   - Backend image pushed to `ghcr.io/YOUR_ORG/YOUR_REPO/backend:latest`
   - Render picks up the new image and redeploys (~2–4 min)
   - Pipeline polls `/health` until 200 OK
   - Vercel builds and deploys the frontend (~2 min)

Monitor progress in **GitHub → Actions**.

---

## Ongoing Deployments

Every `git push origin main` triggers the full pipeline automatically. No manual steps required.

```
push to main
  → CI passes
    → Backend image pushed to GHCR
      → Render redeploys from new image
        → /health returns 200
          → Vercel deploys new frontend
```

To deploy a hotfix without waiting for CI (not recommended for production):

```bash
# Skip deploy.yml's CI gate by using workflow_dispatch if added,
# or manually trigger a Render redeploy from the Render dashboard
# and a Vercel redeploy from the Vercel dashboard.
```

---

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_ORG/spokesbot.git
cd spokesbot

# 2. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in real Supabase + OpenAI values
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
cp .env.local.example .env.local   # fill in values
npm run dev
```

Or use Docker Compose to run both services together:

```bash
cp backend/.env.example backend/.env   # fill in values
docker compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

---

## Environment Variable Reference

### Backend (Render / Docker)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o |
| `FRONTEND_URL` | Yes | Vercel domain — used in CORS `allow_origins` |
| `ENVIRONMENT` | No | `development` / `staging` / `production` (default: `development`) |
| `LOG_LEVEL` | No | `DEBUG` / `INFO` / `WARNING` / `ERROR` (default: `INFO`) |
| `RATE_LIMIT_CHAT` | No | slowapi rate limit string (default: `20/minute`) |

### Frontend (Vercel / Docker build-arg)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL (no trailing slash) |
| `NEXT_PUBLIC_APP_URL` | Yes | Frontend base URL — used in metadata/canonical |

---

## Monitoring & Health

| Endpoint | Description |
|---|---|
| `GET /health` | Returns `{"status": "ok", "environment": "..."}` — used by Render health checks and the deploy pipeline |
| `GET /metrics` | Prometheus metrics (hidden from Swagger in production) |

Render automatically restarts the service if the health check fails 3 times in a row (configured in `backend/Dockerfile` `HEALTHCHECK` directive).

---

## Rollback

**Backend:** Render dashboard → **Deploys** → select a previous deploy → **Rollback**.

**Frontend:** Vercel dashboard → **Deployments** → select a previous deployment → **Promote to Production**.

**Database:** Supabase does not auto-migrate — all migrations are additive and forward-only. If a migration needs to be reversed, write a rollback SQL script manually.

---

## GitHub Actions Secrets Checklist

Use this checklist when setting up a new environment:

- [ ] `VERCEL_TOKEN`
- [ ] `VERCEL_ORG_ID`
- [ ] `VERCEL_PROJECT_ID`
- [ ] `RENDER_DEPLOY_HOOK_URL`
- [ ] `BACKEND_HEALTH_URL`

All five must be present before the deploy pipeline can run successfully.
