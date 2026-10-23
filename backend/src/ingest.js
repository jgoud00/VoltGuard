import { deriveNominalEnergy } from './nominalEnergy.js';
import {
  latest,
  alerts,
  saveTelemetry,
  saveAlert,
  resolveAlert,
  transaction,
} from './db.js';
import { evaluateAlerts, validateTelemetry } from './contract.js';

let count = 0;
let rejected = 0;
let duplicates = 0;
let dbHealthy = true;

function incrementRejected() { rejected++; }
function getRejected() { return rejected; }

let ingestion = Promise.resolve();
const ingest = (raw) => {
  const result = ingestion.then(() => ingestSerial(raw));
  ingestion = result.catch(() => {});
  return result;
};

const alertMeasurement = {
  OVERVOLTAGE: 'voltage',
  UNDERVOLTAGE: 'voltage',
  OVERCURRENT: 'current',
  HIGH_TEMPERATURE: 'temperature',
  LOW_BATTERY: 'soc',
  POOR_HEALTH: 'soh',
};

const ingestSerial = async (raw) => {
  const s = validateTelemetry(raw);
  s.receivedAt = new Date().toISOString();
  const previous = await latest(s.deviceId);
  if (previous && Date.parse(s.timestamp) <= Date.parse(previous.timestamp)) {
    duplicates++;
    return null;
  }
  deriveNominalEnergy(s, previous);
  const candidates = evaluateAlerts(s);
  s.status = candidates.some((a) => a.severity === 'CRITICAL')
    ? 'critical'
    : candidates.length
      ? 'warning'
      : s.status;
  const events = [];
  await transaction(async () => {
    events.length = 0;
    s.id = Number(await saveTelemetry(s));
    const active = (await alerts(s.deviceId, 5000)).filter((a) => a.active);
    for (const a of candidates)
      if (!active.some((old) => old.code === a.code)) {
        const event = {
          ...a,
          deviceId: s.deviceId,
          timestamp: s.receivedAt,
          active: true,
        };
        event.id = Number(await saveAlert(event));
        events.push({ type: 'alert', data: event });
      }
    for (const a of active)
      if (
        !candidates.some((c) => c.code === a.code) &&
        (!alertMeasurement[a.code] || Number.isFinite(s[alertMeasurement[a.code]]))
      ) {
        await resolveAlert(a.id, s.receivedAt);
        events.push({
          type: 'alert',
          data: { ...a, active: false, resolvedAt: s.receivedAt },
        });
      }
  });
  dbHealthy = true;
  count++;
  return { sample: s, events };
};

function getIngestion() { return ingestion; }
export { ingest, count, getRejected, duplicates, dbHealthy, getIngestion, incrementRejected };