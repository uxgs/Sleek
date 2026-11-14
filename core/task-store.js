/* Sleek Tasks' storage: every project and task lives in this browser (IndexedDB), and saves as you go.

   Database "sleek-tasks" (its own, beside the decks' "sleek-app" and the pages' "sleek-docs"):
     projects  { id, name, color, statuses: [{ id, name, color, done }], board: { show, dense, group, shut },
                 fields: [{ id, name, type, options }], grid: { sort }, created, updated }
                                                  a status marked done is where ticked tasks go; fields
                                                  are the project's own (see "your own fields" below)
     tasks     { id, project, title, status, due, who, tags: [], subs: [{ id, t, done }], notes, order,
                 was, rep, cover, vals, created, updated, doneAt }
                                                  due is "YYYY-MM-DD" or ""; who is a person's name or "";
                                                  notes is a Sleek Docs document (JSON) or null; order
                                                  places it in its column; was is the status to go back
                                                  to when it is unticked; rep says how it repeats; cover
                                                  is its picture or clip { ref, video, name }; vals holds
                                                  its values for the project's own fields
     meta      { id: 'people', list: [{ name, color }] }

   Everything is read into memory once (ready()), so the app draws straight from it; a change is made
   there first and written behind it. Each change is also announced: to this page's own listeners
   (on()), and, once it is written, to every other open tab of any Sleek app (a BroadcastChannel),
   which reads the database again and tells its listeners. That announcement is what keeps a task
   shown in a Docs page (doc/blocks-tasks.js) in step with its board. */
