# VoltGuard faculty presentation and viva guide

Prepared for Jaswant, Abhi, Gopi, Syam and Saif on October 7, 2026. This guide provides a 15-minute speaking plan, ready-to-rehearse scripts, a demonstration checklist and answers to likely faculty questions. The PPT generator prompt is in `PPT_GENERATION_PROMPT.md`.

VoltGuard's completed scope is an ESP32-to-MQTT-to-backend-to-MongoDB-to-dashboard monitoring pipeline. Voltage and temperature come from physical sensors; current is a nominal calibration-based estimate; power and stored discharge energy are derived from it. Physical SoC, health and internal resistance remain unknown in the database. The dashboard's changing SoC and health values are presentation previews labeled Demo mode. This distinction is part of the explanation, not something to hide.

## One minute revision sheet

**Project:** VoltGuard IoT Battery Monitoring System.

**Say the architecture:** Sensors -> ESP32 -> Wi-Fi -> MQTT broker -> Node.js and Express -> MongoDB -> REST and WebSocket -> React dashboard.

**Database:** Local MongoDB, database `voltguard`, collections `telemetry`, `alerts`, `counters`. The native MongoDB Node.js driver is used, not Mongoose. Records are on the computer, not on the ESP32 or in browser storage.

**Backend:** Node.js is the runtime; Express handles HTTP; MQTT.js receives telemetry; Aedes is the embedded MQTT broker; `ws` sends browser updates.

**Frontend:** React + Vite + Chart.js/react-chartjs-2. HTTP loads history; WebSocket streams new readings.

**Hardware:** ESP32 Dev Module; voltage GPIO34 with ratio 5; ACS712 output divider into GPIO35; DS18B20 DATA GPIO4 with 4.7 kOhm pull-up. USB powers the ESP32. The prototype uses a two-cell series lithium-ion battery.

**Telemetry:** `voltguard/device/voltguard-01/telemetry`, device ID `voltguard-01`, roughly one update per second, JSON payload. Broker port 1883. ESP32 publishing is QoS 0, not guaranteed delivery.

**Calculations:** Power = V x nominal I. Energy = integration of positive power over valid receive-time intervals; stored in kWh. Missing intervals over five seconds are not filled in.

**Evidence:** Previously verified 20 passing backend tests, a successful frontend production build, real MQTT/API/WebSocket/database updates and a field-by-field migration of 10,931 telemetry records and 36 alerts. Those are historical verification results; confirm live services before the review. At preparation time, the HTTP backend was not reachable, so do not assume it is already running.

**Limit:** Monitoring and alerts do not disconnect the battery. Current accuracy is unverified, and the tiny LED load is not a suitable accuracy test. Do not describe this as a certified protection system.

## Speaking allocation and order

This is a presentation allocation. Confirm actual implementation contributions separately before answering who built what.

| Speaker | Total time | Main responsibility                                            | Slides                 |
| ------- | ---------- | -------------------------------------------------------------- | ---------------------- |
| Jaswant | 5 minutes  | Opening, architecture, MQTT, live demonstration and conclusion | 1 to 5, then 16 and 17 |
| Abhi    | 4 minutes  | Backend, database, calculations, alerts and reliability        | 9 to 12                |
| Saif    | 3 minutes  | Dashboard, testing, observed results and future work           | 13 to 15               |
| Gopi    | 2 minutes  | Hardware wiring, sensors and calibration                       | 6 and 7                |
| Syam    | 1 minute   | Firmware loop and timing                                       | 8                      |

Order: Jaswant 3 minutes -> Gopi 2 minutes -> Syam 1 minute -> Abhi 4 minutes -> Saif 3 minutes -> Jaswant 2 minutes. Rehearse to this clock; use the remaining time inside each block to point at the relevant diagram, pause and change slides. Do not read the Q&A during the presentation.

## Jaswant opening and architecture

### Slides 1 to 3

“Good morning. We are Jaswant, Abhi, Gopi, Syam and Saif. Our semester project is VoltGuard, an IoT battery monitoring system. It connects physical sensors to a web dashboard and stores a history that we can inspect later.

The problem we address is that separate measurements do not give us one synchronized view of battery voltage, temperature and operating trends. A reading on a meter tells us what is happening at one moment. Our project adds wireless telemetry, persistent history and software condition monitoring.

Our objectives were to acquire sensor data with an ESP32, send it over Wi-Fi using MQTT, validate it in a backend, store it in a database and display it in a browser. The physical prototype uses a two-cell lithium-ion pack. Our scope is monitoring: it does not automatically disconnect a load or replace a certified battery management system.”

### Slide 4

