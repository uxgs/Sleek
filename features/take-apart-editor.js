/* Take-apart layers: the editor behind a take-apart tile's Layers button (Edit mode).

   A take-apart tile comes apart into layers. Each tile keeps its own: the layout's sample to begin
   with, your picture once you replace it (as one layer, at its real shape), then whatever you add here.
   Add layers from your own images (one per file, each drawn over the ones below it), name and describe
   each, put them in order or remove them. A stack that comes apart in rows (stack: 'vertical') also
   shows here as it comes apart: drag a frame's corner to make it bigger or smaller (double-click the
   corner for its own size again), and Fill / Fit sets how its picture sits in the frame. The layers save
   with the deck (features/disassemble.js reads them). */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror || !D.takeApart) return;
  var el = null, tile = null, mid = null, c = null, typing = 0, prevFocus = null, baseH = 0;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function copy(o){ return JSON.parse(JSON.stringify(o)); }
  function uid(){ return 'l' + Math.random().toString(36).slice(2, 8); }

  // every take-apart tile gets a Layers button (shown in Edit mode)
  function chips(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .slide .media[data-dis]'), function(t){
      if(t.closest('.car-copy, .fs-copy') || t.querySelector(':scope > .media-layers')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'media-layers'; b.title = 'The layers this picture takes apart into';
      b.innerHTML = '<i aria-hidden="true"></i><span>Layers</span>';
      b.addEventListener('click', function(ev){ ev.stopPropagation(); ev.preventDefault(); open(t); });
      t.appendChild(b);
    });
    paintChips();
  }
  function paintChips(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .media[data-dis] > .media-layers'), function(b){
      var r = D.takeApart.raw(b.parentNode), n = r && r.layers ? r.layers.length : 0;
      b.querySelector('span').textContent = n ? 'Layers · ' + n : 'Layers';
    });
  }

  function thumb(L){
    var src = L.src === '@tile' ? D.tilePicture(tile) : (L.src || (L.items && L.items[0] && L.items[0].src) || '');
    if(L.type === 'color') return '<span class="tl-shot" style="background:' + esc(L.color || '#222') + '"></span>';
    if(src && !D.isVideo(src)) return '<span class="tl-shot" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span>';
    return '<span class="tl-shot tl-aa">Aa</span>';
  }
  function rows(){
    var n = c.layers.length;
    return c.layers.map(function(L, k){ return { L: L, k: k }; }).reverse().map(function(it, pos){
      var L = it.L, k = it.k;
      return '<li class="tl-row" data-k="' + k + '" style="--i:' + pos + '">' + thumb(L) +
        '<span class="tl-fields">' +
          '<input class="tl-label" type="text" value="' + esc(L.label || '') + '" placeholder="Layer name" aria-label="Layer name">' +
          '<input class="tl-desc" type="text" value="' + esc(L.desc || '') + '" placeholder="What it is (optional)" aria-label="Layer description">' +
          (L.src === '@tile' ? '<em class="tl-tag">Your picture</em>' : '') +
        '</span>' +
        '<span class="tl-acts">' +
          '<button type="button" data-up aria-label="Move toward the front"' + (k === n - 1 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" data-down aria-label="Move toward the back"' + (k === 0 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" data-del aria-label="Remove layer"' + (n < 2 ? ' disabled' : '') + '>×</button>' +
        '</span></li>';
    }).join('');
  }
  function paint(){
    if(!el) return;
    el.querySelector('.tl-list').innerHTML = rows();
    el.querySelector('.tl-count').textContent = c.layers.length + (c.layers.length === 1 ? ' layer' : ' layers');
    paintStage();
  }

  // ---------- the stack as it comes apart: each layer's frame, sized by its corner ----------
  // A frame is the layer's box in the component (x, y, w, h, in its own px): centred on the picture, as
  // wide as the picture at most. In Present each frame gets its own row, front layer on top, and the
  // stack is scaled to fit between the title and the bottom of the slide, as it is here.
  function vertical(){ return c && c.stack === 'vertical'; }
  function boxOf(L){ return L.box || [0, 0, c.w || 640, baseH]; }
  function srcOf(L){ return L.src === '@tile' ? D.tilePicture(tile) : (L.src || ''); }
  function tiltCos(){ return Math.cos((c.tilt != null ? c.tilt : 58) * Math.PI / 180) || 1; }
  var frozen = 0, drag = null;                           // the scale stays put while a corner moves
  function stageScale(st){
    var cos = tiltCos(), gap = c.vgap || 22, n = c.layers.length;
    var total = c.layers.reduce(function(t, L){ return t + boxOf(L)[3] * cos; }, 0) + gap * (n - 1);
    var wide = c.layers.reduce(function(t, L){ return Math.max(t, boxOf(L)[2]); }, 1);
    return Math.min((st.clientWidth - 48) / wide, (st.clientHeight - 40) / total);
  }
  function paintStage(){
    var st = el && el.querySelector('.tl-stage'); if(!st || !baseH) return;
    var p = frozen || stageScale(st), cos = tiltCos(), gap = (c.vgap || 22) * p;
    var rows = c.layers.map(function(L, k){ return { L: L, k: k, b: boxOf(L) }; }).reverse();   // front layer on top
    var total = rows.reduce(function(t, r){ return t + r.b[3] * cos * p; }, 0) + gap * (rows.length - 1);
    var y = (st.clientHeight - total) / 2, W = st.clientWidth;
    st.innerHTML = rows.map(function(r){
      var w = r.b[2] * p, h = r.b[3] * cos * p, L = r.L, src = srcOf(L), pic = src && !D.isVideo(src) && L.type !== 'color';
      var bg = L.type === 'color' ? 'background:' + esc(L.color || '#222') :
               pic ? 'background-image:url(&quot;' + esc(src) + '&quot;);background-size:' + (L.fit === 'contain' ? 'contain' : 'cover') : '';
      var out = '<div class="tl-frame' + (drag && drag.k === r.k ? ' on' : '') + '" data-k="' + r.k + '" style="left:' + (W / 2 - w / 2) + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px">' +
        '<i class="tl-pic' + (pic || L.type === 'color' ? '' : ' tl-none') + '" style="' + bg + '">' + (pic || L.type === 'color' ? '' : esc(L.label || L.type)) + '</i>' +
        (pic && L.src !== '@tile' ? '<button type="button" class="tl-fit" data-fit title="How the picture sits in its frame">' + (L.fit === 'contain' ? 'Fit' : 'Fill') + '</button>' : '') +
        '<span class="tl-h" data-c="sw" title="Drag to size · double-click for its own size"></span><span class="tl-h" data-c="se" title="Drag to size · double-click for its own size"></span>' +
        (drag && drag.k === r.k ? '<span class="tl-read">' + Math.round(r.b[2]) + ' × ' + Math.round(r.b[3]) + '</span>' : '') + '</div>';
      y += h + gap;
      return out;
    }).join('');
  }
  function setBox(L, w, h){
    var W = c.w || 640;
    w = Math.max(60, Math.min(W, w)); h = Math.max(20, Math.min(W * 3, h));
    L.box = [Math.round((W - w) / 2), Math.round((baseH - h) / 2), Math.round(w), Math.round(h)];
  }
  function onDown(e){
    var hd = e.target.closest && e.target.closest('.tl-h'); if(!hd || e.button !== 0) return;
    e.preventDefault();
    var st = el.querySelector('.tl-stage'), k = +hd.parentNode.getAttribute('data-k'), b = boxOf(c.layers[k]);
    frozen = stageScale(st);
    drag = { k: k, x: e.clientX, y: e.clientY, w: b[2], h: b[3], side: hd.getAttribute('data-c') === 'sw' ? -1 : 1, moved: false };
    document.body.classList.add('tl-sizing');
    paintStage();
  }
  function onMove(e){
    if(!drag) return;
    var L = c.layers[drag.k], dx = (e.clientX - drag.x) * drag.side, dy = e.clientY - drag.y;
    if(!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    var w = drag.w + 2 * dx / frozen, h = drag.h + dy / (frozen * tiltCos());   // centred: a corner moves both sides
    if(e.shiftKey){ var k = Math.max(w / drag.w, h / drag.h); w = drag.w * k; h = drag.h * k; }   // Shift keeps its shape
    setBox(L, w, h); paintStage();
  }
  function onUp(){
    if(!drag) return;
    var moved = drag.moved; drag = null; frozen = 0;
    document.body.classList.remove('tl-sizing');
    paintStage(); if(moved) save();
  }
  // double-click a corner: the layer's picture at its own shape, as wide as the stack
  function ownSize(k){
    var L = c.layers[k], src = srcOf(L), W = c.w || 640;
    if(!src || L.type === 'color' || L.src === '@tile'){ delete L.box; paintStage(); save(); return; }
    D.takeApart.ratioOf(src, function(r){ r = r || 16 / 9; setBox(L, Math.min(W, baseH * 2.2 * r), Math.min(W, baseH * 2.2 * r) / r); paintStage(); save(); });
  }
  function save(){ D.setTileComponent(mid, copy(c)); paintChips(); }

  function open(t){
    if(el) return;
    tile = t; mid = t.getAttribute('data-mid'); prevFocus = document.activeElement;
    var raw = D.takeApart.raw(t); if(!raw){ return; }
    c = copy(raw);
    el = document.createElement('div');
    el.className = 'bp-backdrop tl-backdrop';
    el.innerHTML = '' +
      '<div class="bp-modal tl-modal" role="dialog" aria-modal="true" aria-label="Take-apart layers">' +
        '<button type="button" class="bp-close" data-close aria-label="Close">×</button>' +
        '<div class="tl-head"><div class="bp-k">Take apart · <span class="tl-count"></span></div><h2 class="bp-h">What is it made of?</h2>' +
          '<p class="bp-p">Front layer first. In Present, click the picture and these come apart one by one, each with its name and description. ' +
          'Add layers from your own images: one per file, drawn over the ones below.</p></div>' +
        '<div class="tl-body">' + (vertical() ? '<div class="tl-stage" aria-label="The layers as they come apart"></div>' : '') + '<ol class="tl-list"></ol></div>' +
        '<div class="tl-foot">' +
          '<label class="bp-btn primary"><input type="file" accept="image/*" multiple hidden>Add layers…</label>' +
          '<button type="button" class="bp-btn ghost" data-reset>Reset</button>' +
          '<span class="tl-sp"></span><button type="button" class="bp-btn ghost" data-close>Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    if(vertical()){ el.querySelector('.tl-modal').classList.add('tl-wide'); el.querySelector('.bp-p').textContent += ' Drag a frame\u2019s corner to size it; Shift keeps its shape.'; }
    baseH = c.h || 0;
    paint();
    if(!baseH) D.takeApart.ratioOf(D.tilePicture(t), function(r){ baseH = Math.round((c.w || 640) / (r || 16 / 9)); paintStage(); });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('dblclick', function(e){ var hd = e.target.closest('.tl-h'); if(hd) ownSize(+hd.parentNode.getAttribute('data-k')); });
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.querySelector('input[type=file]').addEventListener('change', onFiles);
    document.addEventListener('keydown', onKey, true);
    D.modal = true;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el) el.classList.add('in'); }); });
  }
  function close(){
    if(!el) return;
    if(typing){ clearTimeout(typing); typing = 0; save(); }
    var node = el; el = null; D.modal = false; drag = null; frozen = 0;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(function(){ node.remove(); }, 380);
    if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  function onClick(e){
    if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
    var ft = e.target.closest('[data-fit]');
    if(ft){ var Lf = c.layers[+ft.closest('.tl-frame').getAttribute('data-k')]; if(Lf){ if(Lf.fit === 'contain') delete Lf.fit; else Lf.fit = 'contain'; paintStage(); save(); } return; }
    if(e.target.closest('[data-reset]')){
      // your picture alone again; on the layout's own picture, the layout's sample
      if(D.mediaIsCustom(mid)) D.setTileComponent(mid, D.takeApart.ownDefault(tile)); else D.setTileComponent(mid, null);
      c = copy(D.takeApart.raw(tile)); paint(); paintChips(); return;
    }
    var row = e.target.closest('.tl-row'); if(!row) return;
    var k = +row.getAttribute('data-k'), L = c.layers;
    if(e.target.closest('[data-up]') && k < L.length - 1){ L.splice(k + 1, 0, L.splice(k, 1)[0]); }
    else if(e.target.closest('[data-down]') && k > 0){ L.splice(k - 1, 0, L.splice(k, 1)[0]); }
    else if(e.target.closest('[data-del]') && L.length > 1){ L.splice(k, 1); }
    else return;
    paint(); save();
  }
  function onInput(e){
    var row = e.target.closest('.tl-row'); if(!row) return;
    var L = c.layers[+row.getAttribute('data-k')]; if(!L) return;
    if(e.target.classList.contains('tl-label')) L.label = e.target.value;
    else if(e.target.classList.contains('tl-desc')) L.desc = e.target.value;
    clearTimeout(typing); typing = setTimeout(function(){ typing = 0; save(); }, 350);
  }
  function onFiles(e){
    var files = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
    if(!files.length) return;
    var left = files.length, added = new Array(files.length);
    files.forEach(function(f, k){
      D.mediaFromFile(f, function(src){
        added[k] = { id: uid(), type: 'image', src: src, fit: 'contain', label: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Layer', desc: '' };
        if(--left) return;
        added.forEach(function(L){ if(L) c.layers.push(L); });   // over everything so far, in the order picked
        paint(); save();
      });
    });
  }
  function onKey(e){
    if(!el) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if(!(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) e.stopImmediatePropagation();   // the deck underneath stays put
  }

  chips();
  if(D.onShow) D.onShow.push(chips);
  // the count follows a replaced picture and Edit mode coming on
  new MutationObserver(function(){ paintChips(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  Array.prototype.forEach.call(document.querySelectorAll('#stage .media[data-dis]'), function(t){
    new MutationObserver(function(){ paintChips(); }).observe(t, { attributes: true, attributeFilter: ['style', 'class'] });
  });
  D.openLayers = open;
})();
