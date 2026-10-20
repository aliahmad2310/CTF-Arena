# Production Deployment and Cloud Hosting Guide

This guide provides end-to-end instructions for deploying CTF Arena across modern cloud platforms without frameworks or complex build pipelines.

---

## 1. Architecture Deployment Overview

- **Frontend**: Plain static HTML/CSS/ES-Modules hosted on any edge static provider (Cloudflare Pages, Vercel, Netlify, GitHub Pages, or AWS S3 + CloudFront).
- **Backend**: Containerized Python 3.11+ FastAPI service running under Uvicorn on Render, Railway, or Fly.io.
- **Database & Identity**: Managed Supabase PostgreSQL with built-in Auth, Storage, and Row-Level Security (RLS).

---

## 2. Supabase Production Configuration

### A. Environment Provisioning
1. Sign in to [Supabase](https://supabase.com) and create a new project.
2. Note down the following values from **Project Settings > API**:
   - `Project URL` (e.g. `https://xyzproject.supabase.co`)
   - `anon public key` (Safe for browser / frontend usage)
   - `service_role secret` (Server-side ONLY; bypasses RLS)
3. Note down the `JWT Secret` from **Project Settings > API > JWT Settings**.

### B. Database Migration Execution
In the Supabase SQL Editor, execute the following SQL scripts in order:
1. `supabase/schema.sql` (Creates all tables, constraints, foreign keys, and profile trigger)
2. `supabase/policies.sql` (Applies RLS deny-by-default policies)
3. `supabase/views.sql` (Creates leaderboards, admin metrics, and timeline views)
4. `supabase/seed.sql` (Loads demo labs, challenges with salted flags, and demo data)

### C. Authentication and Redirect URLs
1. In the Supabase Dashboard, navigate to **Authentication > URL Configuration**.
2. Set **Site URL** to your production frontend URL (e.g., `https://ctf-arena.pages.dev`).
3. Add redirect URLs under **Redirect URLs**:
   - `https://ctf-arena.pages.dev/**`
   - `http://localhost:3000/**`
   - `http://127.0.0.1:8000/**`
4. Under **Authentication > Email Auth**, enable or disable email confirmation according to your competition policy. If enabled, configure custom SMTP providers (SendGrid, Resend, or AWS SES) for reliable deliverability.

### D. Private Storage Bucket Setup
1. In the Supabase Dashboard, navigate to **Storage** and create a new bucket named `challenge-files`.
2. Toggle the bucket visibility to **Private** (public downloads blocked).
3. Under Storage Policies, ensure anonymous access is denied. Challenge downloads are gated through the FastAPI backend (`GET /challenges/{id}/files/{file_id}`) which issues time-limited (60-second) signed URLs to authenticated competitors.

---

## 3. Backend Deployment

### Option A: Render (Recommended for Simplicity)
1. Sign in to [Render](https://render.com) and select **New > Web Service**.
2. Connect your Git repository.
3. Configure the service settings:
   - **Name**: `ctf-arena-api`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3` or `Docker`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
4. Under **Environment Variables**, define:
   - `SUPABASE_URL`: Your Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service_role key
   - `SUPABASE_JWT_SECRET`: Your Supabase JWT secret
   - `FLAG_PEPPER`: A long random secret string (e.g. 64 hex characters)
   - `ALLOWED_ORIGINS`: Your production frontend domain (e.g. `https://ctf-arena.pages.dev`)
   - `ACTIVE_WINDOW_MINUTES`: `5`
   - `STUCK_THRESHOLD_MINUTES`: `20`
   - `ENV`: `production`
5. Click **Create Web Service**. Note the assigned URL (e.g., `https://ctf-arena-api.onrender.com`).

### Option B: Railway
1. Sign in to [Railway](https://railway.app) and create a **New Project > Deploy from GitHub repo**.
2. In the project settings, set the **Root Directory** to `/backend`.
3. Railway automatically detects `Dockerfile` or `requirements.txt`.
4. Under **Variables**, add the required environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ALLOWED_ORIGINS`, `FLAG_PEPPER`, `ENV=production`).
5. Under **Settings > Networking**, click **Generate Domain** to get your public API endpoint.

### Option C: Fly.io
1. Install the `flyctl` CLI tool and authenticate with `fly auth login`.
2. In the `backend/` directory, launch the app:
   ```bash
   fly launch --no-deploy
   ```
3. Set production secrets via CLI:
   ```bash
   fly secrets set SUPABASE_URL="https://your-project.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
     SUPABASE_JWT_SECRET="your-jwt-secret" \
     FLAG_PEPPER="your-secure-pepper" \
     ALLOWED_ORIGINS="https://ctf-arena.pages.dev" \
     ENV="production"
   ```
4. Deploy the application:
   ```bash
   fly deploy
   ```

---

## 4. Frontend Deployment

Because the frontend is built entirely using vanilla HTML, CSS, and native ES modules with zero build steps or bundlers, it can be deployed directly from the `frontend/` directory.

### Step 1: Configure Frontend Runtime (`js/config.js`)
Ensure `frontend/js/config.js` points to your production backend and public Supabase keys:
```javascript
export const CONFIG = {
  PLATFORM_NAME: "CTF Arena",
  API_BASE_URL: "https://ctf-arena-api.onrender.com",
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-public-anon-key",
  HEARTBEAT_INTERVAL_MS: 60000,
  POLL_INTERVAL_LEADERBOARD_MS: 15000,
  POLL_INTERVAL_ADMIN_LIVE_MS: 10000
};
```

### Option A: Cloudflare Pages (Recommended)
1. Connect your Git repository in the Cloudflare Dashboard under **Workers & Pages > Create application > Pages**.
2. Configure build settings:
   - **Build command**: (Leave empty)
   - **Build output directory**: `frontend`
3. Click **Save and Deploy**. Cloudflare serves your application globally across edge data centers with free SSL.

### Option B: Vercel
1. In Vercel, click **Add New > Project** and import the repository.
2. Under **Root Directory**, click Edit and select `frontend`.
3. Under **Framework Preset**, select **Other**.
4. Click **Deploy**.

### Option C: Netlify
1. Select **Add new site > Import an existing project**.
2. Set **Base directory** to `frontend`.
3. Leave **Build command** blank and set **Publish directory** to `.`.
4. Click **Deploy site**.

---

## 5. Post-Deployment Verification Checklist

1. **System Health Probe**:
   Visit `https://your-api-domain/health` in your browser. It must return:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-10-20T...",
     "version": "1.0.0",
     "supabase_connected": true,
     "active_window_minutes": 5
   }
   ```
2. **Interactive API Documentation**:
   Navigate to `https://your-api-domain/docs` and confirm Swagger UI loads all endpoints cleanly.
3. **Frontend Connectivity**:
   Open your deployed frontend URL. Verify the navigation bar loads, the competition countdown displays, and the top-5 scoreboard loads without CORS errors in the browser console.
4. **Competitor Registration & Heartbeat**:
   Register a new test account, verify that a `profiles` row is created, and check network activity for 60-second `/me/heartbeat` requests updating `last_seen_at`.
5. **Initial Administrator Promotion**:
   In the Supabase SQL Editor, promote your initial administrative user:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE username = 'your_username';
   ```
   Navigate to `/admin/monitor.html` and verify live telemetry, cohort charts, and alerts load without permission errors.
