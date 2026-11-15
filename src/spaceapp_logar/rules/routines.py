"""Fixed catalogue of routine reminders and periodic tests (no free text).

Reminders are schedule aids only. Intervals are DEMO defaults and do not
replace the mission's own task plan. Periodic tests are performed per mission
protocol; the system never interprets their values. The catalogue contains no
medication, ever.
"""

from dataclasses import dataclass
from enum import StrEnum


class RoutineKind(StrEnum):
    HYDRATION = "HYDRATION"
    EXERCISE = "EXERCISE"
    SLEEP_WINDOW = "SLEEP_WINDOW"
    CHECK_IN = "CHECK_IN"
    BODY_MASS_WEEKLY = "BODY_MASS_WEEKLY"
    GRIP_STRENGTH_WEEKLY = "GRIP_STRENGTH_WEEKLY"
    MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY = "MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY"


class RoutineCategory(StrEnum):
    DAILY = "DAILY"
    PERIODIC_TEST = "PERIODIC_TEST"


MIN_INTERVAL_MINUTES = 30
MAX_INTERVAL_MINUTES = 20160
_DEMO_NOTE = " DEMO; does not replace the mission task plan."
_TEST_NOTE = " The test is performed per mission protocol; the system does not interpret the values."


@dataclass(frozen=True)
class RoutineDefinition:
    kind: RoutineKind
    title_tr: str
    description_tr: str
    category: RoutineCategory
    default_interval_minutes: int
    evidence: str = "DEMO"


ROUTINE_CATALOG: tuple[RoutineDefinition, ...] = (
    RoutineDefinition(
        RoutineKind.HYDRATION,
        "Fluid intake reminder",
        "Reminds to drink water regularly." + _DEMO_NOTE,
        RoutineCategory.DAILY,
        120,
    ),
    RoutineDefinition(
        RoutineKind.EXERCISE,
        "Exercise session",
        "Reminds of the daily exercise session." + _DEMO_NOTE,
        RoutineCategory.DAILY,
        1440,
    ),
    RoutineDefinition(
        RoutineKind.SLEEP_WINDOW,
        "Sleep window",
        "Reminds of the planned sleep window." + _DEMO_NOTE,
        RoutineCategory.DAILY,
        1440,
    ),
    RoutineDefinition(
        RoutineKind.CHECK_IN,
        "Subjective status report",
        "Reminds of the five-field subjective status report." + _DEMO_NOTE,
        RoutineCategory.DAILY,
        240,
    ),
    RoutineDefinition(
        RoutineKind.BODY_MASS_WEEKLY,
        "Weekly body mass measurement",
        "Body mass measurement." + _TEST_NOTE + _DEMO_NOTE,
        RoutineCategory.PERIODIC_TEST,
        10080,
    ),
    RoutineDefinition(
        RoutineKind.GRIP_STRENGTH_WEEKLY,
        "Weekly grip strength test",
        "Grip strength test." + _TEST_NOTE + _DEMO_NOTE,
        RoutineCategory.PERIODIC_TEST,
        10080,
    ),
    RoutineDefinition(
        RoutineKind.MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY,
        "Biweekly musculoskeletal assessment",
        "Musculoskeletal assessment." + _TEST_NOTE + _DEMO_NOTE,
        RoutineCategory.PERIODIC_TEST,
        20160,
    ),
)

_BY_KIND = {definition.kind: definition for definition in ROUTINE_CATALOG}


def get_routine(kind: RoutineKind | str) -> RoutineDefinition:
    return _BY_KIND[RoutineKind(kind)]
