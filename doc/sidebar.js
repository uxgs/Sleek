/* The list of pages down the left of Sleek Docs: folders inside folders, search, and the page's
   place shown in the bar above it ("Clients / Harbor Bikes / Proposal").

   Pages and folders come from core/doc-store.js. A press opens a page in place (no reload); drag a
   page or a folder onto a folder to move it, or onto the empty space below to take it out. ⌘\ (or
   the button in the bar) hides the list, and that is remembered in this browser ('sleek-docs-side').
   Search looks through titles and every page's words. */
(function(){
  var A = window.SleekDoc, D = window.SleekDocs; if(!A || !D) return;
  var app = document.getElementById('app'), box = document.getElementById('tree'), q = document.getElementById('q');
  var docs = [], folders = [], drag = null, renaming = null;
  var narrow = function(){ return window.matchMedia('(max-width: 760px)').matches; };
  function byId(list, id){ return list.filter(function(x){ return x.id === id; })[0] || null; }
  function under(f, id){ for(var x = f; x; x = (byId(folders, x) || {}).parent) if(x === id) return true; return false; }
  function load(){ return Promise.all([D.list(), D.folders()]).then(function(r){ docs = r[0]; folders = r[1]; }); }

  function crumb(){
    var m = A.meta(), c = document.getElementById('crumb'); if(!m) return;
    var path = [], f = (byId(docs, m.id) || m).folder, guard = 0;
    while(f && guard++ < 50){ var o = byId(folders, f); if(!o) break; path.unshift(o.name); f = o.parent; }
    c.innerHTML = path.map(function(p){ return '<em style="font-style:normal">' + A.esc(p) + ' /</em>'; }).join(' ') + ' <b>' + A.esc(A.title()) + '</b>';
  }
  function more(row, build){
    var b = document.createElement('span'); b.className = 'row-more'; b.setAttribute('role', 'button'); b.tabIndex = 0; b.setAttribute('aria-label', 'More'); b.setAttribute('aria-haspopup', 'true'); b.innerHTML = A.ico('more');
    function go(e){ e.stopPropagation(); e.preventDefault(); A.menu(b, build); }
    b.addEventListener('click', go); b.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' ') go(e); });
    row.appendChild(b);
  }
  function openPage(id){ if(A.meta() && A.meta().id === id){ if(narrow()) hide(true); return; } A.open(id).then(function(){ if(narrow()) hide(true); }); }
  function removePage(d){
    var wasCur = A.meta() && A.meta().id === d.id;
    var O = window.SleekOnline;
    (wasCur ? A.flush() : Promise.resolve()).then(function(){ return d.viewers && O ? O.stop(null, d.viewers).catch(function(){}) : null; }).then(function(){ return D.remove(d.id); }).then(load).then(function(){
      A.toast('Deleted “' + d.title + '”');
      if(!wasCur){ paint(); return; }
      return docs.length ? A.open(docs[0].id) : A.newPage(null);
    });
  }
  function docRow(d, depth){
    var r = document.createElement('button'), m = A.meta(); r.type = 'button'; r.className = 'row' + (m && d.id === m.id ? ' cur' : ''); r.style.setProperty('--in', depth); r.draggable = true;
    if(m && d.id === m.id) r.setAttribute('aria-current', 'page');
    r.innerHTML = A.ico('doc') + '<span>' + A.esc(m && d.id === m.id ? A.title() : d.title) + '</span>';
    r.addEventListener('click', function(){ openPage(d.id); });
    r.addEventListener('dragstart', function(e){ drag = { doc: d.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.title); });
    more(r, function(p){
      A.item(p, 'copy', 'Duplicate', null, function(){ A.closePop(); D.duplicate(d.id).then(function(n){ return load().then(function(){ if(n) openPage(n.id); }); }); });
      if(d.folder) A.item(p, 'folder', 'Take out of its folder', null, function(){ A.closePop(); D.move(d.id, null).then(refresh); });
      A.danger(p, 'Delete this page', function(){ removePage(d); });
    });
    box.appendChild(r);
  }
  function rename(f, row){
    renaming = f.id; var s = row.querySelector('span:not(.row-more)'), inp = document.createElement('input'); inp.value = f.name; inp.setAttribute('aria-label', 'Folder name');
    s.replaceWith(inp); inp.focus(); inp.select();
    var done = false, end = function(keep){ if(done) return; done = true; renaming = null; (keep && inp.value.trim() && inp.value.trim() !== f.name ? D.setFolder(f.id, { name: inp.value }) : Promise.resolve()).then(refresh); };
    inp.addEventListener('click', function(e){ e.stopPropagation(); });
    inp.addEventListener('keydown', function(e){ e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); end(true); } if(e.key === 'Escape') end(false); });
    inp.addEventListener('blur', function(){ end(true); });
  }
  function folderRow(f, depth){
    var r = document.createElement('button'); r.type = 'button'; r.className = 'row' + (f.open ? ' open' : ''); r.style.setProperty('--in', depth); r.draggable = true; r.setAttribute('aria-expanded', String(!!f.open)); r.dataset.folder = f.id;
    r.innerHTML = A.ico('chev', 'chev') + A.ico('folder') + '<span>' + A.esc(f.name) + '</span><em>' + docs.filter(function(d){ return under(d.folder, f.id); }).length + '</em>';
    r.addEventListener('click', function(){ if(renaming) return; f.open = !f.open; D.setFolder(f.id, { open: f.open }); paint(); });
    r.addEventListener('dragstart', function(e){ drag = { folder: f.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.name); });
    r.addEventListener('dragover', function(e){ if(drag && !(drag.folder && under(f.id, drag.folder))){ e.preventDefault(); r.classList.add('over'); } });
    r.addEventListener('dragleave', function(){ r.classList.remove('over'); });
    r.addEventListener('drop', function(e){
      e.preventDefault(); e.stopPropagation(); r.classList.remove('over'); if(!drag) return;
      var job = drag.doc ? D.move(drag.doc, f.id) : D.setFolder(drag.folder, { parent: f.id }); drag = null;
      job.then(function(){ return D.setFolder(f.id, { open: true }); }).then(refresh).then(function(){ A.toast('Moved to ' + f.name); });
    });
    more(r, function(p){
      A.item(p, 'doc', 'New page here', null, function(){ A.closePop(); D.setFolder(f.id, { open: true }).then(function(){ return A.newPage(f.id); }); });
      A.item(p, 'folder', 'New folder inside', null, function(){ A.closePop(); D.setFolder(f.id, { open: true }).then(function(){ return newFolder(f.id); }); });
      A.item(p, 'edit', 'Rename', null, function(){ A.closePop(); rename(f, r); });
      A.danger(p, 'Delete this folder', function(){ D.removeFolder(f.id).then(refresh).then(function(){ A.toast('Folder deleted. Its pages moved up.'); }); });
    });
    box.appendChild(r);
    return r;
  }
  function paint(){
    box.innerHTML = ''; var term = q.value.trim();
    if(term){
      D.search(term).then(function(hits){
        if(q.value.trim() !== term) return;
        box.innerHTML = ''; hits.forEach(function(d){ docRow(d, 0); });
        if(!hits.length){ var n = document.createElement('div'); n.className = 'tree-none'; n.textContent = 'No page mentions “' + term + '”.'; box.appendChild(n); }
      });
      return;
    }
    (function level(parent, depth){
      folders.filter(function(f){ return (f.parent || null) === parent || (parent === null && f.parent && !byId(folders, f.parent)); }).forEach(function(f){
        folderRow(f, depth);
        if(f.open){ level(f.id, depth + 1); docs.filter(function(d){ return d.folder === f.id; }).forEach(function(d){ docRow(d, depth + 1); }); }
      });
    })(null, 0);
    docs.filter(function(d){ return !d.folder || !byId(folders, d.folder); }).forEach(function(d){ docRow(d, 0); });
    crumb();
  }
  function refresh(){ return load().then(paint); }
  function newFolder(parent){
    return D.addFolder('New folder', parent).then(function(f){ return refresh().then(function(){ var r = box.querySelector('[data-folder="' + f.id + '"]'); if(r) rename(byId(folders, f.id), r); }); });
  }
  // dropping on the empty space takes a page or folder out of its folder
  box.addEventListener('dragover', function(e){ if(drag && e.target === box) e.preventDefault(); });
  box.addEventListener('drop', function(e){ if(e.target !== box || !drag) return; e.preventDefault(); var job = drag.doc ? D.move(drag.doc, null) : D.setFolder(drag.folder, { parent: null }); drag = null; job.then(refresh); });
  document.addEventListener('dragend', function(){ drag = null; });
  var qt = 0; q.addEventListener('input', function(){ clearTimeout(qt); qt = setTimeout(paint, 120); });
  document.getElementById('new-doc').addEventListener('click', function(){ var m = A.meta(); A.newPage(m ? (byId(docs, m.id) || m).folder : null).then(function(){ if(narrow()) hide(true); }); });
  document.getElementById('new-folder').addEventListener('click', function(){ newFolder(null); });

  // showing and hiding the list
  function hide(on){ app.classList.toggle('no-side', on); if(!narrow()){ try { localStorage.setItem('sleek-docs-side', on ? 'off' : 'on'); } catch(e){} } }
  var start = narrow(); try { if(!start) start = localStorage.getItem('sleek-docs-side') === 'off'; } catch(e){}
  app.classList.toggle('no-side', start);
  setTimeout(function(){ app.classList.add('live'); }, 400);      // from now on the list slides when it comes and goes (not while the page is first being laid out)
  document.getElementById('b-side').addEventListener('click', function(){ hide(!app.classList.contains('no-side')); });
  document.addEventListener('keydown', function(e){ if((e.metaKey || e.ctrlKey) && e.key === '\\'){ e.preventDefault(); hide(!app.classList.contains('no-side')); } });
  document.getElementById('main').addEventListener('pointerdown', function(e){ if(narrow() && !app.classList.contains('no-side') && !e.target.closest('#b-side')) hide(true); });

  A.onOpen.push(refresh);
  A.onSaved.push(function(m){ var d = byId(docs, m.id); if(!d || d.title !== m.title){ refresh(); } else { d.updated = m.updated; crumb(); } });
  // the title in the bar and the list follows the page as you type
  var lastTitle = '';
  A.onUpdate.push(function(tr){ if(!tr.docChanged) return; var t = A.title(); if(t === lastTitle) return; lastTitle = t; crumb(); var c = box.querySelector('.row.cur span'); if(c) c.textContent = t; });
  refresh();
})();
