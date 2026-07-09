from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from auth import AuthContext, Permission, require_auth_context, require_permission
from database.db import get_db
from database.models import MatchStatus, ScreeningRun
from database.repository import ScreeningRunRepository
from reporter.excel import generate_excel
from reporter.pdf import generate_pdf
from reporter.erp_format import build_erp_payload

router = APIRouter()


def _get_run_or_404(run_id: int, db: Session, auth: AuthContext) -> ScreeningRun:
    run = ScreeningRunRepository(db, org_id=auth.org_id).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    return run


@router.get("/")
def list_reports(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_auth_context),
):
    """List recent screening runs with per-run outcome counts."""
    runs = (
        db.query(ScreeningRun)
        .filter(ScreeningRun.org_id == auth.org_id)
        .order_by(ScreeningRun.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        {
            "run_id": r.id,
            "customer_name": r.customer_name,
            "status": r.status.value,
            "vendors_screened": len(r.vendor_names or []),
            "elapsed_seconds": r.elapsed_seconds,
            "started_at": r.started_at.isoformat(),
            "flagged": sum(1 for res in r.results if res.status == MatchStatus.FLAGGED),
            "review_needed": sum(1 for res in r.results if res.status == MatchStatus.REVIEW),
            "clear": sum(1 for res in r.results if res.status == MatchStatus.CLEAR),
        }
        for r in runs
    ]


@router.get("/{run_id}")
def get_report(
    run_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_auth_context),
):
    """Retrieve a full screening report as JSON."""
    run = _get_run_or_404(run_id, db, auth)
    return {
        "run_id": run.id,
        "customer_name": run.customer_name,
        "status": run.status.value,
        "data_mode": run.data_mode,
        "sources_checked": run.sources_checked or [],
        "vendors_screened": run.vendor_names,
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "elapsed_seconds": run.elapsed_seconds,
        "ai_summary": run.ai_summary,
        "results": [
            {
                "vendor_name": r.vendor_name,
                "status": r.status.value,
                "match_score": r.match_score,
                "matched_name": r.matched_name,
                "list_source": r.list_source,
                "match_type": r.match_type,
                "tier": r.tier,
                "ai_reasoning": r.ai_reasoning,
            }
            for r in run.results
        ],
    }


@router.get("/{run_id}/excel")
def download_excel(
    run_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission(Permission.REPORTS_EXPORT)),
):
    """Download screening report as a colour-coded Excel workbook."""
    run = _get_run_or_404(run_id, db, auth)
    content = generate_excel(run)
    filename = f"screening_report_SCR-{run_id:06d}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{run_id}/pdf")
def download_pdf(
    run_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission(Permission.REPORTS_EXPORT)),
):
    """Download screening report as a formatted PDF."""
    run = _get_run_or_404(run_id, db, auth)
    content = generate_pdf(run)
    filename = f"screening_report_SCR-{run_id:06d}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{run_id}/erp")
def erp_payload(
    run_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission(Permission.REPORTS_EXPORT)),
):
    """Return ERP-formatted JSON payload for vendor portal integration."""
    run = _get_run_or_404(run_id, db, auth)
    return build_erp_payload(run)
