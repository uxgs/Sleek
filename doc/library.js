/* The Docs start screen (docs.html): every page in this browser as a card, newest first.

   A card opens its page (doc.html?d=<id>); its ⋯ menu duplicates it, downloads a copy (.sleek) or
   deletes it (a second press confirms). Open a file, or dropping files on the screen, brings in
   .sleek pages and Markdown or text files (doc/import.js). Pages and folders come from
   core/doc-store.js; the card shows how the page starts (its record's `peek`). */
(function(){
  var D = window.SleekDocs, I = window.SleekDocImport, S = window.SleekStore;
  var grid = document.getElementById('dl-grid'), count = document.getElementById('dl-count');
  if(!grid) return;
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function toast(msg){
    var old = document.querySelector('.lib-toast'); if(old) old.remove();
    var t = el('div', 'lib-toast', msg); t.setAttribute('role', 'status'); document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('in'); }); setTimeout(function(){ t.classList.remove('in'); setTimeout(function(){ t.remove(); }, 300); }, 3200);
  }
  function ago(t){
    var s = Math.max(0, (Date.now() - t) / 1000);
    if(s < 90) return 'just now'; if(s < 3600) return Math.round(s / 60) + ' minutes ago'; if(s < 5400) return 'an hour ago'; if(s < 86400) return Math.round(s / 3600) + ' hours ago';
    if(s < 172800) return 'yesterday'; if(s < 86400 * 14) return Math.round(s / 86400) + ' days ago';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function save(name, text){ var a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); }
  function fileName(t){ return String(t || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'; }

  var openMenu = null;
  function closeMenu(){ if(openMenu){ openMenu.card.classList.remove('menu-open'); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu.menu.remove(); openMenu = null; } }
  document.addEventListener('pointerdown', function(e){ if(openMenu && !openMenu.menu.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && openMenu){ var b = openMenu.btn; closeMenu(); b.focus(); } });

  function card(d, folders, fresh){
    var c = el('article', 'lib-card dl-card' + (fresh ? ' fresh' : '')), href = 'doc.html?d=' + encodeURIComponent(d.id);
    var sheet = el('a', 'dl-sheet'); sheet.href = href; sheet.setAttribute('aria-label', 'Open ' + d.title);
    sheet.appendChild(el('b', '', d.title)); sheet.appendChild(el('p', '', d.peek || ''));
    var f = folders.filter(function(x){ return x.id === d.folder; })[0];
    var meta = el('div', 'dl-meta'), txt = el('div'), name = el('a', 'dl-name', d.title); name.href = href; name.tabIndex = -1;
    txt.appendChild(name); txt.appendChild(el('span', '', (f ? f.name + ' · ' : '') + 'Edited ' + ago(d.updated)));
    var more = el('button', 'lib-more'); more.type = 'button'; more.setAttribute('aria-label', 'More for ' + d.title); more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    more.addEventListener('click', function(){
      if(openMenu && openMenu.btn === more){ closeMenu(); return; }
      closeMenu();
      var m = el('div', 'lib-menu'); m.setAttribute('role', 'menu');
      function item(label, act, cls){ var b = el('button', cls || '', label); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.addEventListener('click', function(){ act(b); }); m.appendChild(b); return b; }
      item('Open', function(){ location.href = href; });
      item('Duplicate', function(){ closeMenu(); D.duplicate(d.id).then(function(n){ render(n && n.id); }); });
      item('Download a copy', function(){ closeMenu(); D.exportDoc(d.id).then(function(t){ if(t) save(fileName(d.title) + '.sleek', t); }); });
      m.appendChild(document.createElement('hr'));
      var armed = 0, del = item('Delete', function(){
        if(Date.now() - armed < 5000){ closeMenu(); c.classList.add('gone'); D.remove(d.id).then(function(){ setTimeout(render, 250); toast('Deleted “' + d.title + '”'); }); return; }
        armed = Date.now(); del.textContent = 'Press again to delete'; setTimeout(function(){ if(del.isConnected) del.textContent = 'Delete'; }, 5000);
      }, 'danger');
      meta.appendChild(m); c.classList.add('menu-open'); more.setAttribute('aria-expanded', 'true'); openMenu = { menu: m, btn: more, card: c };
    });
    meta.appendChild(txt); meta.appendChild(more); c.appendChild(sheet); c.appendChild(meta);
    return c;
  }
  function render(freshId){
    return Promise.all([D.list(), D.folders()]).then(function(r){
      var docs = r[0]; closeMenu(); grid.innerHTML = '';
      count.textContent = docs.length ? docs.length + (docs.length === 1 ? ' page' : ' pages') : '';
      if(!docs.length){
        var e = el('div', 'lib-empty'); e.appendChild(el('b', '', 'No pages yet')); e.appendChild(el('span', '', 'Start one, or open a Markdown or text file you already have.'));
        var w = el('div'), a = el('a', 'btn btn-new'); a.href = 'doc.html?new=1'; a.innerHTML = '<span class="plus" aria-hidden="true">+</span>New page'; w.appendChild(a); e.appendChild(w); grid.appendChild(e); return;
      }
      docs.forEach(function(d){ grid.appendChild(card(d, r[1], d.id === freshId)); });
    });
  }

  // ---------- opening files ----------
  function bring(files){
    files = Array.prototype.slice.call(files || []); if(!files.length || !I) return;
    var made = [], failed = [];
    files.reduce(function(q, f){ return q.then(function(){ return I.file(f).then(function(d){ if(d) made.push(d); }, function(e){ failed.push(e && e.message || 'That file couldn’t be opened.'); }); }); }, Promise.resolve()).then(function(){
      if(failed.length) toast(failed[0]);
      if(made.length === 1 && !failed.length){ location.href = 'doc.html?d=' + encodeURIComponent(made[0].id); return; }
      render(made.length ? made[made.length - 1].id : null).then(function(){ if(made.length && !failed.length) toast('Opened ' + made.length + ' pages'); });
    });
  }
  var input = document.getElementById('dl-file'), drop = document.getElementById('dl-drop'), depth = 0;
  document.getElementById('dl-open').addEventListener('click', function(){ input.value = ''; input.click(); });
  input.addEventListener('change', function(){ bring(input.files); });
  function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  window.addEventListener('dragenter', function(e){ if(!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('on'); });
  window.addEventListener('dragover', function(e){ if(hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', function(e){ if(!hasFiles(e)) return; depth = Math.max(0, depth - 1); if(!depth) drop.classList.remove('on'); });
  window.addEventListener('drop', function(e){ if(!hasFiles(e)) return; e.preventDefault(); depth = 0; drop.classList.remove('on'); bring(e.dataTransfer.files); });
  // installed as an app: a file opened with Sleek Docs arrives here
  if('launchQueue' in window) window.launchQueue.setConsumer(function(p){ Promise.all((p.files || []).map(function(h){ return h.getFile(); })).then(bring); });

  // the offline cache (sw.js), as on the Slides start screen
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
  if(!D || !S){ grid.appendChild(el('div', 'lib-empty', 'Sleek Docs could not open its storage in this browser (a private window can block it).')); return; }
  window.addEventListener('pageshow', function(e){ if(e.persisted) render(); });
  render();
})();
