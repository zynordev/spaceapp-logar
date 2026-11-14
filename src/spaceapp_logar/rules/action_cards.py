"""Versioned, pre-written action cards.

The software never generates advice at run time; it only selects one of these
fixed cards. ``ENV_CO2_WATCH_CARD_V1`` was approved by the project owner. All
other cards are DEMO cards (validation_status ``DEMO_PENDING_REVIEW``): they
only contain first-step actions listed as allowed in docs/biyo.md section 10.2
(re-measure, stop activity/rest, record symptoms, open the mission procedure,
notify the crew medical officer). They contain no diagnosis, drug or dose.
"""

from dataclasses import dataclass

from spaceapp_logar.rules.co2 import RULE_ID as CO2_NOMINAL_RULE_ID
from spaceapp_logar.rules.models import (
    DataQuality,
    HealthAttention,
    RuleEvaluation,
)
from spaceapp_logar.rules.vitals import (
    CARDIO_RESP_RULE_ID,
    HR_JUMP_RULE_ID,
    SPO2_RULE_ID,
    TEMP_RULE_ID,
)

APPROVED = "APPROVED"
DEMO_PENDING_REVIEW = "DEMO_PENDING_REVIEW"


@dataclass(frozen=True, slots=True)
class ActionCardStep:
    """One short step shown to the astronaut."""

    key: str
    text_tr: str


@dataclass(frozen=True, slots=True)
class ActionCard:
    """A pre-written action card and the safety limits that apply to it."""

    card_id: str
    version: int
    attention: HealthAttention
    rule_id: str
    title_key: str
    reason_key: str
    title_tr: str
    reason_tr: str
    steps: tuple[ActionCardStep, ...]
    footer_note_tr: str
    requires_mission_procedure: bool
    allows_automatic_vehicle_command: bool
    validation_status: str = APPROVED

    @property
    def step_keys(self) -> tuple[str, ...]:
        return tuple(step.key for step in self.steps)


DEMO_FOOTER = (
    "DEMO kartı: içerik uzman doğrulaması bekliyor. Teşhis koymaz, ilaç veya "
    "tedavi önermez. Göreve özel prosedür ve ekip sağlık sorumlusu önceliklidir."
)

ENV_CO2_WATCH_CARD_V1 = ActionCard(
    card_id="ENV_CO2_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=CO2_NOMINAL_RULE_ID,
    title_key="co2_watch.title",
    reason_key="co2_watch.reason",
    title_tr="Kabin CO₂ değerini kontrol et",
    reason_tr=(
        "Son bir saatlik ortalama CO₂ değeri nominal sınırın üzerinde. "
        "Ölçümü doğrula ve görev prosedürünü kontrol et."
    ),
    steps=(
        ActionCardStep(
            key="verify_measurement",
            text_tr=(
                "Ölçümü tekrar kontrol et. Kabin CO₂ göstergesini ve sensör "
                "durumunu kontrol et. Sensör hatası görünüyorsa bunu kaydet."
            ),
        ),
        ActionCardStep(
            key="record_check_in",
            text_tr=(
                "Nasıl hissettiğini kaydet. Özellikle yorgunluk veya "
                "ağrı/baş ağrısı varsa kısa öznel durum kontrolünü doldur."
            ),
        ),
        ActionCardStep(
            key="open_mission_procedure",
            text_tr=(
                "Görev prosedürünü aç. Göreve özel CO₂ havalandırma/giderim "
                "prosedürünü aç ve prosedürde belirtilen sorumlu ekibe bildir."
            ),
        ),
    ),
    footer_note_tr=(
        "Bu bir WATCH bildirimidir. Yazılım kendi başına havalandırma veya "
        "CO₂ giderim ekipmanına komut vermez. Göreve özel prosedür önceliklidir."
    ),
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
)

_RECORD_SYMPTOMS = ActionCardStep(
    key="record_check_in",
    text_tr=(
        "Nasıl hissettiğini kaydet: yorgunluk, baş dönmesi, bulantı, ağrı ve ruh "
        "hali için kısa öznel durum kontrolünü doldur."
    ),
)
_NOTIFY_MEDICAL_OFFICER = ActionCardStep(
    key="notify_medical_officer",
    text_tr=(
        "Görev prosedürünü aç ve ekip sağlık sorumlusuna/yer ekibine bildir. "
        "Sonraki adımları onlar belirler."
    ),
)
_STOP_AND_REST = ActionCardStep(
    key="stop_activity_rest",
    text_tr="Yorucu aktiviteyi durdur, güvenli bir pozisyonda otur ve dinlen.",
)

