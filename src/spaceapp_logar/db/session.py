import os
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_DATABASE_URL = "sqlite:///./spaceapp-logar.db"


def create_database_engine(database_url: str) -> Engine:
    connect_args = (
        {"check_same_thread": False, "timeout": 30.0}
        if database_url.startswith("sqlite")
        else {}
    )
    database_engine = create_engine(database_url, connect_args=connect_args)
    if database_url.startswith("sqlite"):
        event.listen(database_engine, "connect", _configure_sqlite_connection)
    return database_engine


def _configure_sqlite_connection(dbapi_connection: object, _: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


engine = create_database_engine(
    os.getenv("SPACEAPP_DATABASE_URL", DEFAULT_DATABASE_URL)
)
SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionFactory() as session:
        yield session

