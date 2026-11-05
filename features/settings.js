/* The start screen's Settings (the gear by the wordmark): tips on or off, the tour again, the sample
   deck (features/library.js adds it), how Sleek works, and about. */
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
  if(C && C.length && ver) ver.textContent = 'Sleek, version ' + C[0].v;

  function open(){
    if(!box.hidden) return;
    prevFocus = document.activeElement; paintTips();
    tour.disabled = false; tour.textContent = 'Show the tour';
    box.hidden = false; void box.offsetWidth; box.classList.add('in');
    openBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey, true);
    setTimeout(function(){ var c = box.querySelector('.set-close'); if(c) c.focus({ preventScroll: true }); }, 60);
  }
  function close(){
    if(box.hidden) return;
    box.classList.remove('in'); openBtn.setAttribute('aria-expanded', 'false');
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
      var n = document.getElementById('whats-new'); if(n) setTimeout(function(){ n.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
    } else close();
  });
})();
