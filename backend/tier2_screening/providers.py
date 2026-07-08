import asyncio
import html
import re
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from html.parser import HTMLParser
from typing import Any

from rapidfuzz import fuzz

from engine.resolver import normalize_name
from tier2_screening.config import tier2_settings
from tier2_screening.http_client import AsyncCachedHttpClient
from tier2_screening.schemas import (
    AdverseMediaFinding,
    RelatedParty,
    SourceRef,
    SourceStatus,
    SourceStatusValue,
)


OFFSHORE_HINTS = {"bvi", "cayman", "seychelles", "panama", "bermuda", "isle of man"}
SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"


def _pick_best_company_match(
    name: str,
    companies: Iterable[dict[str, Any]],
    title_key: str,
    min_score: float = 70.0,
) -> dict[str, Any] | None:
    target = normalize_name(name)
    best = None
    best_score = 0.0
    for item in companies:
        title = str(item.get(title_key, ""))
        score = fuzz.token_sort_ratio(target, normalize_name(title))
        if score > best_score:
            best = item
            best_score = score
    return best if best_score >= min_score else None


def _source_status(
    source: str,
    status: SourceStatusValue,
    records_found: int = 0,
    message: str | None = None,
    url: str | None = None,
) -> SourceStatus:
    return SourceStatus(
        source=source,
        status=status,
        records_found=max(0, records_found),
        message=message,
        url=url,
    )


class _TextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "address",
        "article",
        "br",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "p",
        "section",
        "table",
        "tbody",
        "tfoot",
        "thead",
        "tr",
        "ul",
    }
    CELL_TAGS = {"td", "th"}
    SKIP_TAGS = {"script", "style"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")
        if tag in self.CELL_TAGS:
            self._parts.append("\t")

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if tag in self.BLOCK_TAGS or tag in self.CELL_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str):
        if not self._skip_depth:
            self._parts.append(data)

    def text(self) -> str:
        return html.unescape("".join(self._parts))


def _html_to_text(raw: str) -> str:
    extractor = _TextExtractor()
    try:
        extractor.feed(raw)
        text = extractor.text()
    except Exception:
        text = html.unescape(raw)
    return text.replace("\xa0", " ")


_LEGAL_SUFFIX_PATTERN = (
    r"Inc(?:orporated)?|Corp(?:oration)?|Company|Co\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|"
    r"PLC|LLP|LP|GmbH|AG|S\.?A\.?|SAS|S\.?A\.?S\.?|Sarl|S\.?A\.?R\.?L\.?|"
    r"BV|B\.?V\.?|NV|N\.?V\.?|Pte\.?|Pty\.?|Oy|Oyj|AB|A\/S|ApS|Kft|SpA|"
    r"S\.?p\.?A\.?|S\.?r\.?l\.?|KK|Kabushiki Kaisha|FZE|FZCO|FZC|BVBA"
)
LEGAL_SUFFIX_RE = re.compile(rf"\b(?:{_LEGAL_SUFFIX_PATTERN})\b", re.IGNORECASE)
ENTITY_PHRASE_RE = re.compile(
    rf"\b[A-Z0-9][A-Za-z0-9&.,'()/+\-]*(?:\s+[A-Z0-9][A-Za-z0-9&.,'()/+\-]*){{0,16}}\s+"
    rf"(?:{_LEGAL_SUFFIX_PATTERN})\.?\b",
    re.IGNORECASE,
)
SEC_EXHIBIT_21_RE = re.compile(r"(?:^|[^0-9a-z])(?:ex(?:hibit)?[-_.\s]?)?21(?:\.\d+)?(?:[^0-9a-z]|$)", re.IGNORECASE)
SEC_ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}
SEC_SKIP_NORMALIZED = {
    "exhibit",
    "subsidiaries",
    "subsidiary",
    "name",
    "jurisdiction",
    "state",
    "country",
    "organization",
    "incorporation",
    "ownership",
    "registrant",
    "entity",
    "legal name",
    "schedule",
    "page",
}


