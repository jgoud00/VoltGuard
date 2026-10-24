import { createServer } from 'node:http';
import { config } from './config.js';
import { db } from './db.js';
import { createHttpServer } from './http.js';
import { createWebSocketServer } from './ws.js';
import { createMqttClient } from './mqtt.js';
import { count, getRejected, duplicates, getIngestion } from './ingest.js';

const server = createServer();
const wssState = createWebSocketServer(server);
const { broadcast, heartbeat } = wssState;
const http = createHttpServer(
  () => ({
    count,
    rejected: getRejected(),
    duplicates,
    mqttReady: mqttState.getReady(),
    wsClients: wssState.wss.clients.size,
  }),
  broadcast,
);
server.on('request', http.app);

const mqttState = await createMqttClient(broadcast);

server.listen(config.port, config.host, () =>
  console.log(`[SERVER] Started on ${config.host}:${config.port}`),
);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  const deadline = setTimeout(() => process.exit(1), 5000);
  deadline.unref();
  for (const c of wssState.wss.clients) c.terminate();
  await new Promise((r) => mqttState.client.end(true, r));
  await new Promise((r) => wssState.wss.close(r));
  await new Promise((r) => server.close(r));
  if (mqttState.broker) {
    await new Promise((r) => mqttState.broker.close(r));
    mqttState.brokerServer.close();
  }
  await getIngestion();
  await db.close();
  clearTimeout(deadline);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
