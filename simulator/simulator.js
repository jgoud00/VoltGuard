import dotenv from 'dotenv';
import mqtt from 'mqtt';
import { fileURLToPath } from 'node:url';
import { profiles, ocvFromSoc } from '../shared/battery.js';
import {
  MODES,
  PROFILES,
  topic,
  validDevice,
  validateTelemetry,
} from '../shared/telemetry.js';
dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
const args = process.argv.slice(2),
  option = (name, fallback) => {
    const i = args.indexOf('--' + name);
    return i < 0 ? fallback : args[i + 1];
  };
const explicit = option(
  'scenario',
  args[0] && !args[0].startsWith('--') ? args[0] : null,
);
let mode = (explicit || process.env.SIM_MODE || 'NORMAL')
    .toUpperCase()
    .replaceAll('-', '_'),
  profile = option('profile', process.env.BATTERY_PROFILE || '12V');
const rate = Number(option('rate', 1)),
  duration = Number(option('duration', 0)),
  deviceId = option('device', process.env.DEVICE_ID || 'voltguard-01'),
  transport = option('transport', 'mqtt');
if (
  !MODES.includes(mode) ||
  !PROFILES.includes(profile) ||
  !validDevice(deviceId) ||
  !Number.isFinite(rate) ||
  rate <= 0 ||
  rate > 100 ||
  !Number.isFinite(duration) ||
  duration < 0 ||
  !['mqtt', 'http'].includes(transport)
)
  throw new Error('Invalid simulator options');
const api = process.env.API_URL || 'http://localhost:3001',
  headers = {
    'Content-Type': 'application/json',
    ...(process.env.SIMULATOR_TOKEN
      ? { Authorization: `Bearer ${process.env.SIMULATOR_TOKEN}` }
      : {}),
  };
const client =
  transport === 'mqtt'
    ? mqtt.connect(process.env.MQTT_URL || 'mqtt://127.0.0.1:1883', {
        reconnectPeriod: 1000,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        queueQoSZero: false,
      })
    : null;
client?.on('connect', () => console.log('[SIMULATOR] MQTT connected'));
client?.on('error', (e) => console.warn('[SIMULATOR]', e.code || 'MQTT error'));
let phase = 0,
  energy = 0,
  previous = Date.now(),
  stopping = false,
  timer;
async function tick() {
  if (!explicit)
    try {
      const r = await fetch(api + '/api/simulator/config', {
        headers,
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) {
        const c = await r.json();
        if (MODES.includes(c.mode)) mode = c.mode;
        if (PROFILES.includes(c.profile)) profile = c.profile;
      }
    } catch {}
  const now = Date.now(),
    elapsed = (now - previous) / 3600000;
  previous = now;
  phase += 0.16;
  if (mode === 'DEVICE_OFFLINE') return;
  let current = mode === 'CHARGING' ? -3.2 : 1.2 + Math.sin(phase) * 0.15,
    temperature = ['HIGH_TEMPERATURE', 'OVERTEMPERATURE'].includes(mode)
      ? 55
      : 29 + Math.sin(phase) * 0.5;
  const soc = mode === 'LOW_BATTERY' ? 15 : 84,
    soh = mode === 'DEGRADED_BATTERY' ? 52 : 92,
    p = profiles[profile],
    resistance = p
      ? Number(process.env['R_FRESH_' + profile] || p.rFresh) +
        (1 - soh / 100) *
          (Number(process.env['R_EOL_' + profile] || p.rEol) -
            Number(process.env['R_FRESH_' + profile] || p.rFresh))
      : 0;
  let voltage = p
    ? ocvFromSoc(soc, profile) - current * resistance
    : 230 + Math.sin(phase) * 3;
  if (mode === 'OVERVOLTAGE')
    voltage = profile === 'AC230' ? 270 : profile === '6V' ? 8 : 16;
  if (mode === 'UNDERVOLTAGE')
    voltage = profile === 'AC230' ? 190 : profile === '6V' ? 5 : 10;
  if (mode === 'OVERCURRENT') current = 15;
  if (mode === 'UNSTABLE')
    voltage =
      profile === 'AC230'
        ? 230 + Math.sin(phase * 4) * 45
        : voltage + Math.sin(phase * 4) * 2;
  voltage = Number(voltage.toFixed(2));
  current = Number(current.toFixed(2));
  const power = Number(Math.abs(voltage * current).toFixed(2));
  energy += (power * elapsed) / 1000;
  const sample = validateTelemetry({
    deviceId,
    timestamp: new Date().toISOString(),
    batteryProfile: profile,
    voltage,
    current,
    power,
    energy,
    temperature,
    soc,
    soh,
    internalResistance: resistance,
    source: 'simulation',
  });
  if (client?.connected)
    client.publish(topic(deviceId), JSON.stringify(sample), { qos: 1 });
  if (transport === 'http')
    try {
      const r = await fetch(api + '/api/simulator/telemetry', {
        method: 'POST',
        headers,
        body: JSON.stringify(sample),
        signal: AbortSignal.timeout(1000),
      });
      if (!r.ok) console.warn('[SIMULATOR] HTTP rejected', r.status);
    } catch {
      console.warn('[SIMULATOR] Backend unavailable');
    }
}
async function loop() {
  if (stopping) return;
  await tick();
  if (!stopping) timer = setTimeout(loop, 1000 / rate);
}
loop();
function stop() {
  stopping = true;
  clearTimeout(timer);
  client?.end(true);
}
if (duration) setTimeout(stop, duration * 1000);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
console.log(`[SIMULATOR] ${mode} ${profile} ${transport}; ${rate} samples/s`);
