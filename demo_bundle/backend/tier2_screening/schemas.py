from typing import Literal

from pydantic import BaseModel, Field


RelationshipType = Literal[
    "parent_company",
    "ultimate_parent",
    "subsidiary",
    "sister_entity",
    "director",
    "officer",
    "major_shareholder",
    "beneficial_owner",
    "related_entity",
]


class Tier2ScreenRequest(BaseModel):
    run_id: int = Field(..., gt=0, description="Tier 1 screening run id")
    primary_entity: str | None = Field(default=None, description="Optional explicit entity to deep-screen")
    include_adverse_media: bool = True
    use_csl: bool = True
    sources: list[str] | None = None
    types: list[str] | None = None
    countries: list[str] | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    csl_result_size: int = Field(default=50, ge=1, le=250)


class SourceRef(BaseModel):
    source: str
    url: str | None = None
    note: str | None = None


class RelatedParty(BaseModel):
    name: str
    relationship: RelationshipType
    jurisdiction: str | None = None
    registration_number: str | None = None
    source_refs: list[SourceRef] = Field(default_factory=list)


class SanctionsMatch(BaseModel):
    name: str
    relationship: str
    status: str
    score: float | None = None
    matched_name: str | None = None
    list_source: str | None = None
    match_type: str | None = None


class AdverseMediaFinding(BaseModel):
    entity_name: str
    keyword: str
    source: str
    title: str
    url: str | None = None


class Tier2RiskFlag(BaseModel):
    code: str
    description: str
    points: int


class Tier2ScreenResponse(BaseModel):
    run_id: int
    tier1_run_id: int
    target_entity: str
    risk_score: int
    risk_level: Literal["low", "medium", "high"]
    parent_companies: list[RelatedParty] = Field(default_factory=list)
    ultimate_parent: list[RelatedParty] = Field(default_factory=list)
    subsidiaries: list[RelatedParty] = Field(default_factory=list)
    sister_entities: list[RelatedParty] = Field(default_factory=list)
    directors_and_officers: list[RelatedParty] = Field(default_factory=list)
    major_shareholders: list[RelatedParty] = Field(default_factory=list)
    beneficial_owners: list[RelatedParty] = Field(default_factory=list)
    related_entities: list[RelatedParty] = Field(default_factory=list)
    sanctions_matches: list[SanctionsMatch] = Field(default_factory=list)
    adverse_media_findings: list[AdverseMediaFinding] = Field(default_factory=list)
    risk_flags: list[Tier2RiskFlag] = Field(default_factory=list)
    data_sources_used: list[str] = Field(default_factory=list)


class Tier2SummaryResponse(BaseModel):
    total_tier2_runs: int
    high_risk: int
    medium_risk: int
    low_risk: int
    latest_runs: list[Tier2ScreenResponse]


