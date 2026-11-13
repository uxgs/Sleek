/* The start screen's Settings (the gear by the wordmark): tips on or off, the tour again, the sample
   deck (features/library.js adds it), how Sleek works (six short clips, one playing at a time), and about. */
(function(){
  var box = document.getElementById('set'), openBtn = document.getElementById('set-open'); if(!box || !openBtn) return;
  var tips = document.getElementById('set-tips'), tour = document.getElementById('set-tour'), prevFocus = null;

  function get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function put(k, v){ try { if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){} }

  // the tips (features/tour.js): on unless turned off here
  function paintTips(){ tips.checked = get('sleek-tips') !== 'off'; }
  tips.addEventListener('change', function(){ put('sleek-tips', tips.checked ? null : 'off'); });
  tour.addEventListener('click', function(){
    put('sleek-tips', null); put('sleek-tour', 'edit'); paintTips();
    tour.textContent = 'Starts in your next deck'; tour.disabled = true;
  });
  var C = window.SLEEK_CHANGES, ver = document.getElementById('set-ver');
  if(C && C.length && ver) ver.textContent = 'Sleek Slides ' + C[0].v;

  // How Sleek works: one screen and six things to show on it. The item you pick plays; when it ends the
  // next one does. The clips stream (assets/help), so they are fetched when Settings opens and let go when it closes.
  var how = document.getElementById('how'), hv = how && how.querySelector('.how-video'), howNow = null;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function howItems(){ return Array.prototype.filter.call(how.querySelectorAll('.how-item'), function(b){ return !b.parentNode.hidden; }); }   // (Link a folder's is hidden where the browser can't)
  function howPick(btn, play){
    if(!how || !btn) return;
    howNow = btn;
    Array.prototype.forEach.call(how.querySelectorAll('.how-item'), function(b){ if(b === btn) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    var clip = btn.getAttribute('data-clip');
    hv.poster = 'assets/help/' + clip + '.jpg';
    if(play){
      howSound(); hv.src = 'assets/help/' + clip + '.mp4';
      var p = hv.play();
      if(p && p.catch) p.catch(function(err){               // sound refused (no tap yet): play it silently instead
        if(err && err.name === 'NotAllowedError' && !hv.muted){ hv.muted = true; paintSound(); var p2 = hv.play(); if(p2 && p2.catch) p2.catch(function(){}); }
      });
    }
    else { hv.removeAttribute('src'); hv.load(); }
  }
  // the clips have quiet sound (clicks over a low bed); the button on the screen turns it off, and stays off
  var hs = document.getElementById('how-sound');
  var SND = { on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5z"/><path class="ln" d="M15.5 9a4.2 4.2 0 0 1 0 6"/></svg>',
              off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5z"/><path class="ln" d="m16 9.5 5 5M21 9.5l-5 5"/></svg>' };
  function paintSound(){                           // the button says what you are hearing
    var off = hv.muted;
    hs.innerHTML = off ? SND.off : SND.on; hs.setAttribute('aria-pressed', String(!off)); hs.title = off ? 'Sound off. Click for sound.' : 'Sound on. Click to mute.';
  }
  function howSound(){
    if(!hv || !hs) return;
    hv.muted = get('sleek-help-sound') === 'off'; hv.volume = 0.8; paintSound();
  }
  function howStop(){ if(!hv) return; try { hv.pause(); hv.removeAttribute('src'); hv.load(); } catch(e){} }
  if(how){
    hs.addEventListener('click', function(e){
      e.stopPropagation(); put('sleek-help-sound', hv.muted ? null : 'off'); howSound();
      if(hv.paused && hv.getAttribute('src')){            // a browser may stop a clip as its sound comes on: start it again
        var p = hv.play(); if(p && p.catch) p.catch(function(){ hv.muted = true; paintSound(); var p2 = hv.play(); if(p2 && p2.catch) p2.catch(function(){}); });
      }
    });
    howSound();
    how.addEventListener('click', function(e){ var b = e.target.closest('.how-item'); if(b) howPick(b, true); else if(e.target.closest('.how-screen')) howPick(howNow || howItems()[0], true); });
    hv.addEventListener('ended', function(){ var it = howItems(), k = it.indexOf(howNow); howPick(it[(k + 1) % it.length], true); });
  }

  function open(){
    if(!box.hidden) return;
    prevFocus = document.activeElement; paintTips();
    if(how) howPick(howNow && !howNow.parentNode.hidden ? howNow : howItems()[0], !calm);
    tour.disabled = false; tour.textContent = 'Show the tour';
    box.hidden = false; void box.offsetWidth; box.classList.add('in');
    openBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey, true);
    setTimeout(function(){ var c = box.querySelector('.set-close'); if(c) c.focus({ preventScroll: true }); }, 60);
  }
  function close(){
    if(box.hidden) return;
    box.classList.remove('in'); openBtn.setAttribute('aria-expanded', 'false'); howStop();
    document.removeEventListener('keydown', onKey, true);
    setTimeout(function(){ box.hidden = true; }, 260);
    if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  function onKey(e){
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); return; }
    if(e.key !== 'Tab') return;                       // focus stays in the panel
    var f = Array.prototype.filter.call(box.querySelectorAll('button, a[href], input'), function(x){ return !x.disabled && !x.closest('[hidden]'); });
    if(!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  openBtn.addEventListener('click', open);
  box.addEventListener('click', function(e){
    if(e.target === box){ close(); return; }
    var c = e.target.closest('[data-close]'); if(!c) return;
    if(c.hasAttribute('data-news')){
      e.preventDefault(); close();
      var n = document.getElementById('whats-new'); if(n) setTimeout(function(){ if(window.SleekNews) window.SleekNews.open(); else n.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
    } else close();
  });
})();
