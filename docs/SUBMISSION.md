# NASA Space Apps Challenge 2026: Official Submission Package

Project: **SpaceApp Logar**  
Challenge: **Health Monitoring Software**  
Repository: `https://github.com/zynordev/spaceapp-logar` (currently private and without a license file; the team must make it public, or grant judges access, before submission)

---

## Part 1: Project Details (NASA Portal Copy-Paste)

### Project Title
**SpaceApp Logar: Explainable Clinical Decision Support for Deep Space Exploration**

### Short Summary (Elevator Pitch)
When astronauts travel to Mars, Earth is up to 22 minutes away by radio. SpaceApp Logar is an autonomous, 100% offline clinical decision-support system (CDSS) that continuously monitors 12 environmental and vital telemetry streams (heart rate variability is recorded as data only). Using a NASA-STD-3001 cabin CO2 limit, clearly labelled demo rules across NASA's five spaceflight hazards and real NASA OSDR Inspiration4 lab data, Logar distinguishes physiological change from sensor anomalies, shows the full justification of every alert ("Why this status?") and opens pre-written, versioned action cards. It never diagnoses and never generates medical prescriptions.

### Detailed Description

#### The Problem: The 22-Minute Silence
During low Earth orbit (ISS) missions, flight surgeons in Houston or Star City monitor telemetry in real time. On a journey to Mars, one-way communication latency reaches up to 22 minutes (a 44-minute round trip). If an acute hypercapnia event (cabin CO2 spike), hypoxemia, or infection arises, the crew cannot wait for ground control triage. Black-box machine learning models cannot be trusted because hallucinations in life-or-death scenarios are unacceptable. Astronauts require an explainable, deterministic, and fully offline decision-support tool.

