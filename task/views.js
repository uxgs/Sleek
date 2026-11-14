/* Sleek Tasks' views: Today, a project's list, and its board. (The grid is task/grid.js, the calendar task/cal.js.)

   Today gathers, across every project, what is overdue, due today, and due in the next seven days.
   The list is a project's open tasks, soonest first, with the done ones under them.
   The board is a column for each status (or, from Customize, for each person), each card placed by
   the task's `order`. A card is dragged with a mouse, a pen or a finger (hold a moment, then drag):
   it goes to the column and the place you drop it, and everything else glides to make room.
   Customize also sets what a card shows and how roomy it is; that is kept with the project
   (project.board). Columns are the project's statuses: add one, rename one, delete one (its tasks
   move to the first), or mark which one ticked tasks go to. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp; if(!T || !A) return;
  var esc = A.esc, body = document.getElementById('body'), state = A.state;
  function byDue(a, b){ return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.order || 0) - (b.order || 0); }

  // ---------- Today ----------
  A.views.today = function(){
    var open = T.tasks().filter(function(t){ return !T.isDone(t) && t.due; }).sort(byDue);
    var over = open.filter(A.late), now = open.filter(function(t){ return A.away(t) === 0; }), soon = open.filter(function(t){ var n = A.away(t); return n > 0 && n <= 7; });
    var hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    function sec(name, ts, cls){ return ts.length ? '<h4 class="' + (cls || '') + '">' + name + ' <em>' + ts.length + '</em></h4>' + ts.map(function(t){ return A.row(t, true); }).join('') : ''; }
    var ps = T.projects(), pick = ps.length > 1 ? '<select id="today-proj" aria-label="Board for the new task">' + ps.map(function(p){ return '<option value="' + p.id + '"' + (p.id === state.proj ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' : '';
    return '<div class="hello"><b>' + hi + '.</b><span>' + (now.length ? now.length + (now.length === 1 ? ' task' : ' tasks') + ' for today' : 'Nothing due today') + (over.length ? ', and ' + over.length + ' overdue' : '') + '.</span></div>' +
      '<div class="list"><div class="quick"><input placeholder="Add a task for today and press Enter" data-add="today" aria-label="Add a task for today" maxlength="300">' + pick + '</div>' + sec('Overdue', over, 'late') + sec('Today', now) + sec('Next 7 days', soon) +
      (over.length + now.length + soon.length ? '' : '<div class="empty"><b>Nothing due this week.</b>Tasks with a due date show up here, from every board.</div>') + '</div>';
  };

  // ---------- list ----------
  A.views.list = function(p){
    if(!p) return '';
    var all = T.tasks(p.id), open = all.filter(function(t){ return !T.isDone(t); }).sort(byDue), done = all.filter(T.isDone).sort(function(a, b){ return (b.doneAt || 0) - (a.doneAt || 0); });
    return '<div class="list"><div class="quick"><input placeholder="Add a task and press Enter" data-add="list" aria-label="Add a task" maxlength="300"></div>' + open.map(function(t){ return A.row(t); }).join('') +
      (done.length ? '<h4>Done <em>' + done.length + '</em></h4>' + done.map(function(t){ return A.row(t); }).join('') : '') +
      (all.length ? '' : '<div class="empty"><b>No tasks yet.</b>Type one above and press Enter.</div>') + '</div>';
  };

  // ---------- board ----------
  function opts(p){ var b = p.board || {}; return { show: Object.assign({ pic: true, tags: true, subs: true, due: true, who: true }, b.show), dense: !!b.dense, group: b.group === 'who' ? 'who' : 'status', shut: b.shut || {} }; }
  function groups(p){
    var all = T.tasks(p.id).slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
    if(opts(p).group === 'who') return T.people().map(function(x){ return { id: 'w:' + x.name, name: x.name, c: x.color }; }).concat([{ id: 'w:', name: 'Nobody yet', c: '#8E8E93' }]).map(function(g){ g.tasks = all.filter(function(t){ return (t.who || '') === g.id.slice(2); }); return g; });
    return p.statuses.map(function(s){ return { id: s.id, name: s.name, c: s.color, done: s.done, status: true, tasks: all.filter(function(t){ return t.status === s.id; }) }; });
  }
  function card(t, o){
    var c = (t.tags || [])[0], colour = c ? A.tagColor(c) : '', done = T.isDone(t);
    var meta = (o.show.tags ? A.tags(t) : '') + (o.show.subs ? A.subsH(t) : '') + (t.notes ? '<span class="noteflag" title="Has notes">≡</span>' : '') + A.repH(t);
    var pic = o.show.pic && t.cover ? A.media.thumb(t.cover, 'cardpic') : '';
    var right = (o.show.due ? A.dueH(t) : '') + (o.show.who ? A.av(t.who) : '');
    return '<div class="tcard' + (state.landed === t.id ? ' landed' : '') + '" tabindex="0" role="button" data-task="' + t.id + '" data-flip="c-' + t.id + '" style="' + (colour ? '--c:' + colour : '') + '" aria-label="' + esc(t.title) + '">' +
      pic + '<div class="tt' + (done ? ' done-t' : '') + '">' + esc(t.title) + '</div><div class="row2">' + (meta || right ? meta + '<span class="sp"></span>' + right : '') + '</div></div>';
  }
  A.views.board = function(p){
    if(!p) return '';
    var o = opts(p);
    return '<div class="board' + (o.dense ? ' dense' : '') + '">' + groups(p).map(function(g){
      var shut = !!o.shut[g.id];
      return '<div class="col' + (shut ? ' shut' : '') + '" data-col="' + esc(g.id) + '"' + (shut ? ' title="Open ' + esc(g.name) + '"' : '') + '><div class="col-h"><i style="--c:' + g.c + '"></i><b' + (g.status ? ' data-colname="' + g.id + '" title="Rename"' : '') + '>' + esc(g.name) + '</b><span>' + g.tasks.length + '</span>' +
        (g.status ? '<button type="button" class="cmore" data-colmore="' + g.id + '" aria-label="More for ' + esc(g.name) + '" aria-haspopup="true">⋯</button>' : '') +
        '<button type="button" data-shut="' + esc(g.id) + '" aria-label="' + (shut ? 'Open ' : 'Collapse ') + esc(g.name) + '">' + (shut ? '›' : '‹') + '</button></div>' +
        '<div class="cards">' + g.tasks.map(function(t){ return card(t, o); }).join('') + '</div><div class="add"><input placeholder="＋ Add a task" data-add="' + esc(g.id) + '" aria-label="Add a task to ' + esc(g.name) + '" maxlength="300"></div></div>';
    }).join('') + (o.group === 'status' ? '<button type="button" class="newcol" data-do="newcol">＋ Column</button>' : '') + '</div>';
  };
  function board(change){ var p = T.project(state.proj), b = opts(p); change(b); T.setProject(p.id, { board: b }); }
  A.customize = function(btn){
    var p = T.project(state.proj), o = opts(p);
    A.menu(btn, function(m){
      m.innerHTML = '<h4>A card shows</h4>' + [['pic', 'Picture'], ['tags', 'Tags'], ['subs', 'Subtasks done'], ['due', 'Due date'], ['who', 'Person']].map(function(x){ return '<label><input type="checkbox" data-show="' + x[0] + '"' + (o.show[x[0]] ? ' checked' : '') + '>' + x[1] + '</label>'; }).join('') +
        '<h4>Cards are</h4><label><input type="radio" name="dn" data-dense="0"' + (o.dense ? '' : ' checked') + '>Roomy</label><label><input type="radio" name="dn" data-dense="1"' + (o.dense ? ' checked' : '') + '>Compact</label>' +
        '<h4>Columns are</h4><label><input type="radio" name="gp" data-group="status"' + (o.group === 'status' ? ' checked' : '') + '>Statuses</label><label><input type="radio" name="gp" data-group="who"' + (o.group === 'who' ? ' checked' : '') + '>People</label>';
      m.addEventListener('change', function(e){ var t = e.target; board(function(b){ if(t.hasAttribute('data-show')) b.show[t.getAttribute('data-show')] = t.checked; if(t.hasAttribute('data-dense')) b.dense = t.getAttribute('data-dense') === '1'; if(t.hasAttribute('data-group')) b.group = t.getAttribute('data-group'); }); });
    });
  };
  // a column's name, typed in place: an existing column (sid) or a new one (null)
  function nameColumn(el, sid){
    var p = T.project(state.proj), s = sid && p.statuses.filter(function(x){ return x.id === sid; })[0], inp = document.createElement('input');
    inp.value = s ? s.name : ''; inp.placeholder = 'Column name'; inp.setAttribute('aria-label', 'Column name'); inp.maxLength = 40;
    if(s) el.replaceWith(inp); else { inp.style.cssText = 'height:38px;width:180px;border-radius:12px;border:1px solid var(--d-accent);background:var(--d-bg);padding:0 12px;flex:none'; el.replaceWith(inp); }
    inp.focus(); inp.select();
    var done = false, end = function(keep){ if(done) return; done = true; var v = inp.value.trim();
      if(keep && v){ var list = p.statuses.slice(); if(s) list = list.map(function(x){ return x.id === sid ? Object.assign({}, x, { name: v }) : x; }); else { var doneAt = list.map(function(x){ return x.done; }).indexOf(true); list.splice(doneAt < 0 ? list.length : doneAt, 0, { id: T.uid(), name: v, color: T.COLORS[(list.length + 1) % T.COLORS.length], done: false }); }
        T.setProject(p.id, { statuses: list }); } else A.paint(); };
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); end(true); } if(e.key === 'Escape'){ e.stopPropagation(); end(false); } });
    inp.addEventListener('blur', function(){ end(true); });
  }
  function columnMenu(btn, sid){
    var p = T.project(state.proj), s = p.statuses.filter(function(x){ return x.id === sid; })[0];
    A.menu(btn, function(m){
      A.item(m, 'Rename', function(){ A.closePop(); var b = body.querySelector('[data-colname="' + sid + '"]'); if(b) nameColumn(b, sid); });
      var h = document.createElement('h4'); h.textContent = 'Colour'; m.appendChild(h);
      var sw = document.createElement('div'); sw.className = 'sws'; T.COLORS.forEach(function(c){ var b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', c); b.className = c === s.color ? 'on' : ''; b.setAttribute('aria-label', 'Colour ' + c);
        b.addEventListener('click', function(){ A.closePop(); T.setProject(p.id, { statuses: p.statuses.map(function(x){ return x.id === sid ? Object.assign({}, x, { color: c }) : x; }) }); }); sw.appendChild(b); }); m.appendChild(sw);
      var l = document.createElement('label'); l.innerHTML = '<input type="checkbox"' + (s.done ? ' checked' : '') + '>Ticked tasks go here'; m.appendChild(l);
      l.querySelector('input').addEventListener('change', function(e){ var on = e.target.checked; if(!on && p.statuses.filter(function(x){ return x.done; }).length < 2){ e.target.checked = true; A.toast('A board needs one column for done tasks'); return; }
        T.setProject(p.id, { statuses: p.statuses.map(function(x){ return x.id === sid ? Object.assign({}, x, { done: on }) : x; }) }); });
      var ln = document.createElement('div'); ln.className = 'line'; m.appendChild(ln);
      if(p.statuses.length > 1) A.danger(m, 'Delete this column', function(){ if(s.done && p.statuses.filter(function(x){ return x.done; }).length < 2){ A.toast('A board needs one column for done tasks'); return; } T.removeStatus(p.id, sid); A.toast('Column deleted. Its tasks moved to ' + T.project(p.id).statuses[0].name + '.'); });
    });
  }

  // ---------- adding, ticking, opening ----------
  function addFrom(input){
    var where = input.getAttribute('data-add'), title = input.value.trim(); if(!title) return;
    var o = { project: state.proj, title: title };
    if(where === 'today'){ var sel = document.getElementById('today-proj'); o.project = sel ? sel.value : state.proj; state.proj = o.project; o.due = A.dayKey(0); }
    else if(where.indexOf('w:') === 0) o.who = where.slice(2);
    else if(where.indexOf('day:') === 0) o.due = where.slice(4);
    else if(where !== 'list' && where !== 'grid') o.status = where;
    var t = T.addTask(o); if(t){ state.landed = t.id; input.value = ''; }
  }
  var justDragged = 0;
  body.addEventListener('click', function(e){
    var t = e.target, x;
    if(Date.now() - justDragged < 350) return;      // the press that ended a drag is not a click
    if((x = t.closest('[data-tick]'))){ e.stopPropagation(); var id = x.getAttribute('data-tick'); state.landed = id; T.tick(id); return; }
    if((x = t.closest('[data-colmore]'))){ e.stopPropagation(); columnMenu(x, x.getAttribute('data-colmore')); return; }
    if((x = t.closest('[data-colname]')) && !t.closest('.col.shut')){ nameColumn(x, x.getAttribute('data-colname')); return; }
    if((x = t.closest('[data-shut]'))){ e.stopPropagation(); var g = x.getAttribute('data-shut'); board(function(b){ b.shut = Object.assign({}, b.shut); b.shut[g] = !b.shut[g]; }); return; }
    if((x = t.closest('.col.shut'))){ var gid = x.getAttribute('data-col'); board(function(b){ b.shut = Object.assign({}, b.shut); b.shut[gid] = false; }); return; }
    if((x = t.closest('[data-do="newcol"]'))){ nameColumn(x, null); return; }
    if((x = t.closest('[data-open]')) && A.openTask){ A.openTask(x.getAttribute('data-open')); return; }
    if(t.closest('input, select, a, button, table.grid')) return;      // in the grid a task opens from its own button
    if((x = t.closest('[data-task]')) && A.openTask) A.openTask(x.getAttribute('data-task'));
  });
  body.addEventListener('keydown', function(e){
    var t = e.target;
    if(e.key === 'Enter' && t.hasAttribute('data-add')){ e.preventDefault(); addFrom(t); return; }
    if((e.key === 'Enter' || e.key === ' ') && t.matches('.tcard, .li, .chip') && A.openTask){ e.preventDefault(); A.openTask(t.getAttribute('data-task')); }
  });

  // ---------- dragging a card ----------
  // One way for mouse, pen and finger. A mouse drags once it has moved a little; a finger after a
  // short hold, so that swiping still scrolls the board.
  var d = null;      // the drag under way: { id, card, ghost, dx, dy, col, before }
  var pending = null;
  A.dragging = function(){ return !!d; };
  function begin(e){
    var p = pending; pending = null; if(!p || !p.card.isConnected) return;
    var r = p.card.getBoundingClientRect(), ghost = p.card.cloneNode(true);
    ghost.classList.add('ghost'); ghost.removeAttribute('data-flip'); ghost.style.width = r.width + 'px'; ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost); document.body.classList.add('dragging'); p.card.classList.add('lifted');
    d = { id: p.id, card: p.card, ghost: ghost, dx: p.x - r.left, dy: p.y - r.top, col: null, before: null, mark: document.createElement('div'), touch: p.touch };
    d.mark.className = 'mark'; A.closePop();
    move(e || { clientX: p.x, clientY: p.y });
  }
  function move(e){
    if(!d) return;
    d.ghost.style.left = (e.clientX - d.dx) + 'px'; d.ghost.style.top = (e.clientY - d.dy) + 'px';
    var el = document.elementFromPoint(e.clientX, e.clientY), col = el && el.closest ? el.closest('.col') : null;
    Array.prototype.forEach.call(body.querySelectorAll('.col.over'), function(c){ if(c !== col) c.classList.remove('over'); });
    d.col = col; d.before = null;
    if(!col){ d.mark.remove(); return; }
    col.classList.add('over');
    var cards = Array.prototype.filter.call(col.querySelectorAll('.tcard'), function(c){ return c !== d.card; }), holder = col.querySelector('.cards');
    for(var i = 0; i < cards.length; i++){ var q = cards[i].getBoundingClientRect(); if(e.clientY < q.top + q.height / 2){ d.before = cards[i]; break; } }
    if(col.classList.contains('shut')) d.mark.remove(); else if(d.before) holder.insertBefore(d.mark, d.before); else holder.appendChild(d.mark);
    // near the edges of the board, it scrolls
    var b = body.getBoundingClientRect(); if(e.clientX > b.right - 50) body.scrollLeft += 14; else if(e.clientX < b.left + 50) body.scrollLeft -= 14;
    if(e.clientY > b.bottom - 50) body.scrollTop += 14; else if(e.clientY < b.top + 50) body.scrollTop -= 14;
  }
  function drop(cancel){
    if(!d) return; var x = d; d = null; justDragged = Date.now();
    x.ghost.remove(); x.mark.remove(); x.card.classList.remove('lifted'); document.body.classList.remove('dragging');
    Array.prototype.forEach.call(body.querySelectorAll('.col.over'), function(c){ c.classList.remove('over'); });
    if(cancel || !x.col){ A.paint(); return; }
    var t = T.task(x.id), g = x.col.getAttribute('data-col'), change = {};
    // its place: between the cards it was dropped between
    var cards = Array.prototype.filter.call(x.col.querySelectorAll('.tcard'), function(c){ return c !== x.card; }), k = x.before ? cards.indexOf(x.before) : cards.length;
    var prev = cards[k - 1] ? T.task(cards[k - 1].getAttribute('data-task')) : null, next = cards[k] ? T.task(cards[k].getAttribute('data-task')) : null;
    change.order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : t.order;
    if(g.indexOf('w:') === 0) change.who = g.slice(2);
    else if(g !== t.status){ change.status = g; change.was = ''; }
    state.landed = t.id; T.setTask(t.id, change);
  }
  body.addEventListener('pointerdown', function(e){
    var card = e.target.closest('.tcard'); if(!card || e.button || !card.closest('.board')) return;
    pending = { id: card.getAttribute('data-task'), card: card, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', timer: 0 };
    if(pending.touch) pending.timer = setTimeout(function(){ if(pending){ if(navigator.vibrate) try { navigator.vibrate(8); } catch(err){} begin(); } }, 240);
  });
  document.addEventListener('pointermove', function(e){
    if(d){ move(e); return; }
    if(!pending) return;
    var far = Math.abs(e.clientX - pending.x) + Math.abs(e.clientY - pending.y);
    if(pending.touch){ if(far > 10){ clearTimeout(pending.timer); pending = null; } }      // a swipe: let it scroll
    else if(far > 5) begin(e);
  });
  document.addEventListener('pointerup', function(){ if(pending){ clearTimeout(pending.timer); pending = null; } drop(false); });
  document.addEventListener('pointercancel', function(){ if(pending){ clearTimeout(pending.timer); pending = null; } if(d && d.touch) return; drop(true); });      // a finger's drag ends with touchend, below
  // once a finger is dragging a card, the page under it must not scroll
  document.addEventListener('touchmove', function(e){ if(d){ e.preventDefault(); var t = e.touches[0]; if(t) move(t); } }, { passive: false });
  document.addEventListener('touchend', function(){ if(d) drop(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && d){ e.stopPropagation(); drop(true); } }, true);
  window.addEventListener('blur', function(){ if(d) drop(true); });
})();
