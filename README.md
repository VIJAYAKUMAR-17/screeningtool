# Trade Sanctions Screening - Setup and Share Guide

This project has:
- `backend/` - FastAPI API + CLI tooling
- `frontend/` - React + Vite UI

Use this guide so someone can run your shared zip quickly.

## 1) Prerequisites

- Python `3.10+` (recommended: `3.12`)
- Node.js `18+` (recommended: `20+`)
- npm (comes with Node)

## 2) Backend Setup (FastAPI)

From project root:

### Windows (PowerShell)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env -Force
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### macOS/Linux
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:
- API root: `http://localhost:8000`
- Health: `http://localhost:8000/health`
- Swagger docs: `http://localhost:8000/docs`

## 2.1) Clerk Auth Setup

Create a Clerk application and enable Organizations. This app uses the active Clerk Organization as the tenant boundary, so users must select an organization before the workspace loads.

Frontend env:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:8000
```

Backend env:

```bash
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
CLERK_REQUIRE_ORGANIZATION=true
```

The backend verifies Clerk session JWTs from the `Authorization: Bearer <token>` header. `CLERK_ISSUER` is always required for issuer validation. By default the API loads Clerk's JWKS from the issuer; set `CLERK_JWT_KEY` from the Clerk Dashboard only when you want networkless verification.

Recommended Clerk Organization roles/permissions:

```text
org:admin                  all permissions
org:compliance_manager     org:screenings:create, org:screenings:read, org:tier2:create, org:reports:export
org:analyst                org:screenings:create, org:screenings:read, org:tier2:create
org:viewer                 org:screenings:read
org:auditor                org:screenings:read, org:reports:export
```

The API also includes conservative defaults for common role names, but Clerk custom permissions should be configured for production.

## 3) Frontend Setup (React + Vite)

Open a second terminal, from project root:

### Windows (PowerShell)
```powershell
cd frontend
npm install
Copy-Item .env.example .env -Force
npm run dev
```

### macOS/Linux
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend URL:
- `http://localhost:5173`

## 4) Optional CLI Commands

From `backend/` (with virtual env active):

```bash
python cli.py --help
python cli.py seed
python cli.py status
python cli.py screen --customer "Demo Customer" "ITGlobe Incorporated" "Technocraft India"
python cli.py list
```

## 5) What To Share In ZIP

Include:
- source code
- `backend/requirements.txt`
- `frontend/package.json` + `frontend/package-lock.json`
- `.env.example` files
- this `README.md`

Do not include:
- `frontend/node_modules/`
- `backend/venv/` or `backend/.venv/`
- `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`
- build folders (`dist/`, `build/`, `.next/`, `.cache/`)
- secrets (`.env`, `*.pem`, `*.key`, tokens, credentials)

## 6) Quick Troubleshooting

- Frontend cannot call API: ensure `frontend/.env` has `VITE_API_BASE_URL=http://localhost:8000`.
- Frontend shows authentication config error: ensure `frontend/.env` has `VITE_CLERK_PUBLISHABLE_KEY`.
- API returns `CLERK_ISSUER is not configured`: set `CLERK_ISSUER` or `CLERK_JWT_KEY` in `backend/.env`.
- API returns `Select an organization`: create/select a Clerk Organization in the app.
- DB errors on first run: keep `DATABASE_URL=sqlite:///./sanctions.db` in `backend/.env`.
- Port conflict: change backend port in uvicorn command and update `VITE_API_BASE_URL`.
