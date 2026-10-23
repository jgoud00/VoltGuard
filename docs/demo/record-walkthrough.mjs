// Plain dashboard walkthrough: page changes and scroll animation only.
// Usage: node record2.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = 'http://localhost:5180/';
const API = 'http://localhost:3101';
const FRAMES = join(OUT, 'frames2');
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const mode = (m) =>
  fetch(API + '/api/simulator/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: m, profile: 'AC230' }),
  });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1.2,
});
const page = await context.newPage();
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = 'html{scroll-behavior:smooth}';
    document.head.appendChild(s);
  });
});

// Populate the event log with one condition that has already recovered.
await mode('OVERVOLTAGE');
await new Promise((r) => setTimeout(r, 6000));
await mode('NORMAL');
await new Promise((r) => setTimeout(r, 20000));

await page.goto(URL);
await page.getByRole('status').filter({ hasText: 'LIVE' }).waitFor({ timeout: 15000 });
await page.evaluate(() => document.fonts.ready);
await page.mouse.move(1599, 899);
await page.waitForTimeout(1500);

const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(FRAMES, String(frames.length).padStart(6, '0') + '.jpg');
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});

const wait = (ms) => page.waitForTimeout(ms);
const nav = (name) =>
  page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name, exact: true });
// Eased scroll to an absolute position over `ms`.
const glide = (top, ms = 2500) =>
  page.evaluate(([to, dur]) => new Promise((done) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const from = scrollY, start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      scrollTo(0, from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else { document.documentElement.style.scrollBehavior = ''; done(); }
    };
    requestAnimationFrame(step);
  }), [top, ms]);
const yOf = (sel, offset = 24) =>
  page.evaluate(([s, o]) => document.querySelector(s).getBoundingClientRect().top + scrollY - o, [sel, offset]);
const bottom = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });

// Overview
await wait(7000);
await glide(await bottom(), 9000);
await wait(2500);
await glide(0, 4000);
await wait(3000);

// Telemetry page
await nav('Telemetry').click();
await wait(1200);
await glide(await yOf('#telemetry'), 1800);
await wait(3500);
for (const tab of ['Current', 'Power', 'Temperature', 'Voltage']) {
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await wait(3500);
}
await glide((await yOf('#telemetry')) + 420, 2500);
await wait(4000);

// Events page
await nav('Events').click();
await wait(1200);
await glide(await yOf('#events'), 1800);
await wait(3000);
await page.getByRole('tab', { name: /Recent history/ }).click();
await wait(5000);
await page.getByRole('tab', { name: /Active conditions/ }).click();
await wait(2500);

// Device page
await nav('Device').click();
await wait(1200);
await glide(await yOf('#device'), 1800);
await wait(6000);

// Back to overview
await nav('Overview').click();
await wait(1000);
await glide(0, 2500);
await wait(6000);

await cdp.send('Page.stopScreencast');
await wait(300);
await browser.close();

const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
  lines.push(`file '${frames[i].file.replace(/\\/g, '/')}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`);
}
lines.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
writeFileSync(join(OUT, 'frames2.txt'), lines.join('\n'));
console.log(`frames=${frames.length} seconds=${(frames.at(-1).t - frames[0].t).toFixed(1)}`);
