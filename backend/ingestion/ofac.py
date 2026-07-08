"""
OFAC Sanctions List Service (SLS) ingester.

Uses the public OFAC REST API — no API key required:
  https://sanctionslistservice.ofac.treas.gov

Strategy:
  - needs_update()  → GET /changes/history/{year} and compare latest publicationID
                       with what we stored in ListSyncState
  - ingest()        → download CONS_PRIM.CSV, CONS_ALT.CSV, CONS_ADD.CSV,
                       join on ent_num, bulk-load into DB
"""

import csv
import io
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from database.repository import SanctionRepository, SyncStateRepository
from ingestion.base import BaseIngester

log = logging.getLogger(__name__)

_BASE = "https://sanctionslistservice.ofac.treas.gov"
_TIMEOUT = 60          # seconds — list files can be large
_NULL = "-0-"          # OFAC sentinel for empty fields

# OFAC sdn_type → our EntityType value
_ENTITY_TYPE_MAP = {
    "individual": "individual",
    "entity":     "company",
    "vessel":     "vessel",
    "aircraft":   "aircraft",
}


def _v(raw: str | None) -> str | None:
    """Strip whitespace; return None for OFAC's -0- null sentinel."""
    if raw is None:
        return None
    s = raw.strip()
    return None if (not s or s == _NULL) else s


def _get(path: str, **kwargs) -> httpx.Response:
    url = f"{_BASE}{path}"
    resp = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True, **kwargs)
    resp.raise_for_status()
    return resp


# ── Publication ID helpers ────────────────────────────────────────────────────

def _latest_publication_id() -> int | None:
    """Return the highest publicationID published this year, or None on error."""
    year = datetime.now(timezone.utc).year
    try:
        data = _get(f"/changes/history/{year}").json()
        if data:
            return max(item["publicationID"] for item in data)
    except Exception as exc:
        log.warning("Could not fetch OFAC publication history: %s", exc)
    return None


# ── CSV download & parse ──────────────────────────────────────────────────────

def _download_csv(filename: str) -> list[list[str]]:
    """Download an OFAC CSV file and return rows as lists of strings."""
    content = _get(f"/api/download/{filename}").content
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    return list(reader)


def _parse_primary(rows: list[list[str]]) -> dict[str, dict]:
    """
    CONS_PRIM.CSV columns (no header row):
      0  ent_num
      1  sdn_name
      2  sdn_type   (Individual / Entity / Vessel / Aircraft)
      3  program
      4  title
      5  call_sign
      6  vess_type
      7  tonnage
      8  grt
      9  vess_flag
      10 vess_owner
      11 remarks

    Entities can appear on multiple rows (one per program).
    We group by ent_num, collecting all programs.
    """
    entities: dict[str, dict] = {}

    for row in rows:
        if len(row) < 4:
            continue
        eid = _v(row[0])
        if not eid:
            continue

        name    = _v(row[1])
        etype   = _ENTITY_TYPE_MAP.get((_v(row[2]) or "entity").lower(), "company")
        program = _v(row[3])
        remarks = _v(row[11]) if len(row) > 11 else None

        if eid not in entities:
            entities[eid] = {
                "list_id":     eid,
                "name":        name or "",
                "entity_type": etype,
                "programs":    [],
                "remarks":     remarks,
                "list_source": "OFAC",
                "aliases":     [],
                "country":     None,
                "address":     None,
            }

        if program and program not in entities[eid]["programs"]:
            entities[eid]["programs"].append(program)

    return entities


def _apply_aliases(entities: dict, rows: list[list[str]]):
    """
    CONS_ALT.CSV columns:
      0  ent_num
      1  alt_num
      2  alt_type   (a.k.a. / f.k.a. / n.k.a.)
      3  alt_name
      4  alt_remarks
    """
    for row in rows:
        if len(row) < 4:
            continue
        eid      = _v(row[0])
        alt_name = _v(row[3])
        if eid and alt_name and eid in entities:
            if alt_name not in entities[eid]["aliases"]:
                entities[eid]["aliases"].append(alt_name)