def _clean_sec_candidate(candidate: str) -> str | None:
    value = html.unescape(candidate or "")
    value = re.sub(r"\s+", " ", value).strip(" \t\r\n,;:.")
    value = re.sub(r"^\(?\d+[a-z]?\)?[.)]?\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+\([^)]*(?:owned|ownership|percent|%)\)$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+\d{1,3}(?:\.\d+)?%$", "", value).strip(" ,;:.")
    if not value or len(value) < 3 or len(value) > 160:
        return None
    if not any(ch.isalpha() for ch in value):
        return None

    normalized = normalize_name(value)
    if not normalized or normalized in SEC_SKIP_NORMALIZED:
        return None
    if re.search(r"\b(table of contents|exhibit index|subsidiaries of registrant)\b", value, re.IGNORECASE):
        return None
    if not LEGAL_SUFFIX_RE.search(value):
        return None
    return value


def _extract_sec_subsidiaries(raw_document: str, target_name: str) -> list[str]:
    text = _html_to_text(raw_document)
    candidates: list[str] = []
    seen: set[str] = set()
    target_norm = normalize_name(target_name)

    for raw_line in text.splitlines():
        line = re.sub(r"[ \r\f\v]+", " ", raw_line).strip()
        if not line or len(line) < 3:
            continue
        normalized_line = normalize_name(line)
        if normalized_line in SEC_SKIP_NORMALIZED:
            continue

        row_candidates: list[str] = []
        columns = [part.strip() for part in re.split(r"\t+|\s{3,}|\s+\|\s+", line) if part.strip()]
        if columns:
            row_candidates.append(columns[0])
        row_candidates.extend(match.group(0) for match in ENTITY_PHRASE_RE.finditer(line))

        for candidate in row_candidates:
            cleaned = _clean_sec_candidate(candidate)
            if not cleaned:
                continue
            cleaned_norm = normalize_name(cleaned)
            if cleaned_norm == target_norm:
                continue
            if cleaned_norm in seen:
                continue
            seen.add(cleaned_norm)
            candidates.append(cleaned)
            if len(candidates) >= tier2_settings.tier2_sec_max_subsidiaries:
                return candidates
    return candidates


