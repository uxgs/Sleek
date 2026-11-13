/* Sleek Tasks' calendar: a project's tasks on the days they are due, a month at a time.

   Drag a task to another day to change when it is due (mouse, pen or finger: a finger holds a moment
   first, so swiping still scrolls). Tasks with no date wait in a row under the month: drag one onto
   a day to give it one, or a task there to take its date away. Press a day's ＋ to add a task due
   then. A repeating task also shows, faintly, on the days it will come round again (a daily one, on the next). The week starts
   on the day this browser's language says it does. */
(function(){
  var T = window.SleekTasks, A = window.SleekTaskApp; if(!T || !A) return;
  var esc = A.esc, body = document.getElementById('body'), state = A.state, key = A.key, from = A.from;
  var first = 1;      // the week's first day: 0 Sunday, 1 Monday…
  try { var info = new Intl.Locale(navigator.language); info = info.getWeekInfo ? info.getWeekInfo() : info.weekInfo; if(info && info.firstDay) first = info.firstDay % 7; } catch(e){}
  function month(){ if(!state.month){ var d = new Date(); state.month = new Date(d.getFullYear(), d.getMonth(), 1); } return state.month; }
  function chip(t, p, echo){
    var c = (t.tags || [])[0], done = T.isDone(t);
    return '<div class="chip' + (done ? ' done-t' : '') + (echo ? ' echo' : '') + (!echo && A.late(t) ? ' late' : '') + (state.landed === t.id && !echo ? ' landed' : '') + '" role="button" tabindex="' + (echo ? '-1' : '0') + '" data-task="' + t.id + '"' + (echo ? ' title="Comes round again on this day"' : ' data-flip="k-' + t.id + '"') +
      ' style="--c:' + (c ? A.tagColor(c) : p.color) + '">' + (t.rep ? '<span class="rep" aria-hidden="true">↻</span>' : '') + '<span>' + esc(t.title) + '</span></div>';
  }
  A.views.cal = function(p){
    if(!p) return '';
    var m = month(), y = m.getFullYear(), mo = m.getMonth(), lead = (new Date(y, mo, 1).getDay() - first + 7) % 7, days = new Date(y, mo + 1, 0).getDate(), cells = Math.ceil((lead + days) / 7) * 7;
    var all = T.tasks(p.id).slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); }), by = {}, echo = {}, last = key(new Date(y, mo, 1 - lead + cells - 1)), today = A.dayKey(0);
    all.forEach(function(t){
      if(t.due) (by[t.due] = by[t.due] || []).push(t);
      // where it comes round again: every time for a weekly, monthly or yearly task; only the next time for a daily one, which would fill the month
      if(!T.isDone(t)) T.repeatsUntil(t, last).slice(0, t.rep === 'daily' || t.rep === 'weekdays' ? 1 : 99).forEach(function(k){ (echo[k] = echo[k] || []).push(t); });
    });
    var h = '<div class="calnav"><button type="button" class="gbtn" data-month="-1" aria-label="The month before">‹</button><b>' + m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</b>' +
      '<button type="button" class="gbtn" data-month="1" aria-label="The month after">›</button><button type="button" class="gbtn" data-month="0">Today</button></div><div class="calw"><div class="cal" role="grid" aria-label="' + esc(m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) + '">';
    for(var w = 0; w < 7; w++) h += '<div class="dow">' + new Date(2024, 8, 1 + first + w).toLocaleDateString(undefined, { weekday: 'short' }) + '</div>';      // 1 September 2024 was a Sunday
    for(var i = 0; i < cells; i++){
      var d = new Date(y, mo, 1 - lead + i), k = key(d), adding = state.calAdd === k;
      h += '<div class="day' + (d.getMonth() !== mo ? ' out' : '') + (k === today ? ' now' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' rest' : '') + '" data-day="' + k + '"><div class="dn"><span>' + d.getDate() + '</span>' +
        '<button type="button" class="dayadd" data-dayadd="' + k + '" aria-label="Add a task on ' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + '">＋</button></div>' +
        (by[k] || []).map(function(t){ return chip(t, p); }).join('') + (echo[k] || []).map(function(t){ return chip(t, p, true); }).join('') +
        (adding ? '<input class="dayin" data-add="day:' + k + '" placeholder="A task" aria-label="A task for this day" maxlength="300">' : '') + '</div>';
    }
    var loose = all.filter(function(t){ return !t.due && !T.isDone(t); });
    return h + '</div></div><div class="nodate" data-day=""><h4>No date <em>' + (loose.length || '') + '</em></h4><div class="loose">' + (loose.map(function(t){ return chip(t, p); }).join('') || '<span class="hint">Drag a task here to take its date away.</span>') + '</div></div>';
  };

  body.addEventListener('click', function(e){
    var x = e.target.closest('[data-month]');
    if(x){ var n = +x.getAttribute('data-month'), m = month(), now = new Date(); state.month = n ? new Date(m.getFullYear(), m.getMonth() + n, 1) : new Date(now.getFullYear(), now.getMonth(), 1); state.calAdd = null; A.paint(); return; }
    x = e.target.closest('[data-dayadd]');
    if(x){ state.calAdd = x.getAttribute('data-dayadd'); A.paint(); var inp = body.querySelector('.dayin'); if(inp) inp.focus(); }
  });
  // the day's add box goes when you leave it empty
  body.addEventListener('focusout', function(e){
    if(!e.target.classList || !e.target.classList.contains('dayin')) return;
    setTimeout(function(){ var a = document.activeElement; if(state.calAdd && !(a && a.classList && a.classList.contains('dayin')) && !d){ state.calAdd = null; if(state.view === 'cal') A.paint(); } }, 160);
  });
  body.addEventListener('keydown', function(e){ if(e.key === 'Escape' && e.target.classList && e.target.classList.contains('dayin')){ e.stopPropagation(); e.target.value = ''; e.target.blur(); } });

  // ---------- dragging a task to another day ----------
  var d = null, pending = null, dragged = 0;
  var before = A.dragging; A.dragging = function(){ return !!d || (before ? before() : false); };
  function begin(e){
    var p = pending; pending = null; if(!p || !p.el.isConnected) return;
    var r = p.el.getBoundingClientRect(), ghost = p.el.cloneNode(true);
    ghost.classList.add('ghost'); ghost.removeAttribute('data-flip'); ghost.style.width = r.width + 'px'; ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost); document.body.classList.add('dragging'); p.el.classList.add('lifted');
    d = { id: p.id, el: p.el, ghost: ghost, dx: p.x - r.left, dy: p.y - r.top, day: null, touch: p.touch }; A.closePop();
    move(e || { clientX: p.x, clientY: p.y });
  }
  function move(e){
    if(!d) return;
    d.ghost.style.left = (e.clientX - d.dx) + 'px'; d.ghost.style.top = (e.clientY - d.dy) + 'px';
    var el = document.elementFromPoint(e.clientX, e.clientY), day = el && el.closest ? el.closest('[data-day]') : null;
    Array.prototype.forEach.call(body.querySelectorAll('[data-day].over'), function(c){ if(c !== day) c.classList.remove('over'); });
    d.day = day; if(day) day.classList.add('over');
    var b = body.getBoundingClientRect(); if(e.clientY > b.bottom - 50) body.scrollTop += 14; else if(e.clientY < b.top + 50) body.scrollTop -= 14;
    if(e.clientX > b.right - 40) body.scrollLeft += 14; else if(e.clientX < b.left + 40) body.scrollLeft -= 14;
  }
  function drop(cancel){
    if(!d) return; var x = d; d = null; dragged = Date.now();
    x.ghost.remove(); x.el.classList.remove('lifted'); document.body.classList.remove('dragging');
    Array.prototype.forEach.call(body.querySelectorAll('[data-day].over'), function(c){ c.classList.remove('over'); });
    var t = T.task(x.id), k = x.day ? x.day.getAttribute('data-day') : null;
    if(cancel || k == null || !t || (t.due || '') === k){ A.paint(); return; }
    state.landed = t.id; T.setTask(t.id, { due: k });
  }
  body.addEventListener('pointerdown', function(e){
    var el = e.target.closest('.chip'); if(!el || e.button || el.classList.contains('echo') || !el.closest('.cal, .nodate')) return;
    pending = { id: el.getAttribute('data-task'), el: el, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', timer: 0 };
    if(pending.touch) pending.timer = setTimeout(function(){ if(pending){ if(navigator.vibrate) try { navigator.vibrate(8); } catch(err){} begin(); } }, 240);
  });
  document.addEventListener('pointermove', function(e){
    if(d){ move(e); return; }
    if(!pending) return;
    var far = Math.abs(e.clientX - pending.x) + Math.abs(e.clientY - pending.y);
    if(pending.touch){ if(far > 10){ clearTimeout(pending.timer); pending = null; } } else if(far > 5) begin(e);
  });
  document.addEventListener('pointerup', function(){ if(pending){ clearTimeout(pending.timer); pending = null; } drop(false); });
  document.addEventListener('pointercancel', function(){ if(pending){ clearTimeout(pending.timer); pending = null; } if(d && d.touch) return; drop(true); });
  document.addEventListener('touchmove', function(e){ if(d){ e.preventDefault(); var t = e.touches[0]; if(t) move(t); } }, { passive: false });
  document.addEventListener('touchend', function(){ if(d) drop(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && d){ e.stopPropagation(); drop(true); } }, true);
  window.addEventListener('blur', function(){ if(d) drop(true); });
  // the press that ends a drag is not a press on the task
  body.addEventListener('click', function(e){ if(Date.now() - dragged < 350){ e.stopPropagation(); e.preventDefault(); } }, true);
})();
