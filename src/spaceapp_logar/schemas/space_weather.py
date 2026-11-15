from datetime import datetime

from pydantic import BaseModel


class SpaceWeatherSource(BaseModel):
    name: str
    url: str
    retrieved_at: str
    licence: str
    note: str


class SepEventRead(BaseModel):
    sep_id: str
    event_time: datetime
    instruments: list[str]
    linked_events: list[str]
    link: str | None


class SpaceWeatherEventsRead(BaseModel):
    """Real NASA DONKI SEP event timing. No flux or dose values."""

    month: str
    source: SpaceWeatherSource
    provenance_note: str
    events: list[SepEventRead]
