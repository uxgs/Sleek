/* Before picture: the picker behind a tile's Before button (Edit mode).

   A tile with a Before opens in Present with a divider that wipes between the two: the Before on
   the left, the tile's own picture (the After) on the right. Pick the Before from any picture in
   the deck, or upload one; "No before" turns it off. The choice is kept with the deck's media, so
   Save Changes writes it into data/seed.js and Revert drops it, like a replaced picture. */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror) return;
  var el = null, mid = null, prevFocus = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css(src){ return 'url(&quot;' + esc(src) + '&quot;)'; }

  function open(id, tile){
    if(el) return;
    mid = id; prevFocus = document.activeElement;
    var info = D.beforeInfo(id), list = D.beforeChoices(id);
    var picked = info.pick && info.pick.indexOf('tile:') === 0 ? info.pick.slice(5) : null;
    // group the pictures by slide, in deck order
    var groups = [];
    list.forEach(function(c){ var g = groups[groups.length - 1]; if(!g || g.slide !== c.slide){ g = { slide: c.slide, items: [] }; groups.push(g); } g.items.push(c); });
    var k = 0;
    el = document.createElement('div');
    el.className = 'bp-backdrop';
    el.innerHTML = '' +
      '<div class="bp-modal" role="dialog" aria-modal="true" aria-label="Before picture">' +
        '<button type="button" class="bp-close" data-close aria-label="Close">×</button>' +
        '<div class="bp-head">' +
          '<div class="bp-pair" aria-hidden="true">' +
            '<span class="bp-half bp-b"' + (info.src ? ' style="background-image:' + css(info.src) + '"' : '') + '><em>Before</em></span>' +
            '<span class="bp-half bp-a" style="background-image:' + css(info.after || '') + '"><em>After</em></span><i class="bp-line"></i>' +
          '</div>' +
          '<div class="bp-copy"><div class="bp-k">Before / after</div><h2 class="bp-h">What did it look like before?</h2>' +
            '<p class="bp-p">Pick the earlier picture. In Present, this tile opens with a divider that wipes from it to this one.' +
            (info.auto ? ' Right now it pairs by its caption; a pick here takes over.' : '') + '</p>' +
            '<div class="bp-actions">' +
              '<label class="bp-btn primary"><input type="file" accept="image/*" hidden>Upload a picture…</label>' +
              (info.src ? '<button type="button" class="bp-btn ghost" data-none>No before</button>' : '') +
            '</div></div>' +
        '</div>' +
        '<div class="bp-body">' + (groups.length ? groups.map(function(g){
          return '<div class="bp-group"><div class="bp-slide">' + esc(g.slide) + '</div><div class="bp-grid">' + g.items.map(function(c){
            var on = c.mid === picked || (!picked && info.src && c.src === info.src);
            return '<button type="button" class="bp-tile' + (on ? ' on' : '') + '" style="--i:' + (k++) + '" data-mid="' + esc(c.mid) + '" aria-pressed="' + on + '"' +
              ' aria-label="' + esc((c.cap || 'Picture') + ', ' + g.slide) + '">' +
              '<span class="bp-shot" style="background-image:' + css(c.src) + '"></span>' +
              (c.cap ? '<span class="bp-cap">' + esc(c.cap) + '</span>' : '') + '</button>';
          }).join('') + '</div></div>';
        }).join('') : '<p class="bp-empty">There are no other pictures in the deck yet. Upload one instead.</p>') + '</div>' +
      '</div>';
    document.body.appendChild(el);
    // grow out of the tile's button
    var m = el.querySelector('.bp-modal'), from = tile && tile.querySelector('.media-before');
    if(from){ var r = from.getBoundingClientRect(); m.style.setProperty('--ox', Math.round(r.left + r.width / 2 - m.offsetLeft) + 'px'); m.style.setProperty('--oy', Math.round(r.top + r.height / 2 - m.offsetTop) + 'px'); }
    el.addEventListener('click', onClick);
    el.querySelector('input[type=file]').addEventListener('change', onFile);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el) el.classList.add('in'); }); });
    setTimeout(function(){ var c = el && (el.querySelector('.bp-tile.on') || el.querySelector('.bp-tile')); if(c){ c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'nearest' }); } }, 380);
  }
  function close(){
    if(!el) return;
    var node = el; el = null;
    document.removeEventListener('keydown', onKey, true);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(function(){ node.remove(); }, 380);
    if(prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  }
  // show the choice in the pair at the top for a moment, then close
  function choose(value, src){
    if(!el || el.classList.contains('done')) return;
    D.setBefore(mid, value);
    el.classList.add('done');
    var b = el.querySelector('.bp-b');
    b.style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : '';
    el.querySelector('.bp-pair').classList.toggle('empty', !src);
    setTimeout(close, src ? 900 : 450);
  }
  function onClick(e){
    if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
    if(e.target.closest('[data-none]')){ choose(null, null); return; }
    var t = e.target.closest('.bp-tile'); if(!t) return;
    Array.prototype.forEach.call(el.querySelectorAll('.bp-tile.on'), function(x){ x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
    t.classList.add('on'); t.setAttribute('aria-pressed', 'true');
    var src = D.beforeChoices(mid).filter(function(c){ return c.mid === t.getAttribute('data-mid'); })[0];
    choose('tile:' + t.getAttribute('data-mid'), src && src.src);
  }
  function onFile(e){
    var f = e.target.files && e.target.files[0]; if(!f) return;
    D.mediaFromFile(f, function(src){ choose(src, src); });
  }
  function onKey(e){
    if(!el) return;
    e.stopImmediatePropagation();                       // the deck underneath stays put
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if(!/^Arrow/.test(e.key)) return;
    var list = Array.prototype.slice.call(el.querySelectorAll('.bp-tile')), at = list.indexOf(document.activeElement);
    if(!list.length) return;
    e.preventDefault();
    if(at < 0){ list[0].focus(); return; }
    var n = Math.max(0, Math.min(list.length - 1, at + ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key])));
    list[n].focus(); list[n].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  D.openBeforePicker = open;
})();
