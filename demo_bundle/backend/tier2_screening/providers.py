import asyncio
import re
from collections.abc import Iterable
from typing import Any

from rapidfuzz import fuzz

from engine.resolver import normalize_name
from tier2_screening.config import tier2_settings
from tier2_screening.http_client import AsyncCachedHttpClient
from tier2_screening.schemas import AdverseMediaFinding, RelatedParty, SourceRef


OFFSHORE_HINTS = {"bvi", "cayman", "seychelles", "panama", "bermuda", "isle of man"}


def _pick_best_company_match(name: str, companies: Iterable[dict[str, Any]], title_key: str) -> dict[str, Any] | None:
    target = normalize_name(name)
    best = None
    best_score = 0.0
    for item in companies:
        title = str(item.get(title_key, ""))
        score = fuzz.token_sort_ratio(target, normalize_name(title))
        if score > best_score:
            best = item
            best_score = score
    return best if best_score >= 70 else None


class SecProvider:
    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http
        self.user_agent = tier2_settings.sec_user_agent
        self._rate_semaphore = asyncio.Semaphore(max(1, tier2_settings.sec_max_requests_per_second))

    async def _throttled_get_json(self, url: str) -> dict[str, Any] | list[Any] | None:
        async with self._rate_semaphore:
            payload = await self.http.get_json(url, headers={"User-Agent": self.user_agent})
            await asyncio.sleep(1 / max(1, tier2_settings.sec_max_requests_per_second))
            return payload

    async def discover(self, company_name: str) -> tuple[list[RelatedParty], list[str]]:
        related: list[RelatedParty] = []
        sources = {"SEC EDGAR"}
        tickers = await self._throttled_get_json("https://www.sec.gov/files/company_tickers.json")
        if not isinstance(tickers, dict):
            return related, sorted(sources)

        rows = list(tickers.values())
        best = _pick_best_company_match(company_name, rows, "title")
        if not best:
            return related, sorted(sources)

        cik = str(best.get("cik_str", "")).zfill(10)
        submissions = await self._throttled_get_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
        company_facts = await self._throttled_get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")

        if isinstance(submissions, dict):
            registrant = submissions.get("name")
            if isinstance(registrant, str) and registrant and normalize_name(registrant) != normalize_name(company_name):
                related.append(
                    RelatedParty(
                        name=registrant,
                        relationship="related_entity",
                        source_refs=[SourceRef(source="SEC EDGAR", url=f"https://data.sec.gov/submissions/CIK{cik}.json", note="Registrant name")],
                    )
                )
            filings = submissions.get("filings", {}).get("recent", {})
            forms = filings.get("form", []) if isinstance(filings, dict) else []
            accession_numbers = filings.get("accessionNumber", []) if isinstance(filings, dict) else []
            for idx, form in enumerate(forms):
                if str(form).upper() != "10-K":
                    continue
                accession = accession_numbers[idx] if idx < len(accession_numbers) else None
                if accession:
                    related.append(
                        RelatedParty(
                            name=company_name,
                            relationship="related_entity",
                            source_refs=[
                                SourceRef(
                                    source="SEC EDGAR",
                                    url=f"https://www.sec.gov/ixviewer/ix.html?doc=/Archives/edgar/data/{int(cik)}/{str(accession).replace('-', '')}/",
                                    note="10-K filing reference for Exhibit 21 lookup",
                                )
                            ],
                        )
                    )
                    break

        if isinstance(company_facts, dict):
            facts = company_facts.get("facts", {})
            us_gaap = facts.get("us-gaap", {}) if isinstance(facts, dict) else {}
            if isinstance(us_gaap, dict):
                key_candidates = [
                    "EntityCommonStockSharesOutstanding",
                    "CommonStockSharesOutstanding",
                ]
                if any(k in us_gaap for k in key_candidates):
                    related.append(
                        RelatedParty(
                            name=company_name,
                            relationship="major_shareholder",
                            source_refs=[
                                SourceRef(
                                    source="SEC Company Facts",
                                    url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
                                    note="Shares outstanding facts available",
                                )
                            ],
                        )
                    )
        return related, sorted(sources)


