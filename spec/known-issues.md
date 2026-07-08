ive end-to-end QA testing.
Status values: FIXED (deployed and verified live), OPEN (not started).

## 2. Critical - open

| #   | Issue                                                   | Detail                                                                                                                                                                                                |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | No authentication or tenancy                            | Every endpoint is public; anyone with the URL can screen, read all history, and download all reports; dashboard aggregates every user's runs globally                                                 |
| C2  | Failed/running/zero-result runs count in dashboard KPIs | QA posted 500 vendors and inflated Total Screenings to 1,026 with no results; KPI queries should filter run status; QA test pollution still sits in the database                                      |
| C3  | Excel formula injection                                 | Vendor names like `=SUM(1)` export as live formulas (`reporter/excel.py`); prefix-escape `= + - @` as text                                                                                            |
| C4  | Silent failure produces false CLEAR                     | Tier 2 provider outages log a warning and still report low risk; ingest errors silently keep stale data; live-to-DB fallback happens without telling the user which source actually served the result |
| C5  | Sanctions data freshness is broken in DB mode           | auto-sync config flags are dead code; UN list is a static repo file in a deprecated format; no EU or BIS ingester exists, so DB mode misses those lists entirely                                      |

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
| M11 | Tier 2 blocks the event loop                 | Synchronous OFAC CSV downloads and CSL calls inside async handlers stall all other requests; OFAC files re-downloaded on every request with no cache                                                                                 |
| M12 | Only the top match is persisted              | The full candidate list exists only in the HTTP response; a compliance tool must retain all evidence                                                                                                                                 |
| M13 | No analyst disposition workflow              | No cleared-by/reviewed-at/false-positive fields; runs do not record which lists and thresholds were used, so results are not reproducible                                                                                            |
| M14 | CORS wide open and no rate limiting          | `allow_origins=["*"]`; expensive endpoints are unthrottled                                                                                                                                                                           |
| M15 | Destructive list ingest                      | clear-then-insert without a transaction; a mid-ingest failure leaves the list empty and produces false CLEARs                                                                                                                        |
| M16 | Dashboard loads all runs into memory         | Stats computed in Python over the whole table (and the frontend recomputes from a capped limit=100 fetch); needs SQL aggregation                                                                                                     |
| M17 | Audit Logs page unreachable                  | Feature is built (`features/audit/AuditLogsPage.tsx`) but never registered in the router                                                                                                                                             |
| M18 | Tier 2 discovery quality                     | SEC provider fabricates "affiliated entity" names that then get screened; adverse media is a substring scan over RSS blobs producing noise                                                                                           |
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
