# Deployment Guide: Vercel & Supabase

This guide explains how to deploy the frontend to Vercel and connect the backend to Supabase.

---

## Step 1: Set Up Supabase

### 1. Run Database Scripts
In your Supabase project dashboard, open **SQL Editor** and run these 4 SQL files in order:
1. `supabase/schema.sql` (creates tables and triggers)
2. `supabase/policies.sql` (enables Row Level Security)
3. `supabase/views.sql` (creates leaderboard and admin views)
4. `supabase/seed.sql` (inserts demo data and settings)

### 2. Copy Credentials from Supabase
In Supabase, navigate to **Project Settings** -> **API Keys** and **JWT Keys**:

| Setting on Supabase | Where to find it | Where to paste it |
| --- | --- | --- |
| **Project URL** | Click **Data API** in the left sidebar | `frontend/js/config.js` AND `backend/.env` |
| **Publishable Key** | Top section under **Publishable key** (`sb_publishable_...`) | `frontend/js/config.js` (`SUPABASE_ANON_KEY`) |
| **Secret Key** | Lower section under **Secret keys** (`sb_secret_...`) | `backend/.env` (`SUPABASE_SERVICE_ROLE_KEY`) |
| **JWT Secret** | Click **JWT Keys** in left sidebar -> select **Legacy JWT Secret** tab | `backend/.env` (`SUPABASE_JWT_SECRET`) |

### 3. Configure Auth Settings
In Supabase, navigate to **Authentication** -> **Providers** -> **Email**:
- Turn **Enable Email provider** to ON.
- Turn **Confirm email** to OFF (for immediate testing without email confirmation).

---

## Step 2: Connect Backend to Supabase

### 1. Configure `backend/.env`
Create `backend/.env` (from `backend/.env.example`) and fill in your keys:

```env
ENV=production
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-secret-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app
FLAG_PEPPER=random_secret_string_here
ACTIVE_WINDOW_MINUTES=5
STUCK_THRESHOLD_MINUTES=20
```

### 2. Run Backend
```bash
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Test connection: Open `http://localhost:8000/ctf/status` in your browser. If it returns settings JSON from Supabase, your backend is connected.

For public testing with Vercel, host your backend on a free service like Render.com (Root Directory `backend`, Start Command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`) or expose locally using `ngrok http 8000`.

---

## Step 3: Deploy Frontend to Vercel (Using GitHub)

### 1. Configure `frontend/js/config.js`
In `frontend/js/config.js`, set your credentials:

```javascript
export const CONFIG = {
  PLATFORM_NAME: "CTF Arena",
  SUPABASE_URL: "https://<your-project-ref>.supabase.co",
  SUPABASE_ANON_KEY: "<your-publishable-key>",
  API_BASE_URL: "https://<your-backend-url>", // or http://localhost:8000
  POLL_INTERVAL_LEADERBOARD_MS: 15000,
  POLL_INTERVAL_ADMIN_LIVE_MS: 10000,
  HEARTBEAT_INTERVAL_MS: 60000
};
```

### 2. Push to GitHub
```bash
git add .
git commit -m "Configure CTF Arena for deployment"
git push origin main
```

### 3. Import in Vercel
1. Log in to [https://vercel.com](https://vercel.com) and click **Add New...** -> **Project**.
2. Under **Import Git Repository**, select your repository and click **Import**.
3. In **Root Directory**, click **Edit** and select `frontend`.
4. Set **Framework Preset** to **Other**.
5. Leave **Build Command** empty (pure static site, zero build step needed).
6. Click **Deploy**.

### 4. Post-Deployment URLs
Once deployed, Vercel gives you your URL (e.g. `https://ctf-arena.vercel.app`):
1. In `backend/.env`: add your Vercel URL to `ALLOWED_ORIGINS` (`https://ctf-arena.vercel.app`).
2. In Supabase **Authentication** -> **URL Configuration**:
   - Set **Site URL** to: `https://ctf-arena.vercel.app`
   - Under **Redirect URLs**, add: `https://ctf-arena.vercel.app/**`
