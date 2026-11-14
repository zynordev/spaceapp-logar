# NASA Space Apps Challenge 2026: Official Submission Package

Project: **SpaceApp Logar**  
Challenge: **Health Monitoring Software**  
Repository: `https://github.com/zynordev/spaceapp-logar`

---

## Part 1: Project Details (NASA Portal Copy-Paste)

### Project Title
**SpaceApp Logar: Explainable Clinical Decision Support for Deep Space Exploration**

### Short Summary (Elevator Pitch)
When astronauts travel to Mars, Earth is up to 22 minutes away by radio. SpaceApp Logar is an autonomous, 100% offline clinical decision-support system (CDSS) that continuously monitors 11 environmental and vital telemetry streams. Guided by NASA-STD-3001 standards and real NASA OSDR Inspiration4 clinical lab datasets, Logar distinguishes true physiological distress from sensor anomalies, displays transparent evidence-based justifications ("Why this alert?"), and provides verified, standardized action cards without generating ungrounded AI medical prescriptions.

### Detailed Description

#### The Problem: The 22-Minute Silence
During low Earth orbit (ISS) missions, flight surgeons in Houston or Star City monitor telemetry in real time. On a journey to Mars, one-way communication latency reaches up to 22 minutes (a 44-minute round trip). If an acute hypercapnia event (cabin CO2 spike), hypoxemia, or infection arises, the crew cannot wait for ground control triage. Black-box machine learning models cannot be trusted because hallucinations in life-or-death scenarios are unacceptable. Astronauts require an explainable, deterministic, and fully offline decision-support tool.

#### Our Solution: SpaceApp Logar
SpaceApp Logar bridges the gap between raw telemetry and mission action:
1. **Multi-Metric Telemetry Monitoring:** Ingests and graphs 11 vital and cabin parameters: Cabin CO2, Cabin O2, Cabin Pressure, Radiation Dose Rate, Heart Rate, SpO2, Respiration Rate, Core Body Temperature, Systolic BP, Diastolic BP, and Sleep Duration.
2. **Explainable Rule Engine:** Every alert is accompanied by its full provenance: the exact threshold, moving time window, data quality flag, and scientific reference.
3. **Data Quality Discrimination:** A sensor disconnection or heart rate jump is identified as a `FAULT` or `SUSPECT` data quality issue rather than a medical emergency. "Bad data is not normal health."
4. **Verified Action Cards:** Rather than generating speculative free-text treatments, Logar opens peer-reviewed, standardized checklist cards (e.g., `ENV_CO2_WATCH_CARD_V1`) following NASA flight medical protocols.
5. **Red-Flag Emergency Escalation:** Immediate critical escalation for acute subjective red flags (such as sudden crushing chest pain) regardless of sensor readings.

#### NASA Data Integration
Logar directly integrates real flight biomedical data from the **NASA Open Science Data Repository (OSDR)**:
- **OSD-569:** Complete Blood Count (CBC) with differential from the commercial Inspiration4 mission.
- **OSD-575:** Comprehensive Metabolic Panel (CMP) from the Inspiration4 mission.
- **NASA-STD-3001:** NASA Space Flight Human-System Standard (Volume 2: Human Factors, Habitability, and Environmental Health) nominal environmental thresholds (e.g., cabin CO2 partial pressure limits).

#### Technology Architecture
- **Backend:** Python 3.12, FastAPI, SQLite with Write-Ahead Logging (WAL) for high-concurrency zero-lock telemetry ingest, SQLAlchemy, Alembic migrations.
- **Testing:** 195 automated tests verifying every clinical rule, time window, and boundary condition.
- **Resilience:** 100% offline capability with zero external CDN or cloud dependencies, containerized via Docker and cloud-deployable on Render/PaaS.

---

## Part 2: Artificial Intelligence & Tool Transparency Statement

