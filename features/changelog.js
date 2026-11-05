/* The start screen's version tag and What's new (data/changelog.js): one entry per day, the
   latest few shown, the rest a click away. */
(function(){
  var C = window.SLEEK_CHANGES; if(!C || !C.length) return;
  var SHOWN = 3, latest = C[0];
  var tag = document.getElementById('ver'), list = document.getElementById('news-list'), more = document.getElementById('news-more');
  if(tag){ tag.textContent = 'v' + latest.v; tag.title = 'Version ' + latest.v + ': what’s new'; tag.hidden = false; }
  var sec = document.getElementById('whats-new'); if(!sec || !list) return;
  document.getElementById('news-ver').textContent = 'Version ' + latest.v;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function day(d){ var p = String(d || '').split('-'); return p.length === 3 ? (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0] : ''; }
  function el(tagName, cls, text){ var e = document.createElement(tagName); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }

  C.forEach(function(c, k){
    var li = el('li', 'news-item' + (k === 0 ? ' latest' : '')); if(k >= SHOWN) li.hidden = true;
    li.style.setProperty('--i', Math.min(k, SHOWN));
    var side = el('div', 'news-side');
    side.appendChild(el('span', 'news-v', c.v));
    var body = el('div', 'news-body');
    var h = el('h3', 'news-title'), t = el('time', null, day(c.date) || c.title || ''); if(c.date) t.dateTime = c.date;
    h.appendChild(t); body.appendChild(h);
    var ul = el('ul', 'news-points'); (c.items || []).forEach(function(s){ ul.appendChild(el('li', null, s)); }); body.appendChild(ul);
    li.appendChild(side); li.appendChild(body); list.appendChild(li);
  });
  sec.hidden = false;

  if(more && C.length > SHOWN){
    more.hidden = false;
    more.textContent = 'Show earlier updates';
    more.onclick = function(){
      var open = more.getAttribute('aria-expanded') !== 'true';
      Array.prototype.forEach.call(list.children, function(li, k){ if(k >= SHOWN) li.hidden = !open; });
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer' : 'Show earlier updates';
      if(!open) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
  }
  // the version tag takes you to the notes, opened up to the latest
  if(tag) tag.addEventListener('click', function(e){ e.preventDefault(); sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
})();
