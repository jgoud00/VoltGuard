// Generates a breadboard wiring illustration of the VoltGuard hardware as SVG.
// Wiring follows docs/ESP32_INTEGRATION.md and firmware/voltguard_esp32.
import { writeFileSync } from 'node:fs';

const W = 1800, H = 1120;
const P = 20, X0 = 420;              // hole pitch, first column x
const col = (c) => X0 + c * P;        // column 0..49
const ROW = { a: 420, b: 440, c: 460, d: 480, e: 500, f: 560, g: 580, h: 600, i: 620, j: 640 };
const RAIL = { tp: 350, tn: 372, bp: 690, bn: 712 };
const out = [];
const add = (s) => out.push(s);

// ---------- helpers ----------
function hole(x, y) {
  add(`<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1.5" fill="#3b3f45"/>`);
}
function wire(d, color, w = 6) {
  add(`<path d="${d}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="${w + 3}" stroke-linecap="round" transform="translate(2,3)"/>`);
  add(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`);
  add(`<path d="${d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="${w / 3}" stroke-linecap="round" transform="translate(-1,-1)"/>`);
}
function pinEnd(x, y) {
  add(`<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1" fill="#c9cdd2" stroke="#6b7076" stroke-width="1"/>`);
}
const BANDS = { '10k': ['#7a4a1d', '#111', '#f07d00', '#c9a227'], '4.7k': ['#f2c200', '#7b3fb5', '#d7262e', '#c9a227'] };
function resistor(x1, y1, x2, y2, value) {
  const horiz = y1 === y2;
  add(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa0a6" stroke-width="3"/>`);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = 46, T = 16;
  const g = horiz ? `translate(${mx},${my})` : `translate(${mx},${my}) rotate(90)`;
  const bands = BANDS[value].map((c, i) =>
    `<rect x="${-15 + i * 8 + (i === 3 ? 6 : 0)}" y="${-T / 2}" width="4" height="${T}" fill="${c}"/>`).join('');
  add(`<g transform="${g}"><rect x="${-L / 2}" y="${-T / 2}" width="${L}" height="${T}" rx="7" fill="#e3c99a" stroke="#b39466" stroke-width="1"/>${bands}</g>`);
  pinEnd(x1, y1); pinEnd(x2, y2);
}
function label(x, y, text, opts = {}) {
  const { size = 15, weight = 600, color = '#1d2a36', anchor = 'start' } = opts;
  add(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text>`);
}
function tag(x, y, text, fill = '#ffffff', color = '#1d2a36', anchor = 'middle') {
  const w = text.length * 7.6 + 16;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  add(`<rect x="${left}" y="${y - 14}" width="${w}" height="21" rx="5" fill="${fill}" stroke="rgba(0,0,0,.18)"/>`);
  add(`<text x="${left + w / 2}" y="${y + 1}" font-size="13" font-weight="600" fill="${color}" text-anchor="middle" font-family="'IBM Plex Mono',Consolas,monospace">${text}</text>`);
}

// ---------- background & title ----------
add(`<rect width="${W}" height="${H}" fill="#eef3f8"/>`);
add(`<rect x="0" y="0" width="${W}" height="92" fill="#0f3d6e"/>`);
label(40, 56, 'VoltGuard — Breadboard Hardware Layout', { size: 32, weight: 800, color: '#fff' });
label(W - 40, 56, 'ESP32 · 2S Li-ion · Voltage sensor · ACS712-05A · DS18B20', { size: 17, weight: 500, color: '#cfe3ff', anchor: 'end' });

// ---------- breadboard ----------
add(`<rect x="388" y="322" width="1044" height="414" rx="10" fill="rgba(0,0,0,.12)" transform="translate(4,6)"/>`);
add(`<rect x="388" y="322" width="1044" height="414" rx="10" fill="#f7f5ef" stroke="#d8d3c4" stroke-width="2"/>`);
add(`<rect x="388" y="522" width="1044" height="16" fill="#e9e5d9"/>`);
for (const [y, c] of [[338, '#d7262e'], [384, '#1f5fbf'], [678, '#d7262e'], [724, '#1f5fbf']])
  add(`<line x1="410" y1="${y}" x2="1410" y2="${y}" stroke="${c}" stroke-width="2"/>`);
label(398, 355, '+', { size: 16, weight: 800, color: '#d7262e' });
label(398, 377, '−', { size: 16, weight: 800, color: '#1f5fbf' });
label(398, 695, '+', { size: 16, weight: 800, color: '#d7262e' });
label(398, 717, '−', { size: 16, weight: 800, color: '#1f5fbf' });
for (const y of Object.values(RAIL))
  for (let c = 0; c < 50; c++) if (c % 6 !== 5) hole(col(c), y);
for (const y of Object.values(ROW)) for (let c = 0; c < 50; c++) hole(col(c), y);
for (const [r, y] of Object.entries(ROW)) label(404, y + 4, r, { size: 10, weight: 500, color: '#9a9586' });
for (let c = 0; c < 50; c += 5) label(col(c), 412, String(c + 1), { size: 9, weight: 500, color: '#9a9586', anchor: 'middle' });
tag(1360, 312, '5 V rail', '#fde7e7', '#a51d24');
tag(1240, 312, 'GND rail', '#e5eefc', '#1f4f9a');
tag(1360, 760, '3.3 V rail', '#fde7e7', '#a51d24');
tag(1240, 760, 'GND rail', '#e5eefc', '#1f4f9a');

// ---------- ESP32 DevKit (pins on rows b and i, cols 2..20) ----------
const TOP = ['3V3', 'EN', 'VP', 'VN', '34', '35', '32', '33', '25', '26', '27', '14', '12', 'GND', '13', 'D2', 'D3', 'CMD', '5V'];
const BOT = ['GND', '23', '22', 'TX', 'RX', '21', 'GND', '19', '18', '5', '17', '16', '4', '0', '2', '15', 'D1', 'D0', 'CLK'];
add(`<rect x="440" y="428" width="420" height="204" rx="8" fill="rgba(0,0,0,.25)" transform="translate(4,6)"/>`);
add(`<rect x="440" y="428" width="420" height="204" rx="8" fill="#1d2329" stroke="#0c0f12" stroke-width="2"/>`);
add(`<rect x="452" y="466" width="40" height="128" rx="3" fill="#232b33" stroke="#3a454f"/>`);
add(`<path d="M460 476 h24 v12 h-24 v12 h24 v12 h-24 v12 h24 v12 h-24 v12 h24 v12 h-24" fill="none" stroke="#c9a227" stroke-width="2.5"/>`);
add(`<rect x="494" y="462" width="176" height="136" rx="5" fill="url(#shield)" stroke="#8d949b"/>`);
label(582, 520, 'ESP32-WROOM-32', { size: 14, weight: 700, color: '#3c434a', anchor: 'middle' });
label(582, 540, 'Wi-Fi + BT', { size: 11, weight: 500, color: '#5b636b', anchor: 'middle' });
add(`<rect x="700" y="492" width="56" height="56" rx="3" fill="#111"/><rect x="772" y="470" width="22" height="16" rx="2" fill="#ddd"/><rect x="772" y="574" width="22" height="16" rx="2" fill="#ddd"/>`);

label(783, 602, 'BOOT', { size: 9, color: '#bbb', anchor: 'middle' });
add(`<rect x="836" y="512" width="38" height="36" rx="4" fill="#b8bec4" stroke="#6b7076"/>`);
add(`<circle cx="812" cy="530" r="4" fill="#ff3b3b"/><circle cx="812" cy="530" r="9" fill="rgba(255,59,59,.25)"/>`);
TOP.forEach((n, i) => {
  pinEnd(col(i + 2), ROW.b);
  label(col(i + 2), 456, n, { size: 8.5, weight: 600, color: '#e8e8e8', anchor: 'middle' });
});
BOT.forEach((n, i) => {
  pinEnd(col(i + 2), ROW.i);
  label(col(i + 2), 611, n, { size: 8.5, weight: 600, color: '#e8e8e8', anchor: 'middle' });
});


// ---------- off-board modules ----------
// 2S Li-ion battery holder
add(`<rect x="60" y="140" width="300" height="150" rx="10" fill="#1b1b1b"/>`);
for (const y of [158, 222]) {
  add(`<rect x="78" y="${y}" width="250" height="52" rx="10" fill="url(#cell)"/>`);
  add(`<rect x="328" y="${y + 16}" width="10" height="20" rx="2" fill="#c9cdd2"/>`);
  label(203, y + 32, '18650  3.7 V', { size: 14, weight: 700, color: '#e9f3ff', anchor: 'middle' });
}


// Voltage sensor module (30k / 7.5k divider, ratio 5)
add(`<rect x="505" y="150" width="140" height="140" rx="6" fill="#c8102e" stroke="#7d0a1c" stroke-width="2"/>`);
add(`<rect x="525" y="150" width="100" height="34" rx="3" fill="#1f8f4e"/><circle cx="550" cy="167" r="9" fill="#d8dde2" stroke="#666"/><circle cx="600" cy="167" r="9" fill="#d8dde2" stroke="#666"/>`);
add(`<path d="M545 172l10-10M595 172l10-10" stroke="#555" stroke-width="2"/>`);
label(550, 200, 'VCC', { size: 10, color: '#fff', anchor: 'middle' });
label(600, 200, 'GND', { size: 10, color: '#fff', anchor: 'middle' });
add(`<rect x="530" y="218" width="40" height="12" rx="3" fill="#e3c99a"/><rect x="580" y="218" width="40" height="12" rx="3" fill="#e3c99a"/>`);
label(575, 252, '30k / 7.5k', { size: 11, weight: 700, color: '#fff', anchor: 'middle' });
[['S', 540], ['+', 575], ['−', 610]].forEach(([n, x]) => {
  add(`<rect x="${x - 4}" y="278" width="8" height="24" fill="#c9cdd2"/>`);
  label(x, 272, n, { size: 12, weight: 700, color: '#fff', anchor: 'middle' });
});


// ACS712-05A current sensor
add(`<rect x="905" y="150" width="160" height="140" rx="6" fill="#1653b8" stroke="#0b2f6b" stroke-width="2"/>`);
add(`<rect x="925" y="150" width="100" height="34" rx="3" fill="#1f8f4e"/><circle cx="950" cy="167" r="9" fill="#d8dde2" stroke="#666"/><circle cx="1000" cy="167" r="9" fill="#d8dde2" stroke="#666"/>`);
add(`<path d="M945 172l10-10M995 172l10-10" stroke="#555" stroke-width="2"/>`);
label(950, 200, 'IP+', { size: 10, color: '#fff', anchor: 'middle' });
label(1000, 200, 'IP−', { size: 10, color: '#fff', anchor: 'middle' });
add(`<rect x="958" y="212" width="54" height="30" rx="2" fill="#111"/>`);
label(985, 231, 'ACS712', { size: 9, weight: 700, color: '#ddd', anchor: 'middle' });
label(1040, 232, '5A', { size: 11, weight: 700, color: '#fff', anchor: 'middle' });
[['VCC', 940], ['OUT', 980], ['GND', 1020]].forEach(([n, x]) => {
  add(`<rect x="${x - 4}" y="278" width="8" height="24" fill="#c9cdd2"/>`);
  label(x, 272, n, { size: 9.5, weight: 700, color: '#fff', anchor: 'middle' });
});


// ---------- wiring (drawn under on-board parts) ----------
const RED = '#e0262e', BLACK = '#25282c', YEL = '#f2b705', GRN = '#1fa35a', ORG = '#f07d00', PUR = '#7d4cc4', BLU = '#2a7de1', WHT = '#d9dde2';

// Battery leads
wire(`M338 184 C 420 184 470 120 550 158`, RED);
wire(`M338 184 C 470 100 860 90 950 158`, RED);
wire(`M338 248 C 420 250 520 120 600 158`, BLACK);
wire(`M338 248 C 380 260 410 300 420 ${RAIL.tn}`, BLACK);

// Voltage sensor pins
wire(`M540 302 C 540 360 545 380 ${col(4)} ${ROW.a}`, GRN);          // S -> GPIO34
wire(`M610 302 C 612 330 620 350 620 ${RAIL.tn}`, BLACK);           // - -> GND rail

// ACS712 pins and load path
wire(`M940 302 C 940 320 940 330 940 ${RAIL.tp}`, RED);             // VCC -> 5 V
wire(`M1020 302 C 1020 330 1020 350 1020 ${RAIL.tn}`, BLACK);       // GND -> GND
wire(`M980 302 C 980 360 980 390 ${col(28)} ${ROW.a}`, ORG);        // OUT -> divider
wire(`M1000 158 C 1100 110 1200 250 ${col(40)} ${ROW.a}`, RED);     // IP- -> load

// ESP32 power
wire(`M${col(20)} ${ROW.a} C ${col(20)} 395 ${col(20)} 370 ${col(20)} ${RAIL.tp}`, RED);   // 5V
wire(`M${col(15)} ${ROW.a} C ${col(15)} 400 ${col(15)} 385 ${col(15)} ${RAIL.tn}`, BLACK); // GND
wire(`M${col(2)} ${ROW.a} C 395 400 380 650 ${col(0)} ${RAIL.bp}`, RED);                  // 3V3 -> bottom rail
wire(`M${col(2)} ${ROW.j} C ${col(2)} 670 ${col(2)} 690 ${col(2)} ${RAIL.bn}`, BLACK);    // GND -> bottom GND

// Divider junction (col 33) -> GPIO35
wire(`M${col(33)} ${ROW.b} C 1060 392 620 390 ${col(7)} ${ROW.a}`, PUR);
wire(`M${col(38)} ${ROW.a} C ${col(38)} 400 ${col(38)} 385 ${col(38)} ${RAIL.tn}`, BLACK);

// DS18B20 (legs row f, cols 30..32)
wire(`M${col(30)} ${ROW.j} C ${col(30)} 670 ${col(30)} 690 ${col(30)} ${RAIL.bn}`, BLACK);
wire(`M${col(32)} ${ROW.j} C ${col(32)} 660 ${col(32)} 675 ${col(32)} ${RAIL.bp}`, RED);
wire(`M${col(36)} ${ROW.j} C ${col(36)} 660 ${col(36)} 675 ${col(36)} ${RAIL.bp}`, RED);
wire(`M${col(31)} ${ROW.j} C 1000 690 760 690 ${col(14)} ${ROW.j}`, YEL);                 // DQ -> GPIO4

// LED load cathode -> GND
wire(`M${col(46)} ${ROW.a} C ${col(46)} 400 ${col(46)} 385 ${col(46)} ${RAIL.tn}`, BLACK);

// ---------- on-board parts ----------
resistor(col(28), ROW.c, col(33), ROW.c, '10k');      // R1 divider
resistor(col(33), ROW.d, col(38), ROW.d, '10k');      // R2 divider to GND
resistor(col(31), ROW.h, col(36), ROW.h, '4.7k');     // DS18B20 pull-up
resistor(col(40), ROW.b, col(45), ROW.b, '10k');      // LED series

// DS18B20 TO-92
for (const c of [30, 31, 32]) add(`<line x1="${col(c)}" y1="548" x2="${col(c)}" y2="${ROW.f}" stroke="#9aa0a6" stroke-width="3"/>`);
add(`<path d="M${col(29) + 2} 548 L${col(33) - 2} 548 L${col(33) - 2} 526 Q${col(31)} 506 ${col(29) + 2} 526 Z" fill="#1a1a1a" stroke="#000"/>`);
label(col(31), 541, 'DS18B20', { size: 9, weight: 700, color: '#ddd', anchor: 'middle' });

// LED (anode col45, cathode col46, row e)
add(`<line x1="${col(45)}" y1="486" x2="${col(45)}" y2="${ROW.e}" stroke="#9aa0a6" stroke-width="3"/><line x1="${col(46)}" y1="486" x2="${col(46)}" y2="${ROW.e}" stroke="#9aa0a6" stroke-width="3"/>`);
add(`<circle cx="${col(45) + 10}" cy="470" r="22" fill="rgba(255,60,60,.25)"/>`);
add(`<path d="M${col(45) - 4} 488 h28 v-18 a14 14 0 0 0 -28 0 z" fill="#ff4d4d" stroke="#b81c1c"/>`);
add(`<ellipse cx="${col(45) + 5}" cy="466" rx="4" ry="6" fill="rgba(255,255,255,.6)"/>`);

// USB cable
wire(`M874 530 C 930 530 905 640 905 900 L 905 930`, '#4a4f55', 16);
add(`<rect x="889" y="928" width="32" height="34" rx="4" fill="#2b2f33"/><rect x="894" y="960" width="22" height="20" fill="#c9cdd2" stroke="#6b7076"/>`);
add(`<rect x="866" y="516" width="22" height="28" rx="4" fill="#2b2f33"/>`);

// ---------- callouts ----------
tag(col(4), 398, 'GPIO34', '#e3f7ea', '#11663a');
tag(col(7) + 26, 402, 'GPIO35', '#efe7fb', '#5b2fa3', 'start');
tag(col(14), 668, 'GPIO4', '#fff4d1', '#7a5a00');
tag(col(2) - 14, 400, '3V3', '#fde7e7', '#a51d24', 'end');
label(650, 768, 'ESP32 Dev Module (38-pin)', { size: 16, weight: 700, anchor: 'middle' });
tag(col(31), 504, 'DS18B20', '#fff', '#333');
tag(col(35) + 10, 508, 'R2 10 kΩ', '#fff', '#333');
tag(col(30) + 10, 446, 'R1 10 kΩ', '#fff', '#333');
tag(col(33) + 40, 628, '4.7 kΩ pull-up', '#fff', '#333', 'start');
tag(col(42) + 10, 520, '10 kΩ + LED load', '#fff', '#333');
label(935, 940, 'USB to laptop', { size: 15, weight: 700 });
label(935, 960, '5 V power + serial', { size: 13, weight: 500, color: '#555' });
[[210, 120, '2S Li-ion pack (7.4 V nominal)'], [575, 132, 'Voltage sensor (30k / 7.5k)'], [985, 132, 'ACS712-05A current sensor']].forEach(([x, y, t]) => {
  const w = t.length * 8.6 + 24;
  add(`<rect x="${x - w / 2}" y="${y - 19}" width="${w}" height="28" rx="14" fill="#fff" stroke="#c9d6e4"/>`);
  label(x, y, t, { size: 15, weight: 700, anchor: 'middle' });
});

// ---------- connection table ----------
const tx = 1470, ty = 140;
add(`<rect x="${tx}" y="${ty}" width="300" height="560" rx="12" fill="#fff" stroke="#c9d6e4"/>`);
add(`<rect x="${tx}" y="${ty}" width="300" height="44" rx="12" fill="#0f3d6e"/><rect x="${tx}" y="${ty + 30}" width="300" height="14" fill="#0f3d6e"/>`);
label(tx + 20, ty + 29, 'Connections', { size: 18, weight: 800, color: '#fff' });
const rows = [
  ['Voltage sensor', ''],
  ['  VCC / GND', 'Battery + / −'],
  ['  S', 'GPIO34 (ADC)'],
  ['  −', 'GND'],
  ['ACS712-05A', ''],
  ['  IP+ → IP−', 'Battery + → load'],
  ['  VCC / GND', '5 V (VIN) / GND'],
  ['  OUT', '10k/10k → GPIO35'],
  ['DS18B20', ''],
  ['  VDD / GND', '3.3 V / GND'],
  ['  DQ', 'GPIO4 + 4.7k pull-up'],
  ['Load', ''],
  ['  LED + 10 kΩ', 'IP− → GND'],
  ['Ground', ''],
  ['  Common', 'Battery −, ESP32, sensors'],
];
rows.forEach(([a, b], i) => {
  const y = ty + 76 + i * 32;
  const head = !b;
  label(tx + 20, y, a.trim(), { size: head ? 14 : 13, weight: head ? 800 : 500, color: head ? '#0f3d6e' : '#333' });
  if (b) label(tx + 280, y, b, { size: 12.5, weight: 600, color: '#1d2a36', anchor: 'end' });
  if (head && i) add(`<line x1="${tx + 16}" y1="${y - 20}" x2="${tx + 284}" y2="${y - 20}" stroke="#e3eaf2"/>`);
});

// ---------- legend ----------
const ly = 1000;
add(`<rect x="40" y="${ly}" width="1720" height="84" rx="12" fill="#fff" stroke="#c9d6e4"/>`);
label(64, ly + 32, 'Wire colours', { size: 15, weight: 800, color: '#0f3d6e' });
[[RED, 'Power (+)'], [BLACK, 'Ground'], [GRN, 'Voltage signal'], [ORG, 'Current sensor out'], [PUR, 'Divided current → ADC'], [YEL, '1-Wire data']].forEach(([c, t], i) => {
  const x = 64 + i * 200;
  add(`<line x1="${x}" y1="${ly + 58}" x2="${x + 36}" y2="${ly + 58}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`);
  label(x + 46, ly + 63, t, { size: 13, weight: 600, color: '#333' });
});
label(1740, ly + 32, 'Illustrative layout · pin map from firmware', { size: 13, weight: 500, color: '#667', anchor: 'end' });
label(1740, ly + 63, 'GPIO34 voltage · GPIO35 current · GPIO4 temperature', { size: 13, weight: 600, color: '#334', anchor: 'end' });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Segoe UI', Arial, sans-serif">
<defs>
  <linearGradient id="shield" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7eaed"/><stop offset="1" stop-color="#aeb4ba"/></linearGradient>
  <linearGradient id="cell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa3ff"/><stop offset=".5" stop-color="#1667c9"/><stop offset="1" stop-color="#0d3f80"/></linearGradient>
</defs>
${out.join('\n')}
</svg>`;
writeFileSync(process.argv[2], svg);
console.log('wrote', process.argv[2]);
