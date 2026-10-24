import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('CLI rejects AC230 charging before opening MQTT or publishing', () => {
  const result = spawnSync(
    process.execPath,
    ['simulator/simulator.js', '--scenario', 'charging', '--profile', 'AC230'],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid simulator options/);
  assert.doesNotMatch(result.stderr, /Invalid current/);
  assert.equal(result.stdout, '');
});
