/* The Sleek film on the start screen: a look at what Sleek does, in under a minute. On a first
   visit it is an interstitial: it fills the window and plays by itself, with a Skip button, and
   when it ends or is skipped the start screen is there and the film doesn't come back. "Watch the
   film" (under the headline, and in Settings) plays it again the same way. The film streams, so it
   needs a connection; nothing here is part of a deck or a published page.

   A browser won't play sound before a tap, so on a first visit it starts silent with a Sound on
   button; asked for with a click, it plays with sound. */
(function(){
  var SRC = 'assets/film/sleek.mp4', POSTER = 'assets/film/poster.jpg', KEY = 'sleek-film', root = document.documentElement;
  function get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function put(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  // a first visit (index.html's head marks it before the page is drawn, so the start screen never flashes first)
  var fresh = root.classList.contains('film-first') || (!get('sleek-sample-added') && !get(KEY));
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var box = null, video = null, prevFocus = null, raf = 0, counted = {};
  function count(name){ if(counted[name]) return; counted[name] = 1; try { if(window.gtag) window.gtag('event', name); } catch(e){} }
  function online(){ return navigator.onLine !== false; }
  function reveal(){ root.classList.remove('film-first'); }                  // the start screen, from here on
  var ICON = {
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5z"/><path class="ln" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.4L12 18.5v-13L7.4 9.5z"/><path class="ln" d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ln" d="m9 5.5 6.5 6.5L9 18.5"/></svg>'
  };

  function build(first){
    box = document.createElement('div'); box.className = 'fm' + (first ? ' fm-first' : '');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'The Sleek film');
    box.innerHTML =
      '<video class="fm-video" playsinline preload="auto" poster="' + POSTER + '"></video>' +
      '<div class="fm-msg" hidden><b>The film needs a connection.</b><span>It will be here when you are back online.</span></div>' +
      '<button type="button" class="fm-pill fm-sound"></button>' +
      '<button type="button" class="fm-pill fm-skip"><span>' + (first ? 'Skip' : 'Close') + '</span>' + ICON.next + '</button>' +
      '<div class="fm-line" aria-hidden="true"><i></i></div>';
    document.body.appendChild(box);
    video = box.querySelector('.fm-video');
    var sound = box.querySelector('.fm-sound'), fill = box.querySelector('.fm-line i'), msg = box.querySelector('.fm-msg');
    function paint(){
      sound.innerHTML = (video.muted ? ICON.muted : ICON.sound) + '<span>' + (video.muted ? 'Sound on' : 'Sound off') + '</span>';
      sound.setAttribute('aria-pressed', String(!video.muted));
      box.classList.toggle('fm-silent', video.muted);
    }
    function tick(){
      var d = video.duration || 52; fill.style.transform = 'scaleX(' + Math.min(1, video.currentTime / d) + ')';
      raf = requestAnimationFrame(tick);
    }
    function fail(){ msg.hidden = false; sound.hidden = true; if(first) setTimeout(close, 1600); }
    box._start = function(withSound){
      if(!online()){ fail(); return; }
      video.muted = !withSound; paint(); video.src = SRC;
      var p = video.play();
      if(p && p.catch) p.catch(function(err){                    // sound refused before a tap: play it silently instead
        if(err && err.name === 'NotAllowedError' && !video.muted){ video.muted = true; paint(); var p2 = video.play(); if(p2 && p2.catch) p2.catch(function(){}); }
      });
      count('film_play'); tick();
    };
    box._sound = function(){ video.muted = !video.muted; paint(); if(video.paused && !video.ended){ var p = video.play(); if(p && p.catch) p.catch(function(){}); } };
    sound.addEventListener('click', box._sound);
    // a click on the picture turns the sound on if it is off; after that it pauses and plays
    video.addEventListener('click', function(){ if(video.muted) box._sound(); else if(video.paused){ var p = video.play(); if(p && p.catch) p.catch(function(){}); } else video.pause(); });
    video.addEventListener('ended', function(){ count('film_complete'); close(); });
    video.addEventListener('error', function(){ if(video.getAttribute('src')) fail(); });
    box.querySelector('.fm-skip').addEventListener('click', close);
    paint();
  }
  function onKey(e){
    if(!box) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); return; }
    if(e.key === 'm'){ box._sound(); return; }
    if(e.key === ' '){ if(e.target.closest && e.target.closest('button')) return; e.preventDefault(); if(video.paused) video.play(); else video.pause(); return; }
    if(e.key !== 'Tab') return;                                      // focus stays in the film
    var f = Array.prototype.filter.call(box.querySelectorAll('button'), function(x){ return !x.hidden; });
    if(!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if(e.shiftKey && document.activeElement === a){ e.preventDefault(); z.focus(); }
    else if(!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
  }
  function open(opts){
    if(box) return;
    opts = opts || {};
    prevFocus = document.activeElement; build(!!opts.first); put(KEY, 'seen');
    root.classList.add('film-on');
    if(opts.first) box.classList.add('in'); else { void box.offsetWidth; box.classList.add('in'); }
    document.addEventListener('keydown', onKey, true);
    box._start(!opts.first);                                         // asked for with a click: with sound
    setTimeout(function(){ if(box) box.querySelector('.fm-skip').focus({ preventScroll: true }); }, 80);
  }
  function close(){
    if(!box) return;
    var b = box; box = null; cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    reveal(); root.classList.remove('film-on');
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch(e){}      // let go of the download
    b.classList.remove('in'); b.classList.add('out');
    setTimeout(function(){ b.remove(); }, 520);
    var back = prevFocus && prevFocus !== document.body ? prevFocus : document.querySelector('[data-film]');
    if(back && back.focus) back.focus({ preventScroll: true });
  }

  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('[data-film]'); if(!t) return;
    e.preventDefault();
    setTimeout(function(){ open({}); }, t.closest('#set') ? 200 : 0);         // from Settings: let its panel close first
  });
  // a first visit: the film is the first thing there is. Not offline, not with reduced motion, not on a link straight to New deck.
  if(fresh && online() && !calm && location.hash !== '#setup') open({ first: true });
  else reveal();
  window.SleekFilm = { open: open, close: close };
})();