“This diagram shows the complete path. The voltage and current signals are read through the ESP32 ADC, and temperature is read digitally from a DS18B20. The ESP32 connects to Wi-Fi and publishes a JSON message to the MQTT broker on our computer.

The broker routes that message to the backend subscriber. The Node.js backend validates it, calculates nominal power and energy when current is available, evaluates alert conditions and stores the result in MongoDB. The React dashboard loads stored history through REST and receives fresh updates through WebSocket.

These components have different jobs. The ESP32 acquires data, the MQTT broker routes messages, the backend processes them, MongoDB preserves them and the frontend presents them.”

### Slide 5 and handoff

“Our device ID is voltguard-01. The telemetry topic is voltguard slash device slash voltguard-01 slash telemetry. The ESP32 publishes approximately once per second. Its current library call uses QoS zero, so we do not claim every sample is guaranteed to arrive.

If Wi-Fi or MQTT disconnects, the firmware retries with increasing delays, capped at thirty seconds. The dashboard uses the last backend receipt time to distinguish fresh data from stale data. MQTT is used between the ESP32 and backend; WebSocket is used between the backend and browser.

Gopi will now explain the actual hardware connections and how the sensors are read.”

**Point at:** The arrows in the architecture, the exact telemetry topic and the physical prototype. Never display `.env` or `secrets.h` during the talk.

## Gopi hardware and calibration

### Slide 6

“The prototype uses a USB-powered ESP32 Dev Module and a two-cell lithium-ion battery. The voltage sensor signal goes to GPIO34. Its resistor divider is thirty kilo-ohms and seven point five kilo-ohms, giving a ratio of five. The firmware averages the ADC millivolt readings and multiplies by five to estimate pack voltage.

The ACS712 five-amp sensor output goes through a second divider: ten kilo-ohms from OUT to GPIO35, and ten kilo-ohms from that junction to ground. The sensor supply and the load path are separate connections. VCC powers the sensor, while the battery-to-load current passes through its IP terminals. We use a common ground.

The DS18B20 data wire goes to GPIO4, with a four point seven kilo-ohm pull-up to 3.3 volts.”

### Slide 7 and handoff

“The current sensor needs a zero-current baseline. For calibration, the battery/load path through the sensor is disconnected, but the sensor remains powered. We collect 256 averages, each from 32 raw readings, rather than guessing a permanent zero.

The software checks the averaged baseline for stability. Acceptance does not prove measurement accuracy. Small current readings still contain noise, and our LED with a ten kilo-ohm resistor is too small to demonstrate reliable ACS712 current measurement.

The temperature code reports a missing sensor as unavailable instead of inventing a value. Syam will explain how the firmware schedules these tasks.”

**Point at:** GPIO labels and the two separate ACS712 paths. Do not disconnect or recalibrate hardware while speaking.

## Syam firmware workflow

### Slide 8 and handoff

“The firmware is written in Arduino C++. It uses WiFi and PubSubClient for connectivity, and OneWire and DallasTemperature for the temperature sensor.

The loop services the network and serial commands, samples the analog inputs, checks temperature conversion and publishes when the one-second interval is due. Temperature conversion is asynchronous, so the firmware keeps servicing MQTT while the sensor works.

Credentials are generated into an ignored local secrets file. When UTC is not synchronized, the ESP32 omits a timestamp and the backend supplies it. Abhi will now explain what happens after the message reaches the server.”

**Remember three words:** connect, acquire, publish. If asked for firmware detail you do not remember, show the code and let Jaswant or Abhi help.

## Abhi backend database and calculations

### Slide 9

“Our backend runs on Node.js. Express exposes the HTTP API. Aedes provides the MQTT broker, and MQTT.js subscribes to the device telemetry topic. The browser updates use the ws library.

Every packet passes shared validation before storage. We check device identity, numeric types, permitted ranges, timestamps and measurement quality. Null is allowed for unavailable measurements and is different from zero. Duplicate or older timestamps are ignored. Ingestion is ordered so that new records and energy calculations do not race each other.

After processing, the backend stores the record and alert changes, then broadcasts the stored telemetry to connected browsers.”

### Slide 10

“We use MongoDB locally on the computer. The database is named voltguard. The telemetry collection contains readings, alerts contains condition events, and counters assigns the numeric IDs used by our API and dashboard.

A telemetry document contains the device ID, timestamp, receive time, voltage, current, temperature, power, energy, battery profile, status, source and quality information. Physical state of charge, health and resistance remain null because we have not validated an algorithm for them.

The native MongoDB driver is used. Indexes support device history and latest-record queries. A single-node replica set enables transactions so telemetry and related alert updates commit together. We also migrated and verified the older SQLite records, while keeping the original file and backup. New readings now go to MongoDB.”

