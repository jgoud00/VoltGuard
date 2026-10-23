import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

test('firmware config generates default/custom MQTT ports and rejects unsupported transport', () => {
  // Run a fixture copy so real credentials and the generated header stay untouched.
  const root = mkdtempSync(join(tmpdir(), 'voltguard-firmware-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'firmware/voltguard_esp32'), { recursive: true });
    const script = readFileSync(
      'scripts/generate-firmware-secrets.js',
      'utf8',
    ).replace(
      "from 'dotenv'",
      `from '${pathToFileURL(join(process.cwd(), 'node_modules/dotenv/lib/main.js')).href}'`,
    );
    writeFileSync(join(root, 'scripts/generate-firmware-secrets.mjs'), script);
    for (const [url, port] of [
      ['mqtt://localhost', 1883],
      ['mqtt://localhost:18890', 18890],
    ]) {
      writeFileSync(
        join(root, '.env'),
        `WIFI_SSID=test\nWIFI_PASSWORD=test\nMQTT_USERNAME=test\nMQTT_PASSWORD=test\nMQTT_URL=${url}\n`,
      );
      execFileSync(process.execPath, [
        join(root, 'scripts/generate-firmware-secrets.mjs'),
      ]);
      assert.match(
        readFileSync(join(root, 'firmware/voltguard_esp32/secrets.h'), 'utf8'),
        new RegExp(`MQTT_PORT = ${port};`),
      );
    }
    writeFileSync(
      join(root, '.env'),
      'WIFI_SSID=test\nWIFI_PASSWORD=test\nMQTT_USERNAME=test\nMQTT_PASSWORD=test\nMQTT_URL=mqtts://localhost\n',
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [join(root, 'scripts/generate-firmware-secrets.mjs')],
        { stdio: 'pipe' },
      ),
    );
    assert.match(
      readFileSync('firmware/voltguard_esp32/voltguard_esp32.ino', 'utf8'),
      /mqtt\.setServer\(MQTT_HOST_ADDRESS, MQTT_PORT\)/,
    );
    execFileSync('git', [
      'check-ignore',
      'firmware/build-mqtt-fix/sketch_aug26a.ino.bin',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
