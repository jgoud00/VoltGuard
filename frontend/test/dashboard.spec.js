import { test, expect } from '@playwright/test';

test('dashboard renders charts, keeps history, reconnects and fits mobile', async ({
  page,
  request,
}) => {
  await request.post('http://localhost:3001/api/simulator/mode', {
    data: { mode: 'NORMAL', profile: '12V' },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.__testSockets = [];
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        if (this.url.endsWith('/ws')) window.__testSockets.push(this);
      }
    };
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Energy overview/ }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('LIVE');
  await expect(page.locator('canvas')).toHaveCount(6);
  for (const canvas of await page.locator('canvas').all())
    await expect(canvas).toBeVisible();
  await expect(page.locator('[data-metric=voltage] strong')).toHaveText(/\d/);
  const firstChart = page.locator('canvas').first();
  const before = await firstChart.screenshot();
  await expect
    .poll(async () => (await firstChart.screenshot()).equals(before), {
      timeout: 8000,
    })
    .toBe(false);
  const beforeCount = Number(
    (await page.locator('.section-title p').innerText()).match(
      /Latest (\d+)/,
    )[1],
  );
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('LIVE');
  await expect
    .poll(async () =>
      Number(
        (await page.locator('.section-title p').innerText()).match(
          /Latest (\d+)/,
        )[1],
      ),
    )
    .toBeGreaterThanOrEqual(beforeCount);
  await page.evaluate(() => window.__testSockets[0].close());
  await expect(page.getByRole('status')).toHaveText('RECONNECTING');
  await expect(page.getByRole('status')).toHaveText('LIVE', { timeout: 8000 });
  expect(
    await page.evaluate(() => window.__testSockets.length),
  ).toBeGreaterThan(1);
  await page.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: /Energy overview/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: 'test-results/dashboard-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('MQTT simulator faults, alert recovery, offline and resume reach dashboard', async ({
  page,
  request,
}) => {
  const api = 'http://localhost:3001';
  const mode = async (mode) => {
    const r = await request.post(api + '/api/simulator/mode', {
      data: { mode, profile: 'AC230' },
    });
    expect(r.ok()).toBe(true);
  };
  try {
    await mode('NORMAL');
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('LIVE');
    await expect(page.locator('[data-metric=power]')).toContainText('PF = 1');
    for (const [scenario, code] of [
      ['OVERVOLTAGE', 'OVER VOLTAGE'],
      ['UNDERVOLTAGE', 'UNDER VOLTAGE'],
      ['OVERCURRENT', 'OVER CURRENT'],
      ['OVERTEMPERATURE', 'HIGH TEMPERATURE'],
    ]) {
      await mode(scenario);
      await expect(page.locator('.status')).toHaveText('CRITICAL');
      const expectedCode = code
        .replace('OVER VOLTAGE', 'OVERVOLTAGE')
        .replace('UNDER VOLTAGE', 'UNDERVOLTAGE')
        .replace('OVER CURRENT', 'OVERCURRENT');
      await expect(
        page.locator('.alert strong').filter({ hasText: expectedCode }),
      ).toBeVisible();
      await mode('NORMAL');
      await expect(page.locator('.status')).toHaveText('HEALTHY');
      await expect(page.locator('.alerts .panel-heading')).toContainText(
        '0 active',
      );
    }
    await mode('DEVICE_OFFLINE');
    await expect(page.getByRole('status')).toHaveText('OFFLINE', {
      timeout: 10000,
    });
    await mode('NORMAL');
    await expect(page.getByRole('status')).toHaveText('LIVE');
    await expect
      .poll(async () =>
        Number(
          (await page.locator('.section-title p').innerText()).match(
            /Latest (\d+)/,
          )[1],
        ),
      )
      .toBeLessThanOrEqual(100);
  } finally {
    await mode('NORMAL');
  }
});

test('backend unavailable and malformed WebSocket data are safe', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://localhost:3001/api/**', (r) => r.abort());
  await page.routeWebSocket('ws://localhost:3001/ws', (socket) => {
    socket.send('{bad');
    socket.send(
      JSON.stringify({ type: 'telemetry', data: { voltage: 'invalid' } }),
    );
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Energy overview/ }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('AWAITING TELEMETRY');
  await expect(page.locator('.status')).toHaveText('AWAITING DATA');
  expect(errors).toEqual([]);
});

test('professional workspace controls, simulation dialog, event history and CSV export', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await request.post('http://localhost:3001/api/simulator/mode', {
    data: { mode: 'NORMAL', profile: '12V' },
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('LIVE');
  await page.getByRole('tab', { name: 'Power', exact: true }).click();
  await expect(page.locator('.primary-chart h3')).toContainText('Power');
  await page.getByRole('button', { name: 'Inspect current signal' }).click();
  await expect(
    page.getByRole('tab', { name: 'Current', exact: true }),
  ).toHaveAttribute('data-state', 'active');
  await page.getByRole('combobox', { name: 'Chart sample window' }).click();
  await page
    .getByRole('option', { name: 'Last 30 samples', exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        (await page.locator('.chart-footer').innerText()).match(
          /(\d+) samples in view/,
        )[1],
      ),
    )
    .toBeLessThanOrEqual(30);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export readings' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^voltguard-.*\.csv$/);
  const { readFile } = await import('node:fs/promises');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.split('\r\n')[0]).toContain(
    'voltage,current,power,energy,temperature',
  );
  expect(csv.split('\r\n').length).toBeLessThanOrEqual(101);
  expect(csv).toContain('voltguard-01');
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Monitoring profile' }).click();
  await page
    .getByRole('option', { name: '230 V electrical', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Overcurrent', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Overcurrent', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/professional-simulation.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Simulation', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.status')).toHaveText('CRITICAL');
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Normal operation', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Return to monitoring' }).click();
  await expect(page.locator('.status')).toHaveText('HEALTHY');
  await page.getByRole('tab', { name: /Recent history/ }).click();
  await expect(page.locator('.event-state.recovered').first()).toBeVisible();
  await page.getByRole('tab', { name: /Active conditions/ }).click();
  await expect(page.locator('.alerts .panel-heading')).toContainText(
    '0 active',
  );
  await page.getByRole('tab', { name: 'Voltage', exact: true }).click();
  await page.getByRole('combobox', { name: 'Chart sample window' }).click();
  await page
    .getByRole('option', { name: 'Last 100 samples', exact: true })
    .click();
  await page.screenshot({
    path: 'test-results/professional-ac-desktop.png',
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Events', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/#events$/);
  await expect(
    page.getByRole('heading', { name: 'Event log' }),
  ).toBeInViewport();
});

test('accessible dashboard and simulation controls', async ({
  page,
  request,
}) => {
  await request.post('http://localhost:3001/api/simulator/mode', {
    data: { mode: 'NORMAL', profile: '12V' },
  });
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const { writeFile } = await import('node:fs/promises');
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('LIVE');
  await expect(page.locator('.battery-details')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await writeFile(
    'test-results/dashboard-accessibility.json',
    JSON.stringify(results.violations, null, 2),
  );
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  await page.getByRole('dialog').evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const dialogResult = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await writeFile(
    'test-results/dialog-accessibility.json',
    JSON.stringify(dialogResult.violations, null, 2),
  );
  expect(
    dialogResult.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
