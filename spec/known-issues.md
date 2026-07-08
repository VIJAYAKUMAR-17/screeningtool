# Known Issues - Screening Tool

Last updated: 2026-07-08
Sources: full code review (backend engine, API/ingestion, frontend) and live end-to-end QA testing.
Status values: FIXED (deployed and verified live), OPEN (not started).

## 1. Fixed and live

| #   | Issue | Fix |
| --- | ----- | --- |
| F1  | Customer name was screened as an entity, producing bogus "Match Found" rows and inflating counts | Customer name is metadata only; just vendors are screened (`backend/api/routes/screen.py`) |
| F2  | CSL API relevance score trusted as match confidence; "demo" flagged 90% against "Hong Kong DEMX Co., Ltd." | All matches re-scored locally with rapidfuzz against real names and aliases (`backend/services/csl_client.py`) |
| F3  | Generic words ("International", "Company") drove false flags | Generic corporate tokens down-weighted; such cases land in Review instead of Flagged |
| F4  | True positives missed: "Rosneft" scored 53 vs "Rosneft Oil Company" | Verbatim token containment boosts to review/flag level; Rosneft now flags at 100 |
| F5  | Flag/review thresholds hardcoded (85/70) in the route | Thresholds come from `config.py` settings |
| F6  | No input validation: empty or 1-2 character names screened and produced garbage hits | Names under 3 normalized characters rejected with 422; vendors deduped; vendor list capped at 500 |
| F7  | Tier 2 batch toast claimed success even when rows failed (stale state read) | Per-row outcomes returned and counted (`frontend/.../ScreeningPage.tsx`) |
| F8  | Deployed bundle called 127.0.0.1:8011; all buttons failed | Frontend built with same-origin API base and rebuilt in CI on every deploy |
| F9  | Repo tracked node_modules (58k files), build outputs, logs, sanctions.db, and .env files with a live API key | .gitignore added, files untracked; NOTE: rotate the CSL key since it remains in old git history |
| F10 | No coverage disclosure: "Clear" never said which lists were checked, live-to-DB fallback was silent, List column truncated | Runs persist `sources_checked` + `data_mode`; results banner, JSON report, PDF, and Excel all state lists checked and data source; fallback shows a warning toast; List column widened |

## 2. Critical - open

| #   | Issue                                                   | Detail                                                                                                                                                                                                |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | No authentication or tenancy                            | Every endpoint is public; anyone with the URL can screen, read all history, and download all reports; dashboard aggregates every user's runs globally                                                 |
| C2  | Failed/running/zero-result runs count in dashboard KPIs | QA posted 500 vendors and inflated Total Screenings to 1,026 with no results; KPI queries should filter run status; QA test pollution still sits in the database                                      |
| C3  | Excel formula injection                                 | Vendor names like `=SUM(1)` export as live formulas (`reporter/excel.py`); prefix-escape `= + - @` as text                                                                                            |
| C4  | Silent failure produces false CLEAR                     | Tier 2 now returns per-source coverage status and adds incomplete-coverage risk flags for critical provider/list failures; ingest errors can still silently keep stale data. (Partially addressed by F10 and the Tier 2 coverage-status work) |
| C5  | Sanctions data freshness is incomplete in DB mode       | Tier 2 can auto-load OFAC when the local fallback is empty, but there is still no scheduler or atomic freshness workflow; UN list is a static repo file in a deprecated format; no EU ingester exists, so DB mode misses those lists entirely |

## 3. Major - open

