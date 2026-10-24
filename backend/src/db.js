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
export let dbHealthy = true;
const trackHealth =
  (operation) =>
  async (...args) => {
    try {
      const result = await operation(...args);
      dbHealthy = true;
      return result;
    } catch (error) {
      dbHealthy = false;
      throw error;
    }
  };
export const latest = trackHealth(store.latest);
export const history = trackHealth(store.history);
export const alerts = trackHealth(store.alerts);
export const saveTelemetry = trackHealth(store.saveTelemetry);
export const saveAlert = trackHealth(store.saveAlert);
export const resolveAlert = trackHealth(store.resolveAlert);
export const transaction = trackHealth(store.transaction);
