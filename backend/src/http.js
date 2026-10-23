import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { validDevice, PROFILES, MODES } from './contract.js';
import {
  latest,
  history,
  alerts,
  databaseDriver,
} from './db.js';
import { ingest, getRejected } from './ingest.js';

export function createHttpServer(getState) {
  const app = express();
  app.set('query parser', 'extended');
  app.use(cors({ origin: config.origins }));
  app.use(express.json({ limit: '16kb' }));

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

  let mode = MODES.includes(process.env.SIM_MODE)
    ? process.env.SIM_MODE
    : 'NORMAL';
  let profile = PROFILES.includes(process.env.BATTERY_PROFILE)
    ? process.env.BATTERY_PROFILE
    : '12V';

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

  app.use('/api', (req, res, next) =>
    validDevice(device(req))
      ? next()
      : res.status(400).json({ error: 'Invalid deviceId' }),
  );

  app.get('/api/health', (_req, res) => {
    const state = getState();
    res.status(state.dbHealthy ? 200 : 503).json({
      status: state.dbHealthy ? 'ok' : 'degraded',
      mqttConnected: state.mqttReady,
      mqtt: state.mqttReady ? 'connected' : 'disconnected',
      websocket: 'running',
      websocketClients: state.wsClients,
      database: state.dbHealthy ? 'ok' : 'unavailable',
      databaseDriver,
      accepted: state.count,
      rejected: state.rejected,
      duplicates: state.duplicates,
      memoryBytes: process.memoryUsage().heapUsed,
    });
  });

  app.get(['/api/latest', '/api/telemetry/latest'], async (req, res) =>
    res.json((await latest(device(req))) || null),
  );

  app.get(['/api/history', '/api/telemetry/history'], async (req, res) => {
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
      await history(
        device(req),
        limit(req.query.limit),
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined,
      ),
    );
  });

  app.get('/api/alerts', async (req, res) =>
    res.json(await alerts(device(req), limit(req.query.limit, 30))),
  );

  app.get('/api/device', async (req, res) => {
    const s = await latest(device(req));
    res.json({
      deviceId: device(req),
      mode,
      profile: s?.batteryProfile || profile,
      profiles: PROFILES,
      modes: MODES,
      simulated: s?.source === 'simulation',
      simulationEnabled: config.simulation,
      offlineMs: config.staleMs,
      online: !!s && Date.now() - Date.parse(s.receivedAt) < config.staleMs,
      lastUpdate: s?.receivedAt || null,
    });
  });

  app.post('/api/simulator/mode', simulationAuth, (req, res) => {
    if (
      !MODES.includes(req.body?.mode) ||
      (req.body.profile &&
        (!PROFILES.includes(req.body.profile) ||
          req.body.profile === 'LI_ION_2S'))
    )
      return res.status(400).json({ error: 'Invalid mode or profile' });
    mode = req.body.mode;
    if (req.body.profile) profile = req.body.profile;
    res.json({ mode, profile });
  });

  app.get('/api/simulator/config', simulationAuth, (_req, res) =>
    res.json({ mode, profile }),
  );

  app.post('/api/simulator/telemetry', simulationAuth, async (req, res) => {
    try {
      res.json({
        accepted: !!(await ingest({ ...req.body, source: 'simulation' })),
      });
    } catch (error) {
      if (
        error.code?.toString().startsWith('SQLITE') ||
        error.name?.startsWith('Mongo')
      ) {
        throw error;
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.use((error, _req, res, _next) => {
    console.warn('[API] Request failed:', error.code || error.message);
    res.status(error.status || 503).json({
      error: error.status === 400 ? 'Invalid request' : 'Service unavailable',
    });
  });

  return { app, getMode: () => mode, getProfile: () => profile, setMode: (m) => { mode = m; }, setProfile: (p) => { profile = p; } };
}