| #   | Issue                                        | Detail                                                                                                                                                                                                                               |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Country and Identifier fields are decorative | Collected in the UI, ignored by scoring, omitted from reports; should confirm/demote matches or be removed                                                                                                                           |
| M2  | PDF injection and font gaps                  | `<b>test</b>` renders as markup (ReportLab Paragraph markup not escaped); Japanese renders as black squares (`reporter/pdf.py`)                                                                                                      |
| M3  | PDF chart labels overlap and are unreadable  | `reporter/pdf.py` chart layout                                                                                                                                                                                                       |
| M4  | Bulk upload validation                       | No header validation (columns silently shift), accepts prose/.txt renamed as .csv, drag-and-drop skips type checks, no size/row cap (70k rows accepted with no warning or cancel), frontend "Valid" disagrees with backend 422 rules |
| M5  | Bulk Tier 2 progress and messaging           | "0/N ready" then "completed with N issue(s)" with no per-row status or failure reasons                                                                                                                                               |
| M6  | Bulk "Download All Reports" broken at scale  | Parallel per-run downloads hit 504s; "Preparing..." never resolves; needs sequential/zipped download with real error states                                                                                                          |
| M7  | Dashboard Custom Date filter inconsistency   | Empty custom range zeroes KPIs while the runs table still shows all runs                                                                                                                                                             |
| M8  | Dashboard row-click copy mismatch            | Copy says it opens detailed results; actually expands an inline panel                                                                                                                                                                |
| M9  | `GET /report/` limit uncapped                | `?limit=999999` returns everything; enforce a max and paginate                                                                                                                                                                       |
| M10 | Frontend min-length message wrong            | One-character vendor shows "Company/vendor name is required" instead of stating the 3-character minimum                                                                                                                              |
| M11 | Tier 2 blocks the event loop                 | Tier 2 live OFAC fetches are now cached and moved off the event loop; CSL calls are also moved off the event loop. Remaining risk: other sync DB work still runs inside async handlers.                                               |
| M12 | Only the top match is persisted              | The full candidate list exists only in the HTTP response; a compliance tool must retain all evidence                                                                                                                                 |
| M13 | No analyst disposition workflow              | No cleared-by/reviewed-at/false-positive fields. (Partially addressed by F10: runs now record lists and data mode; thresholds used are still not persisted)                                                                          |
| M14 | CORS wide open and no rate limiting          | `allow_origins=["*"]`; expensive endpoints are unthrottled                                                                                                                                                                           |
| M15 | Destructive list ingest                      | clear-then-insert without a transaction; a mid-ingest failure leaves the list empty and produces false CLEARs                                                                                                                        |
| M16 | Dashboard loads all runs into memory         | Stats computed in Python over the whole table (and the frontend recomputes from a capped limit=100 fetch); needs SQL aggregation                                                                                                     |
| M17 | Audit Logs page unreachable                  | Feature is built (`features/audit/AuditLogsPage.tsx`) but never registered in the router                                                                                                                                             |
| M18 | Tier 2 discovery quality                     | Fabricated sister entities removed; SEC discovery parses Exhibit 21 subsidiaries when available; FBI uses the official national press feed; DOJ uses the News API JSON; adverse media requires entity/keyword proximity in one item; GLEIF/SEC accept identifier hints; empty local OFAC fallback can auto-load during Tier 2. Remaining risk: registry depth still depends on public source coverage, scheduled local-list freshness, and OpenCorporates token availability. |
| M19 | No schema migrations                         | `create_all` at startup; schema changes will not migrate; adopt Alembic                                                                                                                                                              |

## 4. Minor - open

| #   | Issue                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Settings page ships placeholder copy ("Future controls: density, default filters...")                                               |
| N2  | Terms page shows the developer note "Obtain formal legal review before production publication" and a hardcoded future date          |
| N3  | Notifications bell and "CU" avatar are dead controls                                                                                |
| N4  | Console errors during normal use (MUI DataGrid width, Tier 2 404s, bulk 504s)                                                       |
| N5  | Mobile layouts: wide tables without scroll affordances                                                                              |
| N6  | Stuck chart tooltip persists across page navigation                                                                                 |
| N7  | Timezone handling: dates filtered by server date but displayed in local time with no timezone label; deprecated `datetime.utcnow()` |
| N8  | Dead code: unused API methods (`getDashboardStats`, `getDashboardCharts`), unused imports, duplicated chart color arrays            |
| N9  | Committed `sanctions.db` removed from tracking, but ambiguity remains between Postgres (production) and SQLite handling in `db.py`  |
| N10 | ALB serves plain HTTP directly; harmless today (CloudFront fronts it) but should redirect or be locked to CloudFront traffic        |

## 5. Suggested fix order

1. C2 + C3 + M9 + M10 (small, self-contained; clears the KPI pollution and injection risks in one deploy).
2. C1 authentication and tenant scoping (unblocks the rest; biggest single item).
3. C4 + C5 source honesty and real list syncing (kills false CLEARs; see future-spec.md Phase 1-2).
4. M1 + M12 + M13 (match evidence and audit workflow; makes the tool defensible for compliance).
5. M4-M6 bulk screening reliability.
6. Remaining majors, then minors.
