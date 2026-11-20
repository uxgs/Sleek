/* Sleeky Notes' storage: every note lives in this browser (IndexedDB), and saves as you go.

   Database "sleek-notes" (its own, beside the decks' "sleek-app", the pages' "sleek-docs" and "sleek-tasks"):
     notes   { id, title, icon, color, folder, tags: [], pin, lock, body, sealed, created, updated }
                                  icon is one of the names in note/app.js; folder is a folder's id or "";
                                  body is the note as text with a little markup (note/editor.js). A locked
                                  note has body "" and sealed { v, iv, ct }: its text, scrambled with the key
                                  of vault v (note/lock.js). Its title, icon, tags and folder stay readable,
                                  so you can find it; nothing else about it can be read without the key.
     meta    { id: 'folders', list: [{ id, name, created, updated }] }
             { id: 'vaults', list: { id: { id, made, salt, iter, pass, bio } } }   the locks' keys, each kept
                                  scrambled by your passcode (and by this device's fingerprint or face)
             { id: 'gone', list: { id: time } }   what was deleted, so a copy elsewhere does not bring it back

   Everything is read into memory once (ready()), so the app draws straight from it; a change is made
   there first and written behind it. Each change is announced to this page's listeners (on()) and,
   once it is written, to every other open tab (a BroadcastChannel), which reads the database again. */
