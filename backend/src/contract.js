import { config } from './config.js';
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
  const high =
    sample.batteryProfile === 'LI_ION_2S'
      ? config.lithiumHigh2s
      : sample.batteryProfile === 'AC230'
        ? config.voltageHigh
        : sample.batteryProfile === '6V'
          ? config.batteryHigh6
          : config.batteryHigh12;
  const low =
    sample.batteryProfile === 'LI_ION_2S'
      ? config.lithiumLow2s
      : sample.batteryProfile === 'AC230'
        ? config.voltageLow
        : sample.batteryProfile === '6V'
          ? config.batteryLow6
          : config.batteryLow12;
  if (sample.voltage !== null && sample.voltage > high)
    add(
      'OVERVOLTAGE',
      sample.voltage,
      high,
      'Voltage exceeds configured limit',
    );
  if (sample.voltage !== null && sample.voltage < low)
    add('UNDERVOLTAGE', sample.voltage, low, 'Voltage below configured limit');
  if (Math.abs(sample.current) > config.currentHigh)
    add(
      'OVERCURRENT',
      sample.current,
      config.currentHigh,
      'Current exceeds configured limit',
    );
  if (sample.temperature > config.temperatureHigh)
    add(
      'HIGH_TEMPERATURE',
      sample.temperature,
      config.temperatureHigh,
      'Temperature exceeds configured limit',
    );
  if (sample.batteryProfile !== 'AC230') {
    if (sample.soc !== null && sample.soc < config.socLow)
      add(
        'LOW_BATTERY',
        sample.soc,
        config.socLow,
        'State of charge below 20%',
      );
    if (sample.soh !== null && sample.soh < config.sohLow)
      add(
        'POOR_HEALTH',
        sample.soh,
        config.sohLow,
        'Demonstration health index below 60%',
        'WARNING',
      );
  }
  return result;
}
