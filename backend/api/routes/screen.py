
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from agent.analyst import ScreeningAnalyst
from agent.narrator import ReportNarrator
from database.db import get_db
from database.models import MatchStatus, RunStatus
from database.repository import SanctionRepository, ScreeningRunRepository, VendorRepository
from engine import matcher as engine_matcher
from engine.graph import SupplierGraph
from services.csl_client import (
    CSLAuthError,
    CSLClient,
    CSLClientError,
    CSLNetworkError,
    CSLRateLimitError,
    CSLSearchFilters,
    CSLTimeoutError,
    CSLUpstreamError,
)

router = APIRouter()
log = logging.getLogger(__name__)


class ScreenRequest(BaseModel):
    customer_name: str
    vendors: list[str]
    lists: Optional[list[str]] = None
    use_ai: bool = False
    # Kept for backward compatibility with existing frontend payloads.
    live_ofac: bool = True

    # CSL filter controls
    sources: Optional[list[str]] = None
    types: Optional[list[str]] = None
    countries: Optional[list[str]] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    csl_result_size: int = Field(default=50, ge=1, le=250)


class VendorLinkRequest(BaseModel):
    parent_vendor_name: str
    child_vendor_name: str
    customer_name: Optional[str] = None


def _normalize_values(values: Optional[list[str]], uppercase: bool = True) -> Optional[list[str]]:
    if not values:
        return None
    out: list[str] = []
    for item in values:
        value = str(item).strip()
        if not value:
            continue
        out.append(value.upper() if uppercase else value)
    return out or None


def _normalize_lists(lists: Optional[list[str]]) -> Optional[list[str]]:
    return _normalize_values(lists, uppercase=True)


def _resolve_csl_sources(req: ScreenRequest, requested_lists: Optional[list[str]]) -> Optional[list[str]]:
    explicit = _normalize_values(req.sources, uppercase=True)
    if explicit:
        return explicit

    if not requested_lists:
        return None

    # Existing frontend sends OFAC by default. Treat that legacy default as all CSL sources
    # unless the caller explicitly sets sources.
    if len(requested_lists) == 1 and requested_lists[0] == "OFAC":
        return None

    return requested_lists


def _status_from_score(score: float) -> MatchStatus:
    if score >= 85:
        return MatchStatus.FLAGGED
    if score >= 70:
        return MatchStatus.REVIEW
    return MatchStatus.CLEAR


