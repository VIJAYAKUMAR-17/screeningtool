# Tier 2 Screening Module

This module implements Enhanced Due Diligence (EDD) as a standalone package under `backend/tier2_screening`.

## Features

- Ownership/related-party discovery via SEC EDGAR, GLEIF, and OpenCorporates.
- Re-screening of discovered entities/individuals with the existing Tier 1 screening engine.
- Adverse media scan using SEC/DOJ/FBI public feeds.
- Per-source coverage status (`checked`, `partial`, `unavailable`, `skipped`) so outages are not reported as clean results.
- Risk scoring and risk level classification.
- Async `httpx` requests with retry and shared TTL response caching.
- Structured logging and environment-driven configuration.

## API

- `POST /tier2/screen`
- `GET /tier2/runs/{tier1_run_id}`
- `GET /tier2/dashboard`

### `POST /tier2/screen` payload

```json
{
  "run_id": 12,
  "primary_entity": "Acme Corp",
  "include_adverse_media": true
}
```

`run_id` is the Tier 1 screening run id and is required.

## Environment variables

- `SEC_USER_AGENT`
- `SEC_MAX_REQUESTS_PER_SECOND`
- `SEC_TIMEOUT_SECONDS`
- `GLEIF_BASE_URL`
- `OPENCORPORATES_BASE_URL`
- `OPENCORPORATES_API_TOKEN`
- `TIER2_HTTP_TIMEOUT_SECONDS`
- `TIER2_HTTP_MAX_RETRIES`
- `TIER2_HTTP_BACKOFF_BASE_SECONDS`
- `TIER2_CACHE_TTL_SECONDS`
- `TIER2_LIVE_OFAC_TTL_SECONDS`
- `TIER2_SEC_MAX_SUBSIDIARIES`
- `TIER2_ADVERSE_MEDIA_MAX_FINDINGS`

## Notes

- SEC endpoints require a valid User-Agent.
- SEC subsidiary discovery parses listed Exhibit 21 documents when available; it does not invent affiliates from words like "Group" or "Holdings".
- OpenCorporates free tier can return limited fields/rate-limited responses.
- Adverse media findings require the screened entity and risk keyword in the same feed item near each other; blob-wide substring hits are ignored.
- Findings are persisted in `tier2_screening_runs` for dashboard and results-page reuse.
