import { spawn } from 'node:child_process';
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await delay(100);
  }
  throw new Error('Condition timed out');
}
export async function stack(port = 3301, mqttPort = 18883, overrides = {}) {
  const env = {
    ...process.env,
    PORT: String(port),
    MQTT_PORT: String(mqttPort),
    MQTT_URL: `mqtt://127.0.0.1:${mqttPort}`,
    API_URL: `http://127.0.0.1:${port}`,
    DB_PATH: ':memory:',
    DATABASE_DRIVER: 'sqlite',
    HOST: '127.0.0.1',
    MQTT_HOST: '127.0.0.1',
    MQTT_USERNAME: '',
    MQTT_PASSWORD: '',
    EMBEDDED_BROKER: 'true',
    SIMULATION_ENABLED: 'true',
    SIMULATOR_TOKEN: '',
    BATTERY_PROFILE: '12V',
    DEVICE_OFFLINE_MS: '1000',
    ...overrides,
  };
  const processes = [];
  const start = (file, args = []) => {
    const p = spawn(process.execPath, [file, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.on('data', () => {});
    p.stderr.on('data', (b) => {
      if (process.env.DEBUG_TEST) process.stderr.write(b);
    });
    processes.push(p);
    return p;
  };
  start('backend/src/server.js');
  const api = env.API_URL;
  const json = async (path, options) => {
    const r = await fetch(api + path, options);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  await until(async () => (await json('/api/health')).mqttConnected);
  return {
    env,
    api,
    json,
    start,
    async stop() {
      for (const p of processes) {
        if (p.exitCode === null) p.kill('SIGTERM');
      }
      await Promise.all(
        processes.map((p) =>
          p.exitCode === null ? new Promise((r) => p.once('exit', r)) : null,
        ),
      );
    },
  };
}
