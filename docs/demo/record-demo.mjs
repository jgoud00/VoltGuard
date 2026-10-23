// Records a narrated walkthrough of the VoltGuard dashboard via CDP screencast.
// Usage: node record.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = 'http://localhost:5180/';
const API = 'http://localhost:3101';
const FRAMES = join(OUT, 'frames');
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1.2,
  acceptDownloads: true,
});
const page = await context.newPage();

// Overlay: visible cursor, click ripple, caption bar and title cards.
await page.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      html { scroll-behavior: smooth; }
      #__demo-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
        pointer-events: none; transform: translate(-100px,-100px); transition: transform 40ms linear; }
      .__demo-ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
        border: 3px solid #e0a32e; z-index: 2147483646; pointer-events: none; animation: __rip 600ms ease-out forwards; }
      @keyframes __rip { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
      #__demo-caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(20px);
        max-width: 1100px; padding: 14px 26px; border-radius: 12px; background: rgba(16,38,30,.92); color: #fff;
        font: 500 20px/1.35 Inter, system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.25);
        z-index: 2147483645; pointer-events: none; opacity: 0; transition: opacity 300ms, transform 300ms; text-align: center; }
      #__demo-caption.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      #__demo-caption small { display: block; margin-top: 4px; font-size: 15px; opacity: .75; font-weight: 400; }
      #__demo-card { position: fixed; inset: 0; z-index: 2147483644; pointer-events: none; display: flex;
        flex-direction: column; align-items: center; justify-content: center; gap: 14px;
        background: radial-gradient(circle at 50% 40%, #1f4a3a, #0f241c 70%); color: #fff;
        font-family: Inter, system-ui, sans-serif; opacity: 0; transition: opacity 600ms; text-align: center; }
      #__demo-card.show { opacity: 1; }
      #__demo-card h1 { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -1px; }
      #__demo-card p { margin: 0; font-size: 24px; opacity: .85; max-width: 1000px; }
      #__demo-card .tag { margin-top: 18px; font-size: 16px; letter-spacing: 3px; color: #e0c27a; }`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const caption = document.createElement('div');
    caption.id = '__demo-caption';
    const card = document.createElement('div');
    card.id = '__demo-card';
    document.body.append(cursor, caption, card);
    addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
    }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = '__demo-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    // Keep overlays above Radix portals that are appended later.
    new MutationObserver(() => {
      if (document.body.lastElementChild !== card)
        document.body.append(caption, cursor, card);
    }).observe(document.body, { childList: true });
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', install);
  else install();
});

// --- recording -------------------------------------------------------------
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(FRAMES, String(frames.length).padStart(6, '0') + '.jpg');
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});

const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: 800, y: 450 };
async function moveTo(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function point(locator, ms = 700) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(locator, pause = 350) {
  await point(locator);
  await wait(pause);
  await locator.click();
}
async function caption(text, sub = '') {
  await page.evaluate(([t, s]) => {
    const c = document.getElementById('__demo-caption');
    c.innerHTML = t + (s ? `<small>${s}</small>` : '');
    c.classList.add('show');
  }, [text, sub]);
}
const hideCaption = () =>
  page.evaluate(() => document.getElementById('__demo-caption').classList.remove('show'));
async function card(title, text, tag) {
  await page.evaluate(([a, b, c]) => {
    const el = document.getElementById('__demo-card');
    el.innerHTML = `<h1>${a}</h1><p>${b}</p>${c ? `<div class="tag">${c}</div>` : ''}`;
    el.classList.add('show');
  }, [title, text, tag]);
}
const hideCard = () =>
  page.evaluate(() => document.getElementById('__demo-card').classList.remove('show'));
const scrollToY = (y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
const scrollToEl = (sel, offset = 20) =>
  page.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - o, behavior: 'smooth' });
  }, [sel, offset]);
const status = page.locator('.status').first();

