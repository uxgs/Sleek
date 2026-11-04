/* New deck setup: a short first-run walkthrough on the start screen.

   Steps: name the deck, light or dark, backdrop, accent, font, then a summary. Every step can be
   skipped, and every choice paints the whole page at once (through DeckTheme.paint's attributes)
   with a live title slide beside it. Finishing makes a new deck in this browser (core/store.js)
   with that look, the names on its title slide and a slide of bullets, and opens it.

   Opens from the start screen's "New deck" button, the N key, or index.html#setup. */
(function(){
  var DT = window.DeckTheme; if(!DT) return;
  var root = document.documentElement;
  var SANS = ', -apple-system, BlinkMacSystemFont, system-ui, sans-serif', GF = 'https://fonts.googleapis.com/css2?';

  // the same choices as the deck's Theme menu
  var ACCENTS = [
    { c: '#0A84FF', n: 'Blue' }, { c: '#9A7CF0', n: 'Violet' }, { c: '#FF6A3D', n: 'Coral' }, { c: '#2FB8A0', n: 'Teal' },
    { c: '#C9A227', n: 'Gold' }, { c: '#E2558F', n: 'Rose' }
  ];
  var FONTS = [
    { v: 'inter', n: 'Inter', note: 'Clean and neutral', d: '"Inter"' + SANS, b: '"Inter"' + SANS, href: '' },
    { v: 'geist', n: 'Geist', note: 'Crisp and technical', d: '"Geist"' + SANS, b: '"Geist"' + SANS, href: GF + 'family=Geist:wght@300;400;500;600;700&display=swap' },
    { v: 'manrope', n: 'Manrope', note: 'Soft and friendly', d: '"Manrope"' + SANS, b: '"Manrope"' + SANS, href: GF + 'family=Manrope:wght@300;400;500;600;700&display=swap' },
    { v: 'grotesk', n: 'Grotesk', note: 'Quirky headlines', d: '"Space Grotesk"' + SANS, b: '"Inter"' + SANS, href: GF + 'family=Space+Grotesk:wght@400;500;600;700&display=swap' },
    { v: 'sora', n: 'Sora', note: 'Wide and modern', d: '"Sora"' + SANS, b: '"Sora"' + SANS, href: GF + 'family=Sora:wght@300;400;500;600;700&display=swap' },
    { v: 'editorial', n: 'Editorial', note: 'Serif headlines', d: '"Instrument Serif", Georgia, "Times New Roman", serif', b: '"Inter"' + SANS, href: GF + 'family=Instrument+Serif:ital@0;1&display=swap' }
  ];
  var GLOWS = [{ v: 'aurora', n: 'Aurora' }, { v: 'horizon', n: 'Horizon' }, { v: 'corners', n: 'Corners' }, { v: 'spotlight', n: 'Spotlight' }, { v: 'none', n: 'None' }];
  var GLOW_COLORS = [
    { v: 'dusk', n: 'Dusk', c: 'linear-gradient(135deg,#7E9CFF 20%,#FF8EE0 80%)' }, { v: 'ember', n: 'Ember', c: 'linear-gradient(135deg,#FFB270 20%,#FF7092 80%)' },
    { v: 'ocean', n: 'Ocean', c: 'linear-gradient(135deg,#6ECCFF 20%,#7C8CFF 80%)' }, { v: 'verdant', n: 'Verdant', c: 'linear-gradient(135deg,#76E6BC 20%,#7CCCFF 80%)' },
    { v: 'gold', n: 'Gold', c: 'linear-gradient(135deg,#FFD678 20%,#FF9E76 80%)' }, { v: 'accent', n: 'From accent', c: 'conic-gradient(from 210deg, var(--accent), color-mix(in oklab, var(--accent) 50%, #ff8ad8), var(--accent))' }
  ];
  var FX = [{ v: 'none', n: 'None' }, { v: 'smoke', n: 'Smoke' }, { v: 'grid', n: 'Pulse grid' }];
  // the title slide's text, by the deck's text ids (document order on the first slide)
  var TITLE_IDS = { overline: 't0', title: 't1', lead: 't2' };

  var STEPS = ['name', 'mode', 'background', 'accent', 'font', 'done'];
  var el = null, step = 0, pick = null, before = null, prevFocus = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fontOf(v){ return FONTS.filter(function(f){ return f.v === v; })[0] || FONTS[0]; }
  function nameOf(list, v, key){ var o = list.filter(function(x){ return (x.v || x[key]) === v; })[0]; return o ? o.n : v; }

  // ---------- the theme on the page, live (nothing saved until Finish) ----------
  function paint(){
    if(pick.mode === 'light') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    root.style.setProperty('--accent', pick.accent);
    root.setAttribute('data-glow', pick.glow); root.setAttribute('data-glow-color', pick.glowColor);
    if(pick.motion) root.setAttribute('data-glow-motion', 'on'); else root.removeAttribute('data-glow-motion');
    root.setAttribute('data-glow-fx', pick.fx);
    var f = fontOf(pick.font), sheet = document.getElementById('font-sheet');
    root.setAttribute('data-font', f.v);
    root.style.setProperty('--slide-display', f.d); root.style.setProperty('--slide-body', f.b);
    if(f.href){ if(!sheet){ sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.id = 'font-sheet'; document.head.appendChild(sheet); } if(sheet.getAttribute('href') !== f.href) sheet.href = f.href; }
    else if(sheet) sheet.remove();
    paintSlide();
  }
  function paintSlide(bump){
    if(!el) return;
    var s = el.querySelector('.su-slide');
    s.querySelector('.su-ov').innerHTML = esc(pick.author || 'Your name') + '<i>·</i>' + esc(pick.role || 'Your role');
    s.querySelector('.su-t').textContent = pick.title || 'Untitled deck';
    var lead = pick.lead || 'One line on what this deck is about.', w = lead.split(' ');
    // the last two words take the highlighter, as a marked phrase would on a slide
    s.querySelector('.su-l').innerHTML = w.length > 2 ? esc(w.slice(0, -2).join(' ')) + ' <mark data-tag="Highlight">' + esc(w.slice(-2).join(' ')) + '</mark>' : esc(lead);
    if(bump){ s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
  }
  // samples of every font's "Aa", loaded once when the font step opens
  var samples = false;
  function loadSamples(){
    if(samples) return; samples = true;
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = GF + 'family=Geist:wght@600&family=Manrope:wght@600&family=Space+Grotesk:wght@600&family=Sora:wght@600&family=Instrument+Serif&text=Aa&display=swap';
    document.head.appendChild(l);
  }

  // ---------- the steps ----------
  function label(id){ return 'Step ' + (STEPS.indexOf(id) + 1); }
  function stepHtml(id){
    var i = 0;
    function opt(attr, v, pressed, inner){ return '<button type="button" class="su-opt" style="--i:' + (i++) + '" ' + attr + '="' + esc(v) + '" aria-pressed="' + pressed + '">' + inner + '</button>'; }
    if(id === 'name') return '' +
      '<div class="su-k">New deck · ' + label(id) + '</div><h2 class="su-h">What is it called?</h2>' +
      '<p class="su-p">This goes on your title slide. You can change any of it later, right on the slide.</p>' +
      '<div class="su-fields">' +
        '<label class="su-field"><span>Deck title</span><input data-f="title" maxlength="80" placeholder="Untitled deck" value="' + esc(pick.title) + '"></label>' +
        '<label class="su-field"><span>One line about it</span><input data-f="lead" maxlength="140" placeholder="One line on what this deck is about." value="' + esc(pick.lead) + '"></label>' +
        '<div class="su-row2">' +
          '<label class="su-field"><span>Your name</span><input data-f="author" maxlength="60" placeholder="Your name" value="' + esc(pick.author) + '"></label>' +
          '<label class="su-field"><span>Your role</span><input data-f="role" maxlength="60" placeholder="Your role" value="' + esc(pick.role) + '"></label>' +
        '</div></div>';
    if(id === 'mode') return '' +
      '<div class="su-k">' + label(id) + '</div><h2 class="su-h">Light or dark?</h2><p class="su-p">Dark rooms and big screens love dark. Bright rooms and printouts suit light.</p>' +
      '<div class="su-opts" style="--cols:2">' +
        opt('data-mode', 'dark', pick.mode === 'dark', '<span class="su-mode" data-m="dark"><b></b><b></b><b></b></span>Dark') +
        opt('data-mode', 'light', pick.mode === 'light', '<span class="su-mode" data-m="light"><b></b><b></b><b></b></span>Light') +
      '</div>';
    if(id === 'accent') return '' +
      '<div class="su-k">' + label(id) + '</div><h2 class="su-h">Pick an accent.</h2><p class="su-p">Your slides\' highlight color: the small labels, the underline under headlines, highlighted words and buttons. They glow in the preview while you choose.</p>' +
      '<div class="su-swatches">' + ACCENTS.map(function(a, k){
        return '<button type="button" class="su-sw" style="--c:' + a.c + ';--i:' + k + '" data-accent="' + a.c + '" title="' + a.n + '" aria-label="' + a.n + '" aria-pressed="' + (pick.accent.toUpperCase() === a.c) + '"></button>';
      }).join('') +
      '<label class="su-sw custom" style="--i:' + ACCENTS.length + '" title="Any color"><input type="color" data-custom value="' + esc(pick.accent) + '" aria-label="Any color"></label></div>' +
      '<div class="su-sw-name" data-accent-name></div>';
    if(id === 'font') return '' +
      '<div class="su-k">' + label(id) + '</div><h2 class="su-h">Choose a typeface.</h2><p class="su-p">For headlines and body copy on your slides. The deck\'s controls stay as they are.</p>' +
      '<div class="su-opts" style="--cols:3">' + FONTS.map(function(f){
        return opt('data-font', f.v, pick.font === f.v, '<span class="su-aa" style="font-family:' + esc(f.d) + '">Aa</span>' + f.n + '<small>' + f.note + '</small>');
      }).join('') + '</div>';
    if(id === 'background') return '' +
      '<div class="su-k">' + label(id) + '</div><h2 class="su-h">Set the backdrop.</h2><p class="su-p">A soft gradient behind every slide. Pick a shape, then its colors.</p>' +
      '<div class="su-opts" style="--cols:3">' + GLOWS.map(function(g){
        return opt('data-g', g.v, pick.glow === g.v, '<span class="su-gprev glow" data-glow="' + g.v + '"></span>' + g.n);
      }).join('') + '</div>' +
      '<div class="su-sub">Colors</div><div class="su-colors">' + GLOW_COLORS.map(function(c, k){
        return '<button type="button" class="su-gc" style="--c:' + c.c + ';--i:' + k + '" data-gc="' + c.v + '" title="' + c.n + '" aria-label="' + c.n + '" aria-pressed="' + (pick.glowColor === c.v) + '"></button>';
      }).join('') + '</div>' +
      '<div class="su-sub">Animation</div><div class="su-line" style="margin-top:0"><div class="su-seg" role="radiogroup" aria-label="Animation">' + FX.map(function(f){
        return '<button type="button" role="radio" data-fx-v="' + f.v + '" aria-checked="' + (pick.fx === f.v) + '">' + f.n + '</button>';
      }).join('') + '</div>' +
      '<label style="display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;font-weight:600">Motion <button type="button" class="su-switch" role="switch" data-motion aria-checked="' + pick.motion + '" aria-label="Motion"><span></span></button></label></div>';
    // done
    var ac = ACCENTS.filter(function(x){ return x.c === pick.accent.toUpperCase(); })[0];
    var rows = [
      ['Title', pick.title || 'Untitled deck', 'name'], ['By', [pick.author, pick.role].filter(Boolean).join(' · ') || '—', 'name'],
      ['Mode', pick.mode === 'light' ? 'Light' : 'Dark', 'mode'],
      ['Backdrop', pick.glow === 'none' ? 'None' : nameOf(GLOWS, pick.glow) + ', ' + nameOf(GLOW_COLORS, pick.glowColor) + (pick.fx !== 'none' ? ', ' + nameOf(FX, pick.fx).toLowerCase() : '') + (pick.motion ? ', moving' : ''), 'background'],
      ['Accent', ac ? ac.n : 'Custom · ' + pick.accent.toUpperCase(), 'accent'],
      ['Font', fontOf(pick.font).n, 'font']
    ];
    return '<div class="su-k">All set</div><h2 class="su-h">Your deck is ready.</h2>' +
      '<p class="su-p">It starts from the sample slides with your title and look. Press E in the deck to make them yours. Every change saves as you go.</p>' +
      '<div class="su-summary">' + rows.map(function(r, k){
        return '<button type="button" style="--i:' + k + '" data-goto="' + STEPS.indexOf(r[2]) + '" aria-label="Change ' + r[0].toLowerCase() + '"><span>' + r[0] + '</span><b>' +
          (r[2] === 'accent' ? '<i class="su-dot" style="background:' + esc(pick.accent) + '"></i>' : '') + esc(r[1]) + '</b><em aria-hidden="true">Edit</em></button>';
      }).join('') + '</div>';
  }

  function sync(){
    // reflect the current pick on the visible step's controls
    var s = el.querySelector('.su-step:not(.leave)'); if(!s) return;
    s.querySelectorAll('[data-mode]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.mode === pick.mode)); });
    s.querySelectorAll('[data-accent]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.accent === pick.accent.toUpperCase())); });
    var an = s.querySelector('[data-accent-name]'); if(an){ var a = ACCENTS.filter(function(x){ return x.c === pick.accent.toUpperCase(); })[0]; an.textContent = a ? a.n : 'Custom · ' + pick.accent.toUpperCase(); }
    s.querySelectorAll('[data-font]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.font === pick.font)); });
    s.querySelectorAll('[data-g]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.g === pick.glow)); });
    var off = pick.glow === 'none';
    s.querySelectorAll('[data-gc]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.gc === pick.glowColor)); b.disabled = off; });
    s.querySelectorAll('[data-fx-v]').forEach(function(b){ b.setAttribute('aria-checked', String(b.dataset.fxV === pick.fx)); b.disabled = off; });
    var mo = s.querySelector('[data-motion]'); if(mo){ mo.setAttribute('aria-checked', String(pick.motion)); mo.disabled = off; }
  }

  function go(n){
    if(n < 0 || n >= STEPS.length) return;
    var dir = n >= step ? 1 : -1, stage = el.querySelector('.su-stage'), old = stage.querySelector('.su-step:not(.leave)');
    step = n;
    var s = document.createElement('div');
    s.className = 'su-step enter'; s.style.setProperty('--from', (36 * dir) + 'px');
    s.innerHTML = stepHtml(STEPS[n]);
    stage.appendChild(s);
    if(old){ old.style.setProperty('--to', (-36 * dir) + 'px'); old.classList.add('leave'); setTimeout(function(){ old.remove(); }, 560); }
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ s.classList.remove('enter'); }); });
    if(STEPS[n] === 'font') loadSamples();
    el.querySelector('.su-slide').classList.toggle('show-accent', STEPS[n] === 'accent');
    el.querySelectorAll('.su-progress i').forEach(function(b, k){ b.classList.toggle('done', k <= n); });
    el.querySelector('[data-back]').hidden = n === 0;
    el.querySelector('[data-skip]').hidden = n === STEPS.length - 1;
    el.querySelector('[data-next]').textContent = n === STEPS.length - 1 ? 'Open my deck' : 'Continue';
    sync();
    var first = s.querySelector('input, [aria-pressed="true"], button');
    setTimeout(function(){ if(first && el) first.focus({ preventScroll: true }); }, 80);
  }

  function onClick(e){
    var t = e.target, b;
    if(t.closest('[data-close]') || t === el){ close(false); return; }
    if(t.closest('[data-next]')){ step === STEPS.length - 1 ? finish() : go(step + 1); return; }
    if(t.closest('[data-back]')){ go(step - 1); return; }
    if(t.closest('[data-skip]')){ go(STEPS.length - 1); return; }
    if((b = t.closest('[data-goto]'))){ go(+b.dataset.goto); return; }
    if((b = t.closest('[data-mode]'))){ pick.mode = b.dataset.mode; }
    else if((b = t.closest('[data-accent]'))){ pick.accent = b.dataset.accent; }
    else if((b = t.closest('.su-opt[data-font]'))){ pick.font = b.dataset.font; }
    else if((b = t.closest('[data-g]'))){ pick.glow = b.dataset.g; }
    else if((b = t.closest('[data-gc]'))){ if(b.disabled) return; pick.glowColor = b.dataset.gc; }
    else if((b = t.closest('[data-fx-v]'))){ if(b.disabled) return; pick.fx = b.dataset.fxV; }
    else if((b = t.closest('[data-motion]'))){ if(b.disabled) return; pick.motion = !pick.motion; }
    else return;
    paint(); sync(); paintSlide(true);
  }
  function onInput(e){
    var t = e.target;
    if(t.dataset.f){ pick[t.dataset.f] = t.value.trim(); paintSlide(); }
    if(t.hasAttribute('data-custom')){ pick.accent = t.value.toUpperCase(); paint(); sync(); }
  }
  function onKey(e){
    if(!el) return;
    if(e.key === 'Escape'){ e.preventDefault(); close(false); return; }
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName) && document.activeElement.type !== 'color';
    if(e.key === 'Enter' && !(document.activeElement && document.activeElement.closest('.su-opt, .su-sw, .su-gc, .su-seg, .su-switch, .su-btn, .su-close'))){
      e.preventDefault(); step === STEPS.length - 1 ? finish() : go(step + 1); return;
    }
    if(typing) return;
    if(e.key === 'ArrowRight' && step < STEPS.length - 1){ e.preventDefault(); go(step + 1); }
    if(e.key === 'ArrowLeft' && step > 0){ e.preventDefault(); go(step - 1); }
  }

  function open(){
    if(el) return;
    prevFocus = document.activeElement;
    before = DT.snapshot();
    var f = before.font && before.font.v ? before.font.v : 'inter';
    pick = { title: '', lead: '', author: '', role: '', mode: before.mode === 'light' ? 'light' : 'dark', accent: String(before.accent || '#0A84FF').toUpperCase(),
             font: f, glow: before.glow, glowColor: before.glowColor, motion: before.motion === 'on', fx: before.fx };
    el = document.createElement('div');
    el.className = 'su-backdrop';
    el.innerHTML = '' +
      '<div class="su-modal" role="dialog" aria-modal="true" aria-label="New deck setup">' +
        '<div class="su-side">' +
          '<div class="su-progress" aria-hidden="true">' + STEPS.map(function(){ return '<i></i>'; }).join('') + '</div>' +
          '<div class="su-stage"></div>' +
          '<div class="su-nav">' +
            '<button type="button" class="su-btn ghost su-skip" data-skip>Skip<span class="su-long"> to the end</span></button>' +
            '<button type="button" class="su-btn ghost" data-back>Back</button>' +
            '<button type="button" class="su-btn primary" data-next>Continue</button>' +
          '</div>' +
        '</div>' +
        '<div class="su-preview" aria-hidden="true"><span class="su-preview-k">Live preview</span>' +
          '<div class="su-slide glow" data-fx><span class="su-chip" data-tag="Label">New</span><div class="su-ov"></div><div class="su-t"></div><i class="su-rule" data-tag="Underline"></i><p class="su-l"></p>' +
          '<span class="su-cta" data-tag="Button">Get started</span>' +
          '<div class="su-foot"><span>Title slide</span><span>Edit anything later</span></div></div>' +
        '</div>' +
        '<button type="button" class="su-close" data-close aria-label="Close setup">×</button>' +
      '</div>';
    document.body.appendChild(el);
    // the preview's Pulse grid is drawn on a canvas (glow-fx.js), like the slides'
    if(window.GlowFX) GlowFX.mount(el.querySelector('.su-slide'));
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey, true);
    paint(); step = 0; go(0);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('in'); }); });
  }

  function close(keep){
    if(!el) return;
    var node = el; el = null;
    document.removeEventListener('keydown', onKey, true);
    if(!keep) DT.paint();          // put back the look the page had
    node.classList.add('out'); node.classList.remove('in');
    setTimeout(function(){ node.remove(); }, 460);
    if(location.hash === '#setup') history.replaceState(null, '', location.pathname + location.search);
    if(prevFocus && prevFocus.focus) prevFocus.focus();
  }

  function finish(){
    var f = fontOf(pick.font), S = window.SleekStore;
    var theme = { mode: pick.mode, accent: pick.accent, glow: pick.glow, glowColor: pick.glowColor, motion: pick.motion ? 'on' : 'off', fx: pick.fx };
    if(f.v !== 'inter') theme.font = { v: f.v, d: f.d, b: f.b, href: f.href };
    // a title slide with the names on it, and a slide of bullets to start writing on
    var a = S.uid(), b = S.uid(), text = {};
    if(pick.author || pick.role) text[a + '.' + TITLE_IDS.overline] = [pick.author, pick.role].filter(Boolean).map(esc).join(' <span class="tick">·</span> ');
    if(pick.title) text[a + '.' + TITLE_IDS.title] = esc(pick.title);
    if(pick.lead) text[a + '.' + TITLE_IDS.lead] = esc(pick.lead);
    var seed = { theme: theme, added: [{ id: a, t: 'title', name: 'Title' }, { id: b, t: 'bullets', name: 'Bullets' }], text: text };
    var title = pick.title || 'Untitled deck';
    S.create({ title: title, seed: seed, cover: { k: [pick.author, pick.role].filter(Boolean).join(' · '), h: title } }).then(function(d){
      try { localStorage.setItem('sleek-tour', 'edit'); } catch(e){}   // the deck opens on its tour
      close(true);
      setTimeout(function(){ location.href = 'deck.html?d=' + d.id + '#title'; }, 380);
    }, function(err){ console.error(err); close(false); });
  }

  window.SleekSetup = { open: open, close: close };
  document.addEventListener('click', function(e){ if(e.target.closest('[data-open-setup]')){ e.preventDefault(); open(); } });
  document.addEventListener('keydown', function(e){
    if(el || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if(e.key === 'n' || e.key === 'N'){ e.preventDefault(); open(); }
  });
  function fromHash(){ if(location.hash === '#setup') open(); }
  window.addEventListener('hashchange', fromHash);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromHash); else fromHash();
})();
