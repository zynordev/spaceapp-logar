"""Detect a database whose schema is behind the code (migrations not applied).

After ``git pull`` someone may forget ``alembic upgrade head``; the API then
crashed with opaque 500 errors. Instead every data request now fails fast
with a clear 503 and ``/health`` reports ``schema: outdated``.
"""

import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine

logger = logging.getLogger("spaceapp_logar.schema")

CURRENT = "current"
OUTDATED = "outdated"
UNKNOWN = "unknown"
RECHECK_SECONDS = 5.0
REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True, slots=True)
class SchemaStatus:
    state: str
    database_revision: str | None
    code_revision: str | None

    @property
    def message(self) -> str:
        if self.state == CURRENT:
            return "Veritabanı şeması güncel."
        if self.state == OUTDATED:
            return (
                "Veritabanı şeması kodun gerisinde "
                f"(veritabanı: {self.database_revision or 'boş'}, kod: {self.code_revision}). "
                "Çalıştırın: uv run alembic upgrade head"
            )
        return "Şema sürümü belirlenemedi."


def _code_head() -> str | None:
    ini = Path(os.getenv("SPACEAPP_ALEMBIC_INI", REPO_ROOT / "alembic.ini"))
    if not ini.exists():
        return None
    config = Config(str(ini))
    config.set_main_option("script_location", str(ini.parent / "migrations"))
    return ScriptDirectory.from_config(config).get_current_head()


def check_schema(engine: Engine) -> SchemaStatus:
    head = _code_head()
    if head is None:
        return SchemaStatus(UNKNOWN, None, None)
    try:
        with engine.connect() as connection:
            current = MigrationContext.configure(connection).get_current_revision()
    except Exception:  # database unreachable: report, do not crash the process
        logger.exception("schema check could not reach the database")
        return SchemaStatus(UNKNOWN, None, head)
    return SchemaStatus(CURRENT if current == head else OUTDATED, current, head)


class SchemaGuard:
    """Caches a CURRENT result; re-checks an OUTDATED one every few seconds."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._status: SchemaStatus | None = None
        self._checked_at = 0.0

    def status(self) -> SchemaStatus:
        stale = time.monotonic() - self._checked_at > RECHECK_SECONDS
        if self._status is None or (self._status.state != CURRENT and stale):
            previous = self._status
            self._status = check_schema(self.engine)
            self._checked_at = time.monotonic()
            if self._status.state == OUTDATED and (
                previous is None or previous.state != OUTDATED
            ):
                logger.error(self._status.message)
        return self._status
