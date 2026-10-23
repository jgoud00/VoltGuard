import { config, thresholds } from './config.js';
export {
  PROFILES,
  MODES,
  topic,
  validateTelemetry,
  validDevice,
} from '../../shared/telemetry.js';
export function evaluateAlerts(sample) {
  const result = [];
  const add = (code, value, threshold, message, severity = 'CRITICAL') =>
    result.push({ code, type: code, value, threshold, message, severity });
  const vt = thresholds[sample.batteryProfile]?.voltage || thresholds.AC230.voltage;
  if (sample.voltage !== null && sample.voltage > vt.high)
    add('OVERVOLTAGE', sample.voltage, vt.high, 'Voltage exceeds configured limit');
  if (sample.voltage !== null && sample.voltage < vt.low)
    add('UNDERVOLTAGE', sample.voltage, vt.low, 'Voltage below configured limit');
  if (Math.abs(sample.current) > thresholds.current.high)
    add('OVERCURRENT', sample.current, thresholds.current.high, 'Current exceeds configured limit');
  if (sample.temperature > thresholds.temperature.high)
    add('HIGH_TEMPERATURE', sample.temperature, thresholds.temperature.high, 'Temperature exceeds configured limit');
  if (sample.batteryProfile !== 'AC230') {
    if (sample.soc !== null && sample.soc < thresholds.soc.low)
      add('LOW_BATTERY', sample.soc, thresholds.soc.low, 'State of charge below 20%');
    if (sample.soh !== null && sample.soh < thresholds.soh.low)
      add('POOR_HEALTH', sample.soh, thresholds.soh.low, 'Demonstration health index below 60%', 'WARNING');
  }
  return result;
}
