import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.DB_PATH = ':memory:';
process.env.SIMULATION_ENABLED = 'true';
process.env.BATTERY_PROFILE = '12V';
process.env.SIM_MODE = 'NORMAL';
const storage = await import('../src/db.js');
const { ingest } = await import('../src/ingest.js');
const { createHttpServer } = await import('../src/http.js');
const sample = (change = {}) => ({
  deviceId: 'storage-test',
  voltage: 230,
  current: 1,
  temperature: 30,
  ...change,
});

test('database read and write failures change health; successful access restores it', async () => {
  const { app } = createHttpServer(
    () => ({
      mqttReady: true,
      count: 0,
      rejected: 0,
      duplicates: 0,
      wsClients: 0,
    }),
    () => {},
  );
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${server.address().port}`;
  const health = () => fetch(api + '/api/health');
  try {
    assert.equal((await health()).status, 200);
    storage.db.exec('ALTER TABLE telemetry RENAME TO telemetry_unavailable');
    assert.equal((await fetch(api + '/api/latest')).status, 503);
    let response = await health();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).database, 'unavailable');
    await assert.rejects(ingest(sample()));
    assert.equal(storage.dbHealthy, false);
    storage.db.exec('ALTER TABLE telemetry_unavailable RENAME TO telemetry');
    await storage.latest('storage-test');
    assert.equal((await health()).status, 200);

    storage.db.exec(
      "CREATE TRIGGER unavailable_write BEFORE INSERT ON telemetry BEGIN SELECT RAISE(FAIL, 'write unavailable'); END",
    );
    await assert.rejects(ingest(sample()), /write unavailable/);
    response = await health();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'degraded');
    storage.db.exec('DROP TRIGGER unavailable_write');
    await ingest(sample());
    assert.equal((await health()).status, 200);
    await assert.rejects(ingest(sample({ voltage: 'bad' })));
    assert.equal((await health()).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('active alerts survive more than 5000 newer events, deduplicate, and recover', async () => {
  const deviceId = 'old-condition';
  const timestamp = new Date(Date.now() - 2000).toISOString();
  const alert = {
    deviceId,
    code: 'HIGH_TEMPERATURE',
    severity: 'CRITICAL',
    message: 'Hot',
    timestamp,
    value: 60,
    threshold: 50,
  };
  const id = await storage.saveAlert(alert);
  storage.db.transaction(() => {
    const insert = storage.db.prepare(
      "INSERT INTO alerts (device_id,code,severity,message,timestamp,active) VALUES (?, 'OVERVOLTAGE','CRITICAL','Recovered',?,0)",
    );
    for (let i = 0; i < 5001; i++) insert.run(deviceId, timestamp);
  })();
  const { app } = createHttpServer(
    () => ({}),
    () => {},
  );
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${server.address().port}`;
  try {
    const recent = await (
      await fetch(api + `/api/alerts?deviceId=${deviceId}`)
    ).json();
    assert.equal(recent.length, 30);
    assert.ok(recent.every((a) => !a.active));
    const active = await (
      await fetch(api + `/api/alerts?deviceId=${deviceId}&active=true&limit=1`)
    ).json();
    assert.deepEqual(
      active.map((a) => a.id),
      [Number(id)],
    );
    assert.equal((await fetch(api + '/api/alerts?active[]=true')).status, 400);
    assert.equal(
      (await fetch(api + '/api/alerts?active=true&limit=0')).status,
      400,
    );
    const hot = await ingest(sample({ deviceId, temperature: 60, timestamp }));
    assert.equal(hot.events.length, 0);
    const normal = await ingest(sample({ deviceId }));
    assert.deepEqual(
      normal.events.map((e) => [e.data.id, e.data.active]),
      [[Number(id), false]],
    );
    assert.deepEqual(await storage.alerts(deviceId, undefined, true), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.after(() => storage.db.close());
