import mqtt from 'mqtt';
import { Aedes } from 'aedes';
import net from 'node:net';
import { config } from './config.js';
import { ingest, incrementRejected } from './ingest.js';

export async function createMqttClient(broadcast) {
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

  let mqttReady = false;

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

  client.on('error', (e) =>
    console.warn('[MQTT]', e.code || 'Connection error'),
  );

  client.on('message', async (topic, payload) => {
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
      const result = await ingest(raw);
      if (!result) return;
      broadcast({ type: 'telemetry', data: result.sample });
      for (const e of result.events) {
        console.log(
          `[ALERT] ${e.data.code} ${e.data.active ? 'active' : 'recovered'}`,
        );
        broadcast(e);
      }
    } catch (e) {
      incrementRejected();
      console.warn('[MQTT] Rejected:', e.code || e.message);
    }
  });

  return { client, broker, brokerServer, getReady: () => mqttReady };
}
