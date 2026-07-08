# Codebase Architecture - Screening Tool

Last updated: 2026-07-08
Companion documents: `spec/spec.md` (deployment/operations), `spec/known-issues.md` (defect tracker), `future-spec.md` (roadmap).

## 1. Big picture

The app is a two-part monorepo: a React single-page app (`frontend/`) and a FastAPI backend (`backend/`).
In production the frontend is compiled to static files and baked into the backend's Docker image, so one container serves both the UI and the API from the same origin.

```
                        the user's browser
                               |
                        React SPA (frontend/)
                               |  same-origin HTTP calls (axios)
                               v
 +---------------------- FastAPI (backend/api/main.py) ----------------------+
 |                                                                            |
 |  api/routes/screen.py      api/routes/tier2.py      api/routes/report.py  |
 |        |                        |                        |                 |
 |        v                        v                        v                 |
 |  services/csl_client.py   tier2_screening/          reporter/              |
 |  engine/ (matcher,          service.py                pdf.py               |
 |   resolver, graph)          providers.py              excel.py             |
 |        |                    http_client.py            erp_format.py        |
 |        |                        |                                          |
 |        v                        v                                          |
 |  database/ (models, repository, db)  <---  ingestion/ (ofac, un, ...)      |
 |        |                                        ^                          |
 +--------|----------------------------------------|--------------------------+
          v                                        |
   PostgreSQL (RDS)                        cli.py (manual ingest commands)
          
 External services called at runtime:
   - data.trade.gov CSL API   (Tier 1 live screening)
   - ofac.treasury.gov CSVs   (Tier 2 re-screen data)
   - SEC EDGAR, GLEIF, OpenCorporates, news RSS  (Tier 2 discovery)
   - Azure OpenAI             (optional AI analysis, agent/)
```

## 2. Backend modules (`backend/`)

### `api/` - the HTTP layer

- `main.py` - creates the FastAPI app, CORS, mounts the four routers, serves the SPA from `api/static/` with a catch-all fallback, exposes `/health`, and runs `init_db()` at startup.
- `routes/screen.py` - `POST /screen/` is the Tier 1 entry point. Validates input (min length, dedup, max 500 vendors), records the run with `sources_checked`/`data_mode`, screens each vendor either via the live CSL API or the local database, converts scores to statuses using thresholds from `config.py`, persists one result row per vendor, and returns results plus a `screening_sources` disclosure block. Also `POST /screen/vendors/link` to register Tier 2 supplier relationships.
- `routes/tier2.py` - `POST /tier2/screen` runs the deep check for one entity of an existing run; dashboard/list endpoints for Tier 2 history.
- `routes/report.py` - list runs, get one run as JSON, download PDF (`/{id}/pdf`), Excel (`/{id}/excel`), and ERP JSON (`/{id}/erp`).
- `routes/dashboard.py` - `/dashboard/stats` and `/dashboard/charts` aggregate all runs (note: the frontend currently computes its own KPIs from `/report/` instead; these endpoints are partly orphaned).

### `services/csl_client.py` - live list search

Client for the US Consolidated Screening List API (data.trade.gov).
Sends a fuzzy name query, then normalizes each returned record and RE-SCORES it locally (`_local_similarity`): rapidfuzz token ratios over the primary name and all aliases, generic corporate words down-weighted, verbatim token containment boosted.
The API's own relevance score is deliberately ignored (it caused false positives).
Raises typed errors (auth, rate limit, timeout, upstream) that `screen.py` maps to HTTP statuses.

### `engine/` - local matching (database mode)

- `resolver.py` - name normalization: lowercase, strip punctuation and legal suffixes (LLC, GmbH, Ltd, ...), collapse whitespace; token helpers.
- `matcher.py` - fuzzy matching of names against `SanctionedEntity` rows loaded from the DB; used when `live_ofac=false` and by the AI agent tools.
- `graph.py` - in-memory supplier graph (vendor parent/child links) used by the AI analyst.

### `tier2_screening/` - deep screening

- `service.py` - orchestrates a Tier 2 run: discovery via providers, then re-screens every discovered name against local sanctions data, live OFAC CSVs, and the CSL API; if the local sanctions table is empty and auto-sync is enabled, it auto-loads OFAC into the local fallback. It computes entity risk separately from coverage confidence, adds plain-English recommended action / summary / next steps, and persists a `Tier2ScreeningRun`.
- `providers.py` - SEC EDGAR (company tickers, filings), GLEIF, OpenCorporates, SEC/FBI RSS adverse media, DOJ News API adverse media, plus conservative related-party extraction. SEC/GLEIF use optional identifier/country hints when available.
- `http_client.py` / `cache.py` - shared async HTTP with retries and a simple cache.
- `schemas.py`, `config.py`, `logging_utils.py` - request/response models, Tier 2 settings, logging.
- Known weaknesses are tracked as C4/M11/M18 in `known-issues.md`; Tier 2 now distinguishes checked, unavailable, not configured, and not applicable source states instead of treating every gap as either clean or risky.

### `ingestion/` - loading lists into the database

