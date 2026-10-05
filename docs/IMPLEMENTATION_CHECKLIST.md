# Implementation audit and checklist

Audit performed before edits on 2026-10-02. Source, shared models, simulator, frontend assets, all manifests, lockfile, environment example, browser configuration, tests and integration documentation were inspected. Generated dependency/build directories were excluded from source edits. No Git repository or AGENTS.md was present in this checkout. No hosting configuration was present.

## Existing architecture

React 19 / Vite / Chart.js; Express 5; mqtt.js and embedded Aedes; ws; better-sqlite3 WAL. Existing battery simulator supports 6V/12V, SoC/SoH and temperature scenarios. REST latest/history/alerts and demo controls exist. Five bounded charts and fixed socket retry exist. No accounts/authentication, TypeScript, formatter or linter existed. Prior smoke tests depended on a running stack.

## Findings and completion checklist

- [x] Preserve battery simulation, history, charts, original topics/routes and SQLite data.
- [x] Shared canonical validation; AC230 software profile, power and energy; reject missing/wrong/nonfinite values and inconsistent assumed-PF power.
- [x] Centralize thresholds, offline interval, network configuration and startup validation.
- [x] Extend simulator CLI with rate/duration/device/profile/scenarios and explicit protected HTTP fallback.
- [x] Add over/under voltage and overcurrent; retain battery/temperature alerts; persist value/threshold and recovery; deduplicate continuous conditions.
- [x] Replace permissive limit parsing and unrestricted CORS; protect simulator writes; keep credentials off browser.
- [x] MQTT QoS subscriptions/retry, identity checks, malformed-packet handling and duplicate/out-of-order suppression.
- [x] WebSocket heartbeat, slow-client bound, cleanup, graceful shutdown and visible frontend retry/offline states.
- [x] SQLite additive migration, indexes, bounded queries, transactions and generic runtime errors.
- [x] Add power/energy cards and power trend; hide irrelevant battery estimates in AC view and avoid mixed-profile chart points.
- [x] Isolated automated backend tests, broker reconnect/restart, disk persistence, browser faults/recovery and soak command.
- [x] Add lint/formatter scripts and current setup, hardware contract and test report.

## Limits retained deliberately

Local demo has no user accounts, TLS or relay actuation. AC230 is a software demonstration. Simulator SoC/SoH use accelerated representative states. A lightweight backend health metric reports degraded runtime database access; database opening/schema failures prevent startup rather than silently replacing storage. Startup reports bind failures; an occupied MQTT port can be served by an existing broker, so use isolated configured ports when needed.
