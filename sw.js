/* Sleek's offline cache. Every file the app needs is kept here, so it opens and works with no
   connection, and installs as an app. A page comes from the cache at once and is refreshed from
   the network behind it, so a new version shows on the next visit. Change VERSION (and the list)
   when files are added or removed. */
var VERSION = 'sleek-1.0.29';   // 'sleek-' + the newest entry's v in data/changelog.js
var FILES = [
  './', 'index.html', 'deck.html', 'manifest.webmanifest',
  'styles.css', 'glow.css', 'app.js', 'glow-fx.js', 'theme-boot.js',
  'core/store.js', 'core/boot.js', 'core/publish.js', 'core/folder.js', 'data/sample.js', 'data/changelog.js',
  'features/features.css', 'features/add-slide.css', 'features/add-slide.js', 'features/before-picker.css', 'features/before-picker.js', 'features/take-apart-editor.css', 'features/take-apart-editor.js', 'features/press-editor.css',
  'features/deck-file.css', 'features/deck-file.js', 'features/disassemble.js', 'features/press.js', 'features/tour.js', 'features/mobile.js',
  'features/setup.css', 'features/setup.js', 'features/library.css', 'features/library.js', 'features/changelog.js', 'features/settings.js',
  'features/collage-layout.js', 'features/collage.js', 'features/collage.css', 'features/floats.js', 'features/floats.css',
  'icons/icon.svg', 'icons/favicon.svg', 'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'assets/sample/backdrop.svg', 'assets/sample/card-rings.svg', 'assets/sample/card.svg', 'assets/sample/plan-sketch.svg', 'assets/sample/plan.svg',
  'assets/sample/today-sketch.svg', 'assets/sample/today.svg', 'assets/sample/workout-sketch.svg', 'assets/sample/workout.svg', 'assets/sample/you.svg', 'assets/sample/swatch.svg', 'assets/sample/type.svg', 'assets/sample/phone.svg', 'assets/sample/icon.svg',
  'assets/sample/clip-a.mp4', 'assets/sample/clip-b.mp4', 'assets/sample/clip-c.mp4'
];
var FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

function piece(res, range){
  return res.blob().then(function(b){
    var m = /bytes=(\d*)-(\d*)/.exec(range) || [], start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], b.size - 1) : b.size - 1;
    return new Response(b.slice(start, end + 1), { status: 206, headers: {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + b.size, 'Content-Length': String(end - start + 1),
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4', 'Accept-Ranges': 'bytes' } });
  });
}

self.addEventListener('install', function(e){
  // fresh from the network, past the browser's own cache, so a new version never keeps an old file
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(FILES.map(function(f){ return new Request(f, { cache: 'reload' }); })); })
    .then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION && k.indexOf('sleek-') === 0; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url), same = url.origin === self.location.origin;
  if(!same && !FONTS.test(req.url)) return;
  // a video asks for a piece of the file: cut it from the cached copy
  var range = req.headers.get('range');
  if(range && same){
    e.respondWith(caches.open(VERSION).then(function(c){ return c.match(url.origin + url.pathname); }).then(function(hit){ return hit ? piece(hit, range) : fetch(req); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function(c){
    // deck.html?d=… is deck.html
    return c.match(req, { ignoreSearch: same }).then(function(hit){
      var net = (same ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req)).then(function(res){   // checked with the server, not the browser's cache
        if(res && (res.ok || res.type === 'opaque')) c.put(same ? url.origin + url.pathname : req, res.clone());
        return res;
      }).catch(function(){ return hit; });
      if(hit){ e.waitUntil(net.then(function(){}, function(){})); return hit; }
      return net;
    });
  }));
});
