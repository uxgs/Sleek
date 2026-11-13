/* The service behind Sleek's Viewers: who is viewing a published deck right now, and how many have.

   A deck is known here by two random codes Sleek makes when its owner switches Viewers on:
     room   public; it travels inside the published page
     key    private; it stays in the owner's browser. Only its SHA-256 is kept here.

   What a viewer's page sends: a random id for that browser (so two visits count as one person) and
   the number of the slide it is showing. What is kept, per deck: how many views, how many people,
   when it was last opened, and how many views got as far as each slide. No names, no addresses,
   nothing from the deck itself.

   Calls (all under /v1):
     POST /rooms                 { room, hash }       register a deck; the first hash wins
     POST /counts                { decks: [{ room, key }] }   totals for the start screen
     GET  /rooms/<room>/view     WebSocket, a viewer:  { w, s } then { s } as the slide changes
     GET  /rooms/<room>/own      WebSocket, the owner: { k } first, then it is sent the state
     POST /rooms/<room>/clear    { key }              forget the totals
     POST /rooms/<room>/stop     { key }              forget the deck; its pages stop being counted

   Each deck is one Durable Object (Room), asleep whenever nobody is connected. */
import { DurableObject } from 'cloudflare:workers';

const ROOM = /^[A-Za-z0-9_-]{16,40}$/, HASH = /^[0-9a-f]{64}$/, KEY = /^[A-Za-z0-9_-]{16,80}$/, WHO = /^[A-Za-z0-9_-]{8,40}$/;
const MAX_LIVE = 100, MAX_SLIDES = 500, MAX_PEOPLE = 20000, MAX_MSG = 300, YEAR = 365 * 864e5;
const GONE = 4404, FULL = 4429, DENIED = 4403;      // close codes a page understands: stop trying
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };

function json(o, status){ return new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS) }); }
async function sha(s){
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
}
async function read(req){ try { const t = await req.text(); return t.length > 8000 ? null : JSON.parse(t); } catch(e){ return null; } }
// one address can only do so much a minute; the address is used for this and never kept
async function tooMany(limiter, req){
  if(!limiter) return false;
  try { return !(await limiter.limit({ key: req.headers.get('cf-connecting-ip') || 'local' })).success; } catch(e){ return false; }
}
function slide(n){ return Number.isInteger(n) && n >= 0 && n < MAX_SLIDES ? n : -1; }

