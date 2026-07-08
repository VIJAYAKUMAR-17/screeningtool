from typing import Any

from sqlalchemy.orm import Session

from database.repository import SanctionRepository
from engine import matcher as engine_matcher
from engine.resolver import normalize_name
from ingestion.ofac import fetch_live_entities
from services.csl_client import CSLClient, CSLClientError, CSLSearchFilters
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
    RelatedParty,
    SanctionsMatch,
    Tier2RiskFlag,
    Tier2ScreenResponse,
)


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
        data_sources = set()

        for provider_name, provider in (
            ("sec", sec_provider),
            ("gleif", gleif_provider),
            ("opencorporates", opencorp_provider),
        ):
            try:
                rel, sources = await provider.discover(target_entity)
                discovered.extend(rel)
                data_sources.update(sources)
            except Exception as exc:
                self.log.warning(
                    "tier2_provider_failure",
                    extra={"provider": provider_name, "target_entity": target_entity, "error": str(exc)},
                )

        discovered.extend(infer_sister_entities(discovered, target_entity))
        discovered = dedupe_related(discovered)

        names_to_screen = [target_entity, *[item.name for item in discovered]]
        sanctions_matches = self._rescreen_against_sanctions_sources(
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

        adverse_media_findings = []
        if include_adverse_media:
            adverse_media_findings, adverse_sources = await adverse_provider.scan(names_to_screen)
            data_sources.update(adverse_sources)

        sections = extract_structured_sections(discovered)
        risk_flags, risk_score = self._compute_risk(
            sanctions_matches=sanctions_matches,
            adverse_media_count=len(adverse_media_findings),
            related_entities_count=len(discovered),
            offshore_chain=infer_offshore_chain(discovered),
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
        )

    def _rescreen_against_sanctions_sources(
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
    ) -> list[SanctionsMatch]:
        sanction_repo = SanctionRepository(self.db)
        entities = sanction_repo.get_all()
        if entities:
            data_sources.add("Local sanctions DB")

        try:
            live_ofac_entities = fetch_live_entities()
            entities.extend(live_ofac_entities)
            if live_ofac_entities:
                data_sources.add("OFAC live file")
        except Exception as exc:
            self.log.warning("tier2_live_ofac_fetch_failed", extra={"error": str(exc)})

        relation_map = self._relation_map(names, discovered)

        matches: list[SanctionsMatch] = []
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

        if use_csl:
            data_sources.add("CSL API")
            csl_matches = self._csl_screen(
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
            if csl_matches:
                matches.extend(csl_matches)

        return self._dedupe_sanctions_matches(matches)

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
    ) -> list[SanctionsMatch]:
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

        return matches

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
        return flags, min(100, points)


def serialize_tier2_response(result: Tier2ScreenResponse) -> dict[str, Any]:
    return result.model_dump(mode="json")


