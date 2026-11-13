/* The film engine. It builds the film's decks, loads the app into the frames, and then, for any
   moment t, places the windows under the camera, draws the captions and the pointer, and hands the
   renderer the real input (clicks, drags, keys) that moment calls for. Everything is worked out from
   t, so the same t always gives the same picture. */
(function(){
  'use strict';
  var Q = new URLSearchParams(location.search), TALL = Q.get('shape') === 'tall';
  var W = TALL ? 1080 : 1920, H = TALL ? 1920 : 1080;
  var $ = function(id){ return document.getElementById(id); };
  var stage = $('stage'); stage.style.width = W + 'px'; stage.style.height = H + 'px';
  var ART = 'tools/film/art/';

  // the frames, and the size each page is laid out at
  var FR = { A: { w: 1600, h: 900 }, B: { w: 1600, h: 900 }, C: { w: 1600, h: 900 }, P: { w: 1000, h: 600 }, S: { w: 1600, h: 900 } };
  Object.keys(FR).forEach(function(k){ var f = FR[k]; f.el = $('f-' + k); f.slot = $('slot-' + k); f.el.style.width = f.w + 'px'; f.el.style.height = f.h + 'px'; });

  var TL = null;
  function makeTimeline(){ TL = window.FILM_TIMELINE({ tall: TALL, W: W, H: H, build: build, look: look, id: function(k){ return ids[k]; } });
  TL.cues.sort(function(a, b){ return a.t - b.t; }); TL.ptr.sort(function(a, b){ return a.t - b.t; }); }

  // ---------------------------------------------------------------- the film's decks
  // Three made-up products, so the film isn't one deck: Pace (a fitness app), Tally (a money app) and
  // Atlas (a travel site). Each is the sample deck with its own pictures (tools/film/art), words and theme.
  var pic = function(n, m){ return ART + n + '-' + m + '.webp'; }, GONE = '<!--removed-->';
  var WORLDS = {
    pace: { shots: ['today', 'workout', 'plan'], names: ['Today', 'Workout', 'Plan'] },
    tally: { shots: ['overview', 'spending', 'cards'], names: ['Overview', 'Spending', 'Cards'],
      theme: { mode: 'dark', accent: '#5B8CFF', glow: 'spotlight', glowColor: 'ocean', motion: 'on', fx: 'smoke' },
      text: { 'title.t0': 'Tally · Design review', 'title.t1': 'Tally', 'title.t2': 'A money app that shows where it went, before you ask.',
        'statement.t1': 'Money you can see is money you keep.', 'statement.t2': 'One screen for what came in, what went out and what is left.',
        'results.t0': '<span class="tick">Tally ·</span> Year one', 'results.t1': 'The first year, in four numbers.' },
      results: { rows: [{ v: '412,000', l: 'People budgeting with Tally', c: '+58% since launch', t: 'good' }, { v: '$1,240', l: 'Saved per person, on average', c: '+$310 on last year', t: 'good' },
        { v: '87%', l: 'Still here after three months', c: '+9 points', t: 'good' }, { v: '4.9', l: 'Rating in the app stores', c: 'From 18,000 reviews', t: 'plain' }] } },
    atlas: { shots: ['explore', 'trip'], names: ['Explore', 'Your trip'],
      theme: { mode: 'light', accent: '#0E9F8E', glow: 'horizon', glowColor: 'gold', motion: 'on', fx: 'grid' },
      text: { 'title.t0': 'Atlas · Launch review', 'title.t1': 'Atlas', 'title.t2': 'Trips planned around the weeks you are free.',
        'statement.t1': 'The best trips leave room to wander.', 'statement.t2': 'Atlas plans the route and keeps the afternoons free.',
        'chart.t0': '<span class="tick">Atlas ·</span> Where people go', 'chart.t1': 'City breaks lead the way.', 'chart.t2': 'Trips booked this year, by kind.' },
      chart: { type: 'donut', rows: [['City breaks', 44], ['Coast', 27], ['Mountains', 18], ['Road trips', 11]], hi: 0, pre: '', post: '%' },
      screen: { img: 'explore', ann: [
          { x: 9.6, y: 55.6, title: 'One clear next step', note: 'The only dark button on the page.', color: '#7AD3FF' },
          { x: 23.4, y: 93.2, title: 'Price, always in view', note: 'Nobody should have to open a trip to see what it costs.', color: '#FFB648' }],
        shapes: [
          { type: 'box', x: 58.75, y: 10.7, w: 38.5, h: 52.2, title: 'Made for you', note: 'Built from saved trips and free weeks, so it feels picked, not listed.', spot: true },
          { type: 'arrow', x1: 57, y1: 17, x2: 65, y2: 6.5, title: 'Search', note: 'Where, when, who. Three answers and you are looking at trips.' }] } }
  };
  function filmSeed(world){
    var s = JSON.parse(JSON.stringify(window.SLEEK_SAMPLE.seed)), wd = WORLDS[world], m = s.media = {}, tx = s.text = {};
    for(var i = 0; i < 3; i++){
      var n = wd.shots[i];
      if(n){
        m['gallery.m' + i] = pic(n, 'after'); m['b:gallery.m' + i] = 'none';
        m['statement.m' + i] = pic(n, 'after');
        m['carousel.m' + i] = pic(n, 'before');
        m['before-after.m' + i] = pic(n, 'after'); m['b:before-after.m' + i] = pic(n, 'before');
        ['gallery', 'carousel', 'before-after'].forEach(function(sl){ tx[sl + '.t' + (i + 2)] = wd.names[i]; });
        tx['statement.t' + (i + 3)] = wd.names[i];
      } else {                                                   // a product with two screens: its third places show the first two as sketches
        m['statement.m' + i] = pic(wd.shots[0], 'before'); tx['statement.t' + (i + 3)] = wd.names[0];
        m['gallery.m' + i] = pic(wd.shots[0], 'before'); m['b:gallery.m' + i] = 'none';
        ['carousel', 'before-after'].forEach(function(sl){ tx[sl + '.t' + (i + 2)] = GONE; });
      }
    }
    m['statement.m3'] = pic(wd.shots[1], 'before'); tx['statement.t6'] = wd.names[1];
    Object.keys(wd.text || {}).forEach(function(k){ tx[k] = wd.text[k]; });
    if(wd.theme) s.theme = wd.theme;
    // a drifting moodboard of every product's screens and sketches, with the sample's own pieces
    var S2 = 'assets/sample/', items = [[pic('today', 'after'), 1.7778], [S2 + 'phone.svg', 0.5625], [pic('explore', 'after'), 1.7778], [pic('overview', 'before'), 1.7778], [S2 + 'swatch.svg', 1], [pic('cards', 'after'), 1.7778],
      [S2 + 'type.svg', 0.8], [pic('trip', 'after'), 1.7778], [pic('workout', 'before'), 1.7778], [S2 + 'icon.svg', 1], [pic('overview', 'after'), 1.7778], [pic('plan', 'after'), 1.7778], [pic('explore', 'before'), 1.7778], [pic('workout', 'after'), 1.7778]];
    s.added.forEach(function(e){ if(e.id === 'moodboard') e.cl = { style: 'masonry', motion: 'drift', mix: 3, items: items.map(function(it, i){ return { id: 'f' + i, r: it[1], def: it[0] }; }) }; });
    s.added.forEach(function(e){ if(e.id === 'results' && wd.results) e.ds = wd.results; if(e.id === 'chart' && wd.chart) e.ds = wd.chart; });   // each product's own numbers
    var sc = s.annotations.screens[0], ws = wd.screen;
    if(ws){ sc.img = pic(ws.img, 'after'); sc.ann = ws.ann; sc.shapes = ws.shapes; }
    else {                                                       // Pace: the finished workout screen, with its notes where they belong on it
      sc.img = pic('workout', 'after');
      sc.ann = [
        { x: 24.4, y: 63.4, title: 'One tap forward', note: 'Big enough to hit mid-set, with sweaty hands.', color: '#7AD3FF' },
        { x: 61.8, y: 59.6, title: 'Sets, reps, rest', note: 'The three numbers people glance at between sets. Each one feeds the week’s plan.', color: '#FFB648', images: [pic('plan', 'after')] }];
      sc.shapes = [
        { type: 'box', x: 7.75, y: 72, w: 89.7, h: 24.2, title: 'Heart rate', note: 'Live effort, so the session can ease off before it gets too hard.', spot: true },
        { type: 'arrow', x1: 64, y1: 17, x2: 70.5, y2: 8.5, title: 'Search', note: 'Search by move, by muscle or by how long you have.' }];
    }
    return s;
  }
  function sideSeed(theme){
    var s = JSON.parse(JSON.stringify(window.SLEEK_SAMPLE.seed)); s.added = s.added.slice(0, 6); s.annotations = { screens: [] };
    s.theme = Object.assign({ mode: 'dark', glow: 'aurora', glowColor: 'dusk', motion: 'on', fx: 'smoke' }, theme); return s;
  }
  var S = window.SleekStore, ids = {};
  function ls(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function makeDecks(){
    ['sleek-sample-added', 'sleek-film'].forEach(function(k){ ls(k, '1'); }); ls('sleek-tour', 'done'); ls('sleek-tips', 'off');
    var make = [
      ['x1', 'Design crit', sideSeed({ accent: '#C9A227', glow: 'horizon', glowColor: 'gold' }), { k: 'Weekly', h: 'Design crit' }],
      ['x2', 'What we heard', sideSeed({ accent: '#9A7CF0', glow: 'corners', glowColor: 'dusk' }), { k: 'Research readout', h: 'What we heard' }],
      ['x3', 'Q3 roadmap', sideSeed({ accent: '#2FB8A0', glow: 'corners', glowColor: 'verdant' }), { k: 'Product', h: 'Q3 roadmap' }],
      ['C', 'Atlas', filmSeed('atlas'), { k: 'Atlas · Launch review', h: 'Atlas' }],
      ['B', 'Tally', filmSeed('tally'), { k: 'Tally · Design review', h: 'Tally' }],
      ['A', 'Pace', filmSeed('pace'), { k: 'Pace · Product review', h: 'Pace' }]
    ];
    return S.open().then(function(){ return S.list(); })
      .then(function(l){ return l.reduce(function(p, d){ return p.then(function(){ return S.remove(d.id); }); }, Promise.resolve()); })
      .then(function(){ return make.reduce(function(p, mk){ return p.then(function(){ return S.create({ title: mk[1], seed: mk[2], cover: mk[3] }).then(function(d){ ids[mk[0]] = d.id; }); }); }, Promise.resolve()); });
  }
  // what the film adds to the app's pages: no bar, slides that cut, and the "assembly" a slide can arrive with
  var CSS = 'html.film-nobar #bar{display:none!important}.slide{transition:none!important}' +
    '@keyframes film-snap{0%{opacity:0;transform:translateY(34px) scale(.9);filter:blur(8px)}62%{opacity:1;transform:translateY(-4px) scale(1.015);filter:blur(0)}100%{opacity:1;transform:none}}' +
    '.film-b{animation:film-snap .42s cubic-bezier(.2,.8,.3,1) both;animation-delay:var(--fd,0s)}' +
    '#stage::before,#stage::after,#stage>.glow-fx{transition:opacity .5s ease-out}' +
    '#stage.film-fx0::before,#stage.film-fx0::after,#stage.film-fx0>.glow-fx{opacity:0!important;transition:none}';
  function dress(k){
    var f = FR[k].el, d = f.contentDocument, w = f.contentWindow;
    var st = d.createElement('style'); st.textContent = CSS; d.head.appendChild(st);
    d.documentElement.classList.add('film-nobar'); w.dispatchEvent(new w.Event('resize'));
  }
  // a slide arrives in pieces: its parts snap into place one after another, then the backdrop's effect lands on top
  function build(w, d, gap){
    var s = d.querySelector('.slide.active'), st = d.getElementById('stage'); if(!s) return;
    var parts = [];
    Array.prototype.forEach.call(s.children, function(c){
      if(c.tagName === 'TEMPLATE' || c.classList.contains('ann-layer') || !c.getBoundingClientRect().width) return;
      var kids = Array.prototype.filter.call(c.children, function(x){ return x.getBoundingClientRect().width > 0; });
      var whole = kids.length < 2 || kids.length > 8;
      if(whole) parts.push(c); else kids.forEach(function(x){ parts.push(x); });
    });
    // anything that scrolls by itself, is tilted or is already moving is left alone: it is simply there, scrolling
    parts = parts.filter(function(el){
      var cs = w.getComputedStyle(el);
      return cs.transform === 'none' && cs.animationName === 'none' && !el.matches('.filmstrip, .carousel, .cl-board') && !el.querySelector('.fs-track, .car-track, .cl-track, .filmstrip');
    });
    parts.forEach(function(el, i){ el.style.setProperty('--fd', (i * (gap || 0.07)).toFixed(2) + 's'); el.classList.add('film-b'); });
    st.classList.add('film-fx0');
    w.setTimeout(function(){ st.classList.remove('film-fx0'); }, 240 + parts.length * 40);
    w.setTimeout(function(){ parts.forEach(function(el){ el.classList.remove('film-b'); el.style.removeProperty('--fd'); }); }, 1600);
  }
  // a look, set the way the Theme panel sets it (its controls, pressed without opening it)
  var ACC = { blue: '#0A84FF', gold: '#C9A227', violet: '#9A7CF0', teal: '#2FB8A0' }, STY = ['aurora', 'horizon', 'corners', 'spotlight', 'none'],
      COL = ['dusk', 'ember', 'ocean', 'verdant', 'gold'], FONT = ['inter', 'geist', 'manrope', 'grotesk', 'sora', 'editorial'];
  function look(w, d, o){
    var press = function(el){ if(el) el.click(); }, nth = function(sel, i){ return d.querySelectorAll(sel)[i]; };
    if(!d.querySelector('#tp-styles > *')){ press(d.getElementById('accent-dot')); press(d.getElementById('accent-dot')); }
    if(o.mode && d.documentElement.getAttribute('data-theme') !== o.mode) press(d.getElementById('theme'));
    if(o.accent) press(d.querySelector('#swatches .sw[data-accent="' + ACC[o.accent] + '"]'));
    if(o.style) press(nth('#tp-styles > *', STY.indexOf(o.style)));
    if(o.color) press(nth('#tp-colors > *', COL.indexOf(o.color)));
    if(o.font) press(nth('#tp-fonts > *', FONT.indexOf(o.font)));
    if(o.fx) press(d.querySelector('#tp-fx [data-v="' + o.fx + '"]'));
  }
  function load(k, src){ return new Promise(function(res){ FR[k].el.addEventListener('load', function(){ res(); }, { once: true }); FR[k].el.src = src; }); }
  function booted(k){ try { var w = FR[k].el.contentWindow; return !!(w.Deck && w.document.querySelector('.slide.active')); } catch(e){ return false; } }
  function until(test, then){ (function again(){ if(test()) then(); else setTimeout(again, 100); })(); }
  makeDecks().then(function(){
    var q = function(k){ return '../../deck.html?d=' + encodeURIComponent(ids[k]); };
    return load('A', q('A') + '#title').then(function(){ return load('B', q('B') + '#statement'); }).then(function(){ return load('C', q('C') + '#moodboard'); })
      .then(function(){ return new Promise(function(r){ until(function(){ return booted('A') && booted('B') && booted('C'); }, r); }); })
      .then(function(){ dress('A'); dress('B'); dress('C'); return load('P', q('A') + '#presenter'); })
      .then(function(){ return load('S', '../../slides.html'); })
      .then(function(){ return document.fonts.ready; })
      .then(function(){ setTimeout(function(){ FILM.ready = true; }, 3500); });      // a few seconds for pictures, the presenter's preview and the glow to settle
  });

  // ---------------------------------------------------------------- maths
  var clamp = function(u){ return u < 0 ? 0 : u > 1 ? 1 : u; };
  var EASE = {
    io: function(u){ return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    out: function(u){ return 1 - Math.pow(1 - u, 3); },
    lin: function(u){ return u; },
    soft: function(u){ return u * u * (3 - 2 * u); }
  };
  var seg = function(t, a, b){ return clamp((t - a) / (b - a)); };
  // a value that is either fixed ([..numbers]) or keyed ([[t, [..numbers]], ...]): its numbers at t
  function val(v, t){
    if(!v) return null;
    if(typeof v[0] === 'number') return v;
    if(t <= v[0][0]) return v[0][1];
    for(var i = 0; i < v.length - 1; i++){
      var a = v[i], b = v[i + 1];
      if(t < b[0]){ var u = EASE[b[2] || 'io'](seg(t, a[0], b[0])); return a[1].map(function(x, j){ return x + (b[1][j] - x) * u; }); }
    }
    return v[v.length - 1][1];
  }

  // ---------------------------------------------------------------- where things are
  function inFrame(k, x, y){ var f = FR[k].el, o = f.getBoundingClientRect(), s = o.width / f.clientWidth; return [o.left + x * s, o.top + y * s]; }
  function resolve(to){
    if(!to) return null;
    if(Array.isArray(to)) return to;
    try {
      var d = FR[to.f].el.contentDocument, el = d.querySelectorAll(typeof to.sel === 'function' ? to.sel() : to.sel)[to.n || 0]; if(!el) return null;
      var r = el.getBoundingClientRect(); if(!r.width && !r.height) return null;
      // words that wrap onto two lines (a link in the notes): aim at the longer piece, not the gap between them
      var parts = el.getClientRects(); if(parts.length > 1) r = Array.prototype.reduce.call(parts, function(a, b){ return b.width > a.width ? b : a; });
      return inFrame(to.f, r.left + r.width * (to.at ? to.at[0] : .5), r.top + r.height * (to.at ? to.at[1] : .5));
    } catch(e){ return null; }
  }

  // ---------------------------------------------------------------- drawing a moment
  var BG = { open: [150, 130, 255], end: [150, 130, 255], share: [120, 130, 255] }, EMBER = [150, 130, 255];   // the glow behind the windows: Sleek's violet
  function shotAt(t){ for(var i = 0; i < TL.shots.length; i++){ var s = TL.shots[i]; if(t >= s.t0 && t < s.t1) return s; } return TL.shots[TL.shots.length - 1]; }
  function placeWins(shot, t){
    Object.keys(FR).forEach(function(k){
      var f = FR[k], w = shot.wins[k];
      if(!w){ f.slot.style.visibility = 'hidden'; return; }
      var r = val(w.slot, t).slice(), v = (val(w.view, t) || [f.w / 2, f.h / 2, f.w]).slice();
      if(TALL && shot.cursor && w.follow !== false && shown > 0.5 && ptrIn === k){        // a tall frame can't show the whole page: it follows the pointer
        if(f._fx == null) f._fx = v[0];
        f._fx += (ptrPage[0] - f._fx) * 0.07; v[0] = f._fx;
      } else f._fx = null;
      var s = r[2] / v[2];
      if(f.h * s < r[3]){ var nh = f.h * s; r[1] += (r[3] - nh) / 2; r[3] = nh; }         // more of the page than fits: a shorter window, not empty bands
      var tx = r[2] / 2 - v[0] * s, ty = r[3] / 2 - v[1] * s;
      if(f.w * s >= r[2]) tx = Math.min(0, Math.max(r[2] - f.w * s, tx));        // never show past the page's edge
      if(f.h * s >= r[3]) ty = Math.min(0, Math.max(r[3] - f.h * s, ty));
      var op = 1, lift = 0, sc = 1;
      if(w.rise){ var u = EASE.out(seg(t, w.rise[0], w.rise[1])); op = clamp(seg(t, w.rise[0], w.rise[0] + (w.rise[1] - w.rise[0]) * 0.5)); lift = (1 - u) * 90; sc = 0.9 + 0.1 * u; }
      f.slot.style.visibility = 'visible'; f.slot.style.zIndex = w.z || 1;
      f.el.style.pointerEvents = shot.cursor ? '' : 'none';         // no pointer in the shot: nothing in it can be hovered by accident (a hovered strip stops rolling)
      f.slot.style.width = r[2] + 'px'; f.slot.style.height = r[3] + 'px'; f.slot.style.borderRadius = shot.flat ? '0' : (TALL ? 26 : 22) + 'px'; f.slot.style.boxShadow = shot.flat ? 'none' : '';
      f.slot.style.opacity = op;
      f.slot.style.transform = 'translate(' + (r[0] + r[2] * (1 - sc) / 2) + 'px,' + (r[1] + r[3] * (1 - sc) / 2 + lift) + 'px) scale(' + sc + ')';
      var pu = shot.prop ? EASE.out(seg(t, shot.prop.t, shot.prop.t + 0.45)) : 0;                    // the window steps back as a prop comes forward
      f.slot.style.filter = pu ? 'brightness(' + (1 - 0.6 * pu) + ') blur(' + 9 * pu + 'px)' : (w.dim != null || w.blur) ? 'brightness(' + (w.dim == null ? 1 : w.dim) + ') blur(' + (w.blur || 0) + 'px)' : '';
      f.el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    });
  }
  var tagsEl = $('tags'), tagsFor = null;
  function drawTags(shot, t){
    if(tagsFor !== shot){
      tagsFor = shot; tagsEl.innerHTML = '';
      (shot.tags || []).forEach(function(tg){ var d = document.createElement('div'); d.className = 'tag'; d.innerHTML = '<i></i>' + tg[1]; d._k = tg[0]; tagsEl.appendChild(d); });
    }
    Array.prototype.forEach.call(tagsEl.children, function(d){
      var r = val(shot.wins[d._k].slot, t); d.style.left = r[0] + 4 + 'px'; d.style.top = r[1] - 38 + 'px';
      d.style.opacity = EASE.out(seg(t, shot.t0 + 0.15, shot.t0 + 0.7));
    });
  }
  // captions: the words rise in one after another; a {word} takes the accent
  var capEl = $('cap'), capFor = null;
  function words(text){
    var out = [], hot = false;
    text.split(/(\{|\})/).forEach(function(p){
      if(p === '{'){ hot = true; return; } if(p === '}'){ hot = false; return; }
      p.split(/(\s+)/).forEach(function(wd){ if(wd) out.push({ w: wd, hot: hot, sp: /^\s+$/.test(wd) }); });
    });
    return out;
  }
  function fillWords(el, text){
    el.innerHTML = '';
    words(text).forEach(function(o){ var s = document.createElement('span'); s.textContent = o.w; if(o.hot) s.className = 'hot'; s._sp = o.sp; el.appendChild(s); });
  }
  function riseWords(el, t, t0, stagger, dur){
    var n = 0;
    Array.prototype.forEach.call(el.children, function(s){
      var u = EASE.out(seg(t, t0 + n * stagger, t0 + n * stagger + dur)); if(!s._sp) n++;
      s.style.opacity = u; s.style.transform = 'translateY(' + (1 - u) * 0.5 + 'em)';
    });
  }
  function drawCap(t){
    var c = null; TL.caps.forEach(function(x){ if(t >= x.t0 && t < x.t1) c = x; });
    if(c !== capFor){ capFor = c; if(c) fillWords(capEl, c.text); else capEl.innerHTML = ''; }
    if(!c) return;
    capEl.style.fontSize = (TALL ? 92 : 46) + 'px';
    if(TALL){ capEl.style.top = '250px'; capEl.style.whiteSpace = 'normal'; capEl.style.padding = '0 70px'; capEl.style.lineHeight = '1.05'; }
    else capEl.style.top = (H - 88 + (88 - 46) / 2 - 4) + 'px';
    capEl.style.opacity = 1 - seg(t, c.t1 - 0.22, c.t1);
    riseWords(capEl, t, c.t0, 0.055, 0.5);
  }
  var linesEl = $('lines'), linesFor = null;
  function drawLines(shot, t){
    if(linesFor !== shot){
      linesFor = shot; linesEl.innerHTML = '';
      (shot.lines || []).forEach(function(l){ var d = document.createElement('div'); fillWords(d, l[1]); d._t = l[0]; d.style.fontSize = (TALL ? 104 : 112) + 'px'; linesEl.appendChild(d); });
      Array.prototype.forEach.call(linesEl.querySelectorAll('.hot'), function(s){ s.style.background = 'linear-gradient(100deg,#7E9CFF,#B48CFF 55%,#FF8EE0)'; s.style.webkitBackgroundClip = 'text'; s.style.color = 'transparent'; });
    }
    Array.prototype.forEach.call(linesEl.children, function(d){
      var u = EASE.out(seg(t, d._t, d._t + 0.55));
      d.style.opacity = u * (1 - seg(t, shot.t1 - 0.2, shot.t1)); d.style.transform = 'translateY(' + (1 - u) * 40 + 'px) scale(' + (0.96 + 0.04 * u) + ')';
      Array.prototype.forEach.call(d.children, function(s){ s.style.opacity = 1; });
    });
  }
  // the mark and the name: the film's first and last pictures
  var card = $('card'), mark = $('mark'), mkA = $('mk-a'), mkB = $('mk-b'), word = $('word'), line = $('line');
  function drawCard(shot, t){
    var open = shot.id === 'open', end = shot.id === 'end';
    card.style.visibility = open || end ? 'visible' : 'hidden'; if(!open && !end) return;
    var a = (t - shot.t0) * (open ? 2.4 / (shot.t1 - shot.t0) : 1.25), big = end ? 1 : 0.92, mw = (TALL ? 190 : 170) * big;
    mark.style.width = mw + 'px'; mark.style.height = mw * 0.9 + 'px';
    word.style.fontSize = (TALL ? 150 : 138) * big + 'px'; word.style.marginTop = 34 * big + 'px';
    line.style.fontSize = (TALL ? 50 : 42) + 'px'; line.style.marginTop = '26px';
    var u1 = EASE.out(seg(a, 0.2, 0.95)), u2 = EASE.out(seg(a, 0.32, 1.05));
    mkA.setAttribute('transform', 'translate(' + (1 - u1) * 150 + ' 0)'); mkA.style.opacity = clamp(u1 * 1.6);
    mkB.setAttribute('transform', 'translate(' + -(1 - u2) * 150 + ' 0)'); mkB.style.opacity = clamp(u2 * 1.6);
    var uw = EASE.out(seg(a, 0.7, 1.4));
    word.style.opacity = uw; word.style.transform = 'translateY(' + (1 - uw) * 26 + 'px)'; word.style.letterSpacing = (-0.05 - (1 - uw) * 0.02) + 'em';
    var ul = end ? EASE.out(seg(a, 1.5, 2.3)) : 0;
    line.textContent = end ? 'Let\u2019s build something.' : ''; line.style.opacity = ul; line.style.transform = 'translateY(' + (1 - ul) * 18 + 'px)';
    var out = open ? seg(t, shot.t1 - 0.22, shot.t1) : 0, breathe = 1 + (t - shot.t0) * (end ? 0.006 : 0.012);
    card.style.opacity = 1 - out; card.style.transform = 'scale(' + (breathe + out * 0.08) + ')';
  }
  // a prop: what leaves the app (a file, a folder of copies, a web page, an installed app), drawn as a card
  var propEl = $('prop'), propFor = null;
  var PIC = {
    file: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 13h6M9 16.5h4"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/></svg>',
    page: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.400 5.900 12 3.500Z"/></svg>',
    app: '<img alt="" src="../../icons/icon-512.png">'
  };
  function drawProp(shot, t){
    var p = shot.prop;
    if(p !== propFor){
      propFor = p; propEl.innerHTML = '';
      if(p){
        propEl.innerHTML = '<div class="p-ic' + (p.icon === 'app' ? ' app' : '') + '">' + PIC[p.icon] + '</div><b></b><span class="p-sub"></span>' + (p.items ? '<ul>' + p.items.map(function(){ return '<li><em style="font-style:normal"></em><i></i></li>'; }).join('') + '</ul>' : '');
        propEl.querySelector('b').textContent = p.title; propEl.querySelector('.p-sub').textContent = p.sub || '';
        (p.items || []).forEach(function(it, k){ var li = propEl.querySelectorAll('li')[k]; li.querySelector('em').textContent = it[1]; li._t = it[0]; });
      }
    }
    if(!p || t < p.t){ propEl.style.display = 'none'; return; }
    var u = EASE.out(seg(t, p.t, p.t + 0.55)), k = 1 + 0.05 * Math.sin(Math.min(1, seg(t, p.t, p.t + 0.7)) * Math.PI);
    propEl.style.display = 'flex'; propEl.style.opacity = clamp(u * 1.5);
    propEl.style.transform = 'translateY(calc(-50% + ' + (1 - u) * 70 + 'px)) scale(' + (0.86 + 0.14 * u) * k * (TL.propScale || 1) + ')';
    Array.prototype.forEach.call(propEl.querySelectorAll('li'), function(li){
      var v = EASE.out(seg(t, li._t, li._t + 0.4)); li.style.opacity = v; li.style.transform = 'translateY(' + (1 - v) * 22 + 'px)';
      li.querySelector('i').style.transform = 'scale(' + EASE.out(seg(t, li._t + 0.25, li._t + 0.55)) + ')';
    });
  }
  function drawBg(shot, t){
    var c = BG[shot.id] || EMBER, o = shot.id === 'open' || shot.id === 'end' ? 0.20 : 0.13;
    $('bg').style.background = 'radial-gradient(' + (TALL ? '120% 46%' : '62% 62%') + ' at 50% 44%, rgba(' + c.join(',') + ',' + o + '), transparent 72%)';
    $('fade').style.opacity = TL.nofade ? 0 : Math.max(1 - seg(t, 0, 0.35), seg(t, TL.duration - 0.7, TL.duration - 0.05));
  }

  // ---------------------------------------------------------------- the pointer
  makeTimeline();
  var cur = $('cursor'), ring = $('ring'), P = TL.park.slice(), lastClick = -9, pressed = false, shown = 0, ptrIn = null, ptrPage = [0, 0];
  // which window the pointer is over, and where on that window's page
  function ptrWhere(shot){
    ptrIn = null;
    Object.keys(shot.wins).forEach(function(k){
      var f = FR[k].el, o = f.getBoundingClientRect(), sl = FR[k].slot.getBoundingClientRect(), s = o.width / f.clientWidth;
      if(P[0] >= sl.left && P[0] <= sl.right && P[1] >= sl.top && P[1] <= sl.bottom){ ptrIn = k; ptrPage = [(P[0] - o.left) / s, (P[1] - o.top) / s]; }
    });
  }
  function pointerAt(t){
    var L = TL.ptr; if(!L.length || t < L[0].t) return;
    var i = 0; while(i < L.length - 1 && L[i + 1].t <= t) i++;
    var a = L[i], b = L[i + 1], sa = 1; for(var j = i; j >= 0; j--) if(L[j].show != null){ sa = L[j].show; break; }
    if(!b){ var pa = resolve(a.to); if(pa) P = pa; shown = sa; return; }
    var u = seg(t, a.t, b.t), e = EASE[b.ease || 'io'](u), from = resolve(a.to) || a._at || P, to = resolve(b.to) || from;
    a._at = from;
    P = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    shown = sa + ((b.show == null ? sa : b.show) - sa) * clamp(u * 1.4);
  }
  function drawPointer(shot, t){
    cur.style.opacity = shot.cursor ? shown : 0;
    var k = pressed ? 0.86 : 1 - 0.14 * (1 - seg(t, lastClick, lastClick + 0.16)) * (t >= lastClick ? 1 : 0);
    cur.style.transform = 'translate(' + P[0] + 'px,' + P[1] + 'px) scale(' + (TALL ? 1.5 : 1.15) * k + ')';
    var r = seg(t, lastClick, lastClick + 0.5);
    ring.style.opacity = t >= lastClick && r < 1 && shot.cursor ? (1 - r) * 0.85 : 0;
    ring.style.transform = 'translate(' + ring._x + 'px,' + ring._y + 'px) scale(' + (0.25 + EASE.out(r) * 0.9) + ')';
  }

  // ---------------------------------------------------------------- cues
  var KEYS = { Space: { key: ' ', code: 'Space', vk: 32, text: ' ' }, Escape: { key: 'Escape', code: 'Escape', vk: 27 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
    g: { key: 'g', code: 'KeyG', vk: 71, text: 'g' }, e: { key: 'e', code: 'KeyE', vk: 69, text: 'e' }, a: { key: 'a', code: 'KeyA', vk: 65, text: 'a' } };
  var done = -1, later = [], lastShot = null;
  function runCues(t, inputs){
    for(var i = done + 1; i < TL.cues.length && TL.cues[i].t <= t; i++){
      var c = TL.cues[i]; done = i;
      var w = c.f && FR[c.f].el.contentWindow, d = c.f && FR[c.f].el.contentDocument;
      try {
        if(c.hash) w.location.hash = c.hash;
        if(c.js) c.js(w, d);
        if(c.key){ w.focus(); inputs.push(Object.assign({ type: 'key' }, KEYS[c.key])); }
      } catch(e){ console.error('cue at ' + c.t + ': ' + e.message); }
      if(c.text) inputs.push({ type: 'text', text: c.text });
      if(c.fake){ lastClick = c.t; ring._x = P[0]; ring._y = P[1]; }                // a click the film shows but doesn't make
      if(c.click){ inputs.push({ type: 'down' }); later.push({ t: c.t + 0.09, type: 'up' }); lastClick = c.t; ring._x = P[0]; ring._y = P[1]; }
      if(c.down){ inputs.push({ type: 'down' }); pressed = true; lastClick = c.t; ring._x = P[0]; ring._y = P[1]; }
      if(c.up){ inputs.push({ type: 'up' }); pressed = false; }
    }
    later = later.filter(function(l){ if(l.t <= t){ inputs.push({ type: l.type }); return false; } return true; });
  }

  window.FILM = {
    ready: false, fps: 60, get duration(){ return TL.duration; }, get timeline(){ return TL; },
    tick: function(t){
      var shot = shotAt(t), inputs = [];
      placeWins(shot, t);                      // the camera first: the pointer is aimed through it
      pointerAt(t); ptrWhere(shot);
      runCues(t, inputs);
      drawBg(shot, t); drawTags(shot, t); drawCap(t); drawLines(shot, t); drawCard(shot, t); drawProp(shot, t); drawPointer(shot, t);
      var kick = shot !== lastShot; lastShot = shot;                // a new shot: the browser is told where the pointer is again, so hover is never left over from the last one
      return { ptr: [Math.round(P[0] * 10) / 10, Math.round(P[1] * 10) / 10], inputs: inputs, kick: kick };
    },
    // the sound's cue sheet
    cues: function(){
      var out = [];
      TL.shots.forEach(function(s){ if(s.prop){ out.push({ t: s.prop.t, k: 'prop' }); (s.prop.items || []).forEach(function(it){ out.push({ t: it[0], k: 'tick' }); }); } });
      TL.cues.forEach(function(c){ if(c.fake) out.push({ t: c.t, k: 'click' }); if(c.text) out.push({ t: c.t, k: 'key' }); });
      TL.shots.forEach(function(s){ if(!s.soft) out.push({ t: s.t0, k: 'cut', id: s.id }); (s.lines || []).forEach(function(l){ out.push({ t: l[0], k: 'line' }); }); });
      TL.caps.forEach(function(c){ out.push({ t: c.t0, k: 'cap' }); });
      TL.cues.forEach(function(c){ if(c.sfx === 'none') return; if(c.click || c.down) out.push({ t: c.t, k: c.sfx || 'click' }); else if(c.up) out.push({ t: c.t, k: 'release' }); else if(c.sfx) out.push({ t: c.t, k: c.sfx }); });
      Object.keys(TL.T).forEach(function(k){ out.push({ t: TL.T[k], k: 'chapter', id: k }); });
      return out.sort(function(a, b){ return a.t - b.t; });
    },
    frames: FR
  };
  ring._x = ring._y = 0;
})();
