# Software test matrix

Executed 2026-10-02. This matrix points to actual automated checks. Hardware results are excluded.

| ID  | Input/event                               | Expected result                                         | Result and evidence                                                             |
| --- | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| T01 | Normal telemetry                          | Healthy state, no alerts                                | PASS: unit, backend integration, browser                                        |
| T02 | High voltage                              | OVERVOLTAGE alert                                       | PASS: unit, integration, browser                                                |
| T03 | Low voltage                               | UNDERVOLTAGE alert                                      | PASS: unit, integration, browser                                                |
| T04 | High current                              | OVERCURRENT alert                                       | PASS: unit, integration, browser                                                |
| T05 | High temperature                          | HIGH_TEMPERATURE alert                                  | PASS: unit, integration, browser                                                |
| T06 | Broker stopped/restarted                  | API survives and MQTT reconnects                        | PASS: external-broker restart test                                              |
| T07 | Browser socket closed                     | Reconnect, reload, live data                            | PASS: browser reconnect test                                                    |
| T08 | Invalid JSON                              | Reject, no telemetry event, API survives                | PASS: backend integration                                                       |
| T09 | Missing/wrong/nonfinite sensor values     | Reject                                                  | PASS: unit and integration                                                      |
| T10 | Device stops transmitting                 | Device/dashboard OFFLINE                                | PASS: integration and browser                                                   |
| T11 | Device resumes                            | Online/LIVE returns                                     | PASS: integration and browser                                                   |
| T12 | Repeated abnormal samples                 | One event per continuous condition                      | PASS: integration                                                               |
| T13 | Backend restart                           | Persisted reading survives; processing resumes          | PASS: disk SQLite restart test                                                  |
| T14 | Multiple connected clients                | Both receive data; cleanup correct                      | PASS: integration and Chrome soak                                               |
| T15 | 180 seconds at requested 20 Hz            | No crash; responsive UI; bounded charts and coarse heap | PASS: two executed soaks, observed ~16 Hz                                       |
| T16 | Normal after fault                        | Alert resolved, healthy status                          | PASS: integration and browser                                                   |
| T17 | Limits/dates/device malformed             | 400 errors                                              | PASS: integration                                                               |
| T18 | Empty database                            | Null latest, empty history                              | PASS: integration                                                               |
| T19 | Duplicate/older timestamp                 | No duplicate ingestion                                  | PASS: integration checks identical timestamp; older rejection shares comparison |
| T20 | MQTT unavailable, explicit HTTP transport | Same backend pipeline exercised                         | PASS: HTTP simulator integration; no automatic fallback                         |
| T21 | Disallowed origin                         | Simulator mutation denied                               | PASS: integration                                                               |
| T22 | REST unavailable/malformed socket event   | Dashboard stays usable, no page error                   | PASS: browser injected failure test                                             |
| T23 | DB disk-full/corruption                   | Generic error, service degraded                         | PARTIAL: error containment implemented; no forced fault executed                |
| T24 | Physical ESP32/sensors                    | Calibrated readings and electrical protection           | PARTIAL: contract documented, physical checks outstanding                       |
| T25 | Lint/format/build/dependency audit        | No check errors                                         | PASS: executed final checks                                                     |

Reproduce with `npm test`, then (with `npm run dev` running) `npm run test:ui` and `npm run test:soak`. Full evidence boundaries and outcomes: [software test report](SOFTWARE_TEST_REPORT.md).
