/* The film's clock. The renderer puts this into every frame before the page's own scripts, and time
   then moves only when the renderer says so: timers, animation frames, CSS animations and
   transitions, and videos all advance by exactly one film frame per step. So a render is smooth and
   comes out the same every time, however long each frame takes to draw.

   window.__film:
     step(ms)   move this frame and every frame inside it on by ms
     freeze()   hold anything that started since the last step at its first moment
     settle(cb) wait (in real time) for messages, pictures and video seeks to land, then cb()
     free(on)   let the clock run by itself (while the page loads), or stop it again */
(function(){
  if(window.__film) return;
  var W = window, RD = Date;
  var up = null; try { if(W.parent !== W && W.parent.__film) up = W.parent.__film; } catch(e){}
  var realST = W.setTimeout.bind(W), realSI = W.setInterval.bind(W), realCI = W.clearInterval.bind(W);
  var T = up ? up.now() : 0;
  var EPOCH = up ? up.epoch : new RD(2026, 8, 9, 9, 41, 0).getTime();   // the presenter's clock reads 9:41

  // ---- time ----
  try { performance.now = function(){ return T; }; } catch(e){}
  function VD(a, b, c, d, e2, f, g){
    if(!(this instanceof VD)) return new RD(EPOCH + T).toString();
    var n = arguments.length;
    return n === 0 ? new RD(EPOCH + T) : n === 1 ? new RD(a) : new RD(a, b, c || 1, d || 0, e2 || 0, f || 0, g || 0);
  }
  VD.prototype = RD.prototype; VD.now = function(){ return EPOCH + T; }; VD.parse = RD.parse; VD.UTC = RD.UTC;
  W.Date = VD;

  // ---- timers ----
  var timers = {}, seq = 1, ord = 0;
  function add(fn, ms, args, every){
    if(typeof fn !== 'function') return 0;
    var id = seq++; timers[id] = { at: T + Math.max(0, +ms || 0), fn: fn, args: args, every: every, n: ord++ }; return id;
  }
  W.setTimeout = function(fn, ms){ return add(fn, ms, Array.prototype.slice.call(arguments, 2), 0); };
  W.setInterval = function(fn, ms){ return add(fn, ms, Array.prototype.slice.call(arguments, 2), Math.max(1, +ms || 0)); };
  W.clearTimeout = W.clearInterval = function(id){ delete timers[id]; };
  function runTimers(to){
    for(var guard = 0; guard < 4000; guard++){
      var best = null, bid = null;
      for(var id in timers){ var t = timers[id]; if(t.at <= to && (!best || t.at < best.at || (t.at === best.at && t.n < best.n))){ best = t; bid = id; } }
      if(!best) break;
      if(best.at > T) T = best.at;
      if(best.every){ best.at += best.every; best.n = ord++; } else delete timers[bid];
      try { best.fn.apply(W, best.args); } catch(e){ console.error(e); }
    }
    T = to;
  }

  // ---- animation frames ----
  var rafs = {}, rseq = 1;
  W.requestAnimationFrame = function(fn){ var id = rseq++; rafs[id] = fn; return id; };
  W.cancelAnimationFrame = function(id){ delete rafs[id]; };
  function runRafs(){ var cur = rafs; rafs = {}; for(var id in cur){ try { cur[id](T); } catch(e){ console.error(e); } } }

  // ---- CSS animations and transitions (and element.animate) ----
  // Each is paused, so it only moves when a step moves it, and a paused animation still shows where
  // it is. Whether a CSS animation should be moving is read from its element's own
  // animation-play-state (a carousel stops under the pointer, or before its slide is ready); a time
  // the page sets itself (scrubbing a carousel) is kept.
  var seen = new WeakSet();
  function endOf(a){ try { var e = a.effect && a.effect.getComputedTiming().endTime; return typeof e === 'number' ? e : Number(e); } catch(x){ return Infinity; } }
  function moving(a){
    try {
      if(typeof CSSAnimation === 'undefined' || !(a instanceof CSSAnimation)) return true;
      var el = a.effect && a.effect.target; if(!el) return true;
      var cs = getComputedStyle(el, a.effect.pseudoElement || null);
      var names = cs.animationName.split(',').map(function(x){ return x.trim(); }), states = cs.animationPlayState.split(',').map(function(x){ return x.trim(); });
      var i = names.indexOf(a.animationName); if(i < 0) return true;
      return states[i % states.length] !== 'paused';
    } catch(e){ return true; }
  }
  function anims(dt){
    var list; try { list = document.getAnimations(); } catch(e){ return; }
    for(var i = 0; i < list.length; i++){
      var a = list[i];
      try {
        if(!seen.has(a)){
          seen.add(a);
          if(a.playState === 'finished') continue;
          var go = moving(a);
          a.pause(); if(go) a.currentTime = 0;        // its first frame is its first moment
          continue;
        }
        if(!dt || a.playState === 'finished' || !moving(a)) continue;
        var nt = (Number(a.currentTime) || 0) + dt, end = endOf(a);
        if(nt >= end) a.finish();
        else a.currentTime = nt;
      } catch(e){}
    }
  }

  // ---- videos: play() marks a film as running, and each step seeks it on by one frame ----
  var HP = W.HTMLMediaElement && W.HTMLMediaElement.prototype, seeking = 0;
  if(HP){
    var rPause = HP.pause;
    HP.play = function(){
      var v = this; v.__fplay = true;
      realST(function(){ try { v.dispatchEvent(new Event('play')); v.dispatchEvent(new Event('playing')); } catch(e){} }, 0);
      return Promise.resolve();
    };
    HP.pause = function(){ this.__fplay = false; return rPause.call(this); };
    try { Object.defineProperty(HP, 'paused', { configurable: true, get: function(){ return !this.__fplay; } }); } catch(e){}
  }
  function videos(dt){
    var vs = document.querySelectorAll('video');
    for(var i = 0; i < vs.length; i++){
      var v = vs[i];
      if(v.hasAttribute('autoplay')){ v.removeAttribute('autoplay'); v.__fplay = true; try { rPause.call(v); } catch(e){} }
      if(!dt || !v.__fplay || v.readyState < 1 || !isFinite(v.duration) || !v.duration) continue;
      var nt = v.currentTime + dt / 1000;
      if(nt >= v.duration){
        if(v.loop) nt = nt % v.duration;
        else { nt = v.duration; v.__fplay = false; (function(x){ realST(function(){ x.dispatchEvent(new Event('ended')); }, 0); })(v); }
      }
      seeking++;
      (function(x){ var done = false, fin = function(){ if(done) return; done = true; seeking--; }; x.addEventListener('seeked', fin, { once: true }); realST(fin, 400); })(v);
      try { v.currentTime = nt; } catch(e){ }
    }
  }

  // ---- frames inside this one ----
  function kids(fn){
    for(var i = 0; i < W.frames.length; i++){ try { var f = W.frames[i].__film; if(f) fn(f); } catch(e){} }
  }
  function step(ms){
    runTimers(T + ms); runRafs(); anims(ms); videos(ms);
    kids(function(f){ f.step(ms); });
  }
  function freeze(){ anims(0); kids(function(f){ f.freeze(); }); }
  function pending(){
    var n = seeking;
    try {
      var im = document.images; for(var i = 0; i < im.length; i++) if(!im[i].complete) n++;
      if(document.fonts && document.fonts.status === 'loading') n++;
      if(document.readyState !== 'complete') n++;
    } catch(e){}
    kids(function(f){ n += f.pending(); });
    return n;
  }
  function settle(cb, minMs, maxMs){
    var t0 = realNow(), min = minMs == null ? 6 : minMs, max = maxMs == null ? 600 : maxMs;
    (function again(){
      var dt = realNow() - t0;
      if(dt >= min && (pending() === 0 || dt >= max)){ freeze(); cb(pending()); return; }
      realST(again, 3);
    })();
  }
  var realPerf = W.performance, realNowFn = null;
  try { realNowFn = Object.getPrototypeOf(realPerf).now.bind(realPerf); } catch(e){}
  function realNow(){ return realNowFn ? realNowFn() : RD.now(); }

  var freeId = 0;
  function free(on){
    if(freeId){ realCI(freeId); freeId = 0; }
    if(on) freeId = realSI(function(){ step(1000 / 60); }, 16);
  }

  W.__film = { now: function(){ return T; }, epoch: EPOCH, step: step, freeze: freeze, pending: pending, settle: settle, free: free };
  if(W.top === W) free(true);          // until the renderer takes over, the clock runs by itself
})();
