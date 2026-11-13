/* Viewers, the published page's side (core/publish.js puts this in only when the deck was published
   with "See who's viewing" switched on).

   While the page is open it keeps one line to the service (service/) and says two things: a random
   id for this browser, so two visits count as one person, and the number of the slide showing.
   Nothing else: no name, nothing about the device, nothing from the deck. It never gets in the way:
   with no connection, or if the service says no, the deck plays exactly the same. */
(function(){
  var D = window.Deck || window.SleekReader, info = window.SLEEK_DECK, v = info && info.viewers;      // SleekReader: a published Sleek Docs page (doc/reader.js), which counts blocks as a deck counts slides
  if(!D || !v || !v.url || !v.room || !info.published || !window.WebSocket) return;
  if(D.popout || D.mirror || D.presenter) return;      // the presenter's own windows aren't viewers

  var KEY = (window.SLEEK_NS || '') + 'viewer', who = '';
  try { who = localStorage.getItem(KEY) || ''; } catch(e){}
  if(!/^[A-Za-z0-9_-]{8,40}$/.test(who)){
    who = '';
    try { var b = crypto.getRandomValues(new Uint8Array(12)); for(var k = 0; k < b.length; k++) who += ('0' + b[k].toString(16)).slice(-2); }
    catch(e){ who = 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
    try { localStorage.setItem(KEY, who); } catch(e){}
  }

  var ws = null, counted = false, far = 0, tries = 0, timer = 0, away = 0, done = false, openedAt = 0;
  function at(){ var n = D.index ? D.index() : 0; return n > 0 ? n : 0; }
  function send(o){ try { if(ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch(e){} }
  function connect(){
    if(done || ws) return;
    clearTimeout(timer);
    try { ws = new WebSocket(String(v.url).replace(/^http/, 'ws') + '/v1/rooms/' + v.room + '/view'); } catch(e){ ws = null; retry(); return; }
    ws.onopen = function(){
      openedAt = Date.now(); far = Math.max(far, at());
      send(counted ? { w: who, s: at(), again: true, far: far } : { w: who, s: at() });
      counted = true;
    };
    ws.onclose = function(e){
      ws = null;
      // the service no longer counts this deck, or it is full, or it didn't like what it heard: leave it be
      if(e.code === 4404 || e.code === 4429 || e.code === 4403 || e.code === 1008 || e.code === 1009){ done = true; return; }
      if(!away) retry();
    };
    ws.onerror = function(){};
  }
  function retry(){
    if(done) return;
    if(Date.now() - openedAt > 20000) tries = 0;
    if(tries >= 8){ done = true; return; }
    timer = setTimeout(connect, [2000, 5000, 15000, 30000, 60000][Math.min(tries++, 4)]);
  }
  D.onShow.push(function(el, n){ if(n > far) far = n; send({ s: n }); });

  // a tab left in the background for two minutes isn't being viewed; it rejoins when it is looked at again
  var idle = 0;
  document.addEventListener('visibilitychange', function(){
    clearTimeout(idle);
    if(document.visibilityState === 'hidden'){
      idle = setTimeout(function(){ away = 1; clearTimeout(timer); if(ws) try { ws.close(1000); } catch(e){} }, 120000);
    } else if(away){ away = 0; tries = 0; connect(); }
  });
  window.addEventListener('online', function(){ if(!away && !ws){ tries = 0; connect(); } });
  window.addEventListener('pagehide', function(){ if(ws) try { ws.close(1000); } catch(e){} });
  connect();
})();