class SecProvider:
    source_name = "SEC EDGAR"

    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http
        self.user_agent = tier2_settings.sec_user_agent
        self._rate_semaphore = asyncio.Semaphore(max(1, tier2_settings.sec_max_requests_per_second))

    async def _throttled_get_json(self, url: str) -> dict[str, Any] | list[Any] | None:
        async with self._rate_semaphore:
            payload = await self.http.get_json(url, headers={"User-Agent": self.user_agent})
            await asyncio.sleep(1 / max(1, tier2_settings.sec_max_requests_per_second))
            return payload

    async def _throttled_get_text(self, url: str) -> str | None:
        async with self._rate_semaphore:
            payload = await self.http.get_text(url, headers={"User-Agent": self.user_agent})
            await asyncio.sleep(1 / max(1, tier2_settings.sec_max_requests_per_second))
            return payload

    async def discover(self, company_name: str, identifier: str | None = None) -> tuple[list[RelatedParty], list[SourceStatus]]:
        related: list[RelatedParty] = []
        tickers_url = "https://www.sec.gov/files/company_tickers.json"
        tickers = await self._throttled_get_json(tickers_url)
        if not isinstance(tickers, dict):
            return [], [
                _source_status(
                    self.source_name,
                    "unavailable",
                    message="SEC ticker index could not be retrieved.",
                    url=tickers_url,
                )
            ]

        rows = list(tickers.values())
        best = self._pick_company_match(company_name, rows, identifier)
        if not best:
            return [], [
                _source_status(
                    self.source_name,
                    "not_applicable",
                    message="No close SEC public-company match found; SEC filings may not apply to this private, foreign, or differently named entity.",
                    url=tickers_url,
                )
            ]

        cik = str(best.get("cik_str", "")).zfill(10)
        cik_int = str(int(cik))
        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        submissions = await self._throttled_get_json(submissions_url)
        if not isinstance(submissions, dict):
            return related, [
                _source_status(
                    self.source_name,
                    "partial",
                    message="SEC listed-company match found, but submissions data was unavailable.",
                    url=submissions_url,
                )
            ]

        registrant = submissions.get("name")
        if isinstance(registrant, str) and registrant and normalize_name(registrant) != normalize_name(company_name):
            related.append(
                RelatedParty(
                    name=registrant,
                    relationship="related_entity",
                    source_refs=[
                        SourceRef(
                            source=self.source_name,
                            url=submissions_url,
                            note="SEC registrant name for the screened entity; not a separate affiliate.",
                        )
                    ],
                )
            )

        filing = self._latest_annual_filing(submissions)
        if not filing:
            return related, [
                _source_status(
                    self.source_name,
                    "checked",
                    records_found=len(related),
                    message="SEC company record found, but no recent annual filing was listed for Exhibit 21 subsidiary extraction.",
                    url=submissions_url,
                )
            ]

        accession = str(filing["accession"]).replace("-", "")
        filing_dir = f"{SEC_ARCHIVES_BASE}/{cik_int}/{accession}"
        index_url = f"{filing_dir}/index.json"
        index = await self._throttled_get_json(index_url)
        if not isinstance(index, dict):
            return related, [
                _source_status(
                    self.source_name,
                    "partial",
                    records_found=len(related),
                    message="Annual filing found, but the filing document index could not be retrieved.",
                    url=index_url,
                )
            ]

        exhibit_name = self._find_exhibit_21_document(index)
        if not exhibit_name:
            filing_url = f"{filing_dir}/{filing.get('primary_document')}" if filing.get("primary_document") else index_url
            return related, [
                _source_status(
                    self.source_name,
                    "partial",
                    records_found=len(related),
                    message="Annual filing found, but an Exhibit 21 subsidiaries document was not listed.",
                    url=filing_url,
                )
            ]

        exhibit_url = f"{filing_dir}/{exhibit_name}"
        exhibit_text = await self._throttled_get_text(exhibit_url)
        if not exhibit_text:
            return related, [
                _source_status(
                    self.source_name,
                    "partial",
                    records_found=len(related),
                    message="Exhibit 21 document was listed but could not be retrieved.",
                    url=exhibit_url,
                )
            ]

        subsidiaries = _extract_sec_subsidiaries(exhibit_text, company_name)
        for subsidiary in subsidiaries:
            related.append(
                RelatedParty(
                    name=subsidiary,
                    relationship="subsidiary",
                    source_refs=[
                        SourceRef(
                            source=self.source_name,
                            url=exhibit_url,
                            note="Extracted from SEC annual filing Exhibit 21 subsidiaries document.",
                        )
                    ],
                )
            )

        return related, [
            _source_status(
                self.source_name,
                "checked",
                records_found=len(related),
                message=f"Matched CIK {cik}; parsed Exhibit 21 subsidiaries from annual filing.",
                url=exhibit_url,
            )
        ]

    def _latest_annual_filing(self, submissions: dict[str, Any]) -> dict[str, str] | None:
        filings = submissions.get("filings", {}).get("recent", {})
        if not isinstance(filings, dict):
            return None

        forms = filings.get("form", [])
        accession_numbers = filings.get("accessionNumber", [])
        primary_documents = filings.get("primaryDocument", [])
        if not isinstance(forms, list) or not isinstance(accession_numbers, list):
            return None

        for idx, form in enumerate(forms):
            if str(form).upper() not in SEC_ANNUAL_FORMS:
                continue
            if idx >= len(accession_numbers):
                continue
            primary_document = primary_documents[idx] if isinstance(primary_documents, list) and idx < len(primary_documents) else ""
            return {
                "accession": str(accession_numbers[idx]),
                "primary_document": str(primary_document or ""),
                "form": str(form),
            }
        return None

    def _find_exhibit_21_document(self, index_payload: dict[str, Any]) -> str | None:
        items = index_payload.get("directory", {}).get("item", [])
        if not isinstance(items, list):
            return None
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", ""))
            lower_name = name.lower()
            if not lower_name or lower_name.endswith((".jpg", ".jpeg", ".png", ".gif", ".xsd", ".zip")):
                continue
            if SEC_EXHIBIT_21_RE.search(lower_name):
                return name
        return None

    def _pick_company_match(
        self,
        company_name: str,
        rows: list[dict[str, Any]],
        identifier: str | None,
    ) -> dict[str, Any] | None:
        value = (identifier or "").strip()
        if value:
            normalized_identifier = re.sub(r"[^A-Za-z0-9]", "", value).lower()
            for row in rows:
                ticker = str(row.get("ticker", "")).lower()
                cik = str(row.get("cik_str", "")).lstrip("0")
                if normalized_identifier == ticker or normalized_identifier == cik:
                    return row

        return _pick_best_company_match(company_name, rows, "title", min_score=72.0)


