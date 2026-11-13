/* Charts and big numbers on a page: drawing them and playing their motion. Used by the editor
   (doc/blocks-data.js) and by a published page (doc/publish.js puts this in when the page has one).

   A block is <div class="dk-data" data-kind="results|chart" data-json="{…}"><div class="ds-host">,
   and the drawing is Sleek Slides' own (features/data-layout.js: SleekData.draw paints a host as it
   looks so many milliseconds after it appeared). Here a block is drawn finished, then played once,
   from the start, the first time it scrolls into view: numbers count up, bars grow. Motion is left
   out when the data says so (anim: false) or the reader's device asks for less of it.

   SleekDocData.mount(el) draws and watches one block; .all(root) every block under root. */
(function(){
  var SD = window.SleekData; if(!SD) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = window.IntersectionObserver ? new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting && e.target.__play){ seen.unobserve(e.target); e.target.__play(); } }); }, { threshold: 0.35 }) : null;
  function read(el){ var ds = null; try { ds = JSON.parse(el.getAttribute('data-json') || 'null'); } catch(e){} return ds; }
  function mount(el){
    var kind = el.getAttribute('data-kind') === 'results' ? 'results' : 'chart', host = el.querySelector('.ds-host'), raf = 0;
    if(!host){ host = document.createElement('div'); host.className = 'ds-host'; el.appendChild(host); }
    host.setAttribute('data-ds', kind);
    var ds = SD.norm(kind, read(el));
    el.setAttribute('data-type', kind === 'chart' ? ds.type : 'results');
    // the room the numbers really have, less a little: they are set in even-width digits, which run wider than the drawing code measures
    function at(ms){ return SD.draw(host, ds, ms, { width: Math.max(240, (host.clientWidth || 640) * 0.93), max: 76 }); }
    function done(){ cancelAnimationFrame(raf); raf = 0; at(1e9); }
    function play(){
      if(still || ds.anim === false){ done(); return; }
      cancelAnimationFrame(raf); var t0 = performance.now(), len = at(0);
      (function step(now){ var t = now - t0; if(t >= len){ done(); return; } at(t); raf = requestAnimationFrame(step); })(t0);
    }
    done();
    el.__play = play; el.__redraw = function(){ ds = SD.norm(kind, read(el)); el.setAttribute('data-type', kind === 'chart' ? ds.type : 'results'); done(); };
    if(seen) seen.observe(el);
    if(window.ResizeObserver && kind === 'results'){ var w = el.clientWidth; new ResizeObserver(function(){ if(Math.abs(el.clientWidth - w) > 8 && !raf){ w = el.clientWidth; done(); } }).observe(el); }
    return el;
  }
  function all(root){ Array.prototype.forEach.call((root || document).querySelectorAll('.dk-data'), mount); }
  window.SleekDocData = { mount: mount, all: all };
  // in a published page there is no editor to mount the blocks: do it here
  if(window.SLEEK_DECK && window.SLEEK_DECK.published) all(document);
})();
