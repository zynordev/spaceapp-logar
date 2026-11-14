# NASA Space Apps Challenge 2026: Official Submission Package

Project: **SpaceApp Logar**  
Challenge: **Health Monitoring Software**  
Repository: `https://github.com/zynordev/spaceapp-logar`

---

## Part 1: Project Details (NASA Portal Copy-Paste)

### Project Title
**SpaceApp Logar: Explainable Clinical Decision Support for Deep Space Exploration**

### Short Summary (Elevator Pitch)
When astronauts travel to Mars, Earth is up to 22 minutes away by radio. SpaceApp Logar is an autonomous, 100% offline clinical decision-support system (CDSS) that continuously monitors 11 environmental and vital telemetry streams. Using a NASA-STD-3001 cabin CO2 limit, clearly labelled demo rules across NASA's five spaceflight hazards and real NASA OSDR Inspiration4 lab data, Logar distinguishes physiological change from sensor anomalies, shows the full justification of every alert ("Why this alert?") and opens pre-written, versioned action cards. It never diagnoses and never generates medical prescriptions.

### Detailed Description

#### The Problem: The 22-Minute Silence
During low Earth orbit (ISS) missions, flight surgeons in Houston or Star City monitor telemetry in real time. On a journey to Mars, one-way communication latency reaches up to 22 minutes (a 44-minute round trip). If an acute hypercapnia event (cabin CO2 spike), hypoxemia, or infection arises, the crew cannot wait for ground control triage. Black-box machine learning models cannot be trusted because hallucinations in life-or-death scenarios are unacceptable. Astronauts require an explainable, deterministic, and fully offline decision-support tool.

#### Our Solution: SpaceApp Logar
SpaceApp Logar bridges the gap between raw telemetry and mission action:
1. **Multi-Metric Telemetry Monitoring:** Ingests and graphs 11 vital and cabin parameters: Cabin CO2, Cabin O2, Cabin Pressure, Radiation Dose Rate, Heart Rate, SpO2, Respiration Rate, Body Temperature, Systolic BP, Diastolic BP, and Sleep Duration, plus eight subjective check-in items (fatigue, dizziness, nausea, pain, mood, vision change, back pain, congestion).
2. **Explainable Rule Engine:** 11 deterministic rules spanning NASA's five spaceflight hazards (radiation, isolation, distance from Earth, altered gravity, hostile closed environment). Every alert carries its full provenance: measured value, threshold, time window, data quality, evidence class and source. A risk coverage map shows honestly which risks have a rule, which are only recorded, and which are not covered yet.
3. **Data Quality Discrimination:** A sensor disconnection or heart rate jump is identified as a `FAULT` or `SUSPECT` data quality issue rather than a medical emergency. "Bad data is not normal health."
4. **Pre-written Action Cards:** Rather than generating free-text treatments, Logar opens versioned cards. Each step has a one-line reason; cards include a reassessment timer, escalation and closing conditions, possible explanations (never a diagnosis) and a live "what is happening now" block (value, duration, trend, reported symptoms, other modules). Crew can mark steps as done. The CO2 card was approved by the team and is based on NASA-STD-3001 and NASA's CO2 technical brief; all other cards are labelled DEMO and contain only first-step actions (verify, rest, record, notify the crew medical officer, open the mission procedure).
5. **Red-Flag Emergency Escalation:** Immediate critical escalation for reported red flags (such as chest pain or severe shortness of breath) regardless of sensor readings, because normal vitals do not rule out a serious event. No diagnosis is made; only a crew member can close the alert.

#### Honest Scope and Limitations
- Only the cabin CO2 rule uses a published NASA standard threshold (NASA-STD-3001 nominal limit). All other thresholds are DEMO thresholds (evidence class F) based on general Earth clinical references and must be validated by flight medicine before operational use.
- Live telemetry in the demo is synthetic and clearly labelled; NASA OSDR data is used for real periodic lab values only.
- The system does not diagnose conditions such as a heart attack; that requires ECG, blood tests and a physician.

#### NASA Data Integration
Logar directly integrates real flight biomedical data from the **NASA Open Science Data Repository (OSDR)**:
- **OSD-569:** Complete Blood Count (CBC) from the commercial Inspiration4 mission (pre-flight and post-flight samples).
- **OSD-575:** Comprehensive Metabolic Panel (CMP) from the Inspiration4 mission (pre-flight and post-flight samples).
- 252 lab values for 4 crew members and 9 analytes are imported with their source reference ranges; units were verified against the original submitted files.
- **NASA-STD-3001:** NASA Space Flight Human-System Standard (Volume 2: Human Factors, Habitability, and Environmental Health) nominal environmental thresholds (e.g., cabin CO2 partial pressure limits).

