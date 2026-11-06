/* Moodboards on the slide: laid out, moving, and edited.

   The layout (features/collage-layout.js) says where each picture goes; this keeps every board laid
   out as it's resized, as pictures come and go, and as Edit mode starts and ends. Motion:
     static            the board as it is
     drift sideways    an endless strip moving left (copies of the set keep it full, like the
                       carousel); hover pauses it; the presenter's preview follows its clock
     shuffle in place  a board of some of the pictures; every few seconds one slot crossfades to
                       the next picture. Which picture shows where comes from the time alone, so
                       every window of the deck shows the same pictures at the same moment.
   Edit mode shows every picture, still, and the bar's Moodboard group sets the style and motion,
   adds pictures (or drop them on the board), turns the title off, and remixes. Drag a picture
   onto another to swap them; x removes one (with Undo). Changes save into the slide's entry in the
   deck (seed.added[k].cl) and its pictures into the deck's media, under ids that never move. */
(function(){
  var D = window.Deck, C = window.SleekCollage;
  if(!D || !C) return;
  var stage = D.stage, SPEED = 26, SHUF_MS = 3400;              // drift px per second (slide px); a shuffle step
  var K = { mosaic: 9, masonry: 10, scattered: 8, contact: 12 };   // how many pictures a shuffling board shows
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function boards(){ return Array.prototype.slice.call(stage.querySelectorAll('.slide .cl-board')); }
  function editing(){ return document.body.classList.contains('editing'); }
  function slideOf(b){ return b.closest('.slide'); }
  function realSet(b){ return b.querySelector('.cl-set:not(.cl-copy)'); }
  function tiles(b){ var s = realSet(b); return s ? Array.prototype.slice.call(s.querySelectorAll(':scope > .cl-tile')) : []; }
  function freshId(){ return Math.random().toString(36).slice(2, 8); }

  // ---------- laying a board out ----------
  function shuffling(b){ var st = b._cl; return st.motion === 'shuffle' && !editing() && !reduce.matches && st.items.length >= 2; }
  function drifting(b){ return b._cl.motion === 'drift'; }
  function render(b){
    var st = b._cl; if(!st) return;
    C.paintClasses(b, st);
    b.classList.toggle('cl-none', !st.items.length);
    var W = b.clientWidth, H = b.clientHeight; if(!W || !H) return;
    var track = b.querySelector('.cl-track'); if(!track) return;
    dropCopies(b);
    if(shuffling(b)){
      var k = Math.max(1, Math.min(st.items.length - 1, K[st.style] || 9));
      b._slots = C.layout(st.style, 'fit', st.items.slice(0, k), W, H, st.mix).rects;
      b._turn = null;
      realSet(b).style.width = '';
      shuffleTo(b, true);
      return;
    }
    b._slots = null;
    if(st.style === 'masonry') lockButtons(b);
    var res = C.place(b, W, H, drifting(b) ? 'strip' : 'fit');
    if(drifting(b) && res){
      track.style.setProperty('--set', res.W + 'px');
      track.style.animationDuration = Math.max(8, res.W / SPEED) + 's';
      if(!editing() && res.W > 0) makeCopies(b, res.W, W);
    }
  }
  function renderAll(){ boards().forEach(render); }
  // Masonry: a picture can be locked to 16:9, so it isn't cropped (Edit mode shows the switch)
  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  function lockButtons(b){
    tiles(b).forEach(function(m){
      var it = itemOf(b, m); if(!it) return;
      var k = m.querySelector(':scope > .cl-lock');
      if(!k){
        k = document.createElement('button'); k.type = 'button'; k.className = 'cl-lock';
        k.innerHTML = LOCK_SVG + '<span>16:9</span>';
        k.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
        k.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation();
          var cl = own(b); if(!cl) return;
          var id = m.getAttribute('data-cid'), x = cl.items.filter(function(i){ return i.id === id; })[0]; if(!x) return;
          if(x.lock) delete x.lock; else x.lock = true;
          commit(b);
          D.toast(x.lock ? 'Locked to 16:9' : 'Unlocked');
        });
        m.appendChild(k);
      }
      k.setAttribute('aria-pressed', it.lock ? 'true' : 'false');
      k.title = it.lock ? 'Locked to 16:9: click to let it fit the column' : 'Lock to 16:9, so this picture isn\u2019t cropped';
    });
  }
  // drift: copies of the set after it, enough to fill the board while it moves one set to the left
  function makeCopies(b, setW, viewW){
    var real = realSet(b), n = Math.max(1, Math.ceil(viewW / setW));
    for(var k = 0; k < n; k++){
      var c = real.cloneNode(true);
      c.classList.add('cl-copy'); c.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(c.querySelectorAll('.media-clear, .media-before, .cl-lock'), function(el){ el.remove(); });
      Array.prototype.forEach.call(c.querySelectorAll('[data-mid],[data-eid],[contenteditable]'), function(el){
        el.removeAttribute('data-mid'); el.removeAttribute('data-eid'); el.removeAttribute('contenteditable');
      });
      real.parentNode.appendChild(c);
    }
    if(b.querySelector('.cl-copy video') && D.armVideos) D.armVideos();   // copies of a film play along with it
  }
  function dropCopies(b){ Array.prototype.forEach.call(b.querySelectorAll('.cl-copy'), function(c){ c.remove(); }); }

  // ---------- shuffle in place ----------
  // Turn t (one every SHUF_MS since 1970) changes slot order[t mod k], which then shows picture
  // (k + t) mod n. So the k pictures on the board are always the last k to arrive: never the same
  // one twice, and the next to come is never already there (k < n).
  function slotOrder(b, k){
    var st = b._cl, o = [];
    for(var j = 0; j < k; j++) o.push(j);
    return o.sort(function(x, y){ return C.rnd('slot' + x, st.mix, 'o') - C.rnd('slot' + y, st.mix, 'o'); });
  }
  function shuffleTo(b, instant){
    var st = b._cl, slots = b._slots; if(!slots) return;
    var n = st.items.length, k = slots.length, t = Math.floor(Date.now() / SHUF_MS);
    if(b._turn === t && !instant) return;
    b._turn = t;
    var order = slotOrder(b, k), at = {};
    for(var m = 0; m < k; m++){
      var tm = t - (((t - m) % k) + k) % k;                    // when slot order[m] last changed
      at[st.items[(((k + tm) % n) + n) % n].id] = slots[order[m]];
    }
    if(instant) b.classList.add('cl-instant');
    tiles(b).forEach(function(el){
      var r = at[el.getAttribute('data-cid')], off = el.classList.contains('cl-off');
      if(!r){ el.classList.add('cl-off'); el._slot = null; return; }
      if(!off && el._slot === r) return;
      el._slot = r;
      if(st.style === 'scattered') r = reprint(r, itemOf(b, el));   // a print keeps its own shape in the slot
      C.placeTile(el, r);
      if(instant){ el.classList.remove('cl-off'); return; }
      void el.offsetWidth;                                     // in place, still hidden, before it fades in
      el.classList.remove('cl-off');
    });
    if(instant){ void b.offsetWidth; b.classList.remove('cl-instant'); }
  }
  function itemOf(b, el){ var id = el.getAttribute('data-cid'); return b._cl.items.filter(function(it){ return it.id === id; })[0]; }
  // the same spot and size on the table, at this picture's own shape
  function reprint(r, it){
    if(!it || !r.frame) return r;
    var pw = r.w - 2 * r.frame.b, ph = r.h - r.frame.b - r.frame.bb, area = pw * ph, k = +it.r || 4 / 3;
    var w = Math.sqrt(area * k), h = Math.sqrt(area / k), o = {};
    for(var key in r) o[key] = r[key];
    o.w = w + 2 * r.frame.b; o.h = h + r.frame.b + r.frame.bb;
    o.x = r.x + (r.w - o.w) / 2; o.y = r.y + (r.h - o.h) / 2;
    return o;
  }
  setInterval(function(){
    if(document.hidden) return;
    var s = D.current(), b = s && s.querySelector('.cl-board');
    if(b && b._slots && shuffling(b)) shuffleTo(b, false);
  }, 200);

  // ---------- arriving on a moodboard ----------
  var rollT = 0;
  function arm(s){
    clearTimeout(rollT);
    boards().forEach(function(b){
      var sl = slideOf(b);
      if(sl !== s){ sl.classList.remove('rolling'); return; }
      if(drifting(b)){                                         // from the start of the strip, moving after a beat
        sl.classList.remove('rolling'); b.classList.add('cl-reset'); void b.offsetWidth; b.classList.remove('cl-reset');
        rollT = setTimeout(function(){ if(D.current() === sl) sl.classList.add('rolling'); }, 900);
      }
      if(b._slots && shuffling(b)) shuffleTo(b, true);
    });
  }
  D.onShow.push(function(s){ arm(s); paintBar(); });

  // ---------- the slide's own moodboard in the deck ----------
  // the first change to a board saves its pictures (the layout's own, at first) into its entry
  function own(b){
    var a = D.addedOf(slideOf(b)); if(!a) return null;
    var st = b._cl;
    if(!a.cl) a.cl = { style: st.style, motion: st.motion, mix: st.mix, title: st.title,
                       items: st.items.map(function(it){ var o = { id: it.id, r: it.r }; if(it.def) o.def = it.def; return o; }) };
    b._cl = C.stateOf(b, a);
    return a.cl;
  }
  function commit(b){
    var a = D.addedOf(slideOf(b)); if(a) b._cl = C.stateOf(b, a);
    D.saveAdded(); D.pingReload();
    render(b); paintBar();
  }
  // a picture's shape (width over height), from the picture itself
  var shapes = new Map();
  function shapeOf(src, cb){
    if(!src){ cb(null); return; }
    if(shapes.has(src)){ cb(shapes.get(src)); return; }
    var done = false;
    function fin(r){ if(done) return; done = true; if(r) shapes.set(src, r); cb(r); }
    if(D.isVideo(src)){
      var v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
      v.onloadedmetadata = function(){ fin(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null); v.removeAttribute('src'); try { v.load(); } catch(e){} };
      v.onerror = function(){ fin(null); };
      v.src = src;
    } else {
      var im = new Image();
      im.onload = function(){ fin(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : null); };
      im.onerror = function(){ fin(null); };
      im.src = src;
    }
    setTimeout(function(){ fin(null); }, 8000);
  }
  function round(r){ return Math.round(r * 10000) / 10000; }

  // ---------- adding, removing, swapping ----------
  function addFiles(b, list){
    var files = Array.prototype.filter.call(list || [], function(f){ return /^(image|video)\//.test(f.type); });
    if(!files.length || !editing()) return;
    var cl = own(b); if(!cl) return;
    var sid = slideOf(b).getAttribute('data-added'), got = new Array(files.length), left = files.length;
    files.forEach(function(f, j){
      D.mediaFromFile(f, function(src){
        shapeOf(src, function(r){
          got[j] = { src: src, r: r || 4 / 3 };
          if(--left) return;
          got.forEach(function(x){
            var it = { id: freshId(), r: round(x.r) };
            cl.items.push(it);
            var m = C.tileFor(it, sid); realSet(b).appendChild(m); D.setupTile(m);
            D.setMedia(sid + '.c' + it.id, x.src);
          });
          D.saveMedia(); commit(b); D.applyMedia();
          D.toast(files.length === 1 ? 'Picture added' : files.length + ' pictures added');
        });
      });
    });
  }
  D.collageRemove = function(m){
    var b = m.closest('.cl-board'), cl = b && own(b); if(!cl) return;
    var id = m.getAttribute('data-cid');
    cl.items = cl.items.filter(function(it){ return it.id !== id; });
    D.setMedia(m.getAttribute('data-mid'), null);
    m.remove();
    D.saveMedia(); commit(b);
    D.toast('Picture removed', true);                           // Undo puts it back
  };
  function swap(b, idA, idB){
    var cl = own(b); if(!cl) return;
    var ia = -1, ib = -1;
    cl.items.forEach(function(it, k){ if(it.id === idA) ia = k; if(it.id === idB) ib = k; });
    if(ia < 0 || ib < 0) return;
    var t = cl.items[ia]; cl.items[ia] = cl.items[ib]; cl.items[ib] = t;
    var set = realSet(b), tA = set.querySelector('[data-cid="' + idA + '"]'), tB = set.querySelector('[data-cid="' + idB + '"]');
    if(tA && tB){ var mark = document.createElement('i'); set.insertBefore(mark, tA); set.insertBefore(tA, tB); set.insertBefore(tB, mark); mark.remove(); }
    commit(b);
  }
  function setState(b, k, v){ var cl = own(b); if(!cl) return; cl[k] = v; commit(b); arm(D.current()); }

  // drag a picture onto another to swap them (Edit mode); the click that ends a drag isn't a click
  var drag = null;
  function scale(){ return stage.getBoundingClientRect().width / 1280 || 1; }
  stage.addEventListener('pointerdown', function(e){
    if(!editing() || e.button !== 0) return;
    var m = e.target.closest && e.target.closest('.cl-set:not(.cl-copy) > .cl-tile');
    if(!m || e.target.closest('.media-clear, .cl-lock')) return;
    drag = { m: m, b: m.closest('.cl-board'), x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, over: null };
  });
  document.addEventListener('pointermove', function(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if(!drag.moved && Math.hypot(dx, dy) < 7) return;
    if(!drag.moved){ drag.moved = true; drag.m.classList.add('cl-drag'); document.body.classList.add('cl-dragging'); }
    var k = scale();
    drag.m.style.setProperty('--dx', (dx / k) + 'px'); drag.m.style.setProperty('--dy', (dy / k) + 'px');
    var over = null, els = document.elementsFromPoint(e.clientX, e.clientY);
    for(var j = 0; j < els.length; j++){
      var t = els[j].closest && els[j].closest('.cl-set:not(.cl-copy) > .cl-tile');
      if(t && t !== drag.m && t.closest('.cl-board') === drag.b){ over = t; break; }
    }
    if(over !== drag.over){ if(drag.over) drag.over.classList.remove('cl-target'); drag.over = over; if(over) over.classList.add('cl-target'); }
  });
  function endDrag(e){
    if(!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    if(!d.moved) return;
    d.m.classList.remove('cl-drag'); document.body.classList.remove('cl-dragging');
    d.m.style.removeProperty('--dx'); d.m.style.removeProperty('--dy');
    if(d.over) d.over.classList.remove('cl-target');
    var swallow = function(ev){ ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
    window.addEventListener('click', swallow, true); setTimeout(function(){ window.removeEventListener('click', swallow, true); }, 60);
    if(d.over && e && e.type === 'pointerup') swap(d.b, d.m.getAttribute('data-cid'), d.over.getAttribute('data-cid'));
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // drop pictures from your computer onto the board
  function boardAt(e){ var b = e.target.closest && e.target.closest('.slide.active .cl-board'); return editing() ? b : null; }
  function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
  stage.addEventListener('dragover', function(e){ var b = boardAt(e); if(!b || !hasFiles(e)) return; e.preventDefault(); b.classList.add('cl-drop'); });
  stage.addEventListener('dragleave', function(e){ var b = boardAt(e); if(b && !b.contains(e.relatedTarget)) b.classList.remove('cl-drop'); });
  stage.addEventListener('drop', function(e){
    var b = boardAt(e); if(!b || !hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); b.classList.remove('cl-drop');
    addFiles(b, e.dataTransfer.files);
  });
  // an empty board in Edit mode: click it to add pictures
  stage.addEventListener('click', function(e){
    var b = boardAt(e); if(!b || !b.classList.contains('cl-none') || e.target.closest('.cl-tile')) return;
    pickFiles(b);
  });

  // ---------- the Edit bar's Moodboard group ----------
  var bar = document.getElementById('eb-collage'), fileIn = document.getElementById('cl-file');
  var NAMES = { mosaic: 'Mosaic', masonry: 'Masonry', scattered: 'Scattered', contact: 'Contact sheet',
                'static': 'Static', drift: 'Drift sideways', shuffle: 'Shuffle in place' };
  function curBoard(){ var s = D.current(); return s ? s.querySelector('.cl-board') : null; }
  function paintBar(){
    if(!bar) return;
    var b = curBoard(), on = editing() && !!b && !D.mirror;
    if(bar.hidden === on) bar.hidden = !on;
    if(!on){ closeMenus(); return; }
    var st = b._cl;
    [['cl-style', st.style], ['cl-motion', st.motion]].forEach(function(p){
      var btn = document.getElementById(p[0]), menu = document.getElementById(p[0] + '-menu');
      btn.querySelector('.pick-v').textContent = NAMES[p[1]];
      btn.setAttribute('data-tt', (p[0] === 'cl-style' ? 'Style: ' : 'Motion: ') + NAMES[p[1]]);
      var svg = menu.querySelector('[data-v="' + p[1] + '"] svg'), cur = btn.querySelector('svg:not(.chev)');
      if(svg && cur) cur.replaceWith(svg.cloneNode(true));
      Array.prototype.forEach.call(menu.querySelectorAll('[data-v]'), function(x){ x.setAttribute('aria-checked', String(x.getAttribute('data-v') === p[1])); });
    });
    var tb = document.getElementById('cl-title');
    tb.setAttribute('aria-pressed', String(st.title));
    tb.setAttribute('data-tt', st.title ? 'Hide the title' : 'Show the title');
  }
  function closeMenus(except){
    ['cl-style', 'cl-motion'].forEach(function(id){
      var menu = document.getElementById(id + '-menu'); if(!menu || menu === except) return;
      if(!menu.hidden) menu.hidden = true;
      document.getElementById(id).setAttribute('aria-expanded', 'false');
    });
  }
  ['cl-style', 'cl-motion'].forEach(function(id){
    var btn = document.getElementById(id), menu = document.getElementById(id + '-menu'); if(!btn || !menu) return;
    btn.addEventListener('click', function(e){
      e.stopPropagation(); closeMenus(menu);
      menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.addEventListener('click', function(e){
      var x = e.target.closest('[data-v]'), b = curBoard(); if(!x || !b) return;
      e.stopPropagation(); closeMenus();
      setState(b, id === 'cl-style' ? 'style' : 'motion', x.getAttribute('data-v'));
    });
  });
  document.addEventListener('click', function(e){ if(!(e.target.closest && e.target.closest('#eb-collage .eb-addwrap'))) closeMenus(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenus(); });
  function pickFiles(b){ if(!fileIn) return; fileIn._board = b; fileIn.value = ''; fileIn.click(); }
  if(fileIn) fileIn.addEventListener('change', function(){
    var b = fileIn._board || curBoard(), f = fileIn.files; fileIn._board = null;
    if(b && f && f.length) addFiles(b, Array.prototype.slice.call(f));
    fileIn.value = '';
  });
  function on(id, fn){ var el = document.getElementById(id); if(el) el.addEventListener('click', function(e){ e.stopPropagation(); var b = curBoard(); if(b) fn(b); }); }
  on('cl-add', pickFiles);
  on('cl-title', function(b){ setState(b, 'title', !b._cl.title); });
  on('cl-mix', function(b){ setState(b, 'mix', 1 + Math.floor(Math.random() * 99999)); });

  // ---------- keeping boards laid out ----------
  // a picture replaced in Edit mode may have another shape: the board takes it from the picture
  function checkShapes(b){
    if(!editing() || D.mirror) return;
    tiles(b).forEach(function(m){
      var mid = m.getAttribute('data-mid'); if(!mid || !D.mediaIsCustom(mid)) return;
      var src = D.tileSrc(m);
      if(!src || m._shapeOf === src) return;
      m._shapeOf = src;
      shapeOf(src, function(r){
        var it = b._cl.items.filter(function(x){ return x.id === m.getAttribute('data-cid'); })[0];
        if(!r || !it || Math.abs(r - it.r) / it.r < 0.03) return;
        var cl = own(b); if(!cl) return;
        cl.items.forEach(function(x){ if(x.id === it.id) x.r = round(r); });
        commit(b);
      });
    });
  }
  D.onMedia.push(function(){ boards().forEach(function(b){ if(!b._cl) return; checkShapes(b); render(b); }); });
  if(window.ResizeObserver){
    var ro = new ResizeObserver(function(list){ list.forEach(function(en){ if(en.target._cl) render(en.target); }); });
    boards().forEach(function(b){ ro.observe(b); });
  }
  // Edit mode shows every picture, still; leaving it puts the motion back
  var wasEditing = editing();
  new MutationObserver(function(){
    var now = editing(); if(now === wasEditing) return;
    wasEditing = now; renderAll(); paintBar(); arm(D.current());
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if(reduce.addEventListener) reduce.addEventListener('change', renderAll);

  renderAll(); paintBar(); arm(D.current());
})();