### Slide 11

“Power is calculated as voltage multiplied by nominal current. That means its uncertainty includes the current sensor's uncertainty. It is not independently measured power.

Energy is the cumulative discharge estimate. For each valid interval, we average the positive previous and current power, multiply by the actual interval and convert to kilowatt-hours. We exclude missing intervals, intervals over five seconds and charging contributions. The accumulated value is stored, so it continues after backend restart.

The dashboard's charge and health previews are separate presentation values. They are not written as measured SoC or SoH. A real charge estimate would need battery characterization and reliable current measurement; a health estimate would need a validated capacity or resistance assessment.”

### Slide 12 and handoff

“The alert engine compares available readings against configured limits. When a condition starts, it creates an alert. Repeated readings do not create a new alert every second. When valid readings recover, the same event is marked resolved.

For the two-cell profile, default voltage limits are six and eight point four volts, and the default high-temperature threshold is fifty degrees Celsius. These are configurable software limits, not a certified protection design. Freshness, reconnection and unavailable measurements are handled separately. Saif will show how this information appears in the interface and explain our tests.”

**Point at:** One stored document, `quality`, `source`, `soc: null`, collections and the power/energy equations.

## Saif dashboard verification and future work

### Slide 13

“The dashboard is built with React and Vite. Chart.js displays the signal history. Metric cards show the latest values, while the device inspector shows the data source, receipt time and connection state.

The browser first loads stored history through HTTP. It then receives new telemetry through WebSocket. This avoids a full page reload for each reading. The interface distinguishes transport connectivity from freshness: a connected socket alone does not mean the device is still publishing.

The event log has active conditions and recent history tabs. An empty active tab means there are no active alerts, not that the database is empty. CSV exports contain stored telemetry, not the frontend-only charge and health previews.”

### Slide 14

“We verified the software pipeline with twenty backend tests and a successful frontend production build. The tests cover validation, nullable measurements, alerts, MQTT integration, API and WebSocket delivery, MongoDB storage and restart persistence.

During live verification, actual ESP32 telemetry reached the API, database and browser. We also verified the SQLite-to-MongoDB migration field by field: ten thousand nine hundred thirty-one telemetry records and thirty-six alerts were imported at the cutover. The database continues to grow as new readings arrive.

These results establish software behavior and communication. They do not establish sensor accuracy, battery health prediction or safety certification.”

### Slide 15 and handoff

“The main limitation is low-current measurement. We need to verify the sensor supply, output divider and readings against a reference instrument. A better sensor for small currents is a future improvement.

Other future work includes characterized battery capacity, validated state-of-charge and health methods, secure remote deployment, TLS and dashboard authentication. Automatic hardware protection would be a separate design and validation task.

Our completed result is an integrated monitoring pipeline with persistence and transparent data quality. Jaswant will now demonstrate it and conclude.”

**Point at:** A real screenshot or live UI, the Demo mode label and the test summary. Do not describe build success as hardware accuracy.

## Jaswant demonstration and conclusion

### Slide 16

“Here is the running dashboard. First, we check the last received time and signal age rather than looking only at the connected label. Voltage and temperature come from the sensors. Current is marked nominal and noise-limited, and the backend derives power and discharge energy from it.

This health endpoint identifies MongoDB as the active storage driver. The latest endpoint shows the stored document used by the dashboard. Here in MongoDB, the same numeric ID, timestamps and values are present. SoC and health are null in storage; the dashboard presentation preview is clearly separate.

The history endpoint retrieves earlier readings, and the recent event tab shows saved conditions. This demonstrates the complete path from the device to persistent storage and the browser.”

**Perform:** Follow the five-step demo below. If the device is offline, explicitly say these are stored records; do not describe them as live. Keep the demonstration under 75 seconds.

### Slide 17

“VoltGuard brings embedded acquisition, MQTT communication, backend validation, MongoDB storage and a React dashboard into one working monitoring prototype. We can preserve readings, inspect trends and record configured conditions.

We also learned that reliable communication and reliable measurement are different problems. Our pipeline is verified, while precise low-current measurement and real charge and health estimation remain future work.

Thank you. We are ready for your questions.”

## Live demo in five steps

