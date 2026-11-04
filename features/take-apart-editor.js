/* Take-apart layers: the editor behind a take-apart tile's Layers button (Edit mode).

   A take-apart tile comes apart into layers. Each tile keeps its own: the layout's sample to begin
   with, your picture once you replace it (as one layer, at its real shape), then whatever you add here.
   Add layers from your own images (one per file, each drawn over the ones below it), name and describe
   each, put them in order or remove them. The layers save with the deck (features/disassemble.js reads
   them). */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror || !D.takeApart) return;
  var el = null, tile = null, mid = null, c = null, typing = 0, prevFocus = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function copy(o){ return JSON.parse(JSON.stringify(o)); }
  function uid(){ return 'l' + Math.random().toString(36).slice(2, 8); }

  // every take-apart tile gets a Layers button (shown in Edit mode)
  function chips(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .slide .media[data-dis]'), function(t){
      if(t.closest('.car-copy, .fs-copy') || t.querySelector(':scope > .media-layers')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'media-layers'; b.title = 'The layers this picture takes apart into';
      b.innerHTML = '<i aria-hidden="true"></i><span>Layers</span>';
      b.addEventListener('click', function(ev){ ev.stopPropagation(); ev.preventDefault(); open(t); });
      t.appendChild(b);
    });
    paintChips();
  }
  function paintChips(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage .media[data-dis] > .media-layers'), function(b){
      var r = D.takeApart.raw(b.parentNode), n = r && r.layers ? r.layers.length : 0;
      b.querySelector('span').textContent = n ? 'Layers · ' + n : 'Layers';
    });
  }

  function thumb(L){
    var src = L.src === '@tile' ? D.tilePicture(tile) : (L.src || (L.items && L.items[0] && L.items[0].src) || '');
    if(L.type === 'color') return '<span class="tl-shot" style="background:' + esc(L.color || '#222') + '"></span>';
    if(src && !D.isVideo(src)) return '<span class="tl-shot" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span>';
    return '<span class="tl-shot tl-aa">Aa</span>';
  }
  function rows(){
    var n = c.layers.length;
    return c.layers.map(function(L, k){ return { L: L, k: k }; }).reverse().map(function(it, pos){
      var L = it.L, k = it.k;
      return '<li class="tl-row" data-k="' + k + '" style="--i:' + pos + '">' + thumb(L) +
        '<span class="tl-fields">' +
          '<input class="tl-label" type="text" value="' + esc(L.label || '') + '" placeholder="Layer name" aria-label="Layer name">' +
          '<input class="tl-desc" type="text" value="' + esc(L.desc || '') + '" placeholder="What it is (optional)" aria-label="Layer description">' +
          (L.src === '@tile' ? '<em class="tl-tag">Your picture</em>' : '') +
        '</span>' +
        '<span class="tl-acts">' +
          '<button type="button" data-up aria-label="Move toward the front"' + (k === n - 1 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" data-down aria-label="Move toward the back"' + (k === 0 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" data-del aria-label="Remove layer"' + (n < 2 ? ' disabled' : '') + '>×</button>' +
        '</span></li>';
    }).join('');
  }
  function paint(){
    if(!el) return;
    el.querySelector('.tl-list').innerHTML = rows();
    el.querySelector('.tl-count').textContent = c.layers.length + (c.layers.length === 1 ? ' layer' : ' layers');
  }
  function save(){ D.setTileComponent(mid, copy(c)); paintChips(); }

  function open(t){
    if(el) return;
    tile = t; mid = t.getAttribute('data-mid'); prevFocus = document.activeElement;
    var raw = D.takeApart.raw(t); if(!raw){ return; }
    c = copy(raw);
    el = document.createElement('div');
    el.className = 'bp-backdrop tl-backdrop';
    el.innerHTML = '' +
      '<div class="bp-modal tl-modal" role="dialog" aria-modal="true" aria-label="Take-apart layers">' +
        '<button type="button" class="bp-close" data-close aria-label="Close">×</button>' +
        '<div class="tl-head"><div class="bp-k">Take apart · <span class="tl-count"></span></div><h2 class="bp-h">What is it made of?</h2>' +
          '<p class="bp-p">Front layer first. In Present, click the picture and these come apart one by one, each with its name and description. ' +
          'Add layers from your own images: one per file, drawn over the ones below.</p></div>' +
        '<ol class="tl-list"></ol>' +
        '<div class="tl-foot">' +
          '<label class="bp-btn primary"><input type="file" accept="image/*" multiple hidden>Add layers…</label>' +
          '<button type="button" class="bp-btn ghost" data-reset>Reset</button>' +
          '<span class="tl-sp"></span><button type="button" class="bp-btn ghost" data-close>Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    paint();
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.querySelector('input[type=file]').addEventListener('change', onFiles);
    document.addEventListener('keydown', onKey, true);
    D.modal = true;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el) el.classList.add('in'); }); });
  }
  function close(){
    if(!el) return;
    if(typing){ clearTimeout(typing); typing = 0; save(); }
    var node = el; el = null; D.modal = false;
    document.removeEventListener('keydown', onKey, true);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(function(){ node.remove(); }, 380);
    if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  function onClick(e){
    if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
    if(e.target.closest('[data-reset]')){
      // your picture alone again; on the layout's own picture, the layout's sample
      if(D.mediaIsCustom(mid)) D.setTileComponent(mid, D.takeApart.ownDefault(tile)); else D.setTileComponent(mid, null);
      c = copy(D.takeApart.raw(tile)); paint(); paintChips(); return;
    }
    var row = e.target.closest('.tl-row'); if(!row) return;
    var k = +row.getAttribute('data-k'), L = c.layers;
    if(e.target.closest('[data-up]') && k < L.length - 1){ L.splice(k + 1, 0, L.splice(k, 1)[0]); }
    else if(e.target.closest('[data-down]') && k > 0){ L.splice(k - 1, 0, L.splice(k, 1)[0]); }
    else if(e.target.closest('[data-del]') && L.length > 1){ L.splice(k, 1); }
    else return;
    paint(); save();
  }
  function onInput(e){
    var row = e.target.closest('.tl-row'); if(!row) return;
    var L = c.layers[+row.getAttribute('data-k')]; if(!L) return;
    if(e.target.classList.contains('tl-label')) L.label = e.target.value;
    else if(e.target.classList.contains('tl-desc')) L.desc = e.target.value;
    clearTimeout(typing); typing = setTimeout(function(){ typing = 0; save(); }, 350);
  }
  function onFiles(e){
    var files = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
    if(!files.length) return;
    var left = files.length, added = new Array(files.length);
    files.forEach(function(f, k){
      D.mediaFromFile(f, function(src){
        added[k] = { id: uid(), type: 'image', src: src, fit: 'contain', label: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Layer', desc: '' };
        if(--left) return;
        added.forEach(function(L){ if(L) c.layers.push(L); });   // over everything so far, in the order picked
        paint(); save();
      });
    });
  }
  function onKey(e){
    if(!el) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if(!(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) e.stopImmediatePropagation();   // the deck underneath stays put
  }

  chips();
  if(D.onShow) D.onShow.push(chips);
  // the count follows a replaced picture and Edit mode coming on
  new MutationObserver(function(){ paintChips(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  Array.prototype.forEach.call(document.querySelectorAll('#stage .media[data-dis]'), function(t){
    new MutationObserver(function(){ paintChips(); }).observe(t, { attributes: true, attributeFilter: ['style', 'class'] });
  });
  D.openLayers = open;
})();
