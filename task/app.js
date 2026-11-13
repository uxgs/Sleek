/* Sleek Tasks, the app: what is showing, the column of Today and projects, the bar above the view,
   and the pieces every view uses (how a task is drawn, the small menus, the messages).

   The address says what is showing: #today, or #/<project id>/board, /grid, /list or /cal; the view you last
   used in a project is remembered in this browser. Everything is drawn from core/task-store.js,
   which is in memory, and drawn again whenever it says something changed: here, or in another tab.
   When it is, each task glides from where it was to where it now is.

   window.SleekTaskApp is what task/views.js and task/sheet.js build on. */
(function(){
  var T = window.SleekTasks, de = document.documentElement; if(!T) return;
  var $ = function(s, r){ return (r || document).querySelector(s); }, $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $('#main'), side = $('#side'), top = $('#top'), body = $('#body');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = { view: 'today', proj: null, landed: null };
  var A = window.SleekTaskApp = { state: state, views: {}, afterPaint: [], $: $, $$: $$ };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  A.esc = esc;

  // ---------- days ----------
  var DAY = 86400000;
  function today0(){ var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function key(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function from(k){ var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayKey(n){ return key(new Date(today0().getTime() + n * DAY)); }
  function away(t){ return t.due ? Math.round((from(t.due) - today0()) / DAY) : null; }
  function late(t){ return !!t.due && !T.isDone(t) && away(t) < 0; }
  function dueText(t){
    var n = away(t); if(n == null) return '';
    if(n === 0) return 'Today'; if(n === 1) return 'Tomorrow'; if(n === -1) return 'Yesterday';
    return from(t.due).toLocaleDateString(undefined, n > -7 && n < 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });
  }
  A.dayKey = dayKey; A.away = away; A.late = late; A.key = key; A.from = from;

  // ---------- how a task is drawn ----------
  var TAGC = ['#7C5CFF', '#0A84FF', '#F0A52D', '#E0457B', '#12A36A', '#5B6470', '#C2A21E', '#F0642D'];
  function tagColor(g){ var h = 0; for(var i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0; return TAGC[h % TAGC.length]; }
  function ck(t){ var on = T.isDone(t); return '<button type="button" class="ck' + (on ? ' on' : '') + '" data-tick="' + t.id + '" role="checkbox" aria-checked="' + on + '" aria-label="Done: ' + esc(t.title) + '"></button>'; }
  function av(who){ if(!who) return ''; var p = T.person(who); return '<span class="av" style="--c:' + (p ? p.color : '#8E8E93') + '" title="' + esc(who) + '">' + esc(who.charAt(0).toUpperCase()) + '</span>'; }
  function tags(t){ return (t.tags || []).map(function(g){ return '<span class="pill" style="--c:' + tagColor(g) + '">' + esc(g) + '</span>'; }).join(''); }
  function dueH(t){ return t.due ? '<span class="due' + (late(t) ? ' late' : '') + '">' + dueText(t) + '</span>' : ''; }
  function subsH(t){ var s = t.subs || []; if(!s.length) return ''; var n = s.filter(function(x){ return x.done; }).length; return '<span class="subs" title="' + n + ' of ' + s.length + ' subtasks done"><i><b style="width:' + Math.round(n / s.length * 100) + '%"></b></i>' + n + '/' + s.length + '</span>'; }
  function row(t, withProject){
    var p = T.project(t.project), done = T.isDone(t);
    return '<div class="li" data-task="' + t.id + '" data-flip="l-' + t.id + '" tabindex="0">' + ck(t) + '<span class="tt' + (done ? ' done-t' : '') + '">' + esc(t.title) + '</span>' +
      (withProject && p ? '<span class="pill" style="--c:' + p.color + '">' + esc(p.name) + '</span>' : '<span class="tagrow">' + tags(t) + '</span>') + subsH(t) + (A.repH ? A.repH(t) : '') + dueH(t) + av(t.who) + '</div>';
  }
  A.ck = ck; A.av = av; A.tags = tags; A.dueH = dueH; A.subsH = subsH; A.row = row; A.tagColor = tagColor;

  // ---------- messages and small menus ----------
  var toastT = 0;
  function toast(msg){ var old = $('.toast'); if(old) old.remove(); var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function(){ t.remove(); }, 2800); }
  var pop = null;
  function closePop(){ if(pop){ if(pop.from) pop.from.setAttribute('aria-expanded', 'false'); pop.remove(); pop = null; } }
  // a menu under a button: a second press closes it. build(p) fills it.
  function menu(btn, build){
    if(pop && pop.from === btn){ closePop(); return null; }
    closePop(); var p = document.createElement('div'); p.className = 'pop'; build(p); main.appendChild(p); pop = p; p.from = btn; btn.setAttribute('aria-expanded', 'true');
    var m = main.getBoundingClientRect(), a = btn.getBoundingClientRect(), left = a.left - m.left;
    if(left + p.offsetWidth > m.width - 8) left = a.right - m.left - p.offsetWidth;
    p.style.left = Math.max(8, Math.min(left, m.width - p.offsetWidth - 8)) + 'px';
    var y = a.bottom - m.top + 6; if(y + p.offsetHeight > m.height - 8) y = Math.max(8, a.top - m.top - p.offsetHeight - 6); p.style.top = y + 'px';
    return p;
  }
  function item(p, label, act, cls){ var b = document.createElement('button'); b.type = 'button'; b.className = 'mi' + (cls ? ' ' + cls : ''); b.textContent = label; b.addEventListener('click', function(){ act(b); }); p.appendChild(b); return b; }
  // a row that deletes: the first press asks, the second (within five seconds) does it
  function danger(p, label, act){ var armed = 0, b = item(p, label, function(){ if(Date.now() - armed < 5000){ closePop(); act(); return; } armed = Date.now(); b.textContent = 'Press again to delete'; setTimeout(function(){ if(b.isConnected) b.textContent = label; }, 5000); }, 'warn'); return b; }
  document.addEventListener('pointerdown', function(e){ if(pop && !pop.contains(e.target) && !(pop.from && pop.from.contains(e.target))) closePop(); }, true);
  A.toast = toast; A.menu = menu; A.item = item; A.danger = danger; A.closePop = closePop; A.popOpen = function(){ return !!pop; };

  // ---------- what is showing ----------
  var VIEWS = [['board', 'Board'], ['grid', 'Grid'], ['list', 'List'], ['cal', 'Calendar']];
  function lastView(pid){ try { var v = localStorage.getItem('sleek-tasks-view:' + pid); return VIEWS.some(function(x){ return x[0] === v; }) ? v : 'board'; } catch(e){ return 'board'; } }
  function go(view, pid){
    if(view !== 'today'){ try { localStorage.setItem('sleek-tasks-view:' + pid, view); } catch(e){} }
    var h = view === 'today' ? '#today' : '#/' + pid + '/' + view;
    if(location.hash !== h){ try { history.pushState(null, '', h); } catch(e){ location.hash = h; } }
    route();
  }
  function route(){
    var m = /^#\/([^/]+)\/(board|grid|list|cal)$/.exec(location.hash), p = m && T.project(m[1]);
    if(p){ state.view = m[2]; state.proj = p.id; } else { state.view = 'today'; if(!T.project(state.proj)) state.proj = (T.projects()[0] || {}).id || null; }
    if(A.closeTask && !state.keepSheet) A.closeTask(true);
    closePop(); paint();
  }
  window.addEventListener('popstate', route); window.addEventListener('hashchange', route);
  A.go = go;

  // ---------- the column of Today and projects, and the bar ----------
  var naming = false;
  function shell(){
    var due = T.tasks().filter(function(t){ return !T.isDone(t) && t.due && away(t) <= 0; }).length, isToday = state.view === 'today';
    var h = '<a class="brand" href="index.html" title="Sleek: pick an app"><img src="icons/logo.svg" alt="" width="22" height="20">Sleek <span>Tasks</span></a>' +
      '<button type="button" class="nav' + (isToday ? ' on' : '') + '" data-go="today"' + (isToday ? ' aria-current="page"' : '') + '><i class="dot"></i><span>Today</span><em>' + (due || '') + '</em></button><h4>Projects</h4>';
    T.projects().forEach(function(p){
      var on = !isToday && p.id === state.proj, n = T.tasks(p.id).filter(function(t){ return !T.isDone(t); }).length;
      h += '<div class="nav' + (on ? ' on' : '') + '" role="button" tabindex="0" data-proj="' + p.id + '"' + (on ? ' aria-current="page"' : '') + '><i style="--c:' + p.color + '"></i><span>' + esc(p.name) + '</span><em>' + (n || '') + '</em>' +
        '<span class="more" role="button" tabindex="0" data-pmore="' + p.id + '" aria-label="More for ' + esc(p.name) + '" aria-haspopup="true">⋯</span></div>';
    });
    h += '<button type="button" class="nav new" data-do="newproject"><i></i><span>New project</span></button>' +
      '<div class="side-foot"><a href="slides.html" data-slug="slides">Slides</a><a href="docs.html" data-slug="docs">Docs</a><span class="grow"></span>' +
      '<button type="button" data-do="news" class="hide-s" aria-haspopup="true">' + (window.SLEEK_TASK_CHANGES ? 'v' + window.SLEEK_TASK_CHANGES[0].v : '') + '</button><button type="button" data-do="look" title="Light or dark" aria-label="Light or dark">◐</button></div>';
    if(!naming) side.innerHTML = h;
    var p = T.project(state.proj);
    top.innerHTML = '<h1>' + (isToday ? 'Today' : esc(p ? p.name : '')) + '</h1>' +
      (isToday || !p ? '' : '<div class="tabs2" role="tablist" aria-label="View">' + VIEWS.map(function(v){ return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" class="' + (state.view === v[0] ? 'on' : '') + '" data-view="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>') +
      (state.view === 'board' && p ? '<button type="button" class="gbtn" data-do="custom" aria-haspopup="true">Customize</button>' : '');
    document.title = (isToday ? 'Today' : p ? p.name : 'Tasks') + ' · Sleek Tasks';
  }

  // draw everything again; with move, each task glides from where it was to where it now is
  var queued = false, moveNext = false;
  function paint(move){
    var was = {}; if(move && !still) $$('[data-flip]', body).forEach(function(e){ was[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
    // the box you are in (an add box, or a cell of the grid) is found again after the redraw, with what you had typed
    var act = document.activeElement, keep = null, typed = null;
    if(act && body.contains(act)){ keep = act.getAttribute('data-add') != null ? '[data-add="' + act.getAttribute('data-add') + '"]' : act.getAttribute('data-k') ? '[data-k="' + act.getAttribute('data-k') + '"]' : null; if(keep && act.tagName === 'INPUT' && act.type !== 'date') typed = act.value; }
    shell();
    var p = T.project(state.proj), y = body.scrollTop, x = body.scrollLeft, v = A.views[state.view];
    body.innerHTML = v ? v(p) : '';
    body.scrollTop = y; body.scrollLeft = x;
    if(keep){ var again = body.querySelector(keep); if(again){ if(typed != null && again.tagName === 'INPUT' && again.type !== 'date') again.value = typed; again.focus({ preventScroll: true }); } }
    if(move && !still) $$('[data-flip]', body).forEach(function(e){
      var a = was[e.getAttribute('data-flip')], r = e.getBoundingClientRect(); if(!a || (Math.abs(a.left - r.left) < 1 && Math.abs(a.top - r.top) < 1)) return;
      e.style.transition = 'none'; e.style.transform = 'translate(' + (a.left - r.left) + 'px,' + (a.top - r.top) + 'px)';
      requestAnimationFrame(function(){ e.style.transition = 'transform .4s cubic-bezier(.2,.8,.2,1)'; e.style.transform = ''; setTimeout(function(){ e.style.transition = ''; }, 450); });
    });
    A.afterPaint.forEach(function(fn){ try { fn(); } catch(e){ console.error(e); } });
    state.landed = null;
  }
  // many changes in one go (a drop writes a status and an order) are drawn once
  function soon(move){ moveNext = moveNext || move; if(queued) return; queued = true; Promise.resolve().then(function(){ queued = false; var m = moveNext; moveNext = false; if(!(A.dragging && A.dragging())) paint(m); }); }
  A.paint = paint;
  T.on(function(what){
    if(what.kind === 'project' && what.removed && state.proj === what.id) return route();
    // a repeating task was ticked here: say when it is back
    if(what.repeated && !what.remote) toast('Done. It’s back ' + (what.repeated === dayKey(1) ? 'tomorrow' : 'on ' + from(what.repeated).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + '.');
    soon(true);
  });

  // ---------- pressing things in the column and the bar ----------
  function nameProject(el, p){      // type a project's name in place: a new one (p null) or an existing one
    naming = true; var s = el.querySelector('span:not(.more)'), inp = document.createElement('input'); inp.value = p ? p.name : ''; inp.placeholder = 'Project name'; inp.setAttribute('aria-label', 'Project name');
    s.replaceWith(inp); inp.focus(); inp.select();
    var done = false, end = function(keep){ if(done) return; done = true; naming = false; var v = inp.value.trim();
      if(keep && v){ if(p) T.setProject(p.id, { name: v.slice(0, 80) }); else { var np = T.addProject({ name: v.slice(0, 80) }); go('board', np.id); return; } }
      paint(); };
    inp.addEventListener('click', function(e){ e.stopPropagation(); });
    inp.addEventListener('keydown', function(e){ e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); end(true); } if(e.key === 'Escape') end(false); });
    inp.addEventListener('blur', function(){ end(true); });
  }
  function projectMenu(btn, p){
    menu(btn, function(m){
      item(m, 'Rename', function(){ closePop(); var el = side.querySelector('[data-proj="' + p.id + '"]'); if(el) nameProject(el, p); });
      var h = document.createElement('h4'); h.textContent = 'Colour'; m.appendChild(h);
      var sw = document.createElement('div'); sw.className = 'sws'; T.COLORS.forEach(function(c){ var b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', c); b.className = c === p.color ? 'on' : ''; b.setAttribute('aria-label', 'Colour ' + c); b.addEventListener('click', function(){ closePop(); T.setProject(p.id, { color: c }); }); sw.appendChild(b); }); m.appendChild(sw);
      var l = document.createElement('div'); l.className = 'line'; m.appendChild(l);
      var n = T.tasks(p.id).length;
      danger(m, n ? 'Delete project and its ' + n + (n === 1 ? ' task' : ' tasks') : 'Delete project', function(){ T.removeProject(p.id); toast('Deleted “' + p.name + '”'); });
    });
  }
  function news(btn){
    menu(btn, function(m){
      var C = window.SLEEK_TASK_CHANGES || [], h = document.createElement('h4'); h.textContent = 'What’s new in Tasks'; m.appendChild(h);
      C.slice(0, 3).forEach(function(c){ var p = document.createElement('p'); p.innerHTML = '<b>Version ' + esc(c.v) + '</b>'; m.appendChild(p); var ol = document.createElement('ol'); ol.style.listStyle = 'disc'; (c.items || []).forEach(function(s){ var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); }); m.appendChild(ol); });
    });
  }
  function look(){ var dark = de.getAttribute('data-mode') !== 'dark'; if(dark) de.setAttribute('data-mode', 'dark'); else de.removeAttribute('data-mode'); try { localStorage.setItem('sleek-tasks-look', dark ? 'dark' : 'light'); } catch(e){} var m = $('meta[name="theme-color"]'); if(m) m.setAttribute('content', dark ? '#0E0E11' : '#FFFFFF'); }
  side.addEventListener('click', function(e){
    var t = e.target, x;
    if((x = t.closest('[data-pmore]'))){ e.stopPropagation(); projectMenu(x, T.project(x.getAttribute('data-pmore'))); return; }
    if((x = t.closest('[data-go]'))){ go('today'); return; }
    if((x = t.closest('[data-proj]'))){ var id = x.getAttribute('data-proj'); go(lastView(id), id); return; }
    if((x = t.closest('[data-do]'))){ var what = x.getAttribute('data-do'); if(what === 'newproject') nameProject(x, null); else if(what === 'look') look(); else if(what === 'news') news(x); }
  });
  side.addEventListener('keydown', function(e){ if(e.key !== 'Enter' && e.key !== ' ') return; var x = e.target.closest('[data-pmore], [data-proj]'); if(!x || e.target.tagName === 'INPUT') return; e.preventDefault(); x.click(); });
  top.addEventListener('click', function(e){
    var x = e.target.closest('[data-view]'); if(x){ go(x.getAttribute('data-view'), state.proj); return; }
    x = e.target.closest('[data-do="custom"]'); if(x && A.customize) A.customize(x);
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && pop){ var f = pop.from; closePop(); if(f && f.focus) f.focus(); } });

  // ---------- starting ----------
  // a first visit gets a project that shows what Tasks does
  function welcome(){
    var p = T.addProject({ name: 'Getting started' }), d = dayKey;
    T.addPerson('You');
    [['Drag this card to Doing', 'todo', d(0), 'You', ['Try it']], ['Tick me off', 'todo', d(0), '', ['Try it']], ['Open me: tasks have notes, subtasks and a due date', 'todo', d(1), '', []],
     ['Make your own project (New project, on the left)', 'todo', d(2), '', []], ['Read this card', 'done', '', '', []]].forEach(function(x){ T.addTask({ project: p.id, title: x[0], status: x[1], due: x[2], who: x[3], tags: x[4] }); });
    var t = T.tasks(p.id)[2]; T.setTask(t.id, { subs: [{ id: T.uid(), t: 'Add a subtask', done: true }, { id: T.uid(), t: 'Tick a subtask', done: false }] });
    return p;
  }
  T.ready().then(function(){
    var first = false; try { first = !localStorage.getItem('sleek-tasks-welcome'); localStorage.setItem('sleek-tasks-welcome', '1'); } catch(e){}
    if(!T.projects().length){ if(first) welcome(); else T.addProject({ name: 'My tasks' }); }
    state.proj = T.projects()[0].id;
    route();
    setTimeout(function(){ de.classList.remove('booting'); }, 30);
  }).catch(function(e){
    console.error(e); de.classList.remove('booting');
    document.body.innerHTML = '<div style="max-width:560px;margin:18vh auto;padding:0 16px;font:15px/1.5 Inter,system-ui,sans-serif"><h1 style="font-size:30px;letter-spacing:-.02em;margin:0 0 8px">Sleek Tasks could not start.</h1><p style="color:#6E6E73">It could not open its storage in this browser (a private window can block it).</p><a href="index.html">Back to Sleek</a></div>';
  });
  // the offline cache (sw.js), as for Slides and Docs
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
})();
