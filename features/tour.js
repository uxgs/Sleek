/* The first-run tour: cards that point at the controls and say what they do, one at a time.

     1. Edit       (deck window)      points down at the Edit button
     2. Present    (deck window)      points down at the Present button
     3. Presenter  (presenter window) the notes' links to things on the slide, then the live preview

   Where it is lives in localStorage (sleek-tour: edit, present, presenter, done), so the presenter
   window, opened later, picks up the third step. A new deck from the start screen's setup starts it
   again; deck.html?tips does too. "Skip tour" ends it everywhere. */
(function(){
  var D = window.Deck; if(!D || D.mirror) return;
  var KEY = 'sleek-tour';
  var IN_PRESENTER = !!D.popout;
  var el = null, ring = null, cur = null, raf = 0;

  function state(){ try { return localStorage.getItem(KEY) || 'edit'; } catch(e){ return 'done'; } }
  function setState(v){ try { localStorage.setItem(KEY, v); } catch(e){} }

  var ICON = {
    text: '<span class="et-ic">Aa</span>',
    image: '<span class="et-ic"><svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 13l4-4 4 4 2-2 4 4"/></svg></span>',
    lines: '<span class="et-ic"><svg viewBox="0 0 20 20"><path d="M4 5h12M4 10h12M4 15h7"/></svg></span>',
    check: '<span class="et-ic"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7"/></svg></span>',
    screen: '<span class="et-ic"><svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="10" rx="1.6"/><path d="M7 17h6M10 13.5V17"/></svg></span>',
    clock: '<span class="et-ic"><svg viewBox="0 0 20 20"><circle cx="10" cy="10.5" r="6.5"/><path d="M10 7v3.5l2.4 1.6"/></svg></span>',
    link: '<span class="et-ic"><svg viewBox="0 0 20 20"><path d="M8.6 11.4a3.2 3.2 0 0 0 4.5 0l2.6-2.6a3.2 3.2 0 0 0-4.5-4.5l-1 1"/><path d="M11.4 8.6a3.2 3.2 0 0 0-4.5 0L4.3 11.2a3.2 3.2 0 0 0 4.5 4.5l1-1"/></svg></span>',
    pointer: '<span class="et-ic"><svg viewBox="0 0 20 20"><path d="M5 3l10 6-4.5 1.2L13 16l-2 1-2.5-5.6L5 14Z"/></svg></span>',
    wipe: '<span class="et-ic"><svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M10 4v12"/></svg></span>'
  };
  function li(ic, html, k){ return '<li style="--i:' + k + '">' + ICON[ic] + '<span>' + html + '</span></li>'; }

  var STEPS = {
    edit: {
      anchor: function(){ return document.getElementById('editbtn'); }, place: 'above', of: [1, 2],
      k: 'Edit mode', h: 'Make every slide yours.',
      items: [
        ['text', '<b>Double-click any slide</b> to start, then click any text to retype it. Select words to bold, link or resize them.'],
        ['image', '<b>Click a picture or video</b> to replace it with your own.'],
        ['lines', '<b>Notes and slide names</b> edit the same way, in the notes panel.'],
        ['check', '<b>Every change saves</b> as you make it. ⌘Z undoes, ⇧⌘Z redoes.']
      ],
      key: 'E', next: 'present'
    },
    present: {
      anchor: function(){ return document.getElementById('presentbtn'); }, place: 'above', of: [2, 2],
      k: 'Present', h: 'Present with your notes in front of you.',
      items: [
        ['screen', '<b>Opens a presenter window</b>: put it on your laptop and this deck on the big screen.'],
        ['lines', '<b>Your notes</b>, the next slide and a live preview of what the room sees.'],
        ['clock', '<b>A clock and a timer</b>, and the arrow keys move both windows together.']
      ],
      key: 'P', next: 'presenter', action: 'Open presenter'
    },
    // in the presenter window
    links: {
      anchor: function(){ return document.querySelector('.pres-notes'); }, place: 'inside', of: [1, 2],
      k: 'Presenter · Linked notes', h: 'Your notes can open things on the slide.',
      items: [
        ['link', '<b>Press Edit notes</b>, select some words, then the link button: pick an image, video, take-apart, pin or press clipping on that slide.'],
        ['pointer', '<b>Click the link while you talk</b> and it opens on the audience screen, as if you clicked it there.'],
        ['check', 'The <b>Gallery</b> slide’s notes have links to try.']
      ],
      next: 'preview'
    },
    preview: {
      anchor: function(){ return document.getElementById('pres-shot'); }, place: 'below', of: [2, 2],
      k: 'Presenter · Live preview', h: 'The preview is the audience screen.',
      items: [
        ['pointer', '<b>Click anything in it</b> and it happens for the room: open a picture, take a card apart, play a film.'],
        ['wipe', '<b>Before / after</b> pictures sweep on their own; Space plays the wipe again.'],
        ['screen', '<b>Box</b> and <b>Cursor</b>, top right, mark things for the room. Space clears the marks.']
      ],
      next: 'done'
    }
  };

  function place(){
    if(!el || !cur) return;
    var a = cur.anchor(); if(!a) return;
    var r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, pad = 16, vw = window.innerWidth, vh = window.innerHeight;
    var left, top;
    if(cur.place === 'inside'){                     // over the bottom of a big area, clear of its first lines
      left = Math.max(pad, Math.min(vw - w - pad, r.left + (r.width - w) / 2));
      top = Math.max(pad, Math.min(vh - h - pad, r.bottom - h - 64));
    } else if(cur.place === 'below'){               // under it, pointing up
      var bx = r.left + r.width / 2;
      left = Math.max(pad, Math.min(vw - w - pad, bx - w / 2));
      top = Math.min(vh - h - pad, r.bottom + 18);
      el.style.setProperty('--ax', (bx - left) + 'px');
    } else {
      var cx = r.left + r.width / 2;
      left = Math.max(pad, Math.min(vw - w - pad, cx - w / 2));
      top = Math.max(pad, r.top - h - 18);
      el.style.setProperty('--ax', (cx - left) + 'px');
    }
    el.style.left = left + 'px'; el.style.top = top + 'px';
    var g = cur.place === 'above' ? 6 : 2;
    ring.style.left = (r.left - g) + 'px'; ring.style.top = (r.top - g) + 'px'; ring.style.width = (r.width + g * 2) + 'px'; ring.style.height = (r.height + g * 2) + 'px';
  }
  function onResize(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(place); }

  function show(id){
    var st = STEPS[id]; if(!st || el) return;
    var a = st.anchor(); if(!a || !a.getClientRects().length) return;
    cur = st; cur.id = id;
    document.body.classList.add('tour-on');
    ring = document.createElement('div'); ring.className = 'et-ring' + (st.place !== 'above' ? ' area' : ''); ring.setAttribute('aria-hidden', 'true');
    el = document.createElement('div');
    el.className = 'et-card' + (st.place === 'inside' ? ' no-arrow' : st.place === 'below' ? ' up' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', st.h);
    el.innerHTML = '' +
      '<div class="et-top"><div class="et-k">' + st.k + '</div><div class="et-dots">' +
        Array.apply(null, Array(st.of[1])).map(function(_, k){ return '<i' + (k < st.of[0] ? ' class="on"' : '') + '></i>'; }).join('') + '</div></div>' +
      '<h3 class="et-h">' + st.h + '</h3>' +
      '<ul class="et-list">' + st.items.map(function(it, k){ return li(it[0], it[1], k); }).join('') + '</ul>' +
      '<div class="et-nav"><button type="button" class="et-skip" data-skip>Skip tour</button>' +
        (st.key ? '<span class="et-key">or press <kbd>' + st.key + '</kbd></span>' : '') +
        (st.action ? '<button type="button" class="et-btn ghost" data-next>Later</button><button type="button" class="et-btn primary" data-act>' + st.action + '</button>'
                   : '<button type="button" class="et-btn primary" data-next>' + (st.next === 'done' ? 'Done' : 'Next') + '</button>') +
      '</div>';
    document.body.appendChild(ring); document.body.appendChild(el);
    place();
    window.addEventListener('resize', onResize);
    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ if(el){ el.classList.add('in'); ring.classList.add('in'); } }); });
    setTimeout(function(){ var b = el && el.querySelector('.et-btn.primary'); if(b) b.focus({ preventScroll: true }); }, 450);
  }
  function hide(then){
    if(!el){ if(then) then(); return; }
    var node = el, rg = ring; el = null; ring = null; cur = null;
    document.body.classList.remove('tour-on');
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    node.classList.remove('in'); node.classList.add('out'); rg.classList.remove('in');
    setTimeout(function(){ node.remove(); rg.remove(); if(then) then(); }, 320);
  }
  // move on: the deck window's steps are saved as the tour's place; the presenter's two are one place
  function advance(){
    var st = cur, next = st.next;
    hide(function(){
      if(next === 'preview'){ show('preview'); return; }
      setState(next);
      if(next === 'present') whenFree(function(){ show('present'); });
    });
  }
  function onClick(e){
    if(e.target.closest('[data-skip]')){ setState('done'); hide(); }
    else if(e.target.closest('[data-act]')){ var a = cur.anchor(); setState(cur.next); hide(); if(a) a.click(); }   // in the click itself, so the window may open
    else if(e.target.closest('[data-next]')) advance();
  }
  function onKey(e){
    if(!cur) return;
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); setState('done'); hide(); return; }
    // the deck's own key for the control works as usual, and counts as trying it
    if(cur.key && e.key.toLowerCase() === cur.key.toLowerCase() && !e.metaKey && !e.ctrlKey){ setState(cur.next); hide(); }
  }
  // clicking the control itself counts as trying it
  document.addEventListener('click', function(e){
    if(!cur || el.contains(e.target)) return;
    var a = cur.anchor(); if(a && a.contains(e.target)){ setState(cur.next); hide(); }
  }, true);

  // wait until nothing else owns the screen (Edit mode, the grid, an open feature)
  function busy(){ return D.isEditing() || D.modal || document.body.classList.contains('grid-open') || !!document.querySelector('.as-backdrop, .su-backdrop'); }
  function whenFree(fn){
    if(!busy()){ fn(); return; }
    var mo = new MutationObserver(function(){ if(!busy()){ mo.disconnect(); setTimeout(fn, 500); } });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  }

  if(/[?&]tips\b/.test(location.search) && !IN_PRESENTER) setState('edit');
  function start(){
    var s = state();
    if(IN_PRESENTER){ if(s === 'presenter') show('links'); return; }
    if(s === 'edit' || s === 'present') whenFree(function(){ show(s); });
  }
  setTimeout(start, IN_PRESENTER ? 1200 : (D.justAdded ? 900 : 1400));
  D.tour = { show: show, restart: function(){ setState('edit'); hide(function(){ show('edit'); }); } };
})();
