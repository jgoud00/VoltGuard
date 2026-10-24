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
export const validSimulation = (mode, profile) =>
  MODES.includes(mode) &&
  PROFILES.includes(profile) &&
  profile !== 'LI_ION_2S' &&
  !(profile === 'AC230' && mode === 'CHARGING');

const RANGES = {
  voltage: {
    AC230: [0, 500],
    '6V': [0, 20],
    '12V': [0, 20],
    LI_ION_2S: [0, 20],
  },
  current: {
    AC230: [0, 100],
    '6V': [-100, 100],
    '12V': [-100, 100],
    LI_ION_2S: [-100, 100],
  },
  temperature: [-40, 125],
};

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

  const lithium = batteryProfile === 'LI_ION_2S';
  const result = {
    deviceId: value.deviceId,
    timestamp: new Date(timestamp).toISOString(),
    batteryProfile,
  };

  // voltage, current, temperature - accept null or finite number in range
  for (const key of ['voltage', 'current', 'temperature']) {
    const v = value[key];
    if (v === null) {
      result[key] = null;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw new Error(`Invalid ${key}`);
    const [min, max] =
      key === 'voltage' || key === 'current'
        ? RANGES[key][batteryProfile]
        : RANGES[key];
    if (v < min || v > max) throw new Error(`Invalid ${key}`);
    result[key] = v;
  }

  // soc, soh, internalResistance - for LI_ION_2S must remain unknown; for others optional
  for (const key of ['soc', 'soh', 'internalResistance']) {
    const v = value[key];
    if (lithium && v !== undefined && v !== null)
      throw new Error(`LI_ION_2S ${key} must remain unknown`);
    if (v === undefined || v === null) {
      result[key] = null;
      continue;
    }
    if (
      !Number.isFinite(v) ||
      v < 0 ||
      (key !== 'internalResistance' && v > 100)
    )
      throw new Error(`Invalid ${key}`);
    result[key] = v;
  }

  // power, energy - for LI_ION_2S must be derived (not explicitly provided without quality); for others derived if not provided
  for (const key of ['power', 'energy']) {
    const v = value[key];
    const qualityMarker =
      key === 'power' ? 'nominal_noise_limited' : 'nominal_discharge_partial';
    // Allow if: not provided (undefined), explicitly null, or has correct quality marker
    if (
      lithium &&
      v !== undefined &&
      v !== null &&
      value.quality?.[key] !== qualityMarker
    )
      throw new Error(`LI_ION_2S ${key} must remain unknown`);
    if (v === undefined) {
      if (key === 'power') {
        if (result.voltage !== null && result.current !== null) {
          result.power = lithium
            ? result.voltage * result.current
            : Math.abs(result.voltage * result.current);
        } else {
          result.power = null;
        }
      } else {
        result.energy = 0;
      }
    } else if (v === null) {
      result[key] = null;
    } else if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      (key === 'energy' && v < 0)
    ) {
      throw new Error(`Invalid ${key}`);
    } else {
      // Validate power matches V*I (PF=1)
      if (
        key === 'power' &&
        result.voltage !== null &&
        result.current !== null
      ) {
        const expected = lithium
          ? result.voltage * result.current
          : Math.abs(result.voltage * result.current);
        if (Math.abs(v - expected) > Math.max(1, Math.abs(expected) * 0.02))
          throw new Error('Power must use PF=1');
      }
      result[key] = v;
    }
  }

  // Quality validation: if quality claims measured but value is null, reject
  const measuredQualities = [
    'measured',
    'calibrated_limited',
    'averaged_unverified',
  ];
  for (const key of ['voltage', 'current', 'temperature']) {
    const q = value.quality?.[key];
    if (measuredQualities.includes(q) && result[key] === null)
      throw new Error(`Unavailable ${key} cannot be marked measured`);
  }

  // LI_ION_2S: current requires calibrated_limited quality if present
  if (
    lithium &&
    result.current !== null &&
    value.quality?.current !== 'calibrated_limited'
  )
    throw new Error('LI_ION_2S current requires explicit calibration quality');

  // Quality markers for lithium nominal estimates
  const quality = { ...value.quality };
  if (lithium) {
    if (result.power !== null) quality.power = 'nominal_noise_limited';
    if (result.energy !== null) quality.energy = 'nominal_discharge_partial';
  }

  result.source = value.source === 'simulation' ? 'simulation' : 'device';
  result.quality = quality;
  result.status = [result.voltage, result.current, result.temperature].some(
    (v) => v === null,
  )
    ? 'partial'
    : lithium
      ? 'limited'
      : result.current < 0
        ? 'charging'
        : 'healthy';

  return result;
}
