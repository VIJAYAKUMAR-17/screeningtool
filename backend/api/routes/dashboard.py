from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from auth import AuthContext, require_auth_context
from database.db import get_db
from database.models import MatchStatus, ScreeningRun

router = APIRouter()


def _build_run_metrics(run: ScreeningRun) -> tuple[int, int, int, int]:
    vendors_screened = len(run.vendor_names or [])
    flagged = sum(1 for result in run.results if result.status == MatchStatus.FLAGGED)
    review_needed = sum(1 for result in run.results if result.status == MatchStatus.REVIEW)
    clear = sum(1 for result in run.results if result.status == MatchStatus.CLEAR)
    return vendors_screened, flagged, review_needed, clear


@router.get("/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_auth_context),
):
    runs = (
        db.query(ScreeningRun)
        .filter(ScreeningRun.org_id == auth.org_id)
        .options(selectinload(ScreeningRun.results))
        .all()
    )

    total_screenings = 0
    matches_found = 0
    cleared_results = 0
    pending_reviews = 0

    for run in runs:
        vendors_screened, flagged, review_needed, clear = _build_run_metrics(run)
        total_screenings += vendors_screened
        matches_found += flagged
        pending_reviews += review_needed
        cleared_results += clear

    return {
        "total_screenings": total_screenings,
        "matches_found": matches_found,
        "cleared_results": cleared_results,
        "pending_reviews": pending_reviews,
    }


@router.get("/charts")
def dashboard_charts(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_auth_context),
):
    runs = (
        db.query(ScreeningRun)
        .filter(ScreeningRun.org_id == auth.org_id)
        .options(selectinload(ScreeningRun.results))
        .all()
    )

    today = datetime.utcnow().date()
    trend_map: dict[str, dict[str, int]] = {}
    for day in range(6, -1, -1):
        date_key = (today - timedelta(days=day)).isoformat()
        trend_map[date_key] = {"screenings": 0, "matches": 0}

    total_flagged = 0
    total_review = 0
    total_clear = 0

    for run in runs:
        vendors_screened, flagged, review_needed, clear = _build_run_metrics(run)
        total_flagged += flagged
        total_review += review_needed
        total_clear += clear

        date_key = run.started_at.date().isoformat() if run.started_at else None
        if date_key in trend_map:
            trend_map[date_key]["screenings"] += vendors_screened
            trend_map[date_key]["matches"] += flagged

    distribution = [
        {"name": "Clear", "value": total_clear},
        {"name": "Review", "value": total_review},
        {"name": "Match", "value": total_flagged},
    ]

    return {
        "trend": [{"date": date_key, **values} for date_key, values in trend_map.items()],
        "match_distribution": distribution,
        "status_breakdown": distribution,
    }