1. Open `http://localhost:5173`. Show freshness, voltage and temperature. Explain the nominal current label and demo charge/health badge.
2. Open `http://localhost:3001/api/health`. Show `databaseDriver: mongodb`, `mqttConnected`, accepted/rejected counters and database state.
3. Open `http://localhost:3001/api/latest?deviceId=voltguard-01`. Point out `id`, timestamps, `power`, `energy`, `quality`, and null `soc`/`soh`.
4. In MongoDB Compass, if installed, connect to `mongodb://127.0.0.1:27018/?replicaSet=voltguard`, open `voltguard` -> `telemetry`, filter `{ "deviceId": "voltguard-01" }`, sort `{ "id": -1 }`. Compare the latest document with the API. If Compass is unavailable, run `node scripts/show-review-data.js`.
5. Show Event log -> Recent history and optionally the CSV export. Explain that retained history includes earlier simulator/test events; the `source` field identifies telemetry origin.

## How to answer faculty questions

Use three parts: a direct answer, one implementation detail and the location you can show. Answer briefly first. Let the faculty ask for more detail. Do not guess a number or claim a capability the code does not provide. If a question is outside the implemented scope, say: “That is not implemented or validated yet. Our current implementation does X; the next step would be Y.”

Jaswant takes general architecture and coordinates answers. Abhi takes database/backend/calculations; Gopi takes hardware and calibration; Syam takes firmware timing; Saif takes dashboard/testing. Anyone may answer a basic question, but hand off deeper questions naturally.

## Database and backend questions

### 1 What database did you use

**Abhi:** “MongoDB Community, running locally. The database is voltguard.” Show `/api/health`, `backend/src/mongo.js` and a stored document.

### 2 Where are the values stored

**Abhi:** “Telemetry is stored in the telemetry collection on the computer's MongoDB instance. The data directory is backend/data/mongodb. Alerts are in a separate alerts collection.” Database files are server-managed; use a query or Compass instead of opening storage files as text.

### 3 Is this cloud storage or MongoDB Atlas

**Abhi:** “No. It is a local MongoDB deployment. Cloud hosting is future work.”

### 4 What is your backend

**Abhi:** “A Node.js application using Express for REST endpoints, MQTT.js for incoming telemetry, Aedes for the broker, ws for browser updates and the native MongoDB driver for persistence.” Node.js is a runtime; Express is a framework.

### 5 Did you use Mongoose

**Abhi:** “No. We use the native MongoDB Node.js driver directly. Validation is in shared/telemetry.js.”

### 6 Why did you choose MongoDB

**Abhi:** “Telemetry naturally forms documents containing readings, source and quality metadata. MongoDB supports those fields, indexed history queries and transactions. SQLite was also adequate for a small local prototype; the migration is a storage choice, not proof MongoDB is always better.”

### 7 What collections do you have

**Abhi:** “telemetry for readings, alerts for condition history, and counters for numeric record IDs.”

### 8 What fields are in a reading

**Abhi:** “Device ID, numeric ID, timestamp, receivedAt, profile, voltage, current, temperature, power, energy, SoC, SoH, resistance, source, status and quality.” Unknown physical estimates are null. MongoDB also has an internal `_id`, which is omitted from API responses.

### 9 Why do you have both id and MongoDB _id

**Abhi:** “MongoDB has its own document identity. We retain a numeric id for compatibility with migrated records, API ordering and frontend merging. The counters collection allocates new IDs.”

### 10 Why use a replica set

**Abhi:** “Our single-node replica set enables multi-document transactions, allowing a reading and its alert changes to commit together. One node does not provide redundant availability.” [MongoDB transaction reference](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/).

### 11 What happens if saving fails

**Abhi:** “The transaction rolls back. We do not broadcast an uncommitted reading as successfully stored data. Database errors are logged and the backend can report degraded database status. We do not have an offline device buffer.”

### 12 Why not store everything in the frontend

**Abhi:** “Browser state is for display and can disappear on refresh. MongoDB preserves the history independently of an open tab and gives all clients the same stored records.”

### 13 What happened to SQLite

**Abhi:** “We migrated and verified 10,931 telemetry records and 36 alerts at cutover. The SQLite source and pre-MongoDB backup remain preserved; new readings go to MongoDB.” Show `docs/MONGODB.md` and the migration script. Do not describe the cutover count as today's exact count.

### 14 Can you show an actual stored record

**Abhi:** Use Compass or `node scripts/show-review-data.js`. Compare an actual document with `/api/latest`, rather than showing a made-up example. Point out the `quality` field.

### 15 How is history retrieved

**Abhi:** “GET /api/history filters by device and optional time range, returns a limited number of recent readings in chronological order, and uses device indexes.” The default limit is 100 and accepted limits are 1 to 1,000.

### 16 Will data survive a backend restart

**Abhi:** “Yes. Readings and accumulated discharge energy are persisted in MongoDB. Our integration test verifies restart recovery. Calibration is a different matter: the ESP32's RAM baseline resets on ESP32 reboot.”

