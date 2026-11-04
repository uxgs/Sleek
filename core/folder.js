/* A linked folder (Chrome and Edge): pick a folder once, and every deck keeps a .sleek copy in it,
   written a moment after each change. Put the folder in iCloud Drive, Dropbox or a git repo and
   your decks are backed up and travel with it; the start screen lists the .sleek files in it that
   this browser doesn't have yet, to open.

   Uses the File System Access API (showDirectoryPicker). The folder's handle is kept in this
   browser; after a restart the browser asks once more before Sleek may write (Reconnect). Where
   the API is missing (Safari, Firefox) this does nothing, and decks are kept by downloading them. */
(function(){
  var S = window.SleekStore;
  var supported = !!(window.showDirectoryPicker && window.indexedDB);
  var DB = 'sleek-folder', listeners = [], dir = null, perm = 'none', names = {}, ready;

  function kv(mode, fn){
    return new Promise(function(resolve, reject){
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); };
      r.onerror = function(){ reject(r.error); };
      r.onsuccess = function(){
        var db = r.result, tx = db.transaction('kv', mode), st = tx.objectStore('kv'), q = fn(st);
        tx.oncomplete = function(){ db.close(); resolve(q && q.result); };
        tx.onerror = function(){ db.close(); reject(tx.error); };
      };
    });
  }
  function getKV(k){ return kv('readonly', function(st){ return st.get(k); }); }
  function setKV(k, v){ return kv('readwrite', function(st){ return st.put(v, k); }); }
  function delKV(k){ return kv('readwrite', function(st){ return st.delete(k); }); }
  function emit(){ var s = status(); listeners.forEach(function(f){ try { f(s); } catch(e){} }); }
  function status(){ return { supported: supported, linked: !!dir, name: dir ? dir.name : '', ok: perm === 'granted', needsReconnect: !!dir && perm !== 'granted' }; }

  function check(){
    if(!dir) { perm = 'none'; return Promise.resolve(perm); }
    return dir.queryPermission({ mode: 'readwrite' }).then(function(p){ perm = p; return p; }, function(){ perm = 'denied'; return perm; });
  }
  ready = !supported ? Promise.resolve() : Promise.all([getKV('dir'), getKV('names')]).then(function(r){
    dir = r[0] || null; names = r[1] || {};
    return check();
  }).then(emit, function(){});

  // ---------- link, reconnect, unlink (each from a click) ----------
  function link(){
    if(!supported) return Promise.reject(new Error('This browser can’t link a folder.'));
    return window.showDirectoryPicker({ id: 'sleek', mode: 'readwrite' }).then(function(h){
      dir = h; names = {}; perm = 'granted';
      return Promise.all([setKV('dir', h), setKV('names', names)]);
    }).then(function(){ emit(); return writeAll(); }).then(function(){ return status(); });
  }
  function reconnect(){
    if(!dir) return link();
    return dir.requestPermission({ mode: 'readwrite' }).then(function(p){ perm = p; emit(); if(p === 'granted') return writeAll(); }).then(function(){ return status(); });
  }
  function unlink(){ dir = null; perm = 'none'; names = {}; return Promise.all([delKV('dir'), delKV('names')]).then(emit); }

  // ---------- writing ----------
  function fileName(id, title){
    var base = (window.SleekPublish ? SleekPublish.slugFile(title) : String(title || 'deck')), n = base + '.sleek';
    var taken = Object.keys(names).some(function(k){ return k !== id && names[k] === n; });
    return taken ? base + ' (' + id.slice(-4) + ').sleek' : n;
  }
  function write(id){
    if(!dir || perm !== 'granted') return Promise.resolve(false);
    return Promise.all([S.get(id), S.exportDeck(id)]).then(function(r){
      var d = r[0], text = r[1]; if(!d || !text) return false;
      var n = fileName(id, d.title), old = names[id];
      return dir.getFileHandle(n, { create: true }).then(function(fh){ return fh.createWritable(); })
        .then(function(w){ return w.write(text).then(function(){ return w.close(); }); })
        .then(function(){
          names[id] = n;
          // renamed: the file with the old name goes (it was this deck's own)
          var gone = old && old !== n ? dir.removeEntry(old).catch(function(){}) : null;
          return Promise.all([setKV('names', names), gone]);
        }).then(function(){ return true; });
    }).catch(function(e){ console.warn('Sleek could not write to the linked folder:', e); return check().then(function(){ emit(); return false; }); });
  }
  function writeAll(){ return S.list().then(function(l){ return l.reduce(function(p, d){ return p.then(function(){ return write(d.id); }); }, Promise.resolve()); }); }
  var timers = {};
  function queue(id){
    if(!dir || perm !== 'granted' || !id) return;
    clearTimeout(timers[id]); timers[id] = setTimeout(function(){ delete timers[id]; write(id); }, 1500);
  }
  function flush(){ return Promise.all(Object.keys(timers).map(function(id){ clearTimeout(timers[id]); delete timers[id]; return write(id); })); }
  window.addEventListener('pagehide', flush);

  // every save and rename in this page also lands in the folder
  if(S && supported){
    ['save', 'rename', 'create'].forEach(function(k){
      var f = S[k];
      S[k] = function(){ return f.apply(S, arguments).then(function(d){ if(d && d.id) queue(d.id); return d; }); };
    });
  }

  // ---------- reading: the folder's decks this browser doesn't have ----------
  function files(){
    if(!dir || perm !== 'granted') return Promise.resolve([]);
    var out = [];
    return (function walk(it){
      return it.next().then(function(r){
        if(r.done) return out;
        var h = r.value[1];
        if(h.kind === 'file' && /\.sleek$/i.test(h.name)) out.push(h);
        return walk(it);
      });
    })(dir.entries()).then(function(hs){
      return Promise.all(hs.map(function(h){
        return h.getFile().then(function(f){ return f.text().then(function(t){
          var o; try { o = S.parseFile(t); } catch(e){ return null; }
          return { name: h.name, id: o.id || null, title: o.title || h.name.replace(/\.sleek$/i, ''), modified: f.lastModified, text: t,
                   slides: ((o.seed && o.seed.added) || []).length, theme: (o.seed && o.seed.theme) || {} };
        }); }).catch(function(){ return null; });
      }));
    }).then(function(l){ return l.filter(Boolean); });
  }

  window.SleekFolder = {
    supported: supported, ready: function(){ return ready; }, status: status, check: function(){ return check().then(function(){ emit(); return status(); }); },
    link: link, reconnect: reconnect, unlink: unlink, write: write, writeAll: writeAll, flush: flush, files: files,
    onChange: function(f){ listeners.push(f); ready.then(function(){ f(status()); }); }
  };
})();
