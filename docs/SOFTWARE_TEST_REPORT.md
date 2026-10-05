# VoltGuard Software Test Report

Executed on **2026-10-02**, local Windows environment. PASS means the stated check was actually executed successfully; it does not imply physical hardware validation.

## 1. Objective

Complete a reproducible hardware-free telemetry path while preserving the existing battery application and preparing an explicit ESP32 input contract.

## 2. Software architecture

Node simulator ? MQTT/Aedes ? Express/shared validation ? alert engine + SQLite WAL ? ws/REST ? React 19/Vite/Chart.js. Explicit development HTTP fallback enters the same backend ingestion pipeline. SQLite migrations add columns without dropping existing data.

## 3. Test environment

Windows, PowerShell, Node 24.11.1, npm 11.18.0, installed Google Chrome in headless mode, existing npm workspace dependencies. Normal demo: API 3001, Vite 5173, MQTT 1883 (existing listener occupied the port; ingestion used that broker). Isolated backend integration: ports 3301/18883, external broker restart 3303/18885, soak 3302/18884. Isolated tests use an in-memory database; restart test uses a unique temporary disk database. Existing demo database is preserved, with test/demo readings added through the running app.

## 4. Components tested

PASS: canonical schema, configured alert evaluation, simulator MQTT and HTTP paths, API bounds, SQLite insertion/history, real MQTT broker, real WebSocket clients, Chrome dashboard and production bundle.

## 5. Test methodology

`npm test` automatically starts isolated services. Assertions observe persisted values, emitted events, alert lifecycle and broker restart behavior. Browser tests observe visible cards/charts/statuses, actual fault scenarios and recovery. Malformed socket packets and unavailable REST are deliberately injected in one browser test. Soak checks real ingestion, socket counts, coarse heap growth, bounded history, browser errors and repeated browser interactions.

## 6. Unit tests

**PASS: 14 passed / 0 failed.** Canonical accepted packet/server timestamp and field removal; missing voltage/current, negative voltage, NaN, Infinity, numeric strings, inconsistent power and negative energy rejection; normal produces no alerts; four fault conditions produce configured alerts.

## 7. Integration tests

**PASS: 2 passed / 0 failed.** Isolated end-to-end backend test and external MQTT disconnect/reconnect plus persisted restart test. Each contains multiple behavioral assertions rather than counting assertions as separate tests. Total Node suite: **16 passed / 0 failed**.

## 8. API tests

PASS: empty latest/history, health, latest aliases, history bounds/date/device parameters, persisted power, recent alerts, device freshness, malformed JSON request, unapproved simulator origin, explicit HTTP simulator transport. Limit 0/1001/noninteger/malformed forms are rejected. Runtime DB errors are handled generically in code; forced disk-full/locked/corrupted DB tests were not executed (**PARTIAL** for DB failure injection).

## 9. MQTT tests

PASS: real broker subscriptions, valid telemetry, malformed JSON and missing sensor rejection, topic-based ingestion, duplicate timestamp suppression, external broker disappearance without API crash, reconnect after broker restart, post-restart alert processing. No physical ESP32/TLS broker testing was performed.

## 10. WebSocket tests

PASS: two clients receive telemetry; malformed packets do not broadcast; alerts broadcast; disconnected client count drops; browser disconnect reconnects and reloads history. Soak verifies a stable count of two clients (Chrome and observer) and no browser errors. Heartbeat/slow-client limits are implemented; sustained malicious-client stress is not separately tested (**PARTIAL** for stress hardening).

## 11. Frontend tests

**PASS: 3 passed / 0 failed.**

1. Dashboard/cards and charts render/update, refresh retains history, socket reconnects, mobile viewport has no horizontal overflow, no page errors; desktop/mobile screenshots produced and inspected.
2. Actual simulator ? MQTT ? backend ? dashboard: NORMAL ? OVERVOLTAGE ? NORMAL ? UNDERVOLTAGE ? NORMAL ? OVERCURRENT ? NORMAL ? OVERTEMPERATURE ? NORMAL; alerts appear and clear; DEVICE_OFFLINE marks stale readings offline; resumed normal data restores live.
3. REST unavailable and malformed socket data leave a usable awaiting-data dashboard without JavaScript errors.

A final browser rerun after formatting and shared-validator tightening also passed. AC230 hides unmeasured battery estimates; battery profiles retain six charts including the new power trend. All graphs cap history at 100 and filter profile changes.

