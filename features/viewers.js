/* Viewers, your side: who is viewing a deck you published with "See who's viewing" switched on
   (the Share menu, features/deck-file.js; the codes and the service, core/online.js).

   A chip in the bar says how many are viewing now (or how many views there have been). Its panel
   lists who is on which slide (press one to go to their slide), the totals, and how far through
   the deck people got. The slide and All slides mark where viewers are. Viewers are numbers, never
   names: "Viewer 1" is whoever has been here longest. */
(function(){
  var D = window.Deck, S = window.SleekStore, O = window.SleekOnline, info = window.SLEEK_DECK;
  if(!D || !S || !O || !O.on || !info || info.published || D.popout || D.mirror || D.presenter) return;
  var bar = document.getElementById('bar'), spacer = bar && bar.querySelector('.spacer');
  if(!spacer) return;

  var COLORS = ['#9A7CF0', '#5AC8FA', '#FFB454', '#5EE0A0', '#FF8FB1', '#E8E06A'];
  var EYE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
  var V = null, st = null, status = 'waiting', line = null, open = false, whoWas = '', hereWas = '';

  var wrap = document.createElement('div'); wrap.className = 'vw-wrap'; wrap.hidden = true;
  wrap.innerHTML =
    '<button type="button" id="viewbtn" class="ibtn vw-chip" aria-haspopup="true" aria-expanded="false" aria-controls="vw-pop"></button>' +
    '<div class="vw-pop" id="vw-pop" role="dialog" aria-label="Viewers" hidden>' +
      '<div class="vw-g"><h4>Viewing now</h4><div id="vw-who"></div></div>' +
      '<div class="vw-g"><h4>Since you published</h4><div class="vw-stats" id="vw-stats"></div></div>' +
      '<div class="vw-g"><h4>How far people got</h4><div class="vw-far" id="vw-far" role="img"></div><div class="vw-far-x" id="vw-far-x" aria-hidden="true"></div><p class="vw-note" id="vw-far-note"></p></div>' +
      '<div class="vw-f"><button type="button" id="vw-clear">Clear the record</button><button type="button" id="vw-stop" class="warn">Stop counting</button></div>' +
      '<p class="vw-p">Viewers are anonymous. Sleek keeps counts and slide numbers, and nothing else.</p>' +
    '</div>';
  spacer.parentNode.insertBefore(wrap, spacer.nextSibling);
  var chip = wrap.querySelector('#viewbtn'), pop = wrap.querySelector('#vw-pop');
  function $(id){ return pop.querySelector('#' + id); }
  var here = document.createElement('div'); here.className = 'vw-here'; here.hidden = true;
  document.body.appendChild(here);

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function color(no){ return COLORS[(no - 1) % COLORS.length]; }
  function ago(t){
    var s = Math.max(0, (Date.now() - t) / 1000);
    if(s < 50) return 'just now';
    if(s < 3600) return Math.round(s / 60) + ' min';
    if(s < 86400) return Math.round(s / 3600) + ' h';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dots(list){ return '<span class="vw-dots">' + list.slice(0, 3).map(function(v){ return '<i style="--c:' + color(v.no) + '"></i>'; }).join('') + '</span>'; }

  // A viewer's slide number is from the copy they have, which may be older than the deck is now.
  // The names saved at publish time say which slide that was; its place today is found by name.
  function snap(){ return (V && V.slides && V.slides.length ? V.slides : D.labels()); }
  function nameOf(s){ return snap()[s] || ('Slide ' + (s + 1)); }
  function mine(s){
    var labels = D.labels(), name = snap()[s], k = name != null ? labels.indexOf(name) : -1;
    return k > -1 ? k : (s < labels.length ? s : -1);
  }
  function live(){ return st ? st.live : []; }
  function on(k){ return live().filter(function(v){ return mine(v.s) === k; }); }

  // ----- painting -----
  function paintChip(){
    wrap.hidden = !V; if(!V) return;
    var n = live().length, text = !st ? 'Viewers' : n ? n + ' viewing' : !st.views ? 'No views yet' : plural(st.views, 'view', 'views');
    chip.classList.toggle('live', n > 0);
    chip.innerHTML = (n ? '<span class="vw-pulse" aria-hidden="true"></span>' : EYE) + '<span class="vw-l">' + text + '</span>';
    chip.setAttribute('aria-expanded', open ? 'true' : 'false');
    chip.setAttribute('aria-label', 'Viewers: ' + text);
  }
  function paintWho(){
    var list = live(), who = $('vw-who');
    var html = !st ? '<p class="vw-none">' + (status === 'waiting' ? 'Can’t reach the viewer service right now. Trying again.' : 'Connecting…') + '</p>'
      : list.length ? '<div class="vw-who">' + list.map(function(v){
          return '<button type="button" data-go="' + mine(v.s) + '" title="Go to this slide"><i style="--c:' + color(v.no) + '"></i><b>Viewer ' + v.no + '</b>' +
            '<span>Slide ' + (v.s + 1) + ' · ' + esc(nameOf(v.s)) + '</span><em>' + ago(v.t) + '</em></button>';
        }).join('') + '</div>' : '<p class="vw-none">Nobody is viewing right now.</p>';
    if(html !== whoWas){ whoWas = html; who.innerHTML = html; }   // only when the words change, so a focused row stays focused
  }
  function paintPanel(){
    pop.hidden = !(open && V); if(pop.hidden) return;
    paintWho();
    var s = st || { views: 0, people: 0, last: 0, far: [] }, n = live().length;
    $('vw-stats').innerHTML = '<div><b>' + s.views + '</b><span>' + (s.views === 1 ? 'view' : 'views') + '</span></div>' +
      '<div><b>' + s.people + '</b><span>' + (s.people === 1 ? 'person' : 'people') + '</span></div>' +
      '<div><b>' + (n ? 'Now' : s.last ? esc(ago(s.last)) : 'Never') + '</b><span>last opened</span></div>';
    var count = Math.min(Math.max(snap().length, s.far.length, 1), 60), max = 1, cur = -1, i, bars = '', nums = '';
    for(i = 0; i < count; i++) max = Math.max(max, s.far[i] || 0);
    for(i = 0; i < count; i++) if(mine(i) === D.index()){ cur = i; break; }
    for(i = 0; i < count; i++){
      var val = s.far[i] || 0;
      bars += '<div class="' + (i === cur ? 'cur' : '') + '" title="Slide ' + (i + 1) + ': ' + plural(val, 'view', 'views') + '"><i style="height:' + Math.round(val / max * 100) + '%"></i></div>';
      nums += '<span class="' + (i === cur ? 'cur' : '') + '">' + (count <= 14 || i === 0 || i === count - 1 || i === cur ? i + 1 : '') + '</span>';
    }
    var far = $('vw-far'), fx = $('vw-far-x'), end = s.far[snap().length - 1] || 0;
    far.style.setProperty('--n', count); fx.style.setProperty('--n', count);
    far.innerHTML = bars; fx.innerHTML = nums;
    var note = s.views ? end + ' of ' + plural(s.views, 'view', 'views') + ' reached the last slide.' : 'No views yet.';
    $('vw-far-note').textContent = note; far.setAttribute('aria-label', 'How far people got. ' + note);
  }
  function hereOk(){
    var c = document.body.classList;
    return !(c.contains('presenting') || c.contains('editing') || c.contains('grid-open') || c.contains('deck-modal') || (open && c.contains('compact')));
  }
  function paintHere(){
    var h = V && hereOk() ? on(D.index()) : [];
    here.hidden = !h.length; if(!h.length) return;
    var html = dots(h) + '<span>' + (h.length === 1 ? 'Viewer ' + h[0].no + ' is here' : h.length + ' viewers are here') + '</span>';
    if(html !== hereWas){ hereWas = html; here.innerHTML = html; }
    var r = D.stage.getBoundingClientRect();
    here.style.top = Math.round(Math.max(8, r.top + 12)) + 'px';
    here.style.right = Math.round(Math.max(8, window.innerWidth - r.right + 12)) + 'px';
  }
  function paintGrid(tiles){
    tiles = tiles || document.getElementById('grid-tiles'); if(!tiles) return;
    Array.prototype.forEach.call(tiles.querySelectorAll('.gt[data-k]'), function(t){
      var old = t.querySelector('.vw-at'), h = V ? on(+t.getAttribute('data-k')) : [], shot = t.querySelector('.gt-shot');
      if(old) old.remove();
      if(h.length && shot) shot.insertAdjacentHTML('beforeend', '<span class="vw-at" title="' + plural(h.length, 'viewer', 'viewers') + ' on this slide">' + dots(h) + h.length + '</span>');
    });
  }
  function paint(){ paintChip(); paintPanel(); paintHere(); if(document.body.classList.contains('grid-open')) paintGrid(); }

  // ----- the line to the service -----
  function start(v){
    if(line){ line.close(); line = null; }
    V = v; st = null; status = 'connecting';
    if(!v){ open = false; paint(); return; }
    line = O.watch(v, {
      state: function(s){ st = s; paint(); },
      status: function(x){
        if(x !== 'gone'){ status = x; if(!st) paint(); return; }
        // the service has forgotten this deck (nobody opened it for a year): it is off until published again
        v.on = false;
        S.setViewers(info.id, v).then(function(){ start(null); D.toast('Viewers ended for this deck. Publish it again to switch them back on.'); });
      }
    });
    paint();
  }
  function load(){ S.get(info.id).then(function(d){ var v = d && d.viewers && d.viewers.on && d.viewers.room ? d.viewers : null; if(v || V) start(v); }); }
  window.addEventListener('sleek-viewers', function(e){ if(!e.detail || e.detail.id === info.id) load(); });

  // ----- controls -----
  function close(){ if(!open) return; open = false; disarm(); paint(); }
  chip.addEventListener('click', function(e){ e.stopPropagation(); open = !open; if(!open) disarm(); paint(); });
  document.addEventListener('pointerdown', function(e){ if(open && !wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && open){ e.stopPropagation(); close(); chip.focus(); } }, true);
  pop.addEventListener('click', function(e){
    var b = e.target.closest('[data-go]'); if(!b) return;
    var k = +b.getAttribute('data-go'); if(k > -1){ D.go(k); paint(); }
  });
  // Clear and Stop can't be undone, so each asks for a second press
  var armed = null, armT = 0;
  function disarm(){ clearTimeout(armT); if(armed){ armed.b.textContent = armed.text; armed = null; } }
  function twice(b, ask, go){
    b.addEventListener('click', function(){
      if(armed && armed.b === b){ disarm(); go(); return; }
      disarm(); armed = { b: b, text: b.textContent }; b.textContent = ask();
      armT = setTimeout(disarm, 5000);
    });
  }
  twice($('vw-clear'), function(){ return 'Press again to clear ' + plural(st ? st.views : 0, 'view', 'views'); }, function(){
    if(V) O.clear(V).then(function(r){ if(!r.ok) D.toast('Couldn’t clear the record. Try again in a moment.'); }, function(){ D.toast('Couldn’t reach the viewer service.'); });
  });
  twice($('vw-stop'), function(){ return 'Press again to stop for good'; }, function(){
    var v = V; if(!v) return;
    if(line){ line.close(); line = null; }          // so the service hanging up isn't taken for the deck having lapsed
    O.stop(info.id, v).then(function(){ D.toast('Viewers are off for this deck. Copies already shared are no longer counted.'); });
  });

  D.onShow.push(function(){ paintHere(); if(open) paintPanel(); });
  D.onGrid.push(function(tiles){ paintGrid(tiles); });
  window.addEventListener('resize', paintHere);
  // the slide's box moves as panels open and close, and "3 min" grows: look again now and then
  setInterval(function(){ if(!V) return; paintHere(); if(open) paintWho(); }, 1000);
  load();
})();