- `base.py` - common `Ingester` interface (`needs_update`, `ingest`) and sync-state tracking.
- `ofac.py` - downloads and parses OFAC SDN/consolidated CSVs; also exposes `fetch_live_entities()` used by Tier 2 and `OFACIngester` for the Tier 2 first-run local fallback load.
- `un.py` - parses the UN consolidated XML from `data/UN/` (static file; see issue C5).
- `australia.py`, `sec_edgar.py` - other sources.
- Triggered manually via `cli.py`; Tier 2 can auto-load the OFAC local fallback when it is empty, but there is no recurring scheduler yet.

### `database/` - persistence

- `db.py` - SQLAlchemy engine/session from `config.settings.database_url`, `init_db()` (create_all plus lightweight `ALTER TABLE` migrations for columns added after first deploy).
- `models.py` - tables: `SanctionedEntity` (ingested list entries with aliases/programs), `Vendor` (screened companies, parent links for Tier 2), `ScreeningRun` (one screening submission: customer label, vendor names, `sources_checked`, `data_mode`, status, timings), `ScreeningResult` (one row per vendor per run: status, score, matched name, list source), `Tier2ScreeningRun` (risk score, findings JSON), `ListSyncState` (last ingest per source).
- `repository.py` - repository classes wrapping queries/commits for each aggregate.

### `reporter/` - exports

- `pdf.py` (ReportLab), `excel.py` (openpyxl), `erp_format.py` (JSON payload).
- All read a `ScreeningRun` with its results; PDF and Excel include the coverage disclosure (data source and lists checked).

### `agent/` - optional AI layer (Azure OpenAI)

- `analyst.py` screens with tool-calling against DB entities and the supplier graph; `narrator.py` writes the run summary; `tools.py`/`provider.py` wire the tools and client.
- Only used when a request sets `use_ai=true`; the frontend currently always sends `use_ai=false`.

### `config.py`

Pydantic settings loaded from environment/`.env`: `database_url`, CSL API key/base URL/timeout, match thresholds (`match_threshold=85`, `fuzzy_review_threshold=70`), Azure OpenAI settings.
In production these arrive as environment variables injected by ECS from SSM.

## 3. Frontend modules (`frontend/src/`)

- `main.tsx` / `App.tsx` / `app/router.tsx` - bootstrap, providers (React Query, theme, toaster), routes.
- `components/` - shared UI (layout shell `AppLayout` with nav/topbar, status chips, etc.).
- `features/` - one folder per page:
  - `screening/ScreeningPage.tsx` - the single-screen flow: form (customer label + vendor rows), calls `api.screenEntities`, shows the results grid, coverage banner, auto-runs Tier 2 per row, match-details dialog, PDF/Excel downloads.
  - `bulk/BulkScreeningPage.tsx` - CSV upload, parse (PapaParse), batch calls to `/screen/`, aggregate results and downloads.
  - `dashboard/DashboardPage.tsx` - KPIs and charts computed client-side from `/report/` data, plus the runs table (`results/ScreeningRunsPanel.tsx`).
  - `results/` - run history panel and details.
  - `settings/`, `legal/` - theme toggle stub, terms text.
  - `audit/` - built but not currently routed (issue M17).
- `services/api.ts` - the single API client: request/response mapping (snake_case to camelCase), live-to-DB fallback with user warning, bulk batching, file downloads via `file-saver`.
- `services/http.ts` - axios instance; base URL from `VITE_API_BASE_URL` (`/` in production, so same-origin).
- `types/api.ts` - shared TypeScript types for API payloads.
- `theme/`, `styles.css` - MUI theme; `test/` - vitest setup.

## 4. Key flows end to end

### Tier 1 screening

1. User fills the Screening form; `ScreeningPage` calls `api.screenEntities`.
2. `api.ts` POSTs `/screen/` with `live_ofac=true`; on network failure to the live service it warns the user and retries with `live_ofac=false`.
3. `screen.py` validates, records the run (with sources/mode), and for each vendor calls `CSLClient.search_name` (live) or `engine.matcher` (DB mode).
4. Matches are re-scored locally, statuses derived from config thresholds, one `ScreeningResult` per vendor persisted, response returned with `screening_sources`.
5. The page renders the grid and coverage banner, then fires Tier 2 for each row.

### Tier 2 screening

1. `ScreeningPage.runTier2ForEntity` POSTs `/tier2/screen` per row.
2. `tier2_screening/service.py` discovers related entities (SEC/GLEIF/OpenCorporates/media), re-screens all names against the local sanctions fallback, live OFAC CSVs, and CSL, computes entity risk and source-coverage confidence, then persists a `Tier2ScreeningRun` linked to the Tier 1 run.
3. The response includes source statuses, coverage summary, limitations, recommended action, analyst summary, and next steps.
4. The eye icon opens the findings dialog from the stored result; the UI shows guidance first and raw source evidence under expandable detail.

### Reports

`GET /report/{id}/pdf|excel|erp` loads the run + results from Postgres and renders the file in memory; the browser downloads it via `api.ts` blob handling.

### List ingestion (manual, DB mode only)

`python cli.py ingest-...` runs an `ingestion/` module, which fetches/parses a source, clears that list's rows, bulk-inserts fresh ones, and updates `ListSyncState`.

## 5. Where state lives

- PostgreSQL: all runs, results, vendors, Tier 2 findings, ingested list entries, sync state.
- SSM Parameter Store: secrets (`DATABASE_URL`, CSL API key).
- Browser memory: React Query cache plus a module-level results cache on the Screening page (survives navigation within a session).
- Nothing else is stateful; containers are disposable.
