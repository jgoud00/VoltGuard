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
  currentHigh: number('CURRENT_HIGH', 10),
  batteryHigh6: number('VOLTAGE_HIGH_6V', 7.5),
  batteryLow6: number('VOLTAGE_LOW_6V', 5.5),
  batteryHigh12: number('VOLTAGE_HIGH_12V', 15),
  batteryLow12: number('VOLTAGE_LOW_12V', 11),
  socLow: number('SOC_LOW', 20),
  sohLow: number('SOH_LOW', 60),
  temperatureHigh: number('TEMPERATURE_HIGH', 50),
  voltageHigh: number('VOLTAGE_HIGH', 250),
  voltageLow: number('VOLTAGE_LOW', 210),
};
if (config.voltageLow >= config.voltageHigh)
  throw new Error('VOLTAGE_LOW must be below VOLTAGE_HIGH');
