import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './frontend/test',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
});
