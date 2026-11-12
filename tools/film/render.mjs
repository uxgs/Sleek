// Renders the film page one frame at a time in headless Chrome and pipes the frames to ffmpeg.
//
//   node tools/film/render.mjs --shape wide --out ~/film.mp4 [--from 0 --to 60] [--scale 1.3333]
//                              [--stills dir --every 30] [--page film.html] [--port 9444] [--base http://127.0.0.1:8100]
//
// The page (tools/film/film.html) exposes window.FILM:
//   ready            true once the app frames are loaded and the film can start
//   fps, duration    frames a second, and length in seconds
//   tick(t)          apply the cues due at t and draw the camera; returns { ptr:[x,y], inputs:[...] }
//                    inputs: { type:'down'|'up'|'key'|'wheel', ... } for the renderer to send as real input
//   cues()           the cue sheet (for the sound)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const shape = arg('shape', 'wide');
const [VW, VH] = shape === 'tall' ? [1080, 1920] : [1920, 1080];
const scale = +arg('scale', '1.3333333');
const port = +arg('port', '9444');
const base = arg('base', 'http://127.0.0.1:8100');
const page = arg('page', 'film.html');
const out = arg('out', '').replace(/^~/, os.homedir());
const stills = arg('stills', '').replace(/^~/, os.homedir());
const every = +arg('every', '30');
const at = arg('at', '') ? arg('at', '').split(',').map(Number) : null;   // stills at these times only
const prof = arg('profile', path.join(os.tmpdir(), 'sleek-film-profile'));
const query = arg('query', '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = arg('probe', ''), probeEvery = +arg('probe-every', '6');

// ---- Chrome ----
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb', '--disable-background-timer-throttling',
  '--disable-threaded-animation',          // animations are drawn from the page's own state, the one the clock sets, not by a separate thread with its own idea of time
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=' + VW + ',' + VH, 'about:blank'
], { stdio: 'ignore' });
const quit = () => { try { chrome.kill(); } catch (e) {} };
process.on('exit', quit); process.on('SIGINT', () => { quit(); process.exit(1); });

let ws, id = 0; const waits = new Map(); const logs = [];
async function connect() {
  let tab;
  for (let i = 0; i < 60; i++) {
    try { tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch (e) { await sleep(150); }
  }
  if (!tab) throw new Error('Chrome did not start');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  };
}
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waits.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
async function js(expr, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 160));
  return r.result.value;
}

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });   // always the files as they are now
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: scale, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(here, 'clock.js'), 'utf8') });
const url = `${base}/tools/film/${page}?shape=${shape}${query ? '&' + query : ''}`;
await send('Page.navigate', { url });
for (let i = 0; ; i++) {
  if (await js('!!(window.FILM && window.FILM.ready)').catch(() => false)) break;
  if (i > 400) { console.error('The film page never became ready.\n' + logs.join('\n')); quit(); process.exit(1); }
  await sleep(100);
}
await js('__film.free(false)', false);
const fps = await js('FILM.fps'), duration = await js('FILM.duration');
const from = at ? Math.min(...at) : +arg('from', '0'), to = at ? Math.max(...at) + 0.05 : Math.min(+arg('to', String(duration)), duration);
const atFrames = at && new Set(at.map(x => Math.round(x * fps)));
if (has('cues')) { fs.writeFileSync(arg('cues'), JSON.stringify(await js('FILM.cues()'), null, 1)); }

// ---- ffmpeg ----
let ff = null;
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', arg('crf', '12'), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
}
if (stills) fs.mkdirSync(stills, { recursive: true });

// ---- frames ----
const dt = 1000 / fps, f0 = Math.round(from * fps), f1 = Math.round(to * fps);
// a lead-in (a cue sheet's `lead`, in seconds): the clock runs with the film held at its first moment, and nothing is kept
const lead = +(await js('(FILM.timeline && FILM.timeline.lead) || 0'));
if (lead) await send('Emulation.setFocusEmulationEnabled', { enabled: true });   // the page counts as focused from now, so a window given focus in the lead-in hears about it then, not at the first click
for (let i = 0; i < Math.round(lead * fps); i++) {
  await js('FILM.tick(0)'); await js(`__film.step(${dt})`, false); await js('new Promise(r => __film.settle(r))');
}
let ptr = null; const t0 = Date.now();
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'none', buttons: 0 }, extra));
let held = 0;
// the film always runs from its start, so the app is in the right state when the wanted part begins
for (let f = 0; f < f1; f++) {
  const t = f / fps;
  const r = await js(`FILM.tick(${t})`);
  if (r && r.ptr && (r.kick || !ptr || ptr[0] !== r.ptr[0] || ptr[1] !== r.ptr[1])) {
    ptr = r.ptr; await mouse('mouseMoved', ptr[0], ptr[1], held ? { button: 'left', buttons: 1 } : {});
  }
  for (const i of (r && r.inputs) || []) {
    const [x, y] = i.at || ptr || [0, 0];
    if (i.type === 'down') { held = 1; await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: i.count || 1 }); }
    else if (i.type === 'up') { held = 0; await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: i.count || 1 }); }
    else if (i.type === 'wheel') await mouse('mouseWheel', x, y, { deltaX: i.dx || 0, deltaY: i.dy || 0 });
    else if (i.type === 'text') await send('Input.insertText', { text: i.text });
    else if (i.type === 'key') {
      const k = { key: i.key, code: i.code || '', windowsVirtualKeyCode: i.vk || 0, nativeVirtualKeyCode: i.vk || 0, modifiers: i.mod || 0 };
      await send('Input.dispatchKeyEvent', Object.assign({ type: i.text ? 'keyDown' : 'rawKeyDown' }, k, i.text ? { text: i.text } : {}));
      await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, k));
    }
  }
  await js(`__film.step(${dt})`, false);
  await js('new Promise(r => __film.settle(r))');
  await js(`FILM.after && FILM.after(${t})`, false);
  if (probe && f >= f0 && f % probeEvery === 0) console.log('\n' + t.toFixed(2) + '  ' + await js(probe));        // --probe: what the page says about itself, frame by frame
  if (f >= f0) {
    const wantStill = stills && (atFrames ? atFrames.has(f) : (f - f0) % every === 0);
    if (ff || wantStill) {
      const shot = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      const buf = Buffer.from(shot.data, 'base64');
      if (ff && !ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (wantStill) fs.writeFileSync(path.join(stills, 'f' + String(f).padStart(5, '0') + '.png'), buf);
    }
  }
  if (f % 120 === 0) process.stdout.write(`\r${t.toFixed(1)}s / ${to.toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)   `);
}
process.stdout.write('\n');
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
if (logs.length) console.log('page messages:\n' + [...new Set(logs)].slice(0, 30).join('\n'));
quit();
process.exit(0);
