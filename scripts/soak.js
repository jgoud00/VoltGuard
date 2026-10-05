import { stack, delay } from './test-stack.js';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const duration = Number(process.env.SOAK_SECONDS || 180);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(e.message));
await page.addInitScript(() => {
  const nativeFetch = window.fetch;
  window.fetch = (input, options) =>
    nativeFetch(
      typeof input === 'string'
        ? input.replace('http://localhost:3001', 'http://127.0.0.1:3302')
        : input,
      options,
    );
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url, ...args) {
      super(url.replace('ws://localhost:3001', 'ws://127.0.0.1:3302'), ...args);
    }
  };
});
const s = await stack(3302, 18884);
const socket = new WebSocket('ws://127.0.0.1:3302/ws');
let received = 0;
socket.on('message', (b) => {
  if (JSON.parse(b).type === 'telemetry') received++;
});
try {
  s.start('simulator/simulator.js', [
    '--scenario',
    'unstable',
    '--rate',
    '20',
    '--duration',
    String(duration),
  ]);
  await page.goto('http://localhost:5173');
  const readings = [];
  for (let elapsed = 0; elapsed < duration; elapsed += 10) {
    await delay(Math.min(10, duration - elapsed) * 1000);
    const health = await s.json('/api/health');
    assert.equal(health.status, 'ok');
    assert.equal(health.websocketClients, 2);
    const points = await page.locator('.section-title p').innerText();
    assert.ok(Number(points.match(/Latest (\d+)/)[1]) <= 100);
    await page.locator('h1').click();
    readings.push(health.memoryBytes);
    console.log(
      JSON.stringify({
        elapsed: Math.min(elapsed + 10, duration),
        received,
        heapMB: Math.round(health.memoryBytes / 1048576),
        accepted: health.accepted,
      }),
    );
  }
  assert.ok(received > duration * 10);
  assert.ok((await s.json('/api/history?limit=1000')).length <= 1000);
  assert.ok(
    readings.at(-1) - Math.min(...readings) < 64 * 1048576,
    'Heap growth exceeded 64 MB',
  );
  assert.deepEqual(browserErrors, []);
  console.log(
    'PASS: bounded API history, stable client count, MQTT ingestion and coarse heap bound',
  );
} finally {
  await browser.close();
  socket.terminate();
  await s.stop();
}
