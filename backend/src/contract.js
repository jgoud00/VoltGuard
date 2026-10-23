import { thresholds } from './config.js';
import { evaluateAlerts as evaluateAlertsPure } from '../../shared/alerts.js';
export {
  PROFILES,
  MODES,
  topic,
  validateTelemetry,
  validDevice,
} from '../../shared/telemetry.js';
export const evaluateAlerts = (sample) => evaluateAlertsPure(sample, thresholds);
export { evaluateAlertsPure };