VITAL_SPO2_WATCH_CARD_V1 = ActionCard(
    card_id="VITAL_SPO2_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_watch.title",
    reason_key="spo2_watch.reason",
    title_tr="SpO₂ ölçümünü doğrula",
    reason_tr=(
        "Son 10 dakikalık dinlenme SpO₂ ortalaması olağan referansın altında. "
        "Önce ölçümün doğru olduğundan emin ol."
    ),
    steps=(
        ActionCardStep(
            key="verify_sensor_placement",
            text_tr=(
                "Sensörün parmak/kulak yerleşimini ve temasını kontrol et, "
                "elini sabit tutarak ölçümü tekrarla."
            ),
        ),
        _RECORD_SYMPTOMS,
        ActionCardStep(
            key="check_cabin_atmosphere",
            text_tr="Kabin O₂ ve basınç göstergelerini kontrol et.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_SPO2_ALERT_CARD_V1 = ActionCard(
    card_id="VITAL_SPO2_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=SPO2_RULE_ID,
    title_key="spo2_alert.title",
    reason_key="spo2_alert.reason",
    title_tr="Düşük SpO₂: dinlen ve ekip sağlık sorumlusuna bildir",
    reason_tr=(
        "Son 10 dakikalık dinlenme SpO₂ ortalaması belirgin düşüklük referansının "
        "altında."
    ),
    steps=(
        _STOP_AND_REST,
        ActionCardStep(
            key="confirm_second_sensor",
            text_tr="Ölçümü ikinci bir sensör veya cihazla doğrula.",
        ),
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_TEMP_WATCH_CARD_V1 = ActionCard(
    card_id="VITAL_TEMP_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=TEMP_RULE_ID,
    title_key="temp_watch.title",
    reason_key="temp_watch.reason",
    title_tr="Vücut sıcaklığı eğilimini izle",
    reason_tr=(
        "Son bir saatlik vücut sıcaklığı kişisel başlangıç değerinin belirgin "
        "üzerinde."
    ),
    steps=(
        ActionCardStep(
            key="verify_sensor_contact",
            text_tr=(
                "Sıcaklık sensörünün cilt temasını kontrol et ve ikinci bir "
                "ölçümle doğrula."
            ),
        ),
        _RECORD_SYMPTOMS,
        ActionCardStep(
            key="reassess_one_hour",
            text_tr="Bir saat içinde yeniden ölç ve değişimi kaydet.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

VITAL_TEMP_ALERT_CARD_V1 = ActionCard(
    card_id="VITAL_TEMP_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=TEMP_RULE_ID,
    title_key="temp_alert.title",
    reason_key="temp_alert.reason",
    title_tr="Yüksek vücut sıcaklığı: ekip sağlık sorumlusuna bildir",
    reason_tr="Son bir saatlik vücut sıcaklığı genel ateş referansının üzerinde.",
    steps=(
        ActionCardStep(
            key="confirm_second_thermometer",
            text_tr="Sıcaklığı ikinci bir termometre veya sensörle doğrula.",
        ),
        _RECORD_SYMPTOMS,
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

MULTI_CARDIO_RESP_WATCH_CARD_V1 = ActionCard(
    card_id="MULTI_CARDIO_RESP_WATCH_CARD_V1",
    version=1,
    attention=HealthAttention.WATCH,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_watch.title",
    reason_key="cardio_resp_watch.reason",
    title_tr="Dinlenme kalp ve solunum hızını doğrula",
    reason_tr=(
        "Dinlenme sırasında kalp hızı kişisel başlangıcın ve solunum hızı "
        "referansın üzerinde."
    ),
    steps=(
        ActionCardStep(
            key="rest_and_remeasure",
            text_tr="Beş dakika oturarak dinlen ve ölçümleri tekrarla.",
        ),
        ActionCardStep(
            key="check_activity_context",
            text_tr=(
                "Yakın zamanda egzersiz, EVA hazırlığı veya yoğun görev olup "
                "olmadığını kaydet."
            ),
        ),
        _RECORD_SYMPTOMS,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

MULTI_CARDIO_RESP_ALERT_CARD_V1 = ActionCard(
    card_id="MULTI_CARDIO_RESP_ALERT_CARD_V1",
    version=1,
    attention=HealthAttention.ALERT,
    rule_id=CARDIO_RESP_RULE_ID,
    title_key="cardio_resp_alert.title",
    reason_key="cardio_resp_alert.reason",
    title_tr="Kalp-solunum bulguları ve belirti: ekip sağlık sorumlusuna bildir",
    reason_tr=(
        "Dinlenmede yüksek kalp ve solunum hızına öznel belirti eşlik ediyor."
    ),
    steps=(
        _STOP_AND_REST,
        ActionCardStep(
            key="remeasure_vitals",
            text_tr="Kalp hızı, solunum, SpO₂ ve sıcaklığı yeniden ölç.",
        ),
        _NOTIFY_MEDICAL_OFFICER,
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=True,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

DATA_HR_SENSOR_CHECK_CARD_V1 = ActionCard(
    card_id="DATA_HR_SENSOR_CHECK_CARD_V1",
    version=1,
    attention=HealthAttention.UNKNOWN,
    rule_id=HR_JUMP_RULE_ID,
    title_key="hr_sensor_check.title",
    reason_key="hr_sensor_check.reason",
    title_tr="Kalp hızı sensörünü kontrol et",
    reason_tr=(
        "Kalp hızı sinyali şüpheli veya geçersiz. Bu bir sağlık alarmı değil, "
        "veri kalitesi uyarısıdır."
    ),
    steps=(
        ActionCardStep(
            key="reseat_sensor",
            text_tr="Göğüs bandını/bileklik sensörünü yeniden yerleştir.",
        ),
        ActionCardStep(
            key="repeat_measurement",
            text_tr="Bir dakika hareketsiz kalarak ölçümü tekrarla.",
        ),
        ActionCardStep(
            key="log_sensor_issue",
            text_tr="Sorun sürerse sensör arızasını kaydet.",
        ),
    ),
    footer_note_tr=DEMO_FOOTER,
    requires_mission_procedure=False,
    allows_automatic_vehicle_command=False,
    validation_status=DEMO_PENDING_REVIEW,
)

_ALL_CARDS: tuple[ActionCard, ...] = (
    ENV_CO2_WATCH_CARD_V1,
    VITAL_SPO2_WATCH_CARD_V1,
    VITAL_SPO2_ALERT_CARD_V1,
    VITAL_TEMP_WATCH_CARD_V1,
    VITAL_TEMP_ALERT_CARD_V1,
    MULTI_CARDIO_RESP_WATCH_CARD_V1,
    MULTI_CARDIO_RESP_ALERT_CARD_V1,
    DATA_HR_SENSOR_CHECK_CARD_V1,
)

_CARDS_BY_ID_AND_VERSION: dict[tuple[str, int], ActionCard] = {
    (card.card_id, card.version): card for card in _ALL_CARDS
}

# Which card a rule result shows. Health cards require VALID data; the only
# card shown for non-valid data is the sensor-check card for a suspect jump.
_SELECTION: dict[tuple[str, HealthAttention, DataQuality], ActionCard] = {
    (card.rule_id, card.attention, DataQuality.VALID): card
    for card in _ALL_CARDS
    if card.attention is not HealthAttention.UNKNOWN
}
for _quality in (DataQuality.SUSPECT, DataQuality.FAULT):
    _SELECTION[(HR_JUMP_RULE_ID, HealthAttention.UNKNOWN, _quality)] = (
        DATA_HR_SENSOR_CHECK_CARD_V1
    )


def select_action_card(evaluation: RuleEvaluation) -> ActionCard | None:
    """Return the pre-written card for a rule result, or None if none applies."""

    return _SELECTION.get(
        (evaluation.rule_id, evaluation.health_attention, evaluation.data_quality)
    )


def get_action_card(card_id: str, version: int) -> ActionCard | None:
    """Look up a stored card reference in the card catalog."""

    return _CARDS_BY_ID_AND_VERSION.get((card_id, version))


def all_action_cards() -> tuple[ActionCard, ...]:
    return _ALL_CARDS
