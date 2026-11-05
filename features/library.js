/* The start screen's deck library: every deck in this browser (core/store.js) as a card, newest
   first, each with a menu (open, rename, duplicate, download, publish, delete). Decks come in
   from the New deck setup (features/setup.js), a .sleek file (Open a file…, or dropped anywhere
   on the page) or the sample. */
(function(){
  var S = window.SleekStore, P = window.SleekPublish;
  var grid = document.getElementById('lib-grid'), count = document.getElementById('lib-count');
  var fileIn = document.getElementById('lib-file'), sampleBtn = document.getElementById('lib-sample'), drop = document.getElementById('lib-drop');
  if(!S || !grid) return;

  var GLOW = { dusk: ['#7E9CFF', '#FF8EE0'], ember: ['#FFB270', '#FF7092'], ocean: ['#6ECCFF', '#7C8CFF'],
               verdant: ['#76E6BC', '#7CCCFF'], gold: ['#FFD678', '#FF9E76'] };
  var MENU = [['open', 'Open'], ['rename', 'Rename'], ['dup', 'Duplicate'], ['file', 'Download .sleek file'], ['pub', 'Publish as a web page'], ['-'], ['del', 'Delete…']];

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(t){
    var s = Math.max(0, (Date.now() - t) / 1000);
    if(s < 45) return 'just now';
    if(s < 3600) return Math.round(s / 60) + ' min ago';
    if(s < 86400) return Math.round(s / 3600) + ' h ago';
    if(s < 86400 * 6) return Math.round(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function toast(text){
    var t = document.createElement('div'); t.className = 'lib-toast'; t.setAttribute('role', 'status'); t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('in'); }, 20);
    setTimeout(function(){ t.classList.remove('in'); setTimeout(function(){ t.remove(); }, 400); }, 3600);
  }
  function openDeck(id){ location.href = 'deck.html?d=' + encodeURIComponent(id); }

  function card(d, i){
    var t = d.theme || {}, g = GLOW[t.glowColor] || [t.accent, t.accent], cv = d.cover || {};
    var el = document.createElement('article');
    el.className = 'lib-card'; el.dataset.id = d.id; el.style.setProperty('--i', i);
    el.innerHTML =
      '<a class="lib-thumb" href="deck.html?d=' + encodeURIComponent(d.id) + '" data-mode="' + (t.mode === 'light' ? 'light' : 'dark') + '" data-glow="' + esc(t.glow) + '"' +
        ' style="--a:' + esc(t.accent) + ';--g1:' + esc(g[0]) + ';--g2:' + esc(g[1]) + '" aria-label="Open ' + esc(d.title) + '">' +
        '<span class="lib-k">' + esc(cv.k || '') + '</span><span class="lib-h">' + esc(cv.h || d.title) + '</span><i class="lib-bar"></i></a>' +
      '<div class="lib-meta"><div class="lib-text"><h3 class="lib-title">' + esc(d.title) + '</h3>' +
        '<span class="lib-sub">' + d.slides + (d.slides === 1 ? ' slide' : ' slides') + ' · edited ' + ago(d.updated) + '</span></div>' +
        '<button type="button" class="lib-more" aria-haspopup="true" aria-expanded="false" aria-label="More for ' + esc(d.title) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg></button></div>';
    return el;
  }

  var decks = [];
  function render(){
    return S.list().then(function(l){
      decks = l;
      grid.innerHTML = '';
      count.textContent = l.length ? l.length + (l.length === 1 ? ' deck' : ' decks') : '';
      if(!l.length){
        grid.innerHTML = '<div class="lib-empty"><b>No decks yet.</b><span>Start a new one, open a .sleek file, or look around the sample first.</span>' +
          '<div><button type="button" class="btn btn-ghost" data-sample>Add the sample deck</button></div></div>';
      }
      l.forEach(function(d, i){ grid.appendChild(card(d, i)); });
      var hasSample = window.SLEEK_SAMPLE && l.some(function(d){ return d.title === window.SLEEK_SAMPLE.title; });
      sampleBtn.disabled = !!hasSample; sampleBtn.textContent = hasSample ? 'In your decks' : 'Add the sample deck';   // (in Settings)
    });
  }

  // ---------- the card menu ----------
  var menu = null;
  function closeMenu(){ if(!menu) return; var m = menu; menu = null; m.btn.setAttribute('aria-expanded', 'false'); m.el.remove(); var c = m.btn.closest('.lib-card'); if(c) c.classList.remove('menu-open'); }
  function openMenu(btn, id){
    closeMenu();
    var el = document.createElement('div'); el.className = 'lib-menu'; el.setAttribute('role', 'menu');
    el.innerHTML = MENU.map(function(m){
      return m[0] === '-' ? '<hr>' : '<button type="button" role="menuitem" data-act="' + m[0] + '"' + (m[0] === 'del' ? ' class="danger"' : '') + '>' + m[1] + '</button>';
    }).join('');
    btn.closest('.lib-meta').appendChild(el);
    btn.closest('.lib-card').classList.add('menu-open');        // above the cards after it
    btn.setAttribute('aria-expanded', 'true');
    menu = { el: el, btn: btn, id: id };
    var first = el.querySelector('button'); if(first) first.focus();
  }

  function busy(c, on){ if(c) c.classList.toggle('busy', on); }
  function act(a, id){
    var c = grid.querySelector('.lib-card[data-id="' + id + '"]'), d = decks.filter(function(x){ return x.id === id; })[0];
    closeMenu();
    if(!d) return;
    if(a === 'open') openDeck(id);
    else if(a === 'rename') startRename(c, d);
    else if(a === 'dup'){ busy(c, true); S.duplicate(id).then(function(){ return render(); }).then(function(){ toast('Made a copy of ' + d.title + '.'); }); }
    else if(a === 'file'){ busy(c, true); P.exportFile(id).then(function(n){ busy(c, false); if(n) toast('Downloaded ' + n + '.'); }, function(e){ console.error(e); busy(c, false); toast('Couldn’t make the file.'); }); }
    else if(a === 'pub'){ busy(c, true); P.publish(id).then(function(r){ busy(c, false); toast('Downloaded ' + r.name + '. It plays in any browser.'); }, function(e){ console.error(e); busy(c, false); toast('Couldn’t build the page.'); }); }
    else if(a === 'del') confirmDelete(c, d);
  }
  function startRename(c, d){
    var h = c.querySelector('.lib-title');
    var input = document.createElement('input'); input.type = 'text'; input.className = 'lib-rename'; input.value = d.title; input.maxLength = 120;
    input.setAttribute('aria-label', 'Deck name');
    h.replaceWith(input); input.focus(); input.select();
    var done = false;
    function finish(keep){
      if(done) return; done = true;
      var t = input.value.trim();
      if(keep && t && t !== d.title) S.rename(d.id, t).then(render); else render();
    }
    input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); finish(true); } else if(e.key === 'Escape'){ e.preventDefault(); finish(false); } });
    input.addEventListener('blur', function(){ finish(true); });
  }
  function confirmDelete(c, d){
    var cf = document.createElement('div'); cf.className = 'lib-confirm'; cf.setAttribute('role', 'alertdialog'); cf.setAttribute('aria-label', 'Delete deck');
    cf.innerHTML = '<b>Delete “' + esc(d.title) + '”?</b><span>It goes from this browser for good. Download its .sleek file first to keep a copy.</span>' +
      '<div><button type="button" class="lib-c-del">Delete</button><button type="button" class="lib-c-no">Keep it</button></div>';
    c.appendChild(cf);
    setTimeout(function(){ cf.classList.add('in'); }, 20);
    cf.querySelector('.lib-c-no').focus();
    cf.addEventListener('click', function(e){
      if(e.target.closest('.lib-c-no')){ cf.classList.remove('in'); setTimeout(function(){ cf.remove(); }, 250); }
      else if(e.target.closest('.lib-c-del')){ c.classList.add('gone'); S.remove(d.id).then(function(){ setTimeout(render, 280); toast('Deleted ' + d.title + '.'); }); }
    });
    cf.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); cf.remove(); } });
  }

  grid.addEventListener('click', function(e){
    var more = e.target.closest('.lib-more');
    if(more){ e.preventDefault(); var id = more.closest('.lib-card').dataset.id; if(menu && menu.id === id) closeMenu(); else openMenu(more, id); return; }
    var item = e.target.closest('.lib-menu [data-act]');
    if(item){ act(item.dataset.act, menu.id); return; }
    if(e.target.closest('[data-sample]')) addSample();
  });
  document.addEventListener('pointerdown', function(e){ if(menu && !(e.target.closest && e.target.closest('.lib-menu, .lib-more'))) closeMenu(); });
  document.addEventListener('keydown', function(e){
    if(!menu) return;
    if(e.key === 'Escape'){ var b = menu.btn; closeMenu(); b.focus(); }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      var items = Array.prototype.slice.call(menu.el.querySelectorAll('button')), k = items.indexOf(document.activeElement);
      items[(k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });

  function addSample(){ S.addSample().then(render).then(function(){ toast('Added the sample deck.'); }); }
  sampleBtn.addEventListener('click', addSample);

  // ---------- opening a .sleek file ----------
  var ASK = { ask: function(title){ return P.askNotes('open', title); } };   // a file with speaker notes asks whether to keep them
  function importFile(f){
    if(!f) return Promise.resolve();
    return f.text().then(function(text){ return S.importDeck(text, ASK); }).then(function(d){
      if(!d) return;
      return render().then(function(){
        toast('Opened ' + d.title + '.');
        var c = grid.querySelector('.lib-card[data-id="' + d.id + '"]'); if(c) c.classList.add('fresh');
      });
    }).catch(function(e){ console.error(e); toast(e && /Sleek|newer/.test(e.message) ? e.message : 'That file couldn’t be opened.'); });
  }
  document.getElementById('lib-open').addEventListener('click', function(){ fileIn.value = ''; fileIn.click(); });
  fileIn.addEventListener('change', function(){ importFile(fileIn.files[0]); });
  var depth = 0;
  function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  document.addEventListener('dragenter', function(e){ if(!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('on'); });
  document.addEventListener('dragover', function(e){ if(hasFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', function(e){ if(!hasFiles(e)) return; depth = Math.max(0, depth - 1); if(!depth) drop.classList.remove('on'); });
  document.addEventListener('drop', function(e){
    if(!hasFiles(e)) return;
    e.preventDefault(); depth = 0; drop.classList.remove('on');
    // one after another, so each file's question comes up on its own
    Array.prototype.reduce.call(e.dataTransfer.files, function(p, f){ return p.then(function(){ return importFile(f); }); }, Promise.resolve());
  });

  // the offline cache (sw.js): the app opens with no connection and installs as an app
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]mirror=1/.test(location.search)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}   // while developing, only when asked for
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }

  // the installed app was asked to open a .sleek file (double-click, Open with)
  if('launchQueue' in window) window.launchQueue.setConsumer(function(p){
    (p.files || []).reduce(function(q, h){ return q.then(function(){ return h.getFile().then(importFile); }); }, Promise.resolve());
  });

  // ---------- the linked folder (core/folder.js; Chrome and Edge) ----------
  var F = window.SleekFolder, fBtn = document.getElementById('lib-folder'), fNote = document.getElementById('lib-folder-note');
  var inFolder = document.getElementById('lib-infolder'), ifGrid = document.getElementById('lib-if-grid'), folderFiles = [];
  function paintFolder(s){
    if(!F || !s.supported){ fBtn.hidden = true; return; }
    fBtn.hidden = false; fNote.hidden = s.linked;
    fBtn.classList.toggle('on', s.ok); fBtn.classList.toggle('warn', s.needsReconnect);
    fBtn.querySelector('span').textContent = !s.linked ? 'Link a folder' : s.ok ? 'Saving to ' + s.name : 'Reconnect ' + s.name;
    fBtn.setAttribute('aria-haspopup', s.ok ? 'true' : 'false');
    if(s.ok) listFolder(); else inFolder.hidden = true;
  }
  function listFolder(){
    F.files().then(function(fs){
      var have = {}; decks.forEach(function(d){ have[d.id] = true; });
      folderFiles = fs.filter(function(f){ return !f.id || !have[f.id]; });
      ifGrid.innerHTML = '';
      folderFiles.forEach(function(f, i){
        var c = card({ id: 'file:' + f.name, title: f.title, updated: f.modified, slides: f.slides, theme: f.theme }, i);
        c.classList.add('lib-file');
        var a = c.querySelector('.lib-thumb'); a.removeAttribute('href'); a.setAttribute('role', 'button'); a.tabIndex = 0; a.setAttribute('aria-label', 'Open ' + f.title + ' from the folder');
        var more = c.querySelector('.lib-more'); more.outerHTML = '<span class="lib-file-tag">' + esc(f.name) + '</span>';
        ifGrid.appendChild(c);
      });
      inFolder.hidden = !folderFiles.length;
    });
  }
  function openFromFolder(name){
    var f = folderFiles.filter(function(x){ return x.name === name; })[0]; if(!f) return;
    S.importDeck(f.text, ASK).then(function(d){ if(d) openDeck(d.id); }, function(e){ console.error(e); toast('That file couldn’t be opened.'); });
  }
  ifGrid.addEventListener('click', function(e){ var c = e.target.closest('.lib-file'); if(c) openFromFolder(c.dataset.id.slice(5)); });
  ifGrid.addEventListener('keydown', function(e){ var c = e.target.closest('.lib-file'); if(c && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openFromFolder(c.dataset.id.slice(5)); } });
  var fMenu = null;
  function closeFMenu(){ if(fMenu){ fMenu.remove(); fMenu = null; fBtn.setAttribute('aria-expanded', 'false'); } }
  if(F) fBtn.addEventListener('click', function(){
    var s = F.status();
    if(!s.linked) F.link().then(function(st){ toast('Linked ' + st.name + '. Every deck keeps a copy there.'); }, function(e){ if(e && e.name !== 'AbortError'){ console.error(e); toast('Couldn’t link that folder.'); } });
    else if(!s.ok) F.reconnect().then(function(st){ if(st.ok) toast('Reconnected. Saving to ' + st.name + '.'); });
    else {
      if(fMenu){ closeFMenu(); return; }
      fMenu = document.createElement('div'); fMenu.className = 'lib-menu lib-fmenu'; fMenu.setAttribute('role', 'menu');
      fMenu.innerHTML = '<button type="button" role="menuitem" data-f="all">Save every deck there now</button>' +
        '<button type="button" role="menuitem" data-f="other">Link a different folder…</button><hr>' +
        '<button type="button" role="menuitem" data-f="unlink">Unlink folder</button>';
      fBtn.parentNode.appendChild(fMenu); fBtn.setAttribute('aria-expanded', 'true');
      fMenu.style.left = fBtn.offsetLeft + 'px'; fMenu.style.top = (fBtn.offsetTop + fBtn.offsetHeight + 8) + 'px';
      fMenu.querySelector('button').focus();
    }
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest('.lib-fmenu [data-f]');
    if(b){
      var k = b.dataset.f; closeFMenu();
      if(k === 'all') F.writeAll().then(function(){ toast('Saved every deck to ' + F.status().name + '.'); });
      else if(k === 'other') F.link().then(function(st){ toast('Linked ' + st.name + '.'); }, function(){});
      else if(k === 'unlink') F.unlink().then(function(){ toast('Unlinked. Decks still live in this browser.'); });
      return;
    }
    if(fMenu && !e.target.closest('.lib-fmenu, #lib-folder')) closeFMenu();
  });
  document.addEventListener('keydown', function(e){ if(fMenu && e.key === 'Escape'){ closeFMenu(); fBtn.focus(); } });

  // another tab changed a deck: show it
  window.addEventListener('focus', function(){ render().then(function(){ if(F && F.status().ok) listFolder(); }); });
  S.open().then(function(){ return S.ensureSample(); }).then(render).then(function(){ if(F) F.onChange(paintFolder); }).catch(function(e){
    console.error(e);
    grid.innerHTML = '<div class="lib-empty"><b>This browser is blocking storage.</b><span>Sleek keeps decks in the browser; a private window can turn that off. Try a regular window.</span></div>';
  });
})();
