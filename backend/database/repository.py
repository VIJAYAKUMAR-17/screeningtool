from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from database.models import (
    SanctionedEntity,
    Vendor,
    ScreeningRun,
    ScreeningResult,
    Tier2ScreeningRun,
    ListSyncState,
    RunStatus,
    MatchStatus,
)


class SanctionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, lists: list[str] = None) -> list[SanctionedEntity]:
        q = self.db.query(SanctionedEntity)
        if lists:
            q = q.filter(SanctionedEntity.list_source.in_(lists))
        return q.all()

    def add(self, data: dict) -> SanctionedEntity:
        entity = SanctionedEntity(**data)
        self.db.add(entity)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    def bulk_add(self, records: list[dict]):
        self.db.bulk_insert_mappings(SanctionedEntity, records)
        self.db.commit()

    def clear_list(self, list_source: str):
        self.db.query(SanctionedEntity).filter(
            SanctionedEntity.list_source == list_source
        ).delete()
        self.db.commit()


class VendorRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create(
        self, name: str, country: str = None, customer_name: str = None
    ) -> Vendor:
        vendor = self.db.query(Vendor).filter(Vendor.name == name).first()
        if not vendor:
            vendor = Vendor(name=name, country=country, customer_name=customer_name)
            self.db.add(vendor)
            self.db.commit()
            self.db.refresh(vendor)
        return vendor

    def get_all(self) -> list[Vendor]:
        return self.db.query(Vendor).all()

    def link_supplier(self, parent_id: int, child_id: int):
        child = self.db.query(Vendor).filter(Vendor.id == child_id).first()
        if child:
            child.parent_vendor_id = parent_id
            child.tier = 2
            self.db.commit()


class SyncStateRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, list_source: str) -> Optional[ListSyncState]:
        return self.db.query(ListSyncState).filter(
            ListSyncState.list_source == list_source
        ).first()

    def upsert(
        self,
        list_source: str,
        publication_id: int = None,
        entity_count: int = 0,
        status: str = "ok",
    ):
        state = self.get(list_source)
        if not state:
            state = ListSyncState(list_source=list_source)
            self.db.add(state)
        state.last_publication_id = publication_id
        state.last_synced_at = datetime.utcnow()
        state.entity_count = entity_count
        state.status = status
        self.db.commit()

    def all(self) -> list[ListSyncState]:
        return self.db.query(ListSyncState).all()


class ScreeningRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, customer_name: str, vendor_names: list[str]) -> ScreeningRun:
        run = ScreeningRun(customer_name=customer_name, vendor_names=vendor_names)
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get(self, run_id: int) -> Optional[ScreeningRun]:
        return self.db.query(ScreeningRun).filter(ScreeningRun.id == run_id).first()

    def update_status(
        self,
        run_id: int,
        status: RunStatus,
        elapsed: float = None,
        summary: str = None,
    ):
        run = self.get(run_id)
        if run:
            run.status = status
            if elapsed is not None:
                run.elapsed_seconds = elapsed
            if summary is not None:
                run.ai_summary = summary
            if status == RunStatus.COMPLETE:
                run.completed_at = datetime.utcnow()
            self.db.commit()

    def add_result(self, run_id: int, data: dict) -> ScreeningResult:
        result = ScreeningResult(run_id=run_id, **data)
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result


class Tier2RunRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        tier1_run_id: int,
        target_entity: str,
        risk_score: int,
        risk_level: str,
        findings: dict,
        data_sources: list[str],
    ) -> Tier2ScreeningRun:
        run = Tier2ScreeningRun(
            tier1_run_id=tier1_run_id,
            target_entity=target_entity,
            risk_score=risk_score,
            risk_level=risk_level,
            findings=findings,
            data_sources=data_sources,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_latest_for_tier1(self, tier1_run_id: int) -> Optional[Tier2ScreeningRun]:
        return (
            self.db.query(Tier2ScreeningRun)
            .filter(Tier2ScreeningRun.tier1_run_id == tier1_run_id)
            .order_by(Tier2ScreeningRun.created_at.desc())
            .first()
        )

    def list_recent(self, limit: int = 25) -> list[Tier2ScreeningRun]:
        return (
            self.db.query(Tier2ScreeningRun)
            .order_by(Tier2ScreeningRun.created_at.desc())
            .limit(limit)
            .all()
        )
