# VoltGuard

VoltGuard is a locally runnable IoT monitoring demonstrator. It preserves the existing 6V/12V lead-acid battery features and adds an **AC230 electrical software demonstration**. Default data is simulated. Software alerts do not physically disconnect a load.

Physical ESP32 support includes the `LI_ION_2S` profile. See [ESP32 firmware and verified integration](docs/ESP32_INTEGRATION.md). Missing sensors and uncalibrated current remain `null`; stored SoC, SoH and resistance remain unknown. Backend power and cumulative discharge energy are explicitly nominal, noise-limited estimates. Dashboard charge/health previews are separate from stored telemetry. [MongoDB setup and migration](docs/MONGODB.md) describes the active database and preserved SQLite backup.

Sensors → ESP32 → MQTT → Express validation → MongoDB + alert engine → WebSocket/REST → React/Chart.js dashboard.

## Requirements and installation

Node.js 20.19+ (verified with Node 24.11.1), npm, and Google Chrome for browser tests. Run from the repository root:

```powershell
npm install
npm run dev
```

Start local MongoDB first (`powershell -File scripts/start-mongodb.ps1` on the configured Windows computer), then open http://localhost:5173. The application starts backend, embedded loopback MQTT broker, simulator and frontend. MongoDB stores data locally; see [setup](docs/MONGODB.md). Stop the application with Ctrl+C. If MQTT port 1883 is occupied, inspect the existing service or choose a free port with matching `MQTT_PORT` and `MQTT_URL`.

To run components separately:

```powershell
npm run dev -w backend
npm run dev -w frontend
npm run simulate
```

To run without simulated readings: `npm run dev:hardware`. Set `SIMULATION_ENABLED=false` for hardware use; this disables simulator endpoints and controls. Do not run two simulators for the same device simultaneously.

## Configuration

Copy `.env.example` to `.env`. Backend/simulator read it at startup; restart after changes. Vite reads the root environment when started. Never commit credentials.

| Variables                                       | Meaning                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PORT, HOST                                      | API port and bind address; defaults 3001 and loopback                                                                             |
| MQTT_URL, MQTT_PORT, MQTT_HOST, EMBEDDED_BROKER | Client broker URL and embedded listener; use `false` for external broker                                                          |
| MQTT_USERNAME, MQTT_PASSWORD                    | Optional backend/simulator credentials; also enable embedded broker authentication                                                |
| API_URL, VITE_API_URL                           | Simulator and browser API origins respectively                                                                                    |
| CORS_ORIGINS                                    | Comma-separated allowed browser origins; also checked for WebSocket and simulation writes                                         |
| DEVICE_ID                                       | Default REST/dashboard device and simulator identity                                                                              |
| BATTERY_PROFILE                                 | `6V`, `12V` (default), `AC230`, or hardware-only `LI_ION_2S`                                                                      |
| SIM_MODE, SIMULATION_ENABLED                    | Initial scenario; simulator API enable switch                                                                                     |
| SIMULATOR_TOKEN                                 | Optional bearer token required for simulator APIs; CLI sends it. Browser controls do not embed this secret                        |
| DB_PATH                                         | Root-relative or absolute SQLite path; `:memory:` used by isolated tests                                                          |
| DEVICE_OFFLINE_MS                               | Server receive-time age before device is offline; default 5000                                                                    |
| VOLTAGE_HIGH, VOLTAGE_LOW                       | AC230 thresholds, default 250/210 V                                                                                               |
| VOLTAGE_HIGH_6V, VOLTAGE_LOW_6V                 | Battery thresholds, default 7.5/5.5 V                                                                                             |
| VOLTAGE_HIGH_12V, VOLTAGE_LOW_12V               | Battery thresholds, default 15/11 V                                                                                               |
| CURRENT_HIGH, TEMPERATURE_HIGH                  | Default 10 A and 50 �C                                                                                                            |
| SOC_LOW, SOH_LOW                                | Battery demonstration alerts, default 20% and 60%                                                                                 |
| R_FRESH__, R_EOL__                              | Illustrative calibration settings; simulator falls back to `shared/battery.js` defaults. Physical estimation requires calibration |

Embedded broker and backend bind to loopback by default. Keep this configuration for local demonstrations. Simulator writes require loopback access unless a bearer token is configured, and reject unapproved browser origins. Credentials stay in the backend/simulator. No dashboard accounts or TLS are implemented; remote deployment needs a secured broker, authentication and HTTPS.

## Simulation and fault scenarios

The default simulator follows dashboard controls. A CLI scenario remains fixed:

```powershell
npm run simulate -- --scenario normal --profile AC230 --rate 1 --duration 60 --device voltguard-01
npm run simulate -- --scenario overvoltage --profile AC230 --duration 20
npm run simulate -- --scenario undervoltage --profile AC230 --duration 20
npm run simulate -- --scenario overcurrent --duration 20
npm run simulate -- --scenario overtemperature --duration 20
npm run simulate -- --scenario device-offline --duration 20
```

Also supported: `unstable`, and retained battery scenarios `LOW_BATTERY`, `HIGH_TEMPERATURE`, `DEGRADED_BATTERY`, `CHARGING`. Offline intentionally stops publishing; it does not manufacture a zero reading. Normal AC230 readings are approximately 227�233 V. A `--transport http` development fallback uses the same backend validation, alert, storage and broadcast pipeline through a protected simulator endpoint when MQTT is unavailable. It never becomes an automatic fallback.

