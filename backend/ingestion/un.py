"""
UN Consolidated Sanctions List ingester.

Parses the local XML file:
  data/UN/consolidatedLegacyByNAME.xml

XML structure:
  <CONSOLIDATED_LIST>
    <INDIVIDUALS>
      <INDIVIDUAL>  DATAID, FIRST/SECOND/THIRD/FOURTH_NAME, UN_LIST_TYPE,
                    COMMENTS1, INDIVIDUAL_ALIAS*, INDIVIDUAL_ADDRESS*, NATIONALITY*
    <ENTITIES>
      <ENTITY>      DATAID, FIRST_NAME, UN_LIST_TYPE, COMMENTS1,
                    ENTITY_ALIAS*, ENTITY_ADDRESS*

All records share the single `sanctioned_entities` table with list_source="UN".
"""

import logging
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from database.repository import SanctionRepository, SyncStateRepository
from ingestion.base import BaseIngester

log = logging.getLogger(__name__)

_XML_PATH = Path(__file__).parent.parent / "data" / "UN" / "consolidatedLegacyByNAME.xml"


def _t(el: Optional[ET.Element]) -> str:
    """Return stripped text of an element, or empty string if None/empty."""
    if el is None:
        return ""
    return (el.text or "").strip()


def _parse_individuals(root: ET.Element) -> list[dict]:
    records = []
    individuals_el = root.find("INDIVIDUALS")
    if individuals_el is None:
        return records

    for ind in individuals_el.findall("INDIVIDUAL"):
        list_id = _t(ind.find("DATAID"))
        parts = [
            _t(ind.find("FIRST_NAME")),
            _t(ind.find("SECOND_NAME")),
            _t(ind.find("THIRD_NAME")),
            _t(ind.find("FOURTH_NAME")),
        ]
        name = " ".join(p for p in parts if p).strip()
        if not name:
            continue

        program = _t(ind.find("UN_LIST_TYPE")) or None
        remarks = _t(ind.find("COMMENTS1")) or None

        aliases = [
            _t(a.find("ALIAS_NAME"))
            for a in ind.findall("INDIVIDUAL_ALIAS")
            if _t(a.find("ALIAS_NAME"))
        ]

        # Country: prefer nationality, fall back to address country
        country = None
        for nat in ind.findall("NATIONALITY"):
            v = _t(nat.find("VALUE"))
            if v:
                country = v
                break
        if not country:
            for addr in ind.findall("INDIVIDUAL_ADDRESS"):
                v = _t(addr.find("COUNTRY"))
                if v:
                    country = v
                    break

        records.append({
            "list_id":     list_id,
            "name":        name,
            "entity_type": "individual",
            "programs":    [program] if program else [],
            "remarks":     remarks,
            "list_source": "UN",
            "aliases":     aliases,
            "country":     country,
            "address":     None,
        })

    return records


def _parse_entities(root: ET.Element) -> list[dict]:
    records = []
    entities_el = root.find("ENTITIES")
    if entities_el is None:
        return records

    for ent in entities_el.findall("ENTITY"):
        list_id = _t(ent.find("DATAID"))
        name = _t(ent.find("FIRST_NAME")).strip()
        if not name:
            continue

        program = _t(ent.find("UN_LIST_TYPE")) or None
        remarks = _t(ent.find("COMMENTS1")) or None

        aliases = [
            _t(a.find("ALIAS_NAME"))
            for a in ent.findall("ENTITY_ALIAS")
            if _t(a.find("ALIAS_NAME"))
        ]

        country = None
        for addr in ent.findall("ENTITY_ADDRESS"):
            v = _t(addr.find("COUNTRY"))
            if v:
                country = v
                break

        records.append({
            "list_id":     list_id,
            "name":        name,
            "entity_type": "company",
            "programs":    [program] if program else [],
            "remarks":     remarks,
            "list_source": "UN",
            "aliases":     aliases,
            "country":     country,
            "address":     None,
        })

    return records


class UNIngester(BaseIngester):
    list_source = "UN"

    def needs_update(self, db: Session) -> bool:
        if not _XML_PATH.exists():
            log.warning("UN XML not found at %s", _XML_PATH)
            return False
        state = SyncStateRepository(db).get(self.list_source)
        if not state or not state.last_publication_id:
            return True
        # Store file mtime as integer seconds; re-ingest if file changed
        file_mtime = int(_XML_PATH.stat().st_mtime)
        return file_mtime != state.last_publication_id

    def ingest(self, db: Session) -> int:
        sync_repo = SyncStateRepository(db)
        sanction_repo = SanctionRepository(db)

        if not _XML_PATH.exists():
            sync_repo.upsert(self.list_source, status="failed")
            raise RuntimeError(f"UN XML file not found: {_XML_PATH}")

        log.info("Parsing UN XML: %s", _XML_PATH)
        tree = ET.parse(str(_XML_PATH))
        root = tree.getroot()

        individuals = _parse_individuals(root)
        entities = _parse_entities(root)
        records = individuals + entities

        log.info(
            "Parsed %d individuals + %d entities = %d total UN records.",
            len(individuals), len(entities), len(records),
        )

        sanction_repo.clear_list(self.list_source)
        sanction_repo.bulk_add(records)

        file_mtime = int(_XML_PATH.stat().st_mtime)
        sync_repo.upsert(
            self.list_source,
            publication_id=file_mtime,
            entity_count=len(records),
            status="ok",
        )

        log.info("UN ingest complete: %d entities loaded.", len(records))
        return len(records)