## MQTT and network questions

### 17 What is MQTT

**Jaswant:** “A publish-subscribe messaging protocol. A publisher sends to a topic; the broker routes it to subscribers.” [MQTT standard](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html).

### 18 How is MQTT working with your ESP32

**Jaswant:** “The ESP32 joins Wi-Fi, opens an MQTT connection to the computer's broker on port 1883, and publishes JSON on our telemetry topic. The Node.js subscriber receives that topic and processes the packet.” Show `serviceNetwork` and `publishFresh` in the sketch.

### 19 Where is the MQTT broker

**Jaswant:** “Aedes is embedded in the backend process on the computer. The ESP32 connects to the computer's reachable LAN IPv4.” The API on localhost:3001 is not the MQTT broker address.

### 20 Why MQTT instead of HTTP for the ESP32

**Jaswant:** “MQTT separates producers from consumers using topics and suits repeated small telemetry messages. HTTP would also work, but would use request-response messages. The project deliberately uses MQTT for acquisition and HTTP for history.” Avoid claiming a measured bandwidth or latency advantage without benchmarks.

### 21 What is the topic and device ID

**Jaswant:** Topic `voltguard/device/voltguard-01/telemetry`; device ID `voltguard-01`. The backend requires topic identity and payload identity to agree.

### 22 What does QoS mean and what do you use

**Jaswant:** “QoS defines delivery behavior. The current ESP32 publisher uses QoS zero, meaning at most once. The backend subscribes at QoS one, but that does not upgrade a QoS-zero publication.” We do not claim guaranteed delivery. Do not confuse `retain=false` with QoS. [MQTT standard](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html).

### 23 Does the ESP32 retain readings while offline

**Jaswant:** “No persistent offline queue is implemented. It reconnects and publishes fresh readings. Missing history remains missing.”

### 24 What happens when Wi-Fi disconnects

**Syam:** “The firmware retries Wi-Fi, then MQTT, using capped backoff. Meanwhile the dashboard becomes stale once readings stop arriving. It does not replace missing readings with zero.”

### 25 Is internet required

**Jaswant:** “The local data path only needs network reachability between ESP32 and computer. Internet access is not needed for local MQTT, MongoDB or the browser dashboard. Campus isolation, captive portals or unsupported Wi-Fi bands can still prevent connectivity.”

### 26 Can an ESP32 use every campus Wi-Fi network

**Jaswant:** “No. This ESP32 uses 2.4 GHz Wi-Fi, and the network must permit the authentication mode and communication to our computer. A 5 GHz-only network or client isolation can block it.” Verify the actual network before review; do not promise all college SSIDs work. [ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html).

### 27 Why is MQTT_HOST sometimes 0.0.0.0

**Abhi:** “That is a server bind address for listening on interfaces, not a client destination. The ESP32 needs the computer's actual reachable IP. Similarly, 127.0.0.1 inside the ESP32 would mean the ESP32 itself.”

### 28 Are MQTT and WebSocket the same thing

**Jaswant:** “No. MQTT carries device telemetry to the backend. WebSocket carries backend updates to the browser. The current ESP32 uses MQTT over TCP, not MQTT over WebSocket.”

### 29 How do you know a reading is fresh

**Saif:** “We use backend receive time and a five-second default freshness limit, as well as the browser socket connection. An open socket alone is insufficient.”

### 30 Where do timestamps come from

**Syam:** “The ESP32 omits a timestamp unless UTC is synchronized. The backend assigns UTC and records receivedAt. The browser formats it for local display. Server clock quality matters.”

## Hardware and measurement questions

### 31 Why ESP32

**Gopi:** “It combines Wi-Fi, analog inputs and enough processing for these sensors and roughly one-second telemetry in one development board.” Do not claim comparative performance testing against every board.

### 32 Which pins are used

**Gopi:** Voltage GPIO34, current GPIO35, DS18B20 DATA GPIO4. These are the confirmed physical wiring, not pin labels copied from a different Wokwi prototype.

### 33 How is battery voltage calculated

**Gopi:** “We average GPIO34 millivolt readings and apply the voltage divider ratio of five: Vpack = mean_mV x 5 / 1000.” The ratio is `(30 + 7.5) / 7.5 = 5`. Averaging reduces random variation but does not remove systematic ADC error. [ESP32 ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).

### 34 How is current calculated

**Gopi:** “Nominal current is the averaged GPIO35 voltage minus the disconnected-path baseline, divided by 92.5 millivolts per amp. The sensitivity includes the output divider.” Calibration stability is not an accuracy certificate.

### 35 Why do you disconnect the load during calibration

