/* Results and Chart slides: what they hold, and how they are drawn.

   A Results slide shows one to four big numbers; a Chart slide shows bars, a line, a pie or a donut.
   What a slide shows is kept on its entry in the deck (seed.added[k].ds):
     results   { rows: [{ v: '38,400', l: 'what it is', c: '+62% since spring', t: 'good' | 'watch' | 'plain' }], anim }
     chart     { type: 'bars' | 'line' | 'pie' | 'donut', rows: [[label, value, own colour?]], hi, pre, post, color, anim }
   hi is the row the headline is about (drawn in the accent); pre and post go before and after each
   value; a row's own colour (or the line's, color) replaces the theme's; anim false keeps it still.

   This file only draws: draw(host, ds, ms) paints the slide as it looks ms milliseconds after it
   appeared (a large number: finished). It loads before the engine, which fills each slide's host
   as it builds the deck; features/data-slides.js plays the motion and edits the numbers. */
(function(){
  var W = 640, H = 440;
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clamp(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
  function out(x){ x = clamp(x); return 1 - Math.pow(1 - x, 3); }
  function inout(x){ x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function hex(c){ return /^#[0-9a-f]{6}$/i.test(c || '') ? c : ''; }
  function num(x){ var n = parseFloat(String(x).replace(/,/g, '')); return isFinite(n) ? n : 0; }

  // ---------- what a new slide starts with (the sample deck's made-up fitness app) ----------
  var SAMPLE = {
    results: { rows: [ { v: '38,400', l: 'People training with Pace', c: '+62% since spring', t: 'good' }, { v: '71%', l: 'Finish the session they start', c: '+18 points on fixed plans', t: 'good' },
                       { v: '3.4', l: 'Sessions a week, on average', c: '−0.2 over the summer', t: 'watch' }, { v: '4.8', l: 'Rating in the app stores', c: 'From 2,100 reviews', t: 'plain' } ] },
    series: { rows: [['Jan', 42], ['Feb', 48], ['Mar', 55], ['Apr', 61], ['May', 72], ['Jun', 86]], hi: 5, pre: '', post: 'k' },
    parts: { rows: [['Under 20 minutes', 46], ['20 to 40', 31], ['40 to 60', 15], ['Over an hour', 8]], hi: 0, pre: '', post: '%' }
  };
  var LEADS = { series: 'Sessions finished each month, in thousands.', parts: 'How long a session lasts, as a share of all sessions.' };
  var TYPES = ['bars', 'line', 'pie', 'donut'], MAX = { results: 4, bars: 12, line: 12, pie: 8, donut: 8 };
  function family(type){ return type === 'pie' || type === 'donut' ? 'parts' : 'series'; }
  function copy(o){ return JSON.parse(JSON.stringify(o)); }
  // a slide's data, whole: whatever is missing comes from the sample
  function norm(kind, ds){
    ds = ds ? copy(ds) : {};
    if(kind === 'results'){
      if(!Array.isArray(ds.rows) || !ds.rows.length) ds.rows = copy(SAMPLE.results.rows);
      ds.rows = ds.rows.slice(0, MAX.results).map(function(r){ return { v: String(r.v == null ? '' : r.v), l: String(r.l || ''), c: String(r.c || ''), t: /^(good|watch|plain)$/.test(r.t) ? r.t : 'plain' }; });
      return ds;
    }
    if(TYPES.indexOf(ds.type) < 0) ds.type = 'bars';
    var base = SAMPLE[family(ds.type)];
    if(!Array.isArray(ds.rows) || !ds.rows.length){ ds.rows = copy(base.rows); if(ds.hi == null) ds.hi = base.hi; if(ds.pre == null) ds.pre = base.pre; if(ds.post == null) ds.post = base.post; }
    ds.rows = ds.rows.slice(0, MAX[ds.type]).map(function(r){ var o = [String(r[0] == null ? '' : r[0]), r[1] == null ? 0 : r[1]]; if(hex(r[2])) o.push(r[2]); return o; });
    ds.hi = Math.max(0, Math.min(ds.rows.length - 1, ds.hi | 0)); ds.pre = String(ds.pre || ''); ds.post = String(ds.post || '');
    return ds;
  }

  // ---------- numbers and words ----------
  // "£1.84m" -> what comes before the number, the number, what comes after; so it can count up in its own style
  function parts(v){
    var m = /^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(String(v)); if(!m) return null;
    return { pre: m[1], n: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, sep: m[2].indexOf(',') > -1, post: m[3] };
  }
  function show(n, dec, sep){ return sep ? n.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : n.toFixed(dec); }
  function decimals(rows){ return Math.min(2, Math.max.apply(null, rows.map(function(r){ return (String(r[1]).split('.')[1] || '').length; }).concat([0]))); }
  function val(d, n, dec){ return d.pre + show(n, dec, Math.abs(n) >= 10000) + d.post; }
  var pen = null;
  function fontOf(host, name){
    var v = ''; try { v = getComputedStyle(host.isConnected ? host : document.documentElement).getPropertyValue(name); } catch(e){}
    return (v || '').trim() || '"Inter", system-ui, sans-serif';
  }
  // a text's width in ems, in the slide's own face
  function wide(text, weight, face){
    if(!pen){ try { pen = document.createElement('canvas').getContext('2d'); } catch(e){ pen = null; } }
    if(!pen) return String(text).length * 0.58;
    pen.font = (weight || 500) + ' 100px ' + face; return pen.measureText(text).width / 100;
  }
  function cut(text, room, size, face){ text = String(text); if(wide(text, 500, face) * size <= room) return text; while(text.length > 1 && wide(text + '…', 500, face) * size > room) text = text.slice(0, -1); return text + '…'; }

  // a row's colour: its own, else the theme's (the accent for the one picked out, quieter tones for the rest)
  function tone(d, i){
    if(hex(d.rows[i][2])) return d.rows[i][2];
    if(i === d.hi) return 'var(--accent)';
    if(d.type === 'bars') return 'var(--ds-rest)';
    var k = 0; for(var j = 0; j < i; j++) if(j !== d.hi) k++;
    return 'color-mix(in oklab, var(--accent) ' + Math.max(9, Math.round(58 * Math.pow(0.66, k))) + '%, var(--surface-2))';
  }

  // ---------- Results ----------
  // opts (Sleek Docs gives them: a page is narrower than a slide): width, the room across in px (a slide's 1072 unless given); max, the largest the numbers may be
  function results(host, d, e, opts){
    var n = d.rows.length, cols = n === 4 ? 2 : n, colW = (((opts && opts.width) || 1072) - (cols - 1) * 40) / cols, face = fontOf(host, '--ff-display');   // four numbers sit two by two, so they stay large
    var widest = Math.max.apply(null, d.rows.map(function(r){ return wide(String(r.v), 600, face) - 0.04 * String(r.v).length; }).concat([0.5]));
    var size = Math.max(Math.min(36, (opts && opts.max) || 36), Math.min([0, 176, 128, 100, 84][n] || 84, (opts && opts.max) || 1e9, Math.floor(colW * 0.98 / widest)));
    var h = '<div class="ds-stats" style="grid-template-columns: repeat(' + cols + ', minmax(0, 1fr))">';
    d.rows.forEach(function(r, i){
      var at = e - 200 - i * 140, a = out(at / 500), k = out(at / 1100), c = out((at - 850) / 420), p = parts(r.v);
      var text = p ? esc(p.pre) + show(p.n * k, p.dec, p.sep) + esc(p.post) : esc(r.v);
      var first = String(r.c).trim().charAt(0), dir = first === '+' ? 1 : (first === '-' || first === '−') ? -1 : 0;
      var arrow = dir ? '<svg width="11" height="10" viewBox="0 0 11 10" aria-hidden="true"><path d="' + (dir > 0 ? 'M5.5 0 11 10H0z' : 'M5.5 10 0 0h11z') + '" fill="currentColor"/></svg>' : '';
      h += '<div class="ds-stat" style="--k: ' + inout((at + 200) / 700).toFixed(4) + '">' +
        '<div class="ds-num" style="font-size: ' + size + 'px; opacity: ' + a.toFixed(3) + '; transform: translateY(' + ((1 - a) * 14).toFixed(2) + 'px)">' + text + '</div><div class="ds-what" style="opacity: ' + a.toFixed(3) + '">' + esc(r.l) + '</div>' +
        '<div class="ds-chg ds-' + r.t + '" style="opacity: ' + c.toFixed(3) + '; transform: translateX(' + ((1 - c) * -10).toFixed(2) + 'px)">' + arrow + '<span>' + esc(r.c) + '</span></div></div>';
    });
    host.innerHTML = h + '</div>';
  }

  // ---------- Chart ----------
  function bars(d, e, face){
    var n = d.rows.length, dec = decimals(d.rows), max = Math.max.apply(null, d.rows.map(function(r){ return num(r[1]); }).concat([0])) || 1;
    var band = W / n, bw = Math.min(band * 0.64, 86), base = 384, top = 44, small = n > 8, s = '';
    var fs = small ? 14 : 18, all = d.rows.every(function(r){ return wide(val(d, Math.max(0, num(r[1])), dec), 600, face) * fs <= band - 6; });
    s += '<line x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '" stroke="var(--line-strong)" stroke-width="1"/>';
    d.rows.forEach(function(r, i){
      var v = Math.max(0, num(r[1])), k = out((e - 250 - i * 70) / 800), h = (v / max) * (base - top) * k, x = band * i + (band - bw) / 2, y = base - h, hi = i === d.hi, rr = Math.min(8, bw / 2, h);
      s += '<path d="M' + x + ' ' + base + 'V' + (y + rr) + 'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + (-rr) + 'h' + (bw - 2 * rr) + 'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + rr + 'V' + base + 'z" fill="' + tone(d, i) + '"/>';
      if(all || hi) s += '<text x="' + (x + bw / 2) + '" y="' + (y - 12) + '" text-anchor="middle" font-size="' + (all ? fs : 18) + '" font-weight="' + (hi ? 600 : 500) + '" fill="' + (hi ? 'var(--fg)' : 'var(--muted)') + '" opacity="' + clamp(k * 2).toFixed(3) + '">' + esc(val(d, v * k, dec)) + '</text>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (base + 30) + '" text-anchor="middle" font-size="' + (small ? 13 : 15) + '" fill="' + (hi ? 'var(--fg)' : 'var(--faint)') + '">' + esc(cut(r[0], band - 6, small ? 13 : 15, face)) + '</text>';
    });
    return s;
  }
  var uidN = 0;
  function line(d, e, face){
    var n = d.rows.length, dec = decimals(d.rows), vs = d.rows.map(function(r){ return Math.max(0, num(r[1])); }), max = Math.max.apply(null, vs.concat([0])) || 1;
    var base = 384, top = 60, pad = 36, small = n > 8, k = inout((e - 250) / 1100), reveal = pad - 14 + (W - 2 * pad + 28) * k;
    var gap = n > 1 ? (W - 2 * pad) / (n - 1) : W, fs = small ? 13 : 15, all = vs.every(function(v){ return wide(val(d, v, dec), 500, face) * fs <= gap - 6; });
    var col = hex(d.color) || 'var(--accent)', id = 'ds' + (++uidN);                 // ids are per drawing: a deck can show the same chart twice (the slide and its previews)
    var P = vs.map(function(v, i){ return [n > 1 ? pad + i * (W - 2 * pad) / (n - 1) : W / 2, base - (v / max) * (base - top)]; });
    var path = 'M' + P[0][0] + ' ' + P[0][1];
    for(var i = 1; i < n; i++){ var mx = (P[i - 1][0] + P[i][0]) / 2; path += 'C' + mx + ' ' + P[i - 1][1] + ' ' + mx + ' ' + P[i][1] + ' ' + P[i][0] + ' ' + P[i][1]; }
    var s = '<defs><linearGradient id="' + id + 'a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity="0.34"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="' + id + 'r"><rect x="0" y="0" width="' + reveal.toFixed(2) + '" height="' + H + '"/></clipPath></defs>';
    s += '<line x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '" stroke="var(--line-strong)" stroke-width="1"/>';
    s += '<g clip-path="url(#' + id + 'r)"><path d="' + path + 'L' + P[n - 1][0] + ' ' + base + 'L' + P[0][0] + ' ' + base + 'z" style="fill: url(#' + id + 'a) color-mix(in srgb, ' + col + ' 14%, transparent)"/><path d="' + path + '" fill="none" stroke="' + col + '" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>';
    P.forEach(function(p, j){
      var on = out((reveal - p[0]) / 26 + 0.2), hi = j === d.hi;
      if(hi) s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (13 * on).toFixed(2) + '" fill="' + col + '" opacity="0.22"/>';
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + ((hi ? 7 : 4.5) * on).toFixed(2) + '" fill="' + (hi ? col : 'var(--bg)') + '" stroke="' + col + '" stroke-width="' + (hi ? 0 : 2.5) + '"/>';
      if(all || hi) s += '<text x="' + p[0] + '" y="' + (p[1] - (hi ? 24 : 16)) + '" text-anchor="middle" font-size="' + (hi ? 20 : fs) + '" font-weight="' + (hi ? 600 : 500) + '" fill="' + (hi ? 'var(--fg)' : 'var(--muted)') + '" opacity="' + on.toFixed(3) + '">' + esc(val(d, vs[j], dec)) + '</text>';
      s += '<text x="' + p[0] + '" y="' + (base + 30) + '" text-anchor="middle" font-size="' + fs + '" fill="' + (hi ? 'var(--fg)' : 'var(--faint)') + '">' + esc(cut(d.rows[j][0], gap - 6, fs, face)) + '</text>';
    });
    return s;
  }
  function pie(d, e, hole, face){
    var vs = d.rows.map(function(r){ return Math.max(0, num(r[1])); }), sum = vs.reduce(function(a, b){ return a + b; }, 0), n = vs.length, dec = decimals(d.rows);
    if(!(sum > 0)) return '';
    var cx = 180, cy = 220, R = 172, r0 = hole ? 108 : 0, sweep = 360 * inout((e - 250) / 1150), a = 0, s = '';
    var pt = function(rad, deg){ var t = (deg - 90) * Math.PI / 180; return (cx + rad * Math.cos(t)).toFixed(2) + ' ' + (cy + rad * Math.sin(t)).toFixed(2); };
    var rowH = Math.min(50, 400 / n), ly = cy - (n * rowH) / 2, lx = 404, fs = rowH < 40 ? 15 : 18, isPct = d.post.trim() === '%';
    d.rows.forEach(function(r, i){
      var span = vs[i] / sum * 360, from = a, to = Math.min(a + span, sweep), hi = i === d.hi, fill = tone(d, i); a += span;
      if(to > from + 0.01){
        var big = to - from > 180 ? 1 : 0, whole = to - from >= 359.99;
        if(whole) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r0) / 2) + '" fill="none" stroke="' + fill + '" stroke-width="' + (R - r0) + '"/>';
        else s += '<path d="M' + pt(R, from) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + pt(R, to) + (r0 ? 'L' + pt(r0, to) + 'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + pt(r0, from) : 'L' + cx + ' ' + cy) + 'z" fill="' + fill + '" stroke="var(--bg)" stroke-width="' + (n > 1 ? 2.5 : 0) + '" stroke-linejoin="round"/>';
      }
      var on = out((sweep - from) / 40), y = ly + rowH * i + rowH / 2, share = vs[i] / sum * 100, value = val(d, vs[i], dec) + (isPct ? '' : '  ' + Math.round(share) + '%');
      var room = W - (lx + 26) - wide(value, 600, face) * fs - 14;
      s += '<g opacity="' + on.toFixed(3) + '" transform="translate(' + ((1 - on) * 10).toFixed(2) + ' 0)"><circle cx="' + (lx + 7) + '" cy="' + y + '" r="6.5" fill="' + fill + '"/>' +
        '<text x="' + (lx + 26) + '" y="' + (y + 6) + '" font-size="' + fs + '" font-weight="' + (hi ? 600 : 400) + '" fill="' + (hi ? 'var(--fg)' : 'var(--muted)') + '">' + esc(cut(r[0], room, fs, face)) + '</text>' +
        '<text x="' + W + '" y="' + (y + 6) + '" text-anchor="end" font-size="' + fs + '" font-weight="600" fill="var(--fg)">' + esc(val(d, vs[i], dec)) + (isPct ? '' : '<tspan font-weight="400" fill="var(--faint)" font-size="14">  ' + Math.round(share) + '%</tspan>') + '</text></g>';
    });
    if(hole && d.rows[d.hi]){
      var k = inout((e - 250) / 1150);
      s += '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="60" font-weight="600" letter-spacing="-2" fill="var(--fg)">' + Math.round(vs[d.hi] / sum * 100 * k) + '%</text>' +
        '<text x="' + cx + '" y="' + (cy + 42) + '" text-anchor="middle" font-size="15" fill="var(--faint)">' + esc(cut(d.rows[d.hi][0], 190, 15, face)) + '</text>';
    }
    return s;
  }
  function chart(host, d, e){
    var face = fontOf(host, '--ff-body'), svg = d.type === 'bars' ? bars(d, e, face) : d.type === 'line' ? line(d, e, face) : pie(d, e, d.type === 'donut', face);
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(d.rows.map(function(r){ return r[0] + ' ' + val(d, num(r[1]), decimals(d.rows)); }).join(', ')) + '">' + svg + '</svg>';
  }

  // ---------- the slide ----------
  function kindOf(host){ return host.getAttribute('data-ds') === 'results' ? 'results' : 'chart'; }
  // paint a host as it looks ms after its slide appeared; returns how long its motion lasts
  function draw(host, ds, ms, opts){
    if(kindOf(host) === 'results'){ results(host, ds, ms, opts); return 200 + (ds.rows.length - 1) * 140 + 1300; }
    chart(host, ds, ms); return ds.type === 'bars' ? 500 + ds.rows.length * 70 + 800 : 1500;
  }
  // a slide made from the Results or Chart layout: its host takes the slide's data (a: its entry in the deck;
  // none: the layout as the picker shows it) and is drawn finished
  function build(el, a){
    var host = el && el.querySelector && el.querySelector('.ds-host'); if(!host) return null;
    var kind = kindOf(host), ds = norm(kind, a && a.ds);
    host._ds = ds;
    if(kind === 'chart'){
      host.setAttribute('data-type', ds.type);
      var lead = el.querySelector('.ds-copy .lead');                     // the layout's own sentence follows the kind of chart shown
      if(lead && (lead.textContent.trim() === LEADS.series || lead.textContent.trim() === LEADS.parts)) lead.textContent = LEADS[family(ds.type)];
    }
    draw(host, ds, 1e9);
    return host;
  }

  window.SleekData = { build: build, draw: draw, norm: norm, kindOf: kindOf, family: family, tone: tone, hex: hex, copy: copy, SAMPLE: SAMPLE, TYPES: TYPES, MAX: MAX };
})();
