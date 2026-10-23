import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import mqtt from 'mqtt';
import { WebSocket } from 'ws';
import { validateTelemetry } from '../../shared/telemetry.js';
import { evaluateAlerts } from '../src/contract.js';
import { stack, until } from '../../scripts/test-stack.js';

const physical = {
  deviceId: 'hardware-test',
  batteryProfile: 'LI_ION_2S',
  voltage: 8.15,
  current: null,
  temperature: null,
  soc: null,
  soh: null,
  internalResistance: null,
  power: null,
  energy: null,
  quality: {
    voltage: 'averaged_unverified',
    current: 'uncalibrated',
    temperature: 'disconnected',
  },
};
test('2S missing sensors stay null and cannot generate false estimate alerts', () => {
  const value = validateTelemetry(physical);
  assert.equal(value.status, 'partial');
  assert.ok(value.timestamp.endsWith('Z'));
  for (const key of [
    'current',
    'temperature',
    'soc',
    'soh',
    'internalResistance',
    'power',
    'energy',
  ])
    assert.equal(value[key], null);
  assert.deepEqual(evaluateAlerts(value), []);
  const warm = validateTelemetry({
    ...physical,
    temperature: 55,
    quality: { ...physical.quality, temperature: 'measured' },
  });
  assert.deepEqual(
    evaluateAlerts(warm).map((a) => a.code),
    ['HIGH_TEMPERATURE'],
  );
  for (const key of ['soc', 'soh', 'internalResistance', 'power', 'energy'])
    assert.throws(() => validateTelemetry({ ...physical, [key]: 1 }));
  assert.throws(() => validateTelemetry({ ...physical, current: 0 }));
  assert.throws(() =>
    validateTelemetry({
      ...physical,
      quality: { ...physical.quality, current: 'measured' },
    }),
  );
  const calibrated = validateTelemetry({
    ...physical,
    current: 0.5,
    quality: { ...physical.quality, current: 'calibrated_limited' },
  });
  assert.equal(calibrated.power, null);
  assert.equal(calibrated.energy, null);
  const small = validateTelemetry({
    ...physical,
    quality: { ...physical.quality, current: 'below_resolution' },
  });
  assert.equal(small.current, null);
});

test(
  'legacy SQLite migration preserves rows; authenticated hardware MQTT reaches API and WebSocket with nulls',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voltguard-migration-'));
    const path = join(dir, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE telemetry (
    id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, timestamp TEXT NOT NULL, battery_profile TEXT NOT NULL,
    voltage REAL NOT NULL, current REAL NOT NULL, temperature REAL NOT NULL, soc REAL NOT NULL,
    soh REAL NOT NULL, internal_resistance REAL NOT NULL, status TEXT NOT NULL);
    INSERT INTO telemetry VALUES (42,'historic','2026-01-01T00:00:00.000Z','12V',12.48,1.35,31.2,82.4,91,0.041,'healthy');
    CREATE TABLE alerts (id INTEGER PRIMARY KEY,device_id TEXT NOT NULL,code TEXT NOT NULL,severity TEXT NOT NULL,message TEXT NOT NULL,timestamp TEXT NOT NULL);
    INSERT INTO alerts VALUES (7,'historic','HIGH_TEMPERATURE','CRITICAL','Historical alert','2026-01-01T00:00:00.000Z');`);
    const original = legacy.prepare('SELECT * FROM telemetry').get();
    const originalAlert = legacy.prepare('SELECT * FROM alerts').get();
    legacy.close();
    let s, client, socket;
    try {
      s = await stack(3305, 18887, {
        DB_PATH: path,
        SIMULATION_ENABLED: 'false',
        MQTT_USERNAME: 'test-user',
        MQTT_PASSWORD: 'test-only-password',
      });
      const historic = await s.json('/api/latest?deviceId=historic');
      assert.equal(historic.id, 42);
      assert.equal(historic.voltage, 12.48);
      assert.equal(
        (
          await fetch(s.api + '/api/simulator/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(physical),
          })
        ).status,
        404,
      );
      socket = new WebSocket(s.api.replace('http', 'ws') + '/ws');
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      const packets = [];
      socket.on('message', (data) => packets.push(JSON.parse(data)));
      client = mqtt.connect(s.env.MQTT_URL, {
        username: s.env.MQTT_USERNAME,
        password: s.env.MQTT_PASSWORD,
        reconnectPeriod: 0,
      });
      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
      });
      client.publish(
        'voltguard/device/hardware-test/telemetry',
        JSON.stringify(physical),
      );
      const live = await until(
        async () => await s.json('/api/latest?deviceId=hardware-test'),
      );
      assert.equal(live.id, 43);
      assert.equal(live.source, 'device');
      assert.deepEqual(live.quality, {
        ...physical.quality,
        power: 'unavailable',
        energy: 'unavailable',
      });
      assert.equal(live.current, null);
      assert.equal(live.temperature, null);
      assert.equal(live.power, null);
      await until(() =>
        packets.some(
          (p) =>
            p.type === 'telemetry' && p.data.deviceId === physical.deviceId,
        ),
      );
      assert.equal(
        packets.find((p) => p.type === 'telemetry').data.internalResistance,
        null,
      );
      client.publish(
        'voltguard/device/hardware-test/telemetry',
        JSON.stringify({
          ...physical,
          temperature: 55,
          quality: { ...physical.quality, temperature: 'measured' },
        }),
      );
      await until(async () =>
        (await s.json('/api/alerts?deviceId=hardware-test')).some(
          (a) => a.code === 'HIGH_TEMPERATURE' && a.active,
        ),
      );
      const hot = await s.json('/api/latest?deviceId=hardware-test');
      client.publish(
        'voltguard/device/hardware-test/telemetry',
        JSON.stringify(physical),
      );
      await until(
        async () =>
          (await s.json('/api/latest?deviceId=hardware-test')).id > hot.id,
      );
      assert.ok(
        (await s.json('/api/alerts?deviceId=hardware-test')).some(
          (a) => a.code === 'HIGH_TEMPERATURE' && a.active,
        ),
        'Unavailable sensor must not imply recovery',
      );
      client.publish(
        'voltguard/device/hardware-test/telemetry',
        JSON.stringify({
          ...physical,
          temperature: 30,
          quality: { ...physical.quality, temperature: 'measured' },
        }),
      );
      await until(async () =>
        (await s.json('/api/alerts?deviceId=hardware-test')).some(
          (a) => a.code === 'HIGH_TEMPERATURE' && !a.active,
        ),
      );
      socket.close();
      await new Promise((resolve) => client.end(true, resolve));
      client = null;
      await s.stop();
      s = null;
      const migrated = new Database(path);
      const persisted = migrated
        .prepare('SELECT * FROM telemetry WHERE id=42')
        .get();
      for (const [key, value] of Object.entries(original))
        assert.equal(persisted[key], value);
      const alert = migrated.prepare('SELECT * FROM alerts WHERE id=7').get();
      for (const [key, value] of Object.entries(originalAlert))
        assert.equal(alert[key], value);
      assert.equal(
        migrated.prepare('SELECT count(*) AS n FROM telemetry').get().n,
        5,
      );
      assert.equal(
        migrated.prepare('SELECT current FROM telemetry WHERE id=43').get()
          .current,
        null,
      );
      migrated.close();
      const backup = new Database(path + '.pre-nullable-backup.sqlite');
      assert.equal(
        backup.prepare('SELECT count(*) AS n FROM telemetry').get().n,
        1,
      );
      backup.close();
    } finally {
      socket?.terminate();
      client?.end(true);
      await s?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
