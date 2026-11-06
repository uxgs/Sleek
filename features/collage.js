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
    syncTiles(b);
    if(shuffling(b)){
      var k = Math.max(1, Math.min(st.items.length - 1, K[st.style] || 9));
      b._slots = C.layout(st.style, 'fit', st.items.slice(0, k), W, H, st.mix).rects;
      b._turn = null;
      realSet(b).style.width = '';
      shuffleTo(b, true);
      return;
    }
    b._slots = null;
    var res = C.place(b, W, H, drifting(b) ? 'strip' : 'fit');
    if(drifting(b) && res){
      track.style.setProperty('--set', res.W + 'px');
      track.style.animationDuration = Math.max(8, res.W / SPEED) + 's';
      if(!editing() && res.W > 0) makeCopies(b, res.W, W);
    }
  }
  function renderAll(){ boards().forEach(render); }
  // ---------- each picture's own settings: Fill / Fit / Crop, and Masonry's 16:9 lock ----------
  // The tile carries them as attributes (the layout reads them as it places it), and Edit mode
  // puts a small switch on it that opens a menu.
  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  var FIT_SVG = {
    fill: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2 10.5l3.5-3 3 2.5 2-1.5 3.5 2.5"/></svg>',
    fit: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><rect x="5" y="5.5" width="6" height="5" rx=".8"/></svg>',
    crop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1.5v10h10"/><path d="M1.5 4.5h10v10"/></svg>'
  };
  var FIT_NAMES = { fill: 'Fill', fit: 'Fit', crop: 'Crop' };
  function fitOf(it){ return it && (it.fit === 'fit' || it.fit === 'crop') ? it.fit : 'fill'; }
  function syncTiles(b){
    var masonry = b._cl.style === 'masonry';
    tiles(b).forEach(function(m){
      var it = itemOf(b, m); if(!it) return;
      var f = fitOf(it);
      if(f === 'fill') m.removeAttribute('data-fit'); else m.setAttribute('data-fit', f);
      m.setAttribute('data-r', String(+it.r || 4 / 3));
      ['z', 'cx', 'cy'].forEach(function(k){ if(it[k] != null) m.setAttribute('data-' + k, String(it[k])); else m.removeAttribute('data-' + k); });
      if(crop && crop.m === m) return;                          // the crop being made keeps its live values
      var k = m.querySelector(':scope > .cl-opt');
      if(!k){
        k = document.createElement('button'); k.type = 'button'; k.className = 'cl-opt';
        k.setAttribute('aria-haspopup', 'menu');
        k.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
        k.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openTileMenu(b, m, k); });
        m.appendChild(k);
      }
      var locked = masonry && !!it.lock;
      k.innerHTML = (locked ? LOCK_SVG + '<span>16:9</span>' + (f !== 'fill' ? '<i></i>' : '') : '') +
                    (!locked || f !== 'fill' ? (locked ? '' : FIT_SVG[f]) + '<span>' + FIT_NAMES[f] + '</span>' : '');
      k.setAttribute('data-set', String(locked || f !== 'fill'));
      k.setAttribute('aria-label', 'Picture: ' + FIT_NAMES[f] + (locked ? ', locked to 16:9' : ''));
      k.title = 'Fill, fit or crop this picture' + (masonry ? ', or lock it to 16:9' : '');
    });
  }
  // the menu behind a tile's switch (one, shared, on the page)
  var tmenu = null, tmenuFor = null;
  function openTileMenu(b, m, btn){
    if(tmenu && tmenuFor === m){ closeTileMenu(); return; }
    closeTileMenu(); closeMenus();
    var it = itemOf(b, m); if(!it) return;
    var f = fitOf(it), masonry = b._cl.style === 'masonry';
    function row(v, label, sub, checked, role){
      return '<button type="button" role="' + role + '" data-v="' + v + '" aria-checked="' + checked + '">' +
        (v === 'lock' ? LOCK_SVG : FIT_SVG[v]) + '<span><b>' + label + '</b><em>' + sub + '</em></span></button>';
    }
    tmenu = document.createElement('div'); tmenu.className = 'cl-tmenu'; tmenu.setAttribute('role', 'menu');
    tmenu.innerHTML = row('fill', 'Fill', 'Fills the tile; the edges may be cut off', f === 'fill', 'menuitemradio') +
      row('fit', 'Fit', 'Shows all of it', f === 'fit', 'menuitemradio') +
      row('crop', 'Crop…', 'Zoom in and choose what shows', f === 'crop', 'menuitemradio') +
      (masonry ? '<hr>' + row('lock', 'Lock to 16:9', 'Keeps this tile 16:9 in the column', !!it.lock, 'menuitemcheckbox') : '');
    document.body.appendChild(tmenu); tmenuFor = m; btn.setAttribute('aria-expanded', 'true');
    var r = btn.getBoundingClientRect(), mw = tmenu.offsetWidth, mh = tmenu.offsetHeight;
    var x = Math.min(Math.max(8, r.left), innerWidth - mw - 8), y = r.bottom + 6;
    if(y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    tmenu.style.left = x + 'px'; tmenu.style.top = y + 'px';
    requestAnimationFrame(function(){ if(tmenu) tmenu.classList.add('in'); });
    tmenu.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    tmenu.addEventListener('click', function(e){
      var x = e.target.closest('[data-v]'); if(!x) return;
      e.stopPropagation();
      var v = x.getAttribute('data-v'); closeTileMenu();
      var cl = own(b); if(!cl) return;
      var id = m.getAttribute('data-cid'), t = cl.items.filter(function(i){ return i.id === id; })[0]; if(!t) return;
      if(v === 'lock'){
        if(t.lock) delete t.lock; else t.lock = true;
        commit(b); D.toast(t.lock ? 'Locked to 16:9' : 'Unlocked'); return;
      }
      var prev = t.fit;
      if(v === 'fill') delete t.fit; else t.fit = v;
      commit(b);
      if(v === 'crop') startCrop(b, m, prev);
    });
  }
  function closeTileMenu(){
    if(!tmenu) return;
    var n = tmenu, k = tmenuFor && tmenuFor.querySelector(':scope > .cl-opt'); tmenu = null; tmenuFor = null;
    if(k) k.setAttribute('aria-expanded', 'false');
    n.classList.remove('in'); setTimeout(function(){ n.remove(); }, 160);
  }
  document.addEventListener('pointerdown', function(e){
    if(!tmenu || tmenu.contains(e.target)) return;
    var own = e.target.closest && e.target.closest('.cl-opt');
    if(own && tmenuFor && tmenuFor.contains(own)) return;     // its own switch: the click closes it
    closeTileMenu();
  }, true);

  // ---------- Crop: drag the picture to choose what shows, the wheel or the slider to zoom ----------
  var crop = null, START_ZOOM = 1.3;
  function startCrop(b, m, prevFit){
    endCrop(true);
    var it = itemOf(b, m); if(!it) return;
    // a new crop starts zoomed in a little, so there's picture to move up, down, left and right
    crop = { b: b, m: m, z: it.z != null ? +it.z || 1 : START_ZOOM, cx: it.cx != null ? +it.cx : 50, cy: it.cy != null ? +it.cy : 50 };
    crop.was = { z: it.z, cx: it.cx, cy: it.cy, fit: prevFit === undefined ? it.fit : prevFit };
    m.classList.add('cl-cropping'); b.classList.add('cl-cropmode');
    var src = D.tileSrc(m);
    if(src && !D.isVideo(src)){                                // the rest of the picture, faint, around the tile
      crop.ghost = document.createElement('div'); crop.ghost.className = 'cl-ghost';
      crop.ghost.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
      m.parentNode.appendChild(crop.ghost);
    }
    var bar = crop.bar = document.createElement('div'); bar.className = 'cl-cropbar';
    bar.innerHTML = '<span class="cl-cb-k">Crop</span>' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/></svg>' +
      '<input type="range" min="1" max="4" step="0.01" aria-label="Zoom">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4"/></svg>' +
      '<button type="button" data-a="reset">Reset</button><button type="button" class="on" data-a="done">Done</button>';
    document.body.appendChild(bar);
    var zr = bar.querySelector('input'); zr.value = crop.z;
    zr.addEventListener('input', function(){ if(crop){ crop.z = +zr.value; paintCrop(); } });
    bar.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    bar.addEventListener('click', function(e){
      e.stopPropagation();
      var a = e.target.closest('[data-a]'); if(!a || !crop) return;
      if(a.getAttribute('data-a') === 'reset'){ crop.z = START_ZOOM; crop.cx = 50; crop.cy = 50; zr.value = START_ZOOM; paintCrop(); }
      else endCrop(true);
    });
    paintCrop();
    requestAnimationFrame(function(){ if(crop && crop.bar === bar) bar.classList.add('in'); });
    D.toast('Drag it up, down or sideways; scroll to zoom');
  }
  // the crop's size of picture beyond the tile, in slide px, at the current zoom
  function cropExtra(){
    var m = crop.m, w = m._fw || m.clientWidth, h = m._fh || m.clientHeight, ir = +m.getAttribute('data-r') || 4 / 3, tr = w / h, z = crop.z;
    var iw = (ir > tr ? z * ir / tr : z) * w, ih = (ir > tr ? z : z * tr / ir) * h;
    return { w: w, h: h, iw: iw, ih: ih, x: iw - w, y: ih - h };
  }
  function paintCrop(){
    if(!crop) return;
    var m = crop.m;
    m.setAttribute('data-z', crop.z.toFixed(3)); m.setAttribute('data-cx', crop.cx.toFixed(2)); m.setAttribute('data-cy', crop.cy.toFixed(2));
    C.fitTile(m);
    var e = cropExtra();
    if(crop.ghost){
      var bl = m.clientLeft || 0, bt = m.clientTop || 0, g = crop.ghost.style;
      g.left = (m.offsetLeft + bl - e.x * crop.cx / 100) + 'px'; g.top = (m.offsetTop + bt - e.y * crop.cy / 100) + 'px';
      g.width = e.iw + 'px'; g.height = e.ih + 'px';
    }
    if(crop.bar){
      var r = m.getBoundingClientRect(), bw = crop.bar.offsetWidth, bh = crop.bar.offsetHeight;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), innerWidth - bw - 8), y = r.bottom + 12;
      if(y + bh > innerHeight - 70) y = Math.max(8, r.top - bh - 12);
      if(y < 8) y = r.top + 12;
      crop.bar.style.left = x + 'px'; crop.bar.style.top = y + 'px';
    }
  }
  function endCrop(save){
    if(!crop) return;
    var c = crop; crop = null;
    c.m.classList.remove('cl-cropping'); c.b.classList.remove('cl-cropmode');
    if(c.ghost) c.ghost.remove();
    if(c.bar){ var bar = c.bar; bar.classList.remove('in'); setTimeout(function(){ bar.remove(); }, 180); }
    var cl = own(c.b), id = c.m.getAttribute('data-cid'), t = cl && cl.items.filter(function(i){ return i.id === id; })[0];
    if(t && save){ t.fit = 'crop'; t.z = Math.round(c.z * 1000) / 1000; t.cx = Math.round(c.cx * 10) / 10; t.cy = Math.round(c.cy * 10) / 10; }
    else if(t){ ['z', 'cx', 'cy', 'fit'].forEach(function(k){ if(c.was[k] == null) delete t[k]; else t[k] = c.was[k]; }); }   // Esc: as it was
    commit(c.b);
  }
  var pan = null;
  stage.addEventListener('pointerdown', function(e){
    if(!crop || e.button !== 0) return;
    if(!crop.m.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    pan = { x: e.clientX, y: e.clientY, id: e.pointerId };
    crop.m.classList.add('cl-panning');
    try { crop.m.setPointerCapture(e.pointerId); } catch(_){}
  }, true);
  document.addEventListener('pointermove', function(e){
    if(!pan || !crop || e.pointerId !== pan.id) return;
    var k = scale(), dx = (e.clientX - pan.x) / k, dy = (e.clientY - pan.y) / k, ex = cropExtra();
    pan.x = e.clientX; pan.y = e.clientY;
    if(ex.x > 0.5) crop.cx = Math.max(0, Math.min(100, crop.cx - dx / ex.x * 100));
    if(ex.y > 0.5) crop.cy = Math.max(0, Math.min(100, crop.cy - dy / ex.y * 100));
    paintCrop();
  });
  function endPan(e){ if(pan && (!e || e.pointerId === pan.id)){ pan = null; if(crop) crop.m.classList.remove('cl-panning'); } }
  document.addEventListener('pointerup', endPan); document.addEventListener('pointercancel', endPan);
  stage.addEventListener('wheel', function(e){
    if(!crop || !crop.m.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    crop.z = Math.max(1, Math.min(4, crop.z * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025))));
    crop.bar.querySelector('input').value = crop.z;
    paintCrop();
  }, { passive: false, capture: true });
  // while cropping, a click on the picture isn't "replace it", and a click anywhere else finishes
  document.addEventListener('click', function(e){
    if(!crop) return;
    if(crop.bar && crop.bar.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if(!crop.m.contains(e.target)) endCrop(true);
  }, true);
  document.addEventListener('keydown', function(e){
    if(!crop) return;
    if(e.key === 'Escape' || e.key === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); endCrop(e.key === 'Enter'); }
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if(d){                                                   // the arrows move the picture a little (Shift: more)
      e.preventDefault(); e.stopImmediatePropagation();
      var ex = cropExtra(), step = e.shiftKey ? 40 : 8;
      if(ex.x > 0.5) crop.cx = Math.max(0, Math.min(100, crop.cx - d[0] * step / ex.x * 100));
      if(ex.y > 0.5) crop.cy = Math.max(0, Math.min(100, crop.cy - d[1] * step / ex.y * 100));
      paintCrop();
    }
  }, true);

  // drift: copies of the set after it, enough to fill the board while it moves one set to the left
  function makeCopies(b, setW, viewW){
    var real = realSet(b), n = Math.max(1, Math.ceil(viewW / setW));
    for(var k = 0; k < n; k++){
      var c = real.cloneNode(true);
      c.classList.add('cl-copy'); c.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(c.querySelectorAll('.media-clear, .media-before, .cl-opt'), function(el){ el.remove(); });
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
  D.onShow.push(function(s){ closeTileMenu(); endCrop(true); arm(s); paintBar(); });

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
    var files = Array.prototype.filter.call(list || [], function(f){ return !!D.fileKind(f); });
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
          var nv = files.filter(function(f){ return /^video/.test(D.fileKind(f)); }).length, n = files.length;
          D.toast(n === 1 ? (nv ? 'Video added' : 'Picture added')
                          : n + (nv === n ? ' videos' : nv ? ' pictures and videos' : ' pictures') + ' added');
        });
      });
    });
  }
  D.collageRemove = function(m){
    var b = m.closest('.cl-board'), cl = b && own(b); if(!cl) return;
    var id = m.getAttribute('data-cid'), wasVideo = !!m.querySelector(':scope > video');
    cl.items = cl.items.filter(function(it){ return it.id !== id; });
    D.setMedia(m.getAttribute('data-mid'), null);
    m.remove();
    D.saveMedia(); commit(b);
    D.toast(wasVideo ? 'Video removed' : 'Picture removed', true);                           // Undo puts it back
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
    if(!m || crop || e.target.closest('.media-clear, .cl-opt')) return;
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

  // ---------- drift: moving the strip by hand ----------
  // With the pointer over a drifting board the strip holds still; the wheel, a sideways trackpad
  // swipe or a drag moves it left and right, and it carries on drifting from there when the pointer
  // leaves. (In Edit mode, or with reduced motion, the board is a plain scroller: the wheel scrolls it.)
  function driftAnim(b){
    var t = b.querySelector('.cl-track'); if(!t || !t.getAnimations) return null;
    return t.getAnimations().filter(function(a){ return a.animationName === 'cl-drift'; })[0] || null;
  }
  function nudge(b, px){                                     // px in slide pixels; more than 0 moves the pictures left
    if(editing() || reduce.matches){ b.scrollLeft += px; return; }
    var a = driftAnim(b), set = parseFloat(b.querySelector('.cl-track').style.getPropertyValue('--set')) || 0;
    if(!a || !set) return;
    var dur = a.effect.getComputedTiming().duration; if(!dur || !isFinite(dur)) return;
    var t = ((a.currentTime || 0) + px / set * dur) % dur;
    a.currentTime = t < 0 ? t + dur : t;
  }
  function driftAt(e){
    var b = e.target.closest && e.target.closest('.slide.active .cl-board.cl-drift');
    return b && !document.body.classList.contains('deck-modal') ? b : null;
  }
  stage.addEventListener('wheel', function(e){
    var b = driftAt(e); if(!b) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if(!d) return;
    if((editing() || reduce.matches) && b.scrollWidth <= b.clientWidth + 1) return;
    e.preventDefault();
    nudge(b, d * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? b.clientWidth : 1) / scale());
  }, { passive: false });
  var scrub = null, scrubbed = 0;
  stage.addEventListener('pointerdown', function(e){
    if(editing() || e.button !== 0 || e.pointerType === 'touch') return;
    var b = driftAt(e); if(!b) return;
    scrub = { b: b, x: e.clientX, last: e.clientX, id: e.pointerId, moved: false };
  });
  document.addEventListener('pointermove', function(e){
    if(!scrub || e.pointerId !== scrub.id) return;
    if(!scrub.moved && Math.abs(e.clientX - scrub.x) < 6) return;
    if(!scrub.moved){ scrub.moved = true; scrub.b.classList.add('cl-scrub'); document.body.classList.add('cl-scrubbing'); }
    nudge(scrub.b, (scrub.last - e.clientX) / scale()); scrub.last = e.clientX;
  });
  function endScrub(e){
    if(!scrub || (e && e.pointerId !== scrub.id)) return;
    if(scrub.moved){ scrubbed = Date.now(); scrub.b.classList.remove('cl-scrub'); document.body.classList.remove('cl-scrubbing'); }
    scrub = null;
  }
  document.addEventListener('pointerup', endScrub);
  document.addEventListener('pointercancel', endScrub);
  // the click that ends a drag doesn't open the picture
  document.addEventListener('click', function(e){
    if(Date.now() - scrubbed < 400 && e.target.closest && e.target.closest('.cl-board')){ e.preventDefault(); e.stopPropagation(); scrubbed = 0; }
  }, true);

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
    openPicker(b);
  });

  // ---------- Add media: what's in the deck already, or new files ----------
  function esc(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // every picture and video on the deck's slides (once each), in deck order, by slide
  function deckMedia(b){
    var seen = {}, out = [];
    Array.prototype.forEach.call(stage.querySelectorAll('.slide:not(.s-screen) .media[data-mid], .slide .fl-pic[data-mid]'), function(m){
      if(m.closest('.car-copy, .fs-copy, .cl-copy') || (b && b.contains(m))) return;
      var src = m.classList.contains('fl-pic') ? D.mediaOf(m.getAttribute('data-mid')) : D.tileSrc(m); if(!src || src === 'none' || seen[src]) return;
      var mid = m.getAttribute('data-mid'), def = m.getAttribute('data-default-src');
      seen[src] = true;
      var s = m.closest('.slide'), c = m.querySelector('.cap');
      out.push({ src: src, def: def && !D.mediaIsCustom(mid) ? def : null, video: D.isVideo(src),
                 slide: (s && s.getAttribute('data-label')) || 'Slide', cap: c ? c.textContent.trim() : '' });
    });
    // pictures already on this board don't need adding again
    var mine = {}; if(b) tiles(b).forEach(function(m){ var x = D.tileSrc(m); if(x) mine[x] = true; });
    return out.filter(function(x){ return !mine[x.src]; });
  }
  var mp = null;
  function openPicker(b){
    pickMedia({ board: b, kicker: 'Moodboard',
      onChosen: function(list){ addChosen(b, list); }, onFiles: function(files){ addFiles(b, files); } });
  }
  // The Add media window: every picture and video in the deck (pick several), or upload new ones.
  // Moodboards use it, and so does Edit mode's Image button (features/floats.js) as Deck.pickMedia.
  function pickMedia(o){
    if(mp || !editing()) return;
    closeMenus(); closeTileMenu();
    var b = o.board || null, list = deckMedia(b), groups = [], prevFocus = document.activeElement;
    list.forEach(function(c, j){ c.k = j; var g = groups[groups.length - 1]; if(!g || g.slide !== c.slide){ g = { slide: c.slide, items: [] }; groups.push(g); } g.items.push(c); });
    var el = document.createElement('div'); el.className = 'bp-backdrop cl-mp';
    el.innerHTML = '<div class="bp-modal" role="dialog" aria-modal="true" aria-label="Add media">' +
      '<button type="button" class="bp-close" data-close aria-label="Close">×</button>' +
      '<div class="bp-head"><div class="bp-copy"><div class="bp-k">' + esc(o.kicker || 'Add media') + '</div><h2 class="bp-h">' + esc(o.title || 'Add media') + '</h2>' +
        '<p class="bp-p">' + esc(o.text || 'Pick pictures and videos from this deck, or upload new ones. You can pick as many as you like.') + '</p>' +
        '<div class="bp-actions"><label class="bp-btn ghost"><input type="file" accept="image/*,video/*"' + (o.single ? '' : ' multiple') + ' hidden>Upload from your computer…</label>' +
          (o.onRemove ? '<button type="button" class="bp-btn ghost" data-remove>' + esc(o.removeLabel || 'Remove') + '</button>' : '') + '</div>' +
      '</div></div>' +
      '<div class="bp-body">' + (groups.length ? groups.map(function(g){
        return '<div class="bp-group"><div class="bp-slide">' + esc(g.slide) + '</div><div class="bp-grid">' + g.items.map(function(c){
          return '<button type="button" class="bp-tile" style="--i:' + c.k + '" data-k="' + c.k + '" aria-pressed="false" aria-label="' + esc((c.cap || (c.video ? 'Video' : 'Picture')) + ', ' + g.slide) + '">' +
            (c.video ? '<span class="bp-shot cl-mp-vid"><video muted playsinline preload="metadata" src="' + esc(c.src.split('#')[0]) + '#t=0.5"></video><i>Video</i></span>'
                     : '<span class="bp-shot" style="background-image:url(&quot;' + esc(c.src) + '&quot;)"></span>') +
            (c.cap ? '<span class="bp-cap">' + esc(c.cap) + '</span>' : '') + '</button>';
        }).join('') + '</div></div>';
      }).join('') : '<p class="bp-empty">' + (b ? 'Everything in the deck is on this board already.' : 'There are no pictures in the deck yet.') + ' Upload something new instead.</p>') + '</div>' +
      (o.single ? '' : '<div class="cl-mp-foot"><span class="cl-mp-n">Nothing picked</span><button type="button" class="bp-btn ghost" data-close>Cancel</button>' +
        '<button type="button" class="bp-btn primary" data-add disabled>Add</button></div>') +
      '</div>';
    document.body.appendChild(el);
    mp = { el: el, o: o, list: list, picked: [] };
    function paint(){
      if(o.single) return;
      var n = mp.picked.length, v = mp.picked.filter(function(k){ return list[k].video; }).length;
      el.querySelector('.cl-mp-n').textContent = !n ? 'Nothing picked' : n + ' picked';
      var add = el.querySelector('[data-add]'); add.disabled = !n;
      add.textContent = !n ? 'Add' : 'Add ' + n + (v === n ? (n === 1 ? ' video' : ' videos') : v ? '' : (n === 1 ? ' picture' : ' pictures'));
    }
    function close(){
      if(!mp) return;
      var node = mp.el; mp = null;
      document.removeEventListener('keydown', onKey, true);
      node.classList.remove('in'); node.classList.add('out');
      setTimeout(function(){ node.remove(); }, 380);
      if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    }
    function onKey(e){
      if(!mp) return;
      e.stopImmediatePropagation();
      if(e.key === 'Escape'){ e.preventDefault(); close(); }
    }
    el.addEventListener('click', function(e){
      if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
      if(e.target.closest('[data-add]')){
        var chosen = mp.picked.map(function(k){ return list[k]; }), oo = mp.o; close();
        if(chosen.length && oo.onChosen) oo.onChosen(chosen); return;
      }
      if(e.target.closest('[data-remove]')){ var or = mp.o; close(); or.onRemove(); return; }
      var t = e.target.closest('.bp-tile'); if(!t) return;
      if(o.single){ var one = list[+t.getAttribute('data-k')], os = mp.o; close(); if(one && os.onChosen) os.onChosen([one]); return; }
      var k = +t.getAttribute('data-k'), at = mp.picked.indexOf(k);
      if(at > -1) mp.picked.splice(at, 1); else mp.picked.push(k);
      t.classList.toggle('on', at < 0); t.setAttribute('aria-pressed', String(at < 0));
      paint();
    });
    el.querySelector('input[type=file]').addEventListener('change', function(e){
      var f = e.target.files, oo = mp && mp.o; if(!f || !f.length || !oo) return;
      var files = Array.prototype.slice.call(f).filter(function(x){ return !!D.fileKind(x); }); close();
      if(files.length && oo.onFiles) oo.onFiles(files);
    });
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(mp && mp.el === el) el.classList.add('in'); }); });
  }
  D.pickMedia = pickMedia;
  D.shapeOf = shapeOf;
  // what was picked from the deck goes on the end of the board; sample art stays sample art (it takes the deck's colour)
  function addChosen(b, chosen){
    if(!chosen.length) return;
    var cl = own(b); if(!cl) return;
    var sid = slideOf(b).getAttribute('data-added'), got = new Array(chosen.length), left = chosen.length;
    chosen.forEach(function(c, j){
      shapeOf(c.src, function(r){
        got[j] = { c: c, r: r || 4 / 3 };
        if(--left) return;
        got.forEach(function(x){
          var it = { id: freshId(), r: round(x.r) };
          if(x.c.def) it.def = x.c.def;
          cl.items.push(it);
          var m = C.tileFor(it, sid); realSet(b).appendChild(m); D.setupTile(m);
          if(!x.c.def) D.setMedia(sid + '.c' + it.id, x.c.src);
        });
        D.saveMedia(); commit(b); D.applyMedia();
        var nv = chosen.filter(function(c){ return c.video; }).length, n = chosen.length;
        D.toast(n === 1 ? (nv ? 'Video added' : 'Picture added') : n + (nv === n ? ' videos' : nv ? ' pictures and videos' : ' pictures') + ' added');
      });
    });
  }

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
  if(fileIn) fileIn.addEventListener('change', function(){
    var b = fileIn._board || curBoard(), f = fileIn.files; fileIn._board = null;
    if(b && f && f.length) addFiles(b, Array.prototype.slice.call(f));
    fileIn.value = '';
  });
  function on(id, fn){ var el = document.getElementById(id); if(el) el.addEventListener('click', function(e){ e.stopPropagation(); var b = curBoard(); if(b) fn(b); }); }
  on('cl-add', openPicker);
  on('cl-title', function(b){ setState(b, 'title', !b._cl.title); });
  on('cl-mix', function(b){
    if(b._cl.style !== 'masonry' || b._cl.items.length < 2){ setState(b, 'mix', 1 + Math.floor(Math.random() * 99999)); return; }
    // Masonry places pictures in their order, so a remix is a new order
    var cl = own(b); if(!cl) return;
    var before = cl.items.map(function(i){ return i.id; }).join(), list = cl.items.slice();
    for(var tries = 0; tries < 8 && list.map(function(i){ return i.id; }).join() === before; tries++){
      for(var j = list.length - 1; j > 0; j--){ var r = Math.floor(Math.random() * (j + 1)), t = list[j]; list[j] = list[r]; list[r] = t; }
    }
    cl.items = list; commit(b);
  });

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
    wasEditing = now; if(!now){ closeTileMenu(); endCrop(true); } renderAll(); paintBar(); arm(D.current());
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if(reduce.addEventListener) reduce.addEventListener('change', renderAll);

  renderAll(); paintBar(); arm(D.current());
})();
