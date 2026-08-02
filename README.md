# Smart Crops — Mazao Mahiri Market Price Tracker

A comprehensive Tanzanian agricultural market intelligence system that tracks real-time crop prices across regions, provides price forecasting, transport cost optimization, market matching, cooperative management, multi-language support, and multi-channel notifications.

---

## Table of Contents

- [System Overview](#system-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [API Reference](#api-reference)
- [Authentication & User Roles](#authentication--user-roles)
- [All Features](#all-features)
- [Data Scraping Pipeline](#data-scraping-pipeline)
- [Notification System](#notification-system)
- [Forecasting Engine](#forecasting-engine)
- [Transport Engine](#transport-engine)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## System Overview

Smart Crops is a full-stack agricultural marketplace platform designed for Tanzanian farmers, traders, and market agents. It provides:

- **Real-time crop price tracking** across Tanzanian markets with historical data
- **Price forecasting** using ARIMA, exponential smoothing, and linear regression models
- **Transport cost optimization** with Dijkstra's shortest path on Tanzania's regional road network
- **Multi-channel notifications** via WhatsApp, SMS, email, and in-app alerts
- **Farmer intelligence** — best market finder, sell timing advisor, transport calculator
- **Trader intelligence** — cross-region arbitrage analysis, supply tracking
- **Agent management** — price submission workflow with anomaly detection and review pipeline
- **Market matching** — connect buyers and sellers
- **Cooperative management** — farmer group creation and membership
- **Multi-language support** — Swahili and English with a translation microservice
- **Offline-first** — service worker caching for unreliable connectivity
- **Role-based dashboards** tailored for farmers, traders, agents, and admins

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Django 4.2+, Django REST Framework, Token Authentication |
| **Frontend** | React 19 (Create React App), React Router v7, Recharts, Leaflet, Axios |
| **Translation** | Express.js microservice (port 3001) |
| **Database** | SQLite (development) / PostgreSQL on Neon (production) |
| **ORM** | Django ORM (primary) + Prisma (Supabase mirror) |
| **Notification** | Notify Africa API (WhatsApp + SMS) |
| **Forecasting** | statsmodels (ARIMA), numpy (linear regression) |
| **Scheduling** | Python threading (in-process) + Windows Task Scheduler |
| **Scraping** | pdfplumber, BeautifulSoup, requests |
| **Auth** | Email/password, Google OAuth, Magic Link, Phone OTP |

---

## Prerequisites

- **Python** 3.10+ ([download](https://www.python.org/downloads/))
- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** (ships with Node.js)
- **Git** ([download](https://git-scm.com/))

---

## Quick Start

### 1. Clone the project

```bash
git clone https://github.com/Pabioh/crop-price-tracker.git
cd crop-price-tracker
```

### 2. Backend — Python virtual environment

```bash
# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Mac / Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Frontend & services — Node dependencies

```bash
# Root level (Prisma + dev tools)
npm install

# Frontend
cd frontend
npm install
cd ..

# Translation server
cd translation-server
npm install
cd ..
```

### 4. Environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for all options. For local development, most can be left blank — the app defaults to SQLite and console email.

### 5. Database migrations

```bash
python manage.py migrate
```

### 6. Start the project

Run all three services together:

```bash
npm run dev
```

Or start each service in separate terminals:

```bash
# Terminal 1 — Django backend (port 8000)
python manage.py runserver 8000

# Terminal 2 — React frontend (port 3000)
cd frontend && npm start

# Terminal 3 — Translation server (port 3001)
cd translation-server && npm start
```

Open **http://localhost:3000** in your browser.

---

## Project Structure

```
crop-price-tracker/
│
├── backend/                     # Django configuration
│   ├── settings.py              # Django settings (DB, auth, CORS, email)
│   ├── urls.py                  # Root URL config (/admin/, /api/)
│   ├── wsgi.py / asgi.py        # WSGI/ASGI entry points
│   └── ...
│
├── prices/                      # Main Django app (~50+ API endpoints)
│   ├── models.py                # 22 models — UserProfile, PriceEntry, etc.
│   ├── views.py                 # ~55 API views (all function-based)
│   ├── serializers.py           # DRF serializers
│   ├── urls.py                  # 100+ URL patterns
│   ├── utils.py                 # Anomaly detection (Z-score + IQR)
│   ├── forecasting.py           # ARIMA / Exponential Smoothing / Linear Regression
│   ├── transport_engine.py      # Dijkstra on region graph, 4 transport modes
│   ├── notification_channels.py # Notify Africa (WhatsApp + SMS)
│   ├── notification_scheduler.py# In-process threading scheduler
│   ├── reports.py               # CSV / Excel / PDF report generation
│   ├── admin.py                 # Django admin config
│   ├── management/commands/     # 12 management commands
│   │   ├── run_notification_engine.py
│   │   ├── sync_all_data.py
│   │   ├── sync_weather.py
│   │   ├── seed_data.py
│   │   ├── seed_crop_calendar.py
│   │   ├── seed_transport_network.py
│   │   ├── import_scraped_prices.py
│   │   ├── import_kilimo_data.py
│   │   ├── sync_kilimo.py
│   │   ├── create_demo_accounts.py
│   │   └── migrate_to_supabase.py
│   └── migrations/              # 20+ database migrations
│
├── frontend/                    # React application
│   ├── src/
│   │   ├── pages/               # 30+ page components
│   │   ├── components/          # Reusable UI components
│   │   ├── services/            # API, Auth, Data, i18n, offline
│   │   ├── App.js               # 52+ lazy-loaded routes
│   │   └── index.js             # Entry point
│   ├── public/                  # Static assets, service worker
│   └── package.json
│
├── translation-server/          # Express microservice for translations
│   ├── server.js                # POST /api/translate-batch
│   ├── translate.js             # 3 providers: free, google, DeepL
│   └── package.json
│
├── kilimo_pdfs/                 # Data scraping system
│   ├── scrape_kilimo.py         # Scrape Kilimo.go.tz weekly bulletins
│   ├── scrape_all.py            # Master orchestrator (Kilimo + Viwanda)
│   ├── scrape_nbs.py            # National Bureau of Statistics
│   ├── scrape_crop_boards.py    # 5 crop board websites
│   ├── pdfs/                    # 80+ downloaded market bulletins
│   ├── crop_board_data/         # Per-board JSON data
│   └── all_crop_data.json       # Consolidated extraction
│
├── prisma/                      # Prisma schema (Supabase mirror)
│   ├── schema.prisma            # Mirrors Django models
│   └── .env
│
├── manage.py                    # Django management entry point
├── requirements.txt             # Python dependencies (8 packages)
├── package.json                 # Root npm scripts
├── .env.example                 # Environment template
├── notification_cron_setup.ps1  # Windows scheduled task installer
├── notification_cron.bat         # Windows batch wrapper
├── notification_cron.sh         # Linux cron wrapper
├── supabase_schema.sql          # PostgreSQL DDL
├── supabase_schema_notifications.sql
└── migrate_to_neon.py           # SQLite → Neon migration script
```

---

## Backend Architecture

### Models (22 models in `prices/models.py`)

| Model | Purpose | Key Fields |
|---|---|---|
| **UserProfile** | Extended user with role-specific fields (50+ fields) | role (admin/agent/trader/farmer/general), approval_status, auth_provider, locked_until, farmer fields (main_crops, farm_size, preferred_markets, cooperative, mobile_money), trader fields (business_name, TIN, BRELA, operating_regions, transport_capacity, export_license), agent fields (assigned_market, id_verification, authority, commission) |
| **MagicLink** | Passwordless email login | email, token (48-char), expires_at, used |
| **PhoneVerification** | Phone OTP verification | phone, code (6-digit), expires_at, attempts (max 5), last_channel |
| **Region** | Tanzanian geographic regions | name, zone |
| **Market** | Physical crop markets | name, region (FK), district, market_type (daily/periodic/wholesale/mixed), is_active |
| **Crop** | Tracked crop types | name, category (grain/legume/vegetable/fruit/cash/root/spice), unit |
| **PriceEntry** | Price submissions with anomaly detection | crop (FK), market (FK), price (TZS), quantity, submitted_by (FK), price_date, is_anomaly, anomaly_score, status (pending/approved/rejected/flagged), latitude, longitude |
| **MarketAgentSubmission** | Agent submission lifecycle tracking | price_entry (OneToOne), agent (FK), status (published/under_review/flagged/live), per-status timestamps |
| **TransportRoute** | Market-to-market transport | origin/destination (FK Market), distance_km, base_cost_tzs, cost_per_kg, vehicle_costs, road_quality, is_seasonal |
| **RegionRoute** | Inter-region road graph edges | from_region/to_region (FK Region), distance_km, road_type (trunk/regional/district), corridor, road_condition, avg_speed_kmh, is_bidirectional |
| **PricingRule** | Vehicle pricing rules | vehicle_type (truck/bus/pickup/motorcycle/bicycle), base_rate_per_km, min_charge, large_cargo_discount |
| **PriceAlert** | User-defined price alerts | user (FK), crop (FK), alert_type (price_drop/price_rise/above_threshold/below_threshold), threshold_price, pct_change, status (active/triggered/expired/cancelled) |
| **MarketMatch** | Buy/sell listings | user (FK), match_type (buy/sell), crop (FK), quantity_kg, target_price, status (active/fulfilled/expired/cancelled) |
| **Cooperative** | Farmer cooperatives | name, region, description, founded_year, member_count |
| **CooperativeMembership** | Join table | cooperative (FK), user (FK), role (member/admin/chairperson) |
| **UserPreferences** | Notification & display preferences | user (OneToOne), price_alerts, market_updates, sms_notifications, email_notifications, language, notifications_enabled, opportunity_alerts, transport_alerts, personalized_alerts |
| **Notification** | In-app notifications with delivery tracking | user (FK), type (price_alert/opportunity/transport/system), priority (high/medium/low), title, message, read, sms_sent, whatsapp_sent, delivery_attempted, dedup (2h window) |
| **CropCalendar** | Planting/harvest seasons | crop (FK), region (FK), season_name, planting_start/end (month 1-12), harvest_start/end, notes |
| **SyncSource** | External data source config | name, slug, scraper_command, update_interval_seconds, is_active, last_sync_at, last_status |
| **SyncLog** | Sync run audit log | source (FK), started_at, finished_at, status, items_found/imported/skipped, error_message, details (JSON) |
| **WeatherData** | Daily weather from Open-Meteo | region (FK), date, temp_max/min, precipitation, humidity, wind_speed, weather_code |
| **LoginAttempt** | Security audit log | user (FK), username, ip_address, timestamp, success, attempt_method |

### API Endpoints (100+ patterns in `prices/urls.py`)

All endpoints are function-based views using `@api_view` decorators. See [API Reference](#api-reference) for the complete list organized by module.

### Authentication Flow

The system supports 5 authentication methods:

1. **Email/Password** — Standard Django auth with account lockout (5 failed attempts → 15 min lock)
2. **Google OAuth** — Supports ID token (frontend Sign-In button) or authorization code (redirect flow), auto-creates user
3. **Magic Link** — Rate-limited (1 per 2 min), 48-char token, 15 min expiry, emailed as `<FRONTEND_URL>/auth/callback?token=...`
4. **Phone OTP** — Normalizes to +255, sends via Notify Africa (WhatsApp first, SMS fallback), max 5 attempts
5. **Onboarding Flow** — Passwordless auth creates empty profile → user completes role + profile data → email verification → full access

---

## Frontend Architecture

### Routing (`frontend/src/App.js`)

52+ lazy-loaded routes with 5 guard components:
- `ProtectedRoute` — Requires authentication
- `CanSubmitRoute` — Admin/agent only
- `CanReviewRoute` — Review permissions
- `AdminRoute` — Admin only
- `RoleRoute` — Role-specific access

Includes `lazyWithRetry()` (3 retries) and `ChunkErrorBoundary` for chunk loading failures.

### Pages (30+)

| Route | Page | Description |
|---|---|---|
| `/` | Landing | Public landing page |
| `/login` / `/register` | AuthScreen / Register | Authentication |
| `/prices` | MarketPrices | Browse crop prices with filters |
| `/prices/heatmap` | PriceHeatmap | Regional price heatmap |
| `/prices/chart` | CandlestickChart | OHLC candlestick charts |
| `/dashboard` | Dashboard | Role-based dashboard |
| `/forecast` | Forecasting | Price forecasts |
| `/submit` | SubmitPrice | Submit price data (agent/admin) |
| `/anomalies` | Anomalies | View flagged price anomalies |
| `/reviews` | Reviews | Review pending submissions |
| `/recommendations` | Recommendations | Personalized recommendations |
| `/reports` | Reports | Generate CSV/Excel/PDF reports |
| `/search` | Search | Full-text search across crops/markets/regions |
| `/admin/users` | AdminUsers | User management (admin) |
| `/settings` | Settings | User preferences |
| `/edit-profile` | EditProfile | Profile editing |
| `/onboarding` | Onboarding | First-time setup |
| `/verify-email` | EmailVerification | Email verification |

**Farmer routes**: `/farmer/dashboard`, `/farmer/prices`, `/farmer/best-market`, `/farmer/farm`, `/farmer/timing`, `/farmer/cooperative`, `/farmer/analytics`, `/farmer/trends`, `/farmer/forecast`, `/farmer/transport`, `/farmer/alerts`

**Trader routes**: `/trader/dashboard`, `/trader/spread`, `/trader/spread/live`, `/trader/spread/opportunities`, `/trader/supply`, `/trader/forecast/7day`, `/trader/forecast/30day`, `/trader/tools`, `/trader/intelligence`, `/trader/anomalies`, `/trader/alerts`

**Agent routes**: `/agent/dashboard`, `/agent/submit`, `/agent/submissions`, `/agent/submissions/today`, `/agent/submissions/flagged`, `/agent/market`, `/agent/matches`, `/agent/performance`, `/agent/forecast`, `/agent/alerts`

### Services (`frontend/src/services/`)

| Service | Purpose |
|---|---|
| `AuthContext.js` | Auth state management, token persistence, all auth API calls |
| `DataContext.js` | Reference data cache (regions, markets, crops) with fallback hooks |
| `api.js` | Axios client with token interceptor, 16 API modules |
| `i18n/LanguageContext.js` | Language state (en/sw), toggle function |
| `i18n/translate.js` | DOM-walking translation engine, 200+ Swahili/English entries, MutationObserver |
| `offlineStorage.js` | localStorage persistence with timestamps (`sc-` prefix) |
| `networkStatus.js` | Online/offline detection, auto-sync on reconnect |

### Components (`frontend/src/components/`)

| Component | Description |
|---|---|
| Header.js | Role-based navigation shell with Outlet |
| NotificationBell.jsx | Notification panel with filter tabs (All/Unread/Price/Opportunity), priority toasts, time grouping |
| PriceAlertManager.jsx | Reusable alert CRUD in compact and full modes |
| OfflineIndicator.jsx | Offline status banner |
| MarketMap.jsx | Interactive Tanzanian map with Leaflet |
| WeatherWidget.jsx | Current weather and forecast widget |
| TanzaniaTransportMap.jsx | Transport route visualization |
| LanguageSwitcher.jsx | Swahili/English toggle |

---

## API Reference

### Authentication (25 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register/` | Register with role-specific fields |
| POST | `/api/auth/login/` | Login (tracks lockout, logs attempts) |
| POST | `/api/auth/logout/` | Delete auth token |
| GET | `/api/auth/me/` | Current user with profile |
| POST | `/api/auth/delete-account/` | Delete account (password required) |
| POST | `/api/auth/change-password/` | Change password (min 8 chars) |
| POST | `/api/auth/forgot-password/` | Send password reset email |
| POST | `/api/auth/reset-password/` | Reset with uid+token |
| POST | `/api/auth/send-verification/` | Send 6-digit email verification code |
| POST | `/api/auth/verify-email/` | Verify email code (15 min expiry) |
| POST | `/api/auth/resend-verification/` | Resend verification code |
| PATCH | `/api/auth/profile/` | Update 30+ profile fields |
| GET/PATCH | `/api/auth/preferences/` | Notification preferences |
| POST | `/api/auth/magic-link/send/` | Send passwordless login link (rate-limited) |
| POST | `/api/auth/magic-link/verify/` | Verify magic link token |
| POST | `/api/auth/phone/send-code/` | Send phone OTP via WhatsApp/SMS |
| POST | `/api/auth/phone/verify/` | Verify phone OTP |
| POST | `/api/auth/google/` | Google OAuth (ID token or auth code) |
| POST | `/api/auth/complete-onboarding/` | Set role + profile data after first login |
| GET | `/api/auth/login-history/` | Last 20 login attempts |
| GET | `/api/auth/account-status/` | Lock state, failed attempts, verification status |
| GET | `/api/admin/users/` | List all users (admin) |
| PATCH | `/api/admin/users/<id>/` | Update user role/status (admin) |

### Reference Data (4 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/regions/` | All regions with market counts |
| GET | `/api/markets/` | Active markets (optional region filter) |
| GET | `/api/crops/` | All crops (optional category filter) |
| GET | `/api/region-crops/` | Crops with price data in a region |

### Prices (7 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prices/` | Filtered prices (crop/market/region/date range, latest 200) |
| POST | `/api/prices/submit/` | Submit price (agent/admin, runs anomaly detection) |
| DELETE | `/api/prices/<id>/` | Delete price entry (admin) |
| GET | `/api/prices/segments/<crop_id>/` | Low/Medium/High price segmentation |
| GET | `/api/prices/ohlc/` | OHLC candlestick with moving averages |
| GET | `/api/prices/heatmap/` | Region x Crop price heatmap |
| GET | `/api/prices/forecast/` | Enhanced forecasts for lightweight-charts |

### Forecasting (2 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/forecast/<crop_id>/` | Full forecast (all markets) |
| GET | `/api/forecast/<crop_id>/<market_id>/` | Forecast for specific market |

### Anomalies & Reviews (3 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/anomalies/` | All anomalous entries with weather context |
| GET | `/api/reviews/` | Pending/flagged entries |
| POST | `/api/reviews/<id>/` | Approve or reject with note |

### Agent Management (2 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agents/pending/` | Pending agent registrations |
| POST | `/api/agents/<user_id>/approve/` | Approve or reject agent |

### Agent Submissions (3 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agent/submissions/` | List submissions (filtered by status) |
| GET | `/api/agent/stats/` | Submission stats (counts, accuracy, daily/weekly) |
| PATCH | `/api/agent/submission/<id>/note/` | Update notes; admin can change status |

### Farmer Intelligence (7 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/best-market/` | Rank markets by net price (price minus transport) |
| GET | `/api/transport-cost/` | Between-market transport cost with vehicle type |
| GET/POST | `/api/calculate-transport/` | Full logistics engine (Dijkstra shortest path) |
| GET/POST | `/api/multi-stage-transport/` | 5-stage farm-to-market journey |
| GET | `/api/transport-routes/` | All region-to-region routes |
| GET | `/api/pricing-rules/` | Vehicle pricing rules |
| GET | `/api/sell-advisor/` | Moving-average-based sell timing |

### Trader Intelligence (2 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/spread-analysis/` | Cross-region arbitrage with transport-adjusted spread |
| GET | `/api/supply-tracker/` | Per-region supply (surplus/deficit/neutral) |

### Recommendations (1 endpoint)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recommendations/` | Personalized per role (farmer/trader/agent/admin) |

### Dashboard (1 endpoint)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/` | Role-based dashboard stats |

### Price Alerts (4 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/alerts/` | User's alerts |
| POST | `/api/alerts/create/` | Create alert (threshold or pct_change) |
| DELETE | `/api/alerts/<id>/` | Delete alert |
| GET | `/api/alerts/check/` | Check all active alerts against latest prices |

### Cooperatives (5 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cooperatives/` | All cooperatives |
| POST | `/api/cooperatives/create/` | Create (auto-joins as chairperson) |
| GET | `/api/cooperatives/my/` | User's cooperatives |
| POST | `/api/cooperatives/<id>/join/` | Join cooperative |
| POST | `/api/cooperatives/<id>/leave/` | Leave cooperative |

### Market Matches (4 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/matches/` | Active buy/sell listings with filters |
| POST | `/api/matches/create/` | Create buy/sell offer |
| GET | `/api/matches/my/` | User's matches |
| POST | `/api/matches/<id>/cancel/` | Cancel match |

### Notifications (6 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications/` | Paginated, filterable by type/read |
| GET | `/api/notifications/summary/` | Unread count + latest high-priority |
| POST | `/api/notifications/mark-all-read/` | Mark all read |
| POST | `/api/notifications/create/` | Admin creates notification |
| POST | `/api/notifications/seed-demo/` | Seed sample notifications for testing |
| PATCH | `/api/notifications/<id>/read/` | Mark single as read |

### Reports (1 endpoint)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports/<fmt>/` | Generate CSV/Excel/PDF/summary |

### Weather (2 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/weather/` | Weather with human-readable labels |
| GET | `/api/weather/alert/` | Extreme weather warnings |

### Search (1 endpoint)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/search/` | Full-text across crops, markets, regions, prices |

---

## Authentication & User Roles

### Role System

| Role | Permissions | Use Case |
|---|---|---|
| **farmer** | View prices, forecasts, transport costs, sell advisor, cooperatives, alerts | Smallholder and commercial farmers |
| **trader** | Spread analysis, supply tracker, market matching, advanced forecasts | Agricultural traders and aggregators |
| **agent** | Submit prices (pending → reviewed → published), view submissions | Field data collectors |
| **admin** | Approve agents, review prices, manage users, manage all data | System administrators |
| **general** | Basic view-only access | General public |

### Authentication Methods

1. **Email/Password** — Standard registration with profile fields, optional
2. **Google OAuth** — One-click with ID token or authorization code
3. **Magic Link** — Passwordless email link (15 min expiry)
4. **Phone OTP** — WhatsApp/SMS verification (+255 phone numbers)

### Account Security

- **Lockout**: 5 consecutive failed logins → 15-minute lock
- **Login audit**: All attempts logged with IP and method
- **Rate limiting**: Verification codes (2 min), magic links (2 min), phone OTP (60s)
- **Approval workflow**: Agents require admin approval before submitting prices

---

## All Features

### Core Price Tracking
- Browse crop prices by region, market, crop, or date range
- OHLC candlestick charts with 7-day and 30-day moving averages
- Regional price heatmap with tier classification
- Low/Medium/High price segmentation per crop
- Price submission with anomaly detection (Z-score + IQR)
- CSV, Excel, and PDF report generation

### Forecasting
- Three-tier forecasting: ARIMA (≥10 points) → Exponential Smoothing (≥6) → Linear Regression (≥3)
- 7-day, 14-day, and 30-day point forecasts
- Confidence intervals with upper/lower bounds
- Trend classification (rising/falling/stable)
- Action recommendations (sell_now/hold/wait) with human-readable reasons
- Confidence scoring (0.0–1.0)

### Transport & Logistics
- Dijkstra's shortest path on Tanzania's regional road network
- 4 transport modes: truck (1.85 TSH/km/kg), bus, pickup, motorcycle
- 5 journey profiles: region-to-region, farm-to-road, farm-to-warehouse, road-to-market, farm-to-market
- 3 farm-to-road modes: donkey cart, handcart, human porter
- Loading/unloading costs (kupakia/kupakua)
- Terrain factors (flat/hills/rivers/valleys)
- Seasonal adjustments (rain/dry season)
- Fuel price dynamics with demand-based pricing
- Road condition modifiers

### Market Intelligence
- **Best market finder**: Markets ranked by net price (price minus transport)
- **Sell advisor**: Moving-average-based sell timing with weather overlay
- **Spread analysis**: Cross-region arbitrage opportunities with transport-adjusted margins
- **Supply tracker**: Per-region supply classification (surplus/deficit/neutral)
- **Personalized recommendations** tailored to each role

### Notifications & Alerts
- Price alerts: drop, rise, above threshold, below threshold
- 4 automated notification engines running on schedules:
  - **Opportunity** (10 min): Cross-region arbitrage opportunities
  - **Price** (30 min): Significant price movements (≥10% in 24h)
  - **Transport** (60 min): Transport cost changes (>15%)
  - **Personalized** (60 min): User preference-filtered alerts
- Multi-channel delivery: WhatsApp (preferred) → SMS (fallback) → in-app
- In-app notification center with filter tabs and priority badges
- 2-hour dedup window to prevent notification spam
- Rate limiting and user preference respect

### Market Matching
- Create buy/sell listings with crop, quantity, and target price
- Browse active matches with filters
- Cancel listings when fulfilled

### Cooperatives
- Create farmer cooperatives with descriptions and founding dates
- Join/leave cooperatives
- Role-based membership (member, admin, chairperson)

### Weather Integration
- Daily temperature, precipitation, humidity, wind speed from Open-Meteo
- Weather alerts for extreme conditions
- Weather context integrated into sell advisor and transport calculations

### User Management
- Admin dashboard for user listing and management
- Role assignment and approval workflow
- Account status monitoring (lock state, verification status)
- Profile editing with 50+ role-specific fields
- Email verification with 6-digit codes
- Phone verification with OTP

### Multi-Language Support
- Swahili and English translations
- DOM-walking translation engine with MutationObserver
- Translation microservice with 3 providers (free/Google/DeepL)
- 200+ domain-specific translation entries

### Offline Support
- Service worker caching
- localStorage persistence with timestamps
- Offline indicator banner
- Auto-sync on reconnect

### Data Scraping
- Weekly market bulletins from Kilimo.go.tz (80+ PDFs)
- Viwanda.go.tz wholesale prices
- 5 crop board websites (CPB, Coffee, Tea, Cotton, Cashew)
- National Bureau of Statistics agriculture data
- Consolidated JSON output with date extraction
- Swahili month name parsing

### Reports
- CSV reports with metadata headers
- Excel reports with styled headers and alternating rows
- PDF reports (landscape A4) with table formatting
- Summary reports with Avg/Min/Max/Count aggregates
- Filterable by crop, market, region, date range

---

## Data Scraping Pipeline

### Kilimo.go.tz Scraper (`scrape_kilimo.py`)
- Crawls publication pages (configurable page range)
- Extracts "Mwenendo wa Bei za Mazao" (Crop Price Trend) PDF links
- Downloads PDFs to `kilimo_pdfs/pdfs/`
- Extracts regional price tables using `pdfplumber`
- Crops: Maize, Rice, Beans, Sorghum, Finger Millet, Irish Potatoes
- Output: `all_crop_data.json`

### Viwanda.go.tz Scraper (in `scrape_all.py`)
- Scrapes "Product Prices Domestic" PDFs from MIT
- Extracts region/market/price rows from PDF tables
- Crops: Maize, Rice, Sorghum, Finger Millet, Bulrush Millet, Potatoes, Cassava
- Output: `prices/viwanda_prices.json`

### Crop Board Scraper (`scrape_crop_boards.py`)
Scrapes 6 boards:
1. **CPB** (Cereals & Other Produce Board) — grains
2. **TCB** (Tanzania Coffee Board) — coffee prices
3. **TBT** (Tea Board) — tea prices
4. **Cotton Board** — cotton prices
5. **TTB** (Tobacco Board) — tobacco prices
6. **Cashew Board** — cashew prices

Output: Per-board JSON + consolidated `all_boards.json`

### NBS Scraper (`scrape_nbs.py`)
- Fetches NBS agriculture topics
- Output: `nbs_data/agriculture_topics.json`

---

## Notification System

### Architecture
- **In-process threading** (no Celery/APScheduler)
- Auto-started by `apps.py` when Django runs
- 4 daemon threads checking at different intervals
- Retry logic (3 attempts, exponential backoff for DB locks)

### Schedules

| Engine | Interval | Trigger |
|---|---|---|
| Opportunity | 10 min | Cross-region arbitrage (spread > transport + 10%) |
| Price | 30 min | Price movement ≥10% in 24h per crop/region |
| Transport | 60 min | Transport cost change >15% on any route |
| Personalized | 60 min | User preference-filtered alerts |

### Delivery Channels
1. **WhatsApp** — Notify Africa WABA API (preferred)
2. **SMS** — Notify Africa SMS API with sender_id `SMARTCROPS` (fallback)
3. **In-app** — Notification model with read tracking
4. **Dev fallback** — Console logging when no API keys configured

### Deduplication
- `Notification.create_if_unique()` checks for duplicates within a 2-hour window
- Duplicates are silently skipped

---

## Forecasting Engine

### Algorithm (`prices/forecasting.py`)

Three-tier approach with automatic fallback:

```
Data points ≥ 10  →  ARIMA (statsmodels)
Data points ≥ 6   →  Holt-Winters Exponential Smoothing
Data points ≥ 3   →  Linear Regression (numpy polyfit)
```

### ARIMA Details
- Auto-selects order: ARIMA(2,1,2) for n≥30, ARIMA(1,1,1) for n≥15, ARIMA(1,0,1) for n≥10
- 90% confidence intervals
- R-squared for confidence scoring

### Output
```json
{
  "predictions": [
    {"date": "2026-07-01", "price": 85000, "lower": 82000, "upper": 88000}
  ],
  "trend": "rising",
  "confidence": 0.78,
  "method": "arima",
  "predicted_7": 85500,
  "predicted_14": 87000,
  "predicted_30": 89000,
  "action": "sell_now",
  "action_reason": "Price is rising and forecast suggests continued increase..."
}
```

---

## Transport Engine

### Algorithm (`prices/transport_engine.py`, 1199 lines)

**Dijkstra's shortest path** on a graph of 26+ Tanzanian regions connected by `RegionRoute` edges.

### Transport Modes

| Mode | Speed | Pricing | Rate |
|---|---|---|---|
| Truck | 50 km/h | Per 100kg | 1.85 TSH/km/kg |
| Bus | 65 km/h | Per 20kg parcel | 8.75 TSH/km/kg |
| Pickup | 70 km/h | Per 100kg | 3.0 TSH/km/kg |
| Motorcycle | 40 km/h | Distance-tiered | 220–800 TSH/km |

### Journey Profiles
- `region_to_region` — Basic inter-regional
- `shamba_to_road` — Farm to nearest road (first leg)
- `shamba_to_warehouse` — Farm to storage
- `road_to_market` — Last-mile
- `shamba_to_market` — Complete farm-to-market chain (5 stages)

### Environment Factors
- **Terrain**: flat (1.0), hills (1.35), rivers (1.20), valleys (1.15)
- **Season**: dry (1.0), rainy (1.25)
- **Soil × Season**: clay+rain (1.40), sand+rain (1.10), loam+rain (1.20)
- **Fuel price**: Baseline 3200 TSH/L, dynamic factor [0.7, 1.8]
- **Road condition**: good (1.0), average (1.15), poor (1.3)

### Smart Pricing Adjustments
- Demand adjustment: ±10–20% based on corridor demand
- Mode popularity: truck −5%, pickup +5%, motorcycle +10%
- Traffic factor: randomized ±20%
- Weight scaling: >1000kg +10%, >5000kg +20%
- Poor road surcharge: +10–25%

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | **Yes** | `change-me-in-production` | Django secret key |
| `DB_HOST` | No | — | PostgreSQL host (leave blank for SQLite) |
| `DB_NAME` | No | `neondb` | PostgreSQL database name |
| `DB_USER` | No | — | PostgreSQL user |
| `DB_PASSWORD` | No | — | PostgreSQL password |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `USE_POSTGRES` | No | `false` | Set to `true` to use PostgreSQL |
| `SUPABASE_URL` | No | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | — | Supabase anonymous key |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3000/auth/callback` | OAuth redirect URI |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL (magic links) |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP server |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_HOST_USER` | No | — | SMTP username |
| `EMAIL_HOST_PASSWORD` | No | — | SMTP password (app password for Gmail) |
| `DEFAULT_FROM_EMAIL` | No | `Smart Crops <noreply@smartcrops.tz>` | From address |
| `NOTIFY_SMS_KEY` | No | — | Notify Africa SMS API key |
| `NOTIFY_WHATSAPP_KEY` | No | — | Notify Africa WhatsApp API key |
| `NOTIFY_BASE_URL` | No | `https://api.notify.africa` | Notify Africa base URL |
| `TRANSLATION_PROVIDER` | No | `free` | Translation provider (free/google/deepl) |
| `TRANSLATION_API_KEY` | No | — | Translation API key |
| `PORT` | No | `3001` | Translation server port |

---

## Available Scripts

### Root (via `package.json`)

| Command | Description |
|---|---|
| `npm run dev` | Start backend + frontend + translation concurrently |
| `npm run start:backend` | Start Django server only (port 8000) |
| `npm run start:frontend` | Start React app only (port 3000) |
| `npm run start:translate` | Start translation server (port 3001) |
| `npm run prepare:backend` | Install Python dependencies |

### Django Management Commands

| Command | Description |
|---|---|
| `python manage.py migrate` | Apply database migrations |
| `python manage.py runserver <port>` | Start Django dev server |
| `python manage.py createsuperuser` | Create admin user |
| `python manage.py seed_data` | Seed regions, markets, crops |
| `python manage.py seed_crop_calendar` | Seed planting/harvest calendars |
| `python manage.py seed_transport_network` | Seed transport routes + pricing rules |
| `python manage.py create_demo_accounts` | Create demo users for testing |
| `python manage.py sync_all_data` | Run all scrapers + weather sync |
| `python manage.py sync_weather` | Fetch weather from Open-Meteo |
| `python manage.py sync_kilimo` | Sync Kilimo PDF data |
| `python manage.py import_kilimo_data` | Import Kilimo board data |
| `python manage.py import_scraped_prices` | Import scraped prices into PriceEntry |
| `python manage.py run_notification_engine` | Run notification engine (mode: opportunity/price/transport/personalized) |
| `python manage.py migrate_to_supabase` | Migrate data to Supabase |

### Frontend

| Command | Description |
|---|---|
| `cd frontend && npm start` | Start React dev server (port 3000) |
| `cd frontend && npm run build` | Build for production |
| `cd frontend && npm test` | Run tests |

---

## Deployment

### Production Checklist

1. Set `DEBUG=False` in `backend/settings.py`
2. Restrict `ALLOWED_HOSTS` to your domain
3. Restrict `CORS_ALLOW_ALL_ORIGINS` to your frontend domain
4. Generate a strong `DJANGO_SECRET_KEY`
5. Configure PostgreSQL (set `DB_HOST`, `USE_POSTGRES=true`)
6. Configure SMTP credentials for email delivery
7. Set up Notify Africa keys for notification delivery
8. Build frontend: `cd frontend && npm run build`
9. Serve static files with nginx or CDN

### Notification Cron Setup (Windows)

```powershell
.\notification_cron_setup.ps1
```

This creates 4 scheduled tasks running every 10/30/60 minutes.

### Notification Cron Setup (Linux)

Add to crontab:

```bash
*/10 * * * * /path/to/project/notification_cron.sh opportunity
*/30 * * * * /path/to/project/notification_cron.sh price
0 * * * * /path/to/project/notification_cron.sh transport
0 * * * * /path/to/project/notification_cron.sh personalized
```

---

## Troubleshooting

### Port already in use
```bash
# Change Django port
python manage.py runserver 8080

# Change React port
cd frontend && set PORT=3001 && npm start
```

### Database issues
- **SQLite**: Delete `db.sqlite3` and re-run `python manage.py migrate`
- **PostgreSQL**: Ensure `DB_HOST` is set and `USE_POSTGRES=true`
- **Migration conflicts**: Run `python manage.py migrate --fake <appname> <migration_number>`

### Node/Sass errors
```bash
cd frontend
npm rebuild node-sass
```

### Translation server issues
```bash
cd translation-server
npm install
npm start
```

### Scraping issues
```bash
python run_all_scrapers.bat
# Or individual:
python kilimo_pdfs/scrape_kilimo.py
python kilimo_pdfs/scrape_all.py
```

### Chunk loading errors (frontend)
- Clear browser cache
- Run `cd frontend && npm run build`
- The app has `lazyWithRetry()` with 3 retries and `ChunkErrorBoundary` for graceful handling