async function setMode(name) {
  const trigger = page.getByRole('button', { name: 'Simulation', exact: true });
  await click(trigger);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await wait(600);
  await click(dialog.getByRole('button', { name, exact: true }));
  await wait(900);
  await click(dialog.getByRole('button', { name: 'Return to monitoring' }));
  await dialog.waitFor({ state: 'hidden' });
}
async function setProfile(label) {
  const trigger = page.getByRole('button', { name: 'Simulation', exact: true });
  await click(trigger);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await wait(500);
  await click(dialog.getByRole('combobox', { name: 'Monitoring profile' }));
  await wait(500);
  await click(page.getByRole('option', { name: label, exact: true }));
  await wait(700);
  return dialog;
}

// Start from a clean, healthy AC230 normal state.
await fetch(API + '/api/simulator/mode', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:5180' },
  body: JSON.stringify({ mode: 'NORMAL', profile: 'AC230' }),
});
await page.goto(URL);
await page.getByRole('status').filter({ hasText: 'LIVE' }).waitFor({ timeout: 15000 });
await page.evaluate(() => document.fonts.ready);
await wait(1500);

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });

// 1. Title card
await card(
  'VoltGuard',
  'IoT Energy &amp; Battery Monitoring Dashboard — working prototype',
  'ESP32 → MQTT → EXPRESS → DATABASE → WEBSOCKET → REACT',
);
await wait(4500);
await page.evaluate(() => {
  const el = document.getElementById('__demo-card');
  el.innerHTML = `<h1 style="font-size:44px">Live demo</h1><p>Sensor readings are generated by the VoltGuard device simulator and published over MQTT through the same pipeline used by the ESP32 firmware.</p>`;
});
await wait(4500);
await hideCard();
await wait(800);

// 2. Overview
await caption('Energy overview', 'Live voltage, current, power, temperature and energy — updated every second over WebSocket');
await moveTo(700, 250);
await wait(3000);
for (const name of ['voltage', 'current', 'power', 'temperature', 'energy']) {
  await point(page.locator(`[data-metric=${name}]`), 600);
  await wait(900);
}
await point(page.getByRole('status'));
await caption('Connection status: LIVE', 'MQTT broker and live WebSocket connection are both active');
await wait(3500);

// 3. Signal analysis
await scrollToEl('#telemetry', 70);
await wait(1200);
await caption('Signal analysis', 'Real-time chart of the selected signal with min / max / window average');
await wait(3500);
for (const tab of ['Current', 'Power', 'Temperature', 'Voltage']) {
  await click(page.getByRole('tab', { name: tab, exact: true }));
  await wait(2200);
}
await caption('Adjustable sample window', 'Zoom the chart to the last 30, 60 or 100 samples');
await click(page.getByRole('combobox', { name: 'Chart sample window' }));
await wait(700);
await click(page.getByRole('option', { name: 'Last 30 samples', exact: true }));
await wait(3000);

await caption('Device inspector', 'Device health, data source, last receipt, signal age and transport status');
await point(page.locator('#device'));
await wait(4000);

await scrollToY(page.viewportSize().height * 0.9);
await caption('Individual signal trends', 'Current, power and temperature charts side by side');
await moveTo(800, 500);
await wait(4000);

// 4. Fault injection: overvoltage
await scrollToY(0);
await wait(1000);
await caption('Fault simulation', 'Inject an abnormal condition into the telemetry stream');
await setMode('Overvoltage');
await caption('Overvoltage detected', 'Voltage above the 250 V limit → status changes to CRITICAL and an alert is raised');
await status.filter({ hasText: 'CRITICAL' }).waitFor({ timeout: 10000 }).catch(() => {});
await point(page.locator('[data-metric=voltage]'));
await wait(3500);
await scrollToEl('#events', 70);
await wait(1500);
await caption('Event log', 'Active alert recorded with the measured value and the threshold it crossed');
await point(page.locator('.alert').first());
await wait(4500);

