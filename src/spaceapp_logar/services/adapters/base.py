from dataclasses import dataclass
from typing import Any, Protocol

from spaceapp_logar.schemas.measurements import MeasurementCreate


@dataclass(frozen=True, slots=True)
class AdapterError:
    """A raw record that could not be turned into a measurement."""

    reason: str
    record_index: int | None = None


AdapterResult = MeasurementCreate | AdapterError


class DeviceAdapter(Protocol):
    """Parses one raw device record into a validated measurement."""

    def parse(self, record: Any, index: int | None = None) -> AdapterResult: ...
