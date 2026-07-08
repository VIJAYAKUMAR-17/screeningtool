from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import RunStatus
from database.repository import ScreeningRunRepository, Tier2RunRepository
from tier2_screening.schemas import Tier2ScreenRequest, Tier2SummaryResponse
from tier2_screening.service import Tier2ScreeningService, serialize_tier2_response

router = APIRouter()


@router.post('/screen')
async def run_tier2_screening(req: Tier2ScreenRequest, db: Session = Depends(get_db)):
    tier1_repo = ScreeningRunRepository(db)
    tier2_repo = Tier2RunRepository(db)

    tier1_run = tier1_repo.get(req.run_id)
    if not tier1_run:
        raise HTTPException(status_code=404, detail=f'Tier 1 run {req.run_id} not found.')

    if tier1_run.status != RunStatus.COMPLETE:
        current_status = tier1_run.status.value if hasattr(tier1_run.status, 'value') else str(tier1_run.status)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tier 2 screening is allowed only after Tier 1 is complete. "
                f"Run {req.run_id} status is '{current_status}'."
            ),
        )

    target_entity = req.primary_entity or tier1_run.customer_name
    if not target_entity:
        raise HTTPException(status_code=400, detail='Could not resolve target entity from Tier 1 run.')

    service = Tier2ScreeningService(db)
    result = await service.run(
        tier1_run_id=tier1_run.id,
        target_entity=target_entity,
        include_adverse_media=req.include_adverse_media,
        use_csl=req.use_csl,
        csl_sources=req.sources,
        csl_types=req.types,
        csl_countries=req.countries,
        csl_address=req.address,
        csl_city=req.city,
        csl_state=req.state,
        csl_postal_code=req.postal_code,
        csl_result_size=req.csl_result_size,
    )

    persisted = tier2_repo.create(
        tier1_run_id=tier1_run.id,
        target_entity=result.target_entity,
        risk_score=result.risk_score,
        risk_level=result.risk_level,
        findings=serialize_tier2_response(result),
        data_sources=result.data_sources_used,
    )

    response = result.model_copy(update={'run_id': persisted.id})
    return response.model_dump(mode='json')


@router.get('/runs/{tier1_run_id}')
def get_latest_tier2_for_tier1(tier1_run_id: int, db: Session = Depends(get_db)):
    run = Tier2RunRepository(db).get_latest_for_tier1(tier1_run_id)
    if not run:
        raise HTTPException(status_code=404, detail='No Tier 2 run found for this Tier 1 run.')
    findings = run.findings or {}
    findings['run_id'] = run.id
    return findings


@router.get('/dashboard', response_model=Tier2SummaryResponse)
def tier2_dashboard(limit: int = 10, db: Session = Depends(get_db)):
    rows = Tier2RunRepository(db).list_recent(limit=max(1, min(limit, 50)))
    latest_runs = []
    high = medium = low = 0

    for row in rows:
        findings = row.findings or {}
        if row.risk_level == 'high':
            high += 1
        elif row.risk_level == 'medium':
            medium += 1
        else:
            low += 1
        findings['run_id'] = row.id
        latest_runs.append(findings)

    return {
        'total_tier2_runs': len(rows),
        'high_risk': high,
        'medium_risk': medium,
        'low_risk': low,
        'latest_runs': latest_runs,
    }

