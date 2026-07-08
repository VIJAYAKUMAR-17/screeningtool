import asyncio
import time
from typing import Any

from sqlalchemy.orm import Session

from database.repository import SanctionRepository
from engine import matcher as engine_matcher
from engine.resolver import normalize_name
from ingestion.ofac import fetch_live_entities
from services.csl_client import CSLClient, CSLClientError, CSLSearchFilters
from tier2_screening.config import tier2_settings
from tier2_screening.http_client import AsyncCachedHttpClient
from tier2_screening.logging_utils import get_tier2_logger
from tier2_screening.providers import (
    AdverseMediaProvider,
    GleifProvider,
    OpenCorporatesProvider,
    SecProvider,
    dedupe_related,
    extract_structured_sections,
    infer_offshore_chain,
    infer_sister_entities,
)
from tier2_screening.schemas import (
    CoverageStatus,
    RelatedParty,
    SanctionsMatch,
    SourceStatus,
    Tier2RiskFlag,
    Tier2ScreenResponse,
)


class _LiveOFACCache:
    def __init__(self):
        self._entities: list[Any] | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self) -> tuple[list[Any], bool]:
        now = time.time()
        if self._entities is not None and self._expires_at > now:
            return list(self._entities), True

        async with self._lock:
            now = time.time()
            if self._entities is not None and self._expires_at > now:
                return list(self._entities), True

            entities = await asyncio.to_thread(fetch_live_entities)
            self._entities = list(entities)
            self._expires_at = time.time() + tier2_settings.tier2_live_ofac_ttl_seconds
            return list(self._entities), False


_live_ofac_cache = _LiveOFACCache()


