/* Results and Chart slides: their motion, and editing their numbers.

   Motion: when a slide with numbers appears, they play in once (numbers count up, bars grow, a line
   draws, a pie sweeps round), unless the slide has motion switched off, the device asks for less
   motion, or you are editing. features/data-layout.js does the drawing.

   Editing: in Edit mode the bar offers Edit data on such a slide (or click the numbers). A panel
   opens under the slide with a row for each number, bar, point or slice: add and remove rows, pick
   the one the headline is about, give any row its own colour (they follow the deck's theme until
   you do), and paste rows from a spreadsheet into any cell. Every change is drawn at once and
   saved into the slide's entry in the deck (seed.added[k].ds). */
(function(){
  var D = window.Deck, SD = window.SleekData;
  if(!D || !SD) return;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function editing(){ return document.body.classList.contains('editing'); }
  function hostOf(s){ return s ? s.querySelector('.ds-host') : null; }

  // ---------- motion ----------
  var raf = 0, playing = null;
  function still(host){ if(playing === host){ cancelAnimationFrame(raf); playing = null; } if(host && host._ds) SD.draw(host, host._ds, 1e9); }
  function play(host){
    cancelAnimationFrame(raf);
    if(playing && playing !== host && playing._ds) SD.draw(playing, playing._ds, 1e9);
    playing = null;
    if(!host || !host._ds) return;
    if(host._ds.anim === false || reduce.matches || editing()){ SD.draw(host, host._ds, 1e9); return; }
    var t0 = performance.now(); playing = host;
    (function tick(){
      if(playing !== host) return;
      var e = performance.now() - t0, dur = SD.draw(host, host._ds, e);
      if(e < dur) raf = requestAnimationFrame(tick); else { SD.draw(host, host._ds, 1e9); playing = null; }
    })();
  }

  if(D.mirror || window.SLEEK_DECK && SLEEK_DECK.published || D.popout){            // windows that only show the deck
    D.onShow.push(function(s){ play(hostOf(s)); });
    play(hostOf(D.current()));
    return;
  }

  // ---------- the bar's button, and the panel ----------
  var group = document.getElementById('eb-data'), ed = null, open = null;       // open: { s, host, a, kind, ds }
  function cur(){ var s = D.current(), h = hostOf(s), a = h && D.addedOf(s); return h && a ? { s: s, host: h, a: a, kind: SD.kindOf(h), ds: h._ds } : null; }
  function paintBar(){ if(group) group.hidden = !(editing() && cur()); }
  function save(){
    if(!open) return;
    open.ds = open.host._ds = SD.norm(open.kind, open.ds);
    open.a.ds = SD.copy(open.ds);
    if(open.kind === 'chart') open.host.setAttribute('data-type', open.ds.type);
    D.saveAdded(); still(open.host);
  }
  function resolve(css){ var p = document.createElement('i'); p.style.cssText = 'position:absolute;width:0;height:0;background:' + css; open.host.appendChild(p); var c = getComputedStyle(p).backgroundColor; p.remove(); return c; }
  function accent(){ var v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); return SD.hex(v) || '#9A7CF0'; }

  function build(){
    ed = document.createElement('div'); ed.className = 'ds-ed'; ed.hidden = true; ed.setAttribute('role', 'dialog'); ed.setAttribute('aria-label', 'Edit data');
    ed.innerHTML = '<div class="ds-ed-top"><b class="ds-ed-h"></b><span class="ds-ed-types" role="group" aria-label="Kind of chart"></span><span class="ds-ed-grow"></span>' +
      '<label class="ds-ed-check"><input type="checkbox" id="ds-anim"> Animate when the slide appears</label><button type="button" class="ds-ed-done">Done</button></div>' +
      '<p class="ds-ed-p"></p><div class="ds-ed-scroll"><table></table></div>' +
      '<div class="ds-ed-foot"><button type="button" class="ds-ed-add"></button>' +
      '<span class="ds-ed-unit"><label for="ds-pre">Before each value</label><input type="text" id="ds-pre" maxlength="4" autocomplete="off"><label for="ds-post">After</label><input type="text" id="ds-post" maxlength="6" autocomplete="off"></span>' +
      '<span class="ds-ed-unit ds-ed-line"><span id="ds-lc-l">Line colour</span><label class="ds-col" id="ds-lc"><span class="ds-dot"></span><input type="color" id="ds-lcin" aria-labelledby="ds-lc-l"></label></span>' +
      '<button type="button" class="ds-ed-theme">Use the theme\'s colours</button></div>';
    document.body.appendChild(ed);
    var table = ed.querySelector('table');
    ed.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    ed.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } });
    ed.querySelector('.ds-ed-done').onclick = close;
    ed.querySelector('#ds-anim').onchange = function(){ if(this.checked) delete open.ds.anim; else open.ds.anim = false; save(); if(this.checked) replay(); };
    ed.querySelector('.ds-ed-types').addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b || !open) return;
      var was = SD.family(open.ds.type), now = SD.family(b.dataset.type);
      if(was !== now){ open.a['ds_' + was] = { rows: open.ds.rows, hi: open.ds.hi, pre: open.ds.pre, post: open.ds.post };   // each kind of chart keeps its own rows, so switching back loses nothing
        var kept = open.a['ds_' + now]; open.ds = Object.assign({ type: b.dataset.type, anim: open.ds.anim, color: open.ds.color }, kept || {}); if(open.ds.anim == null) delete open.ds.anim; if(!open.ds.color) delete open.ds.color; }
      else open.ds.type = b.dataset.type;
      save(); rows(); replay();
    });
    table.addEventListener('input', function(e){
      var t = e.target, tr = t.closest('tr'); if(!tr || !open) return;
      var i = +tr.dataset.i, r = open.ds.rows[i]; if(!r) return;
      if(t.dataset.col != null){ r[2] = t.value; save(); paint(); return; }
      if(t.dataset.k == null) return;
      if(open.kind === 'results') r[t.dataset.k] = t.value; else r[+t.dataset.k] = t.value;
      save();
    });
    table.addEventListener('change', function(e){ var t = e.target; if(t.dataset.hi != null && open){ open.ds.hi = +t.dataset.hi; save(); paint(); } });
    table.addEventListener('click', function(e){
      var b = e.target.closest('[data-del]'); if(!b || !open) return;
      var d = open.ds, i = +b.dataset.del; if(d.rows.length < 2) return;
      d.rows.splice(i, 1); if(d.hi != null){ if(d.hi === i) d.hi = Math.min(i, d.rows.length - 1); else if(d.hi > i) d.hi--; }
      save(); rows();
    });
    // rows pasted from a spreadsheet fill the table from the cell they were pasted into
    table.addEventListener('paste', function(e){
      var text = (e.clipboardData || window.clipboardData).getData('text'); if(!/[\t\n]/.test(text.trim()) || !open) return;
      var tr = e.target.closest('tr'); if(!tr) return; e.preventDefault();
      var d = open.ds, at = +tr.dataset.i, max = max_(), lines = text.replace(/\r/g, '').split('\n').filter(function(l){ return l.trim(); });
      lines.forEach(function(l, k){
        var c = l.split('\t').map(function(x){ return x.trim(); }), i = at + k; if(i >= max) return;
        if(open.kind === 'results') d.rows[i] = { v: c[0] || '', l: c[1] || (d.rows[i] || {}).l || '', c: c[2] || (d.rows[i] || {}).c || '', t: (d.rows[i] || {}).t || 'plain' };
        else d.rows[i] = c.length > 1 ? [c[0], c[1]] : [(d.rows[i] || [''])[0], c[0]];
      });
      save(); rows();
    });
    ed.querySelector('.ds-ed-add').onclick = function(){
      var d = open.ds; if(d.rows.length >= max_()) return;
      if(open.kind === 'results') d.rows.push({ v: '0', l: 'New number', c: '', t: 'plain' }); else { var last = d.rows[d.rows.length - 1]; d.rows.push(['New', last ? last[1] : 1]); }
      save(); rows();
      var f = ed.querySelector('#ds-c-' + (d.rows.length - 1) + '-' + (open.kind === 'results' ? 'v' : '0')); if(f){ f.focus(); f.select(); }
    };
    ['pre', 'post'].forEach(function(id){ ed.querySelector('#ds-' + id).oninput = function(){ open.ds[id] = this.value; save(); }; });
    ed.querySelector('#ds-lcin').oninput = function(){ open.ds.color = this.value; save(); paint(); };
    ed.querySelector('.ds-ed-theme').onclick = function(){ var d = open.ds; if(d.type === 'line') delete d.color; else d.rows.forEach(function(r){ r.length = 2; }); save(); rows(); };
  }
  function max_(){ return open.kind === 'results' ? SD.MAX.results : SD.MAX[open.ds.type]; }
  function replay(){ if(open && open.ds.anim !== false && !reduce.matches){ var h = open.host;
    var t0 = performance.now(); playing = h; cancelAnimationFrame(raf);
    (function tick(){ if(playing !== h) return; var e = performance.now() - t0, dur = SD.draw(h, h._ds, e); if(e < dur) raf = requestAnimationFrame(tick); else { SD.draw(h, h._ds, 1e9); playing = null; } })(); } }

  function rows(){
    var d = open.ds, one = d.rows.length < 2, results = open.kind === 'results', h, each = !results && d.type !== 'line', parts = !results && SD.family(d.type) === 'parts';
    ed.querySelector('.ds-ed-h').textContent = results ? 'Results' : 'Chart';
    var types = ed.querySelector('.ds-ed-types'); types.hidden = results;
    if(!results) types.innerHTML = [['bars', 'Bars'], ['line', 'Line'], ['pie', 'Pie'], ['donut', 'Donut']].map(function(t){ return '<button type="button" data-type="' + t[0] + '" aria-pressed="' + (d.type === t[0]) + '">' + t[1] + '</button>'; }).join('');
    ed.querySelector('#ds-anim').checked = d.anim !== false;
    if(results){
      h = '<thead><tr><th>Number</th><th>What it is</th><th>The change</th><th>Shown as</th><th></th></tr></thead><tbody>';
      d.rows.forEach(function(r, i){
        h += '<tr data-i="' + i + '"><td><input type="text" class="n" id="ds-c-' + i + '-v" data-k="v" value="' + esc(r.v) + '" aria-label="Number ' + (i + 1) + '" autocomplete="off"></td>' +
          '<td><input type="text" id="ds-c-' + i + '-l" data-k="l" value="' + esc(r.l) + '" aria-label="What number ' + (i + 1) + ' is" autocomplete="off"></td>' +
          '<td><input type="text" id="ds-c-' + i + '-c" data-k="c" value="' + esc(r.c) + '" aria-label="The change for number ' + (i + 1) + '" autocomplete="off"></td>' +
          '<td><select id="ds-c-' + i + '-t" data-k="t" aria-label="How the change for number ' + (i + 1) + ' is shown">' + [['good', 'Good news'], ['watch', 'One to watch'], ['plain', 'Neutral']].map(function(o){ return '<option value="' + o[0] + '"' + (r.t === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td>' +
          '<td class="c"><button type="button" class="ds-x" data-del="' + i + '" aria-label="Remove number ' + (i + 1) + '"' + (one ? ' disabled' : '') + '>×</button></td></tr>';
      });
    } else {
      h = '<thead><tr><th>Label</th><th>Value</th><th>Pick out</th>' + (each ? '<th>Colour</th>' : '') + '<th></th></tr></thead><tbody>';
      d.rows.forEach(function(r, i){
        h += '<tr data-i="' + i + '"><td><input type="text" id="ds-c-' + i + '-0" data-k="0" value="' + esc(r[0]) + '" aria-label="Label ' + (i + 1) + '" autocomplete="off"></td>' +
          '<td><input type="text" class="n" inputmode="decimal" id="ds-c-' + i + '-1" data-k="1" value="' + esc(r[1]) + '" aria-label="Value ' + (i + 1) + '" autocomplete="off"></td>' +
          '<td class="c"><input type="radio" name="ds-hi" data-hi="' + i + '"' + (d.hi === i ? ' checked' : '') + ' aria-label="Pick out ' + esc(r[0]) + '"></td>' +
          (each ? '<td class="c"><label class="ds-col" data-i="' + i + '"><span class="ds-dot"></span><input type="color" data-col="' + i + '" value="' + (SD.hex(r[2]) || accent()) + '" aria-label="Colour for ' + esc(r[0]) + '"></label></td>' : '') +
          '<td class="c"><button type="button" class="ds-x" data-del="' + i + '" aria-label="Remove ' + esc(r[0]) + '"' + (one ? ' disabled' : '') + '>×</button></td></tr>';
      });
    }
    ed.querySelector('table').innerHTML = h + '</tbody>';
    var add = ed.querySelector('.ds-ed-add'); add.disabled = d.rows.length >= max_();
    add.textContent = results ? 'Add a number' : parts ? 'Add a slice' : d.type === 'line' ? 'Add a point' : 'Add a bar';
    ed.querySelector('.ds-ed-unit').hidden = results;
    if(!results){ ed.querySelector('#ds-pre').value = d.pre; ed.querySelector('#ds-post').value = d.post; }
    ed.querySelector('.ds-ed-p').textContent = results
      ? 'One to four numbers. Type each one as you want it shown (38,400, 71%, £1.8m): it counts up in that style. A change that starts with + or − gets an arrow.'
      : 'Up to ' + max_() + ' rows. Pick out the one the headline is about. Colours follow the deck\'s theme until you choose your own. You can paste rows from a spreadsheet into any cell.';
    paint(); place();
  }
  // the colour dots: what each row has now, and whether it is the theme's or your own
  function paint(){
    var d = open.ds, results = open.kind === 'results', isLine = !results && d.type === 'line', own = isLine && !!SD.hex(d.color);
    Array.prototype.forEach.call(ed.querySelectorAll('table .ds-col'), function(l){
      var i = +l.dataset.i, r = d.rows[i]; if(!r) return;
      var mine = SD.hex(r[2]); if(mine) own = true;
      l.classList.toggle('own', !!mine); l.firstChild.style.background = resolve(SD.tone(d, i)); if(!mine) l.lastChild.value = accent();
    });
    ed.querySelector('.ds-ed-line').hidden = !isLine;
    if(isLine){ var lc = ed.querySelector('#ds-lc'); lc.classList.toggle('own', !!SD.hex(d.color)); lc.firstElementChild.style.background = resolve(SD.hex(d.color) || 'var(--accent)'); if(!SD.hex(d.color)) ed.querySelector('#ds-lcin').value = accent(); }
    ed.querySelector('.ds-ed-theme').hidden = !own;
  }
  // the panel sits just above the bars, and the slide moves up to stay in view
  function place(){
    if(!ed || ed.hidden) return;
    var eb = document.getElementById('editbar'), bar = document.getElementById('bar');
    var top = Math.min(eb && !eb.hidden ? eb.getBoundingClientRect().top : innerHeight, bar ? bar.getBoundingClientRect().top : innerHeight);
    ed.style.bottom = Math.max(8, innerHeight - top + 10) + 'px';
    var barH = bar ? bar.offsetHeight : 0, ebRoom = eb && !eb.hidden && !document.body.classList.contains('eb-docked') ? eb.offsetHeight + 12 : 0;   // the engine already keeps room for the bars
    D.inset = Math.max(0, innerHeight - ed.getBoundingClientRect().top + 8 - barH - ebRoom); if(D.refit) D.refit();
  }
  function openEd(){
    var c = cur(); if(!c || !editing()) return;
    if(!ed) build();
    open = c; open.ds = SD.norm(c.kind, c.ds);
    ed.hidden = false; rows(); document.body.classList.add('ds-open');
    requestAnimationFrame(function(){ requestAnimationFrame(place); });          // once the bars have settled around it
    var first = ed.querySelector('table input[type="text"]'); if(first) first.focus({ preventScroll: true });
  }
  function close(){
    if(!ed || ed.hidden) return;
    ed.hidden = true; open = null; document.body.classList.remove('ds-open');
    D.inset = 0; if(D.refit) D.refit();
  }
  var btn = document.getElementById('ds-edit'); if(btn) btn.onclick = function(){ if(ed && !ed.hidden) close(); else openEd(); };
  D.stage.addEventListener('click', function(e){ if(editing() && e.target.closest && e.target.closest('.slide.active .ds-host')) openEd(); });
  window.addEventListener('resize', place);

  D.onShow.push(function(s){ close(); play(hostOf(s)); paintBar(); });
  var wasEditing = editing();
  new MutationObserver(function(){
    var now = editing(); if(now === wasEditing) return;
    wasEditing = now; if(!now) close(); else still(hostOf(D.current())); paintBar();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  paintBar(); play(hostOf(D.current()));
})();
