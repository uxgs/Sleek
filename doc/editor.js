/* The Sleek Docs editor: one page open at a time, edited in place and saved as you go.

   The page is a ProseMirror document (vendor/prosemirror.js) held to doc/schema.js's rules. Every
   change is saved 400 ms after you stop (core/doc-store.js), with the page's look beside it:
     seed = { kind: 'doc', v: 1, theme: { mode, accent, font }, doc: <the document as JSON> }
   Undo and Redo are the editor's own, for as long as the page stays open; the store also keeps a
   copy of the page from before you started and every ten minutes after.

   window.SleekDoc is what the other files build on: the view, open(id) to switch pages without a
   reload, flush() to save now, insertBlock(node), and three lists of callbacks: onUpdate (every
   change or cursor move), onOpen (a page was opened), onSaved (it was saved; the record is passed). */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, S = window.SleekStore, D = window.SleekDocs;
  if(!PM || !K || !S || !D || !window.SLEEK_DOC) return;
  var N = K.N, M = K.M, St = PM.state, cmd = PM.commands, sl = PM.schemaList, ir = PM.inputrules, de = document.documentElement;
  var $ = function(s){ return document.querySelector(s); };
  var view = null, cur = null, theme = {}, locked = false, dirty = false, saveT = 0, saving = Promise.resolve(), snapAt = 0, edited = false;
  var api = window.SleekDoc = { onUpdate: [], onOpen: [], onSaved: [], keyHook: null };
  function each(list, a){ list.forEach(function(fn){ try { fn(a); } catch(e){ console.error(e); } }); }

  var toastT = 0;
  function toast(msg){
    var old = $('.toast'); if(old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t);
    clearTimeout(toastT); toastT = setTimeout(function(){ t.remove(); }, 2800);
  }
  function status(s){ var e = $('#saved'); if(e) e.textContent = s; }
  function count(){ var m = view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ').match(/\S+/g); return m ? m.length : 0; }
  // the page's name: its cover's title if it has a cover, else its first line
  function title(){
    var d = view.state.doc, t = '';
    if(d.firstChild.type === N.cover) d.firstChild.forEach(function(n){ if(n.type === N.heading) t = n.textContent; });
    if(!t.trim()){ t = ''; d.descendants(function(n){ if(t) return false; if(n.type === N.cover) return false; if(n.isTextblock){ t = n.textContent; return false; } }); }
    return t.trim() || 'Untitled';
  }

  // ---------- the page's look ----------
  var LOOK = { mode: 'light', accent: '#7C5CFF', font: 'inter' };
  function last(){ try { return JSON.parse(localStorage.getItem('sleek-docs-look')) || {}; } catch(e){ return {}; } }
  function look(k){ return theme[k] || LOOK[k]; }
  function paint(){
    if(look('mode') === 'dark') de.setAttribute('data-mode', 'dark'); else de.removeAttribute('data-mode');
    de.style.setProperty('--d-accent', look('accent')); de.setAttribute('data-font', look('font'));
    var m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', look('mode') === 'dark' ? '#0E0E11' : '#FFFFFF');
  }
  function setLook(k, v){ theme[k] = v; paint(); try { localStorage.setItem('sleek-docs-look', JSON.stringify(theme)); } catch(e){} touch(); }

  // ---------- saving ----------
  function seedNow(){ return { kind: 'doc', v: 1, theme: { mode: look('mode'), accent: look('accent'), font: look('font') }, doc: view.state.doc.toJSON() }; }
  function save(){
    clearTimeout(saveT);
    if(locked || !dirty || !cur) return saving;
    dirty = false;
    var id = cur.id, seed = seedNow();
    saving = saving.then(function(){ return D.save(id, seed); }).then(function(m){
      if(!m){ status('This page was deleted'); return; }
      if(cur && cur.id === id){ cur = m; status('Saved · ' + count() + (count() === 1 ? ' word' : ' words')); document.title = m.title + ' · Sleek Docs'; }
      each(api.onSaved, m);
    }).catch(function(e){ console.error(e); dirty = true; status('Couldn’t save. It will try again as you type.'); });
    return saving;
  }
  function touch(){
    if(locked || !cur) return;
    if(!edited || Date.now() - snapAt > 600000){ edited = true; snapAt = Date.now(); D.snapshot(cur.id).catch(function(){}); }   // the page as it was, before this edit
    dirty = true; status('Saving…'); clearTimeout(saveT); saveT = setTimeout(save, 400);
  }
  function flush(){ return save(); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') flush(); });

  // ---------- editing ----------
  // put a block where the cursor is: in place of an empty line, or after the block the cursor is in
  function insertBlock(node){
    var st = view.state, $f = st.selection.$from, tr = st.tr, pos;
    if($f.depth === 1 && $f.parent.isTextblock && !$f.parent.content.size){ pos = $f.before(1); tr.replaceWith(pos, $f.after(1), node); }
    else { pos = $f.depth ? $f.after(1) : st.selection.to; tr.insert(pos, node); }
    var end = pos + node.nodeSize;
    if(end >= tr.doc.content.size) tr.insert(end, N.paragraph.create());
    tr.setSelection(St.Selection.near(tr.doc.resolve(node.isLeaf || node.type === N.figure ? end : pos + 1), 1));
    view.dispatch(tr.scrollIntoView()); view.focus();
  }
  function run(c){ var ok = c(view.state, view.dispatch, view); view.focus(); return ok; }
  function list(type){ return run(function(st, d){ return sl.wrapInList(type)(st, d) || sl.liftListItem(N.list_item)(st, d) || sl.liftListItem(N.task_item)(st, d); }); }
  var plugins = [
    new St.Plugin({ props: {
      handleKeyDown: function(v, e){ return api.keyHook ? !!api.keyHook(e) : false; },
      // faint prompts: "Title" on an empty first heading, and a hint on the empty line the cursor is on
      decorations: function(st){
        var $f = st.selection.$from, out = [], first = st.doc.firstChild;
        if(first.type === N.heading && !first.content.size) out.push(PM.view.Decoration.node(0, first.nodeSize, { class: 'dk-empty', 'data-ph': 'Title' }));
        // a cover's three lines each say what they are for while empty
        if(first.type === N.cover) first.forEach(function(n, off, i){ if(!n.content.size) out.push(PM.view.Decoration.node(1 + off, 1 + off + n.nodeSize, { class: 'dk-empty', 'data-ph': ['A short line above (or leave it empty)', 'Title', 'One line about it (or leave it empty)'][i] })); });
        if(st.selection.empty && $f.depth === 1 && $f.parent.isTextblock && !$f.parent.content.size && $f.parent !== first)
          out.push(PM.view.Decoration.node($f.before(), $f.after(), { class: 'dk-empty', 'data-ph': $f.parent.type === N.heading ? 'Heading' : $f.parent.type === N.paragraph ? 'Write, or press / for blocks' : '' }));
        return PM.view.DecorationSet.create(st.doc, out);
      } } }),
    // ids: every block at the top level of the page has one, and no two share one (a split or a paste copies it)
    new St.Plugin({ appendTransaction: function(trs, old, st){
      if(!trs.some(function(t){ return t.docChanged || t.getMeta('ids'); })) return null;     // 'ids': asked for outright, before publishing
      var seen = {}, tr = null;
      st.doc.forEach(function(n, pos){
        var id = n.attrs.id;
        if(!id || seen[id]){ id = D.uid(); tr = tr || st.tr; tr.setNodeMarkup(pos, null, Object.assign({}, n.attrs, { id: id })); }
        seen[id] = 1;
      });
      return tr ? tr.setMeta('addToHistory', false) : null;
    } }),
    // collapsible headings: a closed one hides what is under it, up to the next heading of its size or bigger.
    // The cursor never stays inside something hidden: its heading opens instead.
    new St.Plugin({
      props: { decorations: function(st){ var out = []; folds(st.doc).forEach(function(f){ f.hide.forEach(function(h){ out.push(PM.view.Decoration.node(h.pos, h.pos + h.size, { class: 'dk-folded' })); }); }); return PM.view.DecorationSet.create(st.doc, out); } },
      appendTransaction: function(trs, old, st){
        var s = st.selection, tr = null;
        folds(st.doc).forEach(function(f){ if(f.hide.some(function(h){ return s.from < h.pos + h.size && s.to > h.pos; })){ tr = tr || st.tr; tr.setNodeMarkup(f.pos, null, Object.assign({}, f.node.attrs, { closed: false })); } });
        return tr ? tr.setMeta('addToHistory', false) : null;
      } }),
    ir.inputRules({ rules: ir.smartQuotes.concat([ ir.emDash, ir.ellipsis,
      ir.textblockTypeInputRule(/^(#{1,3})\s$/, N.heading, function(m){ return { level: m[1].length }; }),
      ir.wrappingInputRule(/^\s*([-+*])\s$/, N.bullet_list), ir.wrappingInputRule(/^(\d+)\.\s$/, N.ordered_list), ir.wrappingInputRule(/^\s*\[\s?\]\s$/, N.task_list),
      ir.wrappingInputRule(/^\s*>\s$/, N.blockquote), ir.textblockTypeInputRule(/^```$/, N.code_block),
      new ir.InputRule(/^---$/, function(st, m, from){ var $p = st.doc.resolve(from); return $p.depth === 1 ? st.tr.replaceWith($p.before(), $p.after(), [N.horizontal_rule.create(), N.paragraph.create()]) : null; }) ]) }),
    PM.keymap.keymap({ 'Mod-z': PM.history.undo, 'Shift-Mod-z': PM.history.redo, 'Mod-y': PM.history.redo,
      'Mod-b': cmd.toggleMark(M.strong), 'Mod-i': cmd.toggleMark(M.em), 'Mod-u': cmd.toggleMark(M.underline), 'Mod-Shift-x': cmd.toggleMark(M.strike),
      'Mod-Shift-h': cmd.toggleMark(M.highlight), 'Mod-e': cmd.toggleMark(M.code),
      'Mod-k': function(){ if(api.link) api.link(); return true; },
      // ⌘Enter: out of whatever you are in (a table, columns, a callout, the cover), onto a new line after it
      'Mod-Enter': function(st, d){ var $f = st.selection.$from; if(!$f.depth) return false; var pos = $f.after(1); if(d){ var tr = st.tr.insert(pos, N.paragraph.create()); d(tr.setSelection(St.TextSelection.create(tr.doc, pos + 1)).scrollIntoView()); } return true; },
      'Enter': cmd.chainCommands(sl.splitListItem(N.list_item), sl.splitListItem(N.task_item, { done: false })),
      'Tab': cmd.chainCommands(PM.tables.goToNextCell(1), sl.sinkListItem(N.list_item),
               function(st, d){ if(st.selection.$from.parent.type !== N.code_block) return false; if(d) d(st.tr.insertText('  ')); return true; }, function(){ return true; }),
      'Shift-Tab': cmd.chainCommands(PM.tables.goToNextCell(-1), sl.liftListItem(N.list_item), function(){ return true; }),
      'Shift-Enter': cmd.chainCommands(cmd.exitCode, function(st, d){ if(d) d(st.tr.replaceSelectionWith(N.hard_break.create()).scrollIntoView()); return true; }) }),
    PM.keymap.keymap(cmd.baseKeymap), PM.history.history(), PM.dropcursor.dropCursor({ color: 'var(--d-accent)', width: 2 }), PM.gapcursor.gapCursor(), PM.tables.tableEditing()
  ];
  // each closed collapsible heading at the top level, with the blocks it hides
  function folds(doc){
    var out = [], open = [];      // open: closed headings whose hidden run is still going
    doc.forEach(function(n, pos){
      if(n.type === N.heading) open = open.filter(function(f){ return n.attrs.level > f.node.attrs.level; });
      open.forEach(function(f){ f.hide.push({ pos: pos, size: n.nodeSize }); });
      if(n.type === N.heading && n.attrs.toggle && n.attrs.closed){ var f = { pos: pos, node: n, hide: [] }; out.push(f); open.push(f); }
    });
    return out.filter(function(f){ return f.hide.length; });
  }
  var nodeViews = {
    // a heading; a collapsible one gets its arrow, which opens and closes it
    heading: function(node, v, getPos){
      var h = document.createElement('h' + node.attrs.level), btn = null, text = h;
      if(node.attrs.toggle){
        btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dk-fold'; btn.contentEditable = 'false'; text = document.createElement('span');
        btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
        btn.addEventListener('click', function(){ var n = v.state.doc.nodeAt(getPos()); if(n) v.dispatch(v.state.tr.setNodeMarkup(getPos(), null, Object.assign({}, n.attrs, { closed: !n.attrs.closed })).setMeta('addToHistory', false)); });
        h.appendChild(btn); h.appendChild(text);
      }
      function paint(n){ if(!btn) return; h.className = 'dk-toggle' + (n.attrs.closed ? ' closed' : ''); btn.setAttribute('aria-expanded', String(!n.attrs.closed)); btn.setAttribute('aria-label', n.attrs.closed ? 'Show what is under this heading' : 'Hide what is under this heading'); }
      paint(node);
      return { dom: h, contentDOM: text,
        update: function(n){ if(n.type !== N.heading || n.attrs.level !== node.attrs.level || !!n.attrs.toggle !== !!node.attrs.toggle) return false; node = n; paint(n); return true; },
        stopEvent: function(e){ return !!btn && btn.contains(e.target); },
        ignoreMutation: function(m){ return !!btn && (m.target === btn || (m.target === h && m.type === 'attributes')); } };
    },
    // a checklist item: the tick is a real button, the words beside it are the item's text
    task_item: function(node, v, getPos){
      var li = document.createElement('li'), c = document.createElement('button'), d = document.createElement('div');
      li.className = 'dk-task' + (node.attrs.done ? ' done' : ''); c.className = 'dk-check'; c.type = 'button'; c.contentEditable = 'false';
      c.setAttribute('role', 'checkbox'); c.setAttribute('aria-checked', String(!!node.attrs.done)); c.setAttribute('aria-label', 'Done');
      c.addEventListener('mousedown', function(e){ e.preventDefault(); });
      c.addEventListener('click', function(){ if(locked) return; var n = v.state.doc.nodeAt(getPos()); if(n) v.dispatch(v.state.tr.setNodeMarkup(getPos(), null, { done: !n.attrs.done })); });
      li.appendChild(c); li.appendChild(d);
      return { dom: li, contentDOM: d,
        update: function(n){ if(n.type !== N.task_item) return false; li.classList.toggle('done', !!n.attrs.done); c.setAttribute('aria-checked', String(!!n.attrs.done)); return true; },
        stopEvent: function(e){ return e.target === c; }, ignoreMutation: function(m){ return m.target === c || (m.target === li && m.type === 'attributes'); } };
    }
  };
  if(K.figureView) nodeViews.figure = K.figureView;

  function stateFor(seed){
    var doc = PM.model.Node.fromJSON(K.schema, seed.doc); doc.check();
    return St.EditorState.create({ doc: doc, plugins: plugins });
  }
  function make(state){
    view = api.view = new PM.view.EditorView($('#ed'), { state: state, nodeViews: nodeViews,
      attributes: { class: 'dk-doc', spellcheck: 'true' },
      editable: function(){ return !locked; },
      transformPastedHTML: function(html){ return K.cleanPaste ? K.cleanPaste(html) : html; },
      handlePaste: function(v, e){ return K.pastePictures ? K.pastePictures(v, e) : false; },
      handleDrop: function(v, e, slice, moved){ return !moved && K.dropPictures ? K.dropPictures(v, e) : false; },
      // ⌘ or Ctrl and a click follows a link
      handleClick: function(v, pos, e){
        if(!(e.metaKey || e.ctrlKey)) return false;
        var m = M.link.isInSet(v.state.doc.resolve(pos).marks()); if(!m) return false;
        window.open(m.attrs.href, '_blank', 'noopener'); return true;
      },
      dispatchTransaction: function(tr){
        view.updateState(view.state.apply(tr));
        if(tr.docChanged){ touch(); if(tr.getMeta('paste') && K.localize) K.localize(view); }
        each(api.onUpdate, tr);
      } });
    // a press below the last line puts the cursor at the end
    $('#pagebox').addEventListener('mousedown', function(e){ if(e.target !== this || locked) return; e.preventDefault(); view.dispatch(view.state.tr.setSelection(St.Selection.atEnd(view.state.doc))); view.focus(); });
  }

  // open a page here, in place of the one showing; resolves with its record, or null if it isn't there
  function open(id, opts){
    return flush().then(function(){ return D.get(id); }).then(function(d){
      if(!d) return null;
      return S.hydrate(d.seed).then(function(seed){
        var state, note = $('#locked');
        locked = false; theme = {}; edited = false;
        try {
          if(seed.v > 1) throw new Error('newer');
          state = stateFor(seed);
        } catch(e){
          // a page this copy of Sleek Docs can't read: show that, and never save over it
          locked = true; state = St.EditorState.create({ doc: N.doc.create(null, [N.paragraph.create()]), plugins: plugins });
        }
        var t = seed.theme || {}, l = last(), fresh = !t.mode && !t.accent && !t.font;
        ['mode', 'accent', 'font'].forEach(function(k){ var v = fresh ? l[k] : t[k]; if(v) theme[k] = v; });
        cur = d; dirty = false; clearTimeout(saveT);
        if(view) view.updateState(state); else make(state);
        note.hidden = !locked; note.textContent = locked ? 'This page was made with a newer Sleek Docs. Reload this page to update, then open it again. Nothing here has been changed.' : '';
        paint(); document.title = d.title + ' · Sleek Docs'; status(locked ? '' : 'Saved · ' + count() + (count() === 1 ? ' word' : ' words'));
        $('#scroll').scrollTop = 0;
        if(!opts || opts.url !== false){ try { history[opts && opts.replace ? 'replaceState' : 'pushState'](null, '', location.pathname + '?d=' + d.id); } catch(e){} }
        each(api.onOpen, d);
        return d;
      });
    });
  }
  window.addEventListener('popstate', function(){ var id = new URLSearchParams(location.search).get('d'); if(id && cur && id !== cur.id) open(id, { url: false }); });
  function newPage(folder){ return D.create({ folder: folder || null }).then(function(d){ return open(d.id); }).then(function(d){ view.focus(); return d; }); }

  api.open = open; api.flush = flush; api.newPage = newPage; api.toast = toast; api.insertBlock = insertBlock; api.run = run; api.list = list;
  api.look = look; api.setLook = setLook; api.title = title; api.touch = touch; api.seedNow = seedNow;
  api.meta = function(){ return cur; }; api.locked = function(){ return locked; };

  open(window.SLEEK_DOC.id, { replace: true }).then(function(d){
    setTimeout(function(){ de.classList.remove('booting'); }, 30);
    if(d && !locked && !('ontouchstart' in window)) view.focus();
  }).catch(function(e){ console.error(e); de.classList.remove('booting'); toast('Sleek Docs could not open this page.'); });
})();