// 5. Other faults
await scrollToY(0);
await wait(900);
for (const [name, text] of [
  ['Undervoltage', 'Voltage below the 210 V limit'],
  ['Overcurrent', 'Load current above the 10 A limit'],
  ['Overtemperature', 'Temperature above the 50 °C limit'],
]) {
  await caption(`Simulating: ${name}`, text);
  await setMode(name);
  await status.filter({ hasText: 'CRITICAL' }).waitFor({ timeout: 10000 }).catch(() => {});
  await wait(3500);
}
await scrollToEl('#events', 70);
await wait(1500);
await caption('Alerts are de-duplicated per condition', 'One event per continuously active condition');
await wait(4000);

// 6. Recovery
await scrollToY(0);
await wait(900);
await caption('Return to normal operation', 'Readings back inside limits → alerts are automatically resolved');
await setMode('Normal operation');
await status.filter({ hasText: 'HEALTHY' }).waitFor({ timeout: 10000 }).catch(() => {});
await wait(3000);
await scrollToEl('#events', 70);
await wait(1500);
await click(page.getByRole('tab', { name: /Recent history/ }));
await caption('Recent history', 'Every fault is kept with its active → recovered timeline');
await wait(5000);
await click(page.getByRole('tab', { name: /Active conditions/ }));
await wait(1500);

// 7. Device offline
await scrollToY(0);
await wait(900);
await caption('Device offline detection', 'If the device stops publishing, the dashboard flags it within 5 seconds');
await setMode('Device offline');
await point(page.getByRole('status'));
await page.getByRole('status').filter({ hasText: 'OFFLINE' }).waitFor({ timeout: 15000 }).catch(() => {});
await wait(3500);
await caption('Device back online', 'Telemetry resumes and history continues without gaps in the dashboard');
await setMode('Normal operation');
await page.getByRole('status').filter({ hasText: 'LIVE' }).waitFor({ timeout: 15000 }).catch(() => {});
await point(page.getByRole('status'));
await wait(3500);

// 8. Battery profile
await caption('Battery monitoring profile', 'The same dashboard supports 6 V / 12 V lead-acid batteries');
let dialog = await setProfile('12 V lead-acid');
await click(dialog.getByRole('button', { name: 'Return to monitoring' }));
await dialog.waitFor({ state: 'hidden' });
await wait(2500);
await caption('State of charge &amp; battery health', 'SoC and SoH tracked alongside voltage, current and temperature');
await point(page.locator('.battery-details').first());
await wait(4000);
await caption('Simulating: Low battery', 'State of charge below 20% raises a warning');
await setMode('Low battery');
await wait(5000);
await setMode('Normal operation');
await wait(1500);
dialog = await setProfile('230 V electrical');
await click(dialog.getByRole('button', { name: 'Return to monitoring' }));
await dialog.waitFor({ state: 'hidden' });
await wait(2000);

// 9. Export
await caption('Export readings', 'Download retained telemetry as CSV for reports and analysis');
const download = page.waitForEvent('download');
await click(page.getByRole('button', { name: 'Export readings' }));
const file = await download;
await file.saveAs(join(OUT, file.suggestedFilename()));
await wait(3000);
await hideCaption();

// 10. Outro
await moveTo(1500, 800);
await card(
  'VoltGuard',
  'Real-time monitoring · Fault detection &amp; alerts · Event history · Offline detection · CSV export',
  'REACT · NODE.JS / EXPRESS · MQTT · WEBSOCKET · MONGODB · CHART.JS',
);
await wait(5000);

await cdp.send('Page.stopScreencast');
await wait(300);
await browser.close();

// Build ffmpeg concat list using real frame timestamps.
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
  lines.push(`file '${frames[i].file.replace(/\\/g, '/')}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`);
}
lines.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
writeFileSync(join(OUT, 'frames.txt'), lines.join('\n'));
console.log(`frames=${frames.length} seconds=${(frames.at(-1).t - frames[0].t).toFixed(1)}`);
