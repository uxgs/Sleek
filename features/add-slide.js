/* Add a slide: the picker behind the grid's + tile and the + between any two tiles.

   Layouts are grouped by what you want to say (Start and end, Words, Pictures, Numbers and plans),
   and versions of one idea share a card: Bullets comes with no picture, one or two; a Chart as
   bars, a line, a pie or a donut. Each card shows the layout as it would look in this deck. Pick
   one and it joins the deck where you pointed (after a slide, or at the end) with placeholder words
   and sample pictures to replace, and the page opens on it. Search finds layouts by what they are
   for ("compare", "numbers", "film"), not only by name; your last few picks sit at the top. Arrow
   keys move between cards, Enter picks, Esc closes. */
(function(){
  var D = window.Deck; if(!D || D.popout || D.mirror) return;
  var el = null, prevFocus = null, S = null;

  var GROUPS = [['ends', 'Start and end'], ['words', 'Words'], ['pictures', 'Pictures'], ['numbers', 'Numbers and plans']];
  // one card per idea. v: its versions (k: the layout it adds; n: the version's name; d: when to use it;
  // x: what the new slide starts with; s: the new slide's name, the card's unless given; find: more words to find it by)
  var CARDS = [
    { id: 'title', g: 'ends', name: 'Title', find: 'opening first cover start name intro', v: [{ k: 'title', d: 'The opening slide: the deck’s name and one line about it.' }] },
    { id: 'divider', g: 'ends', name: 'Section break', find: 'divider part chapter section agenda', v: [{ k: 'divider', d: 'Opens a new part of a longer deck.' }] },
    { id: 'wrap-up', g: 'ends', name: 'Wrap up', find: 'close end summary recap questions thanks last', v: [{ k: 'wrap-up', d: 'The close: three takeaways, then questions.' }] },
    { id: 'bullets', g: 'words', name: 'Bullets', find: 'list points text', v: [
      { k: 'bullets', n: 'Words only', d: 'A headline and a short list.' },
      { k: 'bullets-video', n: 'With a picture', d: 'A point, with one picture or film that proves it.', find: 'picture photo image video film screenshot' },
      { k: 'bullets-two-videos', n: 'With two pictures', d: 'A point, with a pair of pictures: two options or two states.', find: 'two pictures photos videos pair compare options' } ] },
    { id: 'statement', g: 'words', name: 'Statement', find: 'quote big sentence line message film strip', v: [{ k: 'statement', d: 'The one sentence the room should remember, with pictures rolling beside it.' }] },
    { id: 'cards', g: 'words', name: 'Cards', find: 'three steps options pillars stages plans process compare', v: [{ k: 'cards', d: 'Anything that comes in threes: steps, options or pillars.' }] },
    { id: 'lessons', g: 'words', name: 'Lessons', find: 'two columns pros cons compare risks worked for against good bad', v: [{ k: 'lessons', d: 'Two sides of one thing: what worked and what to watch.' }] },
    { id: 'gallery', g: 'pictures', name: 'Gallery', find: 'three pictures photos screens images examples', v: [{ k: 'gallery', d: 'Three pictures: one large, two beside it. Each opens full screen.' }] },
    { id: 'carousel', g: 'pictures', name: 'Carousel', find: 'pictures photos screens row scroll images', v: [
      { k: 'carousel', n: 'Pictures', d: 'A slow, endless row of large pictures.' },
      { k: 'before-after', n: 'Before and after', s: 'Before and after', d: 'Each picture has a Before: open one and drag between the two.', find: 'before after compare old new sketch redesign versions' } ] },
    { id: 'collage', g: 'pictures', name: 'Moodboard', find: 'wall many pictures photos mosaic collage inspiration references', v: [{ k: 'collage', d: 'A wall of many pictures, still or drifting.' }] },
    { id: 'full', g: 'pictures', name: 'Full screen', find: 'whole slide big hero edge', v: [
      { k: 'fullscreen-image', n: 'Picture', s: 'Full screen picture', d: 'One picture filling the slide, to show big or point at.', find: 'picture photo image screenshot annotate' },
      { k: 'full-video', n: 'Film with a title', s: 'Full screen film', d: 'A film filling the slide, with a title over it.', find: 'video film movie demo recording' } ] },
    { id: 'take-apart', g: 'pictures', name: 'Take apart', find: 'layers anatomy explode parts how it is built diagram', v: [{ k: 'take-apart', d: 'One picture that comes apart into labelled layers when you click it.' }] },
    { id: 'results', g: 'numbers', name: 'Results', isNew: true, find: 'numbers figures stats metrics kpi results data count totals money growth', v: [{ k: 'results', d: 'One to four big numbers that count up as the slide appears.' }] },
    { id: 'chart', g: 'numbers', name: 'Chart', isNew: true, find: 'numbers data graph chart figures stats', v: [
      { k: 'chart', n: 'Bars', x: { ds: { type: 'bars' } }, d: 'Compare amounts side by side, with one picked out.', find: 'bar column compare amounts' },
      { k: 'chart', n: 'Line', x: { ds: { type: 'line' } }, d: 'Show how one thing changed over time.', find: 'trend over time growth line' },
      { k: 'chart', n: 'Pie', x: { ds: { type: 'pie' } }, d: 'Show the parts of a whole.', find: 'pie share split parts percentage breakdown' },
      { k: 'chart', n: 'Donut', x: { ds: { type: 'donut' } }, d: 'Parts of a whole, with the main share written in the middle.', find: 'donut ring share split parts percentage breakdown' } ] },
    { id: 'tasks', g: 'numbers', name: 'Tasks', isNew: true, find: 'tasks board kanban todo to-do list plan status progress project roadmap sprint', v: [
      { k: 'tasks', n: 'Board', x: { tk: { view: 'board' } }, d: 'A project’s board from Sleek Tasks, as it stands when you show it.', find: 'board kanban columns cards status' },
      { k: 'tasks', n: 'List', x: { tk: { view: 'list' } }, d: 'A project’s tasks from Sleek Tasks as a list, as they stand when you show it.', find: 'list todo to-do checklist' } ] }
  ];
  var have = {}; D.templates().forEach(function(t){ have[t.key] = true; });
  CARDS = CARDS.map(function(c){ var o = Object.assign({}, c); o.v = c.v.filter(function(v){ return have[v.k]; }); return o; }).filter(function(c){ return c.v.length; });
  var byId = {}; CARDS.forEach(function(c){ byId[c.id] = c; });

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var RECENT = 'sleek-add-recent';
  function recent(){ try { return (JSON.parse(localStorage.getItem(RECENT) || '[]') || []).filter(function(r){ return byId[r[0]] && byId[r[0]].v[r[1]]; }).slice(0, 3); } catch(e){ return []; } }
  function remember(id, i){ try { localStorage.setItem(RECENT, JSON.stringify([[id, i]].concat(recent().filter(function(r){ return !(r[0] === id && r[1] === i); })).slice(0, 3))); } catch(e){} }
  function which(id){ return S.q.trim() && S.hit[id] != null ? S.hit[id] : (S.sel[id] || 0); }   // a search points a card at the version it matched
  function full(c, i){ return c.name + (c.v[i].n ? ', ' + c.v[i].n.toLowerCase() : ''); }

  function fit(){
    if(!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('.as-shot'), function(sh){
      var cv = sh.firstChild; if(cv && cv.style) cv.style.transform = 'scale(' + (sh.clientWidth / 1280) + ')';
    });
  }
  // a card's layout as it would look in this deck
  function paintShot(sh, v){
    sh.innerHTML = '<span class="pres-canvas glow"></span>';
    var cv = sh.firstChild, p = D.templatePreview(v.k, v.x || null); if(p) cv.appendChild(p);
    if(window.GlowFX){ cv.setAttribute('data-fx', ''); GlowFX.mount(cv); }   // the deck's effect (the grid) under each preview
  }
  function adds(){ return Array.prototype.slice.call(el.querySelectorAll('.as-add')); }

  // does this card match the search, and which of its versions does it point at?
  function hits(c){
    var words = S.q.toLowerCase().split(/\s+/).filter(Boolean); if(!words.length) return { ok: true, v: -1 };
    var group = GROUPS.filter(function(g){ return g[0] === c.g; })[0][1], base = (c.name + ' ' + c.find + ' ' + group).toLowerCase(), best = -1, ok = false;
    c.v.forEach(function(v, i){
      var own = ((v.n || '') + ' ' + v.d + ' ' + (v.find || '')).toLowerCase();
      if(words.every(function(w){ return (base + ' ' + own).indexOf(w) > -1; })){ ok = true; if(best < 0 && words.some(function(w){ return own.indexOf(w) > -1 && base.indexOf(w) < 0; })) best = i; }
    });
    return { ok: ok, v: best };
  }
  function cardHtml(c, k){
    var i = which(c.id), v = c.v[i];
    return '<div class="as-card" data-id="' + c.id + '" style="--i:' + k + '"><button type="button" class="as-add" data-add="' + c.id + '" aria-label="Add ' + esc(full(c, i)) + '">' +
      '<span class="as-shot"></span>' + (c.isNew ? '<span class="as-new">New</span>' : '') +
      '<span class="as-name">' + esc(c.name) + '</span><span class="as-desc">' + esc(v.d) + '</span></button>' +
      (c.v.length > 1 ? '<div class="as-vers" role="group" aria-label="Version of ' + esc(c.name) + '">' + c.v.map(function(x, j){ return '<button type="button" data-ver="' + j + '" aria-pressed="' + (j === i) + '">' + esc(x.n) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function paintCards(root){
    Array.prototype.forEach.call(root.querySelectorAll('.as-card'), function(card){ var c = byId[card.getAttribute('data-id')]; paintShot(card.querySelector('.as-shot'), c.v[which(c.id)]); });
    Array.prototype.forEach.call(root.querySelectorAll('.as-again'), function(b){ var p = b.getAttribute('data-again').split(':'); paintShot(b.querySelector('.as-shot'), byId[p[0]].v[+p[1]]); });
  }
  function body(){
    var searching = !!S.q.trim(), h = '', k = 0, box = el.querySelector('.as-body');
    el.querySelector('.as-tabs').innerHTML = [['all', 'All']].concat(GROUPS).map(function(g){
      var n = CARDS.filter(function(c){ return g[0] === 'all' || c.g === g[0]; }).length;
      return '<button type="button" data-tab="' + g[0] + '" aria-pressed="' + (!searching && S.tab === g[0]) + '">' + g[1] + '<span>' + n + '</span></button>';
    }).join('');
    if(searching){
      S.hit = {};
      var found = CARDS.filter(function(c){ var r = hits(c); if(r.ok && r.v > -1) S.hit[c.id] = r.v; return r.ok; });
      h = found.length ? '<div class="as-grid" role="list">' + found.map(function(c){ return cardHtml(c, k++); }).join('') + '</div>'
        : '<p class="as-empty">No layout matches “' + esc(S.q.trim()) + '”. Try what it is for: numbers, pictures, compare or close.</p>';
    } else {
      var rec = S.tab === 'all' ? recent() : [];
      if(rec.length) h += '<div class="as-lab">Recently used</div><div class="as-recent">' + rec.map(function(r){
        var c = byId[r[0]], v = c.v[r[1]]; return '<button type="button" class="as-again" data-again="' + r[0] + ':' + r[1] + '" aria-label="Add ' + esc(full(c, r[1])) + ' again"><span class="as-shot"></span><span><b>' + esc(c.name) + '</b>' + (v.n ? '<small>' + esc(v.n) + '</small>' : '') + '</span></button>';
      }).join('') + '</div>';
      GROUPS.forEach(function(g){
        if(S.tab !== 'all' && S.tab !== g[0]) return;
        var list = CARDS.filter(function(c){ return c.g === g[0]; }); if(!list.length) return;
        h += (S.tab === 'all' ? '<div class="as-lab">' + g[1] + '</div>' : '') + '<div class="as-grid" role="list">' + list.map(function(c){ return cardHtml(c, k++); }).join('') + '</div>';
      });
    }
    box.innerHTML = h; box.scrollTop = 0;
    paintCards(box); fit();
  }
  function where(){
    var names = Array.prototype.map.call(document.querySelectorAll('#stage .slide'), function(s){ return s.getAttribute('data-label') || ''; });
    if(S.at == null || S.at >= names.length) return 'It goes <b>at the end</b> of the deck.';
    if(S.at <= 0) return 'It goes <b>first</b>, before ' + esc(names[0]) + '.';
    return 'It goes <b>after slide ' + S.at + ', ' + esc(names[S.at - 1]) + '</b>.';
  }

  // from: the tile or + it opens out of; at: where the new slide goes in the deck (none: the end)
  function open(from, at){
    if(el) return;
    prevFocus = document.activeElement;
    S = { tab: 'all', q: '', sel: {}, hit: {}, at: typeof at === 'number' ? at : null };
    el = document.createElement('div');
    el.className = 'as-backdrop';
    el.innerHTML = '' +
      '<div class="as-modal" role="dialog" aria-modal="true" aria-label="Add a slide">' +
        '<button type="button" class="as-close" data-close aria-label="Close">×</button>' +
        '<div class="as-head"><div class="as-head-main"><div class="as-k">New slide</div><h2 class="as-h">Pick a layout.</h2>' +
          '<p class="as-p">' + where() + '</p></div>' +
          '<label class="as-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17" stroke-linecap="round"/></svg>' +
          '<input type="search" placeholder="Try numbers, compare or film" aria-label="Search layouts" autocomplete="off"></label></div>' +
        '<div class="as-tabs" role="group" aria-label="Kind of slide"></div>' +
        '<div class="as-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    body();
    // grow out of the tile that opened it
    var m = el.querySelector('.as-modal');
    if(from && from.getBoundingClientRect){
      var r = from.getBoundingClientRect(), mx = m.offsetLeft, my = m.offsetTop;
      m.style.setProperty('--ox', Math.round(r.left + r.width / 2 - mx) + 'px');
      m.style.setProperty('--oy', Math.round(r.top + r.height / 2 - my) + 'px');
    }
    fit();
    el.addEventListener('click', onClick);
    el.querySelector('input').addEventListener('input', function(e){ S.q = e.target.value; body(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fit);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el) el.classList.add('in'); }); });
    setTimeout(function(){ var c = el && adds()[0]; if(c) c.focus({ preventScroll: true }); }, 350);
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
  function pick(id, i, card){
    if(!el || el.classList.contains('picking')) return;
    var c = byId[id], v = c.v[i]; if(!v) return;
    el.classList.add('picking'); if(card) card.classList.add('chosen');
    remember(id, i);
    var hash = D.addSlide(v.k, S.at, Object.assign({ name: v.s || c.name }, v.x || {}));
    var veil = document.createElement('div'); veil.className = 'as-veil'; document.body.appendChild(veil);
    setTimeout(function(){ veil.classList.add('on'); }, 420);
    setTimeout(function(){
      try { history.replaceState(null, '', location.pathname + location.search + (hash || '')); } catch(e){}
      location.reload();
    }, 800);
  }
  function onClick(e){
    if(e.target === el || e.target.closest('[data-close]')){ close(); return; }
    var t = e.target.closest('[data-tab]'); if(t){ S.tab = t.getAttribute('data-tab'); S.q = ''; el.querySelector('input').value = ''; body(); return; }
    var ver = e.target.closest('[data-ver]');
    if(ver){                                                  // another version of the same idea: the card shows it
      var card = ver.closest('.as-card'), id = card.getAttribute('data-id'), c = byId[id], i = +ver.getAttribute('data-ver');
      S.sel[id] = i; S.hit[id] = i;
      Array.prototype.forEach.call(card.querySelectorAll('[data-ver]'), function(b, j){ b.setAttribute('aria-pressed', String(j === i)); });
      card.querySelector('.as-desc').textContent = c.v[i].d; card.querySelector('.as-add').setAttribute('aria-label', 'Add ' + full(c, i));
      paintShot(card.querySelector('.as-shot'), c.v[i]); fit(); return;
    }
    var a = e.target.closest('[data-add]'); if(a){ var cid = a.getAttribute('data-add'); pick(cid, which(cid), a.closest('.as-card')); return; }
    var r = e.target.closest('[data-again]'); if(r){ var p = r.getAttribute('data-again').split(':'); pick(p[0], +p[1], r); }
  }
  function onKey(e){
    if(!el) return;
    e.stopImmediatePropagation();                       // the deck underneath stays put
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    var inSearch = e.target.tagName === 'INPUT';
    var list = adds(), at = list.indexOf(document.activeElement);
    if(e.key === 'Enter' && inSearch && list.length){ e.preventDefault(); list[0].click(); return; }
    if(/^Arrow/.test(e.key) && !(inSearch && /Left|Right/.test(e.key)) && !e.target.closest('.as-vers, .as-tabs')){
      e.preventDefault();
      if(at < 0){ if(list[0]) list[0].focus(); return; }
      var grid = list[at].closest('.as-grid'), cols = grid ? Math.max(1, Math.round(grid.clientWidth / (list[at].offsetWidth + 20))) : 1;
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
