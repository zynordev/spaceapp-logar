// Local demo fixture built from contract C. Used with `?mock=1`, when the
// backend has no body-map endpoint yet (404), or when the user asks for it.
// Clearly labelled as DEMO in the UI — never mixed with live data.
import type { BodyMapRead, BodyRegionRead } from './types';

function ago(minutes: number, now: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

export function buildMockBodyMap(crewId: string | null, missionId: string | null): BodyMapRead {
  const now = Date.now();
  const regions: BodyRegionRead[] = [
    {
      region: 'head',
      label_tr: 'Head / Brain',
      description_tr: 'Sleep duration and cognitive state. Sleep data exists, but last night is missing from this demo record.',
      attention: 'UNKNOWN',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'BEHAV_SLEEP_V1',
          title: 'Sleep duration',
          health_attention: 'UNKNOWN',
          data_quality: 'MISSING',
          explanation: 'No sleep record in the last 24 hours; assessment could not be made.',
        },
      ],
      metrics: ['SLEEP_DURATION'],
      latest_values: [
        { metric: 'SLEEP_DURATION', label: 'Sleep duration', value: 6.1, unit: 'saat', observed_at: ago(26 * 60, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'eyes',
      label_tr: 'Eyes',
      description_tr: 'Symptoms such as blurred vision (spaceflight-associated eye syndrome, SANS).',
      attention: 'WATCH',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'SANS_VISION_SYMPTOM_V1',
          title: 'Vision symptom report',
          health_attention: 'WATCH',
          data_quality: 'VALID',
          explanation: 'A subjective check-in reported "difficulty seeing close up". Check at the next eye test.',
        },
      ],
      metrics: ['VISION_SYMPTOM'],
      latest_values: [
        { metric: 'VISION_SYMPTOM', label: 'Vision symptom', value: 'Mild', unit: null, observed_at: ago(95, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'inner_ear',
      label_tr: 'Inner ear / Balance',
      description_tr: 'Motion sickness and dizziness.',
      attention: 'NORMAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'SENS_MOTION_SICKNESS_V1',
          title: 'Motion sickness',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Nausea or dizziness were not reported at the last check-in.',
        },
      ],
      metrics: ['MOTION_SICKNESS'],
      latest_values: [
        { metric: 'MOTION_SICKNESS', label: 'Nausea score', value: 0, unit: '/10', observed_at: ago(95, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'heart',
      label_tr: 'Heart',
      description_tr: 'Pulse and heart-breathing are assessed together.',
      attention: 'ALERT',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'MULTI_CARDIO_RESP_V1',
          title: 'Pulse and breathing both high',
          health_attention: 'ALERT',
          data_quality: 'VALID',
          explanation: 'While a rest declaration is active, pulse has been 118/min for 10 minutes and breathing rate is 24/min. Open the action card.',
        },
        {
          rule_id: 'DATA_HR_JUMP_V1',
          title: 'Pulse measurement jump',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'No sudden, non-physiological jump was seen; sensor data is consistent.',
        },
      ],
      metrics: ['HEART_RATE', 'HRV_RMSSD'],
      latest_values: [
        { metric: 'HEART_RATE', label: 'Pulse', value: 118, unit: '/min', observed_at: ago(1, now) },
        { metric: 'HRV_RMSSD', label: 'Heart rate variability', value: 21, unit: 'ms', observed_at: ago(4, now) },
      ],
      open_alert_ids: ['8d7e6c1a-0000-4000-8000-000000000001'],
    },
    {
      region: 'lungs',
      label_tr: 'Lungs',
      description_tr: 'Blood oxygen (SpO₂) and breathing rate.',
      attention: 'WATCH',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'VITAL_SPO2_SUSTAINED_V1',
          title: 'Low blood oxygen',
          health_attention: 'WATCH',
          data_quality: 'VALID',
          explanation: 'SpO₂ has been 93% for 5 minutes — just below the threshold. Check that the sensor is seated on the finger.',
        },
      ],
      metrics: ['SPO2', 'RESPIRATION_RATE'],
      latest_values: [
        { metric: 'SPO2', label: 'Kan oksijeni', value: 93, unit: '%', observed_at: ago(1, now) },
        { metric: 'RESPIRATION_RATE', label: 'Breathing rate', value: 24, unit: '/min', observed_at: ago(1, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'torso',
      label_tr: 'Torso / Abdomen',
      description_tr: 'Digestion, fluid balance and abdominal symptoms.',
      attention: 'UNKNOWN',
      coverage: 'GAP',
      rules: [],
      metrics: [],
      latest_values: [],
      open_alert_ids: [],
    },
    {
      region: 'musculoskeletal',
      label_tr: 'Kas-iskelet',
      description_tr: 'Bone loss and muscle strength. Weekly grip strength and body mass measurements.',
      attention: 'UNKNOWN',
      coverage: 'DATA_ONLY',
      rules: [],
      metrics: ['BODY_MASS', 'GRIP_STRENGTH'],
      latest_values: [
        { metric: 'BODY_MASS', label: 'Body mass', value: 71.4, unit: 'kg', observed_at: ago(3 * 24 * 60, now) },
        { metric: 'GRIP_STRENGTH', label: 'Grip strength', value: 38, unit: 'kg', observed_at: ago(3 * 24 * 60, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'skin',
      label_tr: 'Skin / Body temperature',
      description_tr: 'Body temperature trend.',
      attention: 'NORMAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'VITAL_TEMP_TREND_V1',
          title: 'Body temperature trend',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Temperature 36.8 °C and no upward trend in the last 6 hours.',
        },
      ],
      metrics: ['BODY_TEMPERATURE'],
      latest_values: [
        { metric: 'BODY_TEMPERATURE', label: 'Body temperature', value: 36.8, unit: '°C', observed_at: ago(6, now) },
      ],
      open_alert_ids: [],
    },
    {
      region: 'cabin',
      label_tr: 'Cabin environment',
      description_tr: 'Living space air: CO₂, O₂, pressure and radiation.',
      attention: 'CRITICAL',
      coverage: 'RULE',
      rules: [
        {
          rule_id: 'ENV_CO2_NOMINAL_V1',
          title: 'Kabin CO₂ seviyesi',
          health_attention: 'CRITICAL',
          data_quality: 'VALID',
          explanation: 'CO₂ has been 8.2 mmHg for 15 minutes — above the critical threshold. Check ventilation and notify the ground team.',
        },
        {
          rule_id: 'ENV_CABIN_ATMOSPHERE_V1',
          title: 'Cabin pressure and O₂',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Pressure 101.2 kPa, O₂ 20.9% — within the expected range.',
        },
        {
          rule_id: 'ENV_RADIATION_V1',
          title: 'Radiation dose rate',
          health_attention: 'NORMAL',
          data_quality: 'VALID',
          explanation: 'Dose rate is at the usual background level.',
        },
      ],
      metrics: ['CO2_PARTIAL_PRESSURE', 'CABIN_PRESSURE', 'O2_PERCENT', 'RADIATION_DOSE_RATE'],
      latest_values: [
        { metric: 'CO2_PARTIAL_PRESSURE', label: 'CO₂', value: 8.2, unit: 'mmHg', observed_at: ago(0.5, now) },
        { metric: 'CABIN_PRESSURE', label: 'Cabin pressure', value: 101.2, unit: 'kPa', observed_at: ago(2, now) },
        { metric: 'O2_PERCENT', label: 'O₂', value: 20.9, unit: '%', observed_at: ago(2, now) },
        { metric: 'RADIATION_DOSE_RATE', label: 'Radiation', value: 0.34, unit: 'mGy/day', observed_at: ago(30, now) },
      ],
      open_alert_ids: ['8d7e6c1a-0000-4000-8000-000000000002', '8d7e6c1a-0000-4000-8000-000000000003'],
    },
  ];
  return {
    mission_id: missionId ?? 'demo-mission',
    crew_member_id: crewId ?? 'demo-crew',
    generated_at: new Date(now).toISOString(),
    overall_attention: 'CRITICAL',
    regions,
  };
}