class GleifProvider:
    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def discover(self, company_name: str) -> tuple[list[RelatedParty], list[str]]:
        related: list[RelatedParty] = []
        sources = {"GLEIF"}
        payload = await self.http.get_json(
            f"{tier2_settings.gleif_base_url}/lei-records",
            params={"filter[entity.legalName]": company_name, "page[size]": 5},
        )
        if not isinstance(payload, dict):
            return related, sorted(sources)
        data = payload.get("data", [])
        if not isinstance(data, list) or not data:
            return related, sorted(sources)

        best = None
        best_score = 0.0
        for row in data:
            attrs = row.get("attributes", {})
            legal_name = attrs.get("entity", {}).get("legalName", {}).get("name", "")
            score = fuzz.token_sort_ratio(normalize_name(company_name), normalize_name(str(legal_name)))
            if score > best_score:
                best = row
                best_score = score
        if not best:
            return related, sorted(sources)

        attrs = best.get("attributes", {})
        rel = best.get("relationships", {})
        lei = attrs.get("lei")
        reg_auth = attrs.get("registration", {}).get("managingLou", "")
        if lei:
            related.append(
                RelatedParty(
                    name=str(attrs.get("entity", {}).get("legalName", {}).get("name", company_name)),
                    relationship="related_entity",
                    registration_number=str(lei),
                    source_refs=[SourceRef(source="GLEIF", url=f"{tier2_settings.gleif_base_url}/lei-records/{lei}", note=f"Registration authority: {reg_auth}")],
                )
            )

        for key, relationship in (
            ("direct-parents", "parent_company"),
            ("ultimate-parents", "ultimate_parent"),
        ):
            parent_rel = rel.get(key, {}).get("links", {}).get("related")
            if parent_rel:
                parent_payload = await self.http.get_json(str(parent_rel))
                if isinstance(parent_payload, dict):
                    parent_data = parent_payload.get("data")
                    if isinstance(parent_data, dict):
                        parent_name = (
                            parent_data.get("attributes", {})
                            .get("entity", {})
                            .get("legalName", {})
                            .get("name")
                        )
                        if parent_name:
                            related.append(
                                RelatedParty(
                                    name=str(parent_name),
                                    relationship=relationship,
                                    source_refs=[SourceRef(source="GLEIF", url=str(parent_rel))],
                                )
                            )
        return related, sorted(sources)


class OpenCorporatesProvider:
    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def discover(self, company_name: str) -> tuple[list[RelatedParty], list[str]]:
        # OpenCorporates now commonly requires an API token for reliable access.
        # Skip this provider when token is not configured to avoid repeated 401s.
        if not tier2_settings.opencorporates_api_token:
            return [], []

        related: list[RelatedParty] = []
        sources = {"OpenCorporates"}
        params: dict[str, Any] = {"q": company_name}
        params["api_token"] = tier2_settings.opencorporates_api_token
        company_search = await self.http.get_json(
            f"{tier2_settings.opencorporates_base_url}/companies/search",
            params=params,
        )
        if not isinstance(company_search, dict):
            return related, sorted(sources)
        companies = (
            company_search.get("results", {})
            .get("companies", [])
        )
        if not isinstance(companies, list) or not companies:
            return related, sorted(sources)

        first = companies[0].get("company", {}) if isinstance(companies[0], dict) else {}
        jurisdiction_code = first.get("jurisdiction_code")
        company_number = first.get("company_number")
        company_title = first.get("name", company_name)

        if jurisdiction_code and company_number:
            details_params = dict(params)
            details = await self.http.get_json(
                f"{tier2_settings.opencorporates_base_url}/companies/{jurisdiction_code}/{company_number}",
                params=details_params,
            )
            officers = (
                details.get("results", {})
                .get("company", {})
                .get("officers", [])
                if isinstance(details, dict)
                else []
            )
            if isinstance(officers, list):
                for item in officers[:25]:
                    officer = item.get("officer", {}) if isinstance(item, dict) else {}
                    name = officer.get("name")
                    role = str(officer.get("position", "")).lower()
                    if not name:
                        continue
                    relationship = "officer"
                    if "director" in role:
                        relationship = "director"
                    related.append(
                        RelatedParty(
                            name=str(name),
                            relationship=relationship,
                            jurisdiction=str(officer.get("jurisdiction_code") or jurisdiction_code or ""),
                            registration_number=str(officer.get("uid", "")) or None,
                            source_refs=[
                                SourceRef(
                                    source="OpenCorporates",
                                    url=f"{tier2_settings.opencorporates_base_url}/companies/{jurisdiction_code}/{company_number}",
                                    note=f"Officer position: {officer.get('position', 'N/A')}",
                                )
                            ],
                        )
                    )
        related.append(
            RelatedParty(
                name=str(company_title),
                relationship="related_entity",
                jurisdiction=str(jurisdiction_code) if jurisdiction_code else None,
                registration_number=str(company_number) if company_number else None,
                source_refs=[SourceRef(source="OpenCorporates", url=f"{tier2_settings.opencorporates_base_url}/companies/search")],
            )
        )
        return related, sorted(sources)


