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
  Array.prototype.forEach.call(grp.querySelectorAll('button[data-tt], #filebtn'), function(b){
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

  var small = false;
  function apply(){
    var s = mq.matches;
    if(s === small) return;
    small = s;
    document.body.classList.toggle('compact', s);
    if(s) body.appendChild(grp); else { close(true); bar.insertBefore(grp, more); }
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

  // ---------- swipe between slides ----------
  var vp = document.getElementById('viewport') || document.getElementById('stage');
  var sx = 0, sy = 0, st = 0, track = false;
  function blocked(t){
    var b = document.body.classList;
    return b.contains('editing') || b.contains('annotating') || b.contains('grid-open') || D.modal ||
      !!(t && t.closest && t.closest('.carousel, .car-track, [contenteditable="true"], .notes, input, textarea, .callout, .iv, .tray'));
  }
  vp.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1 || blocked(e.target)){ track = false; return; }
    track = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  vp.addEventListener('touchend', function(e){
    if(!track) return; track = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if(Date.now() - st > 700 || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    var btn = document.getElementById(dx < 0 ? 'next' : 'prev'); if(btn) btn.click();
  }, { passive: true });
})();
