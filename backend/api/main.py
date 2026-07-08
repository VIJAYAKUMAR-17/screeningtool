from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from database.db import init_db
from api.routes import dashboard, report, screen, tier2

app = FastAPI(
    title="Trade Sanctions Screening API",
    description=(
        "Screens vendors and suppliers against global sanctions lists (OFAC, UN, BIS, EU, AUSTRALIA) plus supplemental sources (EDGAR). "
        "Supports deterministic fuzzy matching and Azure GPT agent-augmented analysis."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(screen.router, prefix="/screen", tags=["Screening"])
app.include_router(report.router, prefix="/report", tags=["Reports"])
app.include_router(tier2.router, prefix="/tier2", tags=["Tier 2 Screening"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])

_STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")
assets_dir = _STATIC_DIR / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/", include_in_schema=False)
def frontend():
    return FileResponse(_STATIC_DIR / "index.html")


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    api_paths = ("screen", "report", "tier2", "dashboard", "health", "docs", "openapi.json", "static", "assets")
    for item in api_paths:
        if full_path == item or full_path.startswith(f"{item}/"):
            return FileResponse(_STATIC_DIR / "index.html", status_code=404)
    return FileResponse(_STATIC_DIR / "index.html")

