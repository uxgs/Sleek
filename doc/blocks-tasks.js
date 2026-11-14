/* Tasks from Sleek Tasks, live in a page.

   Three things can be put in a page (Insert, or / on an empty line):
     a task         in a sentence or on its own: its tick, name, status and due date (`task_ref`)
     a task list    a project's tasks as a list you can tick and add to (`tasks`, view 'list')
     a board        the project's board, cards draggable between columns (`tasks`, view 'board')
   They are not copies: they are drawn from the tasks themselves (core/task-store.js) and drawn again
   the moment anything changes, here, in Sleek Tasks, or in another tab. Tick a task in the page and
   its card moves on the board; move the card and the page follows.

   A plain checklist can be turned into real tasks (Insert, with the cursor in it): each line becomes
   a task in the project you choose, and the checklist becomes a live list of just those tasks.

   Each block also keeps `snap`, how it last looked, refreshed whenever the page is saved. That is
   what a published page shows (a published page has no tasks to read), and what this browser shows
   if the tasks aren't in it (a page opened from a .sleek file made somewhere else). */
(function(){
  var PM = window.SleekPM, K = window.SleekDocKit, A = window.SleekDoc, T = window.SleekTasks;
  if(!PM || !K || !A || !T) return;
  var N = K.N, esc = A.esc, main = document.getElementById('main');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- days ----------
  var DAY = 86400000;
  function today0(){ var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function from(k){ var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function away(t){ return t.due ? Math.round((from(t.due) - today0()) / DAY) : null; }
  function dueH(t){
    var n = away(t); if(n == null) return '';
    var w = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : from(t.due).toLocaleDateString(undefined, n > -7 && n < 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });
    return '<span class="tc-d' + (n < 0 && !T.isDone(t) ? ' late' : '') + '">' + w + '</span>';
  }
  function statusOf(t){ var p = T.project(t.project); return p && p.statuses.filter(function(s){ return s.id === t.status; })[0] || null; }
  function av(who){ if(!who) return ''; var p = T.person(who); return '<span class="tk-av" style="--c:' + (p ? p.color : '#8E8E93') + '" title="' + esc(who) + '">' + esc(who.charAt(0).toUpperCase()) + '</span>'; }
  function ck(t){ var on = T.isDone(t); return '<button type="button" class="tk-ck' + (on ? ' on' : '') + '" data-tick="' + t.id + '" role="checkbox" aria-checked="' + on + '" aria-label="Done: ' + esc(t.title) + '"></button>'; }
  function openInTasks(p){ window.open('tasks.html#/' + p.id + '/board', '_blank'); }

  // ---------- how a block last looked ----------
  // `seen` remembers the latest look of each task and block drawn or saved since the page opened, so
  // that if its tasks go (the project is deleted) what is shown and saved is the last look, not an older one
  var seen = {};
  function keyOf(a){ return 'b:' + a.project + '|' + (a.ids ? a.ids.join(',') : '*'); }
  function snapTask(t){ var s = statusOf(t); return (seen['t:' + t.id] = { t: t.title, done: T.isDone(t), s: s ? s.name : '', c: s ? s.color : '', due: t.due || '' }); }
  function tasksFor(a){
    var p = T.project(a.project); if(!p) return null;
    var all = (a.ids ? a.ids.map(function(id){ return T.task(id); }).filter(function(t){ return t && t.project === p.id; }) : T.tasks(p.id).slice()).sort(function(x, y){ return (x.order || 0) - (y.order || 0); });
    return { p: p, all: all };
  }
  function snapBlock(a){
    var f = tasksFor(a); if(!f) return null;
    return seen[keyOf(a)] = { n: f.p.name, c: f.p.color, at: Date.now(), cols: f.p.statuses.map(function(s){ return { n: s.name, c: s.color, done: !!s.done, tasks: f.all.filter(function(t){ return t.status === s.id; }).map(function(t){ return { t: t.title, done: T.isDone(t), due: t.due || '', who: t.who || '' }; }) }; }) };
  }
  // a page's document, with every task block's `snap` brought up to date (where its tasks are here)
  K.freshenTasks = function(json){
    (function walk(n){
      if(!n) return;
      if(n.type === 'task_ref' && n.attrs){ var t = T.task(n.attrs.task); n.attrs.snap = t ? snapTask(t) : seen['t:' + n.attrs.task] || n.attrs.snap; }
      else if(n.type === 'tasks' && n.attrs) n.attrs.snap = snapBlock(n.attrs) || seen[keyOf(n.attrs)] || n.attrs.snap;
      (n.content || []).forEach(walk);
    })(json);
    return json;
  };
  K.taskSnap = function(node){ if(node.type === N.task_ref){ var t = T.task(node.attrs.task); return t ? snapTask(t) : seen['t:' + node.attrs.task] || node.attrs.snap; } return snapBlock(node.attrs) || seen[keyOf(node.attrs)] || node.attrs.snap; };

  // every live block on the page is drawn again when the tasks change
  var live = [];
  T.on(function(){ live = live.filter(function(v){ return v.dom.isConnected; }); live.forEach(function(v){ v.paint(true); }); });

  // ---------- a task in a sentence ----------
  K.taskRefView = function(node, view, getPos){
    var el = document.createElement('span'); el.contentEditable = 'false';
    function paint(){
      var t = T.task(node.attrs.task), s = seen['t:' + node.attrs.task] || node.attrs.snap;
      if(t){ var st = statusOf(t), done = T.isDone(t); snapTask(t); el.className = 'dk-tchip' + (done ? ' done' : ''); el.title = '';
        el.innerHTML = ck(t) + '<span class="tc-t">' + esc(t.title) + '</span>' + (st ? '<span class="tc-s" style="--c:' + st.color + '">' + esc(st.name) + '</span>' : '') + dueH(t); }
      else { el.className = 'dk-tchip gone' + (s && s.done ? ' done' : ''); el.title = 'This task isn’t in this browser. This is how it last looked.';
        el.innerHTML = '<span class="tk-ck' + (s && s.done ? ' on' : '') + '"></span><span class="tc-t">' + esc(s ? s.t : 'A task') + '</span>'; }
    }
    paint();
    el.addEventListener('mousedown', function(e){ e.preventDefault(); });
    el.addEventListener('click', function(e){
      var t = T.task(node.attrs.task); if(A.locked()) return;
      if(e.target.closest('[data-tick]') && t){ T.tick(t.id); return; }
      A.menu(el, function(p){
        if(t){
          var proj = T.project(t.project); if(!proj) return;
          A.item(p, 'web', 'Open in Sleek Tasks', proj.name, function(){ A.closePop(); openInTasks(proj); });
          var h = document.createElement('h4'); h.textContent = 'Move to'; p.appendChild(h);
          proj.statuses.forEach(function(s){ A.item(p, null, s.name + (s.id === t.status ? ' ✓' : ''), null, function(){ A.closePop(); T.setTask(t.id, { status: s.id, was: '' }); }); });
          var l = document.createElement('div'); l.className = 'line'; p.appendChild(l);
        }
        A.item(p, 'trash', 'Take it out of the page', t ? 'The task itself stays in Sleek Tasks' : null, function(){ A.closePop(); var pos = getPos(); view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize)); view.focus(); });
      });
    });
    var me = { dom: el, paint: paint }; live.push(me);
    return { dom: el, update: function(n){ if(n.type !== N.task_ref) return false; node = n; paint(); return true; }, stopEvent: function(){ return true; }, ignoreMutation: function(){ return true; }, destroy: function(){ live = live.filter(function(v){ return v !== me; }); } };
  };

  // ---------- a list or a board ----------
  K.tasksView = function(node, view, getPos){
    var el = document.createElement('div'); el.contentEditable = 'false';
    function set(change){ var pos = getPos(), n = view.state.doc.nodeAt(pos); if(n) view.dispatch(view.state.tr.setNodeMarkup(pos, null, Object.assign({}, n.attrs, change))); }
    function paint(move){
      var a = node.attrs, f = tasksFor(a), was = {};
      if(move && !still) Array.prototype.forEach.call(el.querySelectorAll('[data-flip]'), function(e){ was[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
      var act = document.activeElement, typing = act && el.contains(act) && act.tagName === 'INPUT' ? act.value : null;
      el.className = 'dk-tasks' + (f ? '' : ' gone'); el.setAttribute('data-view', a.view);
      if(!f){
        // the tasks aren't in this browser: show how the block last looked
        var s = seen[keyOf(a)] || a.snap, rows = []; ((s && s.cols) || []).forEach(function(c){ (c.tasks || []).forEach(function(t){ rows.push(t); }); });
        el.innerHTML = '<div class="tk-h"><i style="--c:' + esc((s && s.c) || '#8E8E93') + '"></i><b>' + esc(s ? s.n : 'Tasks') + '</b><span>not in this browser · as it last looked</span><span class="tk-tools"><button type="button" data-do="del">Remove</button></span></div><div class="tk-list">' +
          rows.map(function(t){ return '<div class="tk-row' + (t.done ? ' done' : '') + '"><span class="tk-ck' + (t.done ? ' on' : '') + '"></span><span class="tk-t">' + esc(t.t) + '</span></div>'; }).join('') + '</div>';
        return;
      }
      snapBlock(a);
      var p = f.p, h = '<div class="tk-h"><i style="--c:' + p.color + '"></i><b>' + esc(p.name) + '</b><span>' + (a.view === 'board' ? 'board' : a.ids ? 'these tasks' : a.show === 'all' ? 'every task' : 'open tasks') + ' · live</span><span class="tk-tools">' +
        '<button type="button" data-do="view">' + (a.view === 'board' ? 'As a list' : 'As a board') + '</button>' + (a.view === 'list' ? '<button type="button" data-do="show">' + (a.show === 'all' ? 'Hide done' : 'Show done') + '</button>' : '') +
        '<button type="button" data-do="open">Open in Tasks</button><button type="button" data-do="del">Remove</button></span></div>';
      if(a.view === 'board'){
        h += '<div class="tk-board">' + p.statuses.map(function(s){ var ts = f.all.filter(function(t){ return t.status === s.id; });
          return '<div class="tk-col" data-col="' + s.id + '"><div class="tk-colh"><i style="--c:' + s.color + '"></i><b>' + esc(s.name) + '</b><span>' + ts.length + '</span></div>' +
            ts.map(function(t){ return '<div class="tk-card' + (T.isDone(t) ? ' done' : '') + '" draggable="true" tabindex="0" role="button" data-task="' + t.id + '" data-flip="b-' + t.id + '">' + esc(t.title) + '</div>'; }).join('') + '</div>'; }).join('') + '</div>';
      } else {
        var list = f.all.filter(function(t){ return a.show === 'all' || !T.isDone(t); }).sort(function(x, y){ return (T.isDone(x) - T.isDone(y)) || ((x.due || '9') < (y.due || '9') ? -1 : (x.due || '9') > (y.due || '9') ? 1 : (x.order || 0) - (y.order || 0)); });
        h += '<div class="tk-list">' + list.map(function(t){ return '<div class="tk-row' + (T.isDone(t) ? ' done' : '') + '" data-flip="r-' + t.id + '">' + ck(t) + '<span class="tk-t">' + esc(t.title) + '</span>' + dueH(t) + av(t.who) + '</div>'; }).join('') +
          (list.length ? '' : '<div class="tk-none">' + (f.all.length ? 'Everything here is done.' : 'No tasks yet.') + '</div>') + '</div>';
      }
      h += '<div class="tk-add"><input placeholder="＋ Add a task" aria-label="Add a task to ' + esc(p.name) + '" maxlength="300"></div>';
      el.innerHTML = h;
      if(typing != null){ var again = el.querySelector('.tk-add input'); again.value = typing; again.focus(); }
      if(move && !still) Array.prototype.forEach.call(el.querySelectorAll('[data-flip]'), function(e){
        var o = was[e.getAttribute('data-flip')], r = e.getBoundingClientRect(); if(!o || (Math.abs(o.left - r.left) < 1 && Math.abs(o.top - r.top) < 1)) return;
        e.style.transition = 'none'; e.style.transform = 'translate(' + (o.left - r.left) + 'px,' + (o.top - r.top) + 'px)';
        requestAnimationFrame(function(){ e.style.transition = 'transform .4s cubic-bezier(.2,.8,.2,1)'; e.style.transform = ''; setTimeout(function(){ e.style.transition = ''; }, 450); });
      });
    }
    paint();
    function moveMenu(card){
      var t = T.task(card.getAttribute('data-task')); if(!t) return; var proj = T.project(t.project);
      A.menu(card, function(p){
        var h = document.createElement('h4'); h.textContent = 'Move to'; p.appendChild(h);
        proj.statuses.forEach(function(s){ A.item(p, null, s.name + (s.id === t.status ? ' ✓' : ''), null, function(){ A.closePop(); T.setTask(t.id, { status: s.id, was: '' }); }); });
        var l = document.createElement('div'); l.className = 'line'; p.appendChild(l);
        A.item(p, 'web', 'Open in Sleek Tasks', null, function(){ A.closePop(); openInTasks(proj); });
      });
    }
    el.addEventListener('click', function(e){
      if(A.locked()) return; var x, t = e.target;
      if((x = t.closest('[data-tick]'))){ T.tick(x.getAttribute('data-tick')); return; }
      if((x = t.closest('[data-do]'))){
        var what = x.getAttribute('data-do'), a = node.attrs;
        if(what === 'view') set({ view: a.view === 'board' ? 'list' : 'board' }); else if(what === 'show') set({ show: a.show === 'all' ? 'open' : 'all' });
        else if(what === 'open'){ var p = T.project(a.project); if(p) openInTasks(p); }
        else { var pos = getPos(); view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize)); view.focus(); }
        return;
      }
      if((x = t.closest('.tk-card'))) moveMenu(x);
    });
    el.addEventListener('keydown', function(e){
      var t = e.target;
      if(e.key === 'Enter' && t.tagName === 'INPUT'){
        e.preventDefault(); var title = t.value.trim(); if(!title) return; t.value = '';
        var made = T.addTask({ project: node.attrs.project, title: title }); if(made && node.attrs.ids) set({ ids: node.attrs.ids.concat([made.id]) });
        var again = el.querySelector('.tk-add input'); if(again) again.focus();
      } else if((e.key === 'Enter' || e.key === ' ') && t.classList.contains('tk-card')){ e.preventDefault(); moveMenu(t); }
    });
    // dragging a card to another column, inside the page
    var dragId = null;
    el.addEventListener('dragstart', function(e){ var c = e.target.closest('.tk-card'); if(!c) return; dragId = c.getAttribute('data-task'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.textContent); e.stopPropagation(); });
    el.addEventListener('dragover', function(e){ var col = dragId && e.target.closest('.tk-col'); if(!col) return; e.preventDefault(); e.stopPropagation(); Array.prototype.forEach.call(el.querySelectorAll('.tk-col.over'), function(c){ if(c !== col) c.classList.remove('over'); }); col.classList.add('over'); });
    el.addEventListener('dragend', function(){ dragId = null; Array.prototype.forEach.call(el.querySelectorAll('.tk-col.over'), function(c){ c.classList.remove('over'); }); });
    el.addEventListener('drop', function(e){
      var col = dragId && e.target.closest('.tk-col'); if(!col) return; e.preventDefault(); e.stopPropagation();
      var t = T.task(dragId), to = col.getAttribute('data-col'); dragId = null; if(!t || t.status === to) return;
      var lastOrder = T.tasks(t.project).reduce(function(m, x){ return Math.max(m, x.order || 0); }, 0);
      T.setTask(t.id, { status: to, was: '', order: lastOrder + 1 });
    });
    var me = { dom: el, paint: paint }; live.push(me);
    return { dom: el, update: function(n){ if(n.type !== N.tasks) return false; node = n; paint(true); return true; },
             stopEvent: function(e){ return !(e.type === 'dragstart' && !e.target.closest('.tk-card')); }, ignoreMutation: function(){ return true; }, destroy: function(){ live = live.filter(function(v){ return v !== me; }); } };
  };

  // ---------- choosing what to put in ----------
  function atCursor(){ var c = A.view.coordsAtPos(A.view.state.selection.from); return { left: c.left, right: c.left, top: c.top, bottom: c.bottom }; }
  function ensureProject(){ return T.projects()[0] || T.addProject({ name: 'My tasks' }); }
  // pick a project, then run act(project)
  function pickProject(title, act){
    ensureProject();
    A.pop(atCursor(), function(p){
      var h = document.createElement('h4'); h.textContent = title; p.appendChild(h);
      T.projects().forEach(function(pr){ var n = T.tasks(pr.id).filter(function(t){ return !T.isDone(t); }).length; A.item(p, null, pr.name, n + (n === 1 ? ' open task' : ' open tasks'), function(){ A.closePop(); A.view.focus(); act(pr); }); });
      var note = document.createElement('p'); note.textContent = 'Boards are made in Sleek Tasks.'; p.appendChild(note);
    });
  }
  // find a task by typing, or make a new one, then run act(task)
  function pickTask(act){
    ensureProject();
    var inp, box, sel = 0, rows = [];
    function draw(){
      var q = inp.value.trim().toLowerCase(), hits = T.tasks().filter(function(t){ return !q || t.title.toLowerCase().indexOf(q) >= 0; }).sort(function(a, b){ return (T.isDone(a) - T.isDone(b)) || (b.updated - a.updated); }).slice(0, 7);
      rows = hits.map(function(t){ return { task: t }; });
      if(inp.value.trim()) T.projects().forEach(function(pr){ rows.push({ make: pr }); });
      sel = Math.min(sel, Math.max(0, rows.length - 1));
      box.innerHTML = rows.map(function(r, i){
        if(r.task){ var pr = T.project(r.task.project); return '<button type="button" class="mi' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"><span><b class="' + (T.isDone(r.task) ? 'tk-struck' : '') + '">' + esc(r.task.title) + '</b><i>' + esc(pr ? pr.name : '') + '</i></span></button>'; }
        return '<button type="button" class="mi' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"><span><b>＋ New task: “' + esc(inp.value.trim()) + '”</b><i>in ' + esc(r.make.name) + '</i></span></button>';
      }).join('') || '<p>No tasks yet. Type one to make it.</p>';
      var on = box.querySelector('.sel'); if(on) on.scrollIntoView({ block: 'nearest' });
    }
    function choose(i){
      var r = rows[i]; if(!r) return; var t = r.task || T.addTask({ project: r.make.id, title: inp.value.trim() });
      A.closePop(); A.view.focus(); if(t) act(t);
    }
    A.pop(atCursor(), function(p){
      p.classList.add('tk-pick');
      p.innerHTML = '<input type="text" placeholder="Find a task, or type a new one" aria-label="Find a task, or type a new one" maxlength="300"><div class="tk-found"></div>';
      inp = p.querySelector('input'); box = p.querySelector('.tk-found'); draw();
    });
    inp.addEventListener('input', function(){ sel = 0; draw(); });
    inp.addEventListener('keydown', function(e){
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); if(rows.length){ sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; draw(); } }
      else if(e.key === 'Enter'){ e.preventDefault(); choose(sel); }
      else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); A.closePop(); A.view.focus(); }
    });
    box.addEventListener('mousedown', function(e){ e.preventDefault(); });
    box.addEventListener('click', function(e){ var b = e.target.closest('[data-i]'); if(b) choose(+b.getAttribute('data-i')); });
    inp.focus();
  }
  K.insertTask = function(){ pickTask(function(t){ var v = A.view; v.dispatch(v.state.tr.replaceSelectionWith(N.task_ref.create({ task: t.id, snap: snapTask(t) })).insertText(' ').scrollIntoView()); v.focus(); }); };
  K.insertTasks = function(kind){ pickProject(kind === 'board' ? 'Which board?' : 'Which board’s tasks?', function(pr){ var a = { project: pr.id, view: kind === 'board' ? 'board' : 'list', show: 'open', ids: null }; a.snap = snapBlock(a); A.insertBlock(N.tasks.create(a)); }); };

  // ---------- a plain checklist becomes real tasks ----------
  function checklistAt(){ var $f = A.view.state.selection.$from; for(var d = $f.depth; d > 0; d--) if($f.node(d).type === N.task_list) return { node: $f.node(d), pos: $f.before(d) }; return null; }
  K.inChecklist = function(){ return !!checklistAt(); };
  K.makeTasks = function(){
    var c = checklistAt(); if(!c) return;
    pickProject('Make these tasks in', function(pr){
      var ids = []; c.node.forEach(function(item){ var title = item.textContent.trim(); if(!title) return; var t = T.addTask({ project: pr.id, title: title }); if(!t) return; if(item.attrs.done) T.tick(t.id, true); ids.push(t.id); });
      if(!ids.length){ A.toast('That checklist is empty.'); return; }
      var now = checklistAt(); if(!now) return;
      var a = { project: pr.id, view: 'list', show: 'all', ids: ids }; a.snap = snapBlock(a);
      A.view.dispatch(A.view.state.tr.replaceWith(now.pos, now.pos + now.node.nodeSize, N.tasks.create(a)).scrollIntoView());
      A.toast(ids.length + (ids.length === 1 ? ' task' : ' tasks') + ' made in ' + pr.name);
    });
  };
})();
