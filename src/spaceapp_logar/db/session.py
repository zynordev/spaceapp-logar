import os
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_DATABASE_URL = "sqlite:///./spaceapp-logar.db"


def normalize_database_url(url: str) -> str:
    """Use the psycopg 3 driver for PostgreSQL URLs.

    Hosting platforms (e.g. Render) hand out ``postgres://`` or
    ``postgresql://`` URLs; SQLAlchemy needs ``postgresql+psycopg://``.
    """

    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def database_url_from_env() -> str:
    """SPACEAPP_DATABASE_URL wins, then the platform's DATABASE_URL, then SQLite."""

    url = (
        os.getenv("SPACEAPP_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or DEFAULT_DATABASE_URL
    )
    return normalize_database_url(url)


def create_database_engine(database_url: str) -> Engine:
    database_url = normalize_database_url(database_url)
    if database_url.startswith("sqlite"):
        database_engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False, "timeout": 30.0},
        )
        event.listen(database_engine, "connect", _configure_sqlite_connection)
        return database_engine
    # Server databases: drop dead pooled connections (e.g. after a restart).
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


def get_session() -> Iterator[Session]:
    with SessionFactory() as session:
        yield session
