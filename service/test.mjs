/* Plays an owner and a few viewers against the service and checks what it says.
   Start the service (npm run dev), then: node test.mjs [http://127.0.0.1:8787] */
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.argv[2] || 'http://127.0.0.1:8787', WS = BASE.replace(/^http/, 'ws');
const code = () => randomBytes(16).toString('base64url');
const sha = s => createHash('sha256').update(s).digest('hex');
const post = async (path, body) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(name, ok, got){ if(!ok) failed++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got))); }

function open(path){
  return new Promise((res, rej) => {
    const ws = new WebSocket(WS + path), s = { ws, msgs: [], closed: null };
    ws.onopen = () => res(s);
    ws.onmessage = e => s.msgs.push(JSON.parse(e.data));
    ws.onclose = e => { s.closed = e.code; res(s); };
    ws.onerror = () => {};
    s.last = () => s.msgs[s.msgs.length - 1];
    s.send = o => ws.send(JSON.stringify(o));
  });
}
async function viewer(room, hello){ const v = await open('/v1/rooms/' + room + '/view'); if(hello) v.send(hello); return v; }
async function owner(room, key){ const o = await open('/v1/rooms/' + room + '/own'); o.send({ k: key }); await wait(150); return o; }

const room = code(), key = code(), w1 = code(), w2 = code();
console.log('service at ' + BASE);

console.log('registering');
let r = await post('/v1/rooms', { room, hash: sha(key) });
check('a new deck registers', r.status === 200 && r.body.ok, r);
r = await post('/v1/rooms', { room, hash: sha(key) });
check('registering it again with the same code is fine', r.status === 200, r);
r = await post('/v1/rooms', { room, hash: sha(code()) });
check('someone else cannot take it over', r.status === 409, r);
r = await post('/v1/rooms', { room: 'short', hash: sha(key) });
check('a malformed code is refused', r.status === 400, r);

console.log('an unregistered deck');
let v = await viewer(code(), { w: w1, s: 0 }); await wait(200);
check('its viewers are turned away for good (4404)', v.closed === 4404, v.closed);

console.log('the owner');
let bad = await owner(room, code()); await wait(150);
check('a wrong private code sees nothing', bad.closed === 4403 && bad.msgs.length === 0, [bad.closed, bad.msgs]);
const own = await owner(room, key);
check('the right code gets the state', own.last() && own.last().views === 0 && own.last().live.length === 0, own.last());

console.log('viewers');
const a = await viewer(room, { w: w1, s: 0 }); await wait(200);
check('one viewer shows as Viewer 1 on slide 1', own.last().live.length === 1 && own.last().live[0].no === 1 && own.last().live[0].s === 0, own.last());
check('one view, one person', own.last().views === 1 && own.last().people === 1, own.last());
a.send({ s: 1 }); a.send({ s: 2 }); a.send({ s: 3 }); await wait(200);
check('slide changes arrive', own.last().live[0].s === 3, own.last());
check('how far: one view reached slides 1 to 4', JSON.stringify(own.last().far) === '[1,1,1,1]', own.last().far);
a.send({ s: 1 }); await wait(150);
check('going back keeps how far they got', own.last().live[0].s === 1 && JSON.stringify(own.last().far) === '[1,1,1,1]', own.last());
const b = await viewer(room, { w: w2, s: 6 }); await wait(200);
check('a second viewer is Viewer 2', own.last().live.length === 2 && own.last().live[1].no === 2 && own.last().views === 2 && own.last().people === 2, own.last());
r = await post('/v1/counts', { decks: [{ room, key }, { room, key: code() }, { room: code(), key }] });
check('the start screen gets totals for its own deck only', r.body.counts[room] && r.body.counts[room].views === 2 && r.body.counts[room].live === 2 && Object.values(r.body.counts).filter(Boolean).length === 1, r.body);
a.ws.close(); await wait(250);
check('when one leaves, one is left, and the totals stay', own.last().live.length === 1 && own.last().live[0].no === 2 && own.last().views === 2, own.last());
check('how far now: two views, one to slide 4, one to slide 7', JSON.stringify(own.last().far) === '[2,2,2,2,1,1,1]', own.last().far);
const a2 = await viewer(room, { w: w1, s: 0 }); await wait(200);
check('the same person back again: three views, still two people, and Viewer 1 again', own.last().views === 3 && own.last().people === 2 && own.last().live.some(x => x.no === 1), own.last());
const a3 = await viewer(room, { w: w1, s: 2, again: true, far: 3 }); await wait(200);
check('a page reconnecting is not counted twice', own.last().views === 3 && own.last().live.length === 3, own.last());
a3.ws.close(); a2.ws.close(); await wait(250);

console.log('misuse');
const big = await viewer(room, null); big.ws.send('x'.repeat(400)); await wait(200);
check('a big message closes the connection', big.closed === 1009, big.closed);
const noisy = await viewer(room, { w: code(), s: 0 }); for(let i = 0; i < 40; i++) noisy.send({ s: i % 5 }); await wait(300);
check('a flood closes the connection', noisy.closed === 1008, noisy.closed);
const odd = await viewer(room, { w: 'x', s: 0 }); await wait(200);
check('a bad hello closes the connection', odd.closed === 1008, odd.closed);
r = await post('/v1/rooms/' + room + '/clear', { key: code() });
check('clearing needs the private code', r.status === 403, r);

console.log('clearing and stopping');
const before = own.last().views;
r = await post('/v1/rooms/' + room + '/clear', { key }); await wait(200);
check('clear leaves only who is here now (Viewer 2, who got to slide 7)', r.status === 200 && own.last().views === 1 && own.last().people === 1 && JSON.stringify(own.last().far) === '[1,1,1,1,1,1,1]', [before, own.last()]);
b.send({ s: 7 }); await wait(150); b.ws.close(); await wait(250);
check('after they leave: one view, as far as slide 8', own.last().live.length === 0 && JSON.stringify(own.last().far) === '[1,1,1,1,1,1,1,1]', own.last());
r = await post('/v1/rooms/' + room + '/stop', { key }); await wait(250);
check('stop answers, and the owner is disconnected', r.status === 200 && own.closed === 4404, [r, own.closed]);
v = await viewer(room, { w: w1, s: 0 }); await wait(200);
check('its pages are turned away afterwards', v.closed === 4404, v.closed);
r = await post('/v1/counts', { decks: [{ room, key }] });
check('and its totals are gone', r.body.counts[room] === null, r.body);

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
