# Tier 2 Screening Module

This module implements Enhanced Due Diligence (EDD) as a standalone package under `backend/tier2_screening`.

## Features

- Ownership/related-party discovery via SEC EDGAR, GLEIF, and OpenCorporates, with optional identifier/country hints.
- Re-screening of discovered entities/individuals with the existing Tier 1 screening engine, live OFAC data, and the local sanctions fallback.
- Automatic first-run OFAC local fallback load when the local sanctions DB is empty and `AUTO_SYNC_OFAC_ON_SCREENING=true`.
- Adverse media scan using SEC RSS, DOJ News API JSON, and the FBI national press-release RSS feed.
- Per-source coverage status (`checked`, `partial`, `unavailable`, `skipped`, `not_configured`, `not_applicable`) so outages and non-applicable registry checks are not reported as clean results.
- Risk scoring and risk level classification, kept separate from source-coverage confidence.
- Plain-English `recommended_action`, `analyst_summary`, and `next_steps` for non-specialist users.
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
  "country": "US",
  "identifier": "AAPL",
  "include_adverse_media": true
}
```

`run_id` is the Tier 1 screening run id and is required. `identifier` can be an LEI, ticker, CIK, or registration identifier; when it is a valid LEI/ticker/CIK, Tier 2 uses it to improve GLEIF/SEC matching.

## Environment variables

- `SEC_USER_AGENT`
- `TIER2_USER_AGENT`
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
- `AUTO_SYNC_OFAC_ON_SCREENING`
- `OFAC_SYNC_CHECK_INTERVAL_SECONDS`

## Notes

- SEC and FBI endpoints require a valid User-Agent.
- If the local sanctions DB is empty and auto-sync is enabled, Tier 2 attempts to load OFAC records before marking the local fallback as missing.
- SEC subsidiary discovery parses listed Exhibit 21 documents when available; it does not invent affiliates from words like "Group" or "Holdings".
- OpenCorporates requires `OPENCORPORATES_API_TOKEN`; without it, registry enrichment is marked `not_configured`.
- GLEIF/SEC no-match outcomes are marked `not_applicable` when the source works but no reliable company record is found.
- Adverse media findings require the screened entity and risk keyword in the same feed item near each other; blob-wide substring hits are ignored.
- Coverage gaps change confidence and next-step guidance; they do not by themselves increase the entity risk score.
- Findings are persisted in `tier2_screening_runs` for dashboard and results-page reuse.
