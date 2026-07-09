from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from database.models import (
    ListSyncState,
    RunStatus,
    SanctionedEntity,
    ScreeningResult,
    ScreeningRun,
    Tier2ScreeningRun,
    Vendor,
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
    def __init__(self, db: Session, org_id: str | None = None, user_id: str | None = None):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id

    def _query(self):
        query = self.db.query(Vendor)
        if self.org_id is not None:
            query = query.filter(Vendor.org_id == self.org_id)
        return query

    def get_or_create(
        self, name: str, country: str = None, customer_name: str = None
    ) -> Vendor:
        vendor = self._query().filter(Vendor.name == name).first()
        if not vendor:
            vendor = Vendor(
                name=name,
                country=country,
                customer_name=customer_name,
                org_id=self.org_id,
                created_by_user_id=self.user_id,
            )
            self.db.add(vendor)
            self.db.commit()
            self.db.refresh(vendor)
        return vendor

    def get_all(self) -> list[Vendor]:
        return self._query().all()

    def link_supplier(self, parent_id: int, child_id: int):
        child = self._query().filter(Vendor.id == child_id).first()
        parent = self._query().filter(Vendor.id == parent_id).first()
        if child and parent:
            child.parent_vendor_id = parent.id
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
    def __init__(
        self,
        db: Session,
        org_id: str | None = None,
        user_id: str | None = None,
        org_role: str | None = None,
        org_permissions: tuple[str, ...] | list[str] | None = None,
    ):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id
        self.org_role = org_role
        self.org_permissions = list(org_permissions or [])

    def _query(self):
        query = self.db.query(ScreeningRun)
        if self.org_id is not None:
            query = query.filter(ScreeningRun.org_id == self.org_id)
        return query

    def create(
        self,
        customer_name: str,
        vendor_names: list[str],
        sources_checked: list[str] | None = None,
        data_mode: str | None = None,
    ) -> ScreeningRun:
        run = ScreeningRun(
            customer_name=customer_name,
            vendor_names=vendor_names,
            sources_checked=sources_checked or [],
            data_mode=data_mode,
            org_id=self.org_id,
            created_by_user_id=self.user_id,
            org_role=self.org_role,
            org_permissions=self.org_permissions,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get(self, run_id: int) -> Optional[ScreeningRun]:
        return self._query().filter(ScreeningRun.id == run_id).first()

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
        if self.org_id is not None and not self.get(run_id):
            raise ValueError(f"Run {run_id} not found for current tenant.")
        result = ScreeningResult(
            run_id=run_id,
            org_id=self.org_id,
            created_by_user_id=self.user_id,
            **data,
        )
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result


class Tier2RunRepository:
    def __init__(self, db: Session, org_id: str | None = None, user_id: str | None = None):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id

    def _query(self):
        query = self.db.query(Tier2ScreeningRun)
        if self.org_id is not None:
            query = query.filter(Tier2ScreeningRun.org_id == self.org_id)
        return query

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
            org_id=self.org_id,
            created_by_user_id=self.user_id,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_latest_for_tier1(self, tier1_run_id: int) -> Optional[Tier2ScreeningRun]:
        return (
            self._query()
            .filter(Tier2ScreeningRun.tier1_run_id == tier1_run_id)
            .order_by(Tier2ScreeningRun.created_at.desc())
            .first()
        )

    def list_recent(self, limit: int = 25) -> list[Tier2ScreeningRun]:
        return (
            self._query()
            .order_by(Tier2ScreeningRun.created_at.desc())
            .limit(limit)
            .all()
        )
