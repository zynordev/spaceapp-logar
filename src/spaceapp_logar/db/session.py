from collections.abc import Iterator

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from spaceapp_logar.db.schema_check import OUTDATED, SchemaGuard
from spaceapp_logar.db.url import (
    DEFAULT_DATABASE_URL,
    database_url_from_env,
    is_sqlite,
    normalize_database_url,
)

def create_database_engine(database_url: str) -> Engine:
    """SQLite for local/demo use, PostgreSQL for shared deployments."""

    database_url = normalize_database_url(database_url)
    if is_sqlite(database_url):
        database_engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False, "timeout": 30.0},
        )
        # WAL and the other pragmas are SQLite-only.
        event.listen(database_engine, "connect", _configure_sqlite_connection)
        return database_engine
    return create_engine(database_url, pool_pre_ping=True)


def _configure_sqlite_connection(dbapi_connection: object, _: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


engine = create_database_engine(database_url_from_env())
SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)
schema_guard = SchemaGuard(engine)


def get_session() -> Iterator[Session]:
    status = schema_guard.status()
    if status.state == OUTDATED:
        # Fail fast and clearly instead of crashing with a 500 on a missing column.
        raise HTTPException(
            503,
            {
                "code": "SCHEMA_OUTDATED",
                "message": status.message,
                "database_revision": status.database_revision,
                "code_revision": status.code_revision,
            },
        )
    with SessionFactory() as session:
        yield session

