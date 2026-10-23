import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function inline(value) {
  const code = [];
  let text = escape(value).replace(/`([^`]+)`/g, (_, content) => {
    code.push(`<code>${content}</code>`);
    return `@@CODE${code.length - 1}@@`;
  });
  text = text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return text.replace(/@@CODE(\d+)@@/g, (_, index) => code[index]);
}
function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [],
    toc = [];
  let paragraph = [],
    list = null;
  const flush = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flush();
      const code = [];
      while (++index < lines.length && !lines[index].startsWith('```'))
        code.push(lines[index]);
      html.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const id = `section-${index}`;
      if (level === 2) toc.push(`<a href="#${id}">${inline(heading[2])}</a>`);
      html.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      const rows = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        const row = lines[index++]
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());
        if (!row.every((cell) => /^:?-+:?$/.test(cell))) rows.push(row);
      }
      index--;
      html.push('<div class="table-wrap"><table>');
      rows.forEach((row, number) =>
        html.push(
          `<tr>${row.map((cell) => `<${number ? 'td' : 'th'}>${inline(cell)}</${number ? 'td' : 'th'}>`).join('')}</tr>`,
        ),
      );
      html.push('</table></div>');
      continue;
    }
    const item = line.match(/^(?:([-*]) |(\d+)\. )(.+)$/);
    if (item) {
      if (paragraph.length) {
        html.push(`<p>${inline(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
      const type = item[2] ? 'ol' : 'ul';
      if (list && list !== type) {
        html.push(`</${list}>`);
        list = null;
      }
      if (!list) {
        list = type;
        html.push(type === 'ol' ? `<ol start="${item[2]}">` : '<ul>');
      }
      html.push(`<li>${inline(item[3])}</li>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line === '---') {
      flush();
      html.push('<hr>');
      continue;
    }
    if (list && /^\s{2,}\S/.test(line) && html.at(-1)?.endsWith('</li>')) {
      html[html.length - 1] = html.at(-1).replace('</li>', ` ${inline(line.trim())}</li>`);
      continue;
    }
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
    paragraph.push(line);
  }
  flush();
  return { html: html.join('\n'), toc: toc.join('\n') };
}
const style = `
*{box-sizing:border-box}body{margin:0;background:#f4f5f1;color:#17251e;font:17px/1.65 Arial,sans-serif}
.top{background:#173c2d;color:white;padding:24px max(25px,calc((100vw - 1200px)/2));display:flex;gap:20px;align-items:center;justify-content:space-between}
.top strong{font-size:20px}.top button{background:#fff;border:0;border-radius:6px;padding:10px 15px;color:#173c2d;font-size:15px;cursor:pointer}
.layout{display:grid;grid-template-columns:245px minmax(0,900px);gap:30px;max-width:1240px;margin:28px auto;padding:0 24px}
nav{position:sticky;top:20px;align-self:start;max-height:90vh;overflow:auto;font-size:14px}nav a{display:block;padding:6px 8px;text-decoration:none;color:#26513b;border-left:2px solid #d5dfd7}
main{background:white;border:1px solid #dfe5df;border-radius:8px;padding:45px 48px;min-width:0}
h1{font-size:33px;line-height:1.2;color:#122d21;margin:0 0 24px}h2{font-size:24px;line-height:1.35;margin:40px 0 16px;scroll-margin-top:20px}h3{font-size:19px;line-height:1.4;margin:26px 0 10px;break-after:avoid}
p{margin:0 0 16px}a{color:#20634b}strong{font-weight:700}code{font:14px/1.5 Consolas,monospace;background:#edf3ee;padding:2px 4px;overflow-wrap:anywhere}pre{background:#edf3ee;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:5px;break-inside:avoid}pre code{padding:0}
table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.45;margin:16px 0}th{text-align:left;background:#e8f0e9}th,td{border:1px solid #d6e0d7;padding:10px;vertical-align:top}tr{break-inside:avoid}.table-wrap{overflow-x:auto}
li{margin:7px 0}hr{border:0;border-top:1px solid #dfe5df;margin:30px 0}.footer{font-size:13px;color:#58665d;margin-top:40px}
@media(max-width:850px){.layout{display:block;padding:0 12px}nav{position:static;margin-bottom:25px;max-height:250px}main{padding:28px 22px}.top{padding:18px;flex-wrap:wrap}}
@media print{@page{size:A4;margin:18mm}body{background:white;font-size:10.5pt;line-height:1.45;color:black}.top,nav{display:none}.layout{display:block;margin:0;padding:0}main{border:0;border-radius:0;padding:0}h1{font-size:23pt;color:black}h2{font-size:16pt;color:black;margin-top:22pt;break-after:avoid}h3{font-size:12pt;color:black;break-after:avoid}p{widows:3;orphans:3}table{font-size:9pt}pre,code{font-size:9pt}.footer{display:none}a{color:black;text-decoration:none}}
`;
for (const file of ['TEAM_SPEAKING_GUIDE', 'PPT_GENERATION_PROMPT']) {
  const path = resolve('docs/presentation', `${file}.md`);
  const { html, toc } = render(readFileSync(path, 'utf8'));
  const title =
    file === 'TEAM_SPEAKING_GUIDE'
      ? 'VoltGuard Team Speaking Guide'
      : 'VoltGuard PPT Generation Prompt';
  writeFileSync(
    resolve('docs/presentation', `${file}.html`),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${style}</style></head><body><div class="top"><strong>VoltGuard semester review</strong><button onclick="window.print()">Print or save PDF</button></div><div class="layout"><nav aria-label="Contents">${toc}</nav><main>${html}<p class="footer">Prepared October 7, 2026. Review the current hardware, services and team contributions before presenting.</p></main></div></body></html>`,
  );
  console.log(`Generated ${file}.html`);
}
