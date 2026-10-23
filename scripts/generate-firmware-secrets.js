import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = new URL('../', import.meta.url);
const env = parse(readFileSync(new URL('.env', root)));
const sketchPath = process.argv[2];
if (!sketchPath && !env.WIFI_SSID)
  throw new Error(
    'Pass the local Wi-Fi sketch path (credentials are never printed).',
  );
const sketch = env.WIFI_SSID ? '' : readFileSync(sketchPath, 'utf8');
function wifiValue(name) {
  const match = sketch.match(
    new RegExp(
      `const\\s+char\\s*\\*\\s*${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`,
    ),
  );
  if (!match) throw new Error(`Missing local ${name} declaration`);
  return JSON.parse(match[1]);
}
const secrets = {
  WIFI_SSID: env.WIFI_SSID || wifiValue('WIFI_NAME'),
  WIFI_PASSWORD: env.WIFI_SSID
    ? env.WIFI_PASSWORD || ''
    : wifiValue('WIFI_PASSWORD'),
  MQTT_USERNAME: env.MQTT_USERNAME,
  MQTT_PASSWORD: env.MQTT_PASSWORD,
};
for (const [key, value] of Object.entries(secrets)) {
  if (
    !value &&
    !(key === 'WIFI_PASSWORD' && ['OWE', 'OPEN'].includes(env.WIFI_SECURITY))
  )
    throw new Error(`Missing ${key}`);
}
const destination = new URL('firmware/voltguard_esp32/secrets.h', root);
const broker = new URL(env.MQTT_URL || 'mqtt://127.0.0.1:1883');
if (broker.protocol !== 'mqtt:')
  throw new Error('Firmware requires an mqtt:// broker URL');
const mqttPort = Number(broker.port || 1883);
if (!Number.isInteger(mqttPort) || mqttPort < 1 || mqttPort > 65535)
  throw new Error('Invalid MQTT port');
secrets.MQTT_HOST_ADDRESS = broker.hostname;
writeFileSync(
  destination,
  '#pragma once\n' +
    Object.entries(secrets)
      .map(
        ([key, value]) =>
          `static const char* ${key} = ${JSON.stringify(value)};`,
      )
      .join('\n') +
    `\nstatic const unsigned short MQTT_PORT = ${mqttPort};\n` +
    `static const bool WIFI_USE_OWE = ${env.WIFI_SECURITY === 'OWE'};\n`,
);
console.log(
  `Generated ignored firmware credentials at ${fileURLToPath(destination)} (values hidden).`,
);
