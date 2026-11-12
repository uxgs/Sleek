// Renders the film deck's pictures from art/art.html into art/*.webp (3200×1800).
//   node tools/film/art.mjs [--base http://127.0.0.1:8100]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://127.0.0.1:8100'), port = 9446, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=' + port,
  '--user-data-dir=' + path.join(os.tmpdir(), 'sleek-film-art'), '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
let tab; for (let i = 0; i < 60 && !tab; i++) { try { tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch (e) { await sleep(150); } }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const waits = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m.result); waits.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const n = ++id; waits.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
const only = arg('only', '');
const SCREENS = [['art.html', 'today'], ['art.html', 'workout'], ['art.html', 'plan'], ['art2.html', 'overview'], ['art2.html', 'spending'], ['art2.html', 'cards'], ['art2.html', 'explore'], ['art2.html', 'trip']];
for (const [page, screen] of SCREENS) for (const mode of ['after', 'before']) {
  if (only && !only.split(',').includes(screen)) continue;
  await send('Page.navigate', { url: `${base}/tools/film/art/${page}?screen=${screen}&mode=${mode}` });
  await sleep(600); await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))', awaitPromise: true });
  const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 92 });
  const file = path.join(here, 'art', `${screen}-${mode}.webp`); fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024) + ' KB');
}
chrome.kill(); process.exit(0);
