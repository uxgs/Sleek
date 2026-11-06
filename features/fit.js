/* Fill, Fit or Crop: how a picture (or video) sits in its frame, for every picture tile on every slide.
   Fill covers the frame (the edges may be cut off), Fit shows all of it on a quiet mat, Crop is your own
   zoom and spot: drag the picture, scroll or slide to zoom, the arrows nudge, Enter or Done keeps it, Esc
   puts it back.

   The switch, its menu and the crop editor are shared (Deck.fitUI). Each kind of frame says where its
   choice lives through a host:
     { scope,            the element that steps back while you crop (a moodboard, or the slide)
       get(),            { fit, z, cx, cy } now
       set(o),           keep { fit, z, cx, cy } (a missing one goes) and paint it
       paint(m),         paint the frame's crop from its data-z / data-cx / data-cy
       extra, onExtra }  more rows for the menu (a Masonry picture's 16:9 lock)
   A moodboard keeps its choice on its own item (features/collage.js). Every other tile keeps it in the
   deck's fits, by the tile's media id (app.js paints it as it paints the picture). Painting itself is
   SleekCollage.fitTile, from data-fit / data-r / data-z / data-cx / data-cy on the frame. */
(function(){
  var D = window.Deck, C = window.SleekCollage; if(!D || !C || D.popout) return;
  var stage = D.stage;

  var LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  var SVG = {
    fill: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2 10.5l3.5-3 3 2.5 2-1.5 3.5 2.5"/></svg>',
    fit: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><rect x="5" y="5.5" width="6" height="5" rx=".8"/></svg>',
    crop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1.5v10h10"/><path d="M1.5 4.5h10v10"/></svg>'
  };
  var NAMES = { fill: 'Fill', fit: 'Fit', crop: 'Crop' };
  var PLATE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2.5" stroke-dasharray="2 1.6"/><rect x="4.5" y="5.5" width="7" height="5" rx="1"/></svg>';
  function fitName(f){ return f === 'fit' || f === 'crop' ? f : 'fill'; }
  function editing(){ return document.body.classList.contains('editing'); }
  function scale(){ return stage.getBoundingClientRect().width / 1280 || 1; }
  function num(v){ return v == null || v === '' ? undefined : +v; }

  // ---------- the switch's menu (one, shared, on the page) ----------
  var tmenu = null, tmenuFor = null;
  function open(m, btn, host){
    if(tmenu && tmenuFor === m){ close(); return; }
    close();
    var cur = host.get(), f = fitName(cur.fit);
    function row(v, label, sub, checked, role, svg){
      return '<button type="button" role="' + role + '" data-v="' + v + '" aria-checked="' + checked + '">' +
        (svg || SVG[v]) + '<span><b>' + label + '</b><em>' + sub + '</em></span></button>';
    }
    tmenu = document.createElement('div'); tmenu.className = 'cl-tmenu'; tmenu.setAttribute('role', 'menu');
    tmenu.innerHTML = row('fill', 'Fill', 'Fills the frame; the edges may be cut off', f === 'fill', 'menuitemradio') +
      row('fit', 'Fit', 'Shows all of it', f === 'fit', 'menuitemradio') +
      row('crop', 'Crop…', 'Zoom in and choose what shows', f === 'crop', 'menuitemradio') +
      (host.extra || []).map(function(x, j){ return (j ? '' : '<hr>') + row('x:' + x.v, x.label, x.sub, !!x.checked, 'menuitemcheckbox', x.svg); }).join('');
    document.body.appendChild(tmenu); tmenuFor = m; btn.setAttribute('aria-expanded', 'true');
    var r = btn.getBoundingClientRect(), mw = tmenu.offsetWidth, mh = tmenu.offsetHeight;
    var x = Math.min(Math.max(8, r.left), innerWidth - mw - 8), y = r.bottom + 6;
    if(y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    tmenu.style.left = x + 'px'; tmenu.style.top = y + 'px';
    requestAnimationFrame(function(){ if(tmenu) tmenu.classList.add('in'); });
    tmenu.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    tmenu.addEventListener('click', function(e){
      var b = e.target.closest('[data-v]'); if(!b) return;
      e.stopPropagation();
      var v = b.getAttribute('data-v'); close();
      if(v.indexOf('x:') === 0){ if(host.onExtra) host.onExtra(v.slice(2)); return; }
      var was = host.get();
      host.set({ fit: v === 'fill' ? undefined : v, z: was.z, cx: was.cx, cy: was.cy });   // a crop you made stays for next time
      if(v === 'crop') startCrop(m, host, was);
    });
  }
  function close(){
    if(!tmenu) return;
    var n = tmenu, k = tmenuFor && tmenuFor.querySelector(':scope > .cl-opt'); tmenu = null; tmenuFor = null;
    if(k) k.setAttribute('aria-expanded', 'false');
    n.classList.remove('in'); setTimeout(function(){ n.remove(); }, 160);
  }
  document.addEventListener('pointerdown', function(e){
    if(!tmenu || tmenu.contains(e.target)) return;
    var own = e.target.closest && e.target.closest('.cl-opt');
    if(own && tmenuFor && tmenuFor.contains(own)) return;     // its own switch: the click closes it
    close();
  }, true);

  // ---------- Crop: drag the picture to choose what shows, the wheel or the slider to zoom ----------
  var crop = null, START_ZOOM = 1.3;
  function startCrop(m, host, was){
    endCrop(true);
    var cur = host.get();
    // a new crop starts zoomed in a little, so there's picture to move up, down, left and right
    crop = { m: m, host: host, z: cur.z != null ? +cur.z || 1 : START_ZOOM, cx: cur.cx != null ? +cur.cx : 50, cy: cur.cy != null ? +cur.cy : 50 };
    crop.was = was || cur;
    m.classList.add('cl-cropping'); if(host.scope) host.scope.classList.add('cl-cropmode');
    var src = D.tileSrc(m);
    if(src && !m.getAttribute('data-r') && D.shapeOf) D.shapeOf(src, function(r){   // its shape, for how far it can move
      if(r && crop && crop.m === m){ m.setAttribute('data-r', String(r)); paintCrop(); }
    });
    if(src && !D.isVideo(src)){                                // the rest of the picture, faint, around the frame
      crop.ghost = document.createElement('div'); crop.ghost.className = 'cl-ghost';
      crop.ghost.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
      (m.offsetParent || m.parentNode).appendChild(crop.ghost);
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
  // the crop's size of picture beyond the frame, in slide px, at the current zoom
  function cropExtra(){
    var m = crop.m, w = m._fw || m.clientWidth, h = m._fh || m.clientHeight, ir = +m.getAttribute('data-r') || 4 / 3, tr = w / h, z = crop.z;
    var iw = (ir > tr ? z * ir / tr : z) * w, ih = (ir > tr ? z : z * tr / ir) * h;
    return { w: w, h: h, iw: iw, ih: ih, x: iw - w, y: ih - h };
  }
  function paintCrop(){
    if(!crop) return;
    var m = crop.m;
    m.setAttribute('data-fit', 'crop');
    m.setAttribute('data-z', crop.z.toFixed(3)); m.setAttribute('data-cx', crop.cx.toFixed(2)); m.setAttribute('data-cy', crop.cy.toFixed(2));
    crop.host.paint(m);
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
    c.m.classList.remove('cl-cropping', 'cl-panning'); if(c.host.scope) c.host.scope.classList.remove('cl-cropmode');
    if(c.ghost) c.ghost.remove();
    if(c.bar){ var bar = c.bar; bar.classList.remove('in'); setTimeout(function(){ bar.remove(); }, 180); }
    if(save) c.host.set({ fit: 'crop', z: Math.round(c.z * 1000) / 1000, cx: Math.round(c.cx * 10) / 10, cy: Math.round(c.cy * 10) / 10 });
    else c.host.set(c.was);                                    // Esc: as it was
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
    if(e.key === 'Escape' || e.key === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); endCrop(e.key === 'Enter'); return; }
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if(d){                                                   // the arrows move the picture a little (Shift: more)
      e.preventDefault(); e.stopImmediatePropagation();
      var ex = cropExtra(), step = e.shiftKey ? 40 : 8;
      if(ex.x > 0.5) crop.cx = Math.max(0, Math.min(100, crop.cx - d[0] * step / ex.x * 100));
      if(ex.y > 0.5) crop.cy = Math.max(0, Math.min(100, crop.cy - d[1] * step / ex.y * 100));
      paintCrop();
    }
  }, true);

  D.fitUI = { open: open, close: close, startCrop: startCrop, endCrop: endCrop,
              cropping: function(){ return crop ? crop.m : null; }, SVG: SVG, NAMES: NAMES, LOCK_SVG: LOCK_SVG, name: fitName };

  // ---------- every other picture tile: its switch, and its choice in the deck's fits ----------
  function tileHost(m){
    var mid = m.getAttribute('data-mid');
    return {
      scope: m.closest('.slide'),
      get: function(){ var o = D.fitOf(mid) || {}; return { fit: o.fit, z: num(o.z), cx: num(o.cx), cy: num(o.cy) }; },
      set: function(o){ D.setFit(mid, o); },
      paint: function(t){ C.fitTile(t, t.clientWidth, t.clientHeight); },
      // the tile behind the picture (its border, and Fit's mat): off, and the picture sits alone on the slide
      extra: [{ v: 'bare', label: 'Backplate', sub: 'The tile behind the picture', checked: !(D.fitOf(mid) || {}).bare, svg: PLATE_SVG }],
      onExtra: function(){ var bare = !(D.fitOf(mid) || {}).bare; D.setFit(mid, Object.assign(this.get(), { bare: bare })); D.toast(bare ? 'Backplate off' : 'Backplate on'); }
    };
  }
  function realTiles(){
    return Array.prototype.filter.call(stage.querySelectorAll('.slide:not(.s-screen) .media[data-mid]:not(.cl-tile)'), function(m){
      return !m.closest('.car-copy, .fs-copy, .cl-copy');
    });
  }
  function syncSwitches(){
    realTiles().forEach(function(m){
      var k = m.querySelector(':scope > .cl-opt');
      if(!k){
        k = document.createElement('button'); k.type = 'button'; k.className = 'cl-opt';
        k.setAttribute('aria-haspopup', 'menu');
        k.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
        k.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); if(editing()) open(m, k, tileHost(m)); });
        m.appendChild(k);
      }
      var o = D.fitOf(m.getAttribute('data-mid')), f = fitName(o && o.fit), bare = !!(o && o.bare);
      k.innerHTML = SVG[f] + '<span>' + NAMES[f] + '</span>' + (bare ? '<i></i><span>No plate</span>' : '');
      k.setAttribute('data-set', String(f !== 'fill' || bare));
      k.setAttribute('aria-label', 'Picture: ' + NAMES[f] + (bare ? ', no backplate' : ''));
      k.title = 'Fill, fit or crop this picture, or take away the tile behind it';
    });
  }
  D.onMedia.push(syncSwitches);
  syncSwitches();

  // a slide change or leaving Edit mode finishes the crop and closes the menu
  D.onShow.push(function(){ close(); endCrop(true); });
  var wasEditing = editing();
  new MutationObserver(function(){
    var now = editing(); if(now === wasEditing) return;
    wasEditing = now; if(!now){ close(); endCrop(true); }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