@router.post("/")
def screen(req: ScreenRequest, db: Session = Depends(get_db)):
    """
    Screen vendors against sanctions lists.

    Modes:
    - live_ofac=true (default): Tier 1 uses the U.S. Consolidated Screening List API.
      The request field name is kept for backward compatibility.
    - live_ofac=false: uses DB-backed sources only (lists filter optional).
    """
    vendor_repo = VendorRepository(db)
    sanction_repo = SanctionRepository(db)
    run_repo = ScreeningRunRepository(db)

    run = run_repo.create(customer_name=req.customer_name, vendor_names=req.vendors)
    run_repo.update_status(run.id, RunStatus.RUNNING)
    start = time.perf_counter()

    try:
        requested_lists = _normalize_lists(req.lists)

        all_vendors = vendor_repo.get_all()
        graph = SupplierGraph()
        graph.load(all_vendors)

        vendor_name_set = set(req.vendors)
        names_to_screen = [req.customer_name] + [v for v in req.vendors if v != req.customer_name]

        batch: dict[str, list[dict]] = {}

        if req.live_ofac:
            csl_sources = _resolve_csl_sources(req, requested_lists)
            csl_filters = CSLSearchFilters(
                sources=csl_sources,
                types=_normalize_values(req.types, uppercase=False),
                countries=_normalize_values(req.countries, uppercase=True),
                address=req.address,
                city=req.city,
                state=req.state,
                postal_code=req.postal_code,
            )

            client = CSLClient()
            for name in names_to_screen:
                matches = client.search_name(name=name, filters=csl_filters, size=req.csl_result_size)

                annotated_matches: list[dict] = []
                for item in matches:
                    score = float(item.get("match_score") or 0.0)
                    status = _status_from_score(score)
                    annotated_matches.append(
                        {
                            "entity_name": item.get("entity_name") or "",
                            "matched_name": item.get("matched_name") or item.get("entity_name") or "",
                            "match_score": round(score, 2),
                            "match_type": item.get("match_type") or "name",
                            "list_source": item.get("list_source") or "CSL",
                            "list_id": item.get("list_id"),
                            "country": item.get("country"),
                            "address": item.get("address"),
                            "city": item.get("city"),
                            "state": item.get("state"),
                            "postal_code": item.get("postal_code"),
                            "entity_type": item.get("entity_type"),
                            "programs": item.get("programs") or [],
                            "remarks": item.get("remarks"),
                            "metadata": item.get("metadata") or {},
                            "status": status,
                        }
                    )

                batch[name] = annotated_matches

            log.info(
                "CSL screening complete run_id=%s names=%s sources=%s",
                run.id,
                len(names_to_screen),
                csl_sources,
            )
        else:
            db_entities = sanction_repo.get_all(lists=requested_lists or None)
            if not db_entities:
                detail = (
                    f"No data found in DB for requested sources: {requested_lists}."
                    if requested_lists
                    else "No sanctions/supplemental data found in DB. Run ingest commands first."
                )
                raise HTTPException(status_code=400, detail=detail)

            batch = engine_matcher.batch_screen(names_to_screen, db_entities, lists=requested_lists)

        results_out = []
        for name, matches in batch.items():
            top = matches[0] if matches else None
            is_customer = (name == req.customer_name) and (name not in vendor_name_set)

            if not is_customer:
                vendor_repo.get_or_create(name, customer_name=req.customer_name)

            no_match = not bool(matches)
            result_data = {
                "vendor_name": name,
                "status": top["status"] if top else MatchStatus.CLEAR,
                "match_score": top["match_score"] if top else None,
                "matched_name": top["matched_name"] if top else None,
                "list_source": top["list_source"] if top else None,
                "match_type": top["match_type"] if top else None,
                "tier": 0 if is_customer else 1,
                "ai_reasoning": (top.get("remarks") if top else "No Match"),
            }
            run_repo.add_result(run.id, result_data)

            results_out.append(
                {
                    **result_data,
                    "status": result_data["status"].value if hasattr(result_data["status"], "value") else result_data["status"],
                    "result_type": "customer" if is_customer else "vendor",
                    "no_match": no_match,
                    "remarks": "No Match" if no_match else top.get("remarks"),
                    "all_matches": [
                        {
                            "entity_name": m.get("entity_name"),
                            "score": m.get("match_score"),
                            "list": m.get("list_source"),
                            "status": m["status"].value if hasattr(m.get("status"), "value") else m.get("status"),
                            "entity_type": m.get("entity_type"),
                            "address": m.get("address"),
                            "city": m.get("city"),
                            "state": m.get("state"),
                            "postal_code": m.get("postal_code"),
                            "country": m.get("country"),
                            "programs": m.get("programs") or [],
                            "remarks": m.get("remarks"),
                            "metadata": m.get("metadata") or {},
                        }
                        for m in matches
                    ],
                }
            )

        results_out.sort(key=lambda r: (0 if r["result_type"] == "customer" else 1))

        elapsed = time.perf_counter() - start
        ai_summary = None

        if req.use_ai:
            # AI tooling remains DB-backed for now to avoid changing agent tool contracts.
            ai_entities = sanction_repo.get_all(lists=requested_lists or None)
            analyst = ScreeningAnalyst()
            analysis = analyst.analyze(req.vendors, req.customer_name, ai_entities, graph)
            narrator = ReportNarrator()
            ai_summary = narrator.generate_narrative(analysis.get("findings"), req.customer_name, elapsed)
            run_repo.update_status(run.id, RunStatus.COMPLETE, elapsed=elapsed, summary=ai_summary)
        else:
            run_repo.update_status(run.id, RunStatus.COMPLETE, elapsed=elapsed)

        return {
            "run_id": run.id,
            "customer_name": req.customer_name,
            "elapsed_seconds": round(elapsed, 3),
            "total_vendors": len(req.vendors),
            "flagged": sum(1 for r in results_out if r["status"] == "flagged"),
            "review_needed": sum(1 for r in results_out if r["status"] == "review_needed"),
            "clear": sum(1 for r in results_out if r["status"] == "clear"),
            "results": results_out,
            "ai_summary": ai_summary,
        }

    except CSLAuthError as exc:
        run_repo.update_status(run.id, RunStatus.FAILED)
        raise HTTPException(status_code=503, detail=str(exc))
    except CSLRateLimitError as exc:
        run_repo.update_status(run.id, RunStatus.FAILED)
        raise HTTPException(status_code=429, detail=str(exc))
    except (CSLUpstreamError, CSLTimeoutError, CSLNetworkError) as exc:
        run_repo.update_status(run.id, RunStatus.FAILED)
        raise HTTPException(status_code=503, detail=str(exc))
    except HTTPException:
        run_repo.update_status(run.id, RunStatus.FAILED)
        raise
    except CSLClientError as exc:
        run_repo.update_status(run.id, RunStatus.FAILED)
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        run_repo.update_status(run.id, RunStatus.FAILED)
        message = str(exc)
        if "WinError 10013" in message or "forbidden by its access permissions" in message:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Network/socket access denied while reaching external sanctions sources. "
                    "Run with live_ofac=false for DB mode or allow outbound access."
                ),
            )
        raise HTTPException(status_code=500, detail=message)


@router.post("/vendors/link")
def link_vendors(req: VendorLinkRequest, db: Session = Depends(get_db)):
    """Register a Tier 2 supplier relationship between two vendors."""
    vendor_repo = VendorRepository(db)
    parent = vendor_repo.get_or_create(req.parent_vendor_name, customer_name=req.customer_name)
    child = vendor_repo.get_or_create(req.child_vendor_name, customer_name=req.customer_name)
    vendor_repo.link_supplier(parent.id, child.id)
    return {
        "message": f"Linked '{req.child_vendor_name}' as Tier 2 supplier of '{req.parent_vendor_name}'.",
        "parent_id": parent.id,
        "child_id": child.id,
    }
