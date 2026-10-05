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
    color: '#296653',
    note: 'Terminal voltage',
  },
  {
    key: 'current',
    title: 'Current',
    unit: 'A',
    digits: 2,
    color: '#786043',
    note: 'Positive = discharge',
  },
  {
    key: 'power',
    title: 'Power',
    unit: 'W',
    digits: 2,
    color: '#496783',
    note: 'PF = 1 assumption',
  },
  {
    key: 'temperature',
    title: 'Temperature',
    unit: '°C',
    digits: 1,
    color: '#a8694d',
    note: 'Probe reading',
  },
  {
    key: 'soc',
    title: 'State of charge',
    unit: '%',
    digits: 1,
    color: '#296653',
    note: 'Illustrative battery estimate',
  },
  {
    key: 'soh',
    title: 'Health index',
    unit: '%',
    digits: 1,
    color: '#686d7e',
    note: 'Illustrative health estimate',
  },
];
