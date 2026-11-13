/* The Tasks slide: a project's board or list from Sleek Tasks, drawn on a slide.

   A slide made from the Tasks layout keeps, in its entry in the deck (seed.added[k].tk):
     { project: <project id>, view: 'board' | 'list', done: true | false, snap }
   While you edit or present, the slide is drawn from the tasks themselves (core/task-store.js, loaded
   the first time a deck has such a slide) and drawn again the moment they change, here or in any
   other tab: a card glides to its new column. `snap` is how it last looked (the shape
   SleekTasks.snapshot() gives); it is refreshed each time the slide is drawn, saved with the deck,
   and is what a published deck shows, since a published deck has no tasks to read.
   A slide with no project chosen yet shows sample tasks.

   Only as much as fits is shown: a column or a list that is too long ends with "+ 4 more".

     SleekTaskSlide.build(slideEl, entry)   called for every slide as it is made (app.js)
     SleekTaskSlide.redraw(slideEl)         after its choices change (features/tasks-slides.js) */
(function(){
  var published = !!(window.SLEEK_DECK && window.SLEEK_DECK.published);
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colour(c, or){ return /^#[0-9a-f]{6}$/i.test(c || '') ? c : or || '#8E8E93'; }
  var DAY = 86400000;
  function from(k){ var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayKey(n){ var d = new Date(); d.setHours(0, 0, 0, 0); d = new Date(d.getTime() + n * DAY); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // a due date in words: while live, as you'd say it today; otherwise the date itself, which stays true
  function dueWords(k, live){
    if(!k) return ''; var d = from(k); if(isNaN(d)) return '';
    if(live){ var t0 = new Date(); t0.setHours(0, 0, 0, 0); var n = Math.round((d - t0) / DAY); if(n === 0) return 'Today'; if(n === 1) return 'Tomorrow'; if(n === -1) return 'Yesterday'; if(n > -7 && n < 7) return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }); }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  var SAMPLE = { sample: true, n: 'Launch plan', c: '#12A36A', cols: [
    { n: 'To do', c: '#8E8E93', tasks: [{ t: 'Book the venue', due: dayKey(3), who: 'Maya', wc: '#7C5CFF' }, { t: 'Write the invitation', due: dayKey(5) }, { t: 'Order the banners', who: 'Jon', wc: '#F0A52D' }] },
    { n: 'Doing', c: '#F0A52D', tasks: [{ t: 'Design the new sign', due: dayKey(1), who: 'Maya', wc: '#7C5CFF' }, { t: 'Agree the price list', due: dayKey(0), who: 'Jon', wc: '#F0A52D' }] },
    { n: 'Done', c: '#12A36A', done: true, tasks: [{ t: 'Pick the date', done: true }, { t: 'Measure the window', done: true }] } ] };

  // ---------- the tasks themselves, when this page can have them ----------
  var T = null, wanted = false, hosts = [], ready = [];
  function need(){
    if(wanted || published) return; wanted = true;
    var go = function(){ var X = window.SleekTasks; if(!X) return; X.ready().then(function(){ T = X; X.on(function(){ repaint(true); }); repaint(false); ready.forEach(function(fn){ try { fn(X); } catch(e){ console.error(e); } }); }).catch(function(e){ console.error(e); }); };
    if(window.SleekTasks) go(); else { var s = document.createElement('script'); s.src = 'core/task-store.js'; s.onload = go; document.head.appendChild(s); }
  }
  // what a slide shows: the project now (and its look kept for later), or how it last looked, or the sample
  function model(tk){
    if(T && tk && tk.project){
      var live = T.snapshot(tk.project, true);
      if(live){ tk.snap = { n: live.n, c: live.c, at: live.at, cols: live.cols.map(function(c){ return { n: c.n, c: c.c, done: c.done, tasks: c.tasks.map(function(t){ return { t: t.t, done: t.done, due: t.due, late: t.late, who: t.who, wc: t.wc }; }) }; }) }; live.live = true; return live; }
    }
    return tk && tk.snap && tk.snap.cols ? tk.snap : SAMPLE;
  }

  // ---------- drawing ----------
  function person(t){ return t.who ? '<i class="tks-av" style="--c:' + colour(t.wc) + '" title="' + esc(t.who) + '">' + esc(String(t.who).charAt(0).toUpperCase()) + '</i>' : ''; }
  function due(t, m){ var w = dueWords(t.due, m.live || m.sample); return w ? '<em class="' + (t.late ? 'late' : '') + '">' + w + '</em>' : ''; }
  function draw(host){
    var tk = host._tk || {}, m = model(tk), list = tk.view === 'list', showDone = tk.done !== false, n = 0;
    var cols = m.cols.filter(function(c){ return showDone || !c.done; });
    host.setAttribute('data-view', list ? 'list' : 'board');
    var h;
    if(list){
      var rows = []; cols.forEach(function(c){ c.tasks.forEach(function(t){ rows.push({ t: t, c: c }); }); });
      h = '<div class="tks-list' + (rows.length > 6 ? ' two' : '') + '">' + rows.map(function(r){ var t = r.t;
        return '<div class="tks-row' + (t.done ? ' done' : '') + '" data-flip="' + esc(t.id || 'r' + n) + '" style="--i:' + (n++) + '"><span class="tks-ck' + (t.done ? ' on' : '') + '"></span><span class="tks-t">' + esc(t.t) + '</span>' + due(t, m) + person(t) +
          (cols.length > 1 && !t.done ? '<span class="tks-st" style="--c:' + colour(r.c.c) + '">' + esc(r.c.n) + '</span>' : '') + '</div>'; }).join('') + '</div>' + (rows.length ? '' : '<div class="tks-none">No tasks yet.</div>');
    } else {
      h = '<div class="tks-board" style="--n:' + Math.max(1, cols.length) + '">' + cols.map(function(c){
        return '<div class="tks-col"><div class="tks-colh"><i style="--c:' + colour(c.c) + '"></i><b>' + esc(c.n) + '</b><span>' + c.tasks.length + '</span></div><div class="tks-cards">' + c.tasks.map(function(t){
          var meta = due(t, m) + person(t);
          return '<div class="tks-card' + (t.done ? ' done' : '') + '" data-flip="' + esc(t.id || 'c' + n) + '" style="--i:' + (n++) + '"><span class="tks-t">' + esc(t.t) + '</span>' + (meta ? '<span class="tks-m">' + meta + '</span>' : '') + '</div>'; }).join('') + '</div><div class="tks-more"></div></div>';
      }).join('') + '</div>';
    }
    h += '<div class="tks-foot"><i style="--c:' + colour(m.c, '#12A36A') + '"></i><b>' + esc(m.n || 'Tasks') + '</b><span>' + (m.sample ? 'sample tasks' : m.live ? 'Sleek Tasks' : 'as on ' + new Date(m.at || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) + '</span><span class="tks-rest"></span></div>';
    host.innerHTML = h; host.classList.toggle('tks-sample', !!m.sample);
    fit(host);
  }
  // show only what fits: hide from the end of each column (or of the list), and say how many are hidden
  function fit(host){
    if(!host.isConnected || !host.clientHeight) return;
    Array.prototype.forEach.call(host.querySelectorAll('[hidden]'), function(e){ e.hidden = false; });
    function trim(box, items, label, words){
      var cut = 0; while((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && cut < items.length){ items[items.length - 1 - cut].hidden = true; cut++; }
      if(label) label.textContent = cut ? words(cut) : '';
    }
    Array.prototype.forEach.call(host.querySelectorAll('.tks-col'), function(col){ trim(col.querySelector('.tks-cards'), col.querySelectorAll('.tks-card'), col.querySelector('.tks-more'), function(k){ return '+ ' + k + ' more'; }); });
    var list = host.querySelector('.tks-list'); if(list) trim(list, list.querySelectorAll('.tks-row'), host.querySelector('.tks-rest'), function(k){ return 'and ' + k + ' more'; });
  }
  // draw again; with move, whatever moved glides from where it was
  function redrawHost(host, move){
    var was = {}, can = move && !reduce.matches && host.isConnected && host.clientHeight && !document.body.classList.contains('editing');
    if(can) Array.prototype.forEach.call(host.querySelectorAll('[data-flip]:not([hidden])'), function(e){ was[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
    draw(host);
    if(can) Array.prototype.forEach.call(host.querySelectorAll('[data-flip]:not([hidden])'), function(e){
      var o = was[e.getAttribute('data-flip')], r = e.getBoundingClientRect();
      if(!o){ e.classList.add('tks-new'); setTimeout(function(){ e.classList.remove('tks-new'); }, 700); return; }
      if(Math.abs(o.left - r.left) < 1 && Math.abs(o.top - r.top) < 1) return;
      e.style.transition = 'none'; e.style.transform = 'translate(' + ((o.left - r.left) / scaleOf(host)) + 'px,' + ((o.top - r.top) / scaleOf(host)) + 'px)';
      requestAnimationFrame(function(){ e.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1)'; e.style.transform = ''; setTimeout(function(){ e.style.transition = ''; }, 600); });
    });
  }
  // the slide is drawn at 1280 wide and scaled to the window: how much, so a move measured on screen is right on the slide
  function scaleOf(host){ var r = host.getBoundingClientRect(); return host.offsetWidth ? r.width / host.offsetWidth || 1 : 1; }
  function repaint(move){ hosts = hosts.filter(function(h){ return h.isConnected; }); hosts.forEach(function(h){ redrawHost(h, move); }); }

  function build(el, a){
    var host = el && el.querySelector && el.querySelector('.tks-host'); if(!host) return null;
    host._tk = a && a.tk ? a.tk : (a ? (a.tk = { view: 'board' }) : { view: 'board' });
    if(a && a.id && hosts.indexOf(host) < 0){ hosts.push(host); need(); }      // a real slide (the picker's preview has no id): keep it up to date
    draw(host);
    return host;
  }
  window.addEventListener('resize', function(){ hosts.forEach(fit); });
  window.SleekTaskSlide = { build: build, fit: fit, redraw: function(el){ var h = el && el.querySelector('.tks-host'); if(h) redrawHost(h, false); return h; }, tasks: function(){ return T; }, onReady: function(fn){ if(T) fn(T); else ready.push(fn); }, need: need, published: published };
})();
