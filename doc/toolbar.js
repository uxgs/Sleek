/* The controls around the page: the format bar, the / menu and Insert (both list the same blocks),
   the link box, Look (the page's light or dark, colour and type) and Share (PDF, Markdown, a copy).

   Menus are one kind of pop-up (SleekDoc.menu): one open at a time, closed by Esc, a press
   elsewhere, or a second press on the button that opened it. */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc, D = window.SleekDocs; if(!A || !K) return;
  var N = K.N, M = K.M, cmd = PM.commands, T = PM.tables, main = document.getElementById('main');
  var $ = function(s, r){ return (r || document).querySelector(s); }, $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  var ICON = {
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    h: '<path d="M5 5v14M15 5v14M5 12h10"/>', list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    num: '<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 15h2l-2 3h2"/>', check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    quote: '<path d="M6 17c2-1 3-3 3-6H5V6h5v5c0 4-1.5 6-4 6zM15 17c2-1 3-3 3-6h-4V6h5v5c0 4-1.5 6-4 6z"/>', image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
    table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 15h18M9 5v14M15 5v14"/>', rule: '<path d="M3 12h18"/>', code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
    pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    down: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/>'
  };
  function ico(n, cls){ return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>'; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function view(){ return A.view; }

  // ---------- pop-up menus ----------
  var open = null, slash = null;
  function closePop(){ if(open){ if(open.from) open.from.setAttribute('aria-expanded', 'false'); open.remove(); open = null; } slash = null; }
  // anchor: an element, or a rectangle on screen. side 'right' lines the menu's right edge up with the anchor's
  function pop(anchor, build, side){
    closePop(); var p = el('div', 'pop'); build(p); main.appendChild(p); open = p;
    var m = main.getBoundingClientRect(), a = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    var left = side === 'right' ? a.right - m.left - p.offsetWidth : a.left - m.left;
    p.style.left = Math.max(8, Math.min(left, m.width - p.offsetWidth - 8)) + 'px';
    var top = a.bottom - m.top + 6; if(top + p.offsetHeight > m.height - 8) top = Math.max(8, a.top - m.top - p.offsetHeight - 6);
    p.style.top = top + 'px'; return p;
  }
  function menu(btn, build, side){
    if(open && open.from === btn){ closePop(); return null; }
    var p = pop(btn, build, side); p.from = btn; btn.setAttribute('aria-expanded', 'true'); return p;
  }
  document.addEventListener('pointerdown', function(e){ if(open && !open.contains(e.target) && !(open.from && open.from.contains(e.target))) closePop(); }, true);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && open && !slash){ var f = open.from; closePop(); if(f) f.focus(); } });
  // one menu row; act runs on a press. Pressing never takes the cursor out of the page.
  function item(p, icon, name, hint, act, cls){
    var m = el('button', 'mi' + (cls ? ' ' + cls : '')); m.type = 'button';
    m.innerHTML = (icon ? ico(icon) : '') + '<span><b>' + esc(name) + '</b>' + (hint ? '<i>' + esc(hint) + '</i>' : '') + '</span>';
    m.addEventListener('mousedown', function(e){ e.preventDefault(); }); m.addEventListener('click', function(){ act(m); });
    p.appendChild(m); return m;
  }
  // a row that deletes: the first press asks, the second (within five seconds) does it
  function danger(p, name, act){
    var armed = 0, m = item(p, 'trash', name, null, function(){
      if(Date.now() - armed < 5000){ closePop(); act(); return; }
      armed = Date.now(); $('b', m).textContent = 'Press again to delete'; setTimeout(function(){ if(m.isConnected) $('b', m).textContent = name; }, 5000);
    }, 'warn');
    return m;
  }
  A.menu = menu; A.pop = pop; A.closePop = closePop; A.item = item; A.danger = danger; A.ico = ico; A.esc = esc;

  // ---------- the blocks you can add ----------
  function table(){ var row = function(type){ return N.table_row.create(null, [0, 1, 2].map(function(){ return type.create(null, [N.paragraph.create()]); })); };
    return N.table.create(null, [row(N.table_header), row(N.table_cell), row(N.table_cell)]); }
  var BLOCKS = [
    { g: 'Text', n: 'Heading 1', h: 'A big section heading', i: 'h', f: function(){ A.run(cmd.setBlockType(N.heading, { level: 1 })); } },
    { g: 'Text', n: 'Heading 2', h: 'A section heading', i: 'h', f: function(){ A.run(cmd.setBlockType(N.heading, { level: 2 })); } },
    { g: 'Text', n: 'Heading 3', h: 'A small heading', i: 'h', f: function(){ A.run(cmd.setBlockType(N.heading, { level: 3 })); } },
    { g: 'Text', n: 'Bullets', h: 'A simple list', i: 'list', f: function(){ A.list(N.bullet_list); } },
    { g: 'Text', n: 'Numbers', h: 'A numbered list', i: 'num', f: function(){ A.list(N.ordered_list); } },
    { g: 'Text', n: 'Checklist', h: 'Things to tick off', i: 'check', f: function(){ A.list(N.task_list); } },
    { g: 'Text', n: 'Quote', h: 'Words worth setting apart', i: 'quote', f: function(){ A.run(cmd.wrapIn(N.blockquote)); } },
    { g: 'Text', n: 'Code', h: 'Fixed-width text', i: 'code', f: function(){ A.run(cmd.setBlockType(N.code_block)); } },
    { g: 'Text', n: 'Divider', h: 'A line between sections', i: 'rule', f: function(){ A.insertBlock(N.horizontal_rule.create()); } },
    { g: 'More', n: 'Picture', h: 'Choose one, or drop it on the page', i: 'image', f: function(){ var i = $('#pick-pic'); i.value = ''; i.click(); } },
    { g: 'More', n: 'Table', h: 'Rows and columns', i: 'table', f: function(){ A.insertBlock(table()); } }
  ];
  var TABLE = [
    { n: 'Add a row below', i: 'plus', c: T.addRowAfter }, { n: 'Add a column to the right', i: 'plus', c: T.addColumnAfter },
    { n: 'Delete this row', i: 'minus', c: T.deleteRow }, { n: 'Delete this column', i: 'minus', c: T.deleteColumn }, { n: 'Delete the table', i: 'trash', c: T.deleteTable }
  ];
  // list the blocks in a menu, narrowed to those whose name has q; first marks the top one as chosen (the / menu)
  function blockList(p, q, pick, first){
    var lastG = '', n = 0; q = (q || '').toLowerCase().trim();
    if(!q && T.isInTable(view().state)){
      p.appendChild(el('h4', '', 'This table'));
      TABLE.forEach(function(t){ item(p, t.i, t.n, null, function(){ pick({ f: function(){ A.run(t.c); } }); }); });
    }
    BLOCKS.forEach(function(b){
      if(q && b.n.toLowerCase().indexOf(q) < 0) return;
      if(b.g !== lastG){ p.appendChild(el('h4', '', b.g)); lastG = b.g; }
      var m = item(p, b.i, b.n, b.h, function(){ pick(b); }); if(first && n === 0) m.classList.add('sel'); n++;
    });
    if(!n) p.appendChild(el('p', '', 'Nothing by that name'));
  }
  $('#f-insert').addEventListener('click', function(){ menu(this, function(p){ blockList(p, null, function(b){ closePop(); view().focus(); b.f(); }); }, 'right'); });
  $('#pick-pic').addEventListener('change', function(){ if(this.files.length && K.addPictures) K.addPictures(view(), this.files); });

  // the / menu: "/" at the start of an empty line lists the blocks, and what you type next narrows the list
  function slashCheck(){
    var st = view().state, $f = st.selection.$from, t = st.selection.empty && $f.parent.type === N.paragraph ? $f.parent.textBetween(0, $f.parentOffset) : '', m = /^\/([a-z0-9 ]*)$/i.exec(t);
    if(!m || A.locked()){ if(slash) closePop(); return; }
    var c = view().coordsAtPos(st.selection.from), pick = function(b){ var s = view().state, $p = s.selection.$from; view().dispatch(s.tr.delete($p.start(), $p.pos)); closePop(); b.f(); };
    pop({ left: c.left, right: c.left, top: c.top, bottom: c.bottom }, function(p){ blockList(p, m[1], pick, true); });
    slash = true;
  }
  A.keyHook = function(e){
    if(!slash || !open) return false;
    var items = $$('.mi', open), i = items.indexOf($('.mi.sel', open));
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if(items.length){ if(i >= 0) items[i].classList.remove('sel'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[i].classList.add('sel'); items[i].scrollIntoView({ block: 'nearest' }); }
      return true;
    }
    if(e.key === 'Enter'){ if(i >= 0){ items[i].click(); return true; } return false; }
    if(e.key === 'Escape'){ closePop(); return true; }
    return false;
  };

  // ---------- the format bar: lit buttons show what the cursor is in ----------
  function markOn(m){ var st = view().state, s = st.selection; return s.empty ? !!m.isInSet(st.storedMarks || s.$from.marks()) : st.doc.rangeHasMark(s.from, s.to, m); }
  function bar(){
    $$('[data-m]', main).forEach(function(b){ var on = markOn(M[b.getAttribute('data-m')]); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    var $f = view().state.selection.$from, p = $f.parent, v = 'p', inside = {};
    for(var d = $f.depth; d > 0; d--) inside[$f.node(d).type.name] = 1;
    if(p.type === N.heading) v = 'h' + p.attrs.level; else if(p.type === N.code_block) v = 'code'; else if(inside.blockquote) v = 'quote';
    $('#f-style').value = v; $('#f-link').classList.toggle('on', markOn(M.link));
    $$('[data-l]', main).forEach(function(b){ b.classList.toggle('on', !!inside[b.getAttribute('data-l')]); });
  }
  function press(b, fn){ b.addEventListener('mousedown', function(e){ e.preventDefault(); }); b.addEventListener('click', function(){ if(!A.locked()) fn(); }); }
  $$('[data-m]', main).forEach(function(b){ press(b, function(){ A.run(cmd.toggleMark(M[b.getAttribute('data-m')])); }); });
  $$('[data-l]', main).forEach(function(b){ press(b, function(){ A.list(N[b.getAttribute('data-l')]); }); });
  press($('#f-undo'), function(){ A.run(PM.history.undo); }); press($('#f-redo'), function(){ A.run(PM.history.redo); });
  $('#f-style').addEventListener('change', function(){
    var v = this.value;
    if(v === 'quote') A.run(cmd.wrapIn(N.blockquote)); else if(v === 'code') A.run(cmd.setBlockType(N.code_block));
    else if(v === 'p') A.run(function(st, d){ return cmd.setBlockType(N.paragraph)(st, d) || cmd.lift(st, d); });
    else A.run(cmd.setBlockType(N.heading, { level: +v.slice(1) }));
  });

  // ---------- links ----------
  function linkPop(){
    var st = view().state, s = st.selection, from = s.from, to = s.to, has = '';
    if(s.empty){
      // the cursor is inside a link: work on the whole link
      var mk = M.link.isInSet(s.$from.marks()); if(!mk){ A.toast('Select some words first, then add the link'); return; }
      var $p = s.$from, i = $p.index(), par = $p.parent, start = $p.start(), a = i, b = i;
      while(a > 0 && mk.isInSet(par.child(a - 1).marks)) a--; while(b < par.childCount - 1 && mk.isInSet(par.child(b + 1).marks)) b++;
      for(var k = 0, off = 0; k < par.childCount; k++){ if(k === a) from = start + off; off += par.child(k).nodeSize; if(k === b) to = start + off; }
      has = mk.attrs.href;
    } else st.doc.nodesBetween(from, to, function(n){ var m = M.link.isInSet(n.marks); if(m) has = m.attrs.href; });
    var p = pop($('#f-link'), function(p){ p.classList.add('linkpop'); p.innerHTML = '<input type="url" placeholder="Paste or type an address" aria-label="Link address"><button type="button" class="btn">Apply</button>' + (has ? '<button type="button" class="fb w">Remove</button>' : ''); });
    var inp = $('input', p); inp.value = has; inp.focus(); inp.select();
    function apply(){
      var v = inp.value.trim(); if(v && !/^(https?:|mailto:|tel:|#)/i.test(v)) v = (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'mailto:' : 'https://') + v;
      var tr = view().state.tr.removeMark(from, to, M.link); if(v) tr.addMark(from, to, M.link.create({ href: v }));
      view().dispatch(tr); closePop(); view().focus();
    }
    $('.btn', p).addEventListener('click', apply);
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); apply(); } if(e.key === 'Escape'){ e.stopPropagation(); closePop(); view().focus(); } });
    if(has) $('.fb', p).addEventListener('click', function(){ inp.value = ''; apply(); });
  }
  A.link = function(){ if(!A.locked()) linkPop(); };
  $('#f-link').addEventListener('mousedown', function(e){ e.preventDefault(); }); $('#f-link').addEventListener('click', A.link);

  // ---------- Look ----------
  var ACC = ['#7C5CFF', '#0A84FF', '#12A36A', '#F0642D', '#E0457B', '#5B6470'];
  $('#b-look').addEventListener('click', function(){
    menu(this, function(p){
      (function paint(){
        p.innerHTML = '<h4>Page</h4><div class="seg"><button type="button" data-k="mode" data-v="light">Light</button><button type="button" data-k="mode" data-v="dark">Dark</button></div><h4>Colour</h4><div class="sws">' +
          ACC.map(function(c){ return '<button type="button" style="--c:' + c + '" data-c="' + c + '" aria-label="Colour ' + c + '"></button>'; }).join('') +
          '</div><h4>Type</h4><div class="seg"><button type="button" data-k="font" data-v="inter">Clean</button><button type="button" data-k="font" data-v="editorial">Editorial</button></div><p>The look is saved with this page, and new pages start with it.</p>';
        $$('[data-k]', p).forEach(function(b){ var k = b.getAttribute('data-k'), v = b.getAttribute('data-v'); b.classList.toggle('on', A.look(k) === v); b.addEventListener('click', function(){ A.setLook(k, v); paint(); }); });
        $$('[data-c]', p).forEach(function(b){ var c = b.getAttribute('data-c'); b.classList.toggle('on', A.look('accent') === c); b.addEventListener('click', function(){ A.setLook('accent', c); paint(); }); });
      })();
    }, 'right');
  });

  // ---------- Share ----------
  function saveFile(name, blob){ var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); }
  function fileName(t){ return (String(t || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'); }
  A.saveFile = saveFile; A.fileName = fileName;
  $('#b-share').addEventListener('click', function(){
    menu(this, function(p){
      p.appendChild(el('h4', '', 'Share'));
      item(p, 'pdf', 'Save as PDF', 'A clean copy on paper-white, through your browser’s print', function(){ closePop(); A.flush().then(function(){ window.print(); }); });
      item(p, 'code', 'Save as Markdown', 'Plain text that other writing apps open', function(){ closePop(); if(K.saveMarkdown) K.saveMarkdown(); });
      p.appendChild(el('div', 'line'));
      item(p, 'down', 'Download a copy', 'A .sleek file to keep, or open in another browser', function(){
        closePop(); var m = A.meta();
        A.flush().then(function(){ return D.exportDoc(m.id); }).then(function(text){ if(text) saveFile(fileName(m.title) + '.sleek', new Blob([text], { type: 'application/json' })); });
      });
      item(p, 'copy', 'Duplicate', 'A second copy of this page, beside it', function(){
        closePop(); var m = A.meta();
        A.flush().then(function(){ return D.duplicate(m.id); }).then(function(d){ if(d) return A.open(d.id).then(function(){ A.toast('This is the copy'); }); });
      });
    }, 'right');
  });

  A.onUpdate.push(function(){ bar(); slashCheck(); });
  A.onOpen.push(function(){ closePop(); bar(); });
  bar();
})();
