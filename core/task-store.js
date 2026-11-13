/* Sleek Tasks' storage: every project and task lives in this browser (IndexedDB), and saves as you go.

   Database "sleek-tasks" (its own, beside the decks' "sleek-app" and the pages' "sleek-docs"):
     projects  { id, name, color, statuses: [{ id, name, color, done }], board: { show, dense, group, shut },
                 created, updated }               a status marked done is where ticked tasks go
     tasks     { id, project, title, status, due, who, tags: [], subs: [{ id, t, done }], notes, order,
                 was, created, updated, doneAt }  due is "YYYY-MM-DD" or ""; who is a person's name or "";
                                                  notes is a Sleek Docs document (JSON) or null; order
                                                  places it in its column; was is the status to go back
                                                  to when it is unticked
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
              tags: (o.tags || []).slice(0, 12), subs: [], notes: null, order: last(p.id) + 1, was: '', created: now(), updated: now(), doneAt: 0 };
    if(isDone(t)) t.doneAt = now();
    cache.tasks.push(t); put('tasks', t); changed({ kind: 'task', id: t.id, project: p.id, added: true }); return t;
  }
  function setTask(id, change){
    var t = task(id); if(!t) return null;
    var wasDone = isDone(t);
    Object.keys(change).forEach(function(k){ t[k] = change[k]; }); t.updated = now();
    var done = isDone(t); if(done && !wasDone) t.doneAt = now(); if(!done) t.doneAt = 0;
    put('tasks', t); changed({ kind: 'task', id: id, project: t.project }); return t;
  }
  // tick or untick: done goes to the project's done column; undone goes back where it came from
  function tick(id, on){
    var t = task(id), p = t && project(t.project); if(!t || !p) return null;
    if(on == null) on = !isDone(t);
    if(on === isDone(t)) return t;
    return on ? setTask(id, { was: t.status, status: firstDone(p) }) : setTask(id, { status: t.was && p.statuses.some(function(s){ return s.id === t.was && !s.done; }) ? t.was : firstOpen(p), was: '' });
  }
  function removeTask(id){
    var t = task(id); if(!t) return;
    cache.tasks = cache.tasks.filter(function(x){ return x.id !== id; }); del('tasks', id); changed({ kind: 'task', id: id, project: t.project, removed: true });
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

  window.SleekTasks = {
    open: open, ready: ready, on: on, uid: uid, COLORS: COLORS, STATUSES: STATUSES,
    projects: projects, project: project, addProject: addProject, setProject: setProject, removeProject: removeProject, removeStatus: removeStatus, firstOpen: firstOpen, firstDone: firstDone,
    tasks: tasks, task: task, isDone: isDone, addTask: addTask, setTask: setTask, tick: tick, removeTask: removeTask,
    people: people, person: person, addPerson: addPerson
  };
})();
