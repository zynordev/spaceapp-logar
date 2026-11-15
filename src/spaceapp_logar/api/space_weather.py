"""Read-only real NASA DONKI space-weather event timing."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from spaceapp_logar.schemas.space_weather import (
    SepEventRead,
    SpaceWeatherEventsRead,
    SpaceWeatherSource,
)
from spaceapp_logar.services.space_weather import (
    PROVENANCE_NOTE_TR,
    SUPPORTED_MONTHS,
    load_sep_catalog,
)

router = APIRouter(prefix="/v1/space-weather", tags=["space-weather"])


@router.get("/events", response_model=SpaceWeatherEventsRead)
def list_space_weather_events(
    month: Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")] = "2024-05",
) -> SpaceWeatherEventsRead:
    if month not in SUPPORTED_MONTHS:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No bundled DONKI data for {month}; available: {sorted(SUPPORTED_MONTHS)}",
        )
    catalog = load_sep_catalog(month)
    return SpaceWeatherEventsRead(
        month=month,
        source=SpaceWeatherSource(**catalog.source),
        provenance_note=PROVENANCE_NOTE_TR,
        events=[
            SepEventRead(
                sep_id=item.sep_id,
                event_time=item.event_time,
                instruments=list(item.instruments),
                linked_events=list(item.linked_events),
                link=item.link,
            )
            for item in catalog.events
        ],
    )
