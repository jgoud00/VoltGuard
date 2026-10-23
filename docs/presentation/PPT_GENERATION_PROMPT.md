# VoltGuard semester review PPT generation prompt

Copy everything below into your presentation generator. Attach actual dashboard and hardware screenshots if available. Replace the college, course and faculty placeholders before generating.

---

Create a polished 17-slide PowerPoint for a 15-minute final semester project review titled **VoltGuard IoT Battery Monitoring System**. Audience: college faculty assessing an embedded and full-stack project. Team: **Jaswant, Abhi, Gopi, Syam and Saif**. College: [COLLEGE NAME]. Course: [COURSE NAME]. Faculty: [FACULTY NAME]. Date: [REVIEW DATE].

Use simple spoken English, accurate technical language, readable diagrams and short slide text. Give each slide a full speaker note, suggested visual, presenter name and timing. Follow this exact speaking distribution: Jaswant 5 minutes total, Abhi 4 minutes, Saif 3 minutes, Gopi 2 minutes, Syam 1 minute. These are speaking assignments, not claims about who wrote the code.

## Design

Use a 16:9 layout, white or warm off-white background, dark text, forest green accents and restrained blue for network/database components. Use 30-36 pt titles and at least 22 pt main text. Prefer diagrams to dense paragraphs. Keep each slide to at most five short points. Use consistent sensor, MCU, broker, server, database and browser icons. Include presenter names in a small readable footer. Use simple appear/fade transitions only. Do not use decorative stock photos of unrelated industrial equipment. Do not manufacture dashboard screenshots, readings, wiring photographs, test results, accuracy figures or component costs.

## Verified project facts

- Physical prototype: ESP32 Dev Module, powered by USB; a two-cell series lithium-ion pack, approximately 8.14 V during previous observations. This is a monitoring prototype, not a certified BMS or automatic protection system.
- Voltage sensor signal goes to GPIO34. Its 30 kOhm / 7.5 kOhm divider has ratio 5. Firmware averages `analogReadMilliVolts` and multiplies by 5.
- ACS712 5 A module: VCC to the confirmed ESP32 VIN/5 V supply, GND to common ground. OUT connects through 10 kOhm to GPIO35; a second 10 kOhm connects that junction to GND. Nominal input sensitivity at GPIO35: 92.5 mV/A. Current is a calibrated nominal estimate, not an accuracy-validated measurement. The small LED load with a 10 kOhm resistor is too small for reliable ACS712 measurement.
- DS18B20: 3.3 V supply, DATA to GPIO4, common ground and 4.7 kOhm pull-up from DATA to 3.3 V. Firmware uses OneWire and DallasTemperature and publishes null on sensor failure.
- Firmware: Arduino C++, WiFi, PubSubClient, OneWire and DallasTemperature. Fresh telemetry roughly once a second, Wi-Fi/MQTT reconnect attempts with backoff capped at 30 seconds, continued MQTT servicing, asynchronous temperature conversion.
- MQTT broker: Aedes embedded in the Node.js backend, port 1883. ESP32 is a publisher, backend is a subscriber, broker routes topic messages. Topic: `voltguard/device/voltguard-01/telemetry`. Device ID: `voltguard-01`. Broker address is the computer's current reachable LAN IPv4, configured locally; never place passwords in slides.
- Current ESP32 publisher uses QoS 0 and retain=false. Backend subscribes at QoS 1, which does not upgrade a QoS 0 publication. Do not claim guaranteed delivery or offline buffering.
- Backend: Node.js, Express, native MongoDB Node.js driver, MQTT.js and ws. Shared validation, duplicate/out-of-order filtering, alert evaluation, MongoDB persistence, REST APIs and WebSocket updates. It does not use Mongoose, Firebase or a cloud database.
- Frontend: React, Vite, Chart.js/react-chartjs-2, Radix UI controls and Lucide icons. HTTP loads stored history; WebSocket pushes new readings. Stale data is identified, unavailable fields are not stored as zero, and CSV export uses stored telemetry.
- Database: local MongoDB Community, database `voltguard`, collections `telemetry`, `alerts`, `counters`. Single-node replica set `voltguard` on localhost enables transactions but is not a high-availability deployment. URI: `mongodb://127.0.0.1:27018/?replicaSet=voltguard`. Files are under `backend/data/mongodb/`. No cloud/Atlas deployment is implemented.
- Migrated and verified 10,931 existing telemetry records and 36 alerts from SQLite on October 7, 2026. This is the cutover count, not the current database count. SQLite source and a pre-MongoDB backup remain intact; new production readings go to MongoDB.
- Backend power: signed `P = V * I`, in watts, based on nominal noise-limited current. Positive is intended as discharge. Negative noise alone does not prove charging.
- Backend energy: cumulative discharge-only estimate in kWh; trapezoidal integration of positive endpoint power using actual receive-time interval. Gaps over 5 seconds and intervals with unavailable power are excluded; charging energy is not accumulated. Stored cumulative energy survives backend restart.
- Physical telemetry stores SoC, SoH/health index and internal resistance as null. Dashboard SoC and health are changing presentation previews, visibly labeled Demo mode. Never present those as measured battery values or claim a validated prediction algorithm, AI, ML or coulomb-counting implementation.
- Latest documented calibration: 256 non-overlapping averages of 32 raw conversions, 8,192 raw conversions in about 42.8 seconds, mean 353.299 mV, averaged span 9.188 mV against 30 mV limit. Raw standard deviation approximately 9.765 mV. Software accepted the baseline, but its similarity to an earlier unpowered reading leaves supply/wiring validation unresolved. The raw-noise cutoff was explicitly disabled; small current values remain uncertain. Baseline is RAM-only and resets at reboot.
- Previous verification: 20 backend tests passed, including MongoDB MQTT/API/WebSocket, alerts and restart persistence; frontend production build passed; live ESP32 telemetry was observed in MongoDB and the browser. Distinguish this evidence from accuracy or safety certification. Verify services and hardware again before review.

