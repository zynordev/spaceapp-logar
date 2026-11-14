"""Resolve the database URL from the environment (SQLite or PostgreSQL)."""

import os

DEFAULT_DATABASE_URL = "sqlite:///./spaceapp-logar.db"


def normalize_database_url(url: str) -> str:
    """Use the psycopg 3 driver for PostgreSQL URLs (e.g. Render's postgres://)."""

    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def database_url_from_env() -> str:
    """``SPACEAPP_DATABASE_URL`` wins, then ``DATABASE_URL``, then local SQLite."""

    url = os.getenv("SPACEAPP_DATABASE_URL") or os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL
    return normalize_database_url(url)


def is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")
