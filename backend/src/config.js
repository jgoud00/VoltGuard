import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
const number = (key, fallback, min = 0) => {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(value) || value < min)
    throw new Error(`Invalid configuration: ${key}`);
  return value;
};
export const thresholds = {
  AC230: { voltage: { high: number('VOLTAGE_HIGH', 250), low: number('VOLTAGE_LOW', 210) } },
  '6V': { voltage: { high: number('VOLTAGE_HIGH_6V', 7.5), low: number('VOLTAGE_LOW_6V', 5.5) } },
  '12V': { voltage: { high: number('VOLTAGE_HIGH_12V', 15), low: number('VOLTAGE_LOW_12V', 11) } },
  LI_ION_2S: { voltage: { high: number('VOLTAGE_HIGH_LI_ION_2S', 8.4), low: number('VOLTAGE_LOW_LI_ION_2S', 6) } },
  current: { high: number('CURRENT_HIGH', 10) },
  temperature: { high: number('TEMPERATURE_HIGH', 50) },
  soc: { low: number('SOC_LOW', 20) },
  soh: { low: number('SOH_LOW', 60) },
};
export const config = {
  port: number('PORT', 3001),
  host: process.env.HOST || '127.0.0.1',
  mqttUrl: process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
  mqttPort: number('MQTT_PORT', 1883),
  mqttHost: process.env.MQTT_HOST || '127.0.0.1',
  embedded: process.env.EMBEDDED_BROKER !== 'false',
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  simulation: process.env.SIMULATION_ENABLED !== 'false',
  token: process.env.SIMULATOR_TOKEN,
  origins: (
    process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
  ).split(','),
  staleMs: number('DEVICE_OFFLINE_MS', 5000, 100),
};
if (thresholds.AC230.voltage.low >= thresholds.AC230.voltage.high)
  throw new Error('VOLTAGE_LOW must be below VOLTAGE_HIGH');
