# Deployment Guide — Crop Price Tracker

This guide covers deploying the Crop Price Tracker to a free online server using **Render**.

## Architecture

```
Frontend (React) ──HTTP──▶ Backend (Django/Gunicorn) ──▶ Neon PostgreSQL
                         served as static files     (free tier)
```

## Prerequisites

1. A **GitHub** account
2. A **Render** account (free at [render.com](https://render.com))
3. Your **Neon** database credentials (already in `.env`)

## Step 1: Push Code to GitHub

```bash
git init
git add .
git commit -m "Initial commit with deployment setup"
git remote add origin <your-repo-url>
git push -u origin main
```

## Step 2: Deploy to Render

1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `crop-price-tracker`
   - **Region**: Oregon (US West) or closest to you
   - **Branch**: `main`
   - **Runtime**: `Docker`
   - **Plan**: `Free`
5. Under **Environment**, add these variables (match your `.env` values):

| Key | Value |
|-----|-------|
| `DJANGO_SECRET_KEY` | Your secret key |
| `DJANGO_DEBUG` | `false` |
| `USE_POSTGRES` | `true` |
| `DB_NAME` | `neondb` |
| `DB_USER` | `neondb_owner` |
| `DB_PASSWORD` | Your Neon password |
| `DB_HOST` | Your Neon host |
| `DB_PORT` | `5432` |
| `ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` |
| `CSRF_TRUSTED_ORIGINS` | `https://*.onrender.com` |
| `RUN_NOTIFICATION_ENGINE_SKIP` | `1` |
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` |

6. Click **Create Web Service**
7. Render will build the Docker image and deploy

## Key Fixes Applied

- **API base URL**: Changed from `http://${hostname}:8000/api` to `/api` (relative) so the frontend works correctly when served from the same origin as the backend
- **Production security**: Added `DEBUG=false`, `CSRF_TRUSTED_ORIGINS`, `SECURE_PROXY_SSL_HEADER`, and secure cookie settings
- **Health check**: Added `/api/health/` endpoint for Render uptime monitoring
- **SPA routing**: Added catch-all route so React Router works on page refresh

## Step 3: Verify Deployment

Once deployed, Render will give you a URL like `https://crop-price-tracker.onrender.com`. Visit it to confirm the app works.

## Local Production Testing

Test the production build locally before deploying:

```bash
# Build the React frontend
cd frontend && npm run build

# Run Django with production settings
cd ..
pip install -r requirements.txt
python manage.py collectstatic --noinput
gunicorn --bind 0.0.0.0:8000 --workers 3 backend.wsgi:application
```

Or use Docker Compose:

```bash
docker-compose up --build
```

## Important Notes

- **Neon Database**: The free Neon tier has a connection limit. If you hit issues, reduce `CONN_MAX_AGE` or use connection pooling.
- **Static Files**: `whitenoise` handles static file serving. No separate CDN needed for the free tier.
- **Notifications**: Background schedulers are disabled in production (`RUN_NOTIFICATION_ENGINE_SKIP=1`). Enable them when ready.
- **Email**: Uses console backend by default. Configure SMTP for real email delivery.
- **Build Size**: The Docker image includes Node.js and Python dependencies. First deploy may take 5-10 minutes.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails on npm install | Check `frontend/package.json` exists and is valid |
| Database connection error | Verify Neon credentials in Render environment variables |
| 404 on page refresh | Ensure the SPA catch-all route is in `backend/urls.py` |
| Static files not loading | Check `STATIC_ROOT` and `whitenoise` middleware order |
| API calls fail (404/CORS) | Verify `API_BASE` in `frontend/src/services/api.js` is `/api` (relative) |
| App crashes on startup | Check Render logs for Python import errors |
| Mixed content errors | Ensure `API_BASE` uses relative paths, not `http://hostname:8000` |

## Alternative Free Platforms

- **Railway** ([railway.app](https://railway.app)) — Similar to Render, free tier with $5 credit/month
- **Fly.io** ([fly.io](https://fly.io)) — Free tier, requires CLI setup
- **PythonAnywhere** ([pythonanywhere.com](https://pythonanywhere.com)) — Free tier for Django, limited to 1 worker
- **Vercel + Render** — Deploy React frontend to Vercel (free), Django backend to Render (free)