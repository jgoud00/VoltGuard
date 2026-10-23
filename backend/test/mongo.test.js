import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import mqtt from 'mqtt';
import { WebSocket } from 'ws';
import { stack, until } from '../../scripts/test-stack.js';

test(
  'MongoDB persists nullable MQTT telemetry, alerts, nominal energy and restart continuity',
  { skip: !process.env.MONGODB_TEST_URI, timeout: 30000 },
  async () => {
    const name = `voltguard_test_${process.pid}_${Date.now()}`;
    const options = {
      DATABASE_DRIVER: 'mongodb',
      MONGODB_URI: process.env.MONGODB_TEST_URI,
      MONGODB_DATABASE: name,
      SIMULATION_ENABLED: 'false',
    };
    const databaseClient = new MongoClient(options.MONGODB_URI);
    await databaseClient.connect();
    let server, publisher, socket;
    try {
      server = await stack(3310, 18890, options);
      assert.equal(
        (await server.json('/api/health')).databaseDriver,
        'mongodb',
      );
      socket = new WebSocket('ws://127.0.0.1:3310/ws');
      await new Promise((resolve) => socket.once('open', resolve));
      const packets = [];
      socket.on('message', (value) => packets.push(JSON.parse(value)));
      publisher = mqtt.connect('mqtt://127.0.0.1:18890');
      await new Promise((resolve) => publisher.once('connect', resolve));
      const base = {
        deviceId: 'mongo-test',
        batteryProfile: 'LI_ION_2S',
        voltage: 8,
        current: null,
        temperature: null,
        quality: {
          voltage: 'averaged_unverified',
          current: 'uncalibrated',
          temperature: 'disconnected',
        },
      };
      const publish = async (value) =>
        new Promise((resolve, reject) =>
          publisher.publish(
            'voltguard/device/mongo-test/telemetry',
            JSON.stringify(value),
            { qos: 1 },
            (error) => (error ? reject(error) : resolve()),
          ),
        );
      await publish(base);
      const first = await until(
        async () => await server.json('/api/latest?deviceId=mongo-test'),
      );
      assert.equal(first.current, null);
      assert.equal(first.energy, null);
      const calibrated = {
        ...base,
        current: 0.5,
        temperature: 60,
        quality: {
          ...base.quality,
          current: 'calibrated_limited',
          temperature: 'measured',
        },
      };
      await publish(calibrated);
      const second = await until(async () => {
        const value = await server.json('/api/latest?deviceId=mongo-test');
        return value.id > first.id && value;
      });
      assert.equal(second.power, 4);
      assert.equal(second.energy, 0);
      assert.equal(second.soc, null);
      await publish(calibrated);
      const third = await until(async () => {
        const value = await server.json('/api/latest?deviceId=mongo-test');
        return value.id > second.id && value;
      });
      assert.ok(third.energy > 0);
      assert.ok(
        (await server.json('/api/alerts?deviceId=mongo-test')).some(
          (value) => value.code === 'HIGH_TEMPERATURE' && value.active,
        ),
      );
      await until(() =>
        packets.some(
          (packet) =>
            packet.type === 'telemetry' && packet.data.id === third.id,
        ),
      );
      const persisted = await databaseClient
        .db(name)
        .collection('telemetry')
        .findOne({ id: third.id });
      assert.equal(persisted.energy, third.energy);
      await publisher.endAsync();
      publisher = null;
      socket.close();
      socket = null;
      await server.stop();
      server = await stack(3310, 18890, options);
      const restored = await server.json('/api/latest?deviceId=mongo-test');
      assert.equal(restored.id, third.id);
      assert.equal(restored.energy, third.energy);
      assert.equal(
        (await server.json('/api/history?deviceId=mongo-test')).length,
        3,
      );
    } finally {
      if (publisher) await publisher.endAsync();
      socket?.close();
      if (server) await server.stop();
      await databaseClient.db(name).dropDatabase();
      await databaseClient.close();
    }
  },
);
