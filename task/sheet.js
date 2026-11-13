/* A task's details: the sheet that slides in over the right of the view when you press a task.

   Its name, whether it is done, its status, due date, person and tags, its subtasks, and its notes.
   Every change is saved as you make it (core/task-store.js), and the board behind follows.

   Notes are a Sleek Docs document, written with the same editor (vendor/prosemirror.js and Docs'
   rules, doc/schema.js), loaded the first time a task is opened: headings, lists, checklists,
   quotes, links, bold and the rest, typed the same ways ("## ", "- ", "[] ", ⌘B). Pictures can be
   pasted or dropped in; like every picture in Sleek they go in the picture store (core/store.js),
   and the notes keep a short reference. A task with nothing in its notes stores none. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp, S = window.SleekStore; if(!T || !A) return;
  var esc = A.esc, main = document.getElementById('main');
  var el = null, id = null, view = null, saveT = 0, noteFor = null;

  // ---------- the editor, loaded when first needed ----------
  var loading = null;
  function need(src){ return new Promise(function(ok, no){ var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function(){ no(new Error('offline')); }; document.head.appendChild(s); }); }
  function editorKit(){
    if(window.SleekPM && window.SleekDocKit && window.SleekDocKit.figureView) return Promise.resolve();
    if(!loading) loading = (window.SleekPM ? Promise.resolve() : need('vendor/prosemirror.js')).then(function(){ return window.SleekDocKit ? null : need('doc/schema.js'); })
      .then(function(){ return window.SleekDocKit.cleanPaste ? null : need('doc/paste.js'); }).then(function(){ return window.SleekDocKit.figureView ? null : need('doc/blocks-figure.js'); })
      .catch(function(e){ loading = null; throw e; });
    return loading;
  }
  function emptyDoc(json){ return !json || !json.content || (json.content.length === 1 && json.content[0].type === 'paragraph' && !(json.content[0].content || []).length); }
  function saveNotes(){
    clearTimeout(saveT); if(!view || !noteFor) return;
    var tid = noteFor, json = view.state.doc.toJSON();
    if(emptyDoc(json)){ var t = T.task(tid); if(t && t.notes) T.setTask(tid, { notes: null }); return; }
    (S ? S.dehydrate(json) : Promise.resolve(json)).then(function(stored){ if(T.task(tid)) T.setTask(tid, { notes: stored }); });
  }
  function mountNotes(host, t){
    host.innerHTML = '<span class="note-wait">Opening the notes…</span>';
    editorKit().then(function(){ return t.notes && S ? S.hydrate(t.notes) : t.notes; }).then(function(json){
      if(id !== t.id || !host.isConnected) return;
      var PM = window.SleekPM, K = window.SleekDocKit, N = K.N, M = K.M, St = PM.state, cmd = PM.commands, sl = PM.schemaList, ir = PM.inputrules, doc;
      try { doc = json ? PM.model.Node.fromJSON(K.schema, json) : null; if(doc) doc.check(); } catch(e){ doc = null; host.innerHTML = '<span class="note-wait">These notes were written with a newer Sleek. Reload to update.</span>'; return; }
      host.innerHTML = '';
      var plugins = [
        new St.Plugin({ props: { decorations: function(st){ var d = st.doc; return d.childCount === 1 && d.firstChild.isTextblock && !d.firstChild.content.size ? PM.view.DecorationSet.create(d, [PM.view.Decoration.node(0, d.firstChild.nodeSize, { class: 'dk-empty', 'data-ph': 'Write notes: headings, lists, links, pictures.' })]) : PM.view.DecorationSet.empty; } } }),
        ir.inputRules({ rules: ir.smartQuotes.concat([ ir.emDash, ir.ellipsis, ir.textblockTypeInputRule(/^(#{1,3})\s$/, N.heading, function(m){ return { level: m[1].length }; }),
          ir.wrappingInputRule(/^\s*([-+*])\s$/, N.bullet_list), ir.wrappingInputRule(/^(\d+)\.\s$/, N.ordered_list), ir.wrappingInputRule(/^\s*\[\s?\]\s$/, N.task_list), ir.wrappingInputRule(/^\s*>\s$/, N.blockquote) ]) }),
        PM.keymap.keymap({ 'Mod-z': PM.history.undo, 'Shift-Mod-z': PM.history.redo, 'Mod-y': PM.history.redo, 'Mod-b': cmd.toggleMark(M.strong), 'Mod-i': cmd.toggleMark(M.em), 'Mod-u': cmd.toggleMark(M.underline),
          'Mod-Shift-x': cmd.toggleMark(M.strike), 'Mod-Shift-h': cmd.toggleMark(M.highlight), 'Mod-e': cmd.toggleMark(M.code),
          'Enter': cmd.chainCommands(sl.splitListItem(N.list_item), sl.splitListItem(N.task_item, { done: false })),
          'Tab': cmd.chainCommands(sl.sinkListItem(N.list_item), function(){ return true; }), 'Shift-Tab': cmd.chainCommands(sl.liftListItem(N.list_item), function(){ return true; }) }),
        PM.keymap.keymap(cmd.baseKeymap), PM.history.history(), PM.gapcursor.gapCursor()
      ];
      function pictures(v, files, e){
        var list = Array.prototype.filter.call(files || [], function(f){ return /^image\//.test(f.type); }); if(!list.length) return false;
        e.preventDefault(); var $f = v.state.selection.$from; K.addPictures(v, list, $f.depth ? $f.after(1) : v.state.doc.content.size); return true;
      }
      view = new PM.view.EditorView(host, {
        state: St.EditorState.create({ doc: doc || N.doc.create(null, [N.paragraph.create()]), plugins: plugins }), attributes: { class: 'dk-doc', spellcheck: 'true', 'aria-label': 'Notes' },
        nodeViews: { figure: K.figureView,
          task_item: function(node, v, getPos){
            var li = document.createElement('li'), c = document.createElement('button'), d = document.createElement('div'); li.className = 'dk-task' + (node.attrs.done ? ' done' : ''); c.className = 'dk-check'; c.type = 'button'; c.contentEditable = 'false';
            c.addEventListener('mousedown', function(e){ e.preventDefault(); }); c.addEventListener('click', function(){ var n = v.state.doc.nodeAt(getPos()); if(n) v.dispatch(v.state.tr.setNodeMarkup(getPos(), null, { done: !n.attrs.done })); });
            li.appendChild(c); li.appendChild(d);
            return { dom: li, contentDOM: d, update: function(n){ if(n.type !== N.task_item) return false; li.classList.toggle('done', !!n.attrs.done); return true; }, stopEvent: function(e){ return e.target === c; }, ignoreMutation: function(m){ return m.target === c || (m.target === li && m.type === 'attributes'); } };
          } },
        transformPastedHTML: function(html){ return K.cleanPaste ? K.cleanPaste(html) : html; },
        handlePaste: function(v, e){ var cd = e.clipboardData; return !!cd && !(cd.getData('text/plain') || '').trim() && pictures(v, cd.files, e); },
        handleDrop: function(v, e, slice, moved){ return !moved && !!e.dataTransfer && pictures(v, e.dataTransfer.files, e); },
        handleClick: function(v, pos, e){ if(!(e.metaKey || e.ctrlKey)) return false; var m = M.link.isInSet(v.state.doc.resolve(pos).marks()); if(!m) return false; window.open(K.safeHref(m.attrs.href), '_blank', 'noopener'); return true; },
        dispatchTransaction: function(tr){ view.updateState(view.state.apply(tr)); if(tr.docChanged){ clearTimeout(saveT); saveT = setTimeout(saveNotes, 500); } }
      });
      noteFor = t.id;
    }, function(){ if(host.isConnected) host.innerHTML = '<span class="note-wait">Notes need a connection the first time they are opened.</span>'; });
  }
  function run(c){ if(view){ c(view.state, view.dispatch, view); view.focus(); } }

  // ---------- the sheet ----------
  function grow(ta){ ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function fields(t){
    var p = T.project(t.project), done = T.isDone(t);
    return '<label for="sh-s">Status</label><select id="sh-s" data-f="status">' + p.statuses.map(function(s){ return '<option value="' + s.id + '"' + (t.status === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
      '<label for="sh-d">Due</label><div class="rowf"><input type="date" id="sh-d" data-f="due" value="' + esc(t.due) + '">' + [['0', 'Today'], ['1', 'Tomorrow'], ['7', 'Next week']].map(function(q){ return '<button type="button" class="qd" data-due="' + q[0] + '">' + q[1] + '</button>'; }).join('') + (t.due ? '<button type="button" class="qd" data-due="">None</button>' : '') + '</div>' +
      '<label for="sh-w">Person</label><select id="sh-w" data-f="who"><option value="">Nobody</option>' + T.people().map(function(x){ return '<option' + (t.who === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '<option value="+">Add a person…</option></select>' +
      '<label for="sh-t">Tags</label><div class="rowf" id="sh-tags">' + (t.tags || []).map(function(g, i){ return '<span class="pill" style="--c:' + A.tagColor(g) + '">' + esc(g) + '<button type="button" data-untag="' + i + '" aria-label="Remove the tag ' + esc(g) + '">×</button></span>'; }).join('') + '<input class="tagin" id="sh-t" placeholder="Add a tag" list="sh-taglist" maxlength="30"></div>';
  }
  function subs(t){
    return (t.subs || []).map(function(s){ return '<div data-sub="' + s.id + '"><button type="button" class="ck' + (s.done ? ' on' : '') + '" data-subtick role="checkbox" aria-checked="' + !!s.done + '" aria-label="Done: ' + esc(s.t) + '"></button><input value="' + esc(s.t) + '" class="' + (s.done ? 'done-t' : '') + '" data-subname aria-label="Subtask" maxlength="200"><button type="button" class="rm" data-subrm aria-label="Remove this subtask">×</button></div>'; }).join('') +
      '<div><span class="ck" style="visibility:hidden"></span><input placeholder="＋ Add a subtask" data-subadd aria-label="Add a subtask" maxlength="200"></div>';
  }
  function build(t){
    var p = T.project(t.project), tagsKnown = {}; T.tasks().forEach(function(x){ (x.tags || []).forEach(function(g){ tagsKnown[g] = 1; }); });
    el.innerHTML = '<div class="sheet-h"><span>' + esc(p ? p.name : '') + '</span><button type="button" class="warn" data-do="delete">Delete</button><button type="button" class="x" data-do="close" aria-label="Close">×</button></div><div class="sheet-b">' +
      '<div class="title">' + A.ck(t) + '<textarea rows="1" data-f="title" aria-label="Task name" maxlength="300">' + esc(t.title) + '</textarea></div>' +
      '<div class="fields" id="sh-fields">' + fields(t) + '</div><datalist id="sh-taglist">' + Object.keys(tagsKnown).map(function(g){ return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>' +
      '<div><h5>Subtasks</h5><div class="sub-l" id="sh-subs">' + subs(t) + '</div></div>' +
      '<div><h5>Notes</h5><div class="notebar" role="toolbar" aria-label="Notes formatting"><button type="button" data-n="strong" title="Bold (⌘B)"><b>B</b></button><button type="button" data-n="em" title="Italic (⌘I)"><i>I</i></button><button type="button" data-n="h" title="Heading">H</button><button type="button" data-n="ul" title="Bullets">• List</button><button type="button" data-n="tasks" title="Checklist">☐ List</button></div><div class="note" id="sh-note"></div></div></div>';
    grow(el.querySelector('textarea'));
  }
  // the store changed: bring the sheet's own fields up to date, leaving whatever you are typing in alone
  function sync(){
    if(!el) return; var t = T.task(id); if(!t){ close(true); return; }
    var act = document.activeElement, head = el.querySelector('.title .ck'), on = T.isDone(t);
    head.classList.toggle('on', on); head.setAttribute('aria-checked', String(on));
    var ta = el.querySelector('textarea'); if(act !== ta && ta.value !== t.title){ ta.value = t.title; grow(ta); }
    if(!el.querySelector('#sh-fields').contains(act)) el.querySelector('#sh-fields').innerHTML = fields(t);
    if(!el.querySelector('#sh-subs').contains(act)) el.querySelector('#sh-subs').innerHTML = subs(t);
  }
  function close(quiet){
    if(!el) return; saveNotes(); if(view){ view.destroy(); view = null; } noteFor = null;
    el.remove(); el = null; var was = id; id = null;
    if(!quiet){ var c = document.querySelector('[data-task="' + was + '"]'); if(c && c.focus) c.focus(); }
  }
  function open(tid){
    var t = T.task(tid); if(!t) return;
    if(el) close(true);
    id = tid; el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Task'); main.appendChild(el);
    build(t); mountNotes(el.querySelector('#sh-note'), t);
    wire();
  }
  function set(change){ T.setTask(id, change); }
  function wire(){
    el.addEventListener('click', function(e){
      var t = e.target, x, task = T.task(id); if(!task) return;
      if((x = t.closest('[data-tick]'))){ A.state.landed = id; T.tick(id); return; }
      if((x = t.closest('[data-do]'))){
        if(x.getAttribute('data-do') === 'close'){ close(); return; }
        if(x.dataset.armed && Date.now() - +x.dataset.armed < 5000){ var name = task.title; close(true); T.removeTask(task.id); A.toast('Deleted “' + name + '”'); return; }
        x.dataset.armed = Date.now(); x.textContent = 'Press again to delete'; setTimeout(function(){ if(x.isConnected){ x.textContent = 'Delete'; delete x.dataset.armed; } }, 5000); return;
      }
      if((x = t.closest('[data-due]'))){ var n = x.getAttribute('data-due'); set({ due: n === '' ? '' : A.dayKey(+n) }); return; }
      if((x = t.closest('[data-untag]'))){ var tags = task.tags.slice(); tags.splice(+x.getAttribute('data-untag'), 1); set({ tags: tags }); return; }
      if((x = t.closest('[data-subtick]'))){ var sid = x.closest('[data-sub]').getAttribute('data-sub'); set({ subs: task.subs.map(function(s){ return s.id === sid ? { id: s.id, t: s.t, done: !s.done } : s; }) }); return; }
      if((x = t.closest('[data-subrm]'))){ var rid = x.closest('[data-sub]').getAttribute('data-sub'); set({ subs: task.subs.filter(function(s){ return s.id !== rid; }) }); return; }
      if((x = t.closest('[data-n]'))){
        var K = window.SleekDocKit, PM = window.SleekPM; if(!view || !K) return; var N = K.N, M = K.M, c = PM.commands, sl = PM.schemaList, what = x.getAttribute('data-n');
        if(what === 'strong' || what === 'em') run(c.toggleMark(M[what]));
        else if(what === 'h') run(function(st, d){ var h = st.selection.$from.parent.type === N.heading; return c.setBlockType(h ? N.paragraph : N.heading, h ? null : { level: 2 })(st, d); });
        else run(function(st, d){ var type = what === 'ul' ? N.bullet_list : N.task_list; return sl.wrapInList(type)(st, d) || sl.liftListItem(N.list_item)(st, d) || sl.liftListItem(N.task_item)(st, d); });
        return;
      }
      if(t.id === 'sh-note' && view) view.focus();
    });
    el.addEventListener('mousedown', function(e){ if(e.target.closest('[data-n]')) e.preventDefault(); });
    el.addEventListener('change', function(e){
      var t = e.target, f = t.getAttribute('data-f'), task = T.task(id); if(!task) return;
      if(f === 'status') set({ status: t.value, was: '' });
      else if(f === 'due') set({ due: t.value });
      else if(f === 'who'){
        if(t.value !== '+'){ set({ who: t.value }); return; }
        // type a new person's name in place of the menu
        var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Their name'; inp.maxLength = 40; inp.setAttribute('aria-label', 'A new person’s name'); t.replaceWith(inp); inp.focus();
        var done = false, end = function(keep){ if(done) return; done = true; var p = keep ? T.addPerson(inp.value) : null; inp.blur(); if(p) set({ who: p.name }); else sync(); };
        inp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); end(true); } if(ev.key === 'Escape'){ ev.stopPropagation(); end(false); } });
        inp.addEventListener('blur', function(){ end(true); });
      }
      else if(f === 'title'){ var v = t.value.replace(/\s+/g, ' ').trim(); if(v) set({ title: v }); else t.value = task.title; }
      else if(t.hasAttribute('data-subname')){ var sid = t.closest('[data-sub]').getAttribute('data-sub'), name = t.value.trim(); set({ subs: name ? task.subs.map(function(s){ return s.id === sid ? { id: s.id, t: name, done: s.done } : s; }) : task.subs.filter(function(s){ return s.id !== sid; }) }); }
    });
    el.addEventListener('input', function(e){ if(e.target.tagName === 'TEXTAREA') grow(e.target); });
    el.addEventListener('keydown', function(e){
      var t = e.target, task = T.task(id); if(!task) return;
      if(e.key === 'Enter' && t.tagName === 'TEXTAREA'){ e.preventDefault(); t.blur(); return; }
      if(e.key === 'Enter' && t.hasAttribute('data-subadd') && t.value.trim()){ e.preventDefault(); var name = t.value.trim(); t.value = ''; set({ subs: (task.subs || []).concat([{ id: T.uid(), t: name, done: false }]) }); var again = el.querySelector('[data-subadd]'); if(again) again.focus(); return; }
      if(e.key === 'Enter' && t.hasAttribute('data-subname')){ e.preventDefault(); t.blur(); return; }
      if((e.key === 'Enter' || e.key === ',') && t.id === 'sh-t'){ e.preventDefault(); var g = t.value.replace(/,/g, '').trim(); if(g && task.tags.indexOf(g) < 0){ t.value = ''; set({ tags: task.tags.concat([g]).slice(0, 12) }); var ti = el.querySelector('#sh-t'); if(ti) ti.focus(); } return; }
      if(e.key === 'Backspace' && t.id === 'sh-t' && !t.value && task.tags.length){ set({ tags: task.tags.slice(0, -1) }); var t2 = el.querySelector('#sh-t'); if(t2) t2.focus(); }
    });
    el.addEventListener('focusout', function(e){ if(e.target.id === 'sh-t' && e.target.value.trim()){ var task = T.task(id), g = e.target.value.trim(); e.target.value = ''; if(task && task.tags.indexOf(g) < 0) set({ tags: task.tags.concat([g]).slice(0, 12) }); } });
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && el && !A.popOpen() && !(A.dragging && A.dragging())){ if(view && view.hasFocus()){ view.dom.blur(); return; } close(); } });
  window.addEventListener('pagehide', saveNotes);
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') saveNotes(); });
  // adding a tag or a subtask redraws its part of the sheet, which must not lose the box you were typing in
  T.on(function(what){
    if(!el) return;
    if(what.kind === 'task' && what.id === id && what.removed){ close(true); return; }
    var act = document.activeElement, key = act && el.contains(act) ? (act.id === 'sh-t' ? '#sh-t' : act.hasAttribute('data-subadd') ? '[data-subadd]' : null) : null;
    if(key) act.blur();
    sync();
    if(key){ var again = el.querySelector(key); if(again) again.focus(); }
  });
  A.openTask = open; A.closeTask = close; A.sheetOpen = function(){ return id; };
})();
