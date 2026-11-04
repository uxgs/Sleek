/* Come to life: a screenshot tile that turns into a live prototype.

   Mark a tile with the prototype folder it opens:
       <div class="media" data-proto="sample">...</div>
   Hovering it shows a "Click to open" chip; clicking it opens it: the still grows to
   fill the slide, pushes in, and the prototype (prototypes/<name>/index.html) fades up in its place.
   Arrow keys and Enter drive the prototype; Esc there backs out, and Esc on its home screen (or the
   x) zooms back down to the tile. The prototype preloads when its slide comes up, so it's instant.
*/
(function(){
  var D = window.Deck; if(!D || D.popout) return;
  var stage = D.stage, layer = null, frame = null, iframe = null, loaded = null;
  var tile = null, open = false, armTile = null, armT = 0, raf = 0, lastPt = null, timers = [];
  var GROW_MS = 720, LIVE_MS = 520;

  function later(fn, ms){ timers.push(setTimeout(fn, ms)); }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }

  function build(){
    if(layer) return;
    layer = document.createElement('div');
    layer.className = 'ctl'; layer.hidden = true;
    layer.innerHTML =
      '<div class="ctl-dim"></div>' +
      '<div class="ctl-frame">' +
        '<div class="ctl-live"></div>' +
        '<div class="ctl-still"></div>' +
        '<div class="ctl-chip"><span class="ctl-dot"></span>Live prototype<span class="ctl-key">Esc to close</span></div>' +
        '<button class="ctl-close" type="button" aria-label="Close prototype">×</button>' +
      '</div>';
    stage.appendChild(layer);
    frame = layer.querySelector('.ctl-frame');
    layer.querySelector('.ctl-close').onclick = function(){ close(); };
    layer.querySelector('.ctl-dim').onclick = function(){ close(); };
  }

  function preload(name){
    build();
    if(loaded === name && iframe) return;
    var live = layer.querySelector('.ctl-live');
    live.innerHTML = '';
    iframe = document.createElement('iframe');
    iframe.src = 'prototypes/' + name + '/index.html?embed=1';
    iframe.title = name + ' prototype';
    live.appendChild(iframe);
    loaded = name;
  }
  function post(msg){ try { iframe && iframe.contentWindow.postMessage(msg, '*'); } catch(e){} }
  function focusProto(){
    if(D.mirror) return;                       // the presenter's preview only replays: input goes to the audience
    try { iframe.focus(); iframe.contentWindow.focus(); } catch(e){}
    post({ type: 'proto:activate' });
  }

  function place(r, radius){
    frame.style.left = r.x + 'px'; frame.style.top = r.y + 'px';
    frame.style.width = r.w + 'px'; frame.style.height = r.h + 'px';
    frame.style.borderRadius = radius + 'px';
  }
  function tileRadius(t){ return parseFloat(getComputedStyle(t).borderTopLeftRadius) || 16; }

  function openFrom(t){
    if(open || !t) return;
    disarm();
    preload(t.getAttribute('data-proto'));
    D.hideZoom(); D.modal = true; open = true; tile = t; clearTimers();
    var src = D.tileSrc(t);
    var still = layer.querySelector('.ctl-still');
    still.style.backgroundImage = src ? 'url("' + src + '")' : '';
    layer.classList.toggle('no-still', !src);
    layer.classList.remove('grown', 'alive', 'closing');
    frame.classList.add('no-anim');
    place(D.stageRect(t), tileRadius(t));
    layer.hidden = false;
    void frame.offsetWidth;
    frame.classList.remove('no-anim');
    layer.classList.add('grown');                 // dim the slide, grow the frame to full bleed
    place({ x: 0, y: 0, w: 1280, h: 720 }, 0);
    later(function(){ layer.classList.add('alive'); focusProto(); }, GROW_MS - 80);   // push in, prototype fades up
  }

  function close(instant){
    if(!open) return;
    open = false; D.modal = false; clearTimers();
    if(instant){ layer.hidden = true; layer.classList.remove('grown', 'alive', 'closing'); post({ type: 'proto:reset' }); returnFocus(); return; }
    layer.classList.remove('alive'); layer.classList.add('closing');    // prototype fades back to the still
    later(function(){
      layer.classList.remove('grown');
      if(tile && tile.closest('.slide.active')) place(D.stageRect(tile), tileRadius(tile));
    }, LIVE_MS - 200);
    later(function(){ layer.hidden = true; layer.classList.remove('closing'); post({ type: 'proto:reset' }); }, LIVE_MS - 200 + GROW_MS);
    returnFocus();
  }
  function returnFocus(){
    try { iframe && iframe.blur(); } catch(e){}
    var v = document.getElementById('viewport');
    if(v){ v.setAttribute('tabindex', '-1'); v.focus({ preventScroll: true }); }
  }

  // ---------- hover shows it's live; a click opens it ----------
  function featureTileAt(x, y){
    var els = document.elementsFromPoint(x, y);
    for(var k = 0; k < els.length; k++){
      var el = els[k];
      if(el.matches && el.matches('[data-proto]') && el.closest('#stage .slide.active')) return el;
    }
    return null;
  }
  function disarm(){
    clearTimeout(armT); armT = 0;
    if(armTile) armTile.classList.remove('ctl-arming');
    armTile = null;
  }
  function check(){
    raf = 0;
    if(open || D.modal || D.isEditing() || !lastPt){ disarm(); document.body.classList.remove('over-proto'); return; }
    var t = featureTileAt(lastPt.x, lastPt.y);
    document.body.classList.toggle('over-proto', !!t);       // lets clicks reach the tile through the edge zones
    if(t === armTile) return;
    disarm();
    if(t){ armTile = t; t.classList.add('ctl-arming'); }
  }
  document.addEventListener('mousemove', function(e){ lastPt = { x: e.clientX, y: e.clientY }; if(!raf) raf = requestAnimationFrame(check); });
  document.documentElement.addEventListener('mouseleave', function(){ lastPt = null; disarm(); });
  document.addEventListener('click', function(e){
    if(open || D.isEditing()) return;
    var t = e.target.closest && e.target.closest('#stage .slide.active [data-proto]');
    if(t){ e.stopPropagation(); openFrom(t); }
  }, true);

  // ---------- keys and messages ----------
  document.addEventListener('keydown', function(e){
    if(!open) return;
    if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
    // keys that land on the deck while the prototype is up go to the prototype
    if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Backspace'].indexOf(e.key) > -1){
      e.preventDefault(); focusProto(); post({ type: 'proto:key', key: e.key });
    }
  });
  window.addEventListener('message', function(e){
    if(!iframe || e.source !== iframe.contentWindow) return;
    var d = e.data || {};
    if(d.type === 'proto:exit') close();
    // things done directly inside the prototype, echoed so the presenter's live preview matches
    else if(d.type === 'proto:clicked' && D.echoAct) D.echoAct({ t: 'protoclick', nx: d.nx, ny: d.ny });
    else if(d.type === 'proto:keyed' && D.echoAct) D.echoAct({ t: 'protokey', key: d.key });
  });

  // ---------- slides ----------
  function onShow(slide){
    if(open) close(true);
    disarm();
    var t = slide && slide.querySelector('[data-proto]');
    if(t) preload(t.getAttribute('data-proto'));
  }
  D.onShow.push(onShow);
  D.onReset.push(function(){ close(); });
  D.protoPost = function(msg){ if(open) post(msg); };
  onShow(D.current());
})();
