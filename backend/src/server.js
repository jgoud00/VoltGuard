import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import { Aedes } from 'aedes';
import net from 'node:net';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  db,
  alerts,
  history,
  latest,
  prune,
  resolveAlert,
  saveAlert,
  saveTelemetry,
} from './db.js';
import {
  evaluateAlerts,
  MODES,
  PROFILES,
  validateTelemetry,
  validDevice,
} from './contract.js';
import { config } from './config.js';
const app = express();
app.set('query parser', 'extended');
app.use(cors({ origin: config.origins }));
app.use(express.json({ limit: '16kb' }));
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
let mqttReady = false,
  count = 0,
  rejected = 0,
  duplicates = 0,
  dbHealthy = true;
let mode = MODES.includes(process.env.SIM_MODE)
  ? process.env.SIM_MODE
  : 'NORMAL';
let profile = PROFILES.includes(process.env.BATTERY_PROFILE)
  ? process.env.BATTERY_PROFILE
  : '12V';
const broadcast = (packet) => {
  const data = JSON.stringify(packet);
  for (const c of wss.clients)
    if (c.readyState === WebSocket.OPEN) {
      if (c.bufferedAmount > 1024 * 1024) c.terminate();
      else c.send(data);
    }
};
const ingest = (raw) => {
  const s = validateTelemetry(raw);
  s.receivedAt = new Date().toISOString();
  const previous = latest(s.deviceId);
  if (previous && Date.parse(s.timestamp) <= Date.parse(previous.timestamp)) {
    duplicates++;
    return null;
  }
  const candidates = evaluateAlerts(s);
  s.status = candidates.some((a) => a.severity === 'CRITICAL')
    ? 'critical'
    : candidates.length
      ? 'warning'
      : s.status;
  const events = [];
  db.transaction(() => {
    s.id = Number(saveTelemetry(s));
    const active = alerts(s.deviceId, 5000).filter((a) => a.active);
    for (const a of candidates)
      if (!active.some((old) => old.code === a.code)) {
        const event = {
          ...a,
          deviceId: s.deviceId,
          timestamp: s.receivedAt,
          active: true,
        };
        event.id = Number(saveAlert(event));
        events.push({ type: 'alert', data: event });
      }
    for (const a of active)
      if (!candidates.some((c) => c.code === a.code)) {
        resolveAlert(a.id, s.receivedAt);
        events.push({
          type: 'alert',
          data: { ...a, active: false, resolvedAt: s.receivedAt },
        });
      }
  })();
  dbHealthy = true;
  broadcast({ type: 'telemetry', data: s });
  for (const e of events) {
    console.log(
      `[ALERT] ${e.data.code} ${e.data.active ? 'active' : 'recovered'}`,
    );
    broadcast(e);
  }
  if (++count % 1000 === 0) prune();
  return s;
};
const device = (req) =>
  req.query.deviceId ||
  req.query.device ||
  process.env.DEVICE_ID ||
  'voltguard-01';
