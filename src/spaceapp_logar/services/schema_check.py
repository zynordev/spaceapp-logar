"""Compare the database schema revision with the code's Alembic head.

After a `git pull` that brings a new migration, forgetting
`uv run alembic upgrade head` used to surface as opaque 500 errors. This
module lets /health report the mismatch and lets the API answer 503 with a
clear instruction instead.
"""

import time
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

REPO_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = REPO_ROOT / "alembic.ini"
CACHE_SECONDS = 10.0

UPGRADE_HINT = "Run `uv run alembic upgrade head` and restart the API."


@dataclass(frozen=True, slots=True)
class SchemaState:
    database: str  # "ok" | "unreachable"
    schema: str  # "current" | "outdated" | "unknown"
    current_revision: str | None
    expected_revision: str | None

    @property
    def usable(self) -> bool:
        return self.database == "ok" and self.schema == "current"


def expected_head() -> str | None:
    if not ALEMBIC_INI.exists():
        return None
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(REPO_ROOT / "migrations"))
    heads = ScriptDirectory.from_config(config).get_heads()
    return heads[0] if len(heads) == 1 else None


def inspect_schema(engine: Engine) -> SchemaState:
    expected = expected_head()
    try:
        with engine.connect() as connection:
            current = MigrationContext.configure(connection).get_current_revision()
    except SQLAlchemyError:
        return SchemaState("unreachable", "unknown", None, expected)
    if expected is None:
        return SchemaState("ok", "unknown", current, None)
    schema = "current" if current == expected else "outdated"
    return SchemaState("ok", schema, current, expected)


class SchemaMonitor:
    """Caches the schema state briefly so requests do not query it each time."""

    def __init__(self, engine: Engine, ttl: float = CACHE_SECONDS) -> None:
        self._engine = engine
        self._ttl = ttl
        self._state: SchemaState | None = None
        self._checked_at = 0.0

    def state(self, *, force: bool = False) -> SchemaState:
        now = time.monotonic()
        if force or self._state is None or now - self._checked_at > self._ttl:
            self._state = inspect_schema(self._engine)
            self._checked_at = now
        return self._state
