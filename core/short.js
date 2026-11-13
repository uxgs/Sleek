/* Short addresses: /slides, /docs and /tasks.

   The hosted site serves slides.html at /slides, docs.html at /docs and tasks.html at /tasks as well. Where that works,
   a start screen shows its short address in the address bar, and links marked data-slug (the front
   door's tiles, the Slides | Docs switch) lead to the short one. Anywhere it doesn't (a local
   server, a copy opened from disk) nothing changes and the .html addresses are used. */
(function(){
  if(!/^https?:$/.test(location.protocol) || !window.fetch) return;
  if(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;     // a local server has no short addresses to offer
  var known = {};
  function works(url){
    if(!known[url]) known[url] = fetch(url, { method: 'HEAD' }).then(function(r){ return r.ok && !r.redirected && /html/.test(r.headers.get('content-type') || ''); }, function(){ return false; });
    return known[url];
  }
  var m = /^(.*\/)(slides|docs|tasks)\.html$/.exec(location.pathname);
  if(m) works(m[1] + m[2]).then(function(ok){ if(ok){ try { history.replaceState(history.state, '', m[1] + m[2] + location.search + location.hash); } catch(e){} } });
  Array.prototype.forEach.call(document.querySelectorAll('a[data-slug]'), function(a){
    var s = a.getAttribute('data-slug'); works(s).then(function(ok){ if(ok) a.setAttribute('href', s); });
  });
})();
