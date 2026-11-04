/* Press clippings: a bullet with data-press="<id>" opens a newspaper clipping over its slide.
   Built here, not in the markup, so it takes no text ids and later slides keep their saved edits.
   It lives inside the slide (slide coordinates), so the presenter's preview replays the clicks. */
(function(){
  var D = window.Deck; if(!D) return;

  var PRESS = {
    'sample': {
      outlet: 'The Daily Ledger',
      section: 'Health',
      kicker: 'Apps · Fitness',
      // [text, highlighted?]: the highlighter sweeps over the marked phrases once the clipping lands,
      // the headline's first, then the body's
      head: [
        ['Pace is '],
        ['the first workout app that fits around your life', true],
        ['.']
      ],
      body: [
        ['“I trained more in a month than in the whole of last year,” said Sam Okafor. “It '],
        ['knew when to push me and when to back off.', true],
        [' Fifteen minutes on a busy day still counted, and the plan never made me feel behind.”']
      ],
      by: 'Sam Okafor',
      role: 'Health editor'
    }
  };

  var cur = null;   // { el, src }

  // torn top and bottom, scissor-cut sides; seeded so the audience and the preview tear it the same
  function torn(){
    var seed = 7, rnd = function(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var top = [], bot = [], n = 46, k;
    for(k = 0; k <= n; k++) top.push((k / n * 100).toFixed(2) + '% ' + (rnd() * 1.6).toFixed(2) + '%');
    for(k = n; k >= 0; k--) bot.push((k / n * 100).toFixed(2) + '% ' + (100 - rnd() * 1.6).toFixed(2) + '%');
    return 'polygon(' + top.concat(bot).join(',') + ')';
  }

  function build(p){
    var el = document.createElement('div');
    el.className = 'press'; el.lang = 'en';
    var marked = function(parts){ return parts.map(function(b){ return b[1] ? '<mark class="pr-hl">' + b[0] + '</mark>' : b[0]; }).join(''); };
    var body = marked(p.body);
    el.innerHTML =
      '<div class="pr-dim"></div>' +
      '<article class="pr-clip" role="dialog" aria-label="' + p.outlet + ' article"><div class="pr-paper" style="clip-path:' + torn() + '">' +
        '<header class="pr-mast">' +
          '<span class="pr-sec">' + p.section + '</span>' +
          '<span class="pr-name">' + p.outlet + '</span>' +
          '<span class="pr-sec">' + p.kicker + '</span>' +
        '</header>' +
        '<h3 class="pr-head">“' + marked(p.head) + '”</h3>' +
        '<div class="pr-cols"><p class="pr-body">' + body + '</p>' +
          '<aside class="pr-by"><span class="pr-by-n">' + p.by + '</span><span class="pr-by-r">' + p.role + '</span></aside>' +
        '</div>' +
      '</div></article>' +
      '';
    return el;
  }

  function open(src){
    var p = PRESS[src.getAttribute('data-press')], s = src.closest('.slide'); if(!p || !s) return;
    close(true);
    var el = build(p); s.appendChild(el);
    cur = { el: el, src: src };
    D.hideZoom && D.hideZoom();
    D.modal = true;
    void el.offsetWidth; el.classList.add('in');
  }
  function close(instant){
    if(!cur) return;
    var el = cur.el; cur = null;
    D.modal = false;
    if(instant){ el.remove(); return; }
    el.classList.remove('in'); el.classList.add('out');
    setTimeout(function(){ el.remove(); }, 420);
  }

  document.addEventListener('click', function(e){
    if(cur){
      if(e.target.closest && e.target.closest('.press')){ e.stopPropagation(); e.preventDefault(); close(); }
      return;
    }
    if(D.isEditing()) return;
    var t = e.target.closest && e.target.closest('#stage .slide.active [data-press]');
    if(!t) return;
    e.stopPropagation(); e.preventDefault();
    open(t);
  }, true);
  document.addEventListener('keydown', function(e){
    if(cur && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  // over the bullet, clicks go to it rather than the edge zones that change slides
  document.addEventListener('mousemove', function(e){
    var hit = !D.isEditing() && document.elementsFromPoint(e.clientX, e.clientY).some(function(el){ return el.matches && el.matches('#stage .slide.active [data-press]'); });
    document.body.classList.toggle('over-press', hit);
  });
  D.onShow.push(function(){ close(true); });
  D.onReset.push(function(){ close(); });
})();