**Gopi:** “A baseline must represent zero current. With a load connected, calibration would treat that load current as zero and bias later readings. VCC, GND and OUT stay connected; only the current path through IP terminals is opened.”

### 36 How many calibration samples are taken

**Gopi:** “The averaged mode takes 256 non-overlapping means of 32 raw ADC conversions, or 8,192 raw conversions. The last run completed in about 42.8 seconds.” Latest documented baseline 353.299 mV and averaged span 9.188 mV; these are run-specific evidence, not permanent constants.

### 37 Why did the earlier calibration reject

**Gopi:** “Single-conversion samples had a span above the 30 mV rejection threshold even though their averages were stable. Diagnostic captures examined raw samples and channel-switch behavior. An explicit averaged mode was tested rather than simply raising the rejection threshold.” See `docs/CURRENT_ADC_DIAGNOSIS.md`.

### 38 Is calibration now accurate

**Gopi:** “We established a software-accepted baseline. Absolute current accuracy is not verified. The baseline stayed close to a reading observed when the sensor was reportedly unpowered, so supply and wiring need a reference-meter check.” This is the correct answer even if the UI displays a number.

### 39 Why does current show zero or negative values

**Gopi:** “Small values can round to zero. Noise can produce positive or negative nominal estimates around the baseline. A negative value alone does not prove charging.”

### 40 Why can you not accurately measure the LED current

**Gopi:** “The ten kilo-ohm series resistor makes the load current very small. Our ACS712 and ADC noise are too large for a reliable measurement at that scale.” Do not attach an arbitrary high-current load just to make a graph move.

### 41 Why two dividers and common ground

**Gopi:** “The voltage sensor divider scales the pack signal. The ACS712 output divider scales its output before the ESP32 ADC. Common ground provides a shared signal reference.” Do not connect the approximately 8.15 V pack directly to an ESP32 GPIO or sensor supply.

### 42 Why use DS18B20 and a pull-up

**Gopi:** “It provides a digital temperature reading through OneWire. The DATA line needs the installed pull-up to 3.3 V for communication.” On failure, the stored temperature becomes null with a failure reason.

### 43 What happens if temperature is disconnected

**Syam:** “The firmware reports null and the quality reason, then searches for the sensor again. It does not keep presenting an old temperature as a fresh reading.”

### 44 Does USB power the battery

**Gopi:** “USB powers the ESP32 development board. This prototype does not implement a battery charging circuit or cell balancing.”

## Power energy charge and health questions

### 45 How do you calculate power

**Abhi:** “P = V x I in watts, using stored voltage and nominal current. Current uncertainty propagates into power.” Example arithmetic only: 8.145 V x 0.002 A = 0.01629 W = 16.29 mW. Do not reuse that number as a constant or a validated measurement; the earlier calculation relied on an invalid unpowered-sensor calibration.

### 46 How do you calculate energy

**Abhi:** “For valid adjacent readings, we integrate the average positive endpoint power over the receive-time interval: delta E_kWh = (max(Pprevious,0) + max(Pcurrent,0))/2 x delta t_ms / 3,600,000,000.” This is discharge-only, not net energy. It includes positive noise and is labeled nominal/partial.

### 47 Why exclude intervals over five seconds

**Abhi:** “We do not know the power during a long missing interval. Excluding it avoids filling an unknown period with assumed consumption. The resulting total is partial, not a complete energy meter.”

### 48 Is SoC obtained directly from voltage

**Abhi:** “No. SoC is not calculated for this physical pack. A validated method would need battery characterization and account for load, temperature and other conditions. Stored SoC remains null.”

### 49 What is health index or SoH in this project

**Abhi:** “The physical health value is unknown. The dashboard health indicator is a presentation preview. We have not measured usable capacity against a rated/reference capacity or validated another health method.”

### 50 Why does the dashboard show charge and health numbers if storage is null

**Saif:** “They are labeled frontend demo previews defined in frontend/src/demoValues.js. They are not sensor telemetry, not used to establish battery condition and not included in stored-record CSV exports.” Show the actual source rather than implying a hidden estimation model.

### 51 Is this machine learning or AI

**Abhi:** “No. Current implementation uses validation rules, threshold alerts and arithmetic estimates. No trained battery prediction model is implemented.”

### 52 What would you need to make SoC and SoH real

**Abhi:** “A characterized pack, reliable calibrated measurements and a validated estimation or capacity-test method. The method would need comparison against reference measurements, not just a moving dashboard percentage.”

## Dashboard testing security and scope questions

### 53 What is your frontend

**Saif:** “React, served during development by Vite, with Chart.js for charts. Radix UI provides interface controls and Lucide provides icons.”

### 54 What happens after refreshing the browser

