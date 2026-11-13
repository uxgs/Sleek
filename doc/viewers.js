/* See who's reading: your side of it, for a page you published with that switched on (doc/publish.js).

   A chip in the bar says how many people are reading now. Its panel lists them (press one to go to
   where they are), the totals, and how many read to the end, with Clear the record and Stop
   counting (each asks for a second press). Down the right edge of the page a bar shows how far
   people got: the stronger the colour beside a block, the more readers reached it; a dot marks
   each reader here now.

   The service (core/online.js) speaks in stops, numbered from 0 as they were when the page was
   published. The page's record keeps, with its two codes, `slides` (a name for each stop) and
   `stops` (the id of the block each stop began at); a stop is placed on the page as it is now by
   that id, so readers stay in the right place after you edit. */
(function(){
  var A = window.SleekDoc, D = window.SleekDocs, O = window.SleekOnline, K = window.SleekDocKit;
  var chip = document.getElementById('vw-chip'), rail = document.getElementById('vw-rail');
  if(!A || !D || !O || !O.on || !chip) return;
  var COL = ['#1F9D61', '#3B8BEB', '#E08A2B', '#D45CA8', '#7C5CFF', '#C2A21E'];
  var V = null, st = null, status = '', line = null, forId = null;
  function color(no){ return COL[(no - 1) % COL.length]; }
  function plural(n, a, b){ return n + ' ' + (n === 1 ? a : b); }
  function ago(t){ var s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function live(){ return st ? st.live : []; }
  function stops(){ return V && V.stops && V.stops.length ? V.stops.length : Math.max(1, (st && st.far.length) || 1); }
  function nameOf(s){ return (V && V.slides && V.slides[s]) || 'Top'; }
  // the block on the page today where a stop begins: by the id saved at publish, else by its number
  function blockOf(s){
    var kids = A.view.dom.children, doc = A.view.state.doc, id = V && V.stops && V.stops[s], found = -1;
    if(id) doc.forEach(function(n, _, i){ if(found < 0 && n.attrs.id === id) found = i; });
    if(found < 0){ var step = Math.max(1, Math.ceil(doc.childCount / Math.max(1, stops()))); found = Math.min(doc.childCount - 1, s * step); }
    return kids[found] || null;
  }

  function paintChip(){
    chip.hidden = !V; if(!V) return;
    var n = live().length, text = !st ? 'Readers' : n ? n + ' reading' : !st.views ? 'No views yet' : plural(st.views, 'view', 'views');
    chip.className = 'chip' + (n ? ' live' : '');
    chip.innerHTML = (n ? '<span class="vw-pulse" aria-hidden="true"></span>' : A.ico('eye')) + '<span>' + text + '</span>';
    chip.setAttribute('aria-label', 'Readers: ' + text);
  }
  function paintRail(){
    rail.innerHTML = ''; if(!V || !st) return;
    var top = A.view.dom.offsetTop, n = stops(), max = 1, i;
    for(i = 0; i < n; i++) max = Math.max(max, st.far[i] || 0);
    for(i = 0; i < n; i++){
      var a = blockOf(i), b = i + 1 < n ? blockOf(i + 1) : null; if(!a || a.classList.contains('dk-folded')) continue;
      var y = top + a.offsetTop, end = b && b.offsetTop > a.offsetTop ? top + b.offsetTop : top + a.offsetTop + a.offsetHeight;
      var seg = document.createElement('i'); seg.style.top = y + 'px'; seg.style.height = Math.max(3, end - y - 4) + 'px'; seg.style.opacity = (st.views ? 0.08 + 0.92 * (st.far[i] || 0) / max : 0.08).toFixed(2); rail.appendChild(seg);
    }
    live().forEach(function(v){
      var k = blockOf(Math.min(v.s, n - 1)); if(!k) return;
      var d = document.createElement('b'); d.style.setProperty('--c', color(v.no)); d.style.top = (top + k.offsetTop + Math.min(k.offsetHeight, 60) / 2 - 5) + 'px'; rail.appendChild(d);
    });
  }
  var pan = null;      // the panel while it is open
  function paintPanel(){ if(!pan || !pan.isConnected){ pan = null; return; } fill(pan); }
  function fill(p){
    var n = stops(), s = st || { views: 0, people: 0, last: 0, far: [] }, h = '<h4>Reading now</h4>';
    if(!st) h += '<p>' + (status === 'waiting' ? 'Can’t reach the reader service right now. Trying again.' : 'Connecting…') + '</p>';
    else if(!live().length) h += '<p>Nobody right now. They show up here the moment they open the page.</p>';
    else h += '<div class="vw-who">' + live().map(function(v){
      return '<button type="button" class="mi" data-s="' + v.s + '"><i class="c" style="--c:' + color(v.no) + '"></i><span><b>Reader ' + v.no + '</b><i>' + A.esc(nameOf(Math.min(v.s, n - 1))) + ' · ' + Math.round(Math.min(n, v.s + 1) / n * 100) + '% through</i></span><em>' + ago(v.t) + '</em></button>'; }).join('') + '</div>';
    var end = s.far[n - 1] || 0;
    h += '<div class="line"></div><div class="vw-stats"><div><b>' + s.views + '</b><span>' + (s.views === 1 ? 'view' : 'views') + '</span></div><div><b>' + s.people + '</b><span>' + (s.people === 1 ? 'person' : 'people') + '</span></div>' +
      '<div><b>' + (live().length ? 'Now' : s.last ? A.esc(ago(s.last)) : 'Never') + '</b><span>last opened</span></div></div>' +
      '<p>' + (s.views ? end + ' of ' + plural(s.views, 'view', 'views') + ' read to the end. ' : '') + 'The bar down the right edge of the page shows how far people got.</p>' +
      '<div class="vw-foot"><button type="button" data-do="clear">Clear the record</button><button type="button" class="warn" data-do="stop">Stop counting</button></div>';
    if(h === p.__was) return; p.__was = h; p.innerHTML = h; p.style.minWidth = '300px';
    Array.prototype.forEach.call(p.querySelectorAll('[data-s]'), function(b){ b.addEventListener('click', function(){ var k = blockOf(Math.min(+b.getAttribute('data-s'), n - 1)); if(k) k.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); });
    Array.prototype.forEach.call(p.querySelectorAll('[data-do]'), function(b){
      var armed = 0, what = b.getAttribute('data-do'), label = b.textContent;
      b.addEventListener('click', function(){
        if(Date.now() - armed > 5000){ armed = Date.now(); b.textContent = what === 'clear' ? 'Press again to clear' : 'Press again to stop'; setTimeout(function(){ if(b.isConnected) b.textContent = label; }, 5000); return; }
        if(what === 'clear') O.clear(V).then(function(){ A.toast('Record cleared'); }, function(){ A.toast('Couldn’t reach the reader service.'); });
        else { var v = V, id = forId; unwatch(); A.closePop(); O.stop(id, v, { store: D }).then(function(){ A.toast('Stopped counting. Copies already shared are no longer counted.'); sync(); }); }
      });
    });
  }
  function paint(){ paintChip(); paintRail(); paintPanel(); }
  chip.addEventListener('click', function(){ pan = A.menu(chip, function(p){ p.__was = ''; fill(p); }, 'right'); });

  function unwatch(){ if(line){ line.close(); line = null; } V = null; st = null; status = ''; forId = null; paint(); }
  // start (or stop) watching, for the page that is open now
  function sync(){
    var m = A.meta(); if(!m) return unwatch();
    D.get(m.id).then(function(d){
      var v = d && d.viewers && d.viewers.on && d.viewers.room && d.viewers.key ? d.viewers : null;
      if(v && forId === d.id && V && V.room === v.room){ V = v; paint(); return; }      // the same line; only what is saved beside it changed
      unwatch(); if(!v) return;
      V = v; forId = d.id; paint();
      var id = d.id;
      line = O.watch(v, {
        state: function(s){ if(forId !== id) return; st = s; paint(); },
        status: function(s){
          if(forId !== id) return; status = s;
          if(s === 'gone'){ v.on = false; D.setViewers(id, v).then(function(){ A.toast('The reader service no longer has this page. Publish it again to count readers.'); unwatch(); }); return; }
          paintPanel();
        } });
    });
  }
  A.onOpen.push(sync); A.viewersChanged = sync;
  A.onUpdate.push(function(tr){ if(tr.docChanged && V) requestAnimationFrame(paintRail); });
  var sized = false;
  A.onOpen.push(function(){ if(sized || !window.ResizeObserver) return; sized = true; new ResizeObserver(function(){ if(V) paintRail(); }).observe(A.view.dom); });
  setInterval(function(){ if(pan) paintPanel(); }, 20000);      // "3 min ago" keeps up
})();
