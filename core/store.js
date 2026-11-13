/* Sleek's storage: every deck lives in this browser (IndexedDB), and saves as you go.

   Database "sleek-app":
     decks    { id, title, created, updated, seed }      seed: the deck itself (slides, text, media, notes,
                                                         theme, annotations), the shape the engine reads
     media    key -> Blob                                pictures and videos, kept once however many decks use them
     history  { id, undo: [seed...], redo: [seed...] }   snapshots for Undo / Redo

   In a stored seed, a picture or video is "sleek-media:<key>". hydrate() swaps those for blob: URLs
   the page can show, and dehydrate() swaps them (and any new data: URLs) back before saving, so a
   deck record stays small. exportDeck() inlines everything as data: URLs: one .sleek file to share.

   Every page-level edit store the engine keeps on this device (its localStorage keys and its own
   IndexedDB) is named per deck (ns(id)), so two decks never share edits; remove() clears them. */
(function(){
  var DB_NAME = 'sleek-app', VERSION = 1, FORMAT = 'sleek', FORMAT_VERSION = 1, HISTORY_MAX = 60;
  var db = null, opening = null;
  var urlToKey = {}, keyToUrl = {};

  function open(){
    if(db) return Promise.resolve(db);
    if(opening) return opening;
    opening = new Promise(function(resolve, reject){
      var r;
      try { r = indexedDB.open(DB_NAME, VERSION); } catch(e){ reject(e); return; }
      r.onupgradeneeded = function(){
        var d = r.result;
        if(!d.objectStoreNames.contains('decks')) d.createObjectStore('decks', { keyPath: 'id' });
        if(!d.objectStoreNames.contains('media')) d.createObjectStore('media');
        if(!d.objectStoreNames.contains('history')) d.createObjectStore('history', { keyPath: 'id' });
      };
      r.onsuccess = function(){ db = r.result; db.onversionchange = function(){ db.close(); db = null; opening = null; }; resolve(db); };
      r.onerror = function(){ reject(r.error); };
    });
    return opening;
  }
  function tx(store, mode, fn){
    return open().then(function(d){
      return new Promise(function(resolve, reject){
        var t = d.transaction(store, mode), st = t.objectStore(store), out;
        var req = fn(st);
        if(req) req.onsuccess = function(){ out = req.result; };
        t.oncomplete = function(){ resolve(out); };
        t.onerror = t.onabort = function(){ reject(t.error); };
      });
    });
  }

  function uid(){ return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
  function now(){ return Date.now(); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function ns(id){ return 'd:' + id + ':'; }

  // ---------- media ----------
  // a quick fingerprint of a data: URL, so the same picture is stored once
  function hash(s){
    var h1 = 0x811c9dc5, h2 = 0x01000193, n = s.length, step = n > 400000 ? Math.floor(n / 200000) : 1;
    for(var k = 0; k < n; k += step){ var c = s.charCodeAt(k); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + n.toString(36);
  }
  function dataUrlToBlob(u){
    var m = /^data:([^;,]*)(;base64)?,/.exec(u); if(!m) return null;
    var body = u.slice(m[0].length), type = m[1] || 'application/octet-stream';
    if(!m[2]) return new Blob([decodeURIComponent(body)], { type: type });
    var bin = atob(body), len = bin.length, arr = new Uint8Array(len);
    for(var k = 0; k < len; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: type });
  }
  function blobToDataUrl(b){
    return new Promise(function(resolve){ var r = new FileReader(); r.onload = function(){ resolve(r.result); }; r.onerror = function(){ resolve(null); }; r.readAsDataURL(b); });
  }
  // visit every string in a seed, replacing it with what fn returns (sync or a promise)
  function mapStrings(o, fn){
    var jobs = [];
    (function walk(x, parent, key){
      if(typeof x === 'string'){
        var v = fn(x);
        if(v && typeof v.then === 'function') jobs.push(v.then(function(r){ if(r != null) parent[key] = r; }));
        else if(v != null && v !== x) parent[key] = v;
      } else if(x && typeof x === 'object'){
        Object.keys(x).forEach(function(k){ walk(x[k], x, k); });
      }
    })(o, null, null);
    return Promise.all(jobs).then(function(){ return o; });
  }
  function putMedia(key, blob){ return tx('media', 'readwrite', function(st){ return st.put(blob, key); }); }
  function getMedia(key){ return tx('media', 'readonly', function(st){ return st.get(key); }); }
  function mediaUrl(key, blob){
    if(keyToUrl[key]) return keyToUrl[key];
    // a film's address says so (#video), since a blob: address has no file extension to tell by
    var u = URL.createObjectURL(blob) + (/^video\//.test(blob.type || '') ? '#video' : ''); keyToUrl[key] = u; urlToKey[u] = key; return u;
  }
  // stored seed -> a seed the page can show
  function hydrate(seed){
    var s = clone(seed || {});
    return mapStrings(s, function(v){
      if(v.indexOf('sleek-media:') !== 0) return null;
      var key = v.slice(12);
      if(keyToUrl[key]) return keyToUrl[key];
      return getMedia(key).then(function(b){ return b ? mediaUrl(key, b) : null; });
    });
  }
  // a seed from the page -> one to store (new pictures go into the media store)
  function dehydrate(seed){
    var s = clone(seed || {});
    return mapStrings(s, function(v){
      if(v.indexOf('blob:') === 0 && urlToKey[v]) return 'sleek-media:' + urlToKey[v];
      if(v.indexOf('data:') === 0 && v.length > 2048){
        var key = hash(v), blob = dataUrlToBlob(v); if(!blob) return null;
        mediaUrl(key, blob);
        return putMedia(key, blob).then(function(){ return 'sleek-media:' + key; });
      }
      return null;
    });
  }
  // a stored seed -> one with every picture inline (for a file that travels)
  function inline(seed, alsoPaths){
    var s = clone(seed || {});
    return mapStrings(s, function(v){
      if(v.indexOf('sleek-media:') === 0) return getMedia(v.slice(12)).then(function(b){ return b ? blobToDataUrl(b) : null; });
      if(v.indexOf('blob:') === 0 && urlToKey[v]) return getMedia(urlToKey[v]).then(function(b){ return b ? blobToDataUrl(b) : null; });
      if(alsoPaths && /^(assets|images)\/[^"'<>\s]+\.(svg|png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(v))
        return fetch(v).then(function(r){ return r.ok ? r.blob() : null; }).then(function(b){ return b ? blobToDataUrl(b) : null; }, function(){ return null; });
      return null;
    });
  }

  // ---------- decks ----------
  function summary(seed){
    seed = seed || {};
    var t = seed.theme || {}, slides = (seed.added || []).length + (((seed.annotations || {}).screens) || []).length;
    return { slides: slides, theme: { mode: t.mode || 'dark', accent: t.accent || '#7C5CFF', glow: t.glow || 'aurora', glowColor: t.glowColor || 'dusk' } };
  }
  function list(){
    return tx('decks', 'readonly', function(st){ return st.getAll(); }).then(function(all){
      return (all || []).map(function(d){ var s = summary(d.seed); return { id: d.id, title: d.title, created: d.created, updated: d.updated, slides: s.slides, theme: s.theme, cover: d.cover || null, thumb: d.thumb || null,
                                              viewers: d.viewers && d.viewers.on ? { room: d.viewers.room, key: d.viewers.key } : null }; })
        .sort(function(a, b){ return b.updated - a.updated; });
    });
  }
  function get(id){ return tx('decks', 'readonly', function(st){ return st.get(id); }); }
  function put(deck){ return tx('decks', 'readwrite', function(st){ return st.put(deck); }).then(function(){ return deck; }); }
  function create(o){
    o = o || {};
    var deck = { id: o.id || uid(), title: o.title || 'Untitled deck', created: now(), updated: now(), seed: o.seed || { added: [] } };
    if(o.cover) deck.cover = o.cover;
    if(okThumb(o.thumb)) deck.thumb = o.thumb;
    return dehydrate(deck.seed).then(function(s){ deck.seed = s; return put(deck); });
  }
  // save the page's seed as the deck (and remember the one before it for Undo)
  var lastPush = {};
  function save(id, seed, opts){
    opts = opts || {};
    return Promise.all([get(id), dehydrate(seed)]).then(function(r){
      var deck = r[0], s = r[1]; if(!deck) return null;
      var before = JSON.stringify(deck.seed), after = JSON.stringify(s);
      var coverSame = !opts.cover || JSON.stringify(opts.cover) === JSON.stringify(deck.cover || null);
      if(before === after && !opts.title && coverSame) return deck;
      if(before !== after && !opts.noHistory){
        // edits close together (typing a sentence) are one step to undo
        var t = now(), joined = lastPush[id] && t - lastPush[id] < 1500;
        lastPush[id] = t;
        if(!joined || opts.newStep) pushHistory(id, deck.seed);
      }
      if(before !== after || opts.title) deck.updated = now();
      deck.seed = s;
      if(opts.title) deck.title = opts.title;
      if(opts.cover) deck.cover = opts.cover;
      return put(deck);
    });
  }
  // your own picture for the deck's card on the start screen (a small JPEG data URL), or null for the
  // first slide again. It isn't an edit to the deck, so the deck keeps its place in the list.
  function okThumb(u){ return typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(u) && u.length < 3e6; }
  function setThumb(id, url){
    return get(id).then(function(d){ if(!d) return null; if(okThumb(url)) d.thumb = url; else delete d.thumb; return put(d); });
  }
  // Viewers (core/online.js): the deck's two codes and whether it is on. It lives on the record, beside
  // the deck and never in it, so it stays out of .sleek files, copies and published pages; it isn't an
  // edit either, so the deck keeps its place in the list. null forgets it.
  function setViewers(id, v){
    return get(id).then(function(d){ if(!d) return null; if(v) d.viewers = v; else delete d.viewers; return put(d); });
  }
  function rename(id, title){ return get(id).then(function(d){ if(!d) return null; d.title = title; d.updated = now(); return put(d); }); }
  function duplicate(id){
    return get(id).then(function(d){ if(!d) return null; return create({ title: d.title + ' copy', seed: d.seed, cover: d.cover, thumb: d.thumb }); });
  }
  // every edit store the engine keeps for a deck on this device
  function clearDeviceState(id){
    var p = ns(id);
    try { Object.keys(localStorage).forEach(function(k){ if(k.indexOf(p) === 0) localStorage.removeItem(k); }); } catch(e){}
    return new Promise(function(resolve){
      try { var r = indexedDB.deleteDatabase('sleek-' + p); r.onsuccess = r.onerror = r.onblocked = function(){ resolve(); }; } catch(e){ resolve(); }
    });
  }
  function remove(id){
    return Promise.all([
      tx('decks', 'readwrite', function(st){ return st.delete(id); }),
      tx('history', 'readwrite', function(st){ return st.delete(id); }),
      clearDeviceState(id)
    ]);
  }

  // ---------- undo / redo ----------
  function getHistory(id){ return tx('history', 'readonly', function(st){ return st.get(id); }).then(function(h){ return h || { id: id, undo: [], redo: [] }; }); }
  function putHistory(h){ return tx('history', 'readwrite', function(st){ return st.put(h); }); }
  function pushHistory(id, seed){
    return getHistory(id).then(function(h){
      h.undo.push(seed); if(h.undo.length > HISTORY_MAX) h.undo.shift();
      h.redo = [];
      return putHistory(h);
    });
  }
  // step back (or forward): the deck becomes the snapshot, the edits on this device go
  function step(id, dir, opts){
    return Promise.all([get(id), getHistory(id)]).then(function(r){
      var deck = r[0], h = r[1], from = dir < 0 ? h.undo : h.redo, to = dir < 0 ? h.redo : h.undo;
      if(!deck || !from.length) return false;
      to.push(deck.seed); deck.seed = from.pop(); deck.updated = now();
      lastPush[id] = 0;
      return Promise.all([put(deck), putHistory(h), opts && opts.keepDevice ? null : clearDeviceState(id)]).then(function(){ return true; });
    });
  }
  function canStep(id){ return getHistory(id).then(function(h){ return { undo: h.undo.length > 0, redo: h.redo.length > 0 }; }); }

  // ---------- files ----------
  // speaker notes: the slides' notes and each screen's notes. A pin's note and a callout show on the slide, so they stay.
  function plain(h){ return String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim(); }
  function hasNotes(seed){
    if(!seed) return false;
    if((seed.notes || []).some(function(n){ return plain(n); })) return true;
    var by = seed.noteByKey || {};
    if(Object.keys(by).some(function(k){ return plain(by[k]); })) return true;
    var sc = seed.annotations && seed.annotations.screens || [];
    return sc.some(function(s){ return s && plain(s.notes); });
  }
  function stripNotes(seed){
    if(!seed) return seed;
    if(seed.notes) seed.notes = seed.notes.map(function(){ return ''; });
    delete seed.noteByKey;
    ((seed.annotations && seed.annotations.screens) || []).forEach(function(s){ if(s) s.notes = ''; });
    return seed;
  }
  // opts.notes === false leaves the speaker notes out of the file
  function exportDeck(id, opts){
    return get(id).then(function(d){
      if(!d) return null;
      return inline(opts && opts.notes === false ? stripNotes(JSON.parse(JSON.stringify(d.seed))) : d.seed, true).then(function(seed){
        return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, id: d.id, title: d.title, exported: new Date().toISOString(), updated: d.updated, thumb: d.thumb || undefined, seed: seed });
      });
    });
  }
  function parseFile(text){
    var o = JSON.parse(text);
    if(!o || o.format !== FORMAT || typeof o.seed !== 'object') throw new Error('This is not a Sleek deck file.');
    if(o.version > FORMAT_VERSION) throw new Error('This deck was made with a newer Sleek. Update the page and try again.');
    return o;
  }
  // a file keeps its deck's id when this browser doesn't have that deck yet (a linked folder matches files to decks by it)
  // opts.ask(title): when the file has speaker notes, resolves true to keep them, false to leave them out,
  // null to not open the file after all (the import then resolves null)
  function importDeck(text, opts){
    var o = parseFile(text);
    var id = typeof o.id === 'string' && /^[a-z0-9]{4,24}$/.test(o.id) ? o.id : null;
    var asked = opts && opts.ask && hasNotes(o.seed) ? Promise.resolve(opts.ask(o.title || 'Imported deck')) : Promise.resolve(true);
    return asked.then(function(keep){
      if(keep == null) return null;
      if(keep === false) stripNotes(o.seed);
      return (id ? get(id) : Promise.resolve(null)).then(function(have){
        return create({ id: have ? null : id, title: o.title || 'Imported deck', seed: o.seed, thumb: o.thumb });
      });
    });
  }

  // ---------- first run: the sample deck ----------
  function ensureSample(){
    var flag = 'sleek-sample-added';
    try { if(localStorage.getItem(flag)) return Promise.resolve(null); } catch(e){}
    return list().then(function(l){
      if(l.length || !window.SLEEK_SAMPLE){ try { localStorage.setItem(flag, '1'); } catch(e){} return null; }
      var s = window.SLEEK_SAMPLE;
      return create({ title: s.title, seed: s.seed }).then(function(d){ try { localStorage.setItem(flag, '1'); } catch(e){} return d; });
    });
  }
  function addSample(){
    var s = window.SLEEK_SAMPLE; if(!s) return Promise.resolve(null);
    return create({ title: s.title, seed: s.seed });
  }

  window.SleekStore = {
    open: open, ns: ns, uid: uid,
    list: list, get: get, create: create, save: save, rename: rename, setThumb: setThumb, setViewers: setViewers, duplicate: duplicate, remove: remove,
    hydrate: hydrate, dehydrate: dehydrate, inline: inline,
    undo: function(id, o){ return step(id, -1, o); }, redo: function(id, o){ return step(id, 1, o); }, canStep: canStep,
    exportDeck: exportDeck, importDeck: importDeck, parseFile: parseFile, hasNotes: hasNotes,
    ensureSample: ensureSample, addSample: addSample, clearDeviceState: clearDeviceState
  };
})();
