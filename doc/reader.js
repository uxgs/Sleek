/* A published Sleek Docs page, for its reader (doc/publish.js puts this in the file).

   It adds what plain HTML can't do: the outline at the side and where you are in it, the progress
   bar, light or dark (remembered in this browser, for this page), and the arrows that open and
   close collapsible headings. The page reads without it.

   It also says how far down the reader is, for "See who's reading" (features/viewers-beacon.js, in
   the file only when that is switched on): window.SleekReader stands in for a deck. Every top-level
   block of the page carries data-stop, its stop's number; index() is the stop the reader is at, and
   onShow's callbacks are told when that changes: at most once every 1.5 seconds, the furthest stop
   reached first and then the current one, so a fast scroll is not a flood. */
(function(){
  var de = document.documentElement, doc = document.getElementById('doc'); if(!doc) return;
  var NS = window.SLEEK_NS || '', kids = Array.prototype.slice.call(doc.children);
  function $(id){ return document.getElementById(id); }

  // ---------- light or dark ----------
  try { var saved = localStorage.getItem(NS + 'mode'); if(saved === 'dark') de.setAttribute('data-mode', 'dark'); else if(saved === 'light') de.removeAttribute('data-mode'); } catch(e){}
  var mode = $('rd-mode');
  if(mode) mode.addEventListener('click', function(){
    var dark = de.getAttribute('data-mode') !== 'dark';
    if(dark) de.setAttribute('data-mode', 'dark'); else de.removeAttribute('data-mode');
    try { localStorage.setItem(NS + 'mode', dark ? 'dark' : 'light'); } catch(e){}
  });

  // ---------- collapsible headings ----------
  function level(el){ return /^H[1-6]$/.test(el.tagName) ? +el.tagName.charAt(1) : 0; }
  function under(h){ var out = [], l = level(h); for(var n = h.nextElementSibling; n; n = n.nextElementSibling){ var k = level(n); if(k && k <= l) break; out.push(n); } return out; }
  function fold(){      // hide what every closed heading covers, and nothing else
    kids.forEach(function(k){ k.classList.remove('dk-folded'); });
    kids.forEach(function(h){ if(h.classList.contains('dk-toggle') && h.classList.contains('closed')) under(h).forEach(function(n){ n.classList.add('dk-folded'); }); });
  }
  function setClosed(h, closed){ h.classList.toggle('closed', closed); var b = h.querySelector('.dk-fold'); if(b){ b.setAttribute('aria-expanded', String(!closed)); b.setAttribute('aria-label', closed ? 'Show what is under this heading' : 'Hide what is under this heading'); } }
  kids.forEach(function(h){
    if(!h.classList.contains('dk-toggle')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dk-fold'; h.insertBefore(b, h.firstChild); setClosed(h, h.classList.contains('closed'));
    b.addEventListener('click', function(){ setClosed(h, !h.classList.contains('closed')); fold(); track(); });
  });
  fold();
  // going to something hidden opens the headings above it
  function reveal(el){ var changed = false; kids.forEach(function(h){ if(h.classList.contains('dk-toggle') && h.classList.contains('closed') && under(h).indexOf(el) >= 0){ setClosed(h, false); changed = true; } }); if(changed) fold(); }

  // ---------- the outline ----------
  var heads = kids.filter(function(k){ return (k.tagName === 'H1' || k.tagName === 'H2') && k.textContent.trim(); }), nav = $('rd-outline'), links = [];
  if(nav && heads.length >= 2){
    heads.forEach(function(h){
      var a = document.createElement('a'); a.href = '#' + h.id; a.textContent = h.textContent.trim(); if(h.tagName === 'H2' && heads.some(function(x){ return x.tagName === 'H1'; })) a.className = 'sub';
      a.addEventListener('click', function(){ reveal(h); }); nav.appendChild(a); links.push({ a: a, h: h });
    });
  } else if(nav) nav.parentNode.classList.add('no-outline');
  if(location.hash){ var at = document.getElementById(location.hash.slice(1)); if(at){ reveal(at); at.scrollIntoView(); } }

  // ---------- where the reader is ----------
  var R = window.SleekReader = { onShow: [], index: function(){ return cur; } }, cur = 0, far = 0, sent = -1, lastAt = 0, timer = 0;
  function stopNow(){
    var line = window.innerHeight * 0.75, s = 0;
    for(var i = 0; i < kids.length; i++){ var k = kids[i]; if(k.classList.contains('dk-folded')) continue; if(k.getBoundingClientRect().top < line) s = +k.getAttribute('data-stop') || 0; else break; }
    // at the very bottom the last block counts as reached, however short the page
    if(window.innerHeight + window.scrollY >= de.scrollHeight - 2 && kids.length) s = +kids[kids.length - 1].getAttribute('data-stop') || s;
    return s;
  }
  function tell(){
    timer = 0; lastAt = Date.now();
    var list = far > sent && far !== cur ? [far, cur] : [cur];      // the furthest reached first, if it would otherwise be missed
    list.forEach(function(s){ R.onShow.forEach(function(fn){ try { fn(null, s); } catch(e){} }); });
    sent = Math.max(sent, far);
  }
  function track(){
    var s = stopNow(), bar = $('rd-bar'), max = Math.max(1, de.scrollHeight - window.innerHeight);
    if(bar) bar.style.width = Math.min(100, window.scrollY / max * 100) + '%';
    var on = null; links.forEach(function(l){ if(l.h.getBoundingClientRect().top < 140) on = l; });
    links.forEach(function(l, i){ l.a.classList.toggle('on', on ? l === on : i === 0); });
    if(s === cur && s <= far) return;
    cur = s; if(s > far) far = s;
    if(timer) return;
    var wait = 1500 - (Date.now() - lastAt);
    if(wait <= 0) tell(); else timer = setTimeout(tell, wait);
  }
  var raf = 0;
  function soon(){ if(raf) return; raf = requestAnimationFrame(function(){ raf = 0; track(); }); }
  window.addEventListener('scroll', soon, { passive: true }); window.addEventListener('resize', soon);
  cur = far = stopNow(); track();
})();
