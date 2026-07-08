"""
SEC EDGAR supplemental source ingester.

This ingester is intentionally compatible with the existing sanctioned_entities schema.
It maps SEC filer/company metadata into SanctionedEntity rows with list_source="EDGAR".

Notes:
- EDGAR is not a sanctions list; this is a supplemental screening source.
- SEC fair-access guidance requires a declared User-Agent and reasonable request rates.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from database.repository import SanctionRepository, SyncStateRepository
from ingestion.base import BaseIngester

_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"

_DEFAULT_USER_AGENT = "TradeScreeningTool/1.0 (compliance@example.com)"
_DEFAULT_TIMEOUT_SECONDS = 30.0
_DEFAULT_MAX_COMPANIES = 400
_DEFAULT_DELAY_SECONDS = 0.15


def _env_float(name: str, default: float) -> float:
    import os

    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    import os

    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_str(name: str, default: str) -> str:
    import os

    raw = os.getenv(name)
    return raw.strip() if raw else default


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _compose_address(business_address: dict[str, Any] | None) -> tuple[str | None, str | None]:
    if not business_address:
        return None, None

    parts = [
        _safe_text(business_address.get("street1")),
        _safe_text(business_address.get("street2")),
        _safe_text(business_address.get("city")),
        _safe_text(business_address.get("stateOrCountry")),
        _safe_text(business_address.get("zipCode")),
    ]
    address = ", ".join(p for p in parts if p) or None
    country = _safe_text(
        business_address.get("countryCode")
        or business_address.get("country")
        or business_address.get("stateOrCountry")
    )
    return address, country


def _build_record(company: dict[str, Any], submission: dict[str, Any]) -> dict[str, Any]:
    name = _safe_text(company.get("title")) or _safe_text(submission.get("name")) or "Unknown SEC Filer"
    cik_int = int(company.get("cik_str") or 0)
    cik = str(cik_int).zfill(10)
    ticker = _safe_text(company.get("ticker"))

    former_names = submission.get("formerNames") or []
    aliases = []
    if ticker:
        aliases.append(ticker)
    for item in former_names:
        prev_name = _safe_text((item or {}).get("name"))
        if prev_name and prev_name not in aliases:
            aliases.append(prev_name)

    filings_recent = (submission.get("filings") or {}).get("recent") or {}
    latest_form = None
    latest_date = None
    forms = filings_recent.get("form") or []
    filing_dates = filings_recent.get("filingDate") or []
    if forms:
        latest_form = _safe_text(forms[0])
    if filing_dates:
        latest_date = _safe_text(filing_dates[0])

    business_address = (submission.get("addresses") or {}).get("business") or {}
    address, country = _compose_address(business_address)

    remarks_parts = []
    sic = _safe_text(submission.get("sic"))
    sic_desc = _safe_text(submission.get("sicDescription"))
    if sic and sic_desc:
        remarks_parts.append(f"SIC {sic}: {sic_desc}")
    if latest_form:
        remarks_parts.append(f"Latest filing form: {latest_form}")
    if latest_date:
        remarks_parts.append(f"Latest filing date: {latest_date}")

    return {
        "name": name,
        "aliases": aliases,
        "country": country,
        "list_source": "EDGAR",
        "list_id": f"CIK-{cik}",
        "entity_type": "company",
        "address": address,
        "programs": ["SEC_FILERS"],
        "remarks": "; ".join(remarks_parts) if remarks_parts else None,
    }


class SECEDGARIngester(BaseIngester):
    list_source = "EDGAR"

    def __init__(
        self,
        max_companies: int | None = None,
        request_delay_seconds: float | None = None,
    ):
        self.user_agent = _env_str("SEC_USER_AGENT", _DEFAULT_USER_AGENT)
        self.timeout_seconds = _env_float("SEC_TIMEOUT_SECONDS", _DEFAULT_TIMEOUT_SECONDS)
        self.max_companies = max_companies or _env_int("SEC_EDGAR_MAX_COMPANIES", _DEFAULT_MAX_COMPANIES)
        self.request_delay_seconds = (
            request_delay_seconds
            if request_delay_seconds is not None
            else _env_float("SEC_REQUEST_DELAY_SECONDS", _DEFAULT_DELAY_SECONDS)
        )

    def _headers(self) -> dict[str, str]:
        return {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }

    def _download_company_index(self) -> list[dict[str, Any]]:
        resp = httpx.get(
            _COMPANY_TICKERS_URL,
            headers=self._headers(),
            timeout=self.timeout_seconds,
            follow_redirects=True,
        )
        resp.raise_for_status()
        payload = resp.json()
        if isinstance(payload, dict):
            # SEC index shape is {"0": {...}, "1": {...}}
            entries = []
            for key in sorted(payload.keys(), key=lambda x: int(x) if str(x).isdigit() else x):
                value = payload.get(key)
                if isinstance(value, dict):
                    entries.append(value)
            return entries
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        return []

    def _download_submission(self, cik: int) -> dict[str, Any]:
        padded = str(cik).zfill(10)
        url = _SUBMISSIONS_URL.format(cik=padded)
        resp = httpx.get(
            url,
            headers=self._headers(),
            timeout=self.timeout_seconds,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}

    def needs_update(self, db: Session) -> bool:
        """
        Keep update logic simple and stable:
        - If never synced, update is required.
        - Otherwise, refresh once per UTC day.
        """
        state = SyncStateRepository(db).get(self.list_source)
        if not state or not state.last_synced_at:
            return True
        today_utc = datetime.now(timezone.utc).date()
        return state.last_synced_at.date() < today_utc

    def ingest(self, db: Session) -> int:
        sync_repo = SyncStateRepository(db)
        sanction_repo = SanctionRepository(db)

        try:
            companies = self._download_company_index()
        except Exception as exc:
            sync_repo.upsert(self.list_source, status="failed")
            raise RuntimeError(f"Failed to download SEC company index: {exc}") from exc

        if not companies:
            sync_repo.upsert(self.list_source, status="failed")
            raise RuntimeError("SEC company index returned no companies.")

        records: list[dict[str, Any]] = []
        failures = 0

        for company in companies[: self.max_companies]:
            cik_value = company.get("cik_str")
            if cik_value is None:
                continue
            try:
                submission = self._download_submission(int(cik_value))
                records.append(_build_record(company, submission))
            except Exception:
                failures += 1
            finally:
                time.sleep(max(0.0, self.request_delay_seconds))

        if not records:
            sync_repo.upsert(self.list_source, status="failed")
            raise RuntimeError(
                "SEC EDGAR ingest produced zero records. "
                "Check SEC_USER_AGENT and network availability."
            )

        sanction_repo.clear_list(self.list_source)
        sanction_repo.bulk_add(records)

        # publication_id as YYYYMMDD to track the batch date
        pub_id = int(datetime.now(timezone.utc).strftime("%Y%m%d"))
        sync_repo.upsert(
            self.list_source,
            publication_id=pub_id,
            entity_count=len(records),
            status="ok",
        )

        if failures:
            # Non-fatal: partial success is still useful in local/dev setups.
            print(
                f"[SEC EDGAR ingest] Completed with {failures} failed submission fetches "
                f"out of {min(self.max_companies, len(companies))} attempted."
            )

        return len(records)