In strict accordance with NASA Space Apps Challenge regulations, we disclose our use of AI tools during development:
- **Tools Used:** Claude Code, OpenAI Codex, Google Antigravity (Gemini).
- **Purpose:** Pair-programming assistance for automated test suite creation, SQLite schema migrations, data parsing scripts for OSDR CSV tables, and documentation formatting.
- **Clinical Logic Integrity:** Crucially, **no generative AI is used inside the runtime medical engine**. All medical and environmental alert thresholds, clinical reasoning chains, and action cards are hard-coded deterministic rules derived strictly from published NASA-STD-3001 flight standards and clinical aerospace medicine guidelines. The software is explainable by design.

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
  * Verified Action Cards: Clear, step-by-step NASA flight operational checklists.
- **Visual:** Dashboard screenshot showing telemetry charts and an active Action Card.

### Slide 4: Scientific Foundation & Real NASA Data
- **Key Message:** Grounded in real spaceflight biomedical data.
- **Points:**
  * **NASA-STD-3001 Standard:** Flight-certified environmental boundaries (CO2 < 3.0 mmHg nominal).
  * **NASA OSDR OSD-569 & OSD-575:** 252 real clinical laboratory records from the Inspiration4 mission (Pre-flight, In-flight, Post-flight CBC & CMP panels).
  * Baseline Comparison: Individual astronaut baselines compared against in-mission deviations.
- **Visual:** Inspiration4 lab result comparison graph with clinical reference ranges.

### Slide 5: The Four Critical Capabilities
- **Key Message:** Tested against real aerospace medicine challenge scenarios.
- **Four Pillars:**
  1. *Acute Environmental Alert:* CO2 rise triggers headache check-in and CO2 Watch Action Card.
  2. *Infection & Vitals Trend:* Multi-hour fever, resting heart rate, and respiration rate correlation.
  3. *Sensor Fault vs Distress:* Drops in signal quality correctly marked as "Unknown/Faulty Data", preventing false alarms.
  4. *Red-Flag Triage:* Sudden subjective symptoms (e.g., chest pain) trigger immediate emergency protocol.
- **Visual:** 4 scenario cards showing before/after alert state.

### Slide 6: Engineering & System Architecture
- **Key Message:** Built for zero-connectivity deep space environments.
- **Points:**
  * 100% offline-first: Zero CDN, zero cloud dependencies, runs on local flight hardware.
  * Production-grade backend: FastAPI + SQLite WAL + Docker containerization.
  * Rigorously verified: 195 automated unit, scenario, and migration tests in CI.
- **Visual:** System block diagram (Sensors -> Ingestion -> Rule Engine -> Action Cards -> Crew HUD).

### Slide 7: Next Horizons & Mission Impact
- **Key Message:** Enabling crew autonomy for Artemis, Gateway, and the journey to Mars.
- **Points:**
  * Scalability: Modular architecture ready to add ultrasound, ECG waveforms, and genomic biomarkers.
  * Operational Ready: Open-source, transparent, and deployable today.
- **Call to Action:** "Giving deep space astronauts the autonomy to explore safely."
- **Links:** GitHub: github.com/zynordev/spaceapp-logar | Live Demo: [Deployed URL]

---

## Part 4: 30-Second Video Demonstration Storyboard

| Time | Visual on Screen | Voiceover / Action |
|---|---|---|
| **0:00 - 0:07** | Dashboard home: Clean telemetry graphs (Heart rate, SpO2, Cabin CO2) in NOMINAL state. | "In deep space, communication lag means astronauts must manage their own health. Meet SpaceApp Logar." |
| **0:07 - 0:15** | Click 'Run Demo Scenario: co2-headache'. CO2 graph rises above 3.0 mmHg. Alert turns amber (WATCH). | "When cabin CO2 spikes and the crew reports headache, Logar triggers a validated NASA-STD-3001 Watch alert." |
| **0:15 - 0:22** | Click 'Why this status?' explanation drawer, followed by 'Action Card'. | "No black-box guesses: Logar displays the exact proof, data quality flags, and verified operational checklists." |
| **0:22 - 0:30** | Switch to Inspiration4 Lab Results tab; show CBC/CMP panels and finish with GitHub repo screen. | "Powered by real NASA OSDR Inspiration4 data. 100% offline, explainable, and mission-ready." |
