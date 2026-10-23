import { test, expect } from '@playwright/test';

test('physical 2S dashboard labels demo measurements and exports only measured values and recovers temperature', async ({
  page,
}) => {
  const sample = {
    id: 1,
    deviceId: 'voltguard-01',
    batteryProfile: 'LI_ION_2S',
    voltage: 8.15,
    current: null,
    temperature: null,
    soc: null,
    soh: null,
    internalResistance: null,
    power: null,
    energy: null,
    source: 'device',
    status: 'partial',
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    quality: {
      voltage: 'averaged_unverified',
      current: 'uncalibrated',
      temperature: 'disconnected',
    },
  };
  await page.route('http://localhost:3001/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      '/api/history': [sample],
      '/api/alerts': [],
      '/api/device': {
        deviceId: sample.deviceId,
        profile: sample.batteryProfile,
        offlineMs: 60000,
        simulationEnabled: false,
      },
      '/api/health': { status: 'ok', mqttConnected: true, database: 'ok' },
    };
    await route.fulfill({ json: responses[path] ?? null });
  });
  await page.addInitScript(() => {
    window.WebSocket = class {
      constructor() {
        window.__hardwareSocket = this;
        setTimeout(() => this.onopen?.(), 25);
      }
      close() {}
    };
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('LIVE');
  for (const key of [
    'current',
    'temperature',
    'power',
    'energy',
    'soc',
    'soh',
  ]) {
    await expect(page.locator(`[data-metric=${key}]`)).toContainText(
      'Demo value',
    );
    await expect(page.locator(`[data-metric=${key}] strong`)).toHaveText(/\d/);
  }
  await expect(page.locator('[data-metric=voltage]')).not.toContainText(
    'Demo value',
  );
  await expect(page.locator('.battery-details')).toContainText('Demo value');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export readings' }).click();
  const { readFile } = await import('node:fs/promises');
  const csv = await readFile(await (await downloadEvent).path(), 'utf8');
  const [header, row] = csv
    .trim()
    .split('\r\n')
    .map((line) => line.split(',').map((v) => v.replace(/^"|"$/g, '')));
  const exported = Object.fromEntries(header.map((key, i) => [key, row[i]]));
  expect(exported.voltage).toBe('8.15');
  for (const key of ['current', 'temperature', 'power', 'energy', 'soc', 'soh'])
    expect(exported[key]).toBe('');
  await page.evaluate(
    (sample) => {
      window.__hardwareSocket.onmessage({
        data: JSON.stringify({ type: 'telemetry', data: sample }),
      });
    },
    {
      ...sample,
      id: 2,
      temperature: 30.25,
      quality: { ...sample.quality, temperature: 'measured' },
    },
  );
  await expect(page.locator('[data-metric=temperature] strong')).toHaveText(
    '30.3',
  );
  await expect(page.locator('[data-metric=temperature]')).not.toContainText(
    'Demo value',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-metric=current]')).toContainText(
    'Demo value',
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
