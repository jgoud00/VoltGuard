import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNominalEnergy } from '../src/nominalEnergy.js';
import { validateTelemetry } from '../../shared/telemetry.js';

const point = (time, current = 0.5) => ({
  deviceId: 'test',
  batteryProfile: 'LI_ION_2S',
  timestamp: time,
  receivedAt: time,
  voltage: 8,
  current,
  temperature: 30,
  soc: null,
  soh: null,
  internalResistance: null,
  quality: {
    voltage: 'averaged_unverified',
    current: current === null ? 'uncalibrated' : 'calibrated_limited',
    temperature: 'measured',
  },
});
test('nominal energy integrates discharge, survives persisted data, and excludes gaps and missing current', () => {
  const first = point('2026-01-01T00:00:00Z');
  deriveNominalEnergy(first);
  assert.equal(first.power, 4);
  assert.equal(first.energy, 0);
  const second = point('2026-01-01T00:00:01Z');
  deriveNominalEnergy(second, JSON.parse(JSON.stringify(first)));
  assert.equal(second.energy, 4 / 3600000);
  assert.equal(validateTelemetry(second).power, 4);
  assert.equal(
    validateTelemetry(second).quality.energy,
    'nominal_discharge_partial',
  );
  const gap = point('2026-01-01T00:01:00Z');
  deriveNominalEnergy(gap, second);
  assert.equal(gap.energy, second.energy);
  const missing = point('2026-01-01T00:01:01Z', null);
  deriveNominalEnergy(missing, gap);
  assert.equal(missing.power, null);
  assert.equal(missing.energy, gap.energy);
  const charging = point('2026-01-01T00:01:02Z', -0.5);
  deriveNominalEnergy(charging, missing);
  assert.equal(charging.power, -4);
  assert.equal(charging.energy, gap.energy);
  assert.equal(validateTelemetry(charging).power, -4);
});
