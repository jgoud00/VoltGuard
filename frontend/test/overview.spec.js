import { test, expect } from '@playwright/test';

for (const profile of ['6V', '12V', 'AC230', 'LI_ION_2S']) {
  test(`workspace preserves ${profile} readings and responsive groups`, async ({
    page,
  }) => {
    const timestamp = new Date().toISOString();
    const sample = {
      id: 1,
      deviceId: 'workbench-device',
      batteryProfile: profile,
      voltage: profile === 'AC230' ? 230 : profile === '6V' ? 6.3 : 8.15,
      current: 0.1,
      power: 0.815,
      energy: 0.00000123,
      temperature: 30,
      soc: 75,
      soh: 90,
      internalResistance: 0.1,
      source: 'device',
      status: 'healthy',
      timestamp,
      receivedAt: timestamp,
    };
    await page.route('http://localhost:3001/api/**', (route) => {
      const responses = {
        '/api/device': {
          deviceId: sample.deviceId,
          profile,
          offlineMs: 60000,
          simulationEnabled: false,
        },
        '/api/history': [sample],
        '/api/alerts': [],
        '/api/health': { mqttConnected: true },
      };
      return route.fulfill({
        json: responses[new URL(route.request().url()).pathname] ?? null,
      });
    });
    await page.routeWebSocket('ws://localhost:3001/ws', () => {});
    await page.goto('/');
    const overview = page.locator('#overview');
    await expect(page.getByRole('status')).toHaveText('LIVE');
    await expect(overview.locator('.context-device')).toContainText(
      sample.deviceId,
    );
    await expect(overview.locator('.source-label')).toHaveText('Device data');
    await expect(overview.locator('.receipt-label')).toContainText(/\d+s ago/);
    await expect(overview.locator('[data-metric]')).toHaveCount(7);
    await expect(overview.locator('[data-metric=energy] strong')).toHaveText(
      '0.00000123',
    );
    await expect(overview.locator('.demo-disclosure')).toHaveCount(0);
    await expect(overview.locator('[data-metric=energy]')).not.toHaveAttribute(
      'role',
      'button',
    );

    await overview
      .getByRole('button', { name: 'Inspect current signal' })
      .click();
    await expect(
      page.getByRole('tab', { name: 'Current', exact: true }),
    ).toHaveAttribute('data-state', 'active');
    await overview
      .getByRole('button', { name: 'Inspect voltage signal' })
      .click();

    for (const width of profile === '12V'
      ? [1440, 1024, 768, 390, 320]
      : [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      const columns = width < 360 ? 1 : 2;
      expect(
        await overview
          .locator('.electrical-readings')
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(' ').length,
          ),
      ).toBe(columns);
      expect(
        await overview
          .locator('.supporting-readings')
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(' ').length,
          ),
      ).toBe(width <= 540 ? 1 : 3);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      expect(
        await overview.locator('.metric-bottom > span').evaluateAll((notes) =>
          notes.every((note) => {
            const bounds = note.getBoundingClientRect();
            const parent = note.closest('.metric').getBoundingClientRect();
            return (
              note.scrollWidth <= note.clientWidth &&
              bounds.right <= parent.right &&
              bounds.bottom <= parent.bottom
            );
          }),
        ),
      ).toBe(true);
      if (profile === '12V') {
        await page.screenshot({
          path: `test-results/workbench-${width}.png`,
          fullPage: true,
        });
      }
    }
    await overview.getByRole('link', { name: '0 active conditions' }).click();
    await expect(page).toHaveURL(/#events$/);
    await expect(
      page.getByRole('heading', { name: 'Event log' }),
    ).toBeInViewport();
  });
}