class GleifProvider:
    source_name = "GLEIF"

    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def discover(
        self,
        company_name: str,
        country: str | None = None,
        identifier: str | None = None,
    ) -> tuple[list[RelatedParty], list[SourceStatus]]:
        related: list[RelatedParty] = []
        search_url = f"{tier2_settings.gleif_base_url}/lei-records"
        lei = self._normalize_lei(identifier)
        params: dict[str, Any] = (
            {"page[size]": 1}
            if lei
            else {"filter[entity.legalName]": company_name, "page[size]": 10}
        )
        if lei:
            search_url = f"{tier2_settings.gleif_base_url}/lei-records/{lei}"
        elif country:
            params["filter[entity.legalAddress.country]"] = country.upper()

        payload = await self.http.get_json(search_url, params=params)
        if not isinstance(payload, dict):
            return [], [
                _source_status(
                    self.source_name,
                    "unavailable",
                    message="GLEIF LEI search could not be retrieved.",
                    url=search_url,
                )
            ]
        data = payload.get("data", [])
        rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
        if not rows:
            return [], [
                _source_status(
                    self.source_name,
                    "not_applicable",
                    message="No matching LEI record found; LEI ownership data may not exist for this company.",
                    url=search_url,
                )
            ]

        best = None
        best_score = 0.0
        for row in rows:
            attrs = row.get("attributes", {}) if isinstance(row, dict) else {}
            legal_name = attrs.get("entity", {}).get("legalName", {}).get("name", "")
            score = fuzz.token_sort_ratio(normalize_name(company_name), normalize_name(str(legal_name)))
            if lei:
                score = max(score, 100.0)
            if score > best_score:
                best = row
                best_score = score
        if not isinstance(best, dict) or best_score < 72:
            return [], [
                _source_status(
                    self.source_name,
                    "not_applicable",
                    message="GLEIF returned candidates, but none were close enough. Add LEI, country, address, or exact legal name to improve ownership lookup.",
                    url=search_url,
                )
            ]

        attrs = best.get("attributes", {})
        relationships = best.get("relationships", {})
        lei = attrs.get("lei") or best.get("id")
        legal_name = attrs.get("entity", {}).get("legalName", {}).get("name")
        if lei and legal_name and normalize_name(str(legal_name)) != normalize_name(company_name):
            related.append(
                RelatedParty(
                    name=str(legal_name),
                    relationship="related_entity",
                    registration_number=str(lei),
                    source_refs=[
                        SourceRef(
                            source=self.source_name,
                            url=f"{tier2_settings.gleif_base_url}/lei-records/{lei}",
                            note="GLEIF legal name for the screened LEI record; not a separate affiliate.",
                        )
                    ],
                )
            )

        relationship_specs = (
            (("direct-parent", "direct-parents"), "parent_company"),
            (("ultimate-parent", "ultimate-parents"), "ultimate_parent"),
        )
        partial = False
        for keys, relationship in relationship_specs:
            parent_url = self._relationship_url(relationships, keys)
            if not parent_url:
                continue
            parent_payload = await self.http.get_json(parent_url)
            if not isinstance(parent_payload, dict):
                partial = True
                continue
            for parent_name in self._extract_lei_names(parent_payload):
                related.append(
                    RelatedParty(
                        name=parent_name,
                        relationship=relationship,  # type: ignore[arg-type]
                        source_refs=[SourceRef(source=self.source_name, url=parent_url)],
                    )
                )

        status = "partial" if partial else "checked"
        return related, [
            _source_status(
                self.source_name,
                status,
                records_found=len(related),
                message="LEI record checked for direct and ultimate parent relationships.",
                url=f"{tier2_settings.gleif_base_url}/lei-records/{lei}" if lei else search_url,
            )
        ]

    def _normalize_lei(self, identifier: str | None) -> str | None:
        value = re.sub(r"[^A-Za-z0-9]", "", identifier or "").upper()
        if len(value) == 20 and value.isalnum():
            return value
        return None

    def _relationship_url(self, relationships: dict[str, Any], keys: tuple[str, ...]) -> str | None:
        if not isinstance(relationships, dict):
            return None
        for key in keys:
            value = relationships.get(key, {})
            if not isinstance(value, dict):
                continue
            related_link = value.get("links", {}).get("related")
            if related_link:
                return str(related_link)
        return None

    def _extract_lei_names(self, payload: dict[str, Any]) -> list[str]:
        data = payload.get("data")
        rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
        names: list[str] = []
        seen: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = (
                row.get("attributes", {})
                .get("entity", {})
                .get("legalName", {})
                .get("name")
            )
            if not name:
                continue
            normalized = normalize_name(str(name))
            if normalized and normalized not in seen:
                seen.add(normalized)
                names.append(str(name))
        return names


