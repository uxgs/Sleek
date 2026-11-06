/* Free pictures: pictures and videos you put anywhere on a slide, at any size.

   In Edit mode, the bar's Image button (or dropping files on a slide, or pasting a picture) puts
   one on the slide. Drag it to move it (it snaps to the slide's middle and edges), drag a corner
   to resize it (it keeps its shape), and use its small bar to bring it to the front, send it to the
   back, replace it or delete it. Delete / Backspace removes the picked one, the arrow keys nudge it
   (Shift: further), Esc lets go of it.

   Each slide keeps its pictures in its own entry in the deck (seed.added[k].fl, a list of
   { id, x, y, w, r } in slide px, back to front) and their files in the deck's media, under ids
   that never move (<slideId>.f<id>), so they save, undo, duplicate, export and publish with it. */
(function(){
  var D = window.Deck; if(!D) return;
  var stage = document.getElementById('stage'); if(!stage) return;
  var W = 1280, H = 720, MIN = 40, SNAP = 7;

  function editing(){ return document.body.classList.contains('editing'); }
  function scale(){ return stage.getBoundingClientRect().width / W || 1; }
  function freshId(){ return Math.random().toString(36).slice(2, 8); }
  function slidesWith(){ return Array.prototype.slice.call(stage.querySelectorAll('.slide[data-added]')); }
  function listOf(s){ var a = D.addedOf(s); return a ? (a.fl || []) : []; }
  function sidOf(s){ return s.getAttribute('data-added'); }
  function midOf(s, it){ return sidOf(s) + '.f' + it.id; }
  function r1(v){ return Math.round(v * 10) / 10; }

  // ---------- drawing a slide's pictures ----------
  function layerOf(s, make){
    var l = s.querySelector(':scope > .fl-layer');
    if(!l && make){ l = document.createElement('div'); l.className = 'fl-layer'; s.appendChild(l); }
    return l;
  }
  function render(s){
    var list = listOf(s), l = layerOf(s, list.length > 0); if(!l) return;
    var keep = {};
    list.forEach(function(it, k){
      keep[it.id] = true;
      var p = l.querySelector(':scope > .fl-pic[data-fid="' + it.id + '"]');
      if(!p){
        p = document.createElement('div'); p.className = 'fl-pic';
        p.setAttribute('data-fid', it.id); p.setAttribute('data-mid', midOf(s, it));
        l.appendChild(p);
      }
      place(p, it); p.style.zIndex = k + 1;
      paint(p, D.mediaOf(midOf(s, it)));
    });
    Array.prototype.forEach.call(l.querySelectorAll(':scope > .fl-pic'), function(p){ if(!keep[p.getAttribute('data-fid')]) p.remove(); });
    if(sel && sel.s === s){ var p = pic(s, sel.id); if(p) chrome(p); else pick(null); }
  }
  function place(p, it){
    var w = Math.max(MIN, +it.w || 400), h = w / (+it.r || 4 / 3);
    p.style.left = r1(it.x) + 'px'; p.style.top = r1(it.y) + 'px'; p.style.width = r1(w) + 'px'; p.style.height = r1(h) + 'px';
  }
  function paint(p, src){
    if(p._src === src) return;
    p._src = src;
    var v = p.querySelector(':scope > video');
    if(src && D.isVideo(src)){
      p.style.backgroundImage = '';
      if(!v){
        v = document.createElement('video'); v.className = 'tile-video';
        ['muted', 'loop', 'playsinline'].forEach(function(a){ v.setAttribute(a, ''); });
        v.muted = true; v.preload = 'auto'; p.insertBefore(v, p.firstChild);
      }
      v.removeAttribute('src'); v.setAttribute('data-src', src);
      if(D.armVideos) D.armVideos();                          // it plays when its slide is up
    } else {
      if(v) v.remove();
      p.style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : '';
    }
    p.classList.toggle('fl-empty', !src);
  }
  function renderAll(){ slidesWith().forEach(render); }
  function pic(s, id){ var l = layerOf(s); return l && l.querySelector(':scope > .fl-pic[data-fid="' + id + '"]'); }
  function itemOf(s, id){ return listOf(s).filter(function(it){ return it.id === id; })[0] || null; }
  function save(){ D.saveAdded(); D.pingReload(); }

  // ---------- adding ----------
  function shape(src, cb){ if(D.shapeOf) D.shapeOf(src, function(r){ cb(r || 4 / 3); }); else cb(4 / 3); }
  // pictures (their sources) onto slide s, centred on (cx, cy) in slide px (the slide's middle if not given)
  function addSources(s, srcs, cx, cy){
    var a = D.addedOf(s); if(!a || !srcs.length) return;
    var got = new Array(srcs.length), left = srcs.length;
    srcs.forEach(function(src, j){
      shape(src, function(r){
        got[j] = { src: src, r: r };
        if(--left) return;
        a.fl = a.fl || [];
        var base = a.fl.length, last = null;
        got.forEach(function(g, k){
          var r2 = Math.max(0.1, Math.min(10, g.r)), w = Math.min(520, 400 * r2, W * 0.8), h = w / r2;
          var ox = (base + k) % 6 * 28, x = (cx != null ? cx : W / 2) - w / 2 + ox, y = (cy != null ? cy : H / 2) - h / 2 + ox;
          var it = { id: freshId(), x: r1(clampX(x, w)), y: r1(clampY(y, h)), w: r1(w), r: Math.round(r2 * 10000) / 10000 };
          a.fl.push(it);
          D.setMedia(midOf(s, it), g.src);
          last = it;
        });
        D.saveMedia(); save(); render(s);
        if(last) pick(s, last.id);
        D.toast(srcs.length === 1 ? (D.isVideo(srcs[0]) ? 'Video added' : 'Picture added') : srcs.length + ' added');
      });
    });
  }
  function addFiles(s, files, cx, cy){
    files = Array.prototype.filter.call(files || [], function(f){ return !!D.fileKind(f); });
    if(!files.length) return;
    var out = new Array(files.length), left = files.length;
    files.forEach(function(f, j){ D.mediaFromFile(f, function(src){ out[j] = src; if(!--left) addSources(s, out, cx, cy); }); });
  }
  function clampX(x, w){ return Math.max(MIN - w, Math.min(W - MIN, x)); }    // some of it always stays on the slide
  function clampY(y, h){ return Math.max(MIN - h, Math.min(H - MIN, y)); }

  // the Edit bar's Image button: the deck's pictures, or new ones
  var group = document.getElementById('eb-insert'), btn = document.getElementById('eb-image');
  function cur(){ var s = D.current(); return s && s.hasAttribute('data-added') ? s : null; }
  function paintBar(){
    if(!group) return;
    var on = editing() && !!cur() && !D.mirror;
    if(group.hidden === on) group.hidden = !on;
  }
  if(btn) btn.addEventListener('click', function(e){
    e.stopPropagation();
    var s = cur(); if(!s) return;
    if(D.pickMedia) D.pickMedia({ kicker: 'On this slide',
      onChosen: function(list){ addSources(s, list.map(function(c){ return c.src; })); },
      onFiles: function(files){ addFiles(s, files); } });
  });
  // files dropped on a slide (not on a moodboard, which takes them itself)
  function slideAt(e){ var s = e.target.closest && e.target.closest('.slide.active[data-added]'); return editing() && s ? s : null; }
  function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
  stage.addEventListener('dragover', function(e){
    var s = slideAt(e); if(!s || !hasFiles(e) || e.target.closest('.cl-board')) return;
    e.preventDefault(); s.classList.add('fl-drop');
  });
  stage.addEventListener('dragleave', function(e){ var s = slideAt(e); if(s && !s.contains(e.relatedTarget)) s.classList.remove('fl-drop'); });
  stage.addEventListener('drop', function(e){
    var s = slideAt(e); if(!s) return;
    s.classList.remove('fl-drop');
    if(!hasFiles(e) || e.target.closest('.cl-board')) return;
    e.preventDefault();
    var p = toSlide(s, e.clientX, e.clientY);
    addFiles(s, e.dataTransfer.files, p.x, p.y);
  });
  // a picture pasted in Edit mode (not into some text)
  document.addEventListener('paste', function(e){
    if(!editing()) return;
    var t = document.activeElement;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var s = cur(); if(!s || D.modal) return;
    var files = Array.prototype.filter.call((e.clipboardData && e.clipboardData.files) || [], function(f){ return /^image\//.test(f.type); });
    if(!files.length) return;
    e.preventDefault(); addFiles(s, files);
  });
  function toSlide(s, x, y){ var r = s.getBoundingClientRect(), k = r.width / W || 1; return { x: (x - r.left) / k, y: (y - r.top) / k }; }

  // ---------- the picked picture: a frame, corner handles and a small bar ----------
  var sel = null, BAR = null;
  var ICONS = {
    front: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9.5" height="9.5" rx="1.6"/><path d="M4.5 12.5h-1v-9h9v1"/></svg>',
    back: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="3.5" width="9.5" height="9.5" rx="1.6"/><path d="M15.5 7.5h1v9h-9v-1" opacity=".55"/></svg>',
    replace: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 8.5A6 6 0 0 0 4.7 6.6"/><path d="M4.5 3.5v3.3h3.3"/><path d="M4.5 11.5a6 6 0 0 0 10.8 1.9"/><path d="M15.5 16.5v-3.3h-3.3"/></svg>',
    del: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/></svg>'
  };
  function pick(s, id){
    if(sel){ var old = pic(sel.s, sel.id); if(old){ old.classList.remove('fl-on'); Array.prototype.forEach.call(old.querySelectorAll('.fl-h'), function(h){ h.remove(); }); } }
    if(BAR){ BAR.remove(); BAR = null; }
    sel = s && id ? { s: s, id: id } : null;
    if(!sel) return;
    var p = pic(s, id); if(!p){ sel = null; return; }
    chrome(p);
  }
  function chrome(p){
    p.classList.add('fl-on');
    ['nw', 'ne', 'sw', 'se'].forEach(function(c){
      if(p.querySelector(':scope > .fl-h[data-c="' + c + '"]')) return;
      var h = document.createElement('span'); h.className = 'fl-h'; h.setAttribute('data-c', c); p.appendChild(h);
    });
    if(!BAR){
      BAR = document.createElement('div'); BAR.className = 'fl-bar';
      BAR.innerHTML = '<button type="button" data-a="front" title="Bring to front" aria-label="Bring to front">' + ICONS.front + '</button>' +
        '<button type="button" data-a="back" title="Send to back" aria-label="Send to back">' + ICONS.back + '</button>' +
        '<button type="button" data-a="replace" title="Replace" aria-label="Replace">' + ICONS.replace + '</button>' +
        '<span class="fl-sep"></span>' +
        '<button type="button" data-a="del" class="fl-del" title="Delete" aria-label="Delete">' + ICONS.del + '</button>';
      BAR.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      BAR.addEventListener('click', function(e){
        e.stopPropagation();
        var b = e.target.closest('[data-a]'); if(b && sel) act(b.getAttribute('data-a'));
      });
    }
    var l = p.parentNode; if(BAR.parentNode !== l) l.appendChild(BAR);
    barAt(p);
  }
  function barAt(p){
    if(!BAR) return;
    var x = parseFloat(p.style.left), y = parseFloat(p.style.top), w = parseFloat(p.style.width), h = parseFloat(p.style.height);
    var bw = BAR.offsetWidth || 170, top = y - 52;
    if(top < 8) top = y + h + 12;
    if(top > H - 50) top = Math.max(8, y + 12);
    BAR.style.left = r1(Math.max(8, Math.min(W - bw - 8, x + w / 2 - bw / 2))) + 'px';
    BAR.style.top = r1(top) + 'px';
  }
  var fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = 'image/*,video/*'; fileIn.hidden = true;
  document.body.appendChild(fileIn);
  fileIn.addEventListener('change', function(){
    var f = fileIn.files && fileIn.files[0], t = fileIn._for; fileIn._for = null; fileIn.value = '';
    if(!f || !t || !D.fileKind(f)) return;
    D.mediaFromFile(f, function(src){
      shape(src, function(r){
        var it = itemOf(t.s, t.id); if(!it) return;
        var cxm = it.x + it.w / 2, cym = it.y + it.w / it.r / 2;     // the same width, around the same middle
        it.r = Math.round(Math.max(0.1, Math.min(10, r)) * 10000) / 10000;
        it.x = r1(cxm - it.w / 2); it.y = r1(cym - it.w / it.r / 2);
        D.setMedia(midOf(t.s, it), src); D.saveMedia(); save(); render(t.s);
      });
    });
  });
  function act(a){
    var s = sel.s, a2 = D.addedOf(s); if(!a2 || !a2.fl) return;
    var k = a2.fl.map(function(it){ return it.id; }).indexOf(sel.id); if(k < 0) return;
    if(a === 'front' || a === 'back'){
      var it = a2.fl.splice(k, 1)[0];
      if(a === 'front') a2.fl.push(it); else a2.fl.unshift(it);
      save(); render(s); return;
    }
    if(a === 'replace'){ fileIn._for = { s: s, id: sel.id }; fileIn.click(); return; }
    if(a === 'del') remove(s, sel.id);
  }
  function remove(s, id){
    var a = D.addedOf(s); if(!a || !a.fl) return;
    var it = itemOf(s, id); if(!it) return;
    a.fl = a.fl.filter(function(x){ return x.id !== id; });
    if(!a.fl.length) delete a.fl;
    D.setMedia(midOf(s, it), null); D.saveMedia();
    pick(null); save(); render(s);
    D.toast('Picture removed', true);                          // Undo puts it back
  }

  // ---------- moving and resizing ----------
  var drag = null;
  stage.addEventListener('pointerdown', function(e){
    if(!editing() || e.button !== 0) return;
    var p = e.target.closest && e.target.closest('.slide.active .fl-pic');
    if(!p){
      // a press anywhere else on the slide lets go of the picked one
      if(sel && !(e.target.closest && e.target.closest('.fl-bar'))) pick(null);
      return;
    }
    var s = p.closest('.slide'), id = p.getAttribute('data-fid'), it = itemOf(s, id); if(!it) return;
    e.preventDefault(); e.stopPropagation();
    if(!sel || sel.id !== id) pick(s, id);
    var h = e.target.closest('.fl-h');
    drag = { s: s, p: p, it: it, c: h ? h.getAttribute('data-c') : null, x: e.clientX, y: e.clientY, id: e.pointerId,
             x0: it.x, y0: it.y, w0: it.w, moved: false };
    try { p.setPointerCapture(e.pointerId); } catch(_){}
  }, true);
  document.addEventListener('pointermove', function(e){
    if(!drag || e.pointerId !== drag.id) return;
    var k = scale(), dx = (e.clientX - drag.x) / k, dy = (e.clientY - drag.y) / k;
    if(!drag.moved && Math.hypot(dx, dy) < 2) return;
    if(!drag.moved){ drag.moved = true; document.body.classList.add(drag.c ? 'fl-sizing' : 'fl-moving'); drag.p.classList.add('fl-live'); }
    var it = drag.it, r = +it.r || 4 / 3;
    if(drag.c){
      // a corner: the opposite corner stays put; the size follows whichever way you pull further
      var sx = /e/.test(drag.c) ? 1 : -1, sy = /s/.test(drag.c) ? 1 : -1;
      var w = Math.max(MIN, Math.max(drag.w0 + sx * dx, (drag.w0 / r + sy * dy) * r));
      w = Math.min(w, W * 3);
      it.w = r1(w);
      it.x = r1(sx > 0 ? drag.x0 : drag.x0 + drag.w0 - w);
      it.y = r1(sy > 0 ? drag.y0 : drag.y0 + drag.w0 / r - w / r);
      guides(drag.s, []);
      readout(drag.p, Math.round(w) + ' × ' + Math.round(w / r));
    } else {
      var w2 = it.w, h2 = w2 / r, x = drag.x0 + dx, y = drag.y0 + dy, lines = [];
      if(!e.altKey){                                           // snap its edges and middle to the slide's (hold Alt for none)
        var sx2 = snap([x, x + w2 / 2, x + w2], [0, W / 2, W]), sy2 = snap([y, y + h2 / 2, y + h2], [0, H / 2, H]);
        if(sx2){ x += sx2.d; lines.push({ v: true, at: sx2.at }); }
        if(sy2){ y += sy2.d; lines.push({ v: false, at: sy2.at }); }
      }
      it.x = r1(clampX(x, w2)); it.y = r1(clampY(y, h2));
      guides(drag.s, lines);
    }
    place(drag.p, it); barAt(drag.p);
  });
  function snap(mine, theirs){
    var best = null;
    mine.forEach(function(a){ theirs.forEach(function(b){ var d = b - a; if(Math.abs(d) <= SNAP / scale() && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: b }; }); });
    return best;
  }
  function guides(s, lines){
    var l = layerOf(s); if(!l) return;
    Array.prototype.forEach.call(l.querySelectorAll('.fl-guide'), function(g){ g.remove(); });
    lines.forEach(function(ln){
      var g = document.createElement('span'); g.className = 'fl-guide ' + (ln.v ? 'v' : 'h');
      g.style[ln.v ? 'left' : 'top'] = ln.at + 'px'; l.appendChild(g);
    });
  }
  function readout(p, txt){
    var r = p.querySelector(':scope > .fl-read');
    if(!r){ r = document.createElement('span'); r.className = 'fl-read'; p.appendChild(r); }
    r.textContent = txt;
  }
  function endDrag(e){
    if(!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    document.body.classList.remove('fl-sizing', 'fl-moving');
    d.p.classList.remove('fl-live');
    var r = d.p.querySelector(':scope > .fl-read'); if(r) r.remove();
    guides(d.s, []);
    if(d.moved){ save(); swallowClick(); }
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  // the click at the end of a press on a picture isn't a click on what's under it
  function swallowClick(){
    var sw = function(ev){ ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', sw, true); };
    window.addEventListener('click', sw, true);
    setTimeout(function(){ window.removeEventListener('click', sw, true); }, 60);
  }
  stage.addEventListener('click', function(e){
    if(editing() && e.target.closest && e.target.closest('.fl-pic')){ e.stopPropagation(); e.preventDefault(); }
  }, true);
  // double-click a picture to replace it
  stage.addEventListener('dblclick', function(e){
    var p = editing() && e.target.closest && e.target.closest('.slide.active .fl-pic'); if(!p || e.target.closest('.fl-h')) return;
    e.stopPropagation(); e.preventDefault();
    fileIn._for = { s: p.closest('.slide'), id: p.getAttribute('data-fid') }; fileIn.click();
  }, true);

  // keys for the picked picture (not while typing)
  var nudgeT = 0;
  document.addEventListener('keydown', function(e){
    if(!sel || !editing() || D.modal) return;
    var t = document.activeElement;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); pick(null); return; }
    if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); e.stopImmediatePropagation(); remove(sel.s, sel.id); return; }
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if(!d) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var it = itemOf(sel.s, sel.id), p = pic(sel.s, sel.id); if(!it || !p) return;
    var n = e.shiftKey ? 10 : 1;
    it.x = r1(clampX(it.x + d[0] * n, it.w)); it.y = r1(clampY(it.y + d[1] * n, it.w / it.r));
    place(p, it); barAt(p);
    clearTimeout(nudgeT); nudgeT = setTimeout(save, 400);
  }, true);

  // ---------- keeping up ----------
  D.onShow.push(function(){ pick(null); paintBar(); });
  if(D.onMedia) D.onMedia.push(renderAll);
  var wasEditing = editing();
  new MutationObserver(function(){
    var now = editing(); if(now === wasEditing) return;
    wasEditing = now; if(!now) pick(null); paintBar();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  renderAll(); paintBar();
  D.renderFloats = renderAll;
})();