export default {
  async fetch(req, env){
    const url = new URL(req.url), p = url.pathname;
    if(req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if(p === '/') return json({ sleek: 'viewers', v: 1 });
    const room = function(id){ return env.ROOMS.get(env.ROOMS.idFromName(id)); };
    const ask = function(id, what, o){ return room(id).fetch('https://room/' + what, { method: 'POST', body: JSON.stringify(o || {}) }); };

    if(p === '/v1/rooms' && req.method === 'POST'){
      if(await tooMany(env.REGISTER, req)) return json({ error: 'slow down' }, 429);
      const b = await read(req);
      if(!b || !ROOM.test(b.room) || !HASH.test(b.hash)) return json({ error: 'bad request' }, 400);
      const r = await ask(b.room, 'register', { hash: b.hash });
      return json(await r.json(), r.status);
    }
    if(p === '/v1/counts' && req.method === 'POST'){
      const b = await read(req), list = b && Array.isArray(b.decks) ? b.decks.slice(0, 50) : null;
      if(!list) return json({ error: 'bad request' }, 400);
      const counts = {};
      await Promise.all(list.map(async function(d){
        if(!d || !ROOM.test(d.room) || !KEY.test(d.key)) return;
        const r = await ask(d.room, 'count', { key: d.key });
        // a deck listed twice, once with a wrong code: the right code's answer stands, whichever comes back first
        if(r.ok) counts[d.room] = await r.json(); else if(!(d.room in counts)) counts[d.room] = null;
      }));
      return json({ counts: counts });
    }
    const m = /^\/v1\/rooms\/([A-Za-z0-9_-]{16,40})\/(view|own|clear|stop)$/.exec(p);
    if(m){
      if(m[2] === 'view' || m[2] === 'own'){
        if(req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a WebSocket' }, 426);
        if(await tooMany(env.CONNECT, req)) return json({ error: 'slow down' }, 429);
        return room(m[1]).fetch(new Request('https://room/' + m[2], req));
      }
      if(req.method !== 'POST') return json({ error: 'not found' }, 404);
      const b = await read(req);
      if(!b || !KEY.test(b.key)) return json({ error: 'bad request' }, 400);
      const r = await ask(m[1], m[2], { key: b.key });
      return json(await r.json(), r.status);
    }
    return json({ error: 'not found' }, 404);
  }
};

export class Room extends DurableObject {
  constructor(ctx, env){ super(ctx, env); this.rate = new Map(); }

  async meta(){ if(this._meta === undefined) this._meta = (await this.ctx.storage.get('meta')) || null; return this._meta; }
  async stats(){ return (await this.ctx.storage.get('stats')) || { views: 0, people: 0, last: 0, far: [] }; }
  async owns(key){ const m = await this.meta(); return !!m && typeof key === 'string' && KEY.test(key) && (await sha(key)) === m.hash; }
  // the viewers connected now (not: one that is just closing)
  live(not){
    return this.ctx.getWebSockets('v').filter(function(ws){ return ws !== not; })
      .map(function(ws){ return { ws: ws, a: ws.deserializeAttachment() }; }).filter(function(x){ return x.a && x.a.in; });
  }
  // the totals, with whoever is here now counted in as far as they have got
  async state(not){
    const s = await this.stats(), far = s.far.slice(), live = this.live(not);
    live.forEach(function(x){ for(let i = x.a.base + 1; i <= x.a.far; i++) far[i] = (far[i] || 0) + 1; });
    for(let i = 0; i < far.length; i++) far[i] = far[i] || 0;
    return { live: live.map(function(x){ return { no: x.a.no, s: x.a.s, t: x.a.t }; }).sort(function(a, b){ return a.no - b.no; }),
             views: s.views, people: s.people, last: s.last, far: far };
  }
  async tell(not){
    const owners = this.ctx.getWebSockets('o').filter(function(ws){ const a = ws.deserializeAttachment(); return a && a.ok; });
    if(!owners.length) return;
    const msg = JSON.stringify(await this.state(not));
    owners.forEach(function(ws){ try { ws.send(msg); } catch(e){} });
  }
  socket(tag, attach, refuse){
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    if(refuse){ server.accept(); server.close(refuse, 'no'); }
    else { this.ctx.acceptWebSocket(server, [tag]); server.serializeAttachment(attach); }
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(req){
    const what = new URL(req.url).pathname.slice(1), meta = await this.meta();
    if(what === 'view'){
      if(!meta) return this.socket('v', null, GONE);
      if(this.ctx.getWebSockets('v').length >= MAX_LIVE) return this.socket('v', null, FULL);
      return this.socket('v', { in: false });
    }
    if(what === 'own') return meta ? this.socket('o', { ok: false }) : this.socket('o', null, GONE);

    const b = await read(req) || {};
    if(what === 'register'){
      if(meta) return json({ ok: meta.hash === b.hash }, meta.hash === b.hash ? 200 : 409);
      this._meta = { hash: b.hash, created: Date.now() };
      await this.ctx.storage.put('meta', this._meta);
      await this.ctx.storage.setAlarm(Date.now() + YEAR);
      return json({ ok: true });
    }
    if(!(await this.owns(b.key))) return json({ error: 'no' }, meta ? 403 : 404);
    if(what === 'count'){
      const s = await this.stats();
      return json({ views: s.views, people: s.people, last: s.last, live: this.live().length });
    }
    if(what === 'clear'){
      await this.forgetPeople();
      // whoever is here now starts the new count
      const live = this.live(), s = { views: live.length, people: 0, last: live.length ? Date.now() : 0, far: [] }, seen = {};
      for(const x of live){
        for(let i = 0; i <= x.a.far; i++) s.far[i] = (s.far[i] || 0) + 1;
        x.a.base = x.a.far; x.ws.serializeAttachment(x.a);
        if(!seen[x.a.w]){ seen[x.a.w] = true; s.people++; await this.ctx.storage.put('w:' + x.a.w, 1); }
      }
      await this.ctx.storage.put('stats', s);
      await this.tell();
      return json({ ok: true });
    }
    if(what === 'stop'){ await this.forget(); return json({ ok: true }); }
    return json({ error: 'not found' }, 404);
  }

  async forgetPeople(){
    for(;;){
      const keys = Array.from((await this.ctx.storage.list({ prefix: 'w:', limit: 128 })).keys());
      if(!keys.length) return;
      await this.ctx.storage.delete(keys);
    }
  }
  async forget(){
    this.ctx.getWebSockets().forEach(function(ws){ try { ws.close(GONE, 'gone'); } catch(e){} });
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this._meta = null;
  }
  // a deck nobody has opened for a year forgets itself
  async alarm(){
    const meta = await this.meta(); if(!meta) return;
    const s = await this.stats(), last = Math.max(s.last || 0, meta.created || 0);
    if(Date.now() - last >= YEAR && !this.live().length) await this.forget();
    else await this.ctx.storage.setAlarm(Math.max(Date.now() + 864e5, last + YEAR + 36e5));
  }

  async webSocketMessage(ws, msg){
    if(typeof msg !== 'string' || msg.length > MAX_MSG){ ws.close(1009, 'too big'); return; }
    // at most 20 messages in any five seconds
    const now = Date.now(), r = this.rate.get(ws) || { t: now, n: 0 };
    if(now - r.t > 5000){ r.t = now; r.n = 0; }
    r.n++; this.rate.set(ws, r);
    if(r.n > 20){ ws.close(1008, 'slow down'); return; }
    let d; try { d = JSON.parse(msg); } catch(e){ return; }
    if(!d || typeof d !== 'object') return;
    const a = ws.deserializeAttachment() || {};

    if(this.ctx.getTags(ws).indexOf('o') > -1){
      if(a.ok) return;
      if(!(await this.owns(d.k))){ ws.close(DENIED, 'no'); return; }
      ws.serializeAttachment({ ok: true });
      ws.send(JSON.stringify(await this.state()));
      return;
    }

    const s = slide(d.s); if(s < 0) return;
    if(a.in){
      if(s === a.s) return;
      a.s = s; if(s > a.far) a.far = s;
      ws.serializeAttachment(a);
      await this.tell();
      return;
    }
    // a viewer's first words: who (a random id), where, and whether this page was already counted
    if(typeof d.w !== 'string' || !WHO.test(d.w)){ ws.close(1008, 'bad hello'); return; }
    const used = this.live().map(function(x){ return x.a.no; });
    let no = 1; while(used.indexOf(no) > -1) no++;
    const again = d.again === true, base = again ? Math.max(0, slide(d.far)) : 0;
    ws.serializeAttachment({ in: true, no: no, w: d.w, s: s, far: Math.max(s, base), base: base, t: now });
    if(!again){
      const st = await this.stats();
      st.views++; st.far[0] = (st.far[0] || 0) + 1; st.last = now;
      if(!(await this.ctx.storage.get('w:' + d.w))){
        st.people++;
        if(st.people <= MAX_PEOPLE) await this.ctx.storage.put('w:' + d.w, 1);
      }
      await this.ctx.storage.put('stats', st);
    }
    await this.tell();
  }

  async left(ws){
    this.rate.delete(ws);
    let a = null; try { a = ws.deserializeAttachment(); } catch(e){}
    if(!a || !a.in) return;
    if(a.far > a.base && (await this.meta())){
      const st = await this.stats();
      for(let i = a.base + 1; i <= a.far; i++) st.far[i] = (st.far[i] || 0) + 1;
      for(let i = 0; i < st.far.length; i++) st.far[i] = st.far[i] || 0;
      await this.ctx.storage.put('stats', st);
    }
    await this.tell(ws);
  }
  async webSocketClose(ws, code){ await this.left(ws); try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch(e){} }
  async webSocketError(ws){ await this.left(ws); }
}
