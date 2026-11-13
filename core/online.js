/* Sleek online: the one thing Sleek can do over the network, and only when you ask it to.

   Viewers: publish a deck with "See who's viewing" switched on and the page tells a small service
   when it is open and which slide is showing; Sleek then shows you who is viewing. The service is
   in service/ (its README says what it keeps). Until that switch is on for a deck, Sleek never calls
   out. With no address below, Viewers is hidden altogether: empty it for a copy that stays offline.

   A deck with Viewers on keeps, in its record in this browser (never in the deck itself, a .sleek
   file, a copy or a published page):
     viewers: { room, key, on, slides, since }
       room    the public code, which goes inside the published page
       key     the private code, which only this browser has; it is what lets you see the viewers
       slides  the slides' names as they were when it was last published, so "Viewer 1 is on
               slide 4" can be shown by name even after the deck is reordered */
(function(){
  var ADDRESS = 'https://sleek-viewers.sleek-app.workers.dev';   // the service's address; empty: Viewers is off
  var local = false;
  try { local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch(e){}
  // while developing, a local copy of Sleek can point at a local copy of the service
  try { if(local){ var dev = localStorage.getItem('sleek-online'); if(dev) ADDRESS = dev; } } catch(e){}
  ADDRESS = String(ADDRESS || '').replace(/\/+$/, '');
  var able = !!ADDRESS && !!window.WebSocket && !!window.fetch && !!(window.crypto && crypto.subtle && crypto.getRandomValues);
  var S = function(){ return window.SleekStore; };

  function code(){
    var b = crypto.getRandomValues(new Uint8Array(16)), s = '';
    for(var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function sha(s){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(d){
      return Array.prototype.map.call(new Uint8Array(d), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function post(path, body){
    return fetch(ADDRESS + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){
      return r.json().then(function(j){ return { ok: r.ok, status: r.status, body: j }; }, function(){ return { ok: r.ok, status: r.status, body: null }; });
    });
  }
  // what the service sends is only ever numbers; make sure of that before any of it reaches the page
  function num(n){ n = Math.floor(Number(n)); return n > 0 && isFinite(n) ? n : 0; }
  function cleanState(st){
    return { live: (Array.isArray(st.live) ? st.live : []).slice(0, 200).map(function(v){ return { no: num(v && v.no) || 1, s: num(v && v.s), t: num(v && v.t) }; }),
             views: num(st.views), people: num(st.people), last: num(st.last), far: (Array.isArray(st.far) ? st.far : []).slice(0, 500).map(num) };
  }
  function changed(id){ try { window.dispatchEvent(new CustomEvent('sleek-viewers', { detail: { id: id } })); } catch(e){} }

  // Switch Viewers on or off for a deck (the Share menu does this as it publishes). On: the deck gets
  // its two codes the first time, and the service is told about it every time, so a deck whose record
  // there has lapsed starts again. Rejects when the service can't be reached.
  function set(id, on, slides){
    return S().get(id).then(function(d){
      if(!d) return null;
      var v = d.viewers || null;
      if(!on){
        if(!v || !v.on) return v;
        v.on = false;
        return S().setViewers(id, v).then(function(){ changed(id); return v; });
      }
      if(!able) return Promise.reject(new Error('Viewers is not available here.'));
      v = v && v.room && v.key ? v : { room: code(), key: code(), since: Date.now() };
      return sha(v.key).then(function(h){ return post('/v1/rooms', { room: v.room, hash: h }); }).then(function(r){
        if(!r.ok) throw new Error('The viewer service said ' + r.status + '.');
        v.on = true; if(slides && slides.length) v.slides = slides.slice(0, 500);
        return S().setViewers(id, v).then(function(){ changed(id); return v; });
      });
    });
  }
  // totals for the start screen: { room: { views, people, last, live } }
  function counts(list){
    list = (list || []).filter(function(v){ return v && v.room && v.key; }).slice(0, 50);
    if(!able || !list.length) return Promise.resolve({});
    return post('/v1/counts', { decks: list.map(function(v){ return { room: v.room, key: v.key }; }) })
      .then(function(r){
        var got = (r.ok && r.body && r.body.counts) || {}, out = {};
        Object.keys(got).forEach(function(k){ var c = got[k]; if(c) out[k] = { views: num(c.views), people: num(c.people), last: num(c.last), live: num(c.live) }; });
        return out;
      }, function(){ return {}; });
  }
  function clear(v){ return post('/v1/rooms/' + v.room + '/clear', { key: v.key }); }
  // stop counting for good: the service forgets the deck, and so does this browser
  function stop(id, v){
    var told = v && v.room && able ? post('/v1/rooms/' + v.room + '/stop', { key: v.key }).catch(function(){ return null; }) : Promise.resolve(null);
    return told.then(function(){ return id ? S().setViewers(id, null) : null; }).then(function(){ if(id) changed(id); });
  }

  // The owner's live line to a deck. on.state(state) each time something changes; on.status(text)
  // with 'live', 'waiting' (trying to connect) or 'gone' (the service no longer knows the deck).
  function watch(v, on){
    var ws = null, tries = 0, timer = 0, done = false, openedAt = 0;
    function status(s){ if(on.status) try { on.status(s); } catch(e){} }
    function connect(){
      if(done) return;
      clearTimeout(timer);
      try { ws = new WebSocket(ADDRESS.replace(/^http/, 'ws') + '/v1/rooms/' + v.room + '/own'); } catch(e){ retry(); return; }
      ws.onopen = function(){ openedAt = Date.now(); try { ws.send(JSON.stringify({ k: v.key })); } catch(e){} };
      ws.onmessage = function(e){
        var st = null; try { st = JSON.parse(e.data); } catch(err){}
        if(!st || !st.live) return;
        tries = 0; status('live');
        try { on.state(cleanState(st)); } catch(err){ console.error(err); }
      };
      ws.onclose = function(e){
        ws = null; if(done) return;
        if(e.code === 4404 || e.code === 4403){ done = true; status('gone'); return; }
        retry();
      };
      ws.onerror = function(){};
    }
    function retry(){
      if(done) return;
      if(Date.now() - openedAt > 20000) tries = 0;
      status('waiting');
      timer = setTimeout(connect, [1500, 4000, 10000, 30000, 60000][Math.min(tries++, 4)]);
    }
    function wake(){ if(!done && !ws && document.visibilityState !== 'hidden'){ tries = 0; connect(); } }
    window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake);
    connect();
    return { close: function(){ done = true; clearTimeout(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); if(ws) try { ws.close(); } catch(e){} } };
  }

  window.SleekOnline = { url: ADDRESS, on: able, set: set, counts: counts, clear: clear, stop: stop, watch: watch };
})();
