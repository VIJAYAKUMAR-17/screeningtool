from abc import ABC, abstractmethod
from sqlalchemy.orm import Session


class BaseIngester(ABC):
    """
    All ingestion sources implement this interface.
    list_source must match the value stored in SanctionedEntity.list_source.
    """
    list_source: str

    @abstractmethod
    def needs_update(self, db: Session) -> bool:
        """Return True if the remote list is newer than our last sync."""

    @abstractmethod
    def ingest(self, db: Session) -> int:
        """
        Fetch, parse, and load entities into the DB.
        Returns the number of entities loaded.
        """
