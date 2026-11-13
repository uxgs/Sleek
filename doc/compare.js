/* Before and after: two pictures and a handle to slide between them. Used by the editor
   (doc/blocks-compare.js) and by a published page (doc/publish.js puts this in when the page has one).

   The block is plain HTML that works with no script, the two pictures next to each other:
     <div class="dk-compare" data-mode="slider|side">
       <figure class="cmp-b"><img alt="Before"><figcaption>Before</figcaption></figure>
       <figure class="cmp-a"><img alt="After"><figcaption>After</figcaption></figure></div>
   mount() turns a 'slider' block into the slider (class cmp-live: the before picture lies over the
   after one, cut off at --p), with a handle to drag, a press anywhere to jump, and the arrow keys.
   A button under it switches to side by side and back. Printed, it is always side by side (doc.css). */
(function(){
  function mount(el, opts){
    opts = opts || {};
    var b = el.querySelector('.cmp-b img'), a = el.querySelector('.cmp-a img');
    if(!b || !a || !b.getAttribute('src') || !a.getAttribute('src')) return null;
    var handle = el.querySelector('.cmp-h'), tog = el.querySelector('.cmp-t'), p = 50;
    if(!handle){ handle = document.createElement('div'); handle.className = 'cmp-h'; el.appendChild(handle); }
    if(!tog && !opts.noToggle){ tog = document.createElement('button'); tog.type = 'button'; tog.className = 'cmp-t'; el.appendChild(tog); }
    el.setAttribute('role', 'slider'); el.setAttribute('aria-label', 'Before and after: drag, or use the arrow keys'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100'); el.tabIndex = 0;
    function set(v){ p = Math.max(0, Math.min(100, v)); el.style.setProperty('--p', p + '%'); el.setAttribute('aria-valuenow', String(Math.round(p))); }
    function at(e){ var r = el.querySelector('.cmp-a').getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); }
    function live(){ return el.getAttribute('data-mode') !== 'side'; }
    function paint(){ el.classList.toggle('cmp-live', live()); if(tog) tog.textContent = live() ? 'Show side by side' : 'Show as a slider'; }
    el.addEventListener('pointerdown', function(e){
      if(!live() || (tog && tog.contains(e.target)) || e.target.closest('.dk-fig-tools')) return;
      e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch(err){} at(e);
      function move(ev){ at(ev); } function up(){ el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('keydown', function(e){ if(!live()) return; if(e.key === 'ArrowLeft'){ set(p - 5); e.preventDefault(); } else if(e.key === 'ArrowRight'){ set(p + 5); e.preventDefault(); } });
    if(tog) tog.addEventListener('click', function(e){ e.stopPropagation(); var to = live() ? 'side' : 'slider'; if(opts.onMode) opts.onMode(to); else { el.setAttribute('data-mode', to); paint(); } });
    // the before picture lies over the after one, so it takes the after picture's height
    function size(){ var h = a.getBoundingClientRect().height; if(h) el.style.setProperty('--cmp-h', h + 'px'); }
    if(window.ResizeObserver) new ResizeObserver(size).observe(a); a.addEventListener('load', size); window.addEventListener('resize', size);
    set(50); paint(); size();
    return { paint: paint };
  }
  function all(root){ Array.prototype.forEach.call((root || document).querySelectorAll('.dk-compare'), function(el){ mount(el); }); }
  window.SleekCompare = { mount: mount, all: all };
  if(window.SLEEK_DECK && window.SLEEK_DECK.published) all(document);
})();