class OpenCorporatesProvider:
    source_name = "OpenCorporates"

    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def discover(self, company_name: str) -> tuple[list[RelatedParty], list[SourceStatus]]:
        if not tier2_settings.opencorporates_api_token:
            return [], [
                _source_status(
                    self.source_name,
                    "not_configured",
                    message="Company-registry enrichment is not configured; OpenCorporates officers and related parties were not checked.",
                )
            ]

        related: list[RelatedParty] = []
        search_url = f"{tier2_settings.opencorporates_base_url}/companies/search"
        params: dict[str, Any] = {"q": company_name, "api_token": tier2_settings.opencorporates_api_token}
        company_search = await self.http.get_json(search_url, params=params)
        if not isinstance(company_search, dict):
            return [], [
                _source_status(
                    self.source_name,
                    "unavailable",
                    message="OpenCorporates company search could not be retrieved.",
                    url=search_url,
                )
            ]
        companies = company_search.get("results", {}).get("companies", [])
        if not isinstance(companies, list) or not companies:
            return [], [
                _source_status(
                    self.source_name,
                    "checked",
                    message="No OpenCorporates company record found.",
                    url=search_url,
                )
            ]

        best_company = self._pick_best_company(company_name, companies)
        if not best_company:
            return [], [
                _source_status(
                    self.source_name,
                    "checked",
                    message="OpenCorporates returned candidates, but none were close enough for officer lookup.",
                    url=search_url,
                )
            ]

        jurisdiction_code = best_company.get("jurisdiction_code")
        company_number = best_company.get("company_number")
        company_title = best_company.get("name", company_name)
        details_url = None

        if jurisdiction_code and company_number:
            details_url = f"{tier2_settings.opencorporates_base_url}/companies/{jurisdiction_code}/{company_number}"
            details = await self.http.get_json(details_url, params={"api_token": tier2_settings.opencorporates_api_token})
            if not isinstance(details, dict):
                return related, [
                    _source_status(
                        self.source_name,
                        "partial",
                        records_found=len(related),
                        message="Company record found, but officer details could not be retrieved.",
                        url=details_url,
                    )
                ]
            officers = details.get("results", {}).get("company", {}).get("officers", [])
            if isinstance(officers, list):
                for item in officers[:25]:
                    officer = item.get("officer", {}) if isinstance(item, dict) else {}
                    name = officer.get("name")
                    role = str(officer.get("position", "")).lower()
                    if not name:
                        continue
                    relationship = "director" if "director" in role else "officer"
                    related.append(
                        RelatedParty(
                            name=str(name),
                            relationship=relationship,
                            jurisdiction=str(officer.get("jurisdiction_code") or jurisdiction_code or ""),
                            registration_number=str(officer.get("uid", "")) or None,
                            source_refs=[
                                SourceRef(
                                    source=self.source_name,
                                    url=details_url,
                                    note=f"Officer position: {officer.get('position', 'N/A')}",
                                )
                            ],
                        )
                    )

        if company_title and normalize_name(str(company_title)) != normalize_name(company_name):
            related.append(
                RelatedParty(
                    name=str(company_title),
                    relationship="related_entity",
                    jurisdiction=str(jurisdiction_code) if jurisdiction_code else None,
                    registration_number=str(company_number) if company_number else None,
                    source_refs=[SourceRef(source=self.source_name, url=details_url or search_url)],
                )
            )

        return related, [
            _source_status(
                self.source_name,
                "checked",
                records_found=len(related),
                message="Company record checked for registered officers.",
                url=details_url or search_url,
            )
        ]

    def _pick_best_company(self, company_name: str, companies: list[Any]) -> dict[str, Any] | None:
        best = None
        best_score = 0.0
        for item in companies:
            company = item.get("company", {}) if isinstance(item, dict) else {}
            name = str(company.get("name", ""))
            score = fuzz.token_sort_ratio(normalize_name(company_name), normalize_name(name))
            if score > best_score:
                best = company
                best_score = score
        return best if isinstance(best, dict) and best_score >= 72 else None