#### Our Solution: SpaceApp Logar
SpaceApp Logar bridges the gap between raw telemetry and mission action:
1. **Multi-Metric Telemetry Monitoring:** Ingests and graphs 12 vital and cabin parameters: Cabin CO2, Cabin O2, Cabin Pressure, Radiation Dose Rate, Heart Rate, Heart Rate Variability (RMSSD, recorded as data only: no rule and no threshold reads it), SpO2, Respiration Rate, Body Temperature, Systolic BP, Diastolic BP, and Sleep Duration, plus eight subjective check-in items (fatigue, dizziness, nausea, pain, mood, vision change, back pain, congestion).
2. **Explainable Rule Engine:** 11 deterministic rules: 10 cover NASA's five spaceflight hazards (radiation, isolation, distance from Earth, altered gravity, hostile closed environment) and 1 is a cross-cutting data-reliability check (heart rate sensor quality). Every alert carries its full provenance: measured value, threshold, time window, data quality, evidence class and source. A risk coverage map shows honestly which risks have a rule, which are only recorded, and which are not covered yet.
3. **Data Quality Discrimination:** A sensor disconnection or heart rate jump is identified as a `FAULT` or `SUSPECT` data quality issue rather than a medical emergency. "Bad data is not normal health."
4. **Pre-written Action Cards:** Rather than generating free-text treatments, Logar opens versioned cards. Each step has a one-line reason; cards include a reassessment timer, escalation and closing conditions, possible explanations (never a diagnosis) and a live "what is happening now" block (value, duration, trend, reported symptoms, other modules). Crew can mark steps as done. The CO2 card was approved by the team and is based on NASA-STD-3001 and NASA's CO2 technical brief; all other cards are labelled DEMO and contain only first-step actions (verify, rest, record, notify the crew medical officer, open the mission procedure).
5. **Red-Flag Emergency Escalation:** Immediate critical escalation for reported red flags (such as chest pain or severe shortness of breath) regardless of sensor readings, because normal vitals do not rule out a serious event. No diagnosis is made; the alert never closes automatically and must be closed by a person (in demo mode the caller states a crew member id, which is not verified; with token auth only the CREW_MEDICAL_OFFICER role may close it).
6. **Environment Context and Personal Baselines:** A mission can record its current environment through `POST /v1/environment-contexts` (Earth, ISS, transit vehicle, lunar habitat, Mars habitat or EVA, with gravity, EVA state and communication delay). The demo scenarios all run in an ISS context; Moon, Mars, transit and EVA contexts are supported by the API but not yet shown in a scenario. A personal baseline is learned from the crew member's or module's own earlier valid data in that context; alert, faulty and symptomatic periods are excluded. A baseline with too little data is marked "estimated/research" and is not used as an established normal. Baseline snapshots are versioned and can be rolled back. Currently the body temperature trend, resting heart rate and radiation dose-rate rules use these baselines.
7. **Activity Declarations:** The crew can declare REST, LIGHT, EXERCISE or SLEEP with a planned duration. A measurement without a sensor activity label is stamped with the declared activity (marked `DECLARED`; sensor labels are marked `SENSOR`). When the planned time ends without the crew ending the activity, the context becomes "unknown" instead of being assumed, so resting-heart-rate rules do not use that data.
8. **Body Map:** A fixed nine-region map (head, eyes, inner ear, heart, lungs, torso, musculoskeletal, skin, cabin) groups every rule and metric by region. A region shows the worst attention level of its rules, and regions without a rule are shown as "data only" or "gap" instead of "normal". The dashboard renders it as a 3D body (see Technology Architecture) with a 2D fallback.
9. **Routines, Periodic Tests and Streaks:** Reminders for hydration, exercise, sleep window and check-in, plus weekly body mass, weekly grip strength and a two-weekly musculoskeletal assessment, with completion streaks. The intervals are DEMO defaults. There are no medication reminders.
10. **Ground Sync and Automatic Flight-Surgeon Escalation:** Delay-tolerant packets routed by a fixed table to the flight surgeon, life support, radiation team and mission control. Each packet carries a SHA-256 hash and, when a secret is configured, an HMAC-SHA256 signature; the ground side acknowledges a packet with its hash (with token authentication only the GROUND role may acknowledge). Whenever an ALERT or CRITICAL alert opens (red flags included), one escalation is created automatically for the flight surgeon. The routing is a rule table, not machine learning, and the link delay is only displayed (`SPACEAPP_LINK_DELAY_SECONDS`).
11. **Long-term Trend:** Hourly or daily mean, minimum, maximum and count per metric (`GET /v1/measurements/trend`).

#### Honest Scope and Limitations
- Only the cabin CO2 rule uses a published NASA standard threshold (NASA-STD-3001 nominal limit). All other thresholds are DEMO thresholds (evidence class F) based on general Earth clinical references and must be validated by flight medicine before operational use.
- Live telemetry in the demo is synthetic and clearly labelled; NASA OSDR data is used for real periodic lab values only.
- The system does not diagnose conditions such as a heart attack; that requires ECG, blood tests and a physician.
- The risk coverage map lists 21 risks: 11 have a rule, 4 are only recorded as data, and 6 are not covered yet.
- Personal baselines need enough earlier valid data; new crew members or new environments start with "estimated/research" baselines that the rules do not treat as normal.
- Token authentication is optional and off by default. Tokens are HMAC-signed demo credentials with a 12-hour expiry (no revocation, no refresh, passcodes not hashed at rest), and roles are currently enforced only when closing red-flag alerts (crew medical officer) and acknowledging ground sync packets (ground). The dashboard has a login dialog that appears when the backend reports that authentication is required.
- Activity declarations: ending an activity does not check who owns it. Routine defaults are idempotent in code only (no database unique constraint). The pending counts on the ground sync status are approximate.
- Heart rate variability is recorded and graphed but has no rule or threshold; none is claimed.
- The 3D anatomy comes from BodyParts3D 4.0, which has no lung parenchyma and no inner-ear labyrinth: the lungs are shown as the bronchial tree and pulmonary vessels, and the inner-ear region uses the external ear. This is a visualization limit.
- No machine learning is used anywhere (not in the rules, the routing or the escalation), and the system gives no diagnosis and no medication advice.
- The Render blueprint defines no database yet; a hosted demo uses a SQLite file inside the container. On a host without a persistent disk (such as the free plan in `render.yaml`) that file is lost on each redeploy or restart, so demo data is not persistent; the container re-runs migrations and the OSDR import at every start.

