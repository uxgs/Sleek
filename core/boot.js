/* Opens a deck: reads it from this browser (core/store.js), then starts the engine on it.

   deck.html?d=<deck id> opens that deck; with no id it opens the most recent one (and on the very
   first visit, the sample). A published deck (one HTML file) doesn't use this: it carries its deck
   and its scripts inline. The engine and its features load only once the deck is here, so every script finds window.SEED,
   and the page stays hidden until it has painted in the deck's own theme. */
(function(){
  var de = document.documentElement;
  de.classList.add('booting');
  var SCRIPTS = ['theme-boot.js', '@body', 'features/collage-layout.js', 'features/data-layout.js', 'app.js', 'glow-fx.js', 'features/disassemble.js', 'features/press.js',
                 'features/add-slide.js', 'features/before-picker.js', 'features/take-apart-editor.js', 'features/deck-file.js', 'features/tour.js', 'features/mobile.js', 'features/fit.js', 'features/collage.js', 'features/floats.js', 'features/data-slides.js', 'features/viewers.js'];
  var params = new URLSearchParams(location.search), id = params.get('d');
  var mirror = params.get('mirror') === '1', presenter = location.hash === '#presenter';

  function load(list, done){
    var k = 0;
    (function next(){
      if(k >= list.length){ done(); return; }
      var src = list[k++];
      if(src === '@body'){
        if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', next, { once: true }); else next();
        return;
      }
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = next; s.onerror = function(){ console.error('Sleek could not load ' + src); next(); };
      (document.body || document.head).appendChild(s);
    })();
  }
  function start(deck, seed){
    window.SEED = seed;
    window.SLEEK_DECK = { id: deck.id, title: deck.title };
    window.SLEEK_NS = window.SleekStore.ns(deck.id);
    if(!mirror && !presenter) document.title = deck.title + ' · Sleek Slides';
    load(SCRIPTS, function(){ setTimeout(function(){ de.classList.remove('booting'); }, 30); });
  }
  function fail(msg){
    de.classList.remove('booting');
    document.body.innerHTML = '<div class="boot-fail"><h1>That deck isn’t here.</h1><p>' + msg + '</p><a href="index.html">Go to your decks</a></div>';
  }

  // the offline cache (sw.js): the app opens with no connection and installs as an app
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]mirror=1/.test(location.search)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}   // while developing, only when asked for
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
  var S = window.SleekStore;
  if(!S){ fail('Sleek could not start: this browser blocks its storage.'); return; }
  S.open()
    .then(function(){ return S.ensureSample(); })
    .then(function(){ return id ? S.get(id) : S.list().then(function(l){ return l[0] ? S.get(l[0].id) : null; }); })
    .then(function(deck){
      if(!deck){ if(id) fail('It may have been deleted, or made in another browser. Decks live in the browser they were made in.'); else location.replace('index.html'); return; }
      if(!id){ try { history.replaceState(null, '', location.pathname + '?d=' + deck.id + location.hash); } catch(e){} }
      return S.hydrate(deck.seed).then(function(seed){ start(deck, seed); });
    })
    .catch(function(e){ console.error(e); fail('Sleek could not open its storage in this browser (a private window can block it).'); });
})();
