// Display-only formatting and demo values. Never sent to MQTT or persistence.
const demoStarted = Date.now() - 120000;

export const fmt = (value, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : '—';

export const time = (stamp) =>
  stamp
    ? new Date(stamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '—';

export const profiles = {
  LI_ION_2S: '2-cell lithium-ion',
  '6V': '6 V lead-acid',
  '12V': '12 V lead-acid',
  AC230: '230 V electrical',
};

export const scenarios = {
  NORMAL: 'Normal operation',
  LOW_BATTERY: 'Low battery',
  HIGH_TEMPERATURE: 'High temperature',
  DEGRADED_BATTERY: 'Degraded battery',
  CHARGING: 'Charging',
  OVERVOLTAGE: 'Overvoltage',
  UNDERVOLTAGE: 'Undervoltage',
  OVERCURRENT: 'Overcurrent',
  OVERTEMPERATURE: 'Overtemperature',
  UNSTABLE: 'Unstable signal',
  DEVICE_OFFLINE: 'Device offline',
};

export const signals = [
  {
    key: 'voltage',
    title: 'Voltage',
    unit: 'V',
    digits: 2,
    color: '#087e83',
    note: 'Terminal voltage',
  },
  {
    key: 'current',
    title: 'Current',
    unit: 'A',
    digits: 2,
    color: '#426bc0',
    note: 'Positive = discharge',
  },
  {
    key: 'power',
    title: 'Power',
    unit: 'W',
    digits: 2,
    color: '#a36b38',
    note: 'Derived from voltage and current',
  },
  {
    key: 'temperature',
    title: 'Temperature',
    unit: '°C',
    digits: 1,
    color: '#9760a0',
    note: 'Probe reading',
  },
  {
    key: 'soc',
    title: 'State of charge',
    unit: '%',
    digits: 1,
    color: '#087e83',
    note: 'State of charge · battery model required',
  },
  {
    key: 'soh',
    title: 'Battery health (SOH)',
    unit: '%',
    digits: 1,
    color: '#5c728e',
    note: 'State of health · capacity assessment required',
  },
];

export function measurementNote(sample, key) {
  if (sample?.demoFields?.includes(key)) return 'Demo value · not measured';
  if (
    ['power', 'energy'].includes(key) &&
    sample?.quality?.current === 'calibrated_limited'
  )
    return key === 'energy'
      ? 'Stored discharge estimate · gaps excluded'
      : 'V × nominal I · noise-limited';
  if (key === 'current' && sample?.quality?.current === 'calibrated_limited')
    return 'Nominal current · noise-limited';
  if (!sample) return 'Awaiting data';
  if (
    key === 'energy' &&
    sample.quality?.energy === 'nominal_discharge_partial'
  )
    return 'Stored discharge estimate · gaps excluded';
  if (['soc', 'soh'].includes(key) && !Number.isFinite(sample[key]))
    return 'Unavailable · battery characterization required';
  if (key === 'current' && sample.quality?.current === 'uncalibrated')
    return 'Unavailable · calibration required';
  if (key === 'current' && sample.quality?.current === 'below_resolution')
    return 'Unavailable · below reliable resolution';
  if (key === 'temperature' && sample.quality?.temperature === 'disconnected')
    return 'Unavailable · probe disconnected';
  if (!Number.isFinite(sample[key])) return 'Unavailable · not measured';
  if (sample.quality?.[key] === 'calibrated_limited')
    return 'Nominal sensitivity · small currents unreliable';
  if (sample.quality?.[key] === 'averaged_unverified')
    return 'Averaged ADC · accuracy unverified';
  return 'Latest reading';
}

export function withDemoValues(sample, displayTime = Date.now()) {
  const seconds = displayTime / 1000;
  const elapsed = Math.max(0, (displayTime - demoStarted) / 1000);
  const voltage = Number.isFinite(sample?.voltage)
    ? sample.voltage
    : 8.14 + 0.025 * Math.sin(seconds / 15);
  const current = Number.isFinite(sample?.current)
    ? sample.current
    : 0.1 + 0.025 * Math.sin(seconds / 9) + 0.01 * Math.sin(seconds / 3);
  const examples = {
    voltage,
    current,
    power: voltage * current,
    temperature: 30 + 0.4 * Math.sin(seconds / 18),
    energy: 0.001 + (0.814 * elapsed) / 3600000,
    soc: Math.max(0, 90 - elapsed / 600),
    soh: 95 + 0.15 * Math.sin(seconds / 20),
  };
  const result = { ...sample, demoFields: [] };
  for (const [key, value] of Object.entries(examples)) {
    if (!Number.isFinite(sample?.[key])) {
      result[key] = value;
      result.demoFields.push(key);
    }
  }
  return result;
}
