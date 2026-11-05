/* Phones and small windows: the bar keeps what you reach for while presenting (previous, the
   count, next, All slides) and a ⋯ button; everything else (your decks, Present, Notes, Annotate,
   Edit, Theme, Share, Fullscreen) moves into a tray that slides up from the bottom, as big
   labelled buttons. Theme and Share open from it as sheets of their own. Swipe the slide left or
   right to change slides. On a wider window the buttons go back into the bar. */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror) return;
  var bar = document.getElementById('bar'); if(!bar) return;
  var grp = bar.querySelector('.spacer + .grp'); if(!grp) return;
  var spacer = bar.querySelector('.spacer');
  var mq = window.matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)');

  // fullscreen only where the browser has it (not on iPhone)
  var full = document.getElementById('full');
  if(full && !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) full.hidden = true;

  // a label for each button, shown in the tray
  var labelled = Array.prototype.slice.call(grp.querySelectorAll('button[data-tt], #filebtn')), hb = document.getElementById('homebtn');
  if(hb) labelled.unshift(hb);                          // your decks sits at the bar's left on a wide window, first in the tray here
  labelled.forEach(function(b){
    if(b.querySelector('.tray-l')) return;
    var l = document.createElement('span'); l.className = 'tray-l'; l.textContent = b.getAttribute('data-tt') || b.getAttribute('aria-label') || '';
    b.appendChild(l);
  });

  var more = document.createElement('button');
  more.id = 'morebtn'; more.type = 'button'; more.className = 'ibtn icon-only more-btn';
  more.setAttribute('aria-label', 'More'); more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-expanded', 'false');
  more.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/></svg>';
  bar.appendChild(more);

  var tray = document.createElement('div');
  tray.className = 'tray'; tray.hidden = true;
  tray.innerHTML = '<div class="tray-scrim"></div><div class="tray-sheet bar" role="dialog" aria-label="More"><div class="tray-grab" aria-hidden="true"></div>' +
    '<div class="tray-head"><span class="tray-k">This deck</span><span class="tray-t"></span></div><div class="tray-body"></div></div>';
  document.body.appendChild(tray);
  var sheet = tray.querySelector('.tray-sheet'), body = tray.querySelector('.tray-body'), scrim = tray.querySelector('.tray-scrim');

  var home = document.getElementById('homebtn'), homeAt = bar.querySelector('.home-sep');
  var small = false;
  function apply(){
    var s = mq.matches;
    if(s === small) return;
    small = s;
    document.body.classList.toggle('compact', s);
    if(s){ body.appendChild(grp); if(home) grp.insertBefore(home, grp.firstChild); }   // your decks: first in the tray
    else { close(true); bar.insertBefore(grp, more); if(home) homeAt.parentNode.insertBefore(home, homeAt); }   // back at the bar's left
    window.dispatchEvent(new Event('resize'));          // the slide refits to the bar's new height
  }
  if(mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
  apply();

  var openT;
  function open(){
    if(!small || !tray.hidden) return;
    clearTimeout(openT);
    tray.querySelector('.tray-t').textContent = (window.SLEEK_DECK && SLEEK_DECK.title) || document.title;
    tray.hidden = false; tray.classList.remove('sub');
    more.setAttribute('aria-expanded', 'true');
    void tray.offsetWidth; tray.classList.add('in');
  }
  function close(now){
    if(tray.hidden) return;
    tray.classList.remove('in', 'sub'); more.setAttribute('aria-expanded', 'false');
    closeSubs();
    clearTimeout(openT);
    if(now) tray.hidden = true; else openT = setTimeout(function(){ tray.hidden = true; }, 380);
  }
  function closeSubs(){
    var a = document.getElementById('accent-dot'), sw = document.getElementById('swatches');
    if(a && a.getAttribute('aria-expanded') === 'true'){ a.click(); }
    var f = document.getElementById('filebtn');
    if(f && f.getAttribute('aria-expanded') === 'true') f.click();
    if(sw && !sw.hidden) sw.hidden = true;
  }
  more.addEventListener('click', function(e){ e.stopPropagation(); if(tray.hidden) open(); else close(); });
  scrim.addEventListener('click', function(){ close(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !tray.hidden) close(); });

  // Theme and Share open as sheets of their own; the rest act and the tray goes
  // (in the capture phase: the buttons' own handlers stop the click from bubbling)
  sheet.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b || !grp.contains(b)) return;
    if(b.closest('.swatches, .df-pop')) return;        // inside a sheet: it stays
    if(b.id === 'accent-dot' || b.id === 'filebtn'){ setTimeout(watchSub, 0); return; }
    setTimeout(function(){ close(); }, 0);
  }, true);
  function watchSub(){
    var on = ['accent-dot', 'filebtn'].some(function(id){ var x = document.getElementById(id); return x && x.getAttribute('aria-expanded') === 'true'; });
    tray.classList.toggle('sub', on);
  }
  // a sheet that closes (tap outside, Esc) takes the tray with it
  var mo = new MutationObserver(function(){
    if(!tray.classList.contains('sub')) return;
    var on = ['accent-dot', 'filebtn'].some(function(id){ var x = document.getElementById(id); return x && x.getAttribute('aria-expanded') === 'true'; });
    if(!on) close();
  });
  ['accent-dot', 'filebtn'].forEach(function(id){ var x = document.getElementById(id); if(x) mo.observe(x, { attributes: true, attributeFilter: ['aria-expanded'] }); });
  // the grid, a feature or the viewer taking the screen closes it
  D.onShow && D.onShow.push(function(){ if(!tray.classList.contains('sub')) close(true); });
  document.getElementById('gridbtn').addEventListener('click', function(){ close(true); });

  // ---------- the Theme sheet, in steps (phones only) ----------
  // One preview on top, then a short step at a time: mode and accent, font, backdrop, effect.
  var sw = document.getElementById('swatches'), dot = document.getElementById('accent-dot');
  if(sw && dot){
    function row(sel, up){ var e = sw.querySelector(sel); return e && e.closest(up); }
    var TSTEPS = [
      { n: 'Accent and mode', els: [row('#theme', '.tp-row'), row('#tp-v-accent', '.tp-row')] },
      { n: 'Font', els: [row('#tp-fonts', '.tp-sec')] },
      { n: 'Backdrop', els: [row('#tp-styles', '.tp-sec'), row('#tp-colors', '.tp-row')] },
      { n: 'Effect and motion', els: [row('#tp-fx', '.tp-row'), row('#tp-fxo', '.tp-row'), row('#tp-motion', '.tp-row')] }
    ];
    TSTEPS.forEach(function(st, k){ st.els.forEach(function(e){ if(e) e.setAttribute('data-tstep', k); }); });
    var head = document.createElement('div'); head.className = 'tps-head';
    head.innerHTML = '<div><span class="tps-k"></span><b class="tps-h"></b></div><div class="tps-dots" role="tablist" aria-label="Theme steps">' +
      TSTEPS.map(function(st, k){ return '<button type="button" role="tab" data-to="' + k + '" aria-label="' + st.n + '"></button>'; }).join('') + '</div>';
    var foot = document.createElement('div'); foot.className = 'tps-nav';
    foot.innerHTML = '<button type="button" class="tps-back">Back</button><button type="button" class="tps-next">Next</button>';
    var hero = sw.querySelector('.tp-hero');
    if(hero && hero.nextSibling) sw.insertBefore(head, hero.nextSibling); else sw.insertBefore(head, sw.firstChild);
    sw.appendChild(foot);
    var tstep = 0;
    function paintStep(k, dir){
      tstep = Math.max(0, Math.min(TSTEPS.length - 1, k));
      head.querySelector('.tps-k').textContent = 'Theme · ' + (tstep + 1) + ' of ' + TSTEPS.length;
      head.querySelector('.tps-h').textContent = TSTEPS[tstep].n;
      Array.prototype.forEach.call(head.querySelectorAll('[data-to]'), function(b, i){ b.setAttribute('aria-selected', String(i === tstep)); b.classList.toggle('done', i < tstep); });
      Array.prototype.forEach.call(sw.querySelectorAll('[data-tstep]'), function(e){
        var on = +e.getAttribute('data-tstep') === tstep;
        e.classList.toggle('tps-on', on);
        if(on && dir){ e.classList.remove('tps-in-l', 'tps-in-r'); void e.offsetWidth; e.classList.add(dir > 0 ? 'tps-in-r' : 'tps-in-l'); }
      });
      foot.querySelector('.tps-back').disabled = tstep === 0;
      foot.querySelector('.tps-next').textContent = tstep === TSTEPS.length - 1 ? 'Done' : 'Next';
    }
    head.addEventListener('click', function(e){ var b = e.target.closest('[data-to]'); if(b){ e.stopPropagation(); var k = +b.getAttribute('data-to'); paintStep(k, k > tstep ? 1 : -1); } });
    foot.addEventListener('click', function(e){
      e.stopPropagation();
      if(e.target.closest('.tps-back')) paintStep(tstep - 1, -1);
      else if(e.target.closest('.tps-next')){ if(tstep === TSTEPS.length - 1) dot.click(); else paintStep(tstep + 1, 1); }
    });
    // every time it opens, it starts at the first step
    new MutationObserver(function(){ if(dot.getAttribute('aria-expanded') === 'true') paintStep(0); })
      .observe(dot, { attributes: true, attributeFilter: ['aria-expanded'] });
    paintStep(0);
  }

  // ---------- pull a sheet down to put it away ----------
  // The drawer's handle and heading (and the Theme and Share sheets' tops) follow your finger down;
  // let go far enough, or with a flick, and it goes.
  function pullDown(sheetEl, isHandle, onClose){
    var p = null;
    sheetEl.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1 || !isHandle(e.target)) return;
      p = { y: e.touches[0].clientY, t: Date.now(), dy: 0, v: 0, last: e.touches[0].clientY, lastT: Date.now(), on: false };
    }, { passive: true });
    sheetEl.addEventListener('touchmove', function(e){
      if(!p) return;
      var y = e.touches[0].clientY, dy = y - p.y;
      if(!p.on){ if(Math.abs(dy) < 6) return; if(dy < 0){ p = null; return; } p.on = true; sheetEl.style.transition = 'none'; }
      e.preventDefault();
      var now = Date.now(); p.v = (y - p.last) / Math.max(1, now - p.lastT); p.last = y; p.lastT = now;
      p.dy = Math.max(0, dy);
      sheetEl.style.transform = 'translateY(' + p.dy + 'px)';
    }, { passive: false });
    function end(){
      var d = p; p = null; if(!d || !d.on) return;
      sheetEl.style.transition = 'transform .3s cubic-bezier(.2, .8, .2, 1)';
      if(d.dy > Math.min(120, sheetEl.offsetHeight * 0.28) || d.v > 0.5){
        sheetEl.style.transform = 'translateY(' + (sheetEl.offsetHeight + 40) + 'px)';
        setTimeout(function(){ sheetEl.style.transition = ''; sheetEl.style.transform = ''; onClose(); }, 280);
      } else {
        sheetEl.style.transform = '';
        setTimeout(function(){ sheetEl.style.transition = ''; }, 320);
      }
    }
    sheetEl.addEventListener('touchend', end, { passive: true });
    sheetEl.addEventListener('touchcancel', end, { passive: true });
  }
  pullDown(sheet, function(t){ return !!t.closest('.tray-grab, .tray-head') || (t === sheet); }, function(){ close(true); });
  // the Theme and Share sheets get a handle of their own
  function grab(el){ if(!el || el.querySelector(':scope > .sheet-grab')) return; var gb = document.createElement('div'); gb.className = 'sheet-grab'; gb.setAttribute('aria-hidden', 'true'); el.insertBefore(gb, el.firstChild); }
  var swEl = document.getElementById('swatches'), dfEl = document.querySelector('.df-pop');
  [swEl, dfEl].forEach(function(el){
    if(!el) return; grab(el);
    pullDown(el, function(t){ return !!t.closest('.sheet-grab, .tp-hero, .tps-head, .df-head') && !t.closest('input, button'); }, function(){ close(true); });
  });

  // ---------- All slides on phones: Edit turns on moving, duplicating and deleting slides ----------
  var gridHead = document.querySelector('#grid .grid-head'), gridTiles = document.getElementById('grid-tiles');
  if(gridHead){
    var ge = document.createElement('button'); ge.type = 'button'; ge.className = 'grid-edit'; ge.id = 'grid-edit'; ge.textContent = 'Edit';
    ge.setAttribute('aria-pressed', 'false');
    var back = document.getElementById('grid-back'); gridHead.insertBefore(ge, back);
    function gridEditing(on){
      document.body.classList.toggle('grid-editing', on);
      ge.textContent = on ? 'Done' : 'Edit'; ge.setAttribute('aria-pressed', String(on));
    }
    ge.addEventListener('click', function(e){ e.stopPropagation(); gridEditing(!document.body.classList.contains('grid-editing')); });
    // leaving All slides ends it
    new MutationObserver(function(){ if(!document.body.classList.contains('grid-open') && document.body.classList.contains('grid-editing')) gridEditing(false); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // while editing, a tap on a slide doesn't open it (drag it, or use its buttons)
    if(gridTiles) gridTiles.addEventListener('click', function(e){
      if(!small || !document.body.classList.contains('grid-editing')) return;
      if(e.target.closest('.gt-act, .gt-add')) return;
      if(e.target.closest('.gt')){ e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  // ---------- touch: swipe between slides (the slide follows your finger), hold to edit ----------
  var stage = document.getElementById('stage');
  var published = !!(window.SLEEK_DECK && SLEEK_DECK.published);
  var HOLD_MS = 2000, GAP = 64;                       // slide px between a slide and the next while swiping
  var g = null, ring = null, holdT = 0, swallowClick = 0;
  function blocked(t){
    var b = document.body.classList;
    return b.contains('editing') || b.contains('annotating') || b.contains('grid-open') || b.contains('notes-open') && !!(t && t.closest && t.closest('.notes')) ||
      D.modal || !tray.hidden ||
      !!(t && t.closest && t.closest('.bar, .carousel, .car-track, [contenteditable="true"], .notes, input, textarea, .callout, .iv, .tray, .editbar, .et-card'));
  }
  function slideList(){ return Array.prototype.slice.call(stage.querySelectorAll(':scope > .slide')); }
  function scale(){ var r = stage.getBoundingClientRect(); return r.width / 1280 || 1; }
  function setX(el, x, anim){
    if(!el) return;
    el.style.transition = anim ? 'transform .32s cubic-bezier(.2, .8, .2, 1)' : 'none';
    el.style.transform = x ? 'translate3d(' + x + 'px,0,0)' : '';
  }
  function clearPeer(p){ if(!p) return; p.classList.remove('swipe-peer'); p.style.transition = ''; p.style.transform = ''; }

  // the hold ring: it fills under your finger; at 2s the deck goes into Edit mode
  function holdStart(x, y){
    if(published || !document.getElementById('editbtn')) return;
    clearTimeout(holdT);
    holdT = setTimeout(function(){
      ring = document.createElement('div'); ring.className = 'hold-ring';
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      ring.style.setProperty('--d', (HOLD_MS - 350) + 'ms');
      document.body.appendChild(ring);
      holdT = setTimeout(function(){
        if(!g) return;
        g.mode = 'held';
        ring.classList.add('done');
        try { if(navigator.vibrate) navigator.vibrate(18); } catch(e){}
        var r = ring; ring = null; setTimeout(function(){ r.remove(); }, 450);
        var eb = document.getElementById('editbtn'); if(eb && !document.body.classList.contains('editing')) eb.click();
        swallowClick = Date.now();
      }, HOLD_MS - 350);
    }, 350);                                           // a quick tap never shows it
  }
  function holdCancel(){ clearTimeout(holdT); if(ring){ var r = ring; ring = null; r.classList.add('gone'); setTimeout(function(){ r.remove(); }, 250); } }

  document.addEventListener('touchstart', function(e){
    if(!small && !('ontouchstart' in window)) return;
    if(e.touches.length !== 1 || blocked(e.target)){ g = null; holdCancel(); return; }
    var t = e.touches[0];
    g = { x: t.clientX, y: t.clientY, t: Date.now(), mode: 'wait', dx: 0, last: t.clientX, lastT: Date.now(), v: 0 };
    holdStart(t.clientX, t.clientY);
  }, { passive: true });

  document.addEventListener('touchmove', function(e){
    if(!g) return;
    var t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if(g.mode === 'wait'){
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      holdCancel();
      if(Math.abs(dx) < Math.abs(dy) * 1.1){
        // pushed up: on down to All slides, which sits below the slide; any other vertical move isn't ours
        if(dy < 0 && !scrollsDown(e.target) && document.getElementById('gridbtn')){ g.mode = 'pull'; g.vy = 0; g.lastY = t.clientY; g.lastYT = Date.now(); }
        else { g = null; return; }
      } else {
        var list = slideList(), cur = stage.querySelector(':scope > .slide.active'), k = list.indexOf(cur);
        g.mode = 'drag'; g.cur = cur; g.k = k; g.list = list; g.s = scale(); g.peer = null; g.dir = 0;
        stage.classList.add('swiping');
      }
    }
    if(g.mode === 'pull'){
      e.preventDefault();
      var nowY = Date.now(); g.vy = (t.clientY - g.lastY) / Math.max(1, nowY - g.lastYT); g.lastY = t.clientY; g.lastYT = nowY;
      g.dy = Math.min(0, dy);
      pullTo(g.dy, false);
      return;
    }
    if(g.mode !== 'drag') return;
    e.preventDefault();
    var now = Date.now(); g.v = (t.clientX - g.last) / Math.max(1, now - g.lastT); g.last = t.clientX; g.lastT = now;
    var dir = dx < 0 ? 1 : -1, nb = g.list[g.k + dir];
    if(dir !== g.dir){ clearPeer(g.peer); g.peer = nb || null; g.dir = dir; if(g.peer) g.peer.classList.add('swipe-peer'); }
    var x = dx / g.s;
    if(!g.peer) x = x * 0.3;                            // the first or last slide: it gives a little and comes back
    g.dx = x;
    setX(g.cur, x);
    if(g.peer) setX(g.peer, x + dir * (1280 + GAP));
  }, { passive: false });

  // the slide follows a push up part of the way; let go far enough (or flick) and All slides takes over
  // from where it is
  var PULL = 80;
  function pullTo(dy, anim){
    var vp = stage.parentNode;                         // the stage's own transform fits it to the screen
    vp.style.transition = anim ? 'transform .3s cubic-bezier(.2, .8, .2, 1)' : 'none';
    vp.style.transform = dy ? 'translate3d(0,' + Math.max(dy, -PULL * 3) * 0.45 + 'px,0)' : '';
  }
  function endPull(d, cancelled){
    swallowClick = Date.now();
    var vp = stage.parentNode, go = !cancelled && (-d.dy > PULL || d.vy < -0.5 && -d.dy > 24);
    if(go){ vp.style.transition = ''; vp.style.transform = ''; var b = document.getElementById('gridbtn'); if(b) b.click(); return; }
    pullTo(0, true);
    setTimeout(function(){ vp.style.transition = ''; }, 320);
  }
  // not while something under the finger can still scroll that way (it scrolls instead)
  function scrollsDown(t){
    for(var el = t; el && el !== document.body; el = el.parentElement)
      if(el.scrollHeight > el.clientHeight + 1 && el.scrollTop + el.clientHeight < el.scrollHeight - 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return true;
    return false;
  }

  function endDrag(cancelled){
    var d = g; g = null; holdCancel();
    if(d && d.mode === 'pull') return endPull(d, cancelled);
    if(!d || d.mode !== 'drag') return;
    swallowClick = Date.now();
    var go = !cancelled && d.peer && (Math.abs(d.dx) > 1280 * 0.22 || Math.abs(d.v) > 0.35 && (d.v < 0) === (d.dir > 0));
    if(go){
      setX(d.cur, -d.dir * (1280 + GAP), true);
      setX(d.peer, 0, true);
      setTimeout(function(){
        stage.classList.add('swiped');                  // no crossfade: it's already in place
        var btn = document.getElementById(d.dir > 0 ? 'next' : 'prev'); if(btn) btn.click();
        setX(d.cur, 0); d.cur.style.transition = ''; clearPeer(d.peer);
        stage.classList.remove('swiping');
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ stage.classList.remove('swiped'); }); });
      }, 320);
    } else {
      setX(d.cur, 0, true);
      if(d.peer) setX(d.peer, d.dir * (1280 + GAP), true);
      setTimeout(function(){ d.cur.style.transition = ''; clearPeer(d.peer); stage.classList.remove('swiping'); }, 330);
    }
  }
  document.addEventListener('touchend', function(){ endDrag(false); }, { passive: true });
  document.addEventListener('touchcancel', function(){ endDrag(true); }, { passive: true });
  // ---------- touch: in All slides, pull down from the top of the list to go back up to the slide ----------
  var gridEl = document.getElementById('grid'), gp = null;
  function gridPull(dy, anim){
    gridEl.style.transition = anim ? 'transform .3s cubic-bezier(.2, .8, .2, 1)' : 'none';
    gridEl.style.transform = dy ? 'translate3d(0,' + Math.min(dy, PULL * 3) * 0.45 + 'px,0)' : '';
  }
  if(gridEl){
    gridEl.addEventListener('touchstart', function(e){
      gp = null;
      if(e.touches.length !== 1 || !document.body.classList.contains('grid-open') || document.body.classList.contains('grid-editing') || D.modal) return;
      var t = e.touches[0]; gp = { x: t.clientX, y: t.clientY, mode: 'wait', dy: 0, vy: 0, last: t.clientY, lastT: Date.now() };
    }, { passive: true });
    gridEl.addEventListener('touchmove', function(e){
      if(!gp) return;
      var t = e.touches[0], dx = t.clientX - gp.x, dy = t.clientY - gp.y;
      if(gp.mode === 'wait'){
        if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // only down, only from the top of the list (anywhere else it scrolls), and not sideways
        if(dy < 0 || Math.abs(dx) > Math.abs(dy) || gridEl.scrollTop > 0){ gp = null; return; }
        gp.mode = 'pull'; gp.y = t.clientY; dy = 0;
      }
      e.preventDefault();
      var now = Date.now(); gp.vy = (t.clientY - gp.last) / Math.max(1, now - gp.lastT); gp.last = t.clientY; gp.lastT = now;
      gp.dy = Math.max(0, dy);
      gridPull(gp.dy, false);
    }, { passive: false });
    var gridEnd = function(cancelled){
      var d = gp; gp = null; if(!d || d.mode !== 'pull') return;
      swallowClick = Date.now();
      if(!cancelled && (d.dy > PULL || d.vy > 0.5 && d.dy > 24)){
        gridEl.style.transition = ''; gridEl.style.transform = '';   // it carries on down from where it is
        var b = document.getElementById('grid-back'); if(b) b.click(); return;
      }
      gridPull(0, true);
      setTimeout(function(){ gridEl.style.transition = ''; }, 320);
    };
    gridEl.addEventListener('touchend', function(){ gridEnd(false); }, { passive: true });
    gridEl.addEventListener('touchcancel', function(){ gridEnd(true); }, { passive: true });
  }

  // the tap that ends a swipe or a hold doesn't also turn the page or open a tile
  document.addEventListener('click', function(e){ if(e.isTrusted && Date.now() - swallowClick < 450){ e.stopPropagation(); e.preventDefault(); } }, true);
  // a long press doesn't select text or open the browser's menu over the slide
  document.addEventListener('contextmenu', function(e){ if(small && !document.body.classList.contains('editing') && e.target.closest && e.target.closest('#viewport, .zone')) e.preventDefault(); });
})();
