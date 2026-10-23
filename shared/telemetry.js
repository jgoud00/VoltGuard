export const PROFILES = ['6V', '12V', 'AC230', 'LI_ION_2S'];
export const MODES = [
  'NORMAL',
  'LOW_BATTERY',
  'HIGH_TEMPERATURE',
  'DEGRADED_BATTERY',
  'CHARGING',
  'OVERVOLTAGE',
  'UNDERVOLTAGE',
  'OVERCURRENT',
  'OVERTEMPERATURE',
  'UNSTABLE',
  'DEVICE_OFFLINE',
];
export const topic = (id) => `voltguard/device/${id}/telemetry`;
export const validDevice = (id) =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
export function validateTelemetry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected JSON object');
  if (!validDevice(value.deviceId)) throw new Error('Invalid deviceId');
  const batteryProfile =
    value.batteryProfile === undefined ? 'AC230' : value.batteryProfile;
  if (!PROFILES.includes(batteryProfile))
    throw new Error('Invalid batteryProfile');
  const timestamp =
    value.timestamp === undefined ? new Date().toISOString() : value.timestamp;
  if (
    typeof timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      timestamp,
    ) ||
    !Number.isFinite(Date.parse(timestamp)) ||
    Date.parse(timestamp) > Date.now() + 60000
  )
    throw new Error('Invalid timestamp');
  const ranges = {
    voltage: [0, batteryProfile === 'AC230' ? 500 : 20],
    current: [batteryProfile === 'AC230' ? 0 : -100, 100],
    temperature: [-40, 125],
  };
  const result = {
    deviceId: value.deviceId,
    timestamp: new Date(timestamp).toISOString(),
    batteryProfile,
  };
  const lithium = batteryProfile === 'LI_ION_2S';
  if (
    value.quality !== undefined &&
    (!value.quality ||
      typeof value.quality !== 'object' ||
      Array.isArray(value.quality))
  )
    throw new Error('Invalid quality object');
  const quality = {};
  const qualityOptions = {
    voltage: ['measured', 'averaged_unverified', 'unavailable'],
    current: [
      'measured',
      'uncalibrated',
      'calibrated_limited',
      'below_resolution',
      'unavailable',
    ],
    temperature: [
      'measured',
      'disconnected',
      'conversion_failed',
      'unavailable',
    ],
  };
  for (const [key, choices] of Object.entries(qualityOptions)) {
    const state = value.quality?.[key];
    if (state !== undefined && !choices.includes(state))
      throw new Error(`Invalid quality.${key}`);
    quality[key] = state || (value[key] === null ? 'unavailable' : 'measured');
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (value[key] === null) {
      if (
        quality[key] === 'measured' ||
        quality[key] === 'calibrated_limited' ||
        quality[key] === 'averaged_unverified'
      )
        throw new Error(`Unavailable ${key} cannot be marked measured`);
      result[key] = null;
      continue;
    }
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      value[key] < min ||
      value[key] > max
    )
      throw new Error(`Invalid ${key}`);
    result[key] = value[key];
    if (
      [
        'uncalibrated',
        'below_resolution',
        'disconnected',
        'conversion_failed',
        'unavailable',
      ].includes(quality[key])
    )
      throw new Error(`Invalid available ${key} quality`);
  }
  if (
    lithium &&
    result.current !== null &&
    quality.current !== 'calibrated_limited'
  )
    throw new Error('LI_ION_2S current requires explicit calibration quality');
  for (const [key, max] of Object.entries({
    soc: 100,
    soh: 100,
    internalResistance: 2,
    energy: 1e9,
    power: 50000,
  })) {
    if (
      !lithium &&
      batteryProfile !== 'AC230' &&
      ['soc', 'soh', 'internalResistance'].includes(key) &&
      value[key] === undefined
    )
      throw new Error('Missing battery estimate: ' + key);
    if (lithium && ['soc', 'soh', 'internalResistance'].includes(key)) {
      if (value[key] !== undefined && value[key] !== null)
        throw new Error(`LI_ION_2S ${key} must remain unknown`);
      result[key] = null;
      continue;
    }
    if (lithium && ['power', 'energy'].includes(key)) {
      const marker =
        key === 'power' ? 'nominal_noise_limited' : 'nominal_discharge_partial';
      if (
        value[key] !== undefined &&
        value[key] !== null &&
        value.quality?.[key] !== marker
      )
        throw new Error(`LI_ION_2S ${key} requires nominal estimate quality`);
      if (value.quality?.[key] === marker) quality[key] = marker;
      if (value[key] === undefined) {
        result[key] = null;
        continue;
      }
    }
    const number =
      value[key] === undefined
        ? key === 'power'
          ? result.voltage === null || result.current === null
            ? null
            : Math.abs(result.voltage * result.current)
          : 0
        : value[key];
    if (number === null) {
      result[key] = null;
      continue;
    }
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < (lithium && key === 'power' ? -50000 : 0) ||
      number > max
    )
      throw new Error(`Invalid ${key}`);
    result[key] = number;
  }
  if (
    result.power !== null &&
    (result.voltage === null || result.current === null)
  )
    throw new Error('Power requires available voltage and current');
  if (
    result.power !== null &&
    Math.abs(
      result.power -
        (lithium
          ? result.voltage * result.current
          : Math.abs(result.voltage * result.current)),
    ) > Math.max(1, result.power * 0.02)
  )
    throw new Error('Power must use PF=1');
  result.source = value.source === 'simulation' ? 'simulation' : 'device';
  result.quality = quality;
  result.status = Object.keys(ranges).some((key) => result[key] === null)
    ? 'partial'
    : lithium
      ? 'limited'
      : result.current < 0
        ? 'charging'
        : 'healthy';
  return result;
}
