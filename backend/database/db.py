from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from database import models  # noqa: F401 — ensures models are registered on Base
    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()


# create_all never alters existing tables, so columns added to models after the
# first deploy must be back-filled here until Alembic is adopted.
_MIGRATION_STATEMENTS = [
    "ALTER TABLE screening_runs ADD COLUMN IF NOT EXISTS sources_checked JSON",
    "ALTER TABLE screening_runs ADD COLUMN IF NOT EXISTS data_mode VARCHAR",
]


def _apply_lightweight_migrations():
    from sqlalchemy import text

    if _is_sqlite:
        return
    with engine.begin() as conn:
        for statement in _MIGRATION_STATEMENTS:
            conn.execute(text(statement))