## Slide order and exact allocation

1. **Title and team** — Jaswant, 25 seconds. Project name, five team names, course/faculty placeholders. Opening: a local end-to-end battery telemetry and monitoring prototype.
2. **Problem and motivation** — Jaswant, 35 seconds. Separate manual measurements do not provide synchronized trends or durable event history. Explain the need for a single view without inventing survey statistics.
3. **Objectives and scope** — Jaswant, 30 seconds. Capture sensor data, transmit wirelessly, validate and store, display trends and detect configured conditions. Distinguish monitoring from load protection.
4. **System architecture** — Jaswant, 50 seconds. Clear left-to-right diagram: sensors -> ESP32 -> Wi-Fi -> Aedes MQTT broker -> Node/Express pipeline -> MongoDB, and backend -> REST/WebSocket -> React dashboard. Explain publisher/broker/subscriber roles.
5. **MQTT data path** — Jaswant, 40 seconds. Topic, device ID, roughly 1 Hz publishing, QoS 0/non-retained reality, backend subscription and reconnect behavior. Use a sequence diagram. No credentials.
6. **Hardware and wiring** — Gopi, 60 seconds. ESP32, 2S battery, GPIO34 voltage, GPIO35 divided current, GPIO4 temperature. A labeled low-voltage schematic, not mains wiring. Mention common ground and sensor supply.
7. **Sensor reading and calibration** — Gopi, 60 seconds. Voltage ratio 5, asynchronous temperature, zero-current calibration with the load path disconnected and sensor powered. Noise limitation and RAM-only zero. Small LED load limitation.
8. **Firmware workflow** — Syam, 60 seconds. Loop diagram: service network/serial -> acquire ADC -> handle temperature conversion -> publish when due. Credentials in ignored local files; backend timestamp when UTC is unsynchronized. Keep this the shortest speaking block.
9. **Backend processing** — Abhi, 60 seconds. MQTT.js subscriber -> shared validation -> ordered ingestion -> derived estimates and alert evaluation -> atomic storage -> WebSocket broadcast. Invalid data and unavailable measurements.
10. **MongoDB storage** — Abhi, 70 seconds. Collections, document fields, indexes, transactions, counters, SQLite migration and preserved source. Show an actual MongoDB/API example or a clearly labeled schema illustration. Explain local persistence and native driver.
11. **Power and energy calculations** — Abhi, 65 seconds. `P = V * I`; `delta E_kWh = (max(P_old,0)+max(P_new,0))/2 * delta t_ms / 3,600,000,000`. Explain sign, noise, gaps, accumulated energy and null SoC/SoH. Mark any arithmetic example illustrative.
12. **Alerts and reliability** — Abhi, 45 seconds. Threshold conditions, one event per active condition, recovery updates, offline/freshness, duplicate filtering. Example defaults for 2S: above 8.4 V, below 6 V, above 50 C. These are software thresholds, not certified safety limits.
13. **Dashboard and interaction** — Saif, 60 seconds. Metric cards, charts, device inspector, active/recent event tabs, freshness and CSV. Distinguish LIVE transport from accuracy, and presentation previews from stored values.
14. **Testing and observed results** — Saif, 60 seconds. 20 tests and build; real ESP32-to-MongoDB-to-browser evidence; migration count; nullable failures and restart continuity. No unsupported latency/accuracy/scalability claims.
15. **Limitations and future work** — Saif, 60 seconds. Verify sensor supply and measurement accuracy; better low-current sensing; measured capacity and validated SoC/SoH; TLS/authentication; deployment and scaling; hardware protection as a separate future design. State these as future work.
16. **Live demonstration** — Jaswant, 75 seconds. Show dashboard freshness, real readings and quality, `/api/health`, `/api/latest`, MongoDB latest document/history and recent alerts. Keep a screenshot fallback if networking fails. Do not recalibrate or alter battery wiring during presentation.
17. **Conclusion and questions** — Jaswant, 45 seconds. Completed embedded-to-database-to-dashboard pipeline, persistent history, transparent measurement limitations. Invite questions; Jaswant directs database/backend questions to Abhi, hardware to Gopi, firmware to Syam and UI/testing to Saif.

