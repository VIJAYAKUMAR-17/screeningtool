import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from rapidfuzz import fuzz

from config import settings
from engine.resolver import normalize_name

log = logging.getLogger(__name__)


class CSLClientError(Exception):
    """Base error for CSL API client failures."""


class CSLAuthError(CSLClientError):
    """Raised for 401/403 responses."""


class CSLRateLimitError(CSLClientError):
    """Raised for 429 responses."""


class CSLUpstreamError(CSLClientError):
    """Raised for 5xx responses."""


class CSLTimeoutError(CSLClientError):
    """Raised for timeout failures."""


class CSLNetworkError(CSLClientError):
    """Raised for non-timeout transport failures."""


@dataclass
class CSLSearchFilters:
    sources: list[str] | None = None
    types: list[str] | None = None
    countries: list[str] | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None


class CSLClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int = 2,
        backoff_seconds: float = 0.8,
    ):
        self.api_key = (api_key if api_key is not None else settings.tier1_csl_api_key).strip()
        self.base_url = (base_url if base_url is not None else settings.tier1_csl_base_url).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.tier1_csl_timeout_seconds
        )
        self.max_retries = max(0, max_retries)
        self.backoff_seconds = max(0.0, backoff_seconds)

    def search_name(
        self,
        name: str,
        filters: CSLSearchFilters | None = None,
        size: int = 50,
    ) -> list[dict[str, Any]]:
        query = (name or "").strip()
        if not query:
            return []

        if not self.api_key:
            raise CSLAuthError("CSL API key is missing. Set TIER1_CSL_API_KEY in backend/.env.")

        params: dict[str, Any] = {
            "name": query,
            "size": max(1, min(size, 250)),
            "fuzzy_name": "true",
        }

        if filters:
            if filters.sources:
                params["sources"] = ",".join(filters.sources)
            if filters.types:
                params["type"] = ",".join(filters.types)
            if filters.countries:
                params["countries"] = ",".join(filters.countries)
            if filters.address:
                params["address"] = filters.address
            if filters.city:
                params["city"] = filters.city
            if filters.state:
                params["state"] = filters.state
            if filters.postal_code:
                params["postal_code"] = filters.postal_code

        response = self._request_with_retry("/search", params)
        records = _extract_records(response)

        normalized: list[dict[str, Any]] = []
        for raw in records:
            if not isinstance(raw, dict):
                continue
            normalized.append(_normalize_record(raw, query))

        normalized.sort(key=lambda item: item.get("match_score", 0.0), reverse=True)
        return normalized

    def _request_with_retry(self, path: str, params: dict[str, Any]) -> Any:
        url = f"{self.base_url}{path}"
        request_params = dict(params)
        # data.trade.gov expects API key as `subscription-key` query parameter.
        request_params["subscription-key"] = self.api_key
        headers = {
            "Accept": "application/json",
        }

        attempts = self.max_retries + 1
        for attempt in range(1, attempts + 1):
            start = time.perf_counter()
            try:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    resp = client.get(url, headers=headers, params=request_params)
                elapsed_ms = int((time.perf_counter() - start) * 1000)

                log.info(
                    "CSL request complete path=%s status=%s latency_ms=%s attempt=%s",
                    path,
                    resp.status_code,
                    elapsed_ms,
                    attempt,
                )

                if resp.status_code in (401, 403):
                    raise CSLAuthError("CSL API authorization failed (401/403). Check TIER1_CSL_API_KEY.")
                if resp.status_code == 429:
                    if attempt < attempts:
                        time.sleep(self.backoff_seconds * attempt)
                        continue
                    raise CSLRateLimitError("CSL API rate limit exceeded (429). Retry shortly.")
                if 500 <= resp.status_code <= 599:
                    if attempt < attempts:
                        time.sleep(self.backoff_seconds * attempt)
                        continue
                    raise CSLUpstreamError(f"CSL API upstream error ({resp.status_code}).")

                resp.raise_for_status()
                return resp.json()

            except httpx.TimeoutException as exc:
                if attempt < attempts:
                    time.sleep(self.backoff_seconds * attempt)
                    continue
                raise CSLTimeoutError("CSL API request timed out.") from exc
            except httpx.RequestError as exc:
                if attempt < attempts:
                    time.sleep(self.backoff_seconds * attempt)
                    continue
                raise CSLNetworkError(f"CSL API network error: {exc}") from exc

        raise CSLClientError("CSL API request failed after retries.")


def _extract_records(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        status_code = payload.get("statusCode")
        if isinstance(status_code, int) and status_code >= 400:
            message = payload.get("message") or "CSL API returned an error payload."
            if status_code in (401, 403):
                raise CSLAuthError(str(message))
            if status_code == 429:
                raise CSLRateLimitError(str(message))
            if status_code >= 500:
                raise CSLUpstreamError(str(message))
            raise CSLClientError(str(message))

        for key in ("results", "data", "items", "value"):
            value = payload.get(key)
            if isinstance(value, list):
                return value

    return []


def _normalize_record(raw: dict[str, Any], query_name: str) -> dict[str, Any]:
    name = _first_str(raw, ["name", "entity_name", "title", "alt_name"]) or ""
    source = _first_str(raw, ["source", "list_source", "list", "dataset"]) or "CSL"
    list_id = _first_str(raw, ["id", "entity_number", "uid", "source_id"])

    entity_type = _first_str(raw, ["type", "entity_type", "record_type", "category"])

    address = _first_str(raw, ["address", "address1", "street", "street1"])
    city = _first_str(raw, ["city", "locality", "town"])
    state = _first_str(raw, ["state", "province", "region"])
    postal_code = _first_str(raw, ["postal_code", "zip", "zip_code", "postcode"])
    country = _first_str(raw, ["country", "country_name", "country_code"])

    addresses = raw.get("addresses")
    if isinstance(addresses, list) and addresses:
        first = next((a for a in addresses if isinstance(a, dict)), None)
        if first:
            address = address or _first_str(first, ["address", "address1", "street", "street1"])
            city = city or _first_str(first, ["city", "locality", "town"])
            state = state or _first_str(first, ["state", "province", "region"])
            postal_code = postal_code or _first_str(first, ["postal_code", "zip", "zip_code", "postcode"])
            country = country or _first_str(first, ["country", "country_name", "country_code"])

    programs = _to_list(raw.get("programs"))
    if not programs:
        program = _first_str(raw, ["program", "sanction_program", "list_program"])
        programs = [program] if program else []

    remarks = _first_str(raw, ["remarks", "comment", "comments", "note", "notes", "summary"])

    score = _first_float(raw, ["score", "match_score", "name_score", "relevance"])
    if score is None:
        score = float(fuzz.token_sort_ratio(normalize_name(query_name), normalize_name(name)))

    return {
        "entity_name": name,
        "matched_name": name,
        "match_score": round(float(score), 2),
        "match_type": "name",
        "list_source": source,
        "list_id": list_id,
        "entity_type": entity_type,
        "address": address,
        "city": city,
        "state": state,
        "postal_code": postal_code,
        "country": country,
        "programs": programs,
        "remarks": remarks,
        # Preserve all additional API metadata for downstream audit/debug use.
        "metadata": raw,
    }


def _first_str(obj: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = obj.get(key)
        if isinstance(value, str):
            s = value.strip()
            if s:
                return s
    return None


def _first_float(obj: dict[str, Any], keys: list[str]) -> float | None:
    for key in keys:
        value = obj.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _to_list(value: Any) -> list[str]:
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
        return out

    if isinstance(value, str) and value.strip():
        return [v.strip() for v in value.split(",") if v.strip()]

    return []

