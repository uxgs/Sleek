/* Disassemble: click a component tile and it comes apart into labeled layers, then back together.

   Mark a tile with the component it opens:
       <div class="media" data-dis="sample-card">...</div>
   The component itself is data in the deck (seed.components['sample-card']), or the built-in sample:
       { title, kicker, w, h, layers: [ back ... front ] }
   each layer: { id, type, box: [x, y, w, h], label, desc, ...type fields }
       type 'art'   src | a, b    artwork (an image, or a placeholder gradient)
            'image' src           any other flat layer
            'text'  text, sub     a headline with a small kicker above it
            'tiles' count, a, b   a row of 16:9 placeholder tiles
            'color' color         a flat fill
   'image' layers take fade: true to soften their bottom edge, drift: true to sway gently, and ph: { type, box, ... } for a stand-in
   (any of the types above, drawn at box) shown while the image file isn't there yet.
   Add data-assemble to run it in place instead: clicking the tile pulls its layers apart right
   there in the frame (as a diagonal stack in depth, or with stack: 'vertical', each layer tipped back
   and given its own row, front layer on top; vgap sets the gap between rows, tilt the angle, hshift
   moves the whole stack sideways, in slide px; it is sized and placed to fit between the title and the slide's bottom), and the slide's copy beside it (.asm-copy) swaps to the numbered layer
   list. Click again (or Esc) and it goes back together and the copy returns.
   Space/Enter toggles apart/together, Esc closes. A deck's seed.components changes the copy.
*/
(function(){
  var D = window.Deck; if(!D || D.popout) return;
  var stage = D.stage, root = null, open = false, apart = false, comp = null, sourceTile = null, timers = [], assemble = false;
  var SPREAD = 86;                       // depth between layers when apart (slide px)

  function later(fn, ms){ timers.push(setTimeout(fn, ms)); }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // a built-in sample; the deck's seed.components overrides it (or adds others) by name
  var DEFAULTS = {
    // a workout card built from four layers, at 640x360 (the rings layer is one transparent SVG)
    'sample-card': {
      title: 'Workout Card', kicker: 'Sample \u00b7 Take apart', mode: 'assemble', stack: 'vertical', vgap: 16, tilt: 0, hshift: -40, apartScale: 0.74,
      w: 640, h: 360,
      layers: [
        { id: 'background', type: 'color', box: [0, 0, 640, 360], label: 'Background',
          color: 'radial-gradient(420px 300px at 90% 20%, rgba(255,106,61,0.45), rgba(255,106,61,0) 70%), linear-gradient(120deg, #1a0f1c 0%, #2a1420 60%, #3a1a22 100%)',
          desc: 'A deep plum, warming toward the top right.' },
        { id: 'rings', type: 'art', src: 'assets/sample/card-rings.svg', box: [0, 0, 640, 360], label: 'Activity Rings',
          desc: 'Move, effort and recovery for the day, filling as the session goes.' },
        { id: 'headline', type: 'text', text: 'Morning strength', sub: 'Today\'s pick', box: [40, 135, 360, 90], label: 'Headline',
          desc: 'The session name, plus why it is being shown today.' },
        { id: 'stats', type: 'tiles', count: 3, a: '#ff6a3d', b: '#2a1420', box: [40, 253, 290, 37], label: 'Session Stats',
          desc: 'Time, moves and energy: the three numbers people decide on.' }
      ]
    }
  };
  function components(){
    var out = {}, seed = (D.SEED && D.SEED.components) || {};
    Object.keys(DEFAULTS).forEach(function(k){ out[k] = DEFAULTS[k]; });
    Object.keys(seed).forEach(function(k){ out[k] = seed[k]; });
    return out;
  }

  // ---------- which layers a tile takes apart into ----------
  // In order: its own layers (edited on this device, or saved with the deck as components['tile:<id>']);
  // then, if its picture is your own, that picture as a single layer at its real shape; then the
  // component its markup names (data-dis). A layer whose src is '@tile' is the tile's picture, and a
  // component with no h takes its height from that picture.
  var ratios = {};
  function ratioOf(src, cb){
    if(!src || D.isVideo(src)) return cb(16 / 9);
    if(ratios[src]) return cb(ratios[src]);
    var im = new Image();
    im.onload = function(){ ratios[src] = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 16 / 9; cb(ratios[src]); };
    im.onerror = function(){ cb(16 / 9); };
    im.src = src;
  }
  function capOf(tile){ var c = tile.querySelector('.cap'); return c ? c.textContent.trim() : ''; }
  function ownDefault(tile){
    return { title: capOf(tile), kicker: 'Take apart', mode: 'assemble', stack: 'vertical', vgap: 16, tilt: 0, hshift: -40, apartScale: 0.74, w: 640, h: null,
      layers: [{ id: 'base', type: 'image', src: '@tile', label: capOf(tile) || 'Picture', desc: '' }] };
  }
  function rawFor(tile){
    var mid = tile.getAttribute('data-mid'), own = D.tileComponent && D.tileComponent(mid);
    if(own && own.layers && own.layers.length) return own;
    if(mid && D.mediaIsCustom && D.mediaIsCustom(mid)) return ownDefault(tile);
    return components()[tile.getAttribute('data-dis')] || null;
  }
  // the component ready to draw: the tile's picture filled in, its height known
  function componentFor(tile, cb){
    var c = rawFor(tile); if(!c || !c.layers || !c.layers.length) return cb(null);
    var pic = D.tilePicture(tile);
    ratioOf(pic, function(ratio){
      var o = JSON.parse(JSON.stringify(c));
      o.w = o.w || 640; if(!o.h) o.h = Math.round(o.w / ratio);
      o.layers.forEach(function(L){ if(L.src === '@tile') L.src = pic; });
      cb(o);
    });
  }
  D.takeApart = { raw: rawFor, ownDefault: ownDefault, ratioOf: ratioOf };

  function build(){
    if(root) return;
    root = document.createElement('div');
    root.className = 'dis'; root.hidden = true;
    root.innerHTML =
      '<div class="dis-dim"></div>' +
      '<div class="dis-head"><div class="dis-k"></div><div class="dis-t"></div></div>' +
      '<div class="dis-scene"><div class="dis-obj"></div></div>' +
      '<svg class="dis-lines" viewBox="0 0 1280 720" preserveAspectRatio="none"></svg>' +
      '<div class="dis-labels"></div>' +
      '<div class="dis-actions"><button class="dis-toggle" type="button">Disassemble</button></div>' +
      '<button class="dis-close" type="button" aria-label="Close">×</button>';
    stage.appendChild(root);
    root.querySelector('.dis-toggle').onclick = function(){ toggle(); };
    root.querySelector('.dis-close').onclick = function(){ close(); };
    root.querySelector('.dis-dim').onclick = function(){ close(); };
  }

  // ---------- layers ----------
  function layerInner(L){
    switch(L.type){
      case 'art':   return L.src ? '<img src="' + esc(L.src) + '" alt="">' :
                      '<div class="dl-art-ph" style="--a:' + (L.a || '#5b6170') + ';--b:' + (L.b || '#1c1e24') + '"></div>';
      case 'text':  return '<div class="dl-text">' + (L.sub ? '<span>' + esc(L.sub) + '</span>' : '') + esc(L.text || '') + '</div>';
      case 'color': return '<div class="dl-color" style="background:' + esc(L.color || '#222') + '"></div>';
      case 'texture': return '<div class="dl-texture"><img src="' + esc(L.src) + '" alt=""></div>';
      case 'images': return (L.items || []).map(function(it){ var b = it.box || [0, 0, '100%', '100%'], px = function(v){ return typeof v === 'number' ? v + 'px' : v; };
                      return '<img class="dl-item" src="' + esc(it.src) + '" alt="" style="left:' + px(b[0]) + ';top:' + px(b[1]) + ';width:' + px(b[2]) + ';height:' + px(b[3]) + '">'; }).join('');
      case 'nav':   return '<div class="dl-nav">' + (L.items || []).map(function(t, k){ return '<span' + (k === 0 ? ' class="on"' : '') + '>' + esc(t) + '</span>'; }).join('') + '</div>';
      case 'tiles': var tiles = ''; for(var t = 0; t < (L.count || 4); t++) tiles += '<i style="--a:' + (L.a || '#4b5060') + ';--b:' + (L.b || '#1a1c22') + ';--k:' + t + '"></i>';
                    return '<div class="dl-tiles">' + tiles + '</div>';
      default:      var ph = '';
                    if(L.ph){ var pb = L.ph.box || [0, 0, '100%', '100%'], px = function(v){ return typeof v === 'number' ? v + 'px' : v; };
                      ph = '<div class="dl-ph" style="left:' + px(pb[0]) + ';top:' + px(pb[1]) + ';width:' + px(pb[2]) + ';height:' + px(pb[3]) + '">' + layerInner(L.ph) + '</div>'; }
                    // a missing file shows its stand-in instead (drop the image in and it replaces it)
                    var cls = [L.fade ? 'dl-fade' : '', L.drift ? 'dl-drift' : '', L.fit === 'contain' ? 'dl-contain' : ''].join(' ').trim();
                    return (L.src ? '<img src="' + esc(L.src) + '" alt=""' + (cls ? ' class="' + cls + '"' : '') +
                      (L.ph ? ' onerror="this.parentNode.classList.add(\'dl-missing\')"' : '') + '>' : '') + ph;
    }
  }
  // Where a layer's leader line starts: a point on the layer itself (fractions of its box, pin: [x, y]),
  // found on screen through the 3D tilt, so the dot lands on the layer rather than beside its bounding box
  function pinOf(L){ return L.pin || [0.96, 0.5]; }
  function pinAt(layer){
    var p = layer.querySelector('.dis-pin'), r = (p || layer).getBoundingClientRect();
    return p ? { x: r.left, y: r.top } : { x: r.right, y: r.top + r.height / 2 };
  }
  function layersHTML(c){
    var n = c.layers.length, spread = c.spread || SPREAD;
    return c.layers.map(function(L, k){
      var b = L.box || [0, 0, c.w, c.h];
      return '<div class="dis-layer dl-' + esc(L.type) + '" data-k="' + k + '" style="left:' + b[0] + 'px;top:' + b[1] + 'px;width:' + b[2] + 'px;height:' + b[3] + 'px;' +
        '--z:' + ((k - (n - 1) / 2) * spread) + 'px;--d:' + (k * 55) + 'ms">' + layerInner(L) +
        '<i class="dis-pin" style="left:' + (pinOf(L)[0] * 100) + '%;top:' + (pinOf(L)[1] * 100) + '%"></i></div>';
    }).join('');
  }
  function render(c){
    var obj = root.querySelector('.dis-obj');
    obj.style.width = c.w + 'px'; obj.style.height = c.h + 'px';
    root.style.setProperty('--apart-scale', c.apartScale || 0.74);
    obj.innerHTML = layersHTML(c);
    root.querySelector('.dis-k').textContent = c.kicker || 'Component anatomy';
    root.querySelector('.dis-t').textContent = c.title || '';
    root.querySelector('.dis-labels').innerHTML = '';
    root.querySelector('.dis-lines').innerHTML = '';
  }

  // ---------- labels + leader lines ----------
  function toStage(x, y){
    var sr = stage.getBoundingClientRect(), k = sr.width / 1280;
    return { x: (x - sr.left) / k, y: (y - sr.top) / k };
  }
  function drawLabels(){
    var layers = Array.prototype.slice.call(root.querySelectorAll('.dis-layer'));
    var items = layers.map(function(el){
      var pt = pinAt(el), L = comp.layers[+el.getAttribute('data-k')];
      return { L: L, k: +el.getAttribute('data-k'), a: toStage(pt.x, pt.y) };
    });
    // labels top to bottom by height on screen (no crossing lines), or front layer first when assembling
    items.sort(assemble ? function(p, q){ return q.k - p.k; } : function(p, q){ return p.a.y - q.a.y; });
    // stack labels next to their layers, keeping a minimum gap, then fit the column on the slide
    var GAP = 72, top = 150, bottom = 640, y = -Infinity;
    items.forEach(function(it){ it.y = Math.max(it.a.y, y + GAP); y = it.y; });
    var over = y - bottom; if(over > 0) items.forEach(function(it){ it.y -= over; });
    var under = top - items[0].y; if(under > 0) items.forEach(function(it){ it.y += under; });
    var LX = 830, html = '', svg = '';
    items.forEach(function(it, n){
      var d = (n * 70) + 'ms';
      html += '<div class="dis-label" style="top:' + it.y + 'px;left:' + LX + 'px;--d:' + d + '">' +
        '<div class="dis-n">' + String(comp.layers.length - it.k).padStart(2, '0') + '</div>' +
        '<div><div class="dis-lt">' + esc(it.L.label || it.L.id) + '</div><div class="dis-ld">' + esc(it.L.desc || '') + '</div></div></div>';
      var x0 = it.a.x, y0 = it.a.y, xm = Math.min(x0 + 28, LX - 60);
      svg += '<g style="--d:' + d + '"><circle cx="' + x0 + '" cy="' + y0 + '" r="3.5"/>' +
        '<polyline points="' + x0 + ',' + y0 + ' ' + xm + ',' + y0 + ' ' + (LX - 34) + ',' + it.y + ' ' + (LX - 14) + ',' + it.y + '"/></g>';
    });
    root.querySelector('.dis-labels').innerHTML = html;
    root.querySelector('.dis-lines').innerHTML = svg;
    void root.offsetWidth;
    root.classList.add('labeled');
  }

  // ---------- apart / together ----------
  function setApart(on){
    if(!comp) return;
    clearTimers();
    apart = on;
    root.querySelector('.dis-toggle').textContent = assemble ? (on ? 'Assemble' : 'Take apart') : (on ? 'Reassemble' : 'Disassemble');
    if(on){
      root.classList.add('apart');
      later(drawLabels, 1050 + comp.layers.length * 55);     // once the layers have settled
    } else {
      root.classList.remove('labeled');
      later(function(){ root.classList.remove('apart'); }, 220);   // labels out first, then layers home
    }
  }
  function toggle(){ setApart(!apart); }

  // ---------- open / close ----------
  function openFrom(tile, c){
    if(c === undefined){ componentFor(tile, function(r){ if(r) openFrom(tile, r); else console.warn('No component in this deck for', tile.getAttribute('data-dis')); }); return; }
    if(!c || !c.layers || !c.layers.length) return;
    build(); comp = c; sourceTile = tile; open = true; D.modal = true; D.hideZoom();
    render(c);
    assemble = tile.hasAttribute('data-assemble') || c.mode === 'assemble';
    root.classList.remove('apart', 'labeled', 'shown');
    // assembling starts from the pieces: already apart when it appears
    if(assemble){ root.classList.add('no-anim', 'apart'); root.querySelector('.dis-toggle').textContent = 'Assemble'; }
    root.hidden = false;
    if(assemble){ void root.offsetWidth; root.classList.remove('no-anim'); }
    // lift off the tile: start at the tile's spot and size, settle at center stage
    var scene = root.querySelector('.dis-scene'), r = D.stageRect(tile);
    var cx = 470, cy = 392, s = Math.min(r.w / c.w, r.h / c.h);
    scene.style.transition = 'none';
    scene.style.transform = 'translate(' + (r.x + r.w / 2 - cx) + 'px,' + (r.y + r.h / 2 - cy) + 'px) scale(' + s + ')';
    void scene.offsetWidth;
    scene.style.transition = '';
    root.classList.add('shown');
    scene.style.transform = '';
    if(assemble){ apart = true; later(drawLabels, 820); }
    else later(function(){ setApart(true); }, 760);
  }
  function close(){
    if(!open) return;
    clearTimers();
    root.classList.remove('labeled', 'apart', 'shown');
    open = false; apart = false; D.modal = false;
    later(function(){ root.hidden = true; }, 420);
  }

  // ---------- in place (data-assemble): apart inside the tile, copy swaps to the layer list ----------
  var inl = null;   // { tile, c, el, copy }
  var opening = null;
  function inlineOpen(tile, c){
    if(c === undefined){ opening = tile; componentFor(tile, function(r){ if(opening === tile){ opening = null; if(r && !inl) inlineOpen(tile, r); } }); return; }
    if(!c || !c.layers) return;
    var r = D.stageRect(tile), s = r.w / c.w;
    var el = document.createElement('div');
    el.className = 'dis-inline';
    el.style.setProperty('--s', s); el.style.setProperty('--apart-scale', c.inlineScale || (c.stack === 'vertical' ? c.apartScale || 1 : 0.68));   // kept near the tile's own frame
    el.innerHTML = '<div class="dis-iobj" style="width:' + c.w + 'px;height:' + c.h + 'px">' + layersHTML(c) + '</div>';
    var sl0 = tile.closest('.slide'), head0 = sl0 && (sl0.querySelector('.headrow') || sl0.querySelector('.display'));
    var bandTop0 = head0 ? D.stageRect(head0).y + D.stageRect(head0).h + 28 : 40, bandH0 = 720 - 36 - bandTop0;
    if(c.stack !== 'vertical'){
      // the tipped stack, drawn as tall as it lands on screen (its tilt, and the depth between layers),
      // smaller if it must be to stay between the title and the bottom edge
      var k0 = s * (c.inlineScale || 0.68), sp0 = c.spread || SPREAD;
      var tall = ((c.w * 0.588 + c.h * 0.809) * 0.559 + (c.layers.length - 1) * sp0 * 0.829);
      if(tall * k0 > bandH0) el.style.setProperty('--apart-scale', (bandH0 / tall) / s);
    }
    if(c.stack === 'vertical'){
      // every layer tips back around its own middle and gets its own row, front layer on top: rows are
      // packed top to bottom (each as tall as its tipped layer) with an even gap, centred on the tile
      var tilt = c.tilt != null ? c.tilt : 58, cos = Math.cos(tilt * Math.PI / 180), gap = c.vgap || 22;
      el.classList.add('stack-v'); el.style.setProperty('--tilt', tilt + 'deg'); el.style.setProperty('--vshift', (c.vshift != null ? c.vshift : 22) + 'px'); el.style.setProperty('--hshift', (c.hshift || 0) + 'px');
      var rows = c.layers.map(function(L, k){ var b = L.box || [0, 0, c.w, c.h]; return { k: k, b: b, h: b[3] * cos }; }).reverse();
      var total = rows.reduce(function(t, r){ return t + r.h; }, 0) + gap * (rows.length - 1), y = -total / 2;
      // the stack fits between the slide's title and its bottom edge: smaller if it must be, centred there
      var sl = tile.closest('.slide'), head = sl && (sl.querySelector('.headrow') || sl.querySelector('.display'));
      var bandTop = head ? D.stageRect(head).y + D.stageRect(head).h + 28 : 40, bandBottom = 720 - 36;
      var k = Math.min(s * (c.apartScale || 1), (bandBottom - bandTop) / total);
      el.style.setProperty('--apart-scale', k / s);
      el.style.setProperty('--vshift', ((bandTop + bandBottom) / 2 - (r.y + r.h / 2)) + 'px');
      rows.forEach(function(r){
        var d = el.querySelector('.dis-layer[data-k="' + r.k + '"]'); if(!d) return;
        var slot = y + r.h / 2, natural = r.b[1] + r.b[3] / 2 - c.h / 2;      // both from the frame's middle
        d.style.transformOrigin = '50% 50%';
        d.style.setProperty('--vy', (slot - natural) + 'px');
        y += r.h + gap;
      });
    }
    tile.appendChild(el);
    // the copy beside the tile gets the layer list, front layer first
    var copy = tile.closest('.slide').querySelector('.asm-copy');
    if(copy){
      var old = copy.querySelector('.asm-layers'); if(old) old.remove();     // its layers may have changed since
      var list = document.createElement('ol'); list.className = 'asm-layers';
      list.innerHTML = c.layers.slice().reverse().map(function(L, n){
        return '<li style="--n:' + n + '"><b>' + String(n + 1).padStart(2, '0') + '</b><span><strong>' + esc(L.label || L.id) + '</strong>' +
          (L.desc ? '<em>' + esc(L.desc) + '</em>' : '') + '</span></li>';
      }).join('');
      copy.appendChild(list);
    }
    inl = { tile: tile, c: c, el: el, copy: copy };
    if(D.featureChanged) D.featureChanged();
    void el.offsetWidth;
    tile.classList.add('asm-on');                      // the layers take over from the still
    later(function(){ if(inl && inl.el === el){ el.classList.add('apart'); if(copy) copy.classList.add('show-layers'); } }, 60);
    later(function(){ if(inl && inl.el === el) drawInlineLines(); }, 60 + 1150 + c.layers.length * 55);   // once everything has settled
  }
  // leader lines: from each pulled-apart layer to its number in the list, drawn on
  // vertical stack: move each item of the list level with its own layer (never closer than a small gap
  // to the one above), so the leader lines run across instead of bending up and down
  function alignListToLayers(it){
    var items = it.copy.querySelectorAll('.asm-layers li'), n = it.c.layers.length;
    var sr = stage.getBoundingClientRect(), z = sr.width / 1280, prevBottom = -Infinity, GAP = 14;
    Array.prototype.forEach.call(items, function(li){ li.style.setProperty('--ly', '0px'); });
    Array.prototype.forEach.call(items, function(li, m){
      var layer = it.el.querySelector('.dis-layer[data-k="' + (n - 1 - m) + '"]'); if(!layer) return;
      var pt = pinAt(layer), tr = li.getBoundingClientRect();
      var anchor = (pt.y - sr.top) / z, top = (tr.top - sr.top) / z, h = tr.height / z;
      var want = Math.max(anchor - 11, prevBottom + GAP);       // its title line on the layer's middle
      li.style.transitionDelay = '0s';
      li.style.setProperty('--ly', (want - top) + 'px');
      prevBottom = want + h;
    });
  }
  function drawInlineLines(){
    var it = inl; if(!it || !it.copy) return;
    if(it.el.classList.contains('stack-v') && !it.aligned){ it.aligned = true; alignListToLayers(it); later(drawInlineLines, 420); return; }
    var slide = it.tile.closest('.slide'), items = it.copy.querySelectorAll('.asm-layers li'), n = it.c.layers.length;
    var svg = slide.querySelector('.asm-lines');
    if(!svg){ svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'asm-lines');
      svg.setAttribute('viewBox', '0 0 1280 720'); slide.appendChild(svg); }
    var html = '';
    Array.prototype.forEach.call(items, function(li, m){
      var layer = it.el.querySelector('.dis-layer[data-k="' + (n - 1 - m) + '"]'); if(!layer) return;
      var pt = pinAt(layer), tr = li.getBoundingClientRect();
      var a = toStage(pt.x, pt.y), b = toStage(tr.left, tr.top + 11);
      var x1 = a.x, xm = Math.min(x1 + 26, b.x - 50), x2 = b.x - 12;
      // room for an elbow: out, across, in; too close for one: a single straight line, never doubling back
      var d = (x2 - 18) - xm > 8 && xm > x1 ? 'M' + x1 + ' ' + a.y + ' H' + xm + ' L' + (x2 - 18) + ' ' + b.y + ' H' + x2 : 'M' + x1 + ' ' + a.y + ' L' + x2 + ' ' + b.y;
      html += '<g style="--d:' + (m * 90) + 'ms"><circle cx="' + x1 + '" cy="' + a.y + '" r="3.5"/><path d="' + d + '"/></g>';
    });
    svg.innerHTML = html;
    Array.prototype.forEach.call(svg.querySelectorAll('path'), function(p){ var len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
    void svg.getBoundingClientRect();
    svg.classList.add('on');
  }
  function clearInlineLines(slide, instant){
    var svg = slide && slide.querySelector('.asm-lines'); if(!svg) return;
    svg.classList.remove('on');
    if(instant) svg.remove(); else setTimeout(function(){ if(!svg.classList.contains('on')) svg.remove(); }, 300);
  }
  function inlineClose(instant){
    if(!inl) return;
    var it = inl; inl = null;
    if(D.featureChanged) setTimeout(D.featureChanged, 0);
    if(it.copy) Array.prototype.forEach.call(it.copy.querySelectorAll('.asm-layers li'), function(li){ li.style.removeProperty('--ly'); li.style.transitionDelay = ''; });
    clearInlineLines(it.tile.closest('.slide'), instant);
    it.el.classList.remove('apart'); if(it.copy) it.copy.classList.remove('show-layers');
    // clicked open again before this finished: the new layers own the tile, so the still stays hidden
    var done = function(){ if(!inl || inl.tile !== it.tile) it.tile.classList.remove('asm-on'); it.el.remove(); };
    if(instant) done(); else setTimeout(done, 1000 + it.c.layers.length * 55);
  }
  D.onShow.push(function(){ opening = null; inlineClose(true); });
  D.onReset.push(function(){ if(open) close(); if(inl) inlineClose(); });
  // for the presenter's preview: which tile is taken apart in place, and a way to match it
  D.inlineTile = function(){ return inl ? inl.tile : null; };
  D.inlineSet = function(tile){
    if(tile){ if((!inl || inl.tile !== tile) && opening !== tile){ inlineClose(true); inlineOpen(tile); } }
    else if(inl) inlineClose();
  };

  // ---------- input ----------
  document.addEventListener('click', function(e){
    if(open || D.isEditing()) return;
    var t = e.target.closest && e.target.closest('#stage .slide.active [data-dis]');
    if(!t) return;
    e.stopPropagation();
    if(t.hasAttribute('data-assemble')){ if(inl && inl.tile === t) inlineClose(); else if(opening !== t){ inlineClose(true); inlineOpen(t); } }
    else openFrom(t);
  }, true);
  document.addEventListener('keydown', function(e){ if(inl && !open && e.key === 'Escape'){ e.preventDefault(); inlineClose(); } });
  // over a component tile, let clicks through the edge zones (they'd otherwise change slides)
  document.addEventListener('mousemove', function(e){
    if(open || D.isEditing()){ document.body.classList.remove('over-dis'); return; }
    var hit = document.elementsFromPoint(e.clientX, e.clientY).some(function(el){ return el.matches && el.matches('#stage .slide.active [data-dis]'); });
    document.body.classList.toggle('over-dis', hit);
  });
  document.addEventListener('keydown', function(e){
    if(!open) return;
    if(e.key === 'Escape'){ e.preventDefault(); close(); }
    else if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); toggle(); }
  });
  window.addEventListener('resize', function(){ if(open && apart && root.classList.contains('labeled')) drawLabels(); });
  D.onShow.push(function(){ if(open){ clearTimers(); root.hidden = true; root.classList.remove('labeled', 'apart', 'shown'); open = false; D.modal = false; } });
})();
