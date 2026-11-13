/* The film's cue sheet: what is on screen, where the camera is, what the pointer does and what is
   typed or clicked, second by second. The picture (film.js) and the sound (score.py, through the
   renderer's --cues file) both read it. Times are seconds; the music is 120 beats a minute, so a
   beat is half a second and a bar is two: every cut sits on a beat.

   A frame is one of: A, B and C (the film's three decks: Pace, a fitness app; Tally, a money app;
   Atlas, a travel site), P (the presenter console for A) and S (the start screen). A deck is made
   ready while another is on screen, so every cut lands on a slide that is already moving. */
window.FILM_TIMELINE = function(h){
  var TALL = h.tall, W = h.W, H = h.H;
  var on = function(f, sel, o){ return Object.assign({ f: f, sel: sel }, o || {}); };

  // where a window sits on screen: [x, y, w, h]
  var ONE = TALL ? [40, 580, 1000, 900] : [110, 34, 1700, 956];
  var PRES = TALL ? [40, 520, 1000, 600] : [40, 186, 1040, 624];          // the presenter console
  var AUD  = TALL ? [40, 1160, 1000, 562] : [1104, 280, 776, 436];        // the audience screen beside it
  // what a window shows of its page: [centre x, centre y, width shown], in the page's own pixels (1600 wide)
  var FULL = [800, 450, 1600];
  // a tall frame can't show a whole 16:9 page large enough to read, so it frames the part that matters
  // (tw: the width a tall frame shows; tcx: where it looks, when that isn't where the wide frame looks.
  //  A tall frame showing more than 1000 of the page's 1600 gets shorter to fit, down to a 16:9 band.)
  var part = function(cx, cy, w, tw, tcx){ return TALL ? [tcx == null ? cx : tcx, cy, tw || Math.min(w, 1000)] : [cx, cy, w]; };
  var push = function(t0, t1, a, b){ return [[t0, a], [t1, b]]; };          // a slow move from one framing to another

  var T = { open: 0, hero: 2, pick: 4, move: 6, num: 12, ba: 18, ba2: 22, apart: 26, ann: 30, pres: 34, theme: 42, build: 46, share: 50, end: 53, out: 58 };
  var TILE = '.slide.active .car-set:not(.car-copy) > .media:not(.car-gone)';
  var shots = [], cues = [], ptr = [], caps = [];
  var PARK = [W - 30, H - 24];
  var roll = function(w, d){ var s = d.querySelector('.slide.active'); if(s) s.classList.add('rolling'); };
  var bar = function(w, d){ d.documentElement.classList.remove('film-nobar'); w.dispatchEvent(new w.Event('resize')); };
  var assemble = function(t, f, gap){ cues.push({ t: t, f: f, js: function(w, d){ h.build(w, d, gap); } }); };

  // ------------------------------------------------------------------ the mark
  shots.push({ id: 'open', t0: T.open, t1: T.hero, wins: {} });

  // ------------------------------------------------------------------ all slides, then a new one (Pace)
  caps.push({ t0: T.hero + 0.1, t1: T.pick - 0.1, text: 'Your whole deck, {at a glance.}' });
  caps.push({ t0: T.pick + 0.05, t1: T.move - 0.12, text: 'A layout for every idea. {One click.}' });
  cues.push({ t: T.hero - 0.1, f: 'A', key: 'g', sfx: 'none' });                 // All slides rises as the shot opens
  shots.push({ id: 'hero', t0: T.hero, t1: T.pick, wins: { A: { slot: ONE, view: push(T.hero, T.pick, part(800, 450, 1600, 1600), part(800, 430, 1500, 1500)), rise: [T.hero, T.hero + 0.6] } } });
  cues.push({ t: T.pick, f: 'A', js: function(w, d){ var a = d.querySelector('.gt-add'); if(a) a.click(); }, sfx: 'snap' });   // the layout picker grows out of the last tile
  shots.push({ id: 'pick', t0: T.pick, t1: T.move, soft: true, wins: { A: { slot: ONE, view: push(T.pick, T.move, part(800, 430, 1500, 1500), part(800, 450, 1380, 1300)) } } });

  // ------------------------------------------------------------------ slides that move: three, a bar each
  caps.push({ t0: T.move + 0.05, t1: T.num - 0.12, text: 'Slides that {move.}' });
  // the film strip is shown exactly as the app shows it: no assembly, no camera move, only the strip rolling
  shots.push({ id: 'strip', t0: T.move, t1: T.move + 2, wins: { B: { slot: ONE, view: [[T.move, part(800, 450, 1600, 1000, 1160)]] } } });
  shots.push({ id: 'mood', t0: T.move + 2, t1: T.move + 4, wins: { C: { slot: ONE, view: push(T.move + 2, T.move + 4, part(800, 470, 1600, 1000), part(800, 480, 1500, 940, 860)) } } });
  shots.push({ id: 'sketch', t0: T.move + 4, t1: T.num, wins: { A: { slot: ONE, view: push(T.move + 4, T.num, part(800, 450, 1600, 1000, 620), part(800, 450, 1500, 940, 700)) } } });
  assemble(T.move + 1.98, 'C'); assemble(T.move + 3.98, 'A');
  cues.push({ t: T.move + 0.05, f: 'A', key: 'Escape', sfx: 'none' }, { t: T.move + 0.3, f: 'A', key: 'Escape', sfx: 'none' });   // out of the picker, out of All slides
  cues.push({ t: T.move + 0.6, f: 'A', hash: '#carousel' }, { t: T.move + 0.8, f: 'A', js: roll });
  cues.push({ t: T.ba + 0.1, f: 'A', hash: '#take-apart' });

  // ------------------------------------------------------------------ numbers that count: results, bars, a donut (a bar each)
  // Each slide is shown the moment its shot opens, so its numbers count up, its bars grow and its donut sweeps round on screen.
  caps.push({ t0: T.num + 0.05, t1: T.ba - 0.12, text: 'Numbers that {count.}' });
  cues.push({ t: T.num - 0.02, f: 'B', hash: '#results' }, { t: T.num + 1.98, f: 'A', hash: '#chart' }, { t: T.num + 3.98, f: 'C', hash: '#chart' });
  shots.push({ id: 'results', t0: T.num, t1: T.num + 2, wins: { B: { slot: ONE, view: push(T.num, T.num + 2, part(800, 450, 1600, 1000, 560), part(800, 460, 1500, 940, 600)) } } });
  shots.push({ id: 'bars', t0: T.num + 2, t1: T.num + 4, wins: { A: { slot: ONE, view: push(T.num + 2, T.num + 4, part(800, 450, 1600, 1000, 1040), part(840, 450, 1500, 940, 1060)) } } });
  shots.push({ id: 'donut', t0: T.num + 4, t1: T.ba, wins: { C: { slot: ONE, view: push(T.num + 4, T.ba, part(800, 450, 1600, 1000, 1000), part(840, 450, 1500, 940, 1000)) } } });
  cues.push({ t: T.num + 2.05, f: 'B', hash: '#before-and-after' }, { t: T.num + 2.2, f: 'B', js: roll });      // Tally gets ready for its drag while the charts play

  // ------------------------------------------------------------------ before and after: drag it (Tally)
  caps.push({ t0: T.ba + 0.08, t1: T.ba + 1.9, text: 'Before. {After.}' });
  caps.push({ t0: T.ba + 2.0, t1: T.ba2 - 0.12, text: 'Before. After. {One drag.}' });
  var bx = function(u){ return on('B', '.iv-cmp', { at: [u, 0.52] }); }, T0 = on('B', TILE, { n: 0, at: [0.55, 0.5] });
  shots.push({ id: 'ba', t0: T.ba, t1: T.ba2, cursor: true, wins: { B: { slot: ONE, follow: false, view: [
    [T.ba, part(800, 450, 1600, 1060, 800)], [T.ba + 1.9, part(800, 450, 1600, 1060, 800)],          // held still while the tile opens: a move here fights the rolling carousel
    [T.ba + 2.7, part(920, 450, 1340, 1000, 860)], [T.ba + 3.5, part(690, 450, 1340, 1000, 740)], [T.ba2, part(760, 450, 1440, 1020, 780)]] } } });
  ptr.push({ t: T.ba, to: [W * 0.6, H * 0.76], show: 0 }, { t: T.ba + 0.15, to: [W * 0.6, H * 0.76], show: 1 }, { t: T.ba + 0.55, to: T0 });
  cues.push({ t: T.ba + 0.6, click: 1 });                                        // the tile grows to full screen and sweeps to half
  ptr.push({ t: T.ba + 1.4, to: T0 }, { t: T.ba + 1.9, to: on('B', '.iv-knob') });
  cues.push({ t: T.ba + 2.0, down: 1, sfx: 'grab' });
  ptr.push({ t: T.ba + 2.05, to: on('B', '.iv-knob') }, { t: T.ba + 2.7, to: bx(0.82) }, { t: T.ba + 3.5, to: bx(0.14) });
  cues.push({ t: T.ba + 3.6, up: 1 });
  ptr.push({ t: T.ba + 3.65, to: bx(0.14) }, { t: T.ba2, to: bx(0.14), show: 0 });

  // ------------------------------------------------------------------ before and after: let it play (Atlas)
  caps.push({ t0: T.ba2 + 0.08, t1: T.apart - 0.12, text: 'Or press Space, {and watch.}' });
  cues.push({ t: T.ba + 0.05, f: 'C', hash: '#before-and-after' });
  cues.push({ t: T.ba + 0.4, f: 'C', js: function(w, d){ var t = d.querySelector(TILE); if(t) t.click(); } });          // open, waiting at half
  cues.push({ t: T.ba2 + 0.08, f: 'C', key: 'Space', sfx: 'wipe' });             // all Before, a breath, all After
  shots.push({ id: 'ba2', t0: T.ba2, t1: T.apart, wins: { C: { slot: ONE, view: [[T.ba2, part(800, 450, 1600, 1060, 800)], [T.ba2 + 1.4, part(800, 450, 1500, 1000, 620)], [T.apart, part(800, 450, 1600, 1060, 900)]] } } });

  // ------------------------------------------------------------------ take apart (Pace)
  caps.push({ t0: T.apart + 0.08, t1: T.ann - 0.12, text: 'Take a design {apart.}' });
  var CARD = on('A', '.slide.active .media[data-dis]', { at: [0.45, 0.6] });
  shots.push({ id: 'apart', t0: T.apart, t1: T.ann, cursor: true, wins: { A: { slot: ONE, follow: false, view: [
    [T.apart, part(800, 450, 1600, 1000, 430)], [T.apart + 0.6, part(800, 450, 1560, 1000, 430)], [T.apart + 1.6, part(800, 450, 1580, 1300, 770)], [T.ann, part(800, 455, 1500, 1260, 780)]] } } });
  ptr.push({ t: T.apart, to: [W * 0.66, H * 0.78], show: 0 }, { t: T.apart + 0.12, to: [W * 0.66, H * 0.78], show: 1 }, { t: T.apart + 0.5, to: CARD });
  cues.push({ t: T.apart + 0.55, click: 1 });
  ptr.push({ t: T.apart + 0.8, to: CARD }, { t: T.apart + 1.5, to: PARK, show: 0 });

  // ------------------------------------------------------------------ annotations (Atlas)
  caps.push({ t0: T.ann + 0.08, t1: T.pres - 0.12, text: 'Point at what {matters.}' });
  cues.push({ t: T.apart + 0.1, f: 'C', key: 'Escape', sfx: 'none' });           // close the picture the wipe left open
  cues.push({ t: T.ann - 0.02, f: 'C', hash: '#annotated-screen' });             // the pins pop in as the shot opens
  var PIN = on('C', '.slide.active .pin', { n: 0 }), BOX = on('C', '.slide.active .abox', { at: [0.5, 0.32] });
  shots.push({ id: 'ann', t0: T.ann, t1: T.pres, cursor: true, wins: { C: { slot: ONE, view: [
    [T.ann, part(800, 450, 1600, 1000)], [T.ann + 0.7, part(800, 450, 1560, 1000)], [T.ann + 1.5, part(640, 520, 1300, 900)], [T.ann + 2.5, part(980, 440, 1360, 1000)], [T.pres, part(1000, 430, 1300, 960)]] } } });
  ptr.push({ t: T.ann, to: [W * 0.45, H * 0.3], show: 0 }, { t: T.ann + 0.35, to: [W * 0.45, H * 0.3], show: 1 }, { t: T.ann + 0.85, to: PIN });
  cues.push({ t: T.ann + 0.9, click: 1 });
  ptr.push({ t: T.ann + 1.6, to: PIN }, { t: T.ann + 2.1, to: BOX });
  cues.push({ t: T.ann + 2.2, click: 1 });
  ptr.push({ t: T.ann + 2.9, to: BOX }, { t: T.ann + 3.6, to: PARK, show: 0 });

  // ------------------------------------------------------------------ the presenter and the notes (Pace)
  caps.push({ t0: T.pres + 0.08, t1: T.theme - 0.12, text: 'Your notes {run the show.}' });
  cues.push({ t: T.ann + 0.1, f: 'A', js: function(w){ try { w.Deck.inlineSet(null); } catch(e){} } });
  cues.push({ t: T.ann + 0.6, f: 'A', hash: '#gallery' });
  var LINK = function(n){ return on('P', '#pres-ntext a[href="#open:tile:' + n + '"]'); }, SHUT = on('P', '#pres-ntext a[href="#open:slide"]'), TOOL = on('P', '.pres-tool[data-tool="box"]');
  var pv = function(u, v){ return on('P', '#pres-shot', { at: [u, v] }); };
  shots.push({ id: 'pres', t0: T.pres, t1: T.theme, cursor: true, tags: [['P', 'Presenter'], ['A', 'Audience']], wins: {
    A: { slot: [[T.pres, AUD]], view: FULL, follow: false },
    P: { slot: [[T.pres, PRES]], view: [[T.pres, [500, 300, 1000]]], follow: false } } });
  ptr.push({ t: T.pres, to: [W * 0.3, H * 0.82], show: 0 }, { t: T.pres + 0.2, to: [W * 0.3, H * 0.82], show: 1 }, { t: T.pres + 0.85, to: LINK(1) });
  cues.push({ t: T.pres + 0.9, click: 1 });                                      // "Today" opens on the audience screen
  ptr.push({ t: T.pres + 1.8, to: LINK(1) }, { t: T.pres + 2.25, to: LINK(2) });
  cues.push({ t: T.pres + 2.3, click: 1 });                                      // ...then the workout
  ptr.push({ t: T.pres + 3.1, to: LINK(2) }, { t: T.pres + 3.65, to: TOOL });
  cues.push({ t: T.pres + 3.7, click: 1 });                                      // the Box tool
  ptr.push({ t: T.pres + 3.85, to: TOOL }, { t: T.pres + 4.4, to: pv(0.30, 0.34) });
  cues.push({ t: T.pres + 4.45, down: 1 });
  ptr.push({ t: T.pres + 4.5, to: pv(0.30, 0.34) }, { t: T.pres + 5.4, to: pv(0.76, 0.86) });
  cues.push({ t: T.pres + 5.5, up: 1 });
  ptr.push({ t: T.pres + 5.9, to: pv(0.76, 0.86) }, { t: T.pres + 6.55, to: SHUT });
  cues.push({ t: T.pres + 6.6, click: 1 });                                      // close it again
  ptr.push({ t: T.pres + 7.0, to: SHUT }, { t: T.theme, to: PARK, show: 0 });

  // ------------------------------------------------------------------ theming: one card layout, look after look (Pace)
  caps.push({ t0: T.theme + 0.08, t1: T.build - 0.12, text: 'Make it {yours.}' });
  cues.push({ t: T.theme - 0.02, f: 'A', hash: '#cards' });
  assemble(T.theme, 'A', 0.09);
  shots.push({ id: 'theme', t0: T.theme, t1: T.build, wins: { A: { slot: ONE, view: push(T.theme, T.build, part(800, 450, 1600, 1600), part(800, 450, 1440, 1440)) } } });
  var LOOKS = [
    [1.0, { accent: 'gold', color: 'ember', style: 'corners', font: 'sora' }],
    [1.5, { accent: 'teal', color: 'verdant', style: 'spotlight', font: 'manrope', fx: 'smoke' }],
    [2.0, { mode: 'light', accent: 'gold', color: 'gold', style: 'horizon', font: 'editorial' }, '#wrap-up'],
    [2.5, { accent: 'blue', color: 'ocean', style: 'aurora', font: 'geist', fx: 'grid' }],
    [3.0, { mode: 'dark', accent: 'violet', color: 'ember', style: 'horizon', font: 'grotesk' }, '#cards'],
    [3.5, { accent: 'teal', color: 'ocean', style: 'aurora', font: 'inter' }]
  ];
  LOOKS.forEach(function(L){
    cues.push({ t: T.theme + L[0], f: 'A', js: function(w, d){ if(L[2]) w.location.hash = L[2]; h.look(w, d, L[1]); }, sfx: 'snap' });
  });

  // ------------------------------------------------------------------ built in minutes: remix (Atlas), reorder (Tally)
  caps.push({ t0: T.build + 0.08, t1: T.share - 0.12, text: 'Built in {minutes.}' });
  cues.push({ t: T.pres + 0.3, f: 'C', hash: '#moodboard' }, { t: T.theme + 2.6, f: 'C', js: bar }, { t: T.theme + 3.0, f: 'C', key: 'e', sfx: 'none' });
  shots.push({ id: 'remix', t0: T.build, t1: T.build + 2, wins: { C: { slot: ONE, view: push(T.build, T.build + 2, part(800, 440, 1580, 1240), part(800, 440, 1480, 1160)) } } });
  var mix = function(w, d){ var b = d.getElementById('cl-mix'); if(b) b.click(); };
  cues.push({ t: T.build + 0.4, f: 'C', js: mix, sfx: 'snap' }, { t: T.build + 1.15, f: 'C', js: mix, sfx: 'snap' });
  // drag a carousel picture to a new place
  cues.push({ t: T.ba2 + 0.2, f: 'B', key: 'Escape', sfx: 'none' }, { t: T.ba2 + 0.6, f: 'B', hash: '#carousel' });
  cues.push({ t: T.build + 0.5, f: 'B', js: bar }, { t: T.build + 0.8, f: 'B', key: 'e', sfx: 'none' });
  var CT = function(n, u){ return on('B', TILE, { n: n, at: [u == null ? 0.5 : u, 0.5] }); };
  shots.push({ id: 'order', t0: T.build + 2, t1: T.share, cursor: true, wins: { B: { slot: ONE, follow: false, view: push(T.build + 2, T.share, part(800, 456, 1580, 1300, 800), part(800, 478, 1500, 1240, 800)) } } });   // low enough to keep the edit bar, in the bottom row, in view
  ptr.push({ t: T.build + 2, to: CT(0), show: 0 }, { t: T.build + 2.15, to: CT(0), show: 1 });
  cues.push({ t: T.build + 2.3, down: 1, sfx: 'grab' });
  ptr.push({ t: T.build + 2.35, to: CT(0) }, { t: T.build + 3.3, to: on('B', '.slide.active .carousel', { at: [0.93, 0.5] }) });
  cues.push({ t: T.build + 3.45, up: 1 });
  ptr.push({ t: T.build + 3.5, to: on('B', '.slide.active .carousel', { at: [0.93, 0.5] }) }, { t: T.share, to: PARK, show: 0 });

  // ------------------------------------------------------------------ no account, nothing to install, works offline
  shots.push({ id: 'share', t0: T.share, t1: T.end, wins: { S: { slot: ONE, view: push(T.share, T.end, part(800, 520, 1600, 1000), part(800, 520, 1480, 940)), dim: 0.5, blur: 7 } },
    lines: [[T.share + 0.04, 'No account.'], [T.share + 1.04, 'Nothing to install.'], [T.share + 2.04, 'Works {offline.}']] });

  // ------------------------------------------------------------------ the end card
  shots.push({ id: 'end', t0: T.end, t1: T.out, wins: {} });

  return { T: T, shots: shots, cues: cues, ptr: ptr, caps: caps, duration: T.out, park: PARK };
};
