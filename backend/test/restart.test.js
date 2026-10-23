import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { until } from '../../scripts/test-stack.js';
test(
  'external MQTT disconnect/reconnect and persisted backend restart',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voltguard-'));
    const env = {
      ...process.env,
      PORT: '3303',
      MQTT_URL: 'mqtt://127.0.0.1:18885',
      EMBEDDED_BROKER: 'false',
      HOST: '127.0.0.1',
      MQTT_USERNAME: '',
      MQTT_PASSWORD: '',
      DB_PATH: join(dir, 'test.sqlite'),
      DATABASE_DRIVER: 'sqlite',
    };
    let broker, listener, child, client;
    const startBroker = async () => {
      broker = await Aedes.createBroker();
      listener = net.createServer(broker.handle);
      await new Promise((r) => listener.listen(18885, '127.0.0.1', r));
    };
    const stopBroker = async () => {
      await new Promise((r) => broker.close(r));
      await new Promise((r) => listener.close(r));
    };
    const startServer = () => {
      child = spawn(process.execPath, ['backend/src/server.js'], {
        env,
        stdio: 'ignore',
      });
    };
    const stopServer = async () => {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    };
    const api = async (path) => {
      const r = await fetch('http://127.0.0.1:3303' + path);
      assert.equal(r.status, 200);
      return r.json();
    };
    try {
      await startBroker();
      startServer();
      await until(async () => (await api('/api/health')).mqttConnected);
      client = mqtt.connect(env.MQTT_URL, { reconnectPeriod: 100 });
      await new Promise((r) => client.once('connect', r));
      client.publish(
        'voltguard/device/restart/telemetry',
        JSON.stringify({
          deviceId: 'restart',
          voltage: 230,
          current: 1,
          temperature: 30,
        }),
      );
      await until(
        async () =>
          (await api('/api/latest?deviceId=restart'))?.voltage === 230,
      );
      await stopBroker();
      await until(async () => !(await api('/api/health')).mqttConnected);
      assert.equal((await api('/api/health')).status, 'ok');
      await startBroker();
      await until(async () => (await api('/api/health')).mqttConnected);
      await stopServer();
      startServer();
      await until(async () => (await api('/api/health')).mqttConnected);
      assert.equal((await api('/api/latest?deviceId=restart')).voltage, 230);
      await until(() => client.connected);
      client.publish(
        'voltguard/device/restart/telemetry',
        JSON.stringify({
          deviceId: 'restart',
          voltage: 270,
          current: 1,
          temperature: 30,
        }),
      );
      await until(async () =>
        (await api('/api/alerts?deviceId=restart')).some(
          (a) => a.code === 'OVERVOLTAGE',
        ),
      );
    } finally {
      client?.end(true);
      if (child?.exitCode === null) await stopServer();
      if (broker && !broker.closed) await stopBroker();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
