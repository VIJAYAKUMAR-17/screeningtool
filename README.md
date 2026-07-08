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
- DB errors on first run: keep `DATABASE_URL=sqlite:///./sanctions.db` in `backend/.env`.
- Port conflict: change backend port in uvicorn command and update `VITE_API_BASE_URL`.