**Saif:** “It reloads stored history through REST and reconnects WebSocket. Backend-stored energy and history remain. The presentation previews are not authoritative stored values.”

### 55 Why is Event log empty

**Saif:** “The default tab shows active conditions. If none are active, it is empty. Recent history shows earlier saved alerts. The log stores condition events rather than one event for every sensor sample.”

### 56 What alerts are implemented

**Abhi:** “Overvoltage, undervoltage, overcurrent and high temperature, plus charge/health alerts for profiles that actually supply those estimates. Null SoC and SoH in physical telemetry cannot trigger those estimate alerts.” The default 10 A current threshold is not a suitable certified trip limit for an ACS712 5 A prototype and should be reviewed for deployment.

### 57 Does the system stop an unsafe battery

**Jaswant:** “No. It records and displays software conditions. There is no verified relay shutdown, fuse design, charger control, cell balancing or certified protection functionality.”

### 58 What did you test

**Saif:** “Previously, twenty backend tests and the production build passed. We tested data validation, failures, MQTT/API/WebSocket flow, MongoDB persistence, alerts and restart recovery. Physical telemetry was separately observed end to end.” Run tests again if presenting them as today's results.

### 59 What accuracy did you achieve

**Gopi:** “We do not have a reference-instrument accuracy study, so we do not claim a percentage accuracy. Voltage is averaged and unverified; current is nominal and noise-limited.”

### 60 What is your latency

**Saif:** “The firmware targets approximately one publication per second. We have not benchmarked an end-to-end latency distribution.” Publishing interval is not the same as measured latency.

### 61 Can it support many devices

**Abhi:** “Topics and stored records include device IDs, and endpoints accept a device filter. However, throughput, multi-device UI behavior and deployment capacity have not been load-tested.” Numeric ingestion is currently serialized; do not promise industrial scale.

### 62 Is the system secure

**Abhi:** “MQTT credentials are configured locally; secrets are ignored by Git. The local MongoDB server is bound to localhost, browser origins are restricted, and simulator writes are disabled in hardware mode. We have not implemented production TLS or dashboard user authentication.” Never demonstrate by revealing the passwords.

### 63 How are bad or duplicate packets handled

**Abhi:** “Shared validation rejects invalid types, ranges, timestamps and inconsistent measurement quality. Topic identity is checked. Older or duplicate device timestamps are ignored and counted rather than stored again.”

### 64 Why store null instead of zero

**Saif:** “Zero is a numeric result; null means unavailable or unknown. Replacing missing values with zero would create misleading graphs, alerts and calculations.”

### 65 What can the CSV prove

**Saif:** “It exports stored records, including source, timestamps and values. It does not include frontend-only SoC and health previews. CSV alone is not a sensor accuracy certificate.”

### 66 What is the project's novelty

**Jaswant:** “Our semester contribution is the integrated implementation and verification of acquisition, communication, validation, storage and visualization, including explicit unavailable values and retained event history. We do not claim a novel patented sensing technique.”

### 67 What did each team member implement

**Jaswant:** Give the team's real contribution history. The speaking allocation above is not proof of authorship. Before rehearsal, each member should write their actual tasks and show the relevant files or commits. Do not invent individual ownership or claim external tools were unused if they were used.

### 68 What is the cost and what technologies are paid

**Jaswant:** “This demonstration uses local software and no cloud subscription. Hardware cost must come from our actual purchases.” Do not invent a bill of materials price. Local electricity, hardware and maintenance still have costs.

### 69 Why is the device offline right now

**Jaswant:** “We are checking power, Wi-Fi association, broker address, MQTT connectivity and backend status in that order. Stored records remain available independently of a live device.” If presenting stored screenshots, say so.

### 70 What would you improve first

**Jaswant:** “Verify sensor supply and wiring against a meter, then improve low-current sensing and characterize the battery. After that, validate charge/health estimation and secure a remote deployment.”

## Files to show when challenged

| Faculty asks                        | Show this location                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| ESP32 publishes where               | `firmware/voltguard_esp32/voltguard_esp32.ino`, `publishFresh` and `serviceNetwork` |
| Sensor pins and ratios              | Same sketch, constants near the top                                                 |
| Calibration and acceptance          | Same sketch, serial commands and `printCalibration`; `current_calibration.h`        |
| Telemetry validation                | `shared/telemetry.js`                                                               |
| Backend route and ingestion         | `backend/src/server.js`                                                             |
| Database connection and collections | `backend/src/mongo.js`                                                              |
| Storage driver selection            | `backend/src/db.js`                                                                 |
| Power and energy logic              | `backend/src/nominalEnergy.js`                                                      |
| SQLite migration evidence           | `scripts/migrate-sqlite-to-mongo.js` and `docs/MONGODB.md`                          |
| Browser live updates                | `frontend/src/hooks/useTelemetry.js`                                                |
| Charts and UI                       | `frontend/src/App.jsx`, `frontend/src/components/SignalChart.jsx`                   |
| Demo charge and health              | `frontend/src/demoValues.js`                                                        |
| MongoDB integration tests           | `backend/test/mongo.test.js`                                                        |
| Historical ADC investigation        | `docs/CURRENT_ADC_DIAGNOSIS.md`                                                     |