For each slide, generate natural notes matching its time budget, not generic bullet repetition. Use the speaking guide if supplied as an attachment. Add short transition sentences between speakers. Put code paths and source references into notes or an appendix, not crowded slide bodies.

## Evidence and presentation restrictions

Use a visible measured/nominal/demo distinction on the relevant slides. The demo-mode label must be readable. Do not represent a presentation preview as a sensor measurement. Explain that null means unavailable, whereas numeric zero means the stored calculation returned zero. Do not claim internet access is required for the entire local pipeline, that MongoDB is hosted on ESP32, that a broker is a database, that WebSocket is MQTT, or that the current 1-node deployment is fault tolerant. Do not claim all historical records are physical measurements: the retained history also contains simulator/test scenarios.

Create placeholders for a real dashboard screenshot, wiring photo and MongoDB document view. Do not invent these images. No passwords, secrets files, raw Wi-Fi credentials or private repository tokens may appear.

Reference sources in speaker notes: project files `firmware/voltguard_esp32/voltguard_esp32.ino`, `shared/telemetry.js`, `backend/src/server.js`, `backend/src/mongo.js`, `backend/src/nominalEnergy.js`, `frontend/src/hooks/useTelemetry.js`, `frontend/src/demoValues.js`, and `docs/MONGODB.md`. Technical references: [MQTT standard](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html), [ESP32 ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html), [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/).

Output a finished 17-slide deck with speaker notes, a slide-by-slide timing table and three optional backup slides for the telemetry document schema, calibration diagnostics and REST endpoints. Backup slides do not count toward the 15-minute presentation.
