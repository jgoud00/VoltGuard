import './config.js';
if (
  process.env.DATABASE_DRIVER &&
  !['sqlite', 'mongodb'].includes(process.env.DATABASE_DRIVER)
)
  throw new Error('DATABASE_DRIVER must be mongodb or sqlite');
const sqlite = process.env.DATABASE_DRIVER === 'sqlite';
const store = await import(sqlite ? './sqlite.js' : './mongo.js');
export const databaseDriver = sqlite ? 'sqlite' : 'mongodb';
export const db = store.db;
export const latest = store.latest;
export const history = store.history;
export const alerts = store.alerts;
export const saveTelemetry = store.saveTelemetry;
export const saveAlert = store.saveAlert;
export const resolveAlert = store.resolveAlert;
export const transaction = store.transaction;
