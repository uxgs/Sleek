/* Sleek Tasks' home: your boards, as tiles. Each tile is a small picture of its board (its columns,
   with a card for each of the first few tasks in them), in the board's colour, with its name and how
   much is open. Press one to go into it; ⋯ renames it, recolours it or deletes it; New board makes one.
   Today, which gathers what is due across every board, is one press away.

   (A "board" here is what the code calls a project: a set of tasks with its own columns and fields.) */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp; if(!T || !A) return;
  var esc = A.esc, body = document.getElementById('body'), state = A.state;
  var fresh = null, naming = null;      // fresh: a board just made, shown with a ring; naming: the board being renamed (or 'new')

  function mini(p){      // the board in small: up to four columns, up to four cards in each
    var ts = T.tasks(p.id);
    return '<span class="bd-cols" aria-hidden="true">' + p.statuses.slice(0, 4).map(function(s){
      var n = ts.filter(function(t){ return t.status === s.id; }).length, cards = '';
      for(var i = 0; i < Math.min(n, 4); i++) cards += '<b></b>';
      return '<span class="bd-col' + (s.done ? ' done' : '') + '"><i></i>' + cards + '</span>';
    }).join('') + '</span>';
  }
  function tile(p, i){
    var ts = T.tasks(p.id), open = ts.filter(function(t){ return !T.isDone(t); }), due = open.filter(function(t){ return t.due && A.away(t) <= 0; }).length;
    var sub = !ts.length ? 'Nothing in it yet' : (open.length ? open.length + ' open' : 'All done') + (due ? ' · ' + due + ' due' : '');
    var name = naming === p.id ? '<input class="bd-rename" value="' + esc(p.name) + '" data-k="rename-' + p.id + '" aria-label="Board name" maxlength="80">' : '<b class="bd-name">' + esc(p.name) + '</b>';
    return '<article class="bd' + (fresh === p.id ? ' fresh' : '') + '" style="--c:' + p.color + ';--i:' + i + '" data-flip="bd-' + p.id + '"><span class="bd-bloom" aria-hidden="true"></span>' +
      '<a class="bd-thumb" href="#/' + p.id + '/' + A.lastView(p.id) + '" data-board="' + p.id + '" aria-label="Open ' + esc(p.name) + '"' + (state.proj === p.id ? ' style="view-transition-name:stage"' : '') + '>' + mini(p) + '</a>' +
      '<div class="bd-meta"><div>' + name + '<span>' + sub + '</span></div><button type="button" class="bd-more" data-bmore="' + p.id + '" aria-label="More for ' + esc(p.name) + '" aria-haspopup="true">⋯</button></div></article>';
  }
  A.views.home = function(){
    var ps = T.projects(), due = T.tasks().filter(function(t){ return !T.isDone(t) && t.due && A.away(t) <= 0; }).length;
    var v = window.SLEEK_TASK_CHANGES ? 'v' + window.SLEEK_TASK_CHANGES[0].v : '';
    return '<div class="home"><div class="home-in">' +
      '<div class="home-brand"><nav class="brand" aria-label="Where you are"><a href="index.html" title="Back to Sleek, to pick another app"><img src="icons/tasks.svg" alt="" width="34" height="31">Sleek</a><i aria-hidden="true">/</i><b aria-current="page">Tasks</b></nav>' +
      '<span class="grow"></span><button type="button" class="home-v" data-do="news" aria-haspopup="true">' + v + '</button><button type="button" class="home-v" data-do="look" title="Light or dark" aria-label="Light or dark">◐</button></div>' +
      '<h1>Know What’s Next.</h1><p class="lede">Everything saves as you go. No account, nothing to install, and it works offline.</p>' +
      '<div class="home-acts"><button type="button" class="hbtn new" data-do="newboard"><span class="plus" aria-hidden="true">+</span>New board</button>' +
      '<a class="hbtn" href="#today"><i class="dot"></i>Today' + (due ? '<em>' + due + ' due</em>' : '') + '</a></div>' +
      '<section aria-labelledby="bd-h"><div class="home-head"><h2 id="bd-h">Your boards</h2><span>' + (ps.length || '') + '</span></div><div class="bd-grid">' +
      (naming === 'new' ? '<article class="bd fresh" style="--c:' + T.COLORS[ps.length % T.COLORS.length] + ';--i:0"><span class="bd-thumb empty"></span><div class="bd-meta"><div><input class="bd-rename" data-k="rename-new" placeholder="Name this board" aria-label="Name this board" maxlength="80"><span>Press Enter to make it</span></div></div></article>' : '') +
      ps.map(tile).join('') + '</div></section></div></div>';
  };

  // ---------- naming a board in its tile: a new one, or one being renamed ----------
  function startNaming(what){ naming = what; A.paint(); var inp = body.querySelector('.bd-rename'); if(inp){ inp.focus(); inp.select(); } }
  function endNaming(keep){
    var inp = body.querySelector('.bd-rename'), what = naming; if(!what) return; naming = null;
    var v = inp ? inp.value.trim().slice(0, 80) : '';
    if(keep && v){
      if(what === 'new'){ var p = T.addProject({ name: v }); fresh = p.id; setTimeout(function(){ if(fresh === p.id){ fresh = null; if(state.view === 'home') A.paint(); } }, 2400); }
      else T.setProject(what, { name: v });
    }
    A.paint();
  }
  body.addEventListener('keydown', function(e){
    if(!e.target.classList || !e.target.classList.contains('bd-rename')) return;
    e.stopPropagation(); if(e.key === 'Enter'){ e.preventDefault(); endNaming(true); } else if(e.key === 'Escape') endNaming(false);
  });
  body.addEventListener('focusout', function(e){ if(e.target.classList && e.target.classList.contains('bd-rename')) setTimeout(function(){ var a = document.activeElement; if(naming && !(a && a.classList && a.classList.contains('bd-rename'))) endNaming(true); }, 0); });

  function more(btn, p){
    A.menu(btn, function(m){
      A.item(m, 'Open', function(){ A.closePop(); A.go(A.lastView(p.id), p.id); });
      A.item(m, 'Rename', function(){ A.closePop(); startNaming(p.id); });
      var h = document.createElement('h4'); h.textContent = 'Colour'; m.appendChild(h);
      var sw = document.createElement('div'); sw.className = 'sws';
      T.COLORS.forEach(function(c){ var b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', c); b.className = c === p.color ? 'on' : ''; b.setAttribute('aria-label', 'Colour ' + c); b.addEventListener('click', function(){ A.closePop(); T.setProject(p.id, { color: c }); }); sw.appendChild(b); });
      m.appendChild(sw);
      var l = document.createElement('div'); l.className = 'line'; m.appendChild(l);
      var n = T.tasks(p.id).length;
      A.danger(m, n ? 'Delete board and its ' + n + (n === 1 ? ' task' : ' tasks') : 'Delete board', function(){ T.removeProject(p.id); A.toast('Deleted “' + p.name + '”'); });
    });
  }
  body.addEventListener('click', function(e){
    if(state.view !== 'home') return;
    var t = e.target, x;
    if((x = t.closest('[data-bmore]'))){ e.preventDefault(); more(x, T.project(x.getAttribute('data-bmore'))); return; }
    if((x = t.closest('[data-board]'))){      // into a board: it opens out of its own tile
      e.preventDefault(); var id = x.getAttribute('data-board');
      A.$$('.bd-thumb', body).forEach(function(el){ el.style.viewTransitionName = el === x ? 'stage' : ''; });
      A.go(A.lastView(id), id); return;
    }
    if((x = t.closest('[data-do]'))){ var what = x.getAttribute('data-do'); if(what === 'newboard') startNaming('new'); else if(what === 'look') A.look(); else if(what === 'news') A.news(x); }
  });
})();
