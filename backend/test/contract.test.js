import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTelemetry } from '../../shared/telemetry.js';
import { validSimulation } from '../../shared/telemetry.js';
import { evaluateAlerts } from '../src/contract.js';
const base = {
  deviceId: 'test',
  voltage: 230,
  current: 1,
  temperature: 30,
  power: 230,
  energy: 0,
};
test('canonical telemetry and server timestamp', () => {
  const s = validateTelemetry({
    ...base,
    arbitrary: 'removed',
    status: 'critical',
  });
  assert.equal(s.status, 'healthy');
  assert.ok(s.timestamp);
  assert.equal(s.arbitrary, undefined);
});
for (const [name, change] of Object.entries({
  missingVoltage: { voltage: undefined },
  missingCurrent: { current: undefined },
  negative: { voltage: -1 },
  nan: { current: NaN },
  infinity: { temperature: Infinity },
  wrongType: { voltage: '230' },
  invalidPower: { power: 10 },
  invalidEnergy: { energy: -1 },
}))
  test(`reject ${name}`, () =>
    assert.throws(() => validateTelemetry({ ...base, ...change })));
test('normal has no alerts', () =>
  assert.deepEqual(evaluateAlerts(validateTelemetry(base)), []));
for (const [code, change] of Object.entries({
  OVERVOLTAGE: { voltage: 270, power: 270 },
  UNDERVOLTAGE: { voltage: 190, power: 190 },
  OVERCURRENT: { current: 15, power: 3450 },
  HIGH_TEMPERATURE: { temperature: 55 },
}))
  test(`detect ${code}`, () =>
    assert.ok(
      evaluateAlerts(validateTelemetry({ ...base, ...change })).some(
        (a) => a.code === code && Number.isFinite(a.threshold),
      ),
    ));

test('battery fields enforce physical bounds and preserve unknown values', () => {
  const battery = { ...base, batteryProfile: '12V', voltage: 12, power: 12 };
  for (const key of ['soc', 'soh', 'internalResistance']) {
    for (const value of [-1, Infinity, NaN, '50'])
      assert.throws(() => validateTelemetry({ ...battery, [key]: value }));
    for (const value of [undefined, null])
      assert.equal(validateTelemetry({ ...battery, [key]: value })[key], null);
    assert.equal(validateTelemetry({ ...battery, [key]: 0 })[key], 0);
  }
  for (const key of ['soc', 'soh']) {
    assert.throws(() => validateTelemetry({ ...battery, [key]: 101 }));
    assert.equal(validateTelemetry({ ...battery, [key]: 100 })[key], 100);
  }
});

test('charging is supported only by simulated battery profiles', () => {
  assert.equal(validSimulation('CHARGING', 'AC230'), false);
  assert.equal(validSimulation('CHARGING', 'LI_ION_2S'), false);
  assert.equal(validSimulation('CHARGING', '12V'), true);
  assert.equal(validSimulation('CHARGING', '6V'), true);
});
