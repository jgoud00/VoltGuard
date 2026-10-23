import { test, expect } from '@playwright/test';

test('reconnect restores recovered alerts and ignores other devices, including REST/socket races', async ({
  page,
}) => {
  const timestamp = new Date().toISOString();
  const sample = {
    id: 1,
    deviceId: 'selected-device',
    batteryProfile: 'AC230',
    voltage: 230,
    current: 1,
    power: 230,
    energy: 0,
    temperature: 30,
    timestamp,
    receivedAt: timestamp,
    source: 'device',
    status: 'healthy',
  };
  let event = {
    id: 1,
    deviceId: sample.deviceId,
    code: 'HIGH_TEMPERATURE',
    severity: 'CRITICAL',
    message: 'Hot',
    timestamp,
    active: true,
  };
  let pauseAlerts = false,
    releaseAlerts;
  await page.route('http://localhost:3001/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (['/api/history', '/api/alerts'].includes(url.pathname))
      expect(url.searchParams.get('deviceId')).toBe(sample.deviceId);
    const responses = {
      '/api/history': [sample],
      '/api/alerts': [{ ...event }],
      '/api/device': {
        deviceId: sample.deviceId,
        profile: 'AC230',
        offlineMs: 60000,
        simulationEnabled: false,
      },
      '/api/health': { mqttConnected: true },
    };
    if (url.pathname === '/api/alerts' && pauseAlerts)
      await new Promise((resolve) => {
        releaseAlerts = resolve;
      });
    await route.fulfill({ json: responses[url.pathname] ?? null });
  });
  await page.addInitScript(() => {
    window.WebSocket = class {
      constructor() {
        window.__auditSocket = this;
        setTimeout(() => this.onopen?.(), 25);
      }
      close() {}
    };
  });
  const send = (type, data) =>
    page.evaluate(
      (packet) => {
        window.__auditSocket.onmessage({ data: JSON.stringify(packet) });
      },
      { type, data },
    );
  await page.goto('/');
  await expect(page.locator('.event-count')).toHaveText('1 active');
  await send('telemetry', {
    ...sample,
    id: 2,
    deviceId: 'other-device',
    voltage: 240,
    power: 240,
  });
  await send('alert', { ...event, id: 99, deviceId: 'other-device' });
  await expect(page.locator('.device-identity h2')).toHaveText(sample.deviceId);
  await expect(page.locator('[data-metric=voltage] strong')).toHaveText(
    '230.00',
  );
  await expect(page.locator('.event-count')).toHaveText('1 active');

  event = { ...event, active: false, resolvedAt: timestamp };
  await page.evaluate(() => window.__auditSocket.onclose());
  await expect(page.getByRole('status')).toHaveText('RECONNECTING');
  await expect(page.locator('.event-count')).toHaveText('0 active');

  event = { ...event, id: 2, active: true, resolvedAt: null };
  await send('alert', event);
  await expect(page.locator('.event-count')).toHaveText('1 active');
  pauseAlerts = true;
  await page.evaluate(() => window.__auditSocket.onclose());
  await expect.poll(() => Boolean(releaseAlerts)).toBe(true);
  await send('alert', { ...event, active: false, resolvedAt: timestamp });
  releaseAlerts();
  await expect(page.locator('.event-count')).toHaveText('0 active');
  await page.getByRole('tab', { name: /Recent history/ }).click();
  await expect(page.locator('.event-state.recovered')).toHaveCount(2);
});
