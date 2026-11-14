/* Everything you have made with Sleek in this browser, as one file: every deck, every page, and
   every board and task, with their pictures inside it. It is for keeping a copy, and for moving to
   another browser: the Sleek browser brings the file in from its File menu (Bring In Sleek Work).

   The file is text: { format: 'sleek-work', version: 1, decks: [a deck file, …], pages: [a page
   file, …], tasks: a Sleek Tasks file }, each part exactly what its own app saves for one deck, one
   page, or all your tasks. Nothing is sent anywhere; the file is made here and handed to you.

   window.SleekMove.save(say) makes it; say(text) is told what it is doing as it goes. */
(function(){
  function load(src){
    return new Promise(function(ok, no){
      if(document.querySelector('script[src="' + src + '"]')){ ok(); return; }
      var s = document.createElement('script'); s.src = src; s.onload = function(){ ok(); }; s.onerror = function(){ no(new Error('could not load ' + src)); }; document.head.appendChild(s);
    });
  }
  function key(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // each item's text goes in as its own piece, so the whole is never one enormous string
  function each(list, name, say, fetchOne, parts){
    var n = 0, chain = Promise.resolve();
    list.forEach(function(d, i){
      chain = chain.then(function(){ say(name + ' ' + (i + 1) + ' of ' + list.length); return fetchOne(d.id); }).then(function(text){ if(text){ if(n) parts.push(','); parts.push(text); n++; } });
    });
    return chain.then(function(){ return n; });
  }
  function save(say){
    say = say || function(){};
    return load('core/store.js').then(function(){ return load('core/doc-store.js'); }).then(function(){ return load('core/task-store.js'); }).then(function(){
      var S = window.SleekStore, D = window.SleekDocs, T = window.SleekTasks, count = { decks: 0, pages: 0, boards: 0, tasks: 0 };
      var parts = ['{"format":"sleek-work","version":1,"exported":' + JSON.stringify(new Date().toISOString()) + ',"decks":['];
      return S.list().then(function(decks){ return each(decks, 'Deck', say, S.exportDeck, parts); }).then(function(n){ count.decks = n; parts.push('],"pages":['); return D.list(); })
        .then(function(pages){ return each(pages, 'Page', say, D.exportDoc, parts); }).then(function(n){ count.pages = n; parts.push('],"tasks":'); say('Tasks'); return T.exportAll(); })
        .then(function(text){
          parts.push(text, '}'); count.boards = T.projects().length; count.tasks = T.tasks().length;
          var a = document.createElement('a'), url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
          a.href = url; a.download = 'All my Sleek work ' + key(new Date()) + '.sleek'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
          return count;
        });
    });
  }
  window.SleekMove = { save: save };
})();