#### Technology Architecture
- **Backend:** Python 3.12, FastAPI, SQLite with Write-Ahead Logging (WAL) for high-concurrency zero-lock telemetry ingest, SQLAlchemy, Alembic migrations.
- **Testing:** 239 automated tests covering rules, time windows, boundary conditions, demo scenarios and database migrations, run in GitHub Actions CI.
- **Resilience:** 100% offline capability with zero external CDN or cloud dependencies, containerized via Docker and cloud-deployable on Render/PaaS.

---

## Part 2: Artificial Intelligence & Tool Transparency Statement

In strict accordance with NASA Space Apps Challenge regulations, we disclose our use of AI tools during development:
- **Tools Used:** Claude Code, OpenAI Codex, Google Antigravity (Gemini).
- **Purpose:** Pair-programming assistance for automated test suite creation, SQLite schema migrations, data parsing scripts for OSDR CSV tables, and documentation formatting.
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
  * Ingests 11 vitals & environmental telemetry streams in real time.
  * Deterministic rule engine: 100% explainable, zero hallucination.
  * Context-aware: Distinguishes physical exercise from cardiovascular distress.
  * Action Cards: step-by-step first actions, each with a reason, a reassessment timer and clear escalation conditions (no diagnosis, no drugs).
- **Visual:** Dashboard screenshot showing telemetry charts and an active Action Card.

### Slide 4: Scientific Foundation & Real NASA Data
- **Key Message:** Grounded in real spaceflight biomedical data.
- **Points:**
  * **NASA-STD-3001 Standard:** nominal cabin CO2 limit (1-hour average ≤ 3.0 mmHg).
  * **NASA OSDR OSD-569 & OSD-575:** 252 real laboratory values from the Inspiration4 mission (pre-flight and post-flight CBC & CMP panels).
  * Baseline Comparison: Individual astronaut baselines compared against in-mission deviations.
- **Visual:** Inspiration4 lab result comparison graph with clinical reference ranges.

### Slide 5: Coverage Across NASA's Five Hazards
- **Key Message:** 11 explainable rules across five hazards, demonstrated with 9 clearly labelled synthetic scenarios.
- **Scenarios:**
  1. *Closed environment:* cabin CO2 build-up with headache (local vs cabin-wide, by comparing modules); cabin O2 partial-pressure drop.
  2. *Radiation:* solar particle event, dose-rate rise against the module's own baseline, shelter card, cumulative dose.
  3. *Distance from Earth:* fever-like trend; red-flag chest pain with normal vitals escalates immediately.
  4. *Altered gravity:* motion sickness pattern and vision change (SANS watch); SpO2 drop at rest.
  5. *Isolation:* multi-night sleep debt with fatigue and mood.
  6. *Data reliability:* sensor fault is shown as "Unknown", never as healthy.
- **Visual:** Risk coverage map (rule / data only / gap) next to before/after alert states.

### Slide 6: Engineering & System Architecture
- **Key Message:** Built for zero-connectivity deep space environments.
- **Points:**
  * 100% offline-first: zero CDN, zero cloud dependencies; designed to run on local hardware.
  * Prototype backend: FastAPI + SQLite WAL + Docker containerization.
  * Verified: 239 automated unit, scenario and migration tests in CI.
- **Visual:** System block diagram (Sensors -> Ingestion -> Rule Engine -> Action Cards -> Crew HUD).

### Slide 7: Next Horizons & Mission Impact
- **Key Message:** Enabling crew autonomy for Artemis, Gateway, and the journey to Mars.
- **Points:**
  * Scalability: Modular architecture ready to add ultrasound, ECG waveforms, and genomic biomarkers.
  * Open-source and transparent; DEMO thresholds and cards need flight-medicine validation before operational use. Next: environment profiles (ISS, transit, Moon, Mars) and context-aware personal baselines.
- **Call to Action:** "Giving deep space astronauts the autonomy to explore safely."
- **Links:** GitHub: github.com/zynordev/spaceapp-logar | Live Demo: [Deployed URL]

---

## Part 4: 30-Second Video Demonstration Storyboard

| Time | Visual on Screen | Voiceover / Action |
|---|---|---|
| **0:00 - 0:07** | Dashboard home: Clean telemetry graphs (Heart rate, SpO2, Cabin CO2) in NOMINAL state. | "In deep space, communication lag means astronauts must manage their own health. Meet SpaceApp Logar." |
| **0:07 - 0:15** | Click 'Run Demo Scenario: co2-headache'. CO2 graph rises above 3.0 mmHg. Alert turns amber (WATCH). | "When cabin CO2 spikes and the crew reports headache, Logar raises a Watch alert based on the NASA-STD-3001 limit." |
| **0:15 - 0:22** | Click 'Why this status?' explanation drawer, followed by 'Action Card'. | "No black-box guesses: Logar shows the exact evidence, data quality and a step-by-step action card with reasons." |
| **0:22 - 0:30** | Switch to Inspiration4 Lab Results tab; show CBC/CMP panels and finish with GitHub repo screen. | "Powered by real NASA OSDR Inspiration4 data. 100% offline, explainable, and mission-ready." |
