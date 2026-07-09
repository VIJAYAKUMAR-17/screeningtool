from sqlalchemy import create_engine
from sqlalchemy import inspect, text
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
_MIGRATION_COLUMNS = [
    ("vendors", "org_id", "VARCHAR"),
    ("vendors", "created_by_user_id", "VARCHAR"),
    ("screening_runs", "sources_checked", "JSON"),
    ("screening_runs", "data_mode", "VARCHAR"),
    ("screening_runs", "org_id", "VARCHAR"),
    ("screening_runs", "created_by_user_id", "VARCHAR"),
    ("screening_runs", "org_role", "VARCHAR"),
    ("screening_runs", "org_permissions", "JSON"),
    ("screening_results", "org_id", "VARCHAR"),
    ("screening_results", "created_by_user_id", "VARCHAR"),
    ("tier2_screening_runs", "org_id", "VARCHAR"),
    ("tier2_screening_runs", "created_by_user_id", "VARCHAR"),
]

_MIGRATION_INDEXES = [
    ("ix_vendors_org_id", "vendors", "org_id"),
    ("ix_screening_runs_org_id", "screening_runs", "org_id"),
    ("ix_screening_results_org_id", "screening_results", "org_id"),
    ("ix_tier2_screening_runs_org_id", "tier2_screening_runs", "org_id"),
]


def _apply_lightweight_migrations():
    with engine.begin() as conn:
        inspector = inspect(conn)
        table_names = set(inspector.get_table_names())

        for table_name, column_name, column_type in _MIGRATION_COLUMNS:
            if table_name not in table_names:
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            if column_name not in existing:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))

        for index_name, table_name, column_name in _MIGRATION_INDEXES:
            if table_name not in table_names:
                continue
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"))