## Preflight before the faculty review

1. Keep a copy of the slides, this guide and actual evidence screenshots locally. Add the real college/course/faculty names. Use real team contributions, not the speaker distribution as an authorship list.
2. Check USB power and wiring. Do not use a disconnected or unpowered ACS712 calibration. If the ESP32 rebooted, its calibration is lost; recalibrate only with the current path disconnected and the sensor powered, then reconnect the load after completion.
3. Check the computer's reachable LAN IPv4 and the ESP32's network. If the address or credentials changed, update the ignored local configuration and firmware secrets, then compile/upload. Never show secrets on a projector. Do not assume a previously working campus network still permits device-to-computer connections.
4. From the repository root, run `powershell -File scripts/start-mongodb.ps1`. Confirm it starts the configured local instance or reports that its replica set is already initialized.
5. Run `npm run dev:hardware`, not the simulator-inclusive `npm run dev`, for a physical demonstration. Set `SIMULATION_ENABLED=false` in local configuration. Do not start a second backend if one is already serving ports 3001/1883.
6. Open `/api/health`, `/api/latest` and the dashboard. Ensure timestamps actually advance. Observe `databaseDriver: mongodb`, freshness and rejected counters. Connected transport is not sensor accuracy.
7. Open Compass if installed, or run `node scripts/show-review-data.js`. Rehearse retrieving the latest real document; keep source and quality visible.
8. For fresh test evidence, use the commands below. Save the actual output if you intend to show today's results.
9. Rehearse once with a timer. Make Jaswant and Abhi explain the pipeline without reading. Make each member answer at least five questions in their assigned domain.
10. If live connectivity fails, explain the failure and show actual stored history or previously captured evidence. Do not quietly substitute preview values and call them sensor measurements.

```powershell
powershell -File scripts/start-mongodb.ps1
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=voltguard'
npm test
npm run build
```

Tests use isolated ports and uniquely named test databases. The MongoDB integration test does not drop the `voltguard` database. No compilation, upload or test suite alone proves physical sensor accuracy.

## If the demo fails

**No HTTP backend:** Start MongoDB, then the hardware backend/frontend. Inspect service logs rather than changing wiring blindly.

**Backend connected but no fresh device readings:** Check serial output, Wi-Fi, MQTT destination and campus network isolation. The broker host is the computer's reachable LAN IP, not 0.0.0.0 or the ESP32's localhost.

**Uncalibrated current:** The ESP32 restarted or calibration has not completed. Use the proper disconnected-path procedure; keep current unknown until then.

**Unexpected current or baseline:** Verify VCC, ground, OUT divider and reference measurements. Do not force a baseline or claim a noisy value is accurate.

**No active alerts:** Show Recent history; do not create an unsafe battery condition just to demonstrate an alert.

**Questions you cannot answer:** “I do not want to guess. I can show the implemented part in the code; that additional behavior has not been validated.” Ask the relevant teammate to add detail.

## Short backup explanation for a five minute review

Jaswant 100 seconds: problem, architecture and topic. Abhi 80 seconds: backend, MongoDB, nominal calculations and one stored record. Saif 60 seconds: UI, tests and limitations. Gopi 40 seconds: sensor wiring and calibration. Syam 20 seconds: loop and timing. Keep the same relative distribution and omit the long live demo. Do not omit the measured/nominal/demo distinction.

## Technical references and evidence

The project-specific statements above come from the actual files listed in this guide and the implementation history verified on October 7, 2026. Previous successful tests and live evidence are not a guarantee of current connectivity after a restart or network change.

- [MQTT version 3.1.1 standard](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) for publish-subscribe and delivery definitions.
- [Espressif Arduino ESP32 ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html) for ADC millivolt APIs.
- [ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html) for the board family's hardware capabilities.
- [MongoDB Node.js driver transactions](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/) for database transaction behavior.
- Repository evidence: `docs/MONGODB.md`, `docs/ESP32_INTEGRATION.md`, `docs/CURRENT_ADC_DIAGNOSIS.md`, backend tests and the implementation files.
