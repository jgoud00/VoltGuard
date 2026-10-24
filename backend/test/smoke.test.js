import test from 'node:test';
import assert from 'node:assert/strict';
import mqtt from 'mqtt';
import { WebSocket } from 'ws';
import { stack, until, delay } from '../../scripts/test-stack.js';
test(
  'isolated MQTT/API/SQLite/WebSocket simulator pipeline and recovery',
  { timeout: 60000 },
  async () => {
    const s = await stack();
    let client;
    const sockets = [];
    try {
      assert.equal(
        (
          await fetch(s.api + '/api/simulator/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{broken',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(s.api + '/api/simulator/telemetry', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'http://evil.example',
            },
            body: '{}',
          })
        ).status,
        403,
      );
      assert.equal(await s.json('/api/telemetry/latest'), null);
      assert.deepEqual(await s.json('/api/history'), []);
      for (const q of [
        'limit=0',
        'limit=1001',
        'limit=abc',
        'limit=3x',
        'from=invalid',
        'deviceId[]=bad',
      ])
        assert.equal((await fetch(s.api + '/api/history?' + q)).status, 400);
      for (let i = 0; i < 2; i++) {
        const ws = new WebSocket(s.api.replace('http', 'ws') + '/ws');
        sockets.push(ws);
        await new Promise((r, j) => {
          ws.once('open', r);
          ws.once('error', j);
        });
      }
      const packets = sockets.map(() => []);
      sockets.forEach((w, i) =>
        w.on('message', (b) => packets[i].push(JSON.parse(b))),
      );
      client = mqtt.connect(s.env.MQTT_URL, { reconnectPeriod: 100 });
      await new Promise((r) => client.once('connect', r));
      const publish = (raw) =>
        new Promise((r, j) =>
          client.publish(
            'voltguard/device/test/telemetry',
            typeof raw === 'string' ? raw : JSON.stringify(raw),
            { qos: 1 },
            (e) => (e ? j(e) : r()),
          ),
        );
      const sample = (change = {}) => ({
        deviceId: 'test',
        timestamp: new Date().toISOString(),
        voltage: 230,
        current: 1,
        power: 230,
        temperature: 30,
        ...change,
      });
      await publish(sample());
      await until(() =>
        packets.every((p) => p.some((e) => e.type === 'telemetry')),
      );
      assert.equal((await s.json('/api/latest?deviceId=test')).power, 230);
      for (const raw of [
        '{broken',
        JSON.stringify({ deviceId: 'test', current: 1, temperature: 30 }),
      ])
        await publish(raw);
      await delay(100);
      assert.equal((await s.json('/api/health')).rejected, 2);
      assert.equal(packets[0].filter((e) => e.type === 'telemetry').length, 1);
      const previous = await s.json('/api/latest?deviceId=test');
      await publish(previous);
      await delay(100);
      assert.equal((await s.json('/api/health')).duplicates, 1);
      assert.equal((await s.json('/api/health')).rejected, 2);
      for (const [code, change] of Object.entries({
        OVERVOLTAGE: { voltage: 270, power: 270 },
        UNDERVOLTAGE: { voltage: 190, power: 190 },
        OVERCURRENT: { current: 15, power: 3450 },
        HIGH_TEMPERATURE: { temperature: 55 },
      })) {
        await publish(sample(change));
        await until(async () =>
          (await s.json('/api/alerts?deviceId=test')).some(
            (a) => a.code === code && a.active,
          ),
        );
        const before = (await s.json('/api/alerts?deviceId=test')).length;
        await delay(5);
        await publish(sample(change));
        await delay(100);
        assert.equal(
          (await s.json('/api/alerts?deviceId=test')).length,
          before,
        );
        await publish(sample());
        await until(async () =>
          (await s.json('/api/alerts?deviceId=test')).every((a) => !a.active),
        );
      }
      await until(
        async () => !(await s.json('/api/device?deviceId=test')).online,
        3000,
      );
      await publish(sample());
      await until(
        async () => (await s.json('/api/device?deviceId=test')).online,
      );
      sockets[0].close();
      await until(
        async () => (await s.json('/api/health')).websocketClients === 1,
      );
      client.end(true);
      assert.equal((await s.json('/api/health')).status, 'ok');
      s.start('simulator/simulator.js', [
        '--scenario',
        'normal',
        '--rate',
        '10',
        '--duration',
        '2',
      ]);
      await until(
        async () => (await s.json('/api/latest'))?.source === 'simulation',
      );
      s.start('simulator/simulator.js', [
        '--scenario',
        'normal',
        '--transport',
        'http',
        '--device',
        'http-test',
        '--profile',
        'AC230',
        '--rate',
        '5',
        '--duration',
        '1',
      ]);
      await until(
        async () =>
          (await s.json('/api/latest?deviceId=http-test'))?.source ===
          'simulation',
      );
      assert.ok(packets[1].some((e) => e.type === 'alert'));
      await until(() =>
        packets[1].some(
          (e) => e.type === 'telemetry' && e.data.deviceId === 'http-test',
        ),
      );
      const energyHistory = await until(async () => {
        const rows = await s.json('/api/history?deviceId=http-test');
        return rows.length >= 2 && rows;
      });
      assert.ok(energyHistory.at(-1).energy > energyHistory[0].energy);
      for (const temperature of [60, 30]) {
        const response = await s.json('/api/simulator/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sample({ temperature }),
            deviceId: 'http-alert',
          }),
        });
        assert.equal(response.accepted, true);
        await until(() =>
          packets[1].some(
            (e) =>
              e.type === 'alert' &&
              e.data.deviceId === 'http-alert' &&
              e.data.active === (temperature === 60),
          ),
        );
      }
      const httpPrevious = await s.json('/api/latest?deviceId=http-alert');
      assert.deepEqual(
        await s.json('/api/simulator/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(httpPrevious),
        }),
        { accepted: false },
      );
      assert.equal(
        packets[1].filter((e) => e.data.deviceId === 'http-alert').length,
        4,
      );
      for (const body of [
        { mode: 'CHARGING', profile: 'AC230' },
        { mode: 'CHARGING', profile: '' },
      ]) {
        assert.equal(
          (
            await fetch(s.api + '/api/simulator/mode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          ).status,
          400,
        );
      }
      await s.json('/api/simulator/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'CHARGING', profile: '12V' }),
      });
      assert.equal(
        (
          await fetch(s.api + '/api/simulator/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'CHARGING', profile: 'AC230' }),
          })
        ).status,
        400,
      );
      assert.equal((await s.json('/api/simulator/config')).profile, '12V');
    } finally {
      client?.end(true);
      sockets.forEach((w) => w.terminate());
      await s.stop();
    }
  },
);