class AdverseMediaProvider:
    SOURCES = [
        ("SEC enforcement releases", "https://www.sec.gov/news/pressreleases.rss"),
        ("DOJ press releases", "https://www.justice.gov/news/press-releases?format=feed&type=rss"),
        ("FBI news releases", "https://www.fbi.gov/news/press-releases/rss.xml"),
        ("World Bank announcements", "https://www.worldbank.org/en/news/all"),
        ("World Bank debarred firms", "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms"),
    ]
    KEYWORDS = ["fraud", "corruption", "money laundering", "enforcement action"]

    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def scan(self, entity_names: list[str]) -> tuple[list[AdverseMediaFinding], list[str]]:
        findings: list[AdverseMediaFinding] = []
        used_sources = set()

        for source_name, url in self.SOURCES:
            text = await self.http.get_text(url)
            if not text:
                continue
            blob = text.lower()
            used_sources.add(source_name)
            for entity in entity_names:
                entity_norm = normalize_name(entity)
                if not entity_norm or entity_norm not in normalize_name(blob):
                    continue
                for keyword in self.KEYWORDS:
                    if keyword in blob:
                        findings.append(
                            AdverseMediaFinding(
                                entity_name=entity,
                                keyword=keyword,
                                source=source_name,
                                title=f"Potential {keyword} mention for {entity}",
                                url=url,
                            )
                        )
                        break
        return findings, sorted(used_sources)


def infer_offshore_chain(related: list[RelatedParty]) -> bool:
    for item in related:
        place = (item.jurisdiction or "").lower()
        if any(hint in place for hint in OFFSHORE_HINTS):
            return True
        for ref in item.source_refs:
            note = (ref.note or "").lower()
            if any(hint in note for hint in OFFSHORE_HINTS):
                return True
    return False


def dedupe_related(related: list[RelatedParty]) -> list[RelatedParty]:
    deduped: list[RelatedParty] = []
    seen: set[tuple[str, str]] = set()
    for item in related:
        key = (normalize_name(item.name), item.relationship)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def extract_structured_sections(related: list[RelatedParty]) -> dict[str, list[RelatedParty]]:
    out = {
        "parent_companies": [],
        "ultimate_parent": [],
        "subsidiaries": [],
        "sister_entities": [],
        "directors_and_officers": [],
        "major_shareholders": [],
        "beneficial_owners": [],
        "related_entities": [],
    }
    for item in related:
        if item.relationship == "parent_company":
            out["parent_companies"].append(item)
        elif item.relationship == "ultimate_parent":
            out["ultimate_parent"].append(item)
        elif item.relationship == "subsidiary":
            out["subsidiaries"].append(item)
        elif item.relationship == "sister_entity":
            out["sister_entities"].append(item)
        elif item.relationship in {"director", "officer"}:
            out["directors_and_officers"].append(item)
        elif item.relationship == "major_shareholder":
            out["major_shareholders"].append(item)
        elif item.relationship == "beneficial_owner":
            out["beneficial_owners"].append(item)
        else:
            out["related_entities"].append(item)
    return out


def infer_sister_entities(related: list[RelatedParty], target_entity: str) -> list[RelatedParty]:
    parents = [r for r in related if r.relationship in {"parent_company", "ultimate_parent"}]
    sisters: list[RelatedParty] = []
    for parent in parents:
        if re.search(r"holdings?|group", normalize_name(parent.name)):
            sisters.append(
                RelatedParty(
                    name=f"{target_entity} affiliated entity",
                    relationship="sister_entity",
                    source_refs=[
                        SourceRef(
                            source=parent.source_refs[0].source if parent.source_refs else "Derived",
                            url=parent.source_refs[0].url if parent.source_refs else None,
                            note=f"Inferred from parent relationship with {parent.name}",
                        )
                    ],
                )
            )
    return sisters