def _strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(elem: ET.Element, names: set[str]) -> str:
    for child in list(elem):
        if _strip_namespace(child.tag) in names:
            return "".join(child.itertext()).strip()
    return ""


def _feed_link(elem: ET.Element) -> str | None:
    for child in list(elem):
        tag = _strip_namespace(child.tag)
        if tag == "link":
            href = child.attrib.get("href")
            if href:
                return href.strip()
            text = (child.text or "").strip()
            if text:
                return text
        if tag == "guid" and child.text:
            return child.text.strip()
    return None


def _parse_feed_items(feed_text: str) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(feed_text)
    except ET.ParseError:
        return []

    items: list[dict[str, str]] = []
    for elem in root.iter():
        tag = _strip_namespace(elem.tag)
        if tag not in {"item", "entry"}:
            continue
        title = _child_text(elem, {"title"})
        description = _child_text(elem, {"description", "summary", "content", "encoded"})
        link = _feed_link(elem)
        items.append(
            {
                "title": _html_to_text(title).strip(),
                "description": _html_to_text(description).strip(),
                "link": link or "",
            }
        )
    return items


def _parse_doj_news_items(payload: dict[str, Any]) -> list[dict[str, str]]:
    rows = payload.get("results", [])
    if not isinstance(rows, list):
        return []

    items: list[dict[str, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = _html_to_text(str(row.get("title") or "")).strip()
        body = _html_to_text(str(row.get("body") or "")).strip()
        url = str(row.get("url") or row.get("path") or "")
        if url and url.startswith("/"):
            url = f"https://www.justice.gov{url}"
        items.append(
            {
                "title": title or "Untitled DOJ press release",
                "description": body,
                "link": url,
            }
        )
    return items


def _plain_key(value: str) -> str:
    value = html.unescape(value or "").lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _entity_candidate_keys(entity_name: str) -> list[str]:
    full = _plain_key(entity_name)
    normalized = _plain_key(normalize_name(entity_name))
    keys: list[str] = []
    if full:
        keys.append(full)
    if normalized and normalized != full and len(normalized.split()) >= 2:
        keys.append(normalized)
    if full and len(full.split()) == 1 and len(full) >= 4:
        keys.append(full)
    return list(dict.fromkeys(keys))


def _keyword_positions(haystack: str, keyword: str) -> list[int]:
    needle = _plain_key(keyword)
    if not needle:
        return []
    return [match.start() for match in re.finditer(rf"\b{re.escape(needle)}\b", haystack)]


def _entity_positions(haystack: str, entity_name: str) -> list[int]:
    positions: list[int] = []
    for key in _entity_candidate_keys(entity_name):
        positions.extend(match.start() for match in re.finditer(rf"\b{re.escape(key)}\b", haystack))
    return positions


def _nearby_keyword(haystack: str, entity_name: str, keywords: list[str], max_distance: int = 320) -> str | None:
    entity_positions = _entity_positions(haystack, entity_name)
    if not entity_positions:
        return None
    for keyword in keywords:
        for keyword_pos in _keyword_positions(haystack, keyword):
            if any(abs(keyword_pos - entity_pos) <= max_distance for entity_pos in entity_positions):
                return keyword
    return None


def _snippet(raw_text: str, entity_name: str, keyword: str, max_length: int = 220) -> str:
    plain = re.sub(r"\s+", " ", _html_to_text(raw_text)).strip()
    lower = plain.lower()
    anchors = [keyword.lower(), entity_name.lower()]
    positions = [lower.find(anchor) for anchor in anchors if lower.find(anchor) >= 0]
    start = max(0, min(positions) - 80) if positions else 0
    return plain[start : start + max_length].strip()


class AdverseMediaProvider:
    SOURCES = [
        ("SEC enforcement releases", "rss", "https://www.sec.gov/news/pressreleases.rss"),
        ("DOJ press releases", "json", "https://www.justice.gov/api/v1/press_releases.json?pagesize=50"),
        ("FBI news releases", "rss", "https://www.fbi.gov/feeds/national-press-releases/rss.xml"),
    ]
    KEYWORDS = [
        "sanction",
        "sanctions",
        "fraud",
        "bribery",
        "corruption",
        "money laundering",
        "terrorist financing",
        "export control",
        "export controls",
        "debarred",
        "indictment",
        "guilty plea",
        "enforcement action",
    ]

    def __init__(self, http: AsyncCachedHttpClient):
        self.http = http

    async def scan(self, entity_names: list[str]) -> tuple[list[AdverseMediaFinding], list[SourceStatus]]:
        findings: list[AdverseMediaFinding] = []
        statuses: list[SourceStatus] = []
        seen: set[tuple[str, str, str]] = set()

        for source in self.SOURCES:
            source_name, source_type, url = self._source_parts(source)
            items = await self._load_source_items(source_type, url)
            if items is None:
                statuses.append(
                    _source_status(
                        source_name,
                        "unavailable",
                        message="Adverse-media source could not be retrieved; sanctions-list screening still ran.",
                        url=url,
                    )
                )
                continue

            if not items:
                statuses.append(
                    _source_status(
                        source_name,
                        "partial",
                        message="Adverse-media source was retrieved but no items could be parsed.",
                        url=url,
                    )
                )
                continue

            source_findings = 0
            for item in items:
                title = item["title"] or "Untitled item"
                body = f"{title}\n{item['description']}"
                haystack = _plain_key(body)
                for entity in entity_names:
                    keyword = _nearby_keyword(haystack, entity, self.KEYWORDS)
                    if not keyword:
                        continue
                    key = (normalize_name(entity), source_name, item.get("link") or title)
                    if key in seen:
                        continue
                    seen.add(key)
                    findings.append(
                        AdverseMediaFinding(
                            entity_name=entity,
                            keyword=keyword,
                            source=source_name,
                            title=title,
                            url=item.get("link") or url,
                            snippet=_snippet(body, entity, keyword),
                        )
                    )
                    source_findings += 1
                    if len(findings) >= tier2_settings.tier2_adverse_media_max_findings:
                        break
                if len(findings) >= tier2_settings.tier2_adverse_media_max_findings:
                    break

            statuses.append(
                _source_status(
                    source_name,
                    "checked",
                    records_found=source_findings,
                    message=f"Parsed {len(items)} item(s) with entity-keyword proximity checks.",
                    url=url,
                )
            )
            if len(findings) >= tier2_settings.tier2_adverse_media_max_findings:
                break
        return findings, statuses

    def _source_parts(self, source: tuple[str, ...]) -> tuple[str, str, str]:
        if len(source) == 2:
            return source[0], "rss", source[1]
        return source[0], source[1], source[2]

    async def _load_source_items(self, source_type: str, url: str) -> list[dict[str, str]] | None:
        headers = {"User-Agent": tier2_settings.tier2_user_agent}
        if source_type == "json":
            payload = await self.http.get_json(url, headers=headers)
            if not isinstance(payload, dict):
                return None
            return _parse_doj_news_items(payload)

        text = await self.http.get_text(url, headers=headers)
        if not text:
            return None
        return _parse_feed_items(text)


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
    # Sister companies are not inferred from generic words such as "Group" or
    # "Holdings". Only registry-sourced related parties should be screened.
    return []
