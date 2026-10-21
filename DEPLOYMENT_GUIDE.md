# Deploy CTF Arena on Vercel

This repository deploys as **two Vercel projects**: one serves the static HTML/CSS/JavaScript frontend, and one runs the FastAPI backend as a Python Function. They can use separate Vercel domains; the frontend calls the backend URL configured in `frontend/js/config.js`. Supabase remains the database, authentication, and storage service.

Do not configure the repository root as a single Vercel project. Select `frontend` as the frontend project's Root Directory and `backend` as the backend project's Root Directory. Each directory contains its own Vercel configuration.

## Important: rotate exposed credentials before deployment

The repository previously tracked `backend/.env` and contained real backend credentials. It is now ignored and untracked in the current Git index, and `backend/.env.example` contains placeholders. Removing it from the latest commit does not erase it from earlier Git history or copies. Before production deployment, rotate the Supabase service-role/secret key and JWT signing secret, create a new random `FLAG_PEPPER`, update the local environment and Vercel environment variables, and invalidate old credentials. If the repository was pushed, treat the old credentials as compromised; consider rewriting repository history and coordinate the rewrite with all collaborators. Never paste the service-role key, JWT secret, or pepper into frontend files, source control, or chat.

The Supabase publishable/anon key is intended for browser use. It is not a substitute for Row Level Security and is not the service-role key.

## 1. Prepare Supabase

1. Create or select a Supabase project. Keep its database password in a password manager.
2. In the Supabase SQL Editor, run the repository scripts in order:
  1. `supabase/schema.sql`
  2. `supabase/policies.sql`
  3. `supabase/views.sql`
  4. `supabase/seed.sql` (review and remove demo data before production)
3. In **Project Settings**, copy the Project URL and publishable/anon key for the frontend. Obtain a newly rotated server-side secret key and the JWT signing secret for the backend.
4. Configure **Authentication** -> **URL Configuration**. Set the Site URL to the final frontend domain after it is assigned, and add that domain's callback URLs. Configure email confirmation and SMTP for the intended production behavior.
5. Create the private challenge-file Storage bucket and its policies if the application uses uploads.
6. Create or promote the first admin using the repository's documented database procedure. Do not seed real accounts with known passwords.

## 2. Deploy the FastAPI backend

1. Push the project to a Git provider connected to Vercel. In Vercel, select **Add New** -> **Project** and import the repository.
2. Configure the backend project:
  - **Root Directory:** `backend` (enable including files outside the root directory only if Vercel asks; this backend does not require root-level application imports).
  - **Framework Preset:** FastAPI if detected; otherwise **Other**. Vercel detects the Python app from `requirements.txt` and `app/main.py`.
  - Leave the Build Command and Output Directory at their detected/default values; this backend is a Python Function, not a static output.
  - The project uses Python 3.12 via `backend/.python-version` and `backend/vercel.json` excludes tests from the function bundle.
3. Under **Settings** -> **Environment Variables**, add these values to **Production** (and Preview only if you intend to test preview deployments):

  | Name | Value |
  | --- | --- |
  | `ENV` | `production` |
  | `SUPABASE_URL` | Your Supabase Project URL |
  | `SUPABASE_ANON_KEY` | Optional override for the public publishable key already configured as the backend fallback |
  | `SUPABASE_SERVICE_ROLE_KEY` | The newly rotated server-side secret key |
  | `SUPABASE_JWT_SECRET` | The newly rotated JWT signing secret expected by the API |
  | `FLAG_PEPPER` | A new, long, randomly generated secret; keep it stable after flags are created |
  | `ACTIVE_WINDOW_MINUTES` | `5` unless intentionally customized |
  | `STUCK_THRESHOLD_MINUTES` | `20` unless intentionally customized |
  | `ALLOWED_ORIGINS` | `http://localhost:3000` initially; replace/add the exact frontend origin after creating the frontend project |

  Use comma-separated exact origins for `ALLOWED_ORIGINS`, with no path or trailing slash, for example `https://your-frontend.vercel.app`. Do not use `https://*.vercel.app`; the backend config uses an explicit origin allowlist, not a wildcard matcher. Include local origins only if needed. Do not put secrets in the `ALLOWED_ORIGINS` value.
