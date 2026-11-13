/* Opens Sleek Docs on a page: finds which one, then loads the editor.

   doc.html?d=<page id> opens that page; ?new=1 starts a new one (in ?folder=<id> if given); with
   neither it opens the page you last worked on, and on the very first visit a short welcome page.
   The editor's scripts load only once the page is known, and the app stays hidden until it has
   painted in the page's own look. */
(function(){
  var de = document.documentElement;
  de.classList.add('booting');
  var SCRIPTS = ['vendor/prosemirror.js', '@body', 'doc/schema.js', 'doc/paste.js', 'features/data-layout.js', 'doc/data.js', 'doc/compare.js', 'doc/editor.js', 'doc/blocks-figure.js', 'doc/blocks-data.js', 'doc/blocks-compare.js',
                 'doc/toolbar.js', 'doc/blocks-tasks.js', 'doc/sidebar.js', 'doc/tables.js', 'doc/export.js', 'doc/word.js', 'doc/publish.js', 'doc/to-deck.js', 'doc/viewers.js'];
  var params = new URLSearchParams(location.search), id = params.get('d');

  function load(list, done){
    var k = 0;
    (function next(){
      if(k >= list.length){ done(); return; }
      var src = list[k++];
      if(src === '@body'){
        if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', next, { once: true }); else next();
        return;
      }
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = next; s.onerror = function(){ console.error('Sleek Docs could not load ' + src); next(); };
      (document.body || document.head).appendChild(s);
    })();
  }
  function fail(title, msg){
    de.classList.remove('booting');
    var go = function(){ document.body.innerHTML = '<div class="boot-fail"><h1>' + title + '</h1><p>' + msg + '</p><a href="docs.html">Go to your pages</a></div>'; };
    if(document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  // the first thing a new person sees: a page that shows what a page can do
  function welcome(){
    function t(s, marks){ var o = { type: 'text', text: s }; if(marks) o.marks = marks.map(function(m){ return { type: m }; }); return o; }
    function p(){ return { type: 'paragraph', content: Array.prototype.slice.call(arguments) }; }
    function task(s){ return { type: 'task_item', attrs: { done: false }, content: [p(t(s))] }; }
    return { kind: 'doc', v: 1, theme: {}, doc: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [t('Welcome to Sleek Docs')] },
      p(t('A page saves as you write, in this browser. There is no account, nothing to install, and it works offline. '), t('This page is yours to change or delete.', ['em'])),
      { type: 'heading', attrs: { level: 2 }, content: [t('Try these')] },
      { type: 'task_list', content: [
        task('Press / on an empty line to add a heading, a list, a picture or a table'),
        task('Select a few words and make them bold, or highlight them'),
        task('Drop a picture onto the page'),
        task('Paste something from Word or Google Docs'),
        task('Make a folder on the left and drag this page into it') ] },
      { type: 'heading', attrs: { level: 2 }, content: [t('When it’s ready')] },
      p(t('Share saves the page as a PDF or as Markdown, and '), t('Look', ['strong']), t(' (the sun, top right) changes its colour, its type, and light or dark.')),
      p()
    ] } };
  }

  // the offline cache (sw.js), as for decks: the app opens with no connection and installs as an app
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), on = !local;
    try { if(localStorage.getItem('sleek-sw') === '1') on = true; } catch(e){}   // while developing, only when asked for
    if(on) window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }
  var S = window.SleekStore, D = window.SleekDocs;
  if(!S || !D){ fail('Sleek Docs could not start.', 'This browser blocks its storage.'); return; }
  function pick(){
    if(id) return D.get(id).then(function(d){ return d ? d.id : null; });
    if(params.get('new') === '1') return D.create({ folder: params.get('folder') || null }).then(function(d){ return d.id; });
    return D.list().then(function(l){
      if(l.length) return l[0].id;
      var first = false; try { first = !localStorage.getItem('sleek-docs-welcome'); localStorage.setItem('sleek-docs-welcome', '1'); } catch(e){}
      return D.create(first ? { seed: welcome() } : {}).then(function(d){ return d.id; });
    });
  }
  // tasks shown in pages come from Sleek Tasks' own storage; a page still opens if that can't be read
  var tasks = window.SleekTasks ? window.SleekTasks.ready().catch(function(e){ console.error(e); window.SleekTasks = null; }) : Promise.resolve();
  Promise.all([S.open(), D.open(), tasks]).then(pick).then(function(found){
    if(!found){ fail('That page isn’t here.', 'It may have been deleted, or made in another browser. Pages live in the browser they were made in.'); return; }
    try { history.replaceState(null, '', location.pathname + '?d=' + found); } catch(e){}
    window.SLEEK_DOC = { id: found };
    load(SCRIPTS, function(){ if(!window.SleekDoc || !window.SleekDoc.start){ fail('Sleek Docs could not start.', 'Part of it did not load. Check your connection and reload.'); return; } window.SleekDoc.start(); });
  }).catch(function(e){ console.error(e); fail('Sleek Docs could not start.', 'It could not open its storage in this browser (a private window can block it).'); });
})();
