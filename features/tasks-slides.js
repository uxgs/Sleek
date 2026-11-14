/* The Tasks slide in the deck: its motion, and choosing what it shows.

   Motion: when a Tasks slide appears its cards rise in, one after another, unless the device asks for
   less motion or you are editing. (features/tasks-layout.js draws the slide, keeps it in step with
   Sleek Tasks, and glides a card when its task moves.)

   Choosing: in Edit mode the bar offers Choose tasks on such a slide (or click the board). A small
   panel picks the project, a board or a list, and whether done tasks show. The choice is saved in
   the slide's entry in the deck (seed.added[k].tk). A new Tasks slide takes your first project. */
(function(){
  var D = window.Deck, K = window.SleekTaskSlide;
  if(!D || !K) return;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function editing(){ return document.body.classList.contains('editing'); }
  function hostOf(s){ return s ? s.querySelector('.tks-host') : null; }

  // ---------- motion ----------
  function enter(host){
    if(!host) return; K.fit(host);
    host.classList.remove('tks-in'); if(reduce.matches || editing()) return;
    void host.offsetWidth; host.classList.add('tks-in'); setTimeout(function(){ host.classList.remove('tks-in'); }, 1600);
  }
  if(D.mirror || K.published || D.popout){            // windows that only show the deck
    D.onShow.push(function(s){ enter(hostOf(s)); });
    enter(hostOf(D.current()));
    return;
  }

  // ---------- the bar's button, and the panel ----------
  var group = document.getElementById('eb-tasks'), btn = document.getElementById('tks-edit'), ed = null;
  function cur(){ var s = D.current(), h = hostOf(s), a = h && D.addedOf(s); return h && a ? { s: s, host: h, a: a, tk: a.tk || (a.tk = { view: 'board' }) } : null; }
  function paintBar(){ if(group) group.hidden = !(editing() && cur()); }
  function close(){ if(ed){ ed.remove(); ed = null; if(btn) btn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('tks-open'); } }
  function save(c){ if(c.host._tk !== c.tk) c.host._tk = c.tk; K.redraw(c.s); D.saveAdded(); }
  function fill(){
    var c = cur(); if(!ed || !c) return; var T = K.tasks(), ps = T ? T.projects() : [], tk = c.tk;
    ed.innerHTML = '<div class="tks-ed-h"><b>The tasks on this slide</b><button type="button" class="tks-ed-x" aria-label="Close">×</button></div>' +
      (!T ? '<p>Opening your tasks…</p>' : !ps.length ? '<p>You have no boards yet. Make one in Sleek Tasks, then choose it here.</p>' :
        '<label for="tks-p">Board</label><select id="tks-p">' + (tk.project && ps.some(function(p){ return p.id === tk.project; }) ? '' : '<option value="">' + (tk.project ? 'Not in this browser' : 'Choose a project') + '</option>') +
          ps.map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === tk.project ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
        '<span class="tks-ed-l">Shown as</span><span class="tks-ed-seg" role="group" aria-label="Shown as">' + [['board', 'Board'], ['list', 'List']].map(function(v){ var on = (tk.view === 'list' ? 'list' : 'board') === v[0]; return '<button type="button" data-view="' + v[0] + '" aria-pressed="' + on + '" class="' + (on ? 'on' : '') + '">' + v[1] + '</button>'; }).join('') + '</span>' +
        '<label class="tks-ed-c"><input type="checkbox" id="tks-d"' + (tk.done !== false ? ' checked' : '') + '> Show done tasks</label>') +
      '<div class="tks-ed-f"><a href="tasks.html' + (tk.project ? '#/' + esc(tk.project) + '/board' : '') + '" target="_blank" rel="noopener">Open Sleek Tasks</a><span>It follows your tasks while you edit and present. A published deck shows them as they were when you published.</span></div>';
  }
  function place(){
    if(!ed || !btn) return; var b = btn.getBoundingClientRect(), w = ed.offsetWidth;
    ed.style.left = Math.max(8, Math.min(b.left + b.width / 2 - w / 2, innerWidth - w - 8)) + 'px'; ed.style.bottom = (innerHeight - b.top + 12) + 'px';
  }
  function openEd(){
    if(ed){ close(); return; } if(!cur()) return;
    ed = document.createElement('div'); ed.className = 'tks-ed'; ed.setAttribute('role', 'dialog'); ed.setAttribute('aria-label', 'The tasks on this slide');
    document.body.appendChild(ed); document.body.classList.add('tks-open'); if(btn) btn.setAttribute('aria-expanded', 'true');
    fill(); place(); K.need();
    ed.addEventListener('click', function(e){
      var c = cur(), x; if(!c) return;
      if(e.target.closest('.tks-ed-x')){ close(); if(btn) btn.focus(); return; }
      if((x = e.target.closest('[data-view]'))){ c.tk.view = x.getAttribute('data-view'); save(c); fill(); }
    });
    ed.addEventListener('change', function(e){
      var c = cur(); if(!c) return;
      if(e.target.id === 'tks-p'){ if(e.target.value){ c.tk.project = e.target.value; delete c.tk.snap; save(c); fill(); } }
      else if(e.target.id === 'tks-d'){ c.tk.done = e.target.checked; save(c); }
    });
    var first = ed.querySelector('select, button[data-view]'); if(first) first.focus();
  }
  if(btn) btn.addEventListener('click', openEd);
  D.stage.addEventListener('click', function(e){ if(editing() && e.target.closest && e.target.closest('.slide.active .tks-host') && !ed) openEd(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && ed){ e.stopPropagation(); close(); if(btn) btn.focus(); } }, true);
  document.addEventListener('pointerdown', function(e){ if(ed && !ed.contains(e.target) && !(btn && btn.contains(e.target)) && !(e.target.closest && e.target.closest('.slide.active .tks-host'))) close(); }, true);
  window.addEventListener('resize', place);

  D.onShow.push(function(s){ close(); enter(hostOf(s)); paintBar(); });
  var wasEditing = editing();
  new MutationObserver(function(){ var now = editing(); if(now === wasEditing) return; wasEditing = now; if(!now) close(); paintBar(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // once the tasks are here: a Tasks slide that has no project yet takes the first one, and an open panel fills in
  K.onReady(function(T){
    var first = T.projects()[0], changed = false;
    Array.prototype.forEach.call(D.stage.querySelectorAll('.slide[data-added]'), function(s){
      var h = hostOf(s), a = h && D.addedOf(s); if(!a) return; var tk = a.tk || (a.tk = { view: 'board' });
      if(!tk.project && !tk.snap && first){ tk.project = first.id; h._tk = tk; K.redraw(s); changed = true; }
    });
    if(changed) D.saveAdded();
    fill(); place();
    T.on(function(){ if(ed){ var a = document.activeElement; if(!(a && ed.contains(a) && a.tagName === 'SELECT')) { fill(); place(); } } });
  });
  paintBar(); enter(hostOf(D.current()));
})();
