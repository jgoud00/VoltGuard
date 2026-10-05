export const PROFILES = ['6V', '12V', 'AC230'];
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
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      value[key] < min ||
      value[key] > max
    )
      throw new Error(`Invalid ${key}`);
    result[key] = value[key];
  }
  for (const [key, max] of Object.entries({
    soc: 100,
    soh: 100,
    internalResistance: 2,
    energy: 1e9,
    power: 50000,
  })) {
    if (
      batteryProfile !== 'AC230' &&
      ['soc', 'soh', 'internalResistance'].includes(key) &&
      value[key] === undefined
    )
      throw new Error('Missing battery estimate: ' + key);
    const number =
      value[key] === undefined
        ? key === 'power'
          ? Math.abs(result.voltage * result.current)
          : 0
        : value[key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < 0 ||
      number > max
    )
      throw new Error(`Invalid ${key}`);
    result[key] = number;
  }
  if (
    Math.abs(result.power - Math.abs(result.voltage * result.current)) >
    Math.max(1, result.power * 0.02)
  )
    throw new Error('Power must use PF=1');
  result.source = value.source === 'simulation' ? 'simulation' : 'device';
  result.status = result.current < 0 ? 'charging' : 'healthy';
  return result;
}