Power is **absolute V � I with PF assumed 1**. Energy in kWh integrates absolute power and actual elapsed time. This is illustrative apparent-power-equivalent energy for AC, not measured real energy at unknown PF. Simulator energy resets on simulator restart. Battery SoC/SoH and resistance are illustrative inputs, not experimentally validated sensor outputs.

## Telemetry contract

Canonical validation is shared in `shared/telemetry.js`. Existing topic `voltguard/device/{deviceId}/telemetry` is retained; `voltguard/{deviceId}/telemetry` is also accepted. Topic identity must match the payload. Publish once per second, QoS 1 recommended:

```json
{
  "deviceId": "voltguard-01",
  "batteryProfile": "AC230",
  "voltage": 229.8,
  "current": 1.35,
  "power": 310.23,
  "energy": 0.421,
  "temperature": 35.2
}
```

Timestamp is optional: omitted values use server UTC. Supplied ISO dates must be valid and no more than one minute ahead. Duplicate/out-of-order timestamps for a device are ignored. Backend receive time determines freshness. Power may be omitted and is computed; energy defaults to zero, so supply accumulated energy for meaningful history. Numeric strings, missing voltage/current/temperature, nonfinite numbers and out-of-range values are rejected. Arbitrary fields are discarded and status is derived by the server. Battery profiles additionally require finite `soc`, `soh`, `internalResistance` values. Device IDs use 1�64 letters, digits, hyphens or underscores.

## REST and WebSocket

| Route                         | Purpose                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| GET /api/health               | MQTT, database, socket client count, ingestion counters and heap bytes                 |
| GET /api/telemetry/latest     | Latest reading or null; legacy `/api/latest` remains                                   |
| GET /api/telemetry/history    | Ascending bounded history; legacy `/api/history` remains                               |
| GET /api/alerts               | Recent persisted alerts including active/recovered state, measured value and threshold |
| GET /api/device               | Device online state, server last receipt, offline interval and demo settings           |
| GET /api/simulator/config     | Simulator control settings                                                             |
| POST /api/simulator/mode      | `{ "mode": "OVERVOLTAGE", "profile": "AC230" }`                                        |
| POST /api/simulator/telemetry | Development-only HTTP fallback                                                         |

Data routes accept `deviceId` or `device`. History accepts `from`/`to` or `start`/`end`. Limit must be an integer 1�1000; history defaults to 100, alerts to 30. Invalid query parameters return 400. Health reports MQTT failure without crashing the API; runtime database failures return generic errors, not stack traces.

WebSocket `/ws` sends `{ "type": "telemetry" | "alert" | "simulation", "data": ... }`. Alert updates retain an ID when resolved. Repeated abnormal readings create one alert per continuously active condition; recovery clears it immediately and a later threshold crossing creates a new event. Clients reconnect and reload history. Dashboard shows LIVE, RECONNECTING, OFFLINE or awaiting data, plus simulation source and last receipt. Chart history is capped at 100; points from differing profiles are not mixed. Backend heartbeat removes dead sockets and disconnects slow clients with excessive queued bytes.

Automatic telemetry/alert pruning is disabled to preserve historical records during physical logging. MongoDB stores new readings; the SQLite migration source and backup are retained. Plan explicit maintenance if long-term storage grows large.

## Testing and quality checks

```powershell
npm test
npm run lint
npm run format:check
npm run build
```

`npm test` starts isolated backend/broker instances automatically, using separate ports and an in-memory database plus a temporary disk database for restart tests. It does not require the demo running. Tests cover validation, faults, duplicate rejection, alert deduplication/recovery, API bounds, MQTT disconnect/reconnect, disk persistence across restart, multiple sockets, invalid-message suppression and HTTP fallback.

With `npm run dev` running and Chrome installed:

```powershell
npm run test:ui
npm run test:soak
```

UI tests exercise the actual simulator/MQTT/backend/dashboard path, fault recovery, stale detection, charts, reconnection, malformed socket packets and unavailable REST service. The soak uses isolated ports 3302/18884, a 20 Hz requested simulator for 180 seconds, and the existing Vite page to verify browser responsiveness and bounded chart points. Actual throughput depends on scheduling. `SOAK_SECONDS` changes duration. Test artifacts live in ignored `test-results/`. `npm run format` applies formatting; no TypeScript compiler applies to this JavaScript project.

See [software test report](docs/SOFTWARE_TEST_REPORT.md), [test matrix](docs/TEST_MATRIX.md), [hardware integration](docs/HARDWARE_INTEGRATION.md), and [audit](docs/IMPLEMENTATION_CHECKLIST.md).

## Hardware boundary

The voltage-divider/ACS712 arrangement does not establish safe mains measurement, RMS accuracy or power factor. AC230 is a **software-only demonstration** until suitable isolated instrumentation and safety validation exist. Hardware calibration, wiring, sensor fault detection, energy persistence on device, and any relay/protection actuation remain outstanding. Software test success is not hardware safety certification.

## Dashboard design

The dashboard uses a compact instrumentation workspace with a primary signal chart, live electrical values, device inspector and active/recovered event history. Click an electrical metric or signal tab to inspect it; choose a 30/60/100-sample window. **Export readings** downloads the retained telemetry as CSV. **Simulation** opens the profile and fault controls. Navigation adapts to smaller screens. Accessible Radix controls, Lucide icons and locally bundled Inter/IBM Plex Mono fonts are used; Chart.js remains the chart renderer.

See [dashboard redesign and verification](docs/UI_REDESIGN.md) for the component sources, testing and screenshot artifacts.
