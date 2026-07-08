"""
Transforms a ScreeningRun into a structured JSON payload
compatible with a vendor registration / ERP portal schema.
"""
from datetime import datetime, timezone
from database.models import ScreeningRun, MatchStatus

# Maps internal status → ERP vendor risk codes
_ERP_STATUS_MAP = {
    MatchStatus.CLEAR:   {"code": "VRS-00", "label": "Cleared",          "action": "APPROVE"},
    MatchStatus.REVIEW:  {"code": "VRS-01", "label": "Review Required",   "action": "HOLD"},
    MatchStatus.FLAGGED: {"code": "VRS-02", "label": "Sanctions Match",   "action": "BLOCK"},
}

_OVERALL_RISK_ACTION = {
    "LOW":    "APPROVE",
    "MEDIUM": "HOLD",
    "HIGH":   "BLOCK",
}


def build_erp_payload(run: ScreeningRun, ai_findings: dict | None = None) -> dict:
    vendor_records = []

    for r in run.results:
        erp_status = _ERP_STATUS_MAP.get(r.status, _ERP_STATUS_MAP[MatchStatus.CLEAR])
        vendor_records.append({
            "vendor_name":          r.vendor_name,
            "screening_status":     erp_status["label"],
            "status_code":          erp_status["code"],
            "recommended_action":   erp_status["action"],
            "sanctions_list":       r.list_source,
            "matched_entity":       r.matched_name,
            "match_score":          r.match_score,
            "match_type":           r.match_type,
            "supplier_tier":        r.tier,
            "ai_reasoning":         r.ai_reasoning,
        })

    overall_risk = "LOW"
    requires_review = False
    if ai_findings:
        overall_risk = ai_findings.get("overall_risk", "LOW")
        requires_review = ai_findings.get("requires_human_review", False)
    else:
        statuses = [r.status for r in run.results]
        if MatchStatus.FLAGGED in statuses:
            overall_risk, requires_review = "HIGH", True
        elif MatchStatus.REVIEW in statuses:
            overall_risk, requires_review = "MEDIUM", True

    return {
        "schema_version":       "1.0",
        "report_id":            f"SCR-{run.id:06d}",
        "generated_at":         datetime.now(timezone.utc).isoformat(),
        "screening_duration_s": run.elapsed_seconds,
        "customer_name":        run.customer_name,
        "overall_risk_level":   overall_risk,
        "overall_action":       _OVERALL_RISK_ACTION[overall_risk],
        "requires_human_review": requires_review,
        "vendors_screened":     len(run.results),
        "summary": {
            "flagged":      sum(1 for r in run.results if r.status == MatchStatus.FLAGGED),
            "review":       sum(1 for r in run.results if r.status == MatchStatus.REVIEW),
            "clear":        sum(1 for r in run.results if r.status == MatchStatus.CLEAR),
        },
        "vendor_results":       vendor_records,
        "ai_narrative":         run.ai_summary,
    }
