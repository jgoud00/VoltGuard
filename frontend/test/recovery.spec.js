import { test, expect } from '@playwright/test';

const reading = () => ({
  id: 1,
  deviceId: 'recovery-test',
  batteryProfile: 'AC230',
  voltage: 230,
  current: 1,
  power: 230,
  energy: 0,
  temperature: 30,
  timestamp: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
  source: 'device',
  status: 'healthy',
});
const fakeSocket = () => {
  window.__socketCount = 0;
  window.WebSocket = class {
    constructor() {
      window.__socketCount++;
      window.__recoverySocket = this;
      setTimeout(() => this.onopen?.(), 25);
    }
    close() {}
  };
};

test('initial REST failures recover while the original WebSocket stays open', async ({
  page,
}) => {
  const sample = reading();
  let deviceRequests = 0;
  await page.route('http://localhost:3001/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/device' && ++deviceRequests <= 2)
      return route.fulfill({
        status: 503,
        json: { error: 'Temporarily unavailable' },
      });
    const responses = {
      '/api/device': {
        deviceId: sample.deviceId,
        mode: 'NORMAL',
        profile: 'AC230',
        offlineMs: 60000,
        simulationEnabled: false,
      },
      '/api/history': [sample],
      '/api/alerts': [],
      '/api/health': { mqttConnected: true },
    };
    await route.fulfill({ json: responses[path] });
  });
  await page.addInitScript(fakeSocket);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Backend unavailable');
  const initialSocketCount = await page.evaluate(() => window.__socketCount);
  await expect(page.getByRole('status')).toHaveText('LIVE', { timeout: 10000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(deviceRequests).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.__socketCount)).toBe(
    initialSocketCount,
  );
  await page.evaluate(
    (sample) =>
      window.__recoverySocket.onmessage({
        data: JSON.stringify({
          type: 'telemetry',
          data: { ...sample, id: 2, voltage: 240, power: 240 },
        }),
      }),
    sample,
  );
  await expect(page.locator('[data-metric=voltage] strong')).toHaveText(
    '240.00',
  );
});

test('old active conditions survive recent history limits and new socket events', async ({
  page,
}) => {
  const sample = reading();
  const old = {
    id: 1,
    deviceId: sample.deviceId,
    code: 'HIGH_TEMPERATURE',
    severity: 'CRITICAL',
    message: 'Still hot',
    timestamp: sample.timestamp,
    active: true,
  };
  let stillActive = true;
  const recent = Array.from({ length: 30 }, (_, i) => ({
    ...old,
    id: i + 2,
    active: false,
    resolvedAt: sample.timestamp,
  }));
  await page.route('http://localhost:3001/api/**', (route) => {
    const url = new URL(route.request().url());
    const responses = {
      '/api/device': {
        deviceId: sample.deviceId,
        mode: 'NORMAL',
        profile: 'AC230',
        offlineMs: 60000,
        simulationEnabled: false,
      },
      '/api/history': [sample],
      '/api/alerts':
        url.searchParams.get('active') === 'true'
          ? stillActive
            ? [old]
            : []
          : recent,
      '/api/health': { mqttConnected: true },
    };
    return route.fulfill({ json: responses[url.pathname] });
  });
  await page.addInitScript(fakeSocket);
  await page.goto('/');
  await expect(page.locator('.event-count')).toHaveText('1 active');
  await page.evaluate((old) => {
    for (let id = 32; id < 65; id++)
      window.__recoverySocket.onmessage({
        data: JSON.stringify({
          type: 'alert',
          data: { ...old, id, active: false, resolvedAt: old.timestamp },
        }),
      });
  }, old);
  await expect(page.locator('.event-count')).toHaveText('1 active');
  await page.getByRole('tab', { name: /Recent history/ }).click();
  await expect(page.locator('.alert')).toHaveCount(30);
  await page.getByRole('tab', { name: /Active conditions/ }).click();
  await expect(page.locator('.alert')).toContainText('Still hot');
  stillActive = false;
  await page.evaluate(() => window.__recoverySocket.onclose());
  await expect(page.locator('.event-count')).toHaveText('0 active');
});

test('switching a charging battery to AC selects Normal and disables Charging', async ({
  page,
}) => {
  let config = { mode: 'CHARGING', profile: '12V' };
  await page.route('http://localhost:3001/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/simulator/mode') {
      config = route.request().postDataJSON();
      return route.fulfill({ json: config });
    }
    const responses = {
      '/api/device': {
        ...config,
        deviceId: 'controls-test',
        offlineMs: 60000,
        simulationEnabled: true,
      },
      '/api/history': [],
      '/api/alerts': [],
      '/api/health': { mqttConnected: true },
    };
    return route.fulfill({ json: responses[path] });
  });
  await page.addInitScript(fakeSocket);
  await page.goto('/');
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Charging', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('combobox', { name: 'Monitoring profile' }).click();
  await page
    .getByRole('option', { name: '230 V electrical', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Charging', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Normal operation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(config).toEqual({ mode: 'NORMAL', profile: 'AC230' });
  await dialog.getByRole('combobox', { name: 'Monitoring profile' }).click();
  await page
    .getByRole('option', { name: '12 V lead-acid', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Charging', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Charging', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(config).toEqual({ mode: 'CHARGING', profile: '12V' });
});
