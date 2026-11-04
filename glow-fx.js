/* The glow's effects that need drawing: the pulsating grid. Smoke is pure CSS (glow.css); this handles data-glow-fx="grid".

   Any element marked data-fx (and class="glow") gets a canvas behind its content, drawn in the
   glow's palette (--g1, --g3, --g2: left, middle, right). With Motion on it runs at ~30fps:
   a slow color wave, a ring that pulses out every 6.5s, and cells that twinkle; with Motion off
   (or Reduce Motion) it holds one still frame. A host with .glow-off (a full-picture slide) isn't
   drawn at all. */
(function(){
  var PULSE_SECONDS = 6.5, FRAME_MS = 1000 / 30;
  var root = document.documentElement, hosts = [], palette = null, raf = 0, last = 0, elapsed = 12, lastPaint = 0;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function on(){ return root.getAttribute('data-glow-fx') === 'grid' && root.getAttribute('data-glow') !== 'none'; }
  function moving(){ return root.getAttribute('data-glow-motion') === 'on' && !reduced.matches; }

  // ---------- palette: three hues, each a light, mid and deep shade ----------
  var probe = document.createElement('canvas').getContext('2d');
  function rgbOf(css){                          // any CSS color (color-mix, oklab, …) to [r, g, b]
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
    var d = probe.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }
  function cssVar(name){
    var el = document.createElement('i'); el.style.color = 'var(' + name + ')'; el.style.display = 'none';
    document.body.appendChild(el); var c = getComputedStyle(el).color; el.remove(); return c;
  }
  function mix(a, b, t){ return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hue(c){ return { light: mix(c, [255, 255, 255], 0.62), mid: c, deep: mix(c, [0, 0, 0], 0.7) }; }
  function readPalette(){ palette = ['--g1', '--g3', '--g2'].map(function(n){ return hue(rgbOf(cssVar(n))); }); }
  function shade(h, l){ return l < 0.6 ? mix(h.deep, h.mid, l / 0.6) : mix(h.mid, h.light, (l - 0.6) / 0.4); }
  function color(along, l){
    var a = Math.min(1, Math.max(0, along)) * 2, i = Math.min(1, Math.floor(a)); l = Math.min(1, Math.max(0, l));
    var c = mix(shade(palette[i], l), shade(palette[i + 1], l), a - i);
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  function hash(x, y, salt){ var n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453; return n - Math.floor(n); }

  // ---------- the pulse grid: a mosaic of squares that brighten in slow waves ----------
  function draw(ctx, width, height, t){
    var pitch = Math.max(4, Math.max(height, width * 0.56) / 34);
    var cols = Math.ceil(width / pitch) + 1, rows = Math.ceil(height / pitch) + 1;
    var ox = (width - cols * pitch) / 2, oy = (height - rows * pitch) / 2;
    var pcx = cols * 0.5, pcy = rows * 0.7, reach = Math.hypot(cols, rows) * 0.75;   // the ring starts low, in the band
    var ring = ((t % PULSE_SECONDS) / PULSE_SECONDS) * reach, fade = 1 - (t % PULSE_SECONDS) / PULSE_SECONDS;
    for(var y = 0; y < rows; y++){
      for(var x = 0; x < cols; x++){
        var h = Math.sin(x * 0.06 + y * 0.03 + t * 0.05 + Math.sin(y * 0.07 - t * 0.04) * 1.8);
        var along = 0.5 + 0.5 * Math.sign(h) * Math.pow(Math.abs(h), 0.5);
        var wave = 0.24 * Math.sin(x * 0.13 - t * 0.25 + y * 0.09) * Math.cos(y * 0.07 + t * 0.18);
        var d = Math.hypot(x - pcx, y - pcy) - ring;
        var pulse = 0.5 * fade * Math.exp(-(d * d) / 5);
        var seed = hash(x, y, 1);
        var twinkle = 0.55 * Math.pow(Math.max(0, Math.sin(t * (0.5 + seed * 1.3) + seed * 40)), 10);
        var grain = (hash(x, y, 2) - 0.5) * 0.44;
        var l = Math.min(0.88, 0.5 + wave + pulse + twinkle + grain);
        ctx.fillStyle = color(along + (hash(x, y, 3) - 0.5) * 0.25, l);
        ctx.fillRect(ox + x * pitch, oy + y * pitch, pitch * 0.8, pitch * 0.8);
      }
    }
  }

  // ---------- canvases ----------
  function measure(h){
    var w = h.c.offsetWidth, ht = h.c.offsetHeight; if(!w || !ht) return false;   // the band, not the whole host
    var vis = h.c.getBoundingClientRect().width / w || 1;              // the stage is scaled to fit the window
    var dpr = Math.min((window.devicePixelRatio || 1) * vis, 2);
    var cw = Math.max(1, Math.round(w * dpr)), ch = Math.max(1, Math.round(ht * dpr));
    if(h.c.width !== cw || h.c.height !== ch){ h.c.width = cw; h.c.height = ch; }
    h.w = w; h.h = ht; return true;
  }
  function paintAll(now){
    if(moving() && lastPaint) elapsed += Math.min(100, now - lastPaint) / 1000;
    lastPaint = now;
    hosts = hosts.filter(function(h){ return h.host.isConnected; });   // layers that were removed
    hosts.forEach(function(h){
      if(h.host.classList.contains('glow-off')) return;
      var sl = h.host.closest('.slide'); if(sl && !sl.classList.contains('active')) return;   // only the slide on screen
      if(!h.host.offsetWidth){ h.w = 0; return; }                    // not on screen (the Theme menu closed)
      if(!h.w && !measure(h)) return;
      var ctx = h.c.getContext('2d'), k = h.c.width / h.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, h.c.width, h.c.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      draw(ctx, h.w, h.h, elapsed);
    });
  }
  function tick(now){
    raf = requestAnimationFrame(tick);
    if(now - last < FRAME_MS) return;
    last = now; paintAll(now);
  }
  function sync(){
    cancelAnimationFrame(raf); raf = 0;
    hosts.forEach(function(h){ h.c.hidden = !on(); });
    if(!on()) return;
    readPalette();
    hosts.forEach(measure);
    lastPaint = 0; paintAll(performance.now());
    if(moving() && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function mount(host){
    if(host._fx) return;
    var c = document.createElement('canvas'); c.className = 'glow-fx'; c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    host._fx = { host: host, c: c, w: 0, h: 0 };
    hosts.push(host._fx);
  }

  function start(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-fx]'), mount);
    // any change to the theme (effect, motion, palette, accent, light / dark) redraws with it
    new MutationObserver(function(){ clearTimeout(start._t); start._t = setTimeout(sync, 30); })
      .observe(root, { attributes: true, attributeFilter: ['data-glow-fx', 'data-glow-motion', 'data-glow', 'data-glow-color', 'data-theme', 'style'] });
    // a host turning back on (a slide without a picture) repaints at once
    hosts.forEach(function(h){ new MutationObserver(function(){ if(!raf && on()) paintAll(performance.now()); }).observe(h.host, { attributes: true, attributeFilter: ['class'] }); });
    window.addEventListener('resize', function(){ hosts.forEach(function(h){ h.w = 0; }); if(on()) paintAll(performance.now()); });
    document.addEventListener('visibilitychange', sync);
    if(reduced.addEventListener) reduced.addEventListener('change', sync);
    sync();
  }
  // a host added later (a picture slide's theme layer)
  function mountLater(host){ mount(host); host._fx.c.hidden = !on(); if(on()){ readPalette(); paintAll(performance.now()); } }
  window.GlowFX = { mount: mountLater, refresh: function(){ hosts.forEach(function(h){ h.w = 0; }); sync(); } };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
