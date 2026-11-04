/* Add a slide: the template picker behind the grid's last tile.

   Every layout in the deck is a template (app.js reads them from the markup). The picker shows each
   one as a live preview; pick one and it joins the deck with placeholder words and the sample's
   pictures to replace, and the page opens on it. Search filters by name and description; arrow
   keys move between cards, Enter picks, Esc closes. */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror) return;
  var el = null, prevFocus = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fit(){
    if(!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('.as-shot'), function(sh){
      var cv = sh.firstChild; if(cv) cv.style.transform = 'scale(' + (sh.clientWidth / 1280) + ')';
    });
  }
  function cards(){ return Array.prototype.filter.call(el.querySelectorAll('.as-card'), function(c){ return !c.hidden; }); }

  function open(from){
    if(el) return;
    prevFocus = document.activeElement;
    var list = D.templates();
    el = document.createElement('div');
    el.className = 'as-backdrop';
    el.innerHTML = '' +
      '<div class="as-modal" role="dialog" aria-modal="true" aria-label="Add a slide">' +
        '<button type="button" class="as-close" data-close aria-label="Close">×</button>' +
        '<div class="as-head"><div class="as-head-main"><div class="as-k">New slide</div><h2 class="as-h">Pick a layout.</h2>' +
          '<p class="as-p">It joins the end of the deck with placeholder words and sample pictures, ready to replace. Drag it anywhere in the grid after.</p></div>' +
          '<label class="as-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17" stroke-linecap="round"/></svg>' +
          '<input type="search" placeholder="Search layouts" aria-label="Search layouts"></label></div>' +
        '<div class="as-grid" role="list">' + list.map(function(t, k){
          return '<button type="button" class="as-card" role="listitem" style="--i:' + k + '" data-key="' + esc(t.key) + '" data-find="' + esc((t.name + ' ' + t.desc).toLowerCase()) + '">' +
            '<span class="as-shot"><span class="pres-canvas glow"></span></span>' +
            '<span class="as-name">' + esc(t.name) + '</span><span class="as-desc">' + esc(t.desc) + '</span></button>';
        }).join('') + '<div class="as-empty" hidden>No layout matches that.</div></div>' +
      '</div>';
    document.body.appendChild(el);
    Array.prototype.forEach.call(el.querySelectorAll('.as-card'), function(c){
      var p = D.templatePreview(c.getAttribute('data-key')); if(p) c.querySelector('.pres-canvas').appendChild(p);
    });
    // grow out of the tile that opened it
    var m = el.querySelector('.as-modal');
    if(from && from.getBoundingClientRect){
      var r = from.getBoundingClientRect(), mx = m.offsetLeft, my = m.offsetTop;
      m.style.setProperty('--ox', Math.round(r.left + r.width / 2 - mx) + 'px');
      m.style.setProperty('--oy', Math.round(r.top + r.height / 2 - my) + 'px');
    }
    fit();
    el.addEventListener('click', onClick);
    el.querySelector('input').addEventListener('input', onSearch);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fit);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el) el.classList.add('in'); }); });
    setTimeout(function(){ var c = cards()[0]; if(el && c) c.focus({ preventScroll: true }); }, 350);
  }
  function close(){
    if(!el) return;
    var node = el; el = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fit);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(function(){ node.remove(); }, 420);
    if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  function pick(card){
    if(!el || el.classList.contains('picking')) return;
    el.classList.add('picking'); card.classList.add('chosen');
    var hash = D.addSlide(card.getAttribute('data-key'));
    var veil = document.createElement('div'); veil.className = 'as-veil'; document.body.appendChild(veil);
    setTimeout(function(){ veil.classList.add('on'); }, 420);
    setTimeout(function(){
      try { history.replaceState(null, '', location.pathname + location.search + (hash || '')); } catch(e){}
      location.reload();
    }, 800);
  }
  function onClick(e){
    if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
    var c = e.target.closest('.as-card'); if(c) pick(c);
  }
  function onSearch(e){
    var q = e.target.value.trim().toLowerCase(), any = false;
    Array.prototype.forEach.call(el.querySelectorAll('.as-card'), function(c){ var hit = !q || c.getAttribute('data-find').indexOf(q) > -1; c.hidden = !hit; any = any || hit; });
    el.querySelector('.as-empty').hidden = any;
    fit();
  }
  function onKey(e){
    if(!el) return;
    e.stopImmediatePropagation();                       // the deck underneath stays put
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    var inSearch = e.target.tagName === 'INPUT';
    var list = cards(), at = list.indexOf(document.activeElement);
    if(e.key === 'Enter' && at > -1){ e.preventDefault(); pick(list[at]); return; }
    if(e.key === 'Enter' && inSearch && list.length){ e.preventDefault(); pick(list[0]); return; }
    if(/^Arrow/.test(e.key) && !(inSearch && /Left|Right/.test(e.key))){
      e.preventDefault();
      if(at < 0){ if(list[0]) list[0].focus(); return; }
      var cols = Math.max(1, Math.round(el.querySelector('.as-grid').clientWidth / (list[0].offsetWidth + 20)));
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      var n = Math.max(0, Math.min(list.length - 1, at + step));
      list[n].focus(); list[n].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // after the page rebuilds: fade in on the new slide
  var arrived = false;
  try { arrived = sessionStorage.getItem('sleek-arrive') === '1'; sessionStorage.removeItem('sleek-arrive'); } catch(e){}
  if(arrived){
    var veil = document.createElement('div'); veil.className = 'as-veil on'; document.body.appendChild(veil);
    requestAnimationFrame(function(){ setTimeout(function(){ veil.classList.add('lift'); setTimeout(function(){ veil.remove(); }, 700); }, 120); });
    D.justAdded = true;
  }

  D.openAddSlide = open;
})();
