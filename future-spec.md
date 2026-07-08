# Screening Tool - Current Coverage and Future Specification

Last updated: 2026-07-08

## 1. What the app does today

The app screens company and vendor names against government sanctions lists and returns one of three outcomes per name: Clear, Review Required, or Match Found.
Every screening run and its results are stored in PostgreSQL as an audit trail.
Reports can be downloaded as PDF or Excel.

## 2. Which lists we currently check

### Live mode (default, `live_ofac=true`)

All Tier 1 screening queries go to the US Consolidated Screening List (CSL) API at data.trade.gov.
The CSL is a bundle of roughly 13 lists maintained by three US government agencies:

- US Treasury (OFAC): Specially Designated Nationals (SDN), Foreign Sanctions Evaders, Sectoral Sanctions Identifications, and others.
- US Commerce (BIS): Entity List, Denied Persons List, Unverified List, Military End User List.
- US State Department: Nonproliferation Sanctions, AECA Debarred List.

This data is live and current, because the US government updates the CSL as its source lists change.

### Database mode (`live_ofac=false`)

The app can also screen against lists ingested into its own database via CLI commands.
Ingesters exist for OFAC, UN, and Australia, plus SEC EDGAR as a supplemental source.
This mode is currently unreliable for production use, for reasons listed in section 3.

### What we do NOT check today

- United Nations Consolidated List (only a static file frozen in the repo; never refreshed).
- European Union Consolidated Financial Sanctions List (no ingester exists at all).
- United Kingdom (OFSI) list.
- Any other national list (Canada, Japan, Switzerland, and so on).

A party sanctioned only by the EU or UN, but not by the US, will come back Clear from this app today.
This is the single largest coverage gap.

## 3. Known gaps in current list handling

- The config flags `auto_sync_ofac_on_screening` and `ofac_sync_check_interval_seconds` are dead code; no automatic sync exists anywhere.
- The UN list is read from `data/UN/consolidatedLegacyByNAME.xml`, a file committed to the repo; it only changes if a developer manually replaces it.
- The file also uses the UN's deprecated legacy format.
- There is no EU or BIS ingester for database mode; those lists are only reachable through the live CSL path.
- Database ingest does a destructive delete-then-insert with no transaction; a failure mid-ingest leaves the list empty and produces false Clears.
- Tier 2 screening re-downloads three OFAC CSV files from ofac.treasury.gov on every request, with no caching.
- The UI does not tell the user which lists were actually checked in a given run.

## 4. Future: list coverage roadmap

### Phase 1 - Be honest about coverage

Show on every screening result and report exactly which sources were checked, for example "US Consolidated Screening List (13 US lists), checked live at 14:02 UTC".
Show a warning when the app falls back from live CSL to database mode, so stale data is never silently presented as current.

### Phase 2 - Add UN and EU live ingestion

Both feeds are free, official, and machine-readable:

- UN Consolidated List: XML feed from scsanctions.un.org (the current format, not the legacy one).
- EU Consolidated Financial Sanctions List: XML feed from the EU FSF service (webgate.ec.europa.eu).

Build a scheduled sync job (daily, plus on-demand) that:

1. Downloads each feed with ETag / Last-Modified checks so unchanged feeds are skipped.
2. Loads records into a staging table and swaps atomically in one transaction.
3. Refuses to commit if the record count drops implausibly (guards against truncated downloads).
4. Records the list version and sync timestamp so every screening run can state exactly which list snapshot it used.

Screening should then combine live CSL results with DB-backed UN and EU results in a single run.

### Phase 3 - Additional jurisdictions on demand

Add UK OFSI, Canada SEMA, and others based on which markets the business actually trades in.
The ingestion framework from Phase 2 should make each new list a small, repeatable task: one parser plus one feed URL.

## 5. Future: making the matching better

Current state after the July 2026 fixes: CSL relevance scores are re-scored locally with rapidfuzz, generic corporate words are down-weighted, verbatim token containment is boosted, thresholds come from config, and the customer name is metadata that is never screened.

Planned improvements, in order of value:

1. Use secondary identifiers to confirm or kill matches: country, address, date of birth, registration and tax numbers are already collected but ignored by scoring; a name match plus a country mismatch should demote, and a name match plus an ID match should escalate.
2. Persist the full candidate list per screening, not just the top match, so an analyst can see everything that was considered.
3. Add analyst disposition workflow: mark a match as false positive or confirmed, with reviewer name, timestamp, and notes; suppress re-alerting on names already dispositioned for the same list version.
4. Handle transliteration and script variants (Cyrillic, Arabic, Chinese names romanized in different ways), which plain token ratios miss.
5. Maintain a benchmark suite of known true positives and known false positives; run it in CI so any scoring change proves it does not regress either direction.
6. Tune thresholds per list: an SDN hit warrants a lower flag threshold than a supplemental data source.

## 6. Future: product hardening (summary of the open review items)

These are tracked from the July 2026 end-to-end review and are prerequisites for real end users:

- Authentication and per-tenant data isolation; today every visitor sees all runs.
- Dashboard metrics scoped to the logged-in tenant instead of global totals.
- Alembic migrations instead of create-all at startup.
- Rate limiting and input bounds on all endpoints.
- Restrict CORS to the real frontend origin.
- Escape user-supplied text in PDF generation and guard Excel cells against formula injection.
- Surface per-source success or failure in Tier 2 results instead of silently reporting low risk when providers fail.
- Route or remove the orphaned Audit Logs page; remove placeholder UI (notifications bell, hardcoded avatar, template legal text).