## 12. Fault simulation tests

PASS: high/low voltage, high current, high temperature, recovery, stopped telemetry, resumed telemetry, repeated abnormal values without alert flooding, malformed JSON and missing fields. Unstable scenario was exercised during both soak runs. Simulator CLI supports separate device/rate/duration/profile selection and explicitly selected HTTP fallback.

## 13. End-to-end test

**PASS:** the browser fault/recovery test observes the complete actual simulator ? MQTT ? backend validation ? alert engine ? storage ? WebSocket ? React path. API/backend integration assertions independently confirm persisted data. Browser test does not use mock telemetry for this scenario.

## 14. Results and long run

| Executed check                     | Result                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node unit tests                    | PASS, 14/14                                                                                                                         |
| Backend integration tests          | PASS, 2/2                                                                                                                           |
| Chrome browser tests               | PASS, 3/3                                                                                                                           |
| Production Vite build              | PASS                                                                                                                                |
| ESLint                             | PASS                                                                                                                                |
| Prettier check                     | PASS                                                                                                                                |
| npm dependency audit               | PASS, zero reported vulnerabilities                                                                                                 |
| TypeScript compiler                | NOT APPLICABLE, JavaScript project                                                                                                  |
| First 180-second MQTT/backend soak | PASS, 2,886 accepted readings, heap approximately 21�24 MB                                                                          |
| Second 180-second soak with Chrome | PASS, 2,888 accepted readings; two clients; heap approximately 21�23 MB; chart =100 points; repeated browser clicks; no page errors |

Soak requested 20 samples/s; observed throughput was about 16/s because loop scheduling includes config fetch and processing. Query history stayed =1,000. Soak uses in-memory SQLite; disk persistence is separately verified by the restart test. A three-minute coarse heap bound does not establish indefinite leak freedom or long-term disk behavior.

## 15. Known limitations

- No authentication accounts, TLS transport or physical relay actuation. Local-only defaults and protected simulator endpoints are appropriate for a student demo, not public deployment.
- No forced disk-full/corruption failure test or physical network reliability test.
- AC230 power assumes PF=1; it is not measured real power at unknown PF. Energy resets when simulator restarts.
- Battery estimates are illustrative. Simulator is a representative scenario generator, not a battery physics model.
- Duplicate/out-of-order timestamp policy intentionally drops replayed data. A device clock reset requires omitting timestamp until UTC is synchronized.
- Retention runs every 1,000 accepted packets, so stored rows can temporarily exceed target by that interval; active alerts are retained.
- Missing/unopenable SQLite storage fails startup visibly; runtime SQL errors are contained. It does not silently discard persistence.

## 16. Hardware integration remaining

Configure a secured LAN broker; implement matching ESP32 JSON and reconnection behavior; calibrate ACS712/divider/DS18B20, clock, battery estimation and energy persistence; verify hardware fault behavior. AC230 needs safe isolated sensing and appropriate instrumentation; do not connect the existing divider directly to mains. Validate any protective actuation separately.

## 17. Final software status

**PASS for the executed local software demonstration and complete tested pipeline. Ready for hardware protocol testing: PARTIALLY.** Software is ready to receive the documented MQTT contract; physical calibration, electrical safety and protection behavior remain unverified. See [test matrix](TEST_MATRIX.md) and [hardware handoff](HARDWARE_INTEGRATION.md).

## Files created or significantly modified

Created: `shared/telemetry.js`, `backend/src/config.js`, `backend/test/contract.test.js`, `backend/test/restart.test.js`, `scripts/test-stack.js`, `scripts/soak.js`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `docs/IMPLEMENTATION_CHECKLIST.md`, `docs/TEST_MATRIX.md`, `docs/SOFTWARE_TEST_REPORT.md`, `docs/HARDWARE_INTEGRATION.md`.

Significantly modified: `backend/src/server.js`, `backend/src/contract.js`, `backend/src/db.js`, `backend/test/smoke.test.js`, `simulator/simulator.js`, `frontend/src/App.jsx`, `frontend/test/dashboard.spec.js`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `docs/ESP32_INTEGRATION.md`.

Formatting-only updates: workspace package manifests, `frontend/index.html`, `frontend/src/styles.css`, `frontend/vite.config.js`, `playwright.config.js`, `shared/battery.js`. Generated frontend build and ignored screenshots were regenerated; the existing database received additive migration and demonstration readings.