const limit = (value, fallback = 100) => {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > 1000
  )
    throw Object.assign(new Error('limit must be 1..1000'), { status: 400 });
  return Number(value);
};
app.use('/api', (req, res, next) =>
  validDevice(device(req))
    ? next()
    : res.status(400).json({ error: 'Invalid deviceId' }),
);
app.get('/api/health', (_req, res) =>
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    mqttConnected: mqttReady,
    mqtt: mqttReady ? 'connected' : 'disconnected',
    websocket: 'running',
    websocketClients: wss.clients.size,
    database: dbHealthy ? 'ok' : 'unavailable',
    accepted: count,
    rejected,
    duplicates,
    memoryBytes: process.memoryUsage().heapUsed,
  }),
);
app.get(['/api/latest', '/api/telemetry/latest'], (req, res) =>
  res.json(latest(device(req)) || null),
);
app.get(['/api/history', '/api/telemetry/history'], (req, res) => {
  const from = req.query.from || req.query.start,
    to = req.query.to || req.query.end;
  for (const v of [from, to])
    if (
      v !== undefined &&
      (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))
    )
      return res.status(400).json({ error: 'Invalid date' });
  if (from && to && Date.parse(from) > Date.parse(to))
    return res.status(400).json({ error: 'from must precede to' });
  res.json(
    history(
      device(req),
      limit(req.query.limit),
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,
    ),
  );
});
app.get('/api/alerts', (req, res) =>
  res.json(alerts(device(req), limit(req.query.limit, 30))),
);
app.get('/api/device', (req, res) => {
  const s = latest(device(req));
  res.json({
    deviceId: device(req),
    mode,
    profile,
    profiles: PROFILES,
    modes: MODES,
    simulated: s?.source === 'simulation',
    simulationEnabled: config.simulation,
    offlineMs: config.staleMs,
    online: !!s && Date.now() - Date.parse(s.receivedAt) < config.staleMs,
    lastUpdate: s?.receivedAt || null,
  });
});
const simulationAuth = (req, res, next) => {
  if (!config.simulation)
    return res.status(404).json({ error: 'Simulation disabled' });
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
    req.socket.remoteAddress,
  );
  if (
    (config.token && req.headers.authorization !== `Bearer ${config.token}`) ||
    (!config.token && !local)
  )
    return res.status(403).json({ error: 'Simulator authorization required' });
  if (req.headers.origin && !config.origins.includes(req.headers.origin))
    return res.status(403).json({ error: 'Origin denied' });
  next();
};
app.post('/api/simulator/mode', simulationAuth, (req, res) => {
  if (
    !MODES.includes(req.body?.mode) ||
    (req.body.profile && !PROFILES.includes(req.body.profile))
  )
    return res.status(400).json({ error: 'Invalid mode or profile' });
  mode = req.body.mode;
  if (req.body.profile) profile = req.body.profile;
  broadcast({ type: 'simulation', data: { mode, profile } });
  res.json({ mode, profile });
});
app.get('/api/simulator/config', simulationAuth, (_req, res) =>
  res.json({ mode, profile }),
);
app.post('/api/simulator/telemetry', simulationAuth, (req, res) => {
  try {
    res.json({ accepted: !!ingest({ ...req.body, source: 'simulation' }) });
  } catch (error) {
    if (error.code?.startsWith('SQLITE')) {
      dbHealthy = false;
      throw error;
    }
    res.status(400).json({ error: error.message });
  }
});
app.use((error, _req, res, _next) => {
  if (error.code?.startsWith('SQLITE')) dbHealthy = false;
  console.warn('[API] Request failed:', error.code || error.message);
  res.status(error.status || 503).json({
    error: error.status === 400 ? 'Invalid request' : 'Service unavailable',
  });
});
wss.on('connection', (socket, req) => {
  if (req.headers.origin && !config.origins.includes(req.headers.origin)) {
    socket.close(1008, 'Origin denied');
    return;
  }
  socket.alive = true;
  socket.on('pong', () => (socket.alive = true));
  socket.on('error', () => socket.terminate());
  console.log('[WS] Client connected');
  socket.on('close', () => console.log('[WS] Client disconnected'));
});
const heartbeat = setInterval(() => {
  for (const c of wss.clients) {
    if (!c.alive) c.terminate();
    else {
      c.alive = false;
      c.ping();
    }
  }
}, 15000);
let broker, brokerServer;
if (config.embedded) {
  broker = await Aedes.createBroker();
  if (config.username)
    broker.authenticate = (_c, u, p, done) =>
      done(null, u === config.username && p?.toString() === config.password);
  brokerServer = net.createServer(broker.handle);
  brokerServer.on('error', (e) => console.error('[MQTT] Broker:', e.code));
  brokerServer.listen(config.mqttPort, config.mqttHost, () =>
    console.log('[MQTT] Local broker started'),
  );
}
const client = mqtt.connect(config.mqttUrl, {
  reconnectPeriod: 1000,
  username: config.username,
  password: config.password,
  queueQoSZero: false,
});
client.on('connect', () =>
  client.subscribe(
    ['voltguard/device/+/telemetry', 'voltguard/+/telemetry'],
    { qos: 1 },
    (error) => {
      mqttReady = !error;
      console.log(
        error
          ? '[MQTT] Subscription failed'
          : '[MQTT] Connected and subscribed',
      );
    },
  ),
);
client.on('close', () => {
  mqttReady = false;
});
client.on('error', (e) => console.warn('[MQTT]', e.code || 'Connection error'));
client.on('message', (topic, payload) => {
  try {
    if (payload.length > 16384) throw new Error('Payload too large');
    const raw = JSON.parse(payload.toString());
    if (
      ![
        `voltguard/device/${raw.deviceId}/telemetry`,
        `voltguard/${raw.deviceId}/telemetry`,
      ].includes(topic)
    )
      throw new Error('Topic/device mismatch');
    ingest(raw);
  } catch (e) {
    rejected++;
    if (e.code?.startsWith('SQLITE')) dbHealthy = false;
    console.warn('[MQTT] Rejected:', e.code || e.message);
  }
});
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
  for (const c of wss.clients) c.terminate();
  await new Promise((r) => client.end(true, r));
  await new Promise((r) => wss.close(r));
  await new Promise((r) => server.close(r));
  if (broker) {
    await new Promise((r) => broker.close(r));
    brokerServer.close();
  }
  db.close();
  clearTimeout(deadline);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
