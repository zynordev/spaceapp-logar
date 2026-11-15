"""Real NASA DONKI solar-energetic-particle (SEP) event timing.

The bundled file ``data/nasa/donki_sep_2024-05.json`` is a trimmed copy of the
public NASA DONKI SEP list for May 2024. It contains event timing and metadata
only: there are NO flux or dose values in it. The radiation demo scenario uses
these timestamps to anchor *when* its synthetic dose-rate rise happens.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "nasa"
SUPPORTED_MONTHS = {"2024-05": "donki_sep_2024-05.json"}

# GOES-P SEISS onsets used to anchor the radiation demo scenario.
GOES_10_MEV_SEP_ID = "2024-05-10T13:35:00-SEP-001"
GOES_100_MEV_SEP_ID = "2024-05-11T02:10:00-SEP-001"

PROVENANCE_NOTE_TR = (
    "Event timing is from the real NASA DONKI record (May 2024 SEP, GOES >10 MeV "
    "onset 10 May 13:35Z); dose values are synthetic."
)


@dataclass(frozen=True, slots=True)
class SepEvent:
    sep_id: str
    event_time: datetime
    instruments: tuple[str, ...]
    linked_events: tuple[str, ...]
    link: str | None


@dataclass(frozen=True, slots=True)
class SepCatalog:
    source: dict[str, str]
    events: tuple[SepEvent, ...]

    def event(self, sep_id: str) -> SepEvent:
        for item in self.events:
            if item.sep_id == sep_id:
                return item
        raise KeyError(sep_id)


def _parse_time(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)


def load_sep_catalog(month: str = "2024-05", data_dir: Path = DEFAULT_DATA_DIR) -> SepCatalog:
    file_name = SUPPORTED_MONTHS.get(month)
    if file_name is None:
        raise KeyError(month)
    return _load_file(data_dir / file_name)


@lru_cache(maxsize=4)
def _load_file(path: Path) -> SepCatalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    events = tuple(
        SepEvent(
            sep_id=item["sepID"],
            event_time=_parse_time(item["eventTime"]),
            instruments=tuple(item["instruments"]),
            linked_events=tuple(item["linkedEvents"]),
            link=item.get("link"),
        )
        for item in raw["events"]
    )
    return SepCatalog(source=dict(raw["source"]), events=events)
