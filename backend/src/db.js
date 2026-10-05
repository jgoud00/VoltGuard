import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './config.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const path =
  process.env.DB_PATH === ':memory:'
    ? ':memory:'
    : resolve(root, process.env.DB_PATH || 'backend/data/voltguard.sqlite');
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
export const db = new Database(path);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS telemetry (
 id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, timestamp TEXT NOT NULL, battery_profile TEXT NOT NULL,
 voltage REAL NOT NULL, current REAL NOT NULL, temperature REAL NOT NULL, soc REAL NOT NULL,
 soh REAL NOT NULL, internal_resistance REAL NOT NULL, status TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS telemetry_device_time ON telemetry(device_id, id DESC);
 CREATE INDEX IF NOT EXISTS telemetry_time ON telemetry(device_id, timestamp);
 CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, code TEXT NOT NULL,
 severity TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS alerts_device ON alerts(device_id, id DESC);`);
for (const [table, columns] of Object.entries({
  telemetry: {
    power: 'REAL NOT NULL DEFAULT 0',
    energy: 'REAL NOT NULL DEFAULT 0',
    source: "TEXT NOT NULL DEFAULT 'device'",
    received_at: "TEXT NOT NULL DEFAULT ''",
  },
  alerts: {
    value: 'REAL',
    threshold: 'REAL',
    active: 'INTEGER NOT NULL DEFAULT 0',
    resolved_at: 'TEXT',
  },
})) {
  const existing = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
  for (const [column, definition] of Object.entries(columns))
    if (!existing.includes(column))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
const map = (r) =>
  r && {
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
  };
export function saveTelemetry(s) {
  return db
    .prepare(
      `INSERT INTO telemetry (device_id,timestamp,battery_profile,voltage,current,temperature,soc,soh,internal_resistance,status,power,energy,source,received_at) VALUES (@deviceId,@timestamp,@batteryProfile,@voltage,@current,@temperature,@soc,@soh,@internalResistance,@status,@power,@energy,@source,@receivedAt)`,
    )
    .run(s).lastInsertRowid;
}
export function saveAlert(a) {
  return db
    .prepare(
      'INSERT INTO alerts (device_id,code,severity,message,timestamp,value,threshold,active) VALUES (@deviceId,@code,@severity,@message,@timestamp,@value,@threshold,1)',
    )
    .run(a).lastInsertRowid;
}
export function resolveAlert(id, timestamp) {
  db.prepare('UPDATE alerts SET active=0,resolved_at=? WHERE id=?').run(
    timestamp,
    id,
  );
}
export function latest(id) {
  return map(
    db
      .prepare(
        'SELECT * FROM telemetry WHERE device_id=? ORDER BY id DESC LIMIT 1',
      )
      .get(id),
  );
}
export function history(deviceId, limit, from, to) {
  const clauses = ['device_id=@deviceId'];
  if (from) clauses.push('timestamp>=@from');
  if (to) clauses.push('timestamp<=@to');
  return db
    .prepare(
      `SELECT * FROM (SELECT * FROM telemetry WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT @limit) ORDER BY id ASC`,
    )
    .all({ deviceId, limit, from, to })
    .map(map);
}
export function alerts(id, limit = 30) {
  return db
    .prepare('SELECT * FROM alerts WHERE device_id=? ORDER BY id DESC LIMIT ?')
    .all(id, limit)
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
}
export function prune() {
  db.prepare(
    'DELETE FROM telemetry WHERE id NOT IN (SELECT id FROM telemetry ORDER BY id DESC LIMIT 100000)',
  ).run();
  db.prepare(
    'DELETE FROM alerts WHERE active=0 AND id NOT IN (SELECT id FROM alerts ORDER BY id DESC LIMIT 5000)',
  ).run();
}
