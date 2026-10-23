import '../backend/src/config.js';
import Database from 'better-sqlite3';
import { MongoClient } from 'mongodb';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const source = new Database(
  resolve(process.env.DB_PATH || 'backend/data/voltguard.sqlite'),
  { readonly: true },
);
const client = new MongoClient(
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=voltguard',
);
await client.connect();
const target = client.db(process.env.MONGODB_DATABASE || 'voltguard');
const telemetry = source
  .prepare('SELECT * FROM telemetry ORDER BY id')
  .all()
  .map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    timestamp: r.timestamp,
    receivedAt: r.received_at || r.timestamp,
    batteryProfile: r.battery_profile,
    voltage: r.voltage,
    current: r.current,
    temperature: r.temperature,
    soc: r.soc,
    soh: r.soh,
    internalResistance: r.internal_resistance,
    status: r.status,
    power: r.power,
    energy: r.energy,
    source: r.source,
    quality: JSON.parse(r.quality || '{}'),
  }));
const alerts = source
  .prepare('SELECT * FROM alerts ORDER BY id')
  .all()
  .map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    code: r.code,
    type: r.code,
    severity: r.severity,
    message: r.message,
    timestamp: r.timestamp,
    value: r.value,
    threshold: r.threshold,
    active: !!r.active,
    resolvedAt: r.resolved_at,
  }));
try {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [name, rows] of Object.entries({ telemetry, alerts })) {
        for (let start = 0; start < rows.length; start += 1000)
          await target.collection(name).bulkWrite(
            rows.slice(start, start + 1000).map((row) => ({
              updateOne: {
                filter: { id: row.id },
                update: { $setOnInsert: row },
                upsert: true,
              },
            })),
            { session },
          );
        const stored = await target
          .collection(name)
          .find({}, { session, projection: { _id: 0 } })
          .sort({ id: 1 })
          .toArray();
        const byId = new Map(stored.map((row) => [row.id, row]));
        for (const row of rows) assert.deepEqual(byId.get(row.id), row);
        const maximum = stored.reduce((max, row) => Math.max(max, row.id), 0);
        await target
          .collection('counters')
          .updateOne(
            { _id: name },
            { $max: { value: maximum } },
            { upsert: true, session },
          );
      }
    });
  } finally {
    await session.endSession();
  }
  console.log(
    `Verified migration: ${telemetry.length} telemetry records, ${alerts.length} alerts. SQLite preserved.`,
  );
} finally {
  source.close();
  await client.close();
}
