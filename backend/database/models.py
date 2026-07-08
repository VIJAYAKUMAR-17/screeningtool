import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime,
    ForeignKey, JSON, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from database.db import Base


class EntityType(str, enum.Enum):
    INDIVIDUAL = "individual"
    COMPANY = "company"
    VESSEL = "vessel"
    AIRCRAFT = "aircraft"


class MatchStatus(str, enum.Enum):
    CLEAR = "clear"
    REVIEW = "review_needed"
    FLAGGED = "flagged"


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class ListSyncState(Base):
    """Tracks the last successful sync for each sanctions list source."""
    __tablename__ = "list_sync_states"

    id = Column(Integer, primary_key=True, index=True)
    list_source = Column(String, unique=True, nullable=False)
    last_publication_id = Column(Integer, nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    entity_count = Column(Integer, default=0)
    status = Column(String, default="never")


class SanctionedEntity(Base):
    __tablename__ = "sanctioned_entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    aliases = Column(JSON, default=list)
    country = Column(String(3), nullable=True)
    list_source = Column(String, nullable=False)
    list_id = Column(String, nullable=True)
    entity_type = Column(SAEnum(EntityType), default=EntityType.COMPANY)
    address = Column(String, nullable=True)
    programs = Column(JSON, default=list)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    country = Column(String(3), nullable=True)
    customer_name = Column(String, nullable=True)
    tier = Column(Integer, default=1)
    parent_vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parent = relationship("Vendor", remote_side=[id], backref="sub_suppliers")
    screening_results = relationship("ScreeningResult", back_populates="vendor")


class ScreeningRun(Base):
    __tablename__ = "screening_runs"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String, nullable=True)
    vendor_names = Column(JSON, default=list)
    status = Column(SAEnum(RunStatus), default=RunStatus.PENDING)
    elapsed_seconds = Column(Float, nullable=True)
    ai_summary = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    results = relationship("ScreeningResult", back_populates="run")
    tier2_runs = relationship("Tier2ScreeningRun", back_populates="tier1_run")


class ScreeningResult(Base):
    __tablename__ = "screening_results"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("screening_runs.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    vendor_name = Column(String, nullable=False)
    sanctioned_entity_id = Column(Integer, ForeignKey("sanctioned_entities.id"), nullable=True)
    matched_name = Column(String, nullable=True)
    match_score = Column(Float, nullable=True)
    match_type = Column(String, nullable=True)
    list_source = Column(String, nullable=True)
    status = Column(SAEnum(MatchStatus), default=MatchStatus.CLEAR)
    ai_reasoning = Column(String, nullable=True)
    tier = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("ScreeningRun", back_populates="results")
    vendor = relationship("Vendor", back_populates="screening_results")
    sanctioned_entity = relationship("SanctionedEntity")


class Tier2ScreeningRun(Base):
    __tablename__ = "tier2_screening_runs"

    id = Column(Integer, primary_key=True, index=True)
    tier1_run_id = Column(Integer, ForeignKey("screening_runs.id"), nullable=False, index=True)
    target_entity = Column(String, nullable=False)
    risk_score = Column(Integer, default=0)
    risk_level = Column(String, default="low")
    findings = Column(JSON, default=dict)
    data_sources = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tier1_run = relationship("ScreeningRun", back_populates="tier2_runs")
