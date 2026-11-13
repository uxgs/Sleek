/* Helper clips: six short clips for the start screen's Settings, "How Sleek works", each
   one thing Sleek does, shown rather than described.  film.html?reel=saves|keep|folder|publish|present|install
   A reel is a small cue sheet in the same form as timeline.js, and replaces it when ?reel= is given.

   Four are the real app. Two happen in the browser's own dialogs, which a page can't show (choosing
   a folder, installing), so those are a prop card over the real start screen; the same card stands
   for the file and the page that "keep" and "publish" hand you. */
(function(){
  var reel = new URLSearchParams(location.search).get('reel'); if(!reel) return;
  window.FILM_TIMELINE = function(h){
    var W = h.W, H = h.H, shots = [], cues = [], ptr = [], D = 5.5;
    var on = function(f, sel, o){ return Object.assign({ f: f, sel: sel }, o || {}); };
    var FRAME = [0, 0, W, H], PARK = [W - 30, H - 24];
    // one window, edge to edge
    function shot(f, view, extra){
      var wins = {}; wins[f] = { slot: FRAME, view: view, follow: false }; shots.push(Object.assign({ id: reel, t0: 0, t1: 60, flat: true, cursor: true, wins: wins }, extra || {}));
      // The start screen draws its list again when its window gets focus, which the first click would
      // give it mid-clip. So it has focus from the start, and the lead-in (below) lets that settle.
      cues.push({ t: 0, f: f, js: function(w){ try { w.focus(); } catch(e){} } });
    }
    function from(x, y){ ptr.push({ t: 0, to: [W * x, H * y], show: 1 }); }
    var MORE = on('S', function(){ return '.lib-card[data-id="' + h.id('A') + '"] .lib-more'; }), item = function(act){ return on('S', '.lib-menu [data-act="' + act + '"]'); };
    // a deck's menu on the start screen, then one of its items
    function menu(act, prop){
      shot('S', [[0, [760, 540, 1280]]], { prop: prop });
      from(0.62, 0.8); ptr.push({ t: 0.9, to: MORE });
      cues.push({ t: 1.0, click: 1 });
      ptr.push({ t: 1.25, to: MORE }, { t: 1.95, to: item(act) });
      cues.push({ t: 2.1, fake: 1 });
      ptr.push({ t: 2.3, to: item(act) }, { t: 2.9, to: PARK, show: 0 });
    }

    if(reel === 'saves'){                       // type into a headline; the bar says Saved
      var HEAD = on('B', '.slide.active [data-eid$=".t1"]', { at: [0.24, 0.5] });
      cues.push({ t: 0.05, f: 'B', hash: '#title' }, { t: 0.1, f: 'B', js: function(w, d){ d.documentElement.classList.remove('film-nobar'); w.dispatchEvent(new w.Event('resize')); } });
      cues.push({ t: 0.3, f: 'B', key: 'e' });
      shot('B', [[0, [800, 450, 1600]], [2.7, [800, 450, 1600]], [3.7, [800, 590, 1180]], [4.2, [800, 590, 1180]], [5.0, [1010, 600, 1180]]]);   // in on the words, then along the bar to Saved
      from(0.62, 0.72); ptr.push({ t: 1.15, to: HEAD });
      cues.push({ t: 1.25, click: 1 });
      [' ', '2', '.', '0'].forEach(function(ch, k){ cues.push({ t: 1.8 + k * 0.16, text: ch }); });
      ptr.push({ t: 1.5, to: HEAD }, { t: 2.3, to: [W * 0.7, H * 0.62], show: 0 });
    }
    else if(reel === 'keep') menu('file', { t: 2.3, icon: 'file', title: 'Pace.sleek', sub: 'The whole deck in one file. Open it on any device.' });
    else if(reel === 'publish') menu('pub', { t: 2.3, icon: 'page', title: 'Pace.html', sub: 'One page anyone can open. Nothing to install.' });
    else if(reel === 'folder'){                 // Link a folder, and every deck keeps a copy there
      var BTN = on('S', '#lib-folder');
      shot('S', [[0, [720, 400, 1280]]], { prop: { t: 1.35, icon: 'folder', title: 'Decks', sub: 'A copy of every deck, kept as you work.',
        items: [[2.0, 'Pace.sleek'], [2.55, 'Tally.sleek'], [3.1, 'Atlas.sleek']] } });
      from(0.6, 0.78); ptr.push({ t: 0.95, to: BTN });
      cues.push({ t: 1.1, fake: 1 });
      ptr.push({ t: 1.3, to: BTN }, { t: 1.9, to: PARK, show: 0 });
    }
    else if(reel === 'present'){                // the presenter's window beside the room's: Next moves both
      D = 6;
      var NEXT = on('P', '#pres-next');
      shots.push({ id: reel, t0: 0, t1: 60, cursor: true, tags: [['P', 'Presenter'], ['A', 'Audience']], wins: {
        A: { slot: [1104, 322, 776, 436], view: [800, 450, 1600], follow: false },
        P: { slot: [40, 228, 1040, 624], view: [500, 300, 1000], follow: false } } });
      from(0.3, 0.86); ptr.push({ t: 1.0, to: NEXT });
      [1.15, 2.7, 4.25].forEach(function(t){ cues.push({ t: t, click: 1 }); });
      ptr.push({ t: 5.2, to: NEXT }, { t: 5.9, to: NEXT, show: 0 });
    }
    else {                                      // install: Sleek as an app of its own
      D = 5;
      shot('S', [[0, [800, 450, 1600]]], { cursor: false, prop: { t: 0.7, icon: 'app', title: 'Sleek', sub: 'Install it from your browser’s menu. It opens like an app.' } });
    }
    // lead: two seconds run before the clip begins, so the list is drawn and still when the pointer arrives
    return { T: { open: 0, out: D }, shots: shots, cues: cues, ptr: ptr, caps: [], duration: D, park: PARK, nofade: true, lead: 2, propScale: 1.5 };   // the clips play small, so the cards are large
  };
})();