(function(){
  var DB_NAME = 'sleek-tasks', VERSION = 1;
  var db = null, opening = null, loaded = null, cache = { projects: [], tasks: [], people: [] }, subs = [], chan = null;
  var STATUSES = [{ id: 'todo', name: 'To do', color: '#8E8E93', done: false }, { id: 'doing', name: 'Doing', color: '#F0A52D', done: false }, { id: 'done', name: 'Done', color: '#12A36A', done: true }];
  var COLORS = ['#12A36A', '#0A84FF', '#7C5CFF', '#F0642D', '#E0457B', '#C2A21E', '#5B6470'];

  function open(){
    if(db) return Promise.resolve(db);
    if(opening) return opening;
    opening = new Promise(function(resolve, reject){
      var r;
      try { r = indexedDB.open(DB_NAME, VERSION); } catch(e){ reject(e); return; }
      r.onupgradeneeded = function(){ var d = r.result; ['projects', 'tasks', 'meta'].forEach(function(n){ if(!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = function(){ db = r.result; db.onversionchange = function(){ db.close(); db = null; opening = null; }; resolve(db); };
      r.onerror = function(){ reject(r.error); };
    });
    return opening;
  }
  function tx(stores, mode, fn){
    return open().then(function(d){
      return new Promise(function(resolve, reject){
        var t = d.transaction(stores, mode), out = fn(t);
        t.oncomplete = function(){ resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = t.onabort = function(){ reject(t.error); };
      });
    });
  }
  function all(store){ return tx(store, 'readonly', function(t){ return t.objectStore(store).getAll(); }).then(function(a){ return a || []; }); }
  function uid(){ return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
  function now(){ return Date.now(); }
  function copy(o){ return JSON.parse(JSON.stringify(o)); }
  // every write in flight; other tabs are told of a change only once the writes before it are in, so they never read too early
  var pending = Promise.resolve();
  function wrote(p){ pending = Promise.all([pending, p.catch(function(){})]); return p; }
  function put(store, rec){ wrote(tx(store, 'readwrite', function(t){ t.objectStore(store).put(copy(rec)); })).catch(function(e){ console.error('Sleek Tasks could not save', e); }); }
  function del(store, id){ wrote(tx(store, 'readwrite', function(t){ t.objectStore(store).delete(id); })).catch(function(e){ console.error(e); }); }

  // ---------- reading it all in, and saying when something changed ----------
  function read(){
    return Promise.all([all('projects'), all('tasks'), all('meta')]).then(function(r){
      cache.projects = r[0].sort(function(a, b){ return a.created - b.created; }); cache.tasks = r[1];
      var p = r[2].filter(function(m){ return m.id === 'people'; })[0]; cache.people = p ? p.list : [];
    });
  }
  function ready(){ if(!loaded) loaded = read(); return loaded; }
  function tell(what, here){
    subs.slice().forEach(function(fn){ try { fn(what); } catch(e){ console.error(e); } });
    if(here && chan) pending.then(function(){ try { chan.postMessage(what); } catch(e){} });
  }
  function changed(what){ tell(what, true); }
  try { chan = new BroadcastChannel('sleek-tasks'); chan.onmessage = function(e){ var what = e.data || {}; read().then(function(){ tell(Object.assign({ remote: true }, what), false); }); }; } catch(e){ chan = null; }
  function on(fn){ subs.push(fn); return function(){ subs = subs.filter(function(f){ return f !== fn; }); }; }

  // ---------- projects ----------
  function projects(){ return cache.projects; }
  function project(id){ return cache.projects.filter(function(p){ return p.id === id; })[0] || null; }
  function addProject(o){
    o = o || {};
    var p = { id: uid(), name: String(o.name || '').trim() || 'New project', color: o.color || COLORS[cache.projects.length % COLORS.length], statuses: copy(o.statuses || STATUSES),
              board: { show: { tags: true, subs: true, due: true, who: true }, dense: false, group: 'status', shut: {} }, created: now(), updated: now() };
    cache.projects.push(p); put('projects', p); changed({ kind: 'project', id: p.id }); return p;
  }
  function setProject(id, change){
    var p = project(id); if(!p) return null;
    Object.keys(change).forEach(function(k){ p[k] = change[k]; }); p.updated = now();
    put('projects', p); changed({ kind: 'project', id: id }); return p;
  }
  // deleting a project deletes its tasks
  function removeProject(id){
    var gone = cache.tasks.filter(function(t){ return t.project === id; });
    cache.tasks = cache.tasks.filter(function(t){ return t.project !== id; }); cache.projects = cache.projects.filter(function(p){ return p.id !== id; });
    wrote(tx(['projects', 'tasks'], 'readwrite', function(t){ t.objectStore('projects').delete(id); gone.forEach(function(g){ t.objectStore('tasks').delete(g.id); }); })).catch(function(e){ console.error(e); });
    changed({ kind: 'project', id: id, removed: true });
  }
  function firstOpen(p){ return (p.statuses.filter(function(s){ return !s.done; })[0] || p.statuses[0]).id; }
  function firstDone(p){ return (p.statuses.filter(function(s){ return s.done; })[0] || p.statuses[p.statuses.length - 1]).id; }
  // a column is deleted: its tasks move to the first column left
  function removeStatus(pid, sid){
    var p = project(pid); if(!p || p.statuses.length < 2) return null;
    p.statuses = p.statuses.filter(function(s){ return s.id !== sid; });
    var to = p.statuses[0].id;
    cache.tasks.forEach(function(t){ if(t.project === pid && t.status === sid){ t.status = to; t.updated = now(); put('tasks', t); } });
    p.updated = now(); put('projects', p); changed({ kind: 'project', id: pid }); return p;
  }

  // ---------- tasks ----------
  function tasks(pid){ return pid ? cache.tasks.filter(function(t){ return t.project === pid; }) : cache.tasks; }
  function task(id){ return cache.tasks.filter(function(t){ return t.id === id; })[0] || null; }
  function isDone(t){ var p = project(t.project), s = p && p.statuses.filter(function(x){ return x.id === t.status; })[0]; return !!(s && s.done); }
  function last(pid){ return tasks(pid).reduce(function(m, t){ return Math.max(m, t.order || 0); }, 0); }
  function addTask(o){
    var p = project(o.project); if(!p) return null;
    var title = String(o.title || '').trim(); if(!title) return null;
    var t = { id: uid(), project: p.id, title: title.slice(0, 300), status: o.status && p.statuses.some(function(s){ return s.id === o.status; }) ? o.status : firstOpen(p), due: o.due || '', who: o.who || '',
              tags: (o.tags || []).slice(0, 12), subs: [], notes: null, order: last(p.id) + 1, was: '', created: now(), updated: now(), doneAt: 0,
              rep: REPEATS.indexOf(o.rep) >= 0 ? o.rep : '', cover: o.cover || null, vals: {} };
    if(isDone(t)) t.doneAt = now();
    cache.tasks.push(t); put('tasks', t); changed({ kind: 'task', id: t.id, project: p.id, added: true }); return t;
  }
  function setTask(id, change, note){
    var t = task(id); if(!t) return null;
    var wasDone = isDone(t);
    Object.keys(change).forEach(function(k){ t[k] = change[k]; }); t.updated = now();
    var done = isDone(t); if(done && !wasDone) t.doneAt = now(); if(!done) t.doneAt = 0;
    put('tasks', t); changed(Object.assign({ kind: 'task', id: id, project: t.project }, note || {})); return t;
  }
  // ---------- tasks that repeat ----------
  // t.rep is '' or one of REPEATS. Ticking a repeating task does not finish it: its due date moves on
  // to the next time, its subtasks are unticked, and it stays where it is. (Dragging it to a done
  // column, or choosing that status, does finish it.)
  var REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
  function dayKey(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fromKey(k){ var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  // the days a repeating task falls on after `due`, one at a time: nth(1) is the next, nth(2) the one after
  function nth(due, rep, n){
    var b = fromKey(due), y = b.getFullYear(), m = b.getMonth(), day = b.getDate();
    if(rep === 'daily') return new Date(y, m, day + n);
    if(rep === 'weekly') return new Date(y, m, day + 7 * n);
    if(rep === 'weekdays'){ var d = new Date(y, m, day); while(n > 0){ d.setDate(d.getDate() + 1); if(d.getDay() !== 0 && d.getDay() !== 6) n--; } return d; }
    // a month or a year on, on the same day of the month, or the month's last day when it is shorter
    var mm = rep === 'yearly' ? m : m + n, yy = rep === 'yearly' ? y + n : y, last = new Date(yy, mm + 1, 0).getDate();
    return new Date(yy, mm, Math.min(day, last));
  }
  // the next day it is due: the first of those days that is after today
  function nextDue(due, rep){
    var t0 = new Date(); t0.setHours(0, 0, 0, 0); if(!due) due = dayKey(t0);
    for(var n = 1; n < 4000; n++){ var d = nth(due, rep, n); if(d > t0) return dayKey(d); }
    return due;
  }
  // the days it will fall on after its due date, up to and including `until` (a day key): for the calendar
  function repeatsUntil(t, until){
    var out = []; if(!t.rep || !t.due || REPEATS.indexOf(t.rep) < 0) return out;
    for(var n = 1; n < 400; n++){ var k = dayKey(nth(t.due, t.rep, n)); if(k > until) break; out.push(k); }
    return out;
  }
  // tick or untick: done goes to the project's done column; undone goes back where it came from
  function tick(id, on){
    var t = task(id), p = t && project(t.project); if(!t || !p) return null;
    if(on == null) on = !isDone(t);
    if(on === isDone(t)) return t;
    if(on && t.rep && REPEATS.indexOf(t.rep) >= 0){
      var next = nextDue(t.due, t.rep);
      return setTask(id, { due: next, lastDone: now(), subs: (t.subs || []).map(function(s){ return { id: s.id, t: s.t, done: false }; }) }, { repeated: next });
    }
    return on ? setTask(id, { was: t.status, status: firstDone(p) }) : setTask(id, { status: t.was && p.statuses.some(function(s){ return s.id === t.was && !s.done; }) ? t.was : firstOpen(p), was: '' });
  }
  function removeTask(id){
    var t = task(id); if(!t) return;
    cache.tasks = cache.tasks.filter(function(x){ return x.id !== id; }); del('tasks', id); changed({ kind: 'task', id: id, project: t.project, removed: true });
  }

  // A project as it stands: its columns, and in each its tasks in order (a done column: latest first).
  // For showing a project somewhere that can't read the tasks itself, such as a published deck
  // (features/tasks-layout.js). With ids, each task carries its id, for following it as it moves.
  function snapshot(pid, ids){
    var p = project(pid); if(!p) return null;
    var today = dayKey(new Date()), all = tasks(pid).slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); });
    return { n: p.name, c: p.color, at: now(), cols: p.statuses.map(function(s){
      var mine = all.filter(function(t){ return t.status === s.id; }); if(s.done) mine.sort(function(a, b){ return (b.doneAt || 0) - (a.doneAt || 0); });
      return { n: s.name, c: s.color, done: !!s.done, tasks: mine.map(function(t){
        var w = t.who ? person(t.who) : null, o = { t: t.title, done: !!s.done, due: t.due || '', late: !!t.due && !s.done && t.due < today, who: t.who || '', wc: w ? w.color : '' };
        if(ids) o.id = t.id; return o; }) };
    }) };
  }

  // ---------- your own fields ----------
  // A project's own fields (project.fields) are the extra columns of its grid; a task keeps its values
  // for them in task.vals, by field id:
  //   text 'words'   number 12.5   check true   select <option id>   date '2026-11-20'
  //   link 'https://…'   person 'Name'   file { ref: 'sleek-media:<key>', video: bool, name }
  // A dropdown's choices are field.options: [{ id, name, color }].
  var FIELD_TYPES = ['text', 'number', 'check', 'select', 'date', 'link', 'person', 'file'];
  function fields(pid){ var p = project(pid); return p && p.fields ? p.fields : []; }
  function field(pid, fid){ return fields(pid).filter(function(f){ return f.id === fid; })[0] || null; }
  function addField(pid, o){
    var p = project(pid); if(!p || fields(pid).length >= 30) return null;
    var type = FIELD_TYPES.indexOf(o && o.type) >= 0 ? o.type : 'text', f = { id: uid(), name: String((o && o.name) || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Field', type: type };
    if(type === 'select') f.options = ((o && o.options) || []).map(function(name, i){ return { id: uid(), name: String(name).slice(0, 40), color: COLORS[i % COLORS.length] }; });
    setProject(pid, { fields: fields(pid).concat([f]) }); return f;
  }
  function setField(pid, fid, change){
    if(!field(pid, fid)) return null;
    setProject(pid, { fields: fields(pid).map(function(f){ return f.id === fid ? Object.assign({}, f, change) : f; }) }); return field(pid, fid);
  }
  // a new choice for a dropdown; returns it
  function addOption(pid, fid, name){
    var f = field(pid, fid); name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40); if(!f || f.type !== 'select' || !name) return null;
    var have = (f.options || []).filter(function(o){ return o.name === name; })[0]; if(have) return have;
    var o = { id: uid(), name: name, color: COLORS[((f.options || []).length + 1) % COLORS.length] };
    setField(pid, fid, { options: (f.options || []).concat([o]) }); return o;
  }
  // deleting a field deletes what every task held for it
  function removeField(pid, fid){
    if(!field(pid, fid)) return;
    cache.tasks.forEach(function(t){ if(t.project === pid && t.vals && fid in t.vals){ delete t.vals[fid]; t.updated = now(); put('tasks', t); } });
    setProject(pid, { fields: fields(pid).filter(function(f){ return f.id !== fid; }) });
  }
  // set (or, with nothing, clear) a task's value for one of its project's fields
  function setVal(tid, fid, v){
    var t = task(tid); if(!t) return null;
    var vals = Object.assign({}, t.vals || {}); if(v == null || v === '' || v === false) delete vals[fid]; else vals[fid] = v;
    return setTask(tid, { vals: vals });
  }

  // ---------- people: names you type, each with a colour ----------
  function people(){ return cache.people; }
  function person(name){ return cache.people.filter(function(p){ return p.name === name; })[0] || null; }
  function addPerson(name){
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40); if(!name) return null;
    var have = person(name); if(have) return have;
    var p = { name: name, color: COLORS[(cache.people.length + 2) % COLORS.length] };
    cache.people.push(p); put('meta', { id: 'people', list: cache.people }); changed({ kind: 'people' }); return p;
  }

  // ---------- everything as one file: a copy to keep, or to move your tasks to another browser ----------
  var FORMAT = 'sleek-tasks';
  // every board, task and person, as text, with the pictures in notes and on cards inside it
  function exportAll(){
    return ready().then(function(){
      var S = window.SleekStore, all = { projects: copy(cache.projects), tasks: copy(cache.tasks), people: copy(cache.people) };
      return (S ? S.inline(all, false) : Promise.resolve(all)).then(function(o){
        return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), projects: o.projects, tasks: o.tasks, people: o.people });
      });
    });
  }
  function parseFile(text){
    var o = JSON.parse(text);
    if(!o || o.format !== FORMAT || !Array.isArray(o.projects) || !Array.isArray(o.tasks)) throw new Error('This is not a Sleek Tasks file.');
    if(o.version > 1) throw new Error('This file was made with a newer Sleek Tasks.');
    return o;
  }
  // Bring a file's boards and tasks in beside what is here. A board or a task that is already here (the very one,
  // by its id) is left as it is, and nothing here is changed or removed. Resolves with how many came in.
  function importAll(text){
    var o; try { o = parseFile(text); } catch(e){ return Promise.reject(e); }
    return ready().then(function(){
      var S = window.SleekStore, in0 = { projects: o.projects, tasks: o.tasks };
      return S ? S.dehydrate(in0) : in0;
    }).then(function(d){
      var okId = function(x){ return x && typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id); }, addP = [], addT = [];
      d.projects.forEach(function(p){
        if(!okId(p) || project(p.id) || !Array.isArray(p.statuses) || !p.statuses.length) return;
        p.name = String(p.name || 'Board').slice(0, 80); p.created = p.created || now(); cache.projects.push(p); addP.push(p);
      });
      d.tasks.forEach(function(t){
        var p = okId(t) && !task(t.id) ? project(t.project) : null; if(!p) return;
        t.title = String(t.title || '').slice(0, 300) || 'Task'; if(!p.statuses.some(function(x){ return x.id === t.status; })) t.status = firstOpen(p);
        t.tags = Array.isArray(t.tags) ? t.tags : []; t.subs = Array.isArray(t.subs) ? t.subs : []; t.vals = t.vals || {};
        cache.tasks.push(t); addT.push(t);
      });
      var who = 0; (o.people || []).forEach(function(p){ if(p && p.name && !person(p.name)){ cache.people.push({ name: String(p.name).slice(0, 40), color: p.color || COLORS[0] }); who++; } });
      if(addP.length || addT.length || who){
        wrote(tx(['projects', 'tasks', 'meta'], 'readwrite', function(x){
          addP.forEach(function(p){ x.objectStore('projects').put(copy(p)); }); addT.forEach(function(t){ x.objectStore('tasks').put(copy(t)); });
          x.objectStore('meta').put({ id: 'people', list: copy(cache.people) });
        })).catch(function(e){ console.error(e); });
        cache.projects.sort(function(a, b){ return a.created - b.created; });
        changed({ kind: 'project', imported: true });
      }
      return { boards: addP.length, tasks: addT.length };
    });
  }

  window.SleekTasks = {
    open: open, ready: ready, on: on, uid: uid, COLORS: COLORS, STATUSES: STATUSES, exportAll: exportAll, importAll: importAll, parseFile: parseFile,
    projects: projects, project: project, addProject: addProject, setProject: setProject, removeProject: removeProject, removeStatus: removeStatus, firstOpen: firstOpen, firstDone: firstDone,
    tasks: tasks, task: task, isDone: isDone, addTask: addTask, setTask: setTask, tick: tick, removeTask: removeTask,
    REPEATS: REPEATS, nextDue: nextDue, repeatsUntil: repeatsUntil, snapshot: snapshot,
    FIELD_TYPES: FIELD_TYPES, fields: fields, field: field, addField: addField, setField: setField, addOption: addOption, removeField: removeField, setVal: setVal,
    people: people, person: person, addPerson: addPerson
  };
})();