class Tier2ScreeningService:
    def __init__(
        self,
        db: Session,
        http_client: AsyncCachedHttpClient | None = None,
    ):
        self.db = db
        self.http = http_client or AsyncCachedHttpClient()
        self.log = get_tier2_logger()

    async def run(
        self,
        tier1_run_id: int,
        target_entity: str,
        include_adverse_media: bool = True,
        use_csl: bool = True,
        csl_sources: list[str] | None = None,
        csl_types: list[str] | None = None,
        csl_countries: list[str] | None = None,
        csl_address: str | None = None,
        csl_city: str | None = None,
        csl_state: str | None = None,
        csl_postal_code: str | None = None,
        csl_result_size: int = 50,
    ) -> Tier2ScreenResponse:
        normalized_target = normalize_name(target_entity)
        if not normalized_target:
            normalized_target = target_entity

        sec_provider = SecProvider(self.http)
        gleif_provider = GleifProvider(self.http)
        opencorp_provider = OpenCorporatesProvider(self.http)
        adverse_provider = AdverseMediaProvider(self.http)

        discovered: list[RelatedParty] = []
        source_statuses: list[SourceStatus] = []
        data_sources = set()

        for provider_name, provider in (
            ("sec", sec_provider),
            ("gleif", gleif_provider),
            ("opencorporates", opencorp_provider),
        ):
            try:
                rel, statuses = await provider.discover(target_entity)
                discovered.extend(rel)
                source_statuses.extend(statuses)
                data_sources.update(
                    status.source for status in statuses if status.status in {"checked", "partial"}
                )
            except Exception as exc:
                self.log.warning(
                    "tier2_provider_failure",
                    extra={"provider": provider_name, "target_entity": target_entity, "error": str(exc)},
                )
                source_statuses.append(
                    SourceStatus(
                        source=self._provider_display_name(provider_name),
                        status="unavailable",
                        message=f"Provider failed: {exc}",
                    )
                )

        discovered.extend(infer_sister_entities(discovered, target_entity))
        discovered = dedupe_related(discovered)

        names_to_screen = [target_entity, *[item.name for item in discovered]]
        sanctions_matches, sanctions_source_statuses = await self._rescreen_against_sanctions_sources(
            names=names_to_screen,
            discovered=discovered,
            use_csl=use_csl,
            csl_sources=csl_sources,
            csl_types=csl_types,
            csl_countries=csl_countries,
            csl_address=csl_address,
            csl_city=csl_city,
            csl_state=csl_state,
            csl_postal_code=csl_postal_code,
            csl_result_size=csl_result_size,
            data_sources=data_sources,
        )
        source_statuses.extend(sanctions_source_statuses)

        adverse_media_findings = []
        if include_adverse_media:
            adverse_media_findings, adverse_source_statuses = await adverse_provider.scan(names_to_screen)
            source_statuses.extend(adverse_source_statuses)
            data_sources.update(
                status.source for status in adverse_source_statuses if status.status in {"checked", "partial"}
            )
        else:
            source_statuses.append(
                SourceStatus(
                    source="Adverse media",
                    status="skipped",
                    message="Adverse-media scan disabled for this request.",
                )
            )

        sections = extract_structured_sections(discovered)
        source_statuses = self._dedupe_source_statuses(source_statuses)
        coverage_status, coverage_summary, limitations = self._coverage(source_statuses)
        risk_flags, risk_score = self._compute_risk(
            sanctions_matches=sanctions_matches,
            adverse_media_count=len(adverse_media_findings),
            related_entities_count=len(discovered),
            offshore_chain=infer_offshore_chain(discovered),
            source_statuses=source_statuses,
            coverage_status=coverage_status,
        )
        risk_level = "low" if risk_score <= 20 else "medium" if risk_score <= 50 else "high"

        return Tier2ScreenResponse(
            run_id=0,
            tier1_run_id=tier1_run_id,
            target_entity=target_entity,
            risk_score=risk_score,
            risk_level=risk_level,
            parent_companies=sections["parent_companies"],
            ultimate_parent=sections["ultimate_parent"],
            subsidiaries=sections["subsidiaries"],
            sister_entities=sections["sister_entities"],
            directors_and_officers=sections["directors_and_officers"],
            major_shareholders=sections["major_shareholders"],
            beneficial_owners=sections["beneficial_owners"],
            related_entities=sections["related_entities"],
            sanctions_matches=sanctions_matches,
            adverse_media_findings=adverse_media_findings,
            risk_flags=risk_flags,
            data_sources_used=sorted(data_sources),
            source_statuses=source_statuses,
            coverage_status=coverage_status,
            coverage_summary=coverage_summary,
            limitations=limitations,
        )

    async def _rescreen_against_sanctions_sources(
        self,
        names: list[str],
        discovered: list[RelatedParty],
        use_csl: bool,
        csl_sources: list[str] | None,
        csl_types: list[str] | None,
        csl_countries: list[str] | None,
        csl_address: str | None,
        csl_city: str | None,
        csl_state: str | None,
        csl_postal_code: str | None,
        csl_result_size: int,
        data_sources: set[str],
    ) -> tuple[list[SanctionsMatch], list[SourceStatus]]:
        source_statuses: list[SourceStatus] = []
        sanction_repo = SanctionRepository(self.db)
        entities = sanction_repo.get_all()
        if entities:
            data_sources.add("Local sanctions DB")
            source_statuses.append(
                SourceStatus(
                    source="Local sanctions DB",
                    status="checked",
                    records_found=len(entities),
                    message="Local sanctions records loaded and used for related-party re-screening.",
                )
            )
        else:
            source_statuses.append(
                SourceStatus(
                    source="Local sanctions DB",
                    status="unavailable",
                    message="No local sanctions records are loaded; run ingesters or rely on live CSL coverage.",
                )
            )

        try:
            live_ofac_entities, from_cache = await _live_ofac_cache.get()
            entities.extend(live_ofac_entities)
            if live_ofac_entities:
                data_sources.add("OFAC live file")
            source_statuses.append(
                SourceStatus(
                    source="OFAC live file",
                    status="checked",
                    records_found=len(live_ofac_entities),
                    message=(
                        "Live OFAC records loaded from cache."
                        if from_cache
                        else "Live OFAC records downloaded and cached for related-party re-screening."
                    ),
                )
            )
        except Exception as exc:
            self.log.warning("tier2_live_ofac_fetch_failed", extra={"error": str(exc)})
            source_statuses.append(
                SourceStatus(
                    source="OFAC live file",
                    status="unavailable",
                    message=f"Live OFAC records could not be loaded: {exc}",
                )
            )

        relation_map = self._relation_map(names, discovered)

        matches: list[SanctionsMatch] = []
        if entities:
            batch = engine_matcher.batch_screen(names, entities)
            for name, row in batch.items():
                relation = relation_map.get(normalize_name(name), "related_entity")
                for match in row:
                    matches.append(
                        SanctionsMatch(
                            name=name,
                            relationship=relation,
                            status=match["status"].value if hasattr(match["status"], "value") else str(match["status"]),
                            score=float(match.get("match_score")) if match.get("match_score") is not None else None,
                            matched_name=match.get("matched_name"),
                            list_source=match.get("list_source"),
                            match_type=match.get("match_type"),
                        )
                    )
        else:
            source_statuses.append(
                SourceStatus(
                    source="Sanctions re-screening",
                    status="unavailable",
                    message="No local or live sanctions records were available for related-party matching.",
                )
            )

        if use_csl:
            csl_matches, csl_status = await asyncio.to_thread(
                self._csl_screen,
                names=names,
                relation_map=relation_map,
                sources=csl_sources,
                types=csl_types,
                countries=csl_countries,
                address=csl_address,
                city=csl_city,
                state=csl_state,
                postal_code=csl_postal_code,
                size=csl_result_size,
            )
            source_statuses.append(csl_status)
            if csl_status.status in {"checked", "partial"}:
                data_sources.add("CSL API")
            if csl_matches:
                matches.extend(csl_matches)
        else:
            source_statuses.append(
                SourceStatus(
                    source="CSL API",
                    status="skipped",
                    message="CSL screening disabled for this request.",
                )
            )

        return self._dedupe_sanctions_matches(matches), source_statuses

    def _csl_screen(
        self,
        names: list[str],
        relation_map: dict[str, str],
        sources: list[str] | None,
        types: list[str] | None,
        countries: list[str] | None,
        address: str | None,
        city: str | None,
        state: str | None,
        postal_code: str | None,
        size: int,
    ) -> tuple[list[SanctionsMatch], SourceStatus]:
        filters = CSLSearchFilters(
            sources=self._normalize_values(sources, uppercase=True),
            types=self._normalize_values(types, uppercase=False),
            countries=self._normalize_values(countries, uppercase=True),
            address=address,
            city=city,
            state=state,
            postal_code=postal_code,
        )

        matches: list[SanctionsMatch] = []
        try:
            client = CSLClient()
            for name in names:
                relation = relation_map.get(normalize_name(name), "related_entity")
                records = client.search_name(name=name, filters=filters, size=size)
                for record in records:
                    score_raw = record.get("match_score")
                    score = float(score_raw) if isinstance(score_raw, (int, float)) else None
                    status = self._status_from_score(score)
                    matches.append(
                        SanctionsMatch(
                            name=name,
                            relationship=relation,
                            status=status,
                            score=score,
                            matched_name=record.get("matched_name") or record.get("entity_name"),
                            list_source=record.get("list_source") or "CSL",
                            match_type=record.get("match_type") or "name",
                        )
                    )
        except CSLClientError as exc:
            self.log.warning("tier2_csl_screen_failed", extra={"error": str(exc)})
            return matches, SourceStatus(
                source="CSL API",
                status="unavailable",
                message=f"CSL screening failed: {exc}",
            )

        return matches, SourceStatus(
            source="CSL API",
            status="checked",
            records_found=len(matches),
            message=f"Screened {len(names)} Tier 2 name(s) against the Consolidated Screening List API.",
        )

    def _relation_map(self, names: list[str], discovered: list[RelatedParty]) -> dict[str, str]:
        relation_map: dict[str, str] = {}
        for item in discovered:
            relation_map[normalize_name(item.name)] = item.relationship

        if names:
            # First name is always the requested target for Tier 2.
            relation_map[normalize_name(names[0])] = "target_entity"
        return relation_map

    def _status_from_score(self, score: float | None) -> str:
        if score is None:
            return "clear"
        if score >= 85:
            return "flagged"
        if score >= 70:
            return "review_needed"
        return "clear"

    def _normalize_values(self, values: list[str] | None, uppercase: bool) -> list[str] | None:
        if not values:
            return None
        out: list[str] = []
        for item in values:
            value = str(item).strip()
            if not value:
                continue
            out.append(value.upper() if uppercase else value)
        return out or None

    def _dedupe_sanctions_matches(self, matches: list[SanctionsMatch]) -> list[SanctionsMatch]:
        deduped: list[SanctionsMatch] = []
        seen: set[tuple[str, str, str, str, str, str]] = set()

        for item in matches:
            key = (
                normalize_name(item.name),
                item.relationship,
                item.status,
                normalize_name(item.matched_name or ""),
                (item.list_source or "").upper(),
                item.match_type or "",
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        deduped.sort(
            key=lambda item: (
                0 if item.status == "flagged" else 1 if item.status == "review_needed" else 2,
                -(item.score or 0.0),
            )
        )
        return deduped

    def _compute_risk(
        self,
        sanctions_matches: list[SanctionsMatch],
        adverse_media_count: int,
        related_entities_count: int,
        offshore_chain: bool,
        source_statuses: list[SourceStatus],
        coverage_status: CoverageStatus,
    ) -> tuple[list[Tier2RiskFlag], int]:
        points = 0
        flags: list[Tier2RiskFlag] = []
        # Tuple format: (flag_code, flagged_points, review_points)
        sanction_weights: dict[str, tuple[str, int, int]] = {
            "target_entity": ("target_entity_sanctioned", 50, 25),
            "director": ("director_sanctioned", 40, 20),
            "officer": ("director_sanctioned", 40, 20),
            "parent_company": ("parent_company_sanctioned", 35, 18),
            "ultimate_parent": ("parent_company_sanctioned", 35, 18),
            "subsidiary": ("subsidiary_sanctioned", 30, 15),
            "major_shareholder": ("major_shareholder_sanctioned", 30, 15),
            "beneficial_owner": ("major_shareholder_sanctioned", 30, 15),
            "related_entity": ("related_entity_sanctioned", 20, 10),
        }

        seen_codes: set[str] = set()
        for match in sanctions_matches:
            status = (match.status or "").lower()
            if status not in {"flagged", "review_needed"}:
                continue
            if match.relationship not in sanction_weights:
                continue
            base_code, flagged_weight, review_weight = sanction_weights[match.relationship]
            is_flagged = status == "flagged"
            code = base_code if is_flagged else f"{base_code}_review"
            weight = flagged_weight if is_flagged else review_weight
            if code in seen_codes:
                continue
            seen_codes.add(code)
            points += weight
            flags.append(
                Tier2RiskFlag(
                    code=code,
                    description=(
                        f"{'Flagged sanctions hit' if is_flagged else 'Review-level sanctions similarity'} "
                        f"on {match.relationship.replace('_', ' ')}: {match.name}"
                    ),
                    points=weight,
                )
            )

        if adverse_media_count > 0:
            points += 20
            flags.append(
                Tier2RiskFlag(
                    code="adverse_media",
                    description=f"Adverse media indicators detected ({adverse_media_count} finding(s)).",
                    points=20,
                )
            )

        if related_entities_count >= 6:
            points += 10
            flags.append(
                Tier2RiskFlag(
                    code="complex_ownership_structure",
                    description=f"Complex ownership structure inferred ({related_entities_count} related records).",
                    points=10,
                )
            )

        if offshore_chain:
            points += 10
            flags.append(
                Tier2RiskFlag(
                    code="offshore_ownership_chain",
                    description="Potential offshore ownership chain identified.",
                    points=10,
                )
            )

        failed_critical_sources = [
            status.source
            for status in source_statuses
            if status.status == "unavailable" and self._is_critical_source(status.source)
        ]
        partial_critical_sources = [
            status.source
            for status in source_statuses
            if status.status == "partial" and self._is_critical_source(status.source)
        ]
        if coverage_status == "failed":
            points += 40
            flags.append(
                Tier2RiskFlag(
                    code="tier2_screening_incomplete",
                    description="Core Tier 2 sanctions re-screening could not be completed.",
                    points=40,
                )
            )
        elif failed_critical_sources or partial_critical_sources:
            failed_text = ", ".join(sorted(set(failed_critical_sources + partial_critical_sources)))
            points += 25
            flags.append(
                Tier2RiskFlag(
                    code="tier2_partial_coverage",
                    description=f"Tier 2 coverage is incomplete for critical source(s): {failed_text}.",
                    points=25,
                )
            )
        return flags, min(100, points)

    def _provider_display_name(self, provider_name: str) -> str:
        return {
            "sec": "SEC EDGAR",
            "gleif": "GLEIF",
            "opencorporates": "OpenCorporates",
        }.get(provider_name, provider_name)

    def _dedupe_source_statuses(self, statuses: list[SourceStatus]) -> list[SourceStatus]:
        status_rank = {"unavailable": 0, "partial": 1, "checked": 2, "skipped": 3}
        deduped: dict[str, SourceStatus] = {}
        for status in statuses:
            key = status.source.strip().lower()
            existing = deduped.get(key)
            if not existing:
                deduped[key] = status
                continue
            if status_rank[status.status] < status_rank[existing.status]:
                deduped[key] = status
            elif status.status == existing.status:
                existing.records_found += status.records_found
                if not existing.message and status.message:
                    existing.message = status.message
                if not existing.url and status.url:
                    existing.url = status.url
        return sorted(deduped.values(), key=lambda item: item.source.lower())

    def _coverage(self, statuses: list[SourceStatus]) -> tuple[CoverageStatus, str, list[str]]:
        sanctions_sources = {"Local sanctions DB", "OFAC live file", "CSL API"}
        checked_sanctions = [
            status for status in statuses if status.source in sanctions_sources and status.status in {"checked", "partial"}
        ]
        failed_sanctions = [
            status for status in statuses if status.source in sanctions_sources and status.status == "unavailable"
        ]
        critical_failures = [
            status for status in statuses if status.status == "unavailable" and self._is_critical_source(status.source)
        ]
        partials = [
            status for status in statuses if status.status == "partial" and self._is_critical_source(status.source)
        ]
        skipped_critical = [
            status for status in statuses if status.status == "skipped" and self._is_critical_source(status.source)
        ]

        limitations: list[str] = []
        for status in [*critical_failures, *partials, *skipped_critical]:
            message = status.message or f"{status.source} was {status.status}."
            limitations.append(f"{status.source}: {message}")

        if not checked_sanctions:
            return (
                "failed",
                "Tier 2 could not complete sanctions re-screening because no sanctions source was available.",
                limitations,
            )

        if critical_failures or partials or failed_sanctions or skipped_critical:
            return (
                "partial",
                "Tier 2 completed with source limitations. Treat low-evidence results as leads, not clearance.",
                limitations,
            )

        return (
            "complete",
            "Tier 2 completed across the configured public registry, sanctions, and adverse-media sources.",
            limitations,
        )

    def _is_critical_source(self, source: str) -> bool:
        return source in {
            "SEC EDGAR",
            "GLEIF",
            "Local sanctions DB",
            "OFAC live file",
            "CSL API",
            "Sanctions re-screening",
        }


def serialize_tier2_response(result: Tier2ScreenResponse) -> dict[str, Any]:
    return result.model_dump(mode="json")


def normalize_tier2_findings(
    findings: dict[str, Any] | None,
    run_id: int,
    tier1_run_id: int | None = None,
    target_entity: str | None = None,
    risk_score: int | None = None,
    risk_level: str | None = None,
) -> dict[str, Any]:
    data = dict(findings or {})
    data["run_id"] = run_id
    if not isinstance(data.get("tier1_run_id"), int):
        data["tier1_run_id"] = tier1_run_id or 0
    if not isinstance(data.get("target_entity"), str):
        data["target_entity"] = target_entity or ""
    if not isinstance(data.get("risk_score"), int):
        data["risk_score"] = risk_score or 0
    if data.get("risk_level") not in {"low", "medium", "high"}:
        data["risk_level"] = risk_level if risk_level in {"low", "medium", "high"} else "low"

    list_defaults: dict[str, list[Any]] = {
        "parent_companies": [],
        "ultimate_parent": [],
        "subsidiaries": [],
        "sister_entities": [],
        "directors_and_officers": [],
        "major_shareholders": [],
        "beneficial_owners": [],
        "related_entities": [],
        "sanctions_matches": [],
        "adverse_media_findings": [],
        "risk_flags": [],
        "data_sources_used": [],
        "source_statuses": [],
        "limitations": [],
    }
    for key, default in list_defaults.items():
        if not isinstance(data.get(key), list):
            data[key] = list(default)

    if data.get("coverage_status") not in {"complete", "partial", "failed"}:
        data["coverage_status"] = "partial"
    if not isinstance(data.get("coverage_summary"), str):
        data["coverage_summary"] = None

    return data