#### NASA Data Integration
Logar directly integrates real flight biomedical data from the **NASA Open Science Data Repository (OSDR)**:
- **OSD-569:** Complete Blood Count (CBC) from the commercial Inspiration4 mission (pre-flight and post-flight samples).
- **OSD-575:** Comprehensive Metabolic Panel (CMP) from the Inspiration4 mission (pre-flight and post-flight samples).
- 252 lab values for 4 crew members and 9 analytes are imported with their source reference ranges; units were verified against the original submitted files.
- **NASA-STD-3001:** NASA Space Flight Human-System Standard (Volume 2: Human Factors, Habitability, and Environmental Health) nominal environmental thresholds (e.g., cabin CO2 partial pressure limits).

#### Technology Architecture
- **Frontend:** a React 19 + TypeScript + Vite single-page dashboard with React Three Fiber, served by the FastAPI backend at `/ui/` from the `frontend/dist` build. HUD-style mission screen over a full-screen 3D scene; a realistic 3D body map coloured by region attention (with a built-in procedural body and a 2D fallback); input forms, routines, ground station panel and a login dialog. Offline-first: no CDN, no external fonts or requests at run time. Realistic anatomy is derived from BodyParts3D 4.0 (The Database Center for Life Science, licensed CC BY 4.0; attribution in `frontend/public/models/ATTRIBUTION.md`). If the build is missing, `/ui/` shows a page explaining how to build it and the API keeps working.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Alembic migrations (17 migrations). SQLite by default (Write-Ahead Logging and a busy timeout for concurrent reads and writes); PostgreSQL is also supported through `SPACEAPP_DATABASE_URL` or `DATABASE_URL`.
- **Schema check:** if the database is behind the code (migrations not applied), data requests return a clear 503 and `/health` reports the schema state, instead of failing with opaque errors.
- **Ingestion:** single measurements, batch ingestion (`POST /v1/measurements/batch`, up to 1000 items, all-or-nothing or partial mode with per-item errors) and a CSV telemetry adapter in the backend code (not yet exposed as an HTTP endpoint).
- **Observability:** every response carries an `X-Request-ID`; requests are logged as JSON lines; error responses raised by the API share one body format that includes the request id (the exception is the batch endpoint's per-item rejection report in all-or-nothing mode, which returns 422 with the batch result body).
- **Access control (optional):** signed bearer tokens from `POST /v1/auth/token` with three roles (astronaut, crew medical officer, ground), switched on with `SPACEAPP_AUTH_REQUIRED=true` and configured with `SPACEAPP_AUTH_SECRET` (signing key; without it the token endpoint returns 503) and `SPACEAPP_AUTH_USERS` (demo users); off by default so the offline dashboard and demo scenarios keep working.
- **Testing:** 373 automated backend tests covering rules, time windows, boundary conditions, demo scenarios, database migrations and the API; on the final `main` commit checked locally on SQLite, 371 pass and 2 PostgreSQL-only tests are skipped. An earlier commit (before today's additions) also passed all tests on an embedded PostgreSQL 16; the PostgreSQL run and CI were not repeated for the final commit when this was written. GitHub Actions CI has three jobs (SQLite tests, PostgreSQL 16 tests, and a frontend type-check and build); confirm all three are green on the final commit before submitting. The frontend has no automated tests beyond type-checking and the build.
- **Resilience:** 100% offline capability at run time with zero external CDN or cloud dependencies; the Docker image is multi-stage (Node builds the dashboard, then the Python image serves it) and a Render blueprint is included (not yet deployed).

---

## Part 2: Artificial Intelligence & Tool Transparency Statement

In strict accordance with NASA Space Apps Challenge regulations, we disclose our use of AI tools during development:
- **Tools Used:** Claude Code, OpenAI Codex, Google Antigravity (Gemini).
- **Purpose:** Pair-programming assistance for automated test suite creation, database schema migrations, data parsing scripts for OSDR CSV tables, documentation, and, on the final day, parallel AI coding agents that implemented the new backend endpoints and the React dashboard (including the 3D body-map scene and its model-conversion pipeline). The AI-written work was merged into the main branch by the team's main session; the backend is covered by the automated tests described above, while the frontend is covered only by type-checking and the build.
- **Third-party assets:** the realistic 3D anatomy is derived from BodyParts3D 4.0 (CC BY 4.0, The Database Center for Life Science); attribution is shipped with the model files. Real laboratory values come from NASA OSDR.
- **Clinical Logic Integrity:** Crucially, **no generative AI is used inside the runtime decision engine**. All alert thresholds and action cards are fixed, deterministic and versioned. Only the cabin CO2 rule is derived from a published NASA standard (NASA-STD-3001). The other thresholds are DEMO thresholds (evidence class F) based on general Earth clinical references; they are labelled as such in the API and the dashboard and require flight-medicine validation. The software is explainable by design.

---

## Part 3: 7-Slide Pitch Deck (Content & Layout Guide)

### Slide 1: Cover & Mission
- **Header:** SpaceApp Logar
- **Subtitle:** Autonomous & Explainable Astronaut Health Decision Support
- **Visual:** Deep space / Mars transit spacecraft silhouette with clean telemetry HUD overlay.
- **Footer:** NASA Space Apps Challenge 2026 | Team Logar

### Slide 2: The Problem: The 22-Minute Silence
- **Key Message:** Beyond Earth orbit, there is no real-time ground control doctor.
- **Points:**
  * Mars transit latency: 4 to 22 minutes one-way signal delay.
  * Rapid physiological adaptation: microgravity fluid shifts, cabin CO2 pockets, radiation exposure.
  * The danger of black-box AI: Untraceable hallucinations risk astronaut lives.
- **Visual:** Timeline showing Earth-Mars communication delay vs acute medical event timeline.

### Slide 3: The Solution: SpaceApp Logar
- **Key Message:** An autonomous, explainable clinical decision-support co-pilot.
- **Points:**
  * Ingests 12 vitals & environmental telemetry streams (HRV is data only, no threshold).
  * Deterministic rule engine: 100% explainable, zero hallucination.
  * Context-aware: resting heart-rate and respiration rules use only data labelled as rest, so labelled exercise periods do not trigger cardiovascular alerts.
  * Action Cards: step-by-step first actions, each with a reason, a reassessment timer and clear escalation conditions (no diagnosis, no drugs).
- **Visual:** HUD dashboard screenshot showing the 3D body map, telemetry charts and an active Action Card.

### Slide 4: Scientific Foundation & Real NASA Data
- **Key Message:** Grounded in real spaceflight biomedical data.
- **Points:**
  * **NASA-STD-3001 Standard:** nominal cabin CO2 limit (1-hour average ≤ 3.0 mmHg).
  * **NASA OSDR OSD-569 & OSD-575:** 252 real laboratory values from the Inspiration4 mission (pre-flight and post-flight CBC & CMP panels).
  * Lab comparison: each crew member's post-flight values compared with their own most recent earlier pre-flight sample (the OSDR data has no in-flight lab values). In-mission personal baselines (on synthetic telemetry) are used for body temperature, resting heart rate and radiation dose rate.
- **Visual:** Inspiration4 lab result comparison graph with clinical reference ranges.

### Slide 5: Coverage Across NASA's Five Hazards
- **Key Message:** 11 explainable rules covering NASA's five hazards plus a cross-cutting data-reliability check, demonstrated with 9 clearly labelled synthetic scenarios.
- **Scenarios:**
  1. *Closed environment:* cabin CO2 build-up with headache (local vs cabin-wide, by comparing modules); cabin O2 partial-pressure drop; SpO2 drop at rest (hypoxia risk).
  2. *Radiation:* solar particle event, dose-rate rise against the module's own baseline, shelter card, cumulative dose.
  3. *Distance from Earth:* fever-like trend; red-flag chest pain with normal vitals escalates immediately.
  4. *Altered gravity:* motion sickness pattern and vision change (SANS watch).
  5. *Isolation:* multi-night sleep debt with fatigue and mood.
  6. *Data reliability:* sensor fault is shown as "Unknown", never as healthy.
- **Visual:** Risk coverage map (rule / data only / gap) next to before/after alert states.

### Slide 6: Engineering & System Architecture
- **Key Message:** Built for zero-connectivity deep space environments.
- **Points:**
  * 100% offline-first: zero CDN, zero cloud dependencies; designed to run on local hardware.
  * Prototype backend: FastAPI + SQLite WAL (PostgreSQL optional) + Docker containerization; React + 3D body-map dashboard served from the same process.
  * Ground sync: hash-checked, optionally signed packets and automatic flight-surgeon escalation for ALERT/CRITICAL (rule-based, no machine learning).
  * Tested: 373 automated backend unit, scenario, migration and API tests (371 pass and 2 PostgreSQL-only tests skipped on SQLite for the final commit); CI runs SQLite, PostgreSQL and frontend build jobs on every push (confirm green on the final commit).
- **Visual:** System block diagram (Sensors -> Ingestion -> Rule Engine -> Action Cards -> Crew HUD).

### Slide 7: Next Horizons & Mission Impact
- **Key Message:** Enabling crew autonomy for Artemis, Gateway, and the journey to Mars.
- **Points:**
  * Scalability: Modular architecture ready to add ultrasound, ECG waveforms, and genomic biomarkers.
  * Transparent: rules, thresholds and cards are readable in the code (the repository is not yet public and has no license; open-sourcing is a team decision). DEMO thresholds and cards need flight-medicine validation before operational use. Environment contexts and personal baselines exist in a first version (the API accepts ISS, transit, Moon, Mars and EVA contexts; the demo scenarios show only ISS); the dashboard has a login dialog for token authentication, which stays off by default.
- **Call to Action:** "Giving deep space astronauts the autonomy to explore safely."
- **Links:** GitHub: github.com/zynordev/spaceapp-logar (accessible to judges only once the team makes it public or grants access). Live demo: not deployed yet; a Dockerfile and a Render blueprint are included. Add the real URL here only after a deployment exists.

---

## Part 4: 30-Second Video Demonstration Storyboard

| Time | Visual on Screen | Voiceover / Action |
|---|---|---|
| **0:00 - 0:07** | HUD dashboard with the 3D body (Turkish UI, English captions in the video), before any scenario runs. | "In deep space, communication lag means astronauts must manage their own health. Meet SpaceApp Logar." |
| **0:07 - 0:15** | Pick 'co2-headache' in the demo scenario control of the inputs panel and run it. Select cabin CO2 in the time chart: the 1-hour average rises above 3.0 mmHg and the CO2 rule shows 'İzle' (Watch); the cabin region of the body map turns to Watch. | "When the 1-hour average cabin CO2 rises above the NASA-STD-3001 nominal limit, Logar raises a Watch alert; the crew's reported headache is shown as context on the action card." |
| **0:15 - 0:22** | Open the rules panel with its 'Neden?' (Why?) explanation, then the 'Eylem kartı' (action card). | "No black-box guesses: Logar shows the exact evidence, data quality and a step-by-step action card with reasons." |
| **0:22 - 0:30** | Press 'Gerçek OSDR lab verisi (Inspiration4)' in the lab panel, select the osdr-inspiration4 mission and show the CBC/CMP values; finish on the repository screen. (Check the exact labels against the final build before recording.) | "Powered by real NASA OSDR Inspiration4 data. 100% offline and explainable." |
