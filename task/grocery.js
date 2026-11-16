/* Sleek Tasks: a grocery list, its own screen (#/<list id>/shop).

   A grocery list is a board of its own kind (core/task-store.js, "grocery lists"). Its screen is made for the
   shop: type "2 lemons" or "lemons x3" and press Enter (what you have bought before is offered as you type);
   tap one of your usuals under Add again to put it back on; things sort themselves by aisle (⋯ moves one, and
   Sleek remembers); tap a number to change how many; tick things off and they go in the basket. Done shopping
   finishes the list, and what was not got can start the next one.

   The list's card for Today (A.listCard) is here too: Today in Tasks and the start page in the Sleek browser
   show a list while it is not finished and its day is today or gone by. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp; if(!T || !A || !T.isList) return;
  var esc = A.esc, body = document.getElementById('body'), state = A.state;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ui = { basket: false, step: null, asking: false, hl: -1, fresh: null, focus: false };
  var IC = {
    basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10h14l-1.4 8.4a2 2 0 0 1-2 1.6H8.4a2 2 0 0 1-2-1.6z"/><path d="M9 10l3-6 3 6"/><path d="M10 14v2M14 14v2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  };
  A.icons = Object.assign(A.icons || {}, { basket: IC.basket });

  // ---------- days ----------
  function dayName(k){
    if(!k) return 'No day';
    var n = A.away({ due: k });
    if(n === 0) return 'Today'; if(n === 1) return 'Tomorrow'; if(n === -1) return 'Yesterday';
    return A.from(k).toLocaleDateString(undefined, n > 1 && n < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  }
  A.dayName = dayName;
  function nextSat(){ var d = new Date(); d.setHours(0, 0, 0, 0); var n = (6 - d.getDay() + 7) % 7 || 7; return A.key(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
  // the same day a week on, or more, until it is after today
  function weekOn(k){ if(!k) return ''; var d = A.from(k), t0 = new Date(); t0.setHours(0, 0, 0, 0); do d.setDate(d.getDate() + 7); while(d <= t0); return A.key(d); }

  // ---------- what is on it ----------
  function items(p){ return T.tasks(p.id).slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); }); }
  function counts(p){ var all = items(p), got = all.filter(T.isDone).length; return { all: all.length, got: got, left: all.length - got }; }
  function groups(list){
    return T.AISLES.concat([T.OTHER]).map(function(a){ return { a: a, items: list.filter(function(t){ return (t.aisle || 'other') === a.id; }) }; }).filter(function(g){ return g.items.length; });
  }
  function ring(c){
    var r = 22, C = 2 * Math.PI * r, off = c.all ? C * (1 - c.got / c.all) : C;
    return '<div class="gl-ring" role="img" aria-label="' + c.got + ' of ' + c.all + ' in the basket"><svg viewBox="0 0 54 54" aria-hidden="true"><circle class="bg" cx="27" cy="27" r="' + r + '"/><circle class="fg" cx="27" cy="27" r="' + r + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/></svg><span>' + c.got + '/' + c.all + '</span></div>';
  }
  function tick(t){ var on = T.isDone(t); return '<button type="button" class="gl-tick' + (on ? ' on' : '') + '" data-gtick="' + t.id + '" role="checkbox" aria-checked="' + on + '" aria-label="' + (on ? 'Put back: ' : 'Got: ') + esc(t.title) + '">' + IC.check + '</button>'; }
  function qtyH(t){ var q = t.qty || 1; return q > 1 ? '<span class="gl-q one">×' + q + '</span>' : ''; }
  function row(t){
    var done = T.isDone(t), q = t.qty || 1, n;
    if(done) n = qtyH(t);
    else if(ui.step === t.id) n = '<span class="gl-step"><button type="button" data-gq="' + t.id + ':-1" aria-label="One fewer"' + (q < 2 ? ' disabled' : '') + '>−</button><b aria-live="polite">' + q + '</b><button type="button" data-gq="' + t.id + ':1" aria-label="One more">+</button></span>';
    else n = '<button type="button" class="gl-q' + (q === 1 ? ' one' : '') + '" data-gstep="' + t.id + '" aria-label="How many ' + esc(t.title) + ': ' + q + '. Change">' + (q === 1 ? '1' : '×' + q) + '</button>';
    return '<div class="gl-row' + (done ? ' got' : '') + (ui.fresh === t.id ? ' fresh' : '') + '" data-flip="g-' + t.id + '" data-item="' + t.id + '">' + tick(t) +
      '<span class="gl-nm">' + esc(t.title) + '</span>' + n + '<button type="button" class="gl-more" data-gmore="' + t.id + '" aria-label="More for ' + esc(t.title) + '" aria-haspopup="true">⋯</button></div>';
  }

  // ---------- the screen ----------
  A.views.shop = function(p){
    if(!p) return '';
    var c = counts(p), back = '<a class="gl-back" href="#home" data-glhome>' + IC.back + 'Boards</a>';
    if(p.done) return shopped(p, c, back);
    var all = items(p), left = all.filter(function(t){ return !T.isDone(t); }), got = all.filter(T.isDone), u = T.offer(p.id, 14);
    var h = '<div class="gl"><div class="gl-in">' + back +
      '<div class="gl-kick">Grocery list</div><div class="gl-head"><h1 class="gl-name" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="List name" data-glname>' + esc(p.name) + '</h1>' + ring(c) + '</div>' +
      '<div class="gl-meta"><button type="button" class="gl-chip' + (p.due ? ' on' : '') + '" data-glday aria-haspopup="true">' + IC.cal + esc(dayName(p.due)) + '</button><span class="gl-chip plain">' + (c.left ? c.left + ' to get' : c.all ? 'All in the basket' : 'Nothing on it yet') + '</span></div>' +
      '<div class="gl-add"><span class="gl-plus" aria-hidden="true">' + IC.plus + '</span><input data-k="gl-add" placeholder="Add an item, like “2 lemons”" autocomplete="off" enterkeyhint="done" aria-label="Add an item" maxlength="130" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gl-sugg"><div class="gl-sugg" id="gl-sugg" role="listbox" aria-label="Bought before" hidden></div></div>';
    if(u.length) h += '<div class="gl-again"><div class="gl-kick">Add again <small>your usuals</small></div><div class="gl-chips">' + u.map(function(x){ return '<button type="button" class="gl-ag" data-again="' + esc(x.n) + '" title="Added ' + x.c + (x.c === 1 ? ' time' : ' times') + '. Right-click, or press and hold, to stop it being offered."><i aria-hidden="true">+</i>' + esc(x.n) + '</button>'; }).join('') + '</div></div>';
    if(!all.length) h += '<div class="gl-empty"><b>Nothing on it yet.</b>' + (u.length ? 'Type what you need, or tap one of your usuals.' : 'Type what you need and press Enter. What you add is remembered, so next time it is one tap away.') + '</div>';
    groups(left).forEach(function(g){ h += '<section class="gl-aisle" aria-label="' + esc(g.a.name) + '"><h2><i style="--c:' + g.a.color + '"></i>' + esc(g.a.name) + '<em>' + g.items.length + '</em></h2>' + g.items.map(row).join('') + '</section>'; });
    if(got.length){
      h += '<section class="gl-basket' + (ui.basket ? ' open' : '') + '"><button type="button" class="gl-bh" data-glbasket aria-expanded="' + ui.basket + '">' + IC.basket + 'In the basket <em>' + got.length + '</em><span class="chev">' + IC.chev + '</span></button>' +
        (ui.basket ? '<div class="gl-bin">' + got.sort(function(a, b){ return (b.doneAt || 0) - (a.doneAt || 0); }).map(row).join('') + '</div>' : '') + '</section>';
      if(!ui.asking) h += '<button type="button" class="gl-finish" data-glfinish>Done shopping</button>';
    }
    if(ui.asking && left.length) h += '<div class="gl-ask" role="group" aria-label="Done shopping"><p><b>' + left.length + (left.length === 1 ? ' thing' : ' things') + ' not got.</b> Keep ' + (left.length === 1 ? 'it' : 'them') + ' for the next shop?</p><div><button type="button" class="gl-btn pri" data-glend="carry">Start the next list with ' + (left.length === 1 ? 'it' : 'them') + '</button><button type="button" class="gl-btn" data-glend="drop">Just finish</button><button type="button" class="gl-btn quiet" data-glend="no">Not yet</button></div></div>';
    return h + '</div></div>';
  };
  function shopped(p, c, back){
    var next = p.next && T.project(p.next), when = p.doneAt ? dayName(A.key(new Date(p.doneAt))).toLowerCase() : '';
    return '<div class="gl"><div class="gl-in gl-done">' + back + '<div class="gl-bigtick" aria-hidden="true">' + IC.check + '</div><h1>Shopped.</h1>' +
      '<p>' + esc(p.name) + ': ' + c.got + (c.got === 1 ? ' thing' : ' things') + (when ? ', ' + (/^\d|^[a-z]{3} /.test(when) ? 'on ' : '') + when : '') + '.</p>' +
      (p.carried && next ? '<p>' + p.carried + ' not got ' + (p.carried === 1 ? 'is' : 'are') + ' on the next list.</p>' : '') +
      '<div class="gl-done-acts">' + (next && !next.done ? '<button type="button" class="gl-btn pri" data-glgo="' + next.id + '">Open the next list</button>' : '<button type="button" class="gl-btn pri" data-glnew>Start the next list</button>') +
      '<button type="button" class="gl-btn quiet" data-glreopen>Not finished? Open it again</button></div></div></div>';
  }

  // ---------- a list's card, for Today ----------
  A.listCard = function(p){
    var all = items(p), left = all.filter(function(t){ return !T.isDone(t); }), c = counts(p);
    var h = '<div class="gl-card" style="--c:' + (p.color || '#12A36A') + '" data-flip="gc-' + p.id + '"><div class="gl-card-h"><span class="ic">' + IC.basket + '</span><span class="tx"><b>' + esc(p.name) + '</b><small>Grocery list · ' + esc(dayName(p.due)) + ' · ' + (c.left ? c.left + ' to get' : 'all in the basket') + '</small></span><button type="button" class="gl-open" data-glgo="' + p.id + '">Open</button></div>' +
      '<div class="gl-bar" aria-hidden="true"><i style="width:' + (c.all ? Math.round(100 * c.got / c.all) : 0) + '%"></i></div>';
    left.slice(0, 4).forEach(function(t){ h += '<div class="gl-row" data-flip="gcr-' + t.id + '">' + tick(t) + '<span class="gl-nm">' + esc(t.title) + '</span>' + qtyH(t) + '</div>'; });
    if(left.length > 4) h += '<div class="gl-cmore">and ' + (left.length - 4) + ' more</div>';
    if(!left.length) h += '<div class="gl-cmore">Everything is in the basket. <button type="button" data-glgo="' + p.id + '">Finish it</button></div>';
    return h + '</div>';
  };

  // ---------- adding ----------
  function input(){ return body.querySelector('[data-k="gl-add"]'); }
  function sugg(){ return body.querySelector('.gl-sugg'); }
  function showSugg(){
    var inp = input(), box = sugg(), p = T.project(state.proj); if(!inp || !box || !p) return;
    var s = T.suggest(inp.value, p.id, 5);
    if(ui.hl >= s.length) ui.hl = s.length - 1;
    box.innerHTML = s.map(function(u, i){ return '<button type="button" role="option" id="gl-o' + i + '" aria-selected="' + (i === ui.hl) + '" class="' + (i === ui.hl ? 'hl' : '') + '" data-pick="' + esc(u.n) + '" tabindex="-1">' + esc(u.n) + '<small>added ' + u.c + (u.c === 1 ? ' time' : ' times') + '</small></button>'; }).join('');
    box.hidden = !s.length; inp.setAttribute('aria-expanded', String(!!s.length));
    if(ui.hl >= 0) inp.setAttribute('aria-activedescendant', 'gl-o' + ui.hl); else inp.removeAttribute('aria-activedescendant');
  }
  function add(what){
    var p = T.project(state.proj), inp = input(); if(!p || !what) return;
    if(inp){ inp.value = ''; } ui.hl = -1;
    var t = T.addItem(p.id, what); if(!t) return;
    ui.fresh = t.id; setTimeout(function(){ if(ui.fresh === t.id){ ui.fresh = null; } }, 1400);
  }
  // a usual, picked from what was suggested: with the number typed, if there was one
  function pick(name){ var inp = input(), typed = inp ? T.parseItem(inp.value) : { qty: 1 }; add({ name: name, qty: /\d/.test(inp ? inp.value : '') ? typed.qty : 1 }); }
  body.addEventListener('input', function(e){ if(e.target.getAttribute('data-k') === 'gl-add'){ ui.hl = -1; showSugg(); } });
  body.addEventListener('keydown', function(e){
    var t = e.target;
    if(t.getAttribute('data-k') === 'gl-add'){
      var box = sugg(), n = box && !box.hidden ? box.children.length : 0;
      if(e.key === 'ArrowDown' && n){ e.preventDefault(); ui.hl = (ui.hl + 1) % n; showSugg(); return; }
      if(e.key === 'ArrowUp' && n){ e.preventDefault(); ui.hl = ui.hl <= 0 ? n - 1 : ui.hl - 1; showSugg(); return; }
      if(e.key === 'Tab' && n && t.value.trim() && !e.shiftKey){ e.preventDefault(); pick(box.children[Math.max(0, ui.hl)].getAttribute('data-pick')); return; }
      if(e.key === 'Escape'){ if(n){ e.preventDefault(); e.stopPropagation(); box.hidden = true; t.setAttribute('aria-expanded', 'false'); ui.hl = -1; } else t.blur(); return; }
      if(e.key === 'Enter'){ e.preventDefault(); if(n && ui.hl >= 0) pick(box.children[ui.hl].getAttribute('data-pick')); else if(t.value.trim()) add(t.value); }
      return;
    }
    if(t.hasAttribute('data-glname')){
      if(e.key === 'Enter'){ e.preventDefault(); t.blur(); }
      if(e.key === 'Escape'){ var p = T.project(state.proj); t.textContent = p ? p.name : ''; t.blur(); }
    }
  });
  body.addEventListener('focusout', function(e){
    var t = e.target;
    if(t.hasAttribute && t.hasAttribute('data-glname')){ var p = T.project(state.proj), v = t.textContent.replace(/\s+/g, ' ').trim().slice(0, 80); if(p && v && v !== p.name) T.setProject(p.id, { name: v }); else if(p) t.textContent = p.name; }
    if(t.getAttribute && t.getAttribute('data-k') === 'gl-add') setTimeout(function(){ var box = sugg(); if(box && !box.contains(document.activeElement)) box.hidden = true; }, 150);
  });

  // ---------- pressing things ----------
  function itemMenu(btn, t){
    A.menu(btn, function(m){
      var h = document.createElement('h4'); h.textContent = 'Aisle'; m.appendChild(h);
      T.AISLES.concat([T.OTHER]).forEach(function(a){
        var b = A.item(m, a.name, function(){ A.closePop(); if(a.id !== (t.aisle || 'other')){ T.setAisle(t.id, a.id); A.toast('“' + t.title + '” goes in ' + a.name + ' from now on.'); } }, 'gl-ai');
        b.style.setProperty('--c', a.color); if(a.id === (t.aisle || 'other')) b.setAttribute('aria-current', 'true');
      });
      var l = document.createElement('div'); l.className = 'line'; m.appendChild(l);
      A.item(m, 'Remove from the list', function(){ A.closePop(); T.removeTask(t.id); }, 'warn');
    });
  }
  function usualMenu(btn, name){
    A.menu(btn, function(m){ A.item(m, 'Stop offering “' + name + '”', function(){ A.closePop(); T.stopOffering(name); A.toast('“' + name + '” won’t be offered again. Add it once more to bring it back.'); }); });
  }
  function tickNow(id, btn){
    var t = T.task(id); if(!t) return;
    var on = !T.isDone(t);
    if(on && btn && !still){ btn.classList.add('on', 'burst'); setTimeout(function(){ T.tick(id, true); }, 280); }
    else T.tick(id, on);
  }
  var held = 0, holdT = 0;
  body.addEventListener('pointerdown', function(e){
    var x = e.target.closest('[data-again]'); if(!x) return;
    held = 0; clearTimeout(holdT); holdT = setTimeout(function(){ held = Date.now(); usualMenu(x, x.getAttribute('data-again')); }, 520);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ body.addEventListener(n, function(){ clearTimeout(holdT); }, true); });
  body.addEventListener('contextmenu', function(e){
    var x = e.target.closest('[data-again]'); if(x){ e.preventDefault(); usualMenu(x, x.getAttribute('data-again')); return; }
    x = e.target.closest('.gl [data-item]'); if(x){ e.preventDefault(); var b = x.querySelector('[data-gmore]'), t = T.task(x.getAttribute('data-item')); if(b && t) itemMenu(b, t); }
  });
  body.addEventListener('click', function(e){
    var t = e.target, x;
    if((x = t.closest('[data-gtick]'))){ e.stopPropagation(); tickNow(x.getAttribute('data-gtick'), x); return; }
    if((x = t.closest('[data-glgo]'))){ e.preventDefault(); A.go('shop', x.getAttribute('data-glgo')); return; }
    if(state.view !== 'shop') return;
    var p = T.project(state.proj); if(!p) return;
    if(ui.step && !t.closest('.gl-step, [data-gstep]')){ ui.step = null; A.paint(); }
    if((x = t.closest('[data-glhome]'))){ e.preventDefault(); A.go('home'); return; }
    if((x = t.closest('[data-pick]'))){ pick(x.getAttribute('data-pick')); var i = input(); if(i) i.focus(); return; }
    if((x = t.closest('[data-again]'))){
      if(Date.now() - held < 400) return;
      var name = x.getAttribute('data-again');
      if(still){ add({ name: name, qty: 1 }); return; }
      x.classList.add('going'); setTimeout(function(){ add({ name: name, qty: 1 }); }, 200); return;
    }
    if((x = t.closest('[data-gstep]'))){ ui.step = x.getAttribute('data-gstep'); A.paint(); var plus = body.querySelector('[data-gq$=":1"]'); if(plus) plus.focus(); return; }
    if((x = t.closest('[data-gq]'))){ var g = x.getAttribute('data-gq').split(':'), it = T.task(g[0]); if(it) T.setQty(it.id, (it.qty || 1) + (+g[1])); setTimeout(function(){ var f = body.querySelector('[data-gq="' + g.join(':') + '"]'); if(f) f.focus(); }, 0); return; }
    if((x = t.closest('[data-gmore]'))){ e.stopPropagation(); var mt = T.task(x.getAttribute('data-gmore')); if(mt) itemMenu(x, mt); return; }
    if((x = t.closest('[data-glbasket]'))){ ui.basket = !ui.basket; A.paint(true); return; }
    if((x = t.closest('[data-glday]'))){ dayMenu(x, p); return; }
    if((x = t.closest('[data-glfinish]'))){ if(counts(p).left){ ui.asking = true; A.paint(); var f = body.querySelector('[data-glend="carry"]'); if(f) f.focus(); } else finish(p, false); return; }
    if((x = t.closest('[data-glend]'))){ var how = x.getAttribute('data-glend'); ui.asking = false; if(how === 'no') A.paint(); else finish(p, how === 'carry'); return; }
    if((x = t.closest('[data-glnew]'))){ var np = T.addList({ name: p.name, due: weekOn(p.due), color: p.color }); ui.focus = true; A.go('shop', np.id); return; }
    if((x = t.closest('[data-glreopen]'))){ T.reopenList(p.id); return; }
  });
  function finish(p, carry){
    var next = T.finishList(p.id, carry); ui.basket = false;
    if(next) A.toast('The next list has ' + T.tasks(next.id).length + (T.tasks(next.id).length === 1 ? ' thing' : ' things') + ' on it already.');
  }
  function dayMenu(btn, p){
    A.menu(btn, function(m){
      var sat = nextSat(), opts = [['Today', A.dayKey(0)], ['Tomorrow', A.dayKey(1)]];
      if(sat !== A.dayKey(1)) opts.push([dayName(sat), sat]);
      opts.forEach(function(o){ var b = A.item(m, o[0], function(){ A.closePop(); T.setProject(p.id, { due: o[1] }); }); if(o[1] === p.due) b.setAttribute('aria-current', 'true'); });
      var l = document.createElement('label'); l.className = 'gl-pick'; l.innerHTML = '<span>Another day</span><input type="date" value="' + esc(p.due || '') + '" aria-label="Another day">'; m.appendChild(l);
      l.querySelector('input').addEventListener('change', function(e){ if(e.target.value){ A.closePop(); T.setProject(p.id, { due: e.target.value }); } });
      var line = document.createElement('div'); line.className = 'line'; m.appendChild(line);
      var nb = A.item(m, 'No day', function(){ A.closePop(); T.setProject(p.id, { due: '' }); }); if(!p.due) nb.setAttribute('aria-current', 'true');
      var hint = document.createElement('p'); hint.textContent = 'A list with a day shows on Today, here and in the Sleek browser, from that day until it is shopped.'; m.appendChild(hint);
    });
  }
  // after each drawing: a new thing is scrolled into view; a new list has its add box ready
  A.afterPaint.push(function(){
    if(state.view !== 'shop') { ui.asking = false; ui.step = null; return; }
    if(ui.focus){ ui.focus = false; var i = input(); if(i) i.focus({ preventScroll: true }); }
    if(ui.fresh){ var r = body.querySelector('[data-item="' + ui.fresh + '"]'); if(r && r.scrollIntoView){ var b = r.getBoundingClientRect(), v = body.getBoundingClientRect(); if(b.bottom > v.bottom || b.top < v.top) r.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' }); } }
    if(document.activeElement === input()) showSugg();
  });
  A.newList = function(){ var p = T.addList({ name: 'Groceries' }); ui.focus = true; A.go('shop', p.id); return p; };
})();
