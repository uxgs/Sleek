/* Sleek Docs' storage: every page lives in this browser (IndexedDB), and saves as you go.

   Database "sleek-docs" (its own, beside the decks' "sleek-app", which is never changed by Docs):
     docs     { id, title, created, updated, folder, text, peek, viewers? }   what the lists of pages need, and no more:
                                                              folder is a folder's id or null; text is the
                                                              page's words in lower case, for search; peek
                                                              is how it starts, for its card on the start screen
     bodies   { id, seed }                                    the page itself: { kind: 'doc', v, theme, doc }
                                                              where doc is the editor's document (ProseMirror JSON)
     folders  { id, name, parent, open, created }             parent is a folder's id or null
     history  { id, snaps: [{ t, seed }] }                    a copy of the page now and then, newest last

   Pictures are kept in the decks' picture store (core/store.js: "sleek-media:<key>" in a stored page,
   a blob: URL on screen), so a picture used in a deck and a page is stored once.
   exportDoc() inlines them: one .sleek file to keep or move. A page's file says kind: 'doc' and
   version 2, so a copy of Sleek from before Docs says it is too new, and never opens it as a deck. */
(function(){
  var DB_NAME = 'sleek-docs', VERSION = 1, FORMAT = 'sleek', FILE_VERSION = 2, SNAPS_MAX = 20;
  var S = function(){ return window.SleekStore; };
  var db = null, opening = null;

  function open(){
    if(db) return Promise.resolve(db);
    if(opening) return opening;
    opening = new Promise(function(resolve, reject){
      var r;
      try { r = indexedDB.open(DB_NAME, VERSION); } catch(e){ reject(e); return; }
      r.onupgradeneeded = function(){
        var d = r.result;
        ['docs', 'bodies', 'folders', 'history'].forEach(function(n){ if(!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
      };
      r.onsuccess = function(){ db = r.result; db.onversionchange = function(){ db.close(); db = null; opening = null; }; resolve(db); };
      r.onerror = function(){ reject(r.error); };
    });
    return opening;
  }
  // run fn over one or more stores in a single transaction; resolves with what fn's request gave
  function tx(stores, mode, fn){
    return open().then(function(d){
      return new Promise(function(resolve, reject){
        var t = d.transaction(stores, mode), out, req = fn(typeof stores === 'string' ? t.objectStore(stores) : t);
        if(req) req.onsuccess = function(){ out = req.result; };
        t.oncomplete = function(){ resolve(out); };
        t.onerror = t.onabort = function(){ reject(t.error); };
      });
    });
  }
  function all(store){ return tx(store, 'readonly', function(st){ return st.getAll(); }).then(function(a){ return a || []; }); }
  function uid(){ return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
  function now(){ return Date.now(); }
  function blank(){ return { kind: 'doc', v: 1, theme: {}, doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }, { type: 'paragraph' }] } }; }
  // the words of a page, from its stored document
  function words(node){
    var out = [];
    (function walk(n){ if(!n) return; if(typeof n.text === 'string') out.push(n.text); if(n.content){ n.content.forEach(walk); out.push('\n'); } })(node);
    return out.join('').replace(/\n+/g, '\n').trim();
  }
  function titleOf(seed){
    var t = '', top = seed && seed.doc && seed.doc.content && seed.doc.content[0];
    // a page with a cover is named by the cover's title, not the short line above it
    if(top && top.type === 'cover'){ var h = (top.content || []).filter(function(c){ return c.type === 'heading'; })[0]; t = h ? words(h) : ''; if(t.trim()) return t.trim().slice(0, 120); t = ''; }
    (function walk(n){ if(t || !n) return; if(n.content && n.content.some(function(c){ return typeof c.text === 'string'; })){ t = words(n).split('\n')[0]; return; } (n.content || []).forEach(walk); })(seed && seed.doc);
    return t.trim().slice(0, 120) || 'Untitled';
  }

  // how the page starts, after its title: a couple of lines for its card
  function peek(seed, title){ var w = words(seed.doc).replace(/\n/g, ' '); if(title && w.indexOf(title) === 0) w = w.slice(title.length); return w.trim().slice(0, 260); }

  // ---------- pages ----------
  function list(){ return all('docs').then(function(a){ return a.sort(function(x, y){ return y.updated - x.updated; }); }); }
  function meta(id){ return tx('docs', 'readonly', function(st){ return st.get(id); }); }
  // the page with its body: { id, title, ..., seed }
  function get(id){
    return Promise.all([meta(id), tx('bodies', 'readonly', function(st){ return st.get(id); })]).then(function(r){
      if(!r[0]) return null; var d = r[0]; d.seed = (r[1] && r[1].seed) || blank(); return d;
    });
  }
  function write(m, seed){
    return tx(['docs', 'bodies'], 'readwrite', function(t){ t.objectStore('docs').put(m); if(seed) t.objectStore('bodies').put({ id: m.id, seed: seed }); }).then(function(){ return m; });
  }
  function create(o){
    o = o || {};
    var seed = o.seed || blank();
    return S().dehydrate(seed).then(function(s){
      var m = { id: o.id || uid(), title: o.title || titleOf(s), created: now(), updated: now(), folder: o.folder || null, text: words(s.doc).toLowerCase() };
      m.peek = peek(s, m.title);
      return write(m, s);
    });
  }
  // save the page as the editor has it; resolves with its record, or null if it is gone
  function save(id, seed){
    return Promise.all([meta(id), S().dehydrate(seed)]).then(function(r){
      var m = r[0], s = r[1]; if(!m) return null;
      m.title = titleOf(s); m.text = words(s.doc).toLowerCase(); m.peek = peek(s, m.title); m.updated = now();
      return write(m, s);
    });
  }
  function duplicate(id){ return get(id).then(function(d){ return d ? create({ seed: d.seed, folder: d.folder }) : null; }); }
  function remove(id){
    return tx(['docs', 'bodies', 'history'], 'readwrite', function(t){ t.objectStore('docs').delete(id); t.objectStore('bodies').delete(id); t.objectStore('history').delete(id); });
  }
  // Viewers (core/online.js): the page's two codes and whether it is on, as for decks. It lives on the
  // record, beside the page and never in it, so it stays out of .sleek files, copies and published pages.
  function setViewers(id, v){ return meta(id).then(function(m){ if(!m) return null; if(v) m.viewers = v; else delete m.viewers; return write(m); }); }
  // put a page in a folder (null: in no folder). Not an edit, so it keeps its place in the list.
  function move(id, folder){ return meta(id).then(function(m){ if(!m) return null; m.folder = folder || null; return write(m); }); }
  // every word of q must be in the title or the page; pages whose title matches come first
  function search(q){
    var ws = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return list().then(function(a){
      if(!ws.length) return a;
      return a.map(function(d){ var t = d.title.toLowerCase(), hay = t + '\n' + (d.text || '');
        return ws.every(function(w){ return hay.indexOf(w) >= 0; }) ? { d: d, top: ws.every(function(w){ return t.indexOf(w) >= 0; }) } : null; })
        .filter(Boolean).sort(function(x, y){ return (y.top - x.top) || (y.d.updated - x.d.updated); }).map(function(x){ return x.d; });
    });
  }

  // ---------- folders ----------
  function folders(){ return all('folders').then(function(a){ return a.sort(function(x, y){ return x.name.localeCompare(y.name) || x.created - y.created; }); }); }
  function putFolder(f){ return tx('folders', 'readwrite', function(st){ return st.put(f); }).then(function(){ return f; }); }
  function addFolder(name, parent){ return putFolder({ id: uid(), name: String(name || '').trim() || 'New folder', parent: parent || null, open: true, created: now() }); }
  function setFolder(id, change){
    return folders().then(function(a){
      var f = a.filter(function(x){ return x.id === id; })[0]; if(!f) return null;
      if(change.name != null) f.name = String(change.name).trim() || f.name;
      if(change.open != null) f.open = !!change.open;
      if('parent' in change){
        // a folder can't go inside itself or anything it holds
        for(var p = change.parent; p; p = (a.filter(function(x){ return x.id === p; })[0] || {}).parent) if(p === id) return f;
        f.parent = change.parent || null;
      }
      return putFolder(f);
    });
  }
  // deleting a folder keeps what was in it: its pages and folders move up to where it was
  function removeFolder(id){
    return Promise.all([folders(), all('docs')]).then(function(r){
      var f = r[0].filter(function(x){ return x.id === id; })[0]; if(!f) return null;
      return tx(['docs', 'folders'], 'readwrite', function(t){
        r[1].forEach(function(d){ if(d.folder === id){ d.folder = f.parent || null; t.objectStore('docs').put(d); } });
        r[0].forEach(function(x){ if(x.parent === id){ x.parent = f.parent || null; t.objectStore('folders').put(x); } });
        t.objectStore('folders').delete(id);
      });
    });
  }

  // ---------- a copy now and then ----------
  // keep the page as it is stored now, unless that is what the last copy already holds
  function snapshot(id){
    return Promise.all([tx('bodies', 'readonly', function(st){ return st.get(id); }), tx('history', 'readonly', function(st){ return st.get(id); })]).then(function(r){
      if(!r[0]) return null;
      var h = r[1] || { id: id, snaps: [] }, last = h.snaps[h.snaps.length - 1], seed = r[0].seed;
      if(last && JSON.stringify(last.seed) === JSON.stringify(seed)) return h;
      h.snaps.push({ t: now(), seed: seed }); if(h.snaps.length > SNAPS_MAX) h.snaps.shift();
      return tx('history', 'readwrite', function(st){ return st.put(h); }).then(function(){ return h; });
    });
  }

  // ---------- files ----------
  function exportDoc(id){
    return get(id).then(function(d){
      if(!d) return null;
      return S().inline(d.seed, false).then(function(seed){
        return JSON.stringify({ format: FORMAT, version: FILE_VERSION, kind: 'doc', id: d.id, title: d.title, exported: new Date().toISOString(), updated: d.updated, seed: seed });
      });
    });
  }
  function parseFile(text){
    var o = JSON.parse(text);
    if(!o || o.format !== FORMAT || typeof o.seed !== 'object') throw new Error('This is not a Sleek file.');
    if(o.kind !== 'doc') throw new Error('That file is a deck. Open it from Sleek Slides.');
    if(o.version > FILE_VERSION || (o.seed && o.seed.v > 1)) throw new Error('This page was made with a newer Sleek Docs. Reload this page to update, and try again.');
    return o;
  }
  // a file keeps its page's id when this browser doesn't have that page yet
  function importDoc(text, folder){
    var o = parseFile(text), id = typeof o.id === 'string' && /^[a-z0-9]{4,24}$/.test(o.id) ? o.id : null;
    return (id ? meta(id) : Promise.resolve(null)).then(function(have){ return create({ id: have ? null : id, seed: o.seed, folder: folder || null }); });
  }

  window.SleekDocs = {
    open: open, uid: uid, blank: blank, titleOf: titleOf, words: words,
    list: list, get: get, create: create, save: save, duplicate: duplicate, remove: remove, move: move, search: search, setViewers: setViewers,
    folders: folders, addFolder: addFolder, setFolder: setFolder, removeFolder: removeFolder,
    snapshot: snapshot, exportDoc: exportDoc, importDoc: importDoc, parseFile: parseFile
  };
})();
