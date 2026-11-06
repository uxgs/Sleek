/* Press clippings: a bullet with a clipping opens a newspaper clipping over its slide when clicked.
   Built here, not in the markup, so it takes no text ids and later slides keep their saved edits.
   It lives inside the slide (slide coordinates), so the presenter's preview replays the clicks.

   Any bullet can carry one. In Edit mode, point at a bullet and press Clipping: write the paper's name,
   the headline and the passage, put *stars* around the words the highlighter should sweep over, and
   name who said it. A clipping saves with the deck as seed.press['<the bullet's text id>'], with the
   fields of the sample below (false: this bullet has none, not even its layout's). */
(function(){
  var D = window.Deck; if(!D) return;

  var PRESS = {
    'sample': {
      outlet: 'The Daily Ledger',
      section: 'Health',
      kicker: 'Apps · Fitness',
      // [text, highlighted?]: the highlighter sweeps over the marked phrases once the clipping lands,
      // the headline's first, then the body's
      head: [
        ['Pace is '],
        ['the first workout app that fits around your life', true],
        ['.']
      ],
      body: [
        ['“I trained more in a month than in the whole of last year,” said Sam Okafor. “It '],
        ['knew when to push me and when to back off.', true],
        [' Fifteen minutes on a busy day still counted, and the plan never made me feel behind.”']
      ],
      by: 'Priya Nair',
      role: 'Health editor'
    }
  };
  var LIST = '#stage .slide:not(.s-screen) li[data-eid]';   // the bullets that can carry one

  function okClip(p){ return !!p && typeof p === 'object' && Array.isArray(p.head) && Array.isArray(p.body); }
  function clipOf(el){ var k = el && el.getAttribute('data-press'); return k ? PRESS[k] || null : null; }
  // every bullet shows the deck's clipping for it, else its layout's own, else none
  function attach(){
    Array.prototype.forEach.call(document.querySelectorAll('#stage [data-eid]'), function(el){
      if(el.closest('.car-copy, .fs-copy')) return;
      if(!el.hasAttribute('data-press-0')) el.setAttribute('data-press-0', el.getAttribute('data-press') || '');
      var eid = el.getAttribute('data-eid'), c = D.pressClip ? D.pressClip(eid) : (D.SEED.press || {})[eid], base = el.getAttribute('data-press-0');
      if(okClip(c)){ PRESS['own:' + eid] = c; el.setAttribute('data-press', 'own:' + eid); }
      else if(c === false || !base) el.removeAttribute('data-press');
      else el.setAttribute('data-press', base);
    });
    if(cur && !clipOf(cur.src)) close(true);
    marks();
  }
  // A bullet can show a picture (or a video) instead: its file is in the deck's media under
  // '<the bullet's text id>.pic', and in Present the bullet carries a See it chip that opens it big.
  function picOf(el){ var eid = el && el.getAttribute('data-eid'); return eid && D.mediaOf ? D.mediaOf(eid + '.pic') : null; }
  function marks(){
    Array.prototype.forEach.call(document.querySelectorAll(LIST), function(el){
      if(el.closest('.car-copy, .fs-copy')) return;
      var src = picOf(el);
      if(src && !el.hasAttribute('data-press')){ el.setAttribute('data-pic', D.isVideo(src) ? 'video' : 'picture'); }
      else el.removeAttribute('data-pic');
    });
  }
  attach();
  if(D.onPress) D.onPress.push(attach);
  if(D.onMedia) D.onMedia.push(marks);
  function showPic(li){
    var src = picOf(li); if(!src || !D.openImage) return;
    D.hideZoom && D.hideZoom();
    D.openImage([src], 0, li);
  }

  var cur = null;   // { el, src }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // torn top and bottom, scissor-cut sides; seeded so the audience and the preview tear it the same
  function torn(){
    var seed = 7, rnd = function(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var top = [], bot = [], n = 46, k;
    for(k = 0; k <= n; k++) top.push((k / n * 100).toFixed(2) + '% ' + (rnd() * 1.6).toFixed(2) + '%');
    for(k = n; k >= 0; k--) bot.push((k / n * 100).toFixed(2) + '% ' + (100 - rnd() * 1.6).toFixed(2) + '%');
    return 'polygon(' + top.concat(bot).join(',') + ')';
  }

  function build(p){
    var el = document.createElement('div');
    el.className = 'press'; el.lang = 'en';
    var marked = function(parts){ return parts.map(function(b){ b = [].concat(b); return b[1] ? '<mark class="pr-hl">' + esc(b[0]) + '</mark>' : esc(b[0]); }).join(''); };
    var body = marked(p.body);
    el.innerHTML =
      '<div class="pr-dim"></div>' +
      '<article class="pr-clip" role="dialog" aria-label="' + esc(p.outlet) + ' article"><div class="pr-paper" style="clip-path:' + torn() + '">' +
        '<header class="pr-mast">' +
          '<span class="pr-sec">' + esc(p.section) + '</span>' +
          '<span class="pr-name">' + esc(p.outlet) + '</span>' +
          '<span class="pr-sec">' + esc(p.kicker) + '</span>' +
        '</header>' +
        '<h3 class="pr-head">“' + marked(p.head) + '”</h3>' +
        '<div class="pr-cols"><p class="pr-body">' + body + '</p>' +
          '<aside class="pr-by"><span class="pr-by-n">' + esc(p.by) + '</span><span class="pr-by-r">' + esc(p.role) + '</span></aside>' +
        '</div>' +
      '</div></article>' +
      '';
    return el;
  }

  function open(src){
    var p = clipOf(src), s = src.closest('.slide'); if(!p || !s) return;
    close(true);
    var el = build(p); s.appendChild(el);
    cur = { el: el, src: src };
    D.hideZoom && D.hideZoom();
    D.modal = true;
    void el.offsetWidth; el.classList.add('in');
  }
  function close(instant){
    if(!cur) return;
    var el = cur.el; cur = null;
    D.modal = false;
    if(instant){ el.remove(); return; }
    el.classList.remove('in'); el.classList.add('out');
    setTimeout(function(){ el.remove(); }, 420);
  }

  document.addEventListener('click', function(e){
    if(cur){
      if(e.target.closest && e.target.closest('.press')){ e.stopPropagation(); e.preventDefault(); close(); }
      return;
    }
    if(D.isEditing()) return;
    var t = e.target.closest && e.target.closest('#stage .slide.active [data-press], #stage .slide.active [data-pic]');
    if(!t) return;
    if(t.hasAttribute('data-press')){ if(!clipOf(t)) return; e.stopPropagation(); e.preventDefault(); open(t); return; }
    if(D.modal) return;
    e.stopPropagation(); e.preventDefault();
    showPic(t);
  }, true);
  document.addEventListener('keydown', function(e){
    if(cur && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  // over the bullet, clicks go to it rather than the edge zones that change slides
  document.addEventListener('mousemove', function(e){
    var hit = !D.isEditing() && document.elementsFromPoint(e.clientX, e.clientY).some(function(el){ return el.matches && el.matches('#stage .slide.active [data-press], #stage .slide.active [data-pic]'); });
    document.body.classList.toggle('over-press', hit);
  });
  D.onShow.push(function(){ close(true); });
  D.onReset.push(function(){ close(); });

  // ================= Edit mode: a bullet's Clipping button, and the editor behind it =================
  if(D.popout || D.mirror || !D.setPressClip) return;

  // *words* highlight; parts back to text the same way
  function toText(parts){ return (parts || []).map(function(b){ b = [].concat(b); return b[1] ? '*' + b[0] + '*' : String(b[0] == null ? '' : b[0]); }).join(''); }
  function toParts(text){
    var out = [], re = /\*([^*]+)\*/g, at = 0, m;
    text = String(text || '');
    while((m = re.exec(text))){ if(m.index > at) out.push([text.slice(at, m.index)]); out.push([m[1], true]); at = re.lastIndex; }
    if(at < text.length) out.push([text.slice(at)]);
    return out;
  }
  function blank(li){
    var said = (li.textContent || '').replace(/^\s*[+\-–!•]\s*/, '').trim();
    return { outlet: 'The Daily Paper', section: 'News', kicker: 'Feature',
      head: toParts(said ? '*' + said.replace(/[*.]+$/, '') + '*.' : 'A headline with *the words that matter* marked.'),
      body: toParts('“A few lines from the piece go here, the part that makes the case for the work,” said someone who covered it. “Mark *the words worth reading aloud* with stars and the highlighter sweeps over them once the clipping lands. Two or three sentences fill both columns.”'),
      by: 'A name', role: 'Their role' };
  }

  // the button, beside whichever bullet you point at (or are typing in)
  var chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'pr-chip'; chip.hidden = true;
  chip.innerHTML = '<i aria-hidden="true"></i><span>Clipping</span>';
  document.body.appendChild(chip);
  // and beside it, Picture: a picture (or video) the bullet opens instead
  var pchip = document.createElement('button');
  pchip.type = 'button'; pchip.className = 'pr-chip pc-chip'; pchip.hidden = true;
  pchip.innerHTML = '<i aria-hidden="true"></i><span>Picture</span>';
  document.body.appendChild(pchip);
  var chipFor = null, hideT = 0;
  function hideChips(){ chip.hidden = true; pchip.hidden = true; chipFor = null; }
  function place(li){
    if(!li || !D.isEditing() || D.modal){ hideChips(); return; }
    clearTimeout(hideT);
    chipFor = li;
    var r = li.getBoundingClientRect(), has = !!clipOf(li), pic = !has && !!picOf(li);
    chip.classList.toggle('has', has);
    chip.querySelector('span').textContent = has ? 'Clipping' : '+ Clipping';
    chip.title = has ? 'Edit this bullet’s newspaper clipping' : 'Give this bullet a newspaper clipping (it opens when clicked in Present)';
    pchip.classList.toggle('has', pic);
    pchip.querySelector('span').textContent = pic ? 'Picture' : '+ Picture';
    pchip.title = pic ? 'Change or remove this bullet’s picture' : 'Give this bullet a picture (it opens big when clicked in Present)';
    chip.hidden = pic; pchip.hidden = has;                   // a bullet opens one thing: a clipping or a picture
    // side by side after the bullet, or (no room there) together at the window's right edge
    var shown = [chip, pchip].filter(function(c){ return !c.hidden; });
    var total = shown.reduce(function(a, c){ return a + (c.offsetWidth || 96) + 6; }, -6);
    var y = Math.max(8, r.top + r.height / 2 - 13) + 'px', x = Math.max(8, Math.min(r.right + 10, window.innerWidth - total - 8));
    shown.forEach(function(c){ c.style.left = x + 'px'; c.style.top = y; x += (c.offsetWidth || 96) + 6; });
  }
  function hideSoon(){ clearTimeout(hideT); hideT = setTimeout(hideChips, 450); }
  document.addEventListener('mouseover', function(e){
    if(!D.isEditing() || ed) return;
    if(e.target.closest && e.target.closest('.pr-chip')){ clearTimeout(hideT); return; }
    var li = e.target.closest && e.target.closest(LIST);
    if(li && li.closest('.slide.active')) place(li); else if(chipFor) hideSoon();
  });
  document.addEventListener('focusin', function(e){
    var li = D.isEditing() && !ed && e.target.closest && e.target.closest(LIST);
    if(li && li.closest('.slide.active')) place(li);
  });
  chip.addEventListener('mousedown', function(e){ e.preventDefault(); });   // the caret stays in the bullet
  chip.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); if(chipFor) edit(chipFor); });
  pchip.addEventListener('mousedown', function(e){ e.preventDefault(); });
  pchip.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); if(chipFor) pickPic(chipFor); });
  function pickPic(li){
    var eid = li.getAttribute('data-eid'), had = !!picOf(li), mid = eid + '.pic';
    hideChips();
    if(!D.pickMedia) return;
    function set(src){
      D.setMedia(mid, src); D.saveMedia(); D.applyMedia(); marks();
      D.toast(D.isVideo(src) ? 'Video added: click the bullet in Present' : 'Picture added: click the bullet in Present');
    }
    D.pickMedia({ kicker: 'Picture · ' + (li.textContent || '').replace(/^\s*[+\-–!•]\s*/, '').trim().slice(0, 48), single: true,
      title: had ? 'Change the picture' : 'Show a picture',
      text: 'In Present, this bullet gets a See it chip; click it and the picture opens big. Pick one from the deck, or upload one.',
      removeLabel: 'Remove picture',
      onRemove: had ? function(){ D.setMedia(mid, null); D.saveMedia(); D.applyMedia(); marks(); D.toast('Picture removed', true); } : null,
      onChosen: function(list){ if(list[0]) set(list[0].src); },
      onFiles: function(files){ if(files[0]) D.mediaFromFile(files[0], set); } });
  }
  window.addEventListener('resize', function(){ if(chipFor && !chip.hidden) place(chipFor); });
  D.onShow.push(hideChips);
  new MutationObserver(function(){ if(!D.isEditing()) hideChips(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // the editor: fields on one side, the clipping as it will look on the other
  var ed = null;   // { el, li, eid, c, typing, prev }
  var FIELDS = [
    ['outlet', 'The paper', 'A magazine, a trade paper, your local daily', 'full'],
    ['section', 'Section (left of the name)', 'Games'], ['kicker', 'Strapline (right of the name)', 'Gaming · Platforms'],
    ['head', 'Headline', 'Put *stars* around the words to highlight', 'full area-s'],
    ['body', 'Passage', 'The lines from the piece; *stars* highlight', 'full area'],
    ['by', 'Who said it', 'A name'], ['role', 'Their role', 'Editor, creator, critic']
  ];
  function edit(li){
    if(ed) return;
    var eid = li.getAttribute('data-eid'), have = clipOf(li);
    hideChips();
    var c = JSON.parse(JSON.stringify(have || blank(li)));
    var el = document.createElement('div');
    el.className = 'bp-backdrop pr-backdrop';
    el.innerHTML = '' +
      '<div class="bp-modal pr-modal" role="dialog" aria-modal="true" aria-label="Newspaper clipping">' +
        '<button type="button" class="bp-close" data-close aria-label="Close">×</button>' +
        '<div class="pr-ehead"><div class="bp-k">Clipping · ' + esc((li.textContent || '').replace(/^\s*[+\-–!•]\s*/, '').trim().slice(0, 48)) + '</div>' +
          '<h2 class="bp-h">What did the press say?</h2>' +
          '<p class="bp-p">In Present, click this bullet and the clipping lands over the slide, then the highlighter sweeps over the words you marked.</p></div>' +
        '<div class="pr-ebody">' +
          '<form class="pr-form" autocomplete="off">' + FIELDS.map(function(f){
            var v = f[0] === 'head' || f[0] === 'body' ? toText(c[f[0]]) : (c[f[0]] || '');
            var area = /area/.test(f[3] || '');
            return '<label class="pr-f ' + (f[3] || '') + '"><span>' + f[1] + '</span>' +
              (area ? '<textarea name="' + f[0] + '" rows="' + (/area-s/.test(f[3]) ? 2 : 4) + '" placeholder="' + esc(f[2]) + '">' + esc(v) + '</textarea>'
                    : '<input type="text" name="' + f[0] + '" value="' + esc(v) + '" placeholder="' + esc(f[2]) + '">') + '</label>';
          }).join('') + '</form>' +
          '<div class="pr-prev" aria-hidden="true"><div class="pr-prev-in"></div></div>' +
        '</div>' +
        '<div class="pr-efoot">' +
          '<button type="button" class="bp-btn ghost pr-del" data-del' + (have ? '' : ' hidden') + '>Remove clipping</button>' +
          '<span class="tl-sp"></span><button type="button" class="bp-btn primary" data-done>Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    ed = { el: el, li: li, eid: eid, c: c, typing: 0, prev: document.activeElement, saved: !!have };
    preview();
    el.addEventListener('click', function(e){
      if(e.target.closest('[data-done]')){ if(!ed.saved || ed.typing) save(); finish(); return; }
      if(e.target === el || e.target.closest('[data-close]')){ finish(); return; }   // a new one you didn't touch isn't kept
      if(e.target.closest('[data-del]')){
        clearTimeout(ed.typing); ed.typing = 0;
        D.setPressClip(eid, false);   // none here, even where the layout or the deck file has one
        ed.saved = false; ed.removed = true; finish(); return;
      }
    });
    el.addEventListener('input', function(e){
      var n = e.target.name; if(!n) return;
      ed.c[n] = n === 'head' || n === 'body' ? toParts(e.target.value) : e.target.value;
      preview();
      clearTimeout(ed.typing); ed.typing = setTimeout(save, 400);
    });
    el.querySelector('form').addEventListener('submit', function(e){ e.preventDefault(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fit);
    D.modal = true;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(!ed) return; el.classList.add('in'); var f = el.querySelector('input'); if(f){ f.focus({ preventScroll: true }); f.select(); } }); });
  }
  function save(){
    if(!ed) return;
    ed.typing = 0; ed.saved = true;
    D.setPressClip(ed.eid, JSON.parse(JSON.stringify(ed.c)));
    var del = ed.el.querySelector('[data-del]'); if(del) del.hidden = false;
  }
  function preview(){
    var box = ed.el.querySelector('.pr-prev-in');
    box.innerHTML = ''; var p = build(ed.c); p.classList.add('in', 'pr-still'); box.appendChild(p);
    fit();
  }
  function fit(){
    if(!ed) return;
    var wrap = ed.el.querySelector('.pr-prev'), box = ed.el.querySelector('.pr-prev-in'), clip = box.querySelector('.pr-clip');
    if(!clip) return;
    var s = Math.min(1, (wrap.clientWidth - 8) / 860);
    box.style.transform = 'scale(' + s + ')';
    wrap.style.height = Math.ceil((clip.offsetHeight + 40) * s) + 'px';
  }
  function finish(){
    if(!ed) return;
    if(ed.typing){ clearTimeout(ed.typing); save(); }
    var node = ed.el, prev = ed.prev; ed = null; D.modal = false;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fit);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(function(){ node.remove(); }, 380);
    if(prev && prev.focus) prev.focus({ preventScroll: true });
  }
  function onKey(e){
    if(!ed) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); finish(); return; }
    if(!(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) e.stopImmediatePropagation();   // the deck underneath stays put
  }
  D.editClipping = edit;
})();
