# MongoDB storage

The hardware backend uses MongoDB by default. Local development uses a single-node replica set named `voltguard`, bound to `127.0.0.1:27018`. Replica-set transactions atomically save telemetry and alert changes. Each ingestion is serialized to preserve duplicate detection, numeric IDs and energy integration.

Configure the ignored `.env`:

```dotenv
DATABASE_DRIVER=mongodb
MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=voltguard
MONGODB_DATABASE=voltguard
```

Start MongoDB after a reboot with `powershell -File scripts/start-mongodb.ps1`, then run `npm run dev:hardware`. The script uses the binary under `%LOCALAPPDATA%\VoltGuard\mongodb` or an installed MongoDB under `%ProgramFiles%\MongoDB\Server`. It starts the replica set on port `27018`, leaving any standalone service on `27017` untouched. Data lives in ignored `backend/data/mongodb/`. The server is local only; do not expose this unauthenticated development instance to the network.

Collections: `telemetry`, `alerts`, `counters`. Documents retain the API's numeric IDs, timestamps, null measurements, source and quality fields. Indexed device/ID and device/timestamp queries support the latest/history endpoints. Telemetry, alerts, MQTT and WebSocket responses keep the existing contract. Power and discharge energy remain nominal, noise-limited estimates; SoC, SoH and internal resistance remain unknown in physical telemetry.

## Preserving existing SQLite records

Stop the backend before running `node scripts/migrate-sqlite-to-mongo.js`. This imports all telemetry and alerts, verifies every imported field, and seeds ID counters in a MongoDB transaction. Repeating it with identical source data is idempotent; conflicting IDs fail verification and roll back rather than overwrite data. The SQLite source is read-only and retained. The October 7 migration imported 10,931 telemetry rows and 36 alerts; `backend/data/voltguard.sqlite.pre-mongodb-backup.sqlite` preserves the cutover snapshot. New readings are written only to MongoDB; historical rows are not recomputed.

`DATABASE_DRIVER=sqlite` remains available for legacy tests and rollback. A rollback after new MongoDB readings arrive requires migrating those new records back; do not assume the old SQLite file contains them.

## Verification

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=voltguard'
npm test
npm run build
```

The MongoDB integration test creates and removes only a uniquely named test database. It checks null telemetry, MQTT/API/WebSocket delivery, alert transactions, energy storage and backend restart persistence. Without `MONGODB_TEST_URI`, that test is explicitly skipped and the legacy SQLite tests still run. `/api/health` identifies the active `databaseDriver`.
