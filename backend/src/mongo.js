import { MongoClient } from 'mongodb';
import { AsyncLocalStorage } from 'node:async_hooks';

const client = new MongoClient(
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=voltguard',
  { serverSelectionTimeoutMS: 10000 },
);
await client.connect();
export const mongo = client.db(process.env.MONGODB_DATABASE || 'voltguard');
const context = new AsyncLocalStorage();
const options = () =>
  context.getStore() ? { session: context.getStore() } : {};
await Promise.all([
  mongo.collection('telemetry').createIndex({ id: 1 }, { unique: true }),
  mongo.collection('telemetry').createIndex({ deviceId: 1, id: -1 }),
  mongo.collection('telemetry').createIndex({ deviceId: 1, timestamp: 1 }),
  mongo.collection('alerts').createIndex({ id: 1 }, { unique: true }),
  mongo.collection('alerts').createIndex({ deviceId: 1, id: -1 }),
]);
export const db = { close: () => client.close() };
export async function transaction(callback) {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => context.run(session, callback));
  } finally {
    await session.endSession();
  }
}
async function nextId(name) {
  const result = await mongo
    .collection('counters')
    .findOneAndUpdate(
      { _id: name },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after', ...options() },
    );
  return result.value;
}
export async function saveTelemetry(sample) {
  const id = await nextId('telemetry');
  await mongo.collection('telemetry').insertOne({ ...sample, id }, options());
  return id;
}
export async function saveAlert(alert) {
  const id = await nextId('alerts');
  await mongo
    .collection('alerts')
    .insertOne({ ...alert, id, type: alert.code }, options());
  return id;
}
export async function resolveAlert(id, timestamp) {
  await mongo
    .collection('alerts')
    .updateOne(
      { id },
      { $set: { active: false, resolvedAt: timestamp } },
      options(),
    );
}
export async function latest(deviceId) {
  return mongo
    .collection('telemetry')
    .findOne(
      { deviceId },
      { sort: { id: -1 }, projection: { _id: 0 }, ...options() },
    );
}
export async function history(deviceId, limit, from, to) {
  const query = { deviceId };
  if (from || to)
    query.timestamp = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  return (
    await mongo
      .collection('telemetry')
      .find(query, { projection: { _id: 0 }, ...options() })
      .sort({ id: -1 })
      .limit(limit)
      .toArray()
  ).reverse();
}
export async function alerts(deviceId, limit = 30) {
  return mongo
    .collection('alerts')
    .find({ deviceId }, { projection: { _id: 0 }, ...options() })
    .sort({ id: -1 })
    .limit(limit)
    .toArray();
}