(function(){
  var DB_NAME = 'sleek-notes', VERSION = 1, FORMAT = 'sleek-notes';
  var db = null, opening = null, loaded = null, cache = { notes: [], folders: [], vaults: {}, gone: {} }, subs = [], chan = null;
  var COLORS = ['#F5A80C', '#FF7A45', '#E5487F', '#7C5CFF', '#0A84FF', '#14B8A6', '#12A36A', '#8E8E93'];

  function open(){
    if(db) return Promise.resolve(db);
    if(opening) return opening;
    opening = new Promise(function(resolve, reject){
      var r;
      try { r = indexedDB.open(DB_NAME, VERSION); } catch(e){ reject(e); return; }
      r.onupgradeneeded = function(){ var d = r.result; ['notes', 'meta'].forEach(function(n){ if(!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = function(){ db = r.result; db.onversionchange = function(){ db.close(); db = null; opening = null; }; resolve(db); };
      r.onerror = function(){ reject(r.error); };
    });
    return opening;
  }
  function tx(stores, mode, fn){
    return open().then(function(d){
      return new Promise(function(resolve, reject){
        var t = d.transaction(stores, mode), out = fn(t);
        t.oncomplete = function(){ resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = t.onabort = function(){ reject(t.error); };
      });
    });
  }
  function all(store){ return tx(store, 'readonly', function(t){ return t.objectStore(store).getAll(); }).then(function(a){ return a || []; }); }
  function uid(){ return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
  function now(){ return Date.now(); }
  function copy(o){ return JSON.parse(JSON.stringify(o)); }
  // every write in flight; other tabs are told of a change only once the writes before it are in, so they never read too early
  var pending = Promise.resolve();
  function wrote(p){ pending = Promise.all([pending, p.catch(function(){})]); return p; }
  function put(store, rec){ wrote(tx(store, 'readwrite', function(t){ t.objectStore(store).put(copy(rec)); })).catch(function(e){ console.error('Sleeky Notes could not save', e); }); }
  function del(store, id){ wrote(tx(store, 'readwrite', function(t){ t.objectStore(store).delete(id); })).catch(function(e){ console.error(e); }); }
  function putMeta(id){ put('meta', { id: id, list: cache[id] }); }

  // ---------- reading it all in, and saying when something changed ----------
  function read(){
    return Promise.all([all('notes'), all('meta')]).then(function(r){
      cache.notes = r[0];
      function meta(id){ return (r[1].filter(function(m){ return m.id === id; })[0] || {}).list; }
      var f = meta('folders'), v = meta('vaults'), g = meta('gone');
      cache.folders = Array.isArray(f) ? f : [];
      cache.vaults = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      cache.gone = g && typeof g === 'object' && !Array.isArray(g) ? g : {};
    });
  }
  function ready(){ if(!loaded) loaded = read(); return loaded; }
  function tell(what, here){
    subs.slice().forEach(function(fn){ try { fn(what); } catch(e){ console.error(e); } });
    if(here && chan) pending.then(function(){ try { chan.postMessage(what); } catch(e){} });
  }
  function changed(what){ tell(what, true); }
  try { chan = new BroadcastChannel('sleek-notes'); chan.onmessage = function(e){ var what = e.data || {}; read().then(function(){ tell(Object.assign({ remote: true }, what), false); }); }; } catch(e){ chan = null; }
  function on(fn){ subs.push(fn); return function(){ subs = subs.filter(function(f){ return f !== fn; }); }; }
  /** Every write so far is in the database (for a page about to close, and for the checks). */
  function saved(){ return pending; }

  // ---------- notes ----------
  /** A tag as it is kept: lower case, no "#", words joined by "-". */
  function tag(t){ return String(t || '').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 40); }
  function tagList(list){ var out = []; (list || []).forEach(function(t){ t = tag(t); if(t && out.indexOf(t) < 0) out.push(t); }); return out; }
  /** Your notes, the one changed last first. */
  function notes(){ return cache.notes.slice().sort(function(a, b){ return b.updated - a.updated; }); }
  function note(id){ return cache.notes.filter(function(n){ return n.id === id; })[0] || null; }
  function add(o){
    o = o || {};
    var n = { id: uid(), title: String(o.title || '').trim(), icon: o.icon || 'note', color: o.color || COLORS[0], folder: folder(o.folder) ? o.folder : '', tags: tagList(o.tags),
              pin: !!o.pin, lock: false, body: String(o.body || ''), sealed: null, created: now(), updated: now() };
    cache.notes.push(n); put('notes', n); changed({ kind: 'note', id: n.id }); return n;
  }
  /** Change a note. Its place in the list (updated) moves only when what it says changes, not when it is pinned, filed or given an icon. */
  function set(id, change){
    var n = note(id); if(!n) return null;
    var said = ['title', 'body', 'sealed'].some(function(k){ return k in change; });
    Object.keys(change).forEach(function(k){ n[k] = k === 'tags' ? tagList(change[k]) : change[k]; });
    if(said) n.updated = now(); n.stamp = now();
    put('notes', n); changed({ kind: 'note', id: id }); return n;
  }
  // What was deleted, and when. Notes older than 90 days are let go.
  function noteGone(ids){
    var t = now(), old = t - 90 * 864e5;
    ids.forEach(function(id){ cache.gone[id] = t; });
    Object.keys(cache.gone).forEach(function(id){ if(cache.gone[id] < old) delete cache.gone[id]; });
    putMeta('gone');
  }
  /** Delete a note. Gives back the note as it was, which restore() puts back. */
  function remove(id){
    var n = note(id); if(!n) return null;
    cache.notes = cache.notes.filter(function(x){ return x.id !== id; }); del('notes', id); noteGone([id]); changed({ kind: 'note', id: id }); return n;
  }
  function restore(n){
    if(!n || note(n.id)) return null;
    cache.notes.push(n); delete cache.gone[n.id]; putMeta('gone'); put('notes', n); changed({ kind: 'note', id: n.id }); return n;
  }
  /** Every tag in use, in order. */
  function tags(){ var out = []; cache.notes.forEach(function(n){ (n.tags || []).forEach(function(t){ if(out.indexOf(t) < 0) out.push(t); }); }); return out.sort(); }

  // ---------- folders ----------
  function folders(){ return cache.folders; }
  function folder(id){ return cache.folders.filter(function(f){ return f.id === id; })[0] || null; }
  /** A new folder, or the one that already has this name. */
  function addFolder(name){
    name = String(name || '').trim().slice(0, 40); if(!name) return null;
    var have = cache.folders.filter(function(f){ return f.name.toLowerCase() === name.toLowerCase(); })[0]; if(have) return have;
    var f = { id: uid(), name: name, created: now(), updated: now() };
    cache.folders.push(f); putMeta('folders'); changed({ kind: 'folder', id: f.id }); return f;
  }
  function renameFolder(id, name){
    var f = folder(id); name = String(name || '').trim().slice(0, 40); if(!f || !name) return null;
    f.name = name; f.updated = now(); putMeta('folders'); changed({ kind: 'folder', id: id }); return f;
  }
  /** Delete a folder. Its notes stay, in no folder. */
  function removeFolder(id){
    if(!folder(id)) return;
    cache.folders = cache.folders.filter(function(f){ return f.id !== id; }); putMeta('folders'); noteGone([id]);
    cache.notes.forEach(function(n){ if(n.folder === id){ n.folder = ''; n.stamp = now(); put('notes', n); } });
    changed({ kind: 'folder', id: id });
  }

  // ---------- the locks' keys (note/lock.js makes and uses them) ----------
  function vaults(){ return cache.vaults; }
  function vault(id){ return cache.vaults[id] || null; }
  function setVault(v){ cache.vaults[v.id] = v; putMeta('vaults'); changed({ kind: 'vault', id: v.id }); return v; }

  // ---------- a copy of everything, as a file ----------
  /** Every note, folder and lock, as text. Locked notes stay scrambled in it; the passcode opens them wherever the file goes. */
  function exportAll(){
    return ready().then(function(){
      return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), notes: copy(cache.notes), folders: copy(cache.folders), vaults: copy(cache.vaults), gone: copy(cache.gone) });
    });
  }
  function parseFile(text){
    var o = JSON.parse(text);
    if(!o || o.format !== FORMAT || !Array.isArray(o.notes)) throw new Error('This is not a Sleeky Notes file.');
    if(o.version > 1) throw new Error('This file was made with a newer Sleeky Notes.');
    return o;
  }
  function okNote(n){ return n && typeof n.id === 'string' && /^[a-z0-9]{6,20}$/.test(n.id) && typeof n.title === 'string'; }
  function tidy(n){
    return { id: n.id, title: String(n.title), icon: String(n.icon || 'note'), color: /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : COLORS[0], folder: typeof n.folder === 'string' ? n.folder : '', tags: tagList(n.tags),
             pin: !!n.pin, lock: !!(n.lock && n.sealed), body: n.lock && n.sealed ? '' : String(n.body || ''), sealed: n.lock && n.sealed ? { v: String(n.sealed.v), iv: String(n.sealed.iv), ct: String(n.sealed.ct) } : null,
             created: +n.created || now(), updated: +n.updated || now(), stamp: +n.stamp || +n.updated || now() };
  }
  // the file's folders and locks, taken in beside these; a folder with a name that is here already becomes that one
  function takeIn(o, newer){
    var same = {};
    (o.folders || []).forEach(function(f){
      if(!f || typeof f.id !== 'string' || !f.name) return;
      var mine = folder(f.id), named = cache.folders.filter(function(x){ return x.name.toLowerCase() === String(f.name).toLowerCase(); })[0];
      if(mine){ if(newer && (+f.updated || 0) > (mine.updated || 0)){ mine.name = String(f.name).slice(0, 40); mine.updated = +f.updated; } }
      else if(named) same[f.id] = named.id;
      else if(!(cache.gone[f.id] >= (+f.updated || 0))) cache.folders.push({ id: f.id, name: String(f.name).slice(0, 40), created: +f.created || now(), updated: +f.updated || now() });
    });
    Object.keys(o.vaults || {}).forEach(function(id){ var v = o.vaults[id]; if(v && v.id === id && v.salt && v.pass && !cache.vaults[id]) cache.vaults[id] = Object.assign({}, v, { bio: [], home: false }); });   // a fingerprint belongs to the device that made it
    putMeta('folders'); putMeta('vaults');
    return same;
  }
  /** Bring a file's notes in beside what is here. A note that is here already (the very one) is left as it is. */
  function importAll(text){
    var o = parseFile(text);
    return ready().then(function(){
      var same = takeIn(o, false), n = 0;
      o.notes.filter(okNote).forEach(function(x){
        if(note(x.id)) return;
        var t = tidy(x); if(same[t.folder]) t.folder = same[t.folder]; if(t.folder && !folder(t.folder)) t.folder = '';
        cache.notes.push(t); delete cache.gone[t.id]; put('notes', t); n++;
      });
      putMeta('gone'); changed({ kind: 'all' }); return { notes: n };
    });
  }
  /** Swap changes with another copy of your notes (the Sleek apps on one iPhone do this through a folder they share):
      for each note the newer one wins, and what was deleted on either side stays deleted. */
  function mergeAll(text){
    var o = parseFile(text);
    return ready().then(function(){
      var same = takeIn(o, true), n = 0, theirs = o.gone || {};
      Object.keys(theirs).forEach(function(id){
        var t = +theirs[id] || 0, mine = note(id);
        if(mine && (mine.stamp || mine.updated) < t){ cache.notes = cache.notes.filter(function(x){ return x.id !== id; }); del('notes', id); n++; }
        if(folder(id) && (folder(id).updated || 0) < t){ cache.folders = cache.folders.filter(function(f){ return f.id !== id; }); putMeta('folders'); }
        if(!(cache.gone[id] >= t)) cache.gone[id] = t;
      });
      o.notes.filter(okNote).forEach(function(x){
        var t = tidy(x), mine = note(t.id);
        if(cache.gone[t.id] >= t.stamp) return;
        if(same[t.folder]) t.folder = same[t.folder]; if(t.folder && !folder(t.folder)) t.folder = '';
        if(!mine){ cache.notes.push(t); put('notes', t); n++; }
        else if((mine.stamp || mine.updated) < t.stamp){ cache.notes[cache.notes.indexOf(mine)] = t; put('notes', t); n++; }
      });
      putMeta('gone'); if(n) changed({ kind: 'all' }); return { changed: n };
    });
  }

  window.SleekNotes = {
    open: open, ready: ready, on: on, saved: saved, uid: uid, COLORS: COLORS, tag: tag,
    notes: notes, note: note, add: add, set: set, remove: remove, restore: restore, tags: tags,
    folders: folders, folder: folder, addFolder: addFolder, renameFolder: renameFolder, removeFolder: removeFolder,
    vaults: vaults, vault: vault, setVault: setVault,
    exportAll: exportAll, importAll: importAll, mergeAll: mergeAll, parseFile: parseFile
  };
})();
