/* Prototype kit: a small framework for keyboard-driven prototypes that a deck tile can open live.

   - A 1920x1080 canvas scaled to fit the window, identical in its own tab or embedded in the deck.
   - Arrow-key focus: arrow keys move to the nearest .f element in that direction, Enter/Space
     opens it, Esc/Backspace goes back. Moving the mouse focuses what it's over.
   - A view stack: Proto.go('detail', { id }) pushes, Proto.back() pops (restoring scroll and focus).
     Markup shortcuts: data-go="detail:item-1", data-back.
   - Embedded in the deck (?embed=1) it talks over postMessage:
       out: proto:ready, proto:exit (Esc on the home view)
       in:  proto:reset, proto:activate, proto:key

   A prototype registers views and starts:
       Proto.view('home', function(params){ return element; });
       Proto.view('detail', fn, { modal: true });   // opens over the previous view, which dims
       Proto.start({ home: 'home', tag: 'Sample prototype', hints: false });
*/
(function(){
  var EMBED = /[?&]embed=1/.test(location.search);
  var root = null, views = {}, stack = [], focused = null, homeName = 'home', pointerMoved = false, scrollFn = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function post(msg){ if(EMBED && window.parent !== window){ try { window.parent.postMessage(msg, '*'); } catch(e){} } }

  function fit(){
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  // ---------- views ----------
  function top(){ return stack[stack.length - 1] || null; }
  function mount(entry, enter){
    var el = views[entry.name].fn(entry.params || {});
    el.classList.add('p-view');
    if(entry.modal) el.classList.add('p-modal');
    if(enter) el.classList.add('enter');
    entry.el = el;
    root.insertBefore(el, root.querySelector('.p-chrome'));
    return el;
  }
  function focusFirst(el){
    var first = el.querySelector('[data-autofocus].f') || el.querySelector('.f');
    focused = null;
    if(first) setFocus(first, { noScroll: true });
  }
  function go(name, params){
    if(!views[name]){ console.warn('no view', name); return; }
    var cur = top(), modal = !!views[name].modal;
    if(cur && cur.el){
      cur.focus = focused; cur.scroll = cur.el.scrollTop;
      if(modal) cur.el.classList.add('p-under'); else cur.el.remove();
    }
    var entry = { name: name, params: params || {}, modal: modal };
    stack.push(entry);
    focusFirst(mount(entry, stack.length > 1));
  }
  function back(){
    // at the home view: embedded, tell the deck to close; standalone, go back to the start screen
    if(stack.length <= 1){ if(EMBED) post({ type: 'proto:exit' }); else location.href = '../../index.html'; return; }
    var gone = stack.pop(); if(gone.el) gone.el.remove();
    var cur = top();
    if(gone.modal){
      cur.el.classList.remove('p-under');                      // it never left; just undim it
    } else {
      root.insertBefore(cur.el, root.querySelector('.p-chrome'));
      cur.el.classList.remove('enter'); void cur.el.offsetWidth; cur.el.classList.add('enter', 'back');
      cur.el.scrollTop = cur.scroll || 0;
    }
    focused = null;
    if(cur.focus && cur.el.contains(cur.focus)) setFocus(cur.focus, { noScroll: true }); else focusFirst(cur.el);
  }
  function reset(){
    stack.forEach(function(e){ if(e.el) e.el.remove(); });
    stack = []; focused = null;
    go(homeName);
  }

  // ---------- scrolling ----------
  // Our own eased scroll: native smooth scrolling varies by browser (and cancels itself when two
  // scrollers start together), and this gives the same quick glide everywhere.
  function tween(el, prop, to, ms){
    var from = el[prop]; if(Math.abs(from - to) < 1) return;
    var t0 = performance.now(), token = {}, started = false; el['_tw_' + prop] = token;
    function step(now){
      if(el['_tw_' + prop] !== token) return;                 // a newer scroll took over
      started = true;
      var t = Math.min(1, (now - t0) / (ms || 300)), e = 1 - Math.pow(1 - t, 3);
      el[prop] = from + (to - from) * e;
      if(t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // if the browser isn't giving us frames (hidden or throttled window), just land on the target
    setTimeout(function(){ if(!started && el['_tw_' + prop] === token) el[prop] = to; }, 120);
  }

  // ---------- focus ----------
  function setFocus(el, opts){
    if(!el || el === focused) return;
    if(focused) focused.classList.remove('is-focused');
    focused = el; el.classList.add('is-focused');
    // a prototype can bring its own scrolling (e.g. pin the focused row); otherwise keep it in view
    if(!(opts && opts.noScroll) && !(scrollFn && scrollFn(el))) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    root.dispatchEvent(new CustomEvent('p:focus', { detail: el }));
  }
  function candidates(){
    var v = top() && top().el; if(!v) return [];
    return Array.prototype.filter.call(v.querySelectorAll('.f'), function(el){
      var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
  }
  // nearest element in a direction, strongly preferring the same row/column
  function move(dir){
    var list = candidates(); if(!list.length) return;
    if(!focused || list.indexOf(focused) < 0){ setFocus(list[0]); return; }
    var a = focused.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function(el){
      if(el === focused) return;
      var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay, along, across, overlap;
      if(dir === 'right' || dir === 'left'){
        along = dir === 'right' ? dx : -dx; across = Math.abs(dy);
        overlap = b.top < a.bottom && b.bottom > a.top;
      } else {
        along = dir === 'down' ? dy : -dy; across = Math.abs(dx);
        overlap = b.left < a.right && b.right > a.left;
      }
      if(along <= 1) return;
      var score = along + across * (overlap ? 0.5 : 3);
      if(score < bestScore){ bestScore = score; best = el; }
    });
    if(best) setFocus(best);
  }
  function activate(){ if(focused) focused.click(); }

  function handleKey(key){
    var dirs = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' };
    if(dirs[key]){ move(dirs[key]); return true; }
    if(key === 'Enter' || key === ' '){ activate(); return true; }
    if(key === 'Escape' || key === 'Backspace'){ back(); return true; }
    return false;
  }

  // ---------- start ----------
  function start(opts){
    opts = opts || {};
    homeName = opts.home || 'home';
    scrollFn = opts.scroll || null;
    if(EMBED) document.body.classList.add('embed');
    root = document.querySelector('.p-root');
    if(!root){ root = document.createElement('div'); root.className = 'p-root'; document.body.appendChild(root); }
    var chrome = document.createElement('div'); chrome.className = 'p-chrome';
    chrome.innerHTML = (opts.hints === false ? '' : '<div class="p-hints"><span><b>←↑↓→</b> Move</span><span><b>Enter</b> Select</span><span><b>Esc</b> Back</span></div>') +
      (opts.tag ? '<div class="p-tag">' + esc(opts.tag) + (EMBED ? '' : ' \u00b7 Esc for start screen') + '</div>' : '');
    root.appendChild(chrome);

    document.addEventListener('keydown', function(e){
      pointerMoved = false;
      // typing in a text field: keys are for the field; Esc/Enter leave it, Down moves on
      var t = e.target;
      if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')){
        if(e.key === 'Escape' || e.key === 'Enter' || e.key === 'ArrowDown'){
          e.preventDefault(); t.blur();
          if(e.key === 'ArrowDown') move('down');
        }
        return;
      }
      if(handleKey(e.key)) e.preventDefault();
    });
    document.addEventListener('mousemove', function(){ pointerMoved = true; });
    // embedded: report real clicks and keys to the deck, which mirrors them to the presenter's preview
    if(EMBED){
      document.addEventListener('click', function(e){ if(e.isTrusted) post({ type: 'proto:clicked', nx: e.clientX / window.innerWidth, ny: e.clientY / window.innerHeight }); }, true);
      document.addEventListener('keydown', function(e){ if(e.isTrusted) post({ type: 'proto:keyed', key: e.key }); }, true);
    }
    // only a real mouse move focuses: smooth scrolling under a still cursor must not steal focus
    root.addEventListener('mouseover', function(e){
      if(!pointerMoved) return;
      var f = e.target.closest && e.target.closest('.f'); if(f) setFocus(f, { noScroll: true });
    });
    root.addEventListener('click', function(e){
      var g = e.target.closest && e.target.closest('[data-go]');
      if(g){ var p = g.getAttribute('data-go').split(':'); go(p[0], { id: p[1] }); return; }
      if(e.target.closest && e.target.closest('[data-back]')) back();
    });
    window.addEventListener('resize', fit);
    window.addEventListener('message', function(e){
      var d = e.data || {};
      if(d.type === 'proto:reset') reset();
      else if(d.type === 'proto:activate'){ try { window.focus(); } catch(_){} pointerMoved = false; }
      else if(d.type === 'proto:key') handleKey(d.key);
      else if(d.type === 'proto:click'){                       // a click forwarded from the presenter's preview
        var el = document.elementFromPoint(d.nx * window.innerWidth, d.ny * window.innerHeight); if(!el) return;
        var f = el.closest && el.closest('.f'); if(f) setFocus(f, { noScroll: true });
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: d.nx * window.innerWidth, clientY: d.ny * window.innerHeight }));
      }
    });
    fit();
    go(homeName);
    post({ type: 'proto:ready' });
  }

  // ---------- helpers for prototypes ----------
  function h(html){ var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function compact(n){ return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n); }
  function item(id){ var list = (window.PROTO_DATA && window.PROTO_DATA.items) || []; return list.filter(function(g){ return g.id === id; })[0] || list[0]; }
  // card art: the real image if the item has one, otherwise generated placeholder art
  function art(g, cls){
    return '<div class="p-art ' + (cls || '') + '" style="--a:' + g.a + ';--b:' + g.b + '">' +
      (g.img ? '<img src="' + esc(g.img) + '" alt="">' : '<div class="p-art-title">' + esc(g.title) + '</div>') + '</div>';
  }

  window.Proto = {
    embed: EMBED, view: function(name, fn, o){ views[name] = { fn: fn, modal: !!(o && o.modal) }; }, start: start,
    go: go, back: back, reset: reset, setFocus: setFocus,
    h: h, esc: esc, compact: compact, item: item, art: art, tween: tween
  };
})();