def _apply_addresses(entities: dict, rows: list[list[str]]):
    """
    CONS_ADD.CSV columns:
      0  ent_num
      1  add_num
      2  address
      3  city
      4  state_province
      5  postal_code
      6  country
      7  add_remarks

    We take the first address per entity for country and address string.
    """
    seen: set[str] = set()

    for row in rows:
        if len(row) < 7:
            continue
        eid = _v(row[0])
        if not eid or eid not in entities or eid in seen:
            continue

        parts = [_v(row[2]), _v(row[3]), _v(row[4]), _v(row[5]), _v(row[6])]
        address_str = ", ".join(p for p in parts if p)
        country     = _v(row[6])

        entities[eid]["address"] = address_str or None
        entities[eid]["country"] = country
        seen.add(eid)


# ── Ingester class ────────────────────────────────────────────────────────────

class OFACIngester(BaseIngester):
    list_source = "OFAC"

    def needs_update(self, db: Session) -> bool:
        state = SyncStateRepository(db).get(self.list_source)
        if not state or not state.last_publication_id:
            return True
        remote_id = _latest_publication_id()
        if remote_id is None:
            log.warning("Could not determine remote OFAC publication ID; skipping update check.")
            return False
        needs = remote_id > state.last_publication_id
        if needs:
            log.info(
                "OFAC list updated: stored publication %d < remote %d",
                state.last_publication_id, remote_id,
            )
        else:
            log.info("OFAC list is current (publication %d).", state.last_publication_id)
        return needs

    def ingest(self, db: Session) -> int:
        sync_repo    = SyncStateRepository(db)
        sanction_repo = SanctionRepository(db)

        log.info("Downloading OFAC CSV files…")
        try:
            prim_rows = _download_csv("CONS_PRIM.CSV")
            alt_rows  = _download_csv("CONS_ALT.CSV")
            add_rows  = _download_csv("CONS_ADD.CSV")
        except httpx.HTTPError as exc:
            sync_repo.upsert(self.list_source, status="failed")
            raise RuntimeError(f"OFAC download failed: {exc}") from exc

        log.info(
            "Downloaded %d primary / %d alias / %d address rows.",
            len(prim_rows), len(alt_rows), len(add_rows),
        )

        entities = _parse_primary(prim_rows)
        _apply_aliases(entities, alt_rows)
        _apply_addresses(entities, add_rows)

        records = list(entities.values())
        log.info("Parsed %d OFAC entities. Reloading DB…", len(records))

        sanction_repo.clear_list(self.list_source)
        sanction_repo.bulk_add(records)

        pub_id = _latest_publication_id()
        sync_repo.upsert(
            self.list_source,
            publication_id=pub_id,
            entity_count=len(records),
            status="ok",
        )

        log.info("OFAC ingest complete: %d entities loaded.", len(records))
        return len(records)

from types import SimpleNamespace


def fetch_live_entities() -> list:
    """
    Fetch OFAC list files live and return in-memory entities for screening.
    This does not write to the database.
    """
    prim_rows = _download_csv("CONS_PRIM.CSV")
    alt_rows = _download_csv("CONS_ALT.CSV")
    add_rows = _download_csv("CONS_ADD.CSV")

    entities = _parse_primary(prim_rows)
    _apply_aliases(entities, alt_rows)
    _apply_addresses(entities, add_rows)

    in_memory_entities = []
    for idx, record in enumerate(entities.values(), start=1):
        in_memory_entities.append(
            SimpleNamespace(
                id=idx,
                name=record.get("name", "") or "",
                aliases=record.get("aliases") or [],
                list_source=record.get("list_source") or "OFAC",
                list_id=record.get("list_id") or "",
                country=record.get("country"),
                programs=record.get("programs") or [],
                remarks=record.get("remarks"),
            )
        )

    return in_memory_entities