4. Deploy. Copy the assigned backend domain, such as `https://your-api.vercel.app`. The backend uses the public publishable key fallback from its config, so adding `SUPABASE_ANON_KEY` to Vercel is optional. Set it only if you need to override that key.
5. Check `https://your-api.vercel.app/health`. A healthy JSON response confirms the FastAPI function starts. Check `/docs` to confirm API routes load. `/health` alone does not verify Supabase credentials or database access; also check `/ctf/status` and a protected endpoint using a valid session.

## 3. Deploy the static frontend

1. Before deployment, edit `frontend/js/config.js` and set:
  - `SUPABASE_URL` to the Supabase Project URL.
  - `SUPABASE_ANON_KEY` to the publishable/anon key.
  - `API_BASE_URL` to the backend's HTTPS origin, for example `https://your-api.vercel.app` (no trailing slash).
2. These are static JavaScript settings, not Vercel build-time environment variables. The frontend has no build step, so adding values in Vercel's Environment Variables will not replace values in this file. The Supabase URL, publishable key, and API URL are public client configuration; never place backend secrets here.
3. In Vercel, create a second project from the same Git repository:
  - **Root Directory:** `frontend`.
  - **Framework Preset:** **Other**.
  - Leave Build Command and Output Directory empty/default; the project serves the existing HTML, CSS, and ES modules directly.
  - `frontend/vercel.json` enables clean URLs and response security headers.
4. Deploy and assign a stable production domain, for example `https://your-frontend.vercel.app`. Confirm that the homepage and direct links such as `/login`, `/labs`, and `/admin/monitor` load after a hard refresh.

## 4. Connect CORS and Supabase Auth

1. In the backend Vercel project, set `ALLOWED_ORIGINS` to the exact production frontend origin (scheme and hostname only), plus any specific additional origins you trust. Redeploy the backend after changing the variable.
2. In Supabase **Authentication** -> **URL Configuration**, set the Site URL to the frontend domain and add the appropriate frontend callback/redirect URLs.
3. If using Vercel Preview deployments, add each allowed preview origin explicitly or use a stable preview domain. Do not allow every `vercel.app` subdomain in production.
4. For a custom domain, update `ALLOWED_ORIGINS`, Supabase redirect settings, and `frontend/js/config.js` as necessary, then redeploy both projects.

## 5. Verify the deployment

1. Open the backend `/health`, `/docs`, and `/ctf/status` URLs.
2. Open the frontend and use browser developer tools to check that API requests target the backend domain, use HTTPS, and do not fail with CORS errors.
3. Test signup/signin, session refresh, a public labs/leaderboard request, and a protected request. Verify invalid/expired tokens are rejected.
4. Verify the production Supabase RLS policies, private Storage access, admin authorization, and that flag hashes, service-role credentials, JWT secrets, and invite codes are never returned to unauthorized clients.
5. Check Vercel **Logs** for function import errors, missing environment variables, timeout errors, and Supabase connection failures.

## Local development

Create `backend/.env` locally from `backend/.env.example` and fill it with development credentials. The file is ignored by Git; do not commit it. From the repository root, install dependencies and start the API:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install -r backend/requirements.txt
Set-Location backend
uvicorn app.main:app --reload --port 8000
```

Set the frontend `API_BASE_URL` to `http://localhost:8000` for local use. Serve the static frontend with a local HTTP server from the `frontend` directory; do not open its HTML files directly using `file://` because ES modules and browser authentication require an HTTP origin.

```powershell
Set-Location ..\frontend
python -m http.server 3000
```

## Vercel-specific limits and operational notes

- Vercel runs the FastAPI app as serverless functions. Do not rely on local files persisting, in-process background jobs, or a process staying alive between requests. Store persistent files in Supabase Storage and schedule durable background work using an external service.
- The current SlowAPI limiter uses in-process memory. Serverless instances do not share that memory, so its limits are not globally consistent across instances. For a public CTF deployment, use a shared rate-limit store or an upstream distributed limiter, and verify abuse limits before opening flag submissions to the internet.
- Function duration, memory, and package-size limits depend on the Vercel plan. The API uses synchronous Supabase client operations; test representative requests and monitor function duration and logs.
- The frontend and backend are independent projects and deployments. Frontend static config changes require a frontend redeployment; backend environment variable changes require a backend redeployment.
- The Vercel-hosted backend is an alternative to a long-running host such as Render, Railway, or Fly.io. If the project needs persistent workers or stronger shared rate limiting, keep the frontend on Vercel and deploy the backend to one of those services instead.
