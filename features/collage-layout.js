/* Moodboard layouts: where each picture on a moodboard goes, in four styles.

   A moodboard (the Moodboard layout, .cl-board) holds any number of pictures. Each picture is an
   item { id, r } (r: its width over its height), kept in the slide's entry in the deck
   (seed.added[k].cl = { style, motion, mix, title, items }), and its tile is named for it
   (<slide id>.c<item id>), so pictures can come and go without anything else moving.

   layout() works out a box for every item, either all on the board ('fit') or along an endless
   strip as tall as the board ('strip', for Drift sideways):
     mosaic     a grid of square-ish cells; wide pictures take two across, tall ones two down,
                and a few take a big 2x2; spare cells are filled by tiles growing into them
     masonry    columns of pictures at their own shapes, each column stretched to the board's height
     scattered  prints thrown on a table: overlapping, each a little turned, some with a polaroid edge
     contact    a contact sheet: even 3:2 frames, numbered
   Every random choice comes from the item's id and the board's mix (Remix picks a new one), so a
   board looks the same on every reload and in every window. Nothing here touches the deck. */
(function(){
  var NOMINAL = { W: 1072, H: 528 };              // the board on a 1280x720 slide, with its title
  var STYLES = ['mosaic', 'masonry', 'scattered', 'contact'], MOTIONS = ['static', 'drift', 'shuffle'];
  var GAP = { mosaic: 12, masonry: 14, scattered: 0, contact: 14 };

  function hash(s){
    var h = 2166136261;
    for(var k = 0; k < s.length; k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // a number in [0, 1) that only depends on the item, the board's mix and what it's for
  function rnd(id, mix, salt){
    var h = hash(id + '|' + (mix || 0) + '|' + salt);
    h = Math.imul(h ^ (h >>> 15), h | 1); h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  }
  function ratio(it){ var r = +it.r; return r > 0.05 && r < 20 ? r : 4 / 3; }

  // ---------- mosaic: tiles of whole cells ----------
  // the tile sizes (in cells, across x down) a picture would like, best first: the ones whose shape
  // crops it least; a few pictures (the first, and some others) are heroes and like a big tile
  var SMALL = [[1, 1], [2, 1], [1, 2]], BIG = [[2, 2], [3, 2], [2, 3]];
  function prefSpans(it, k, n, cols, rows, mix, geo){
    var r = ratio(it), u = rnd(it.id, mix, 'span');
    function shape(sp){ return (sp[0] * geo.cw + (sp[0] - 1) * geo.g) / (sp[1] * geo.ch + (sp[1] - 1) * geo.g); }
    function err(sp){ return Math.abs(Math.log(shape(sp) / r)); }
    function ok(sp){ return sp[0] <= cols && sp[1] <= rows && err(sp) < 0.95; }
    function best(list){ return list.filter(ok).sort(function(x, y){ return err(x) - err(y); }); }
    var hero = (k === 0 && n >= 5) || (n >= 8 && u < 0.12);
    var out = (hero ? best(BIG) : []).concat(best(SMALL));
    out.push([1, 1]);
    return out;
  }
  // place every item at the first free cell (rows first, or columns first for a strip), as large as
  // it likes while there are cells to spare, then let tiles grow into whatever is left
  function packCells(items, cols, rows, colFlow, mix, geo){
    var occ = [], tiles = [], n = items.length, maxC = cols || Infinity;   // a strip (cols 0) runs on
    function free(r, c){ return r >= 0 && r < rows && c >= 0 && c < maxC && !(occ[r] && occ[r][c]); }
    function take(t){ for(var r = t.r; r < t.r + t.h; r++){ occ[r] = occ[r] || []; for(var c = t.c; c < t.c + t.w; c++) occ[r][c] = t; } }
    function fits(r, c, w, h){ for(var y = r; y < r + h; y++) for(var x = c; x < c + w; x++) if(!free(y, x)) return false; return true; }
    var cursor = 0, freeLeft = cols ? cols * rows : Infinity;
    items.forEach(function(it, k){
      var r, c;
      for(;; cursor++){
        r = colFlow ? cursor % rows : Math.floor(cursor / cols); c = colFlow ? Math.floor(cursor / rows) : cursor % cols;
        if(free(r, c)) break;
        if(colFlow ? c >= maxC : r >= rows) return;            // no room at all (never: the grid is sized for it)
      }
      var spans = prefSpans(it, k, n, cols || 99, rows, mix, geo), pick = [1, 1];
      for(var s = 0; s < spans.length; s++){
        var w = spans[s][0], h = spans[s][1];
        if(fits(r, c, w, h) && freeLeft - w * h >= n - k - 1){ pick = spans[s]; break; }
      }
      var t = { it: it, r: r, c: c, w: pick[0], h: pick[1] };
      take(t); tiles.push(t); freeLeft -= t.w * t.h;
    });
    var lastC = cols || tiles.reduce(function(m, t){ return Math.max(m, t.c + t.w); }, 1);
    maxC = lastC;
    // fill the cells nobody took: each goes to the neighbouring tile it crops least, taking a whole
    // row or column of cells along that tile's edge
    function shapeErr(t, w, h){ return Math.abs(Math.log(((w * geo.cw + (w - 1) * geo.g) / (h * geo.ch + (h - 1) * geo.g)) / ratio(t.it))); }
    function grows(t){
      var out = [];
      if(fits(t.r, t.c + t.w, 1, t.h)) out.push({ t: t, dc: 0, dr: 0, dw: 1, dh: 0 });
      if(fits(t.r, t.c - 1, 1, t.h)) out.push({ t: t, dc: -1, dr: 0, dw: 1, dh: 0 });
      if(fits(t.r + t.h, t.c, t.w, 1)) out.push({ t: t, dc: 0, dr: 0, dw: 0, dh: 1 });
      if(fits(t.r - 1, t.c, t.w, 1)) out.push({ t: t, dc: 0, dr: -1, dw: 0, dh: 1 });
      return out;
    }
    for(var guard = 0; guard < rows * lastC; guard++){
      var hole = null;
      for(var hr0 = 0; hr0 < rows && !hole; hr0++) for(var hc0 = 0; hc0 < lastC; hc0++) if(free(hr0, hc0)){ hole = [hr0, hc0]; break; }
      if(!hole) break;
      var best = null;
      tiles.forEach(function(t){
        grows(t).forEach(function(gr){
          var r0 = t.r + gr.dr, c0 = t.c + gr.dc, w = t.w + gr.dw, h = t.h + gr.dh;
          if(hole[0] < r0 || hole[0] >= r0 + h || hole[1] < c0 || hole[1] >= c0 + w) return;   // must cover this hole
          var e = shapeErr(t, w, h) - shapeErr(t, t.w, t.h);
          if(!best || e < best.e) best = { e: e, gr: gr };
        });
      });
      if(!best) break;
      var bt = best.gr.t; bt.r += best.gr.dr; bt.c += best.gr.dc; bt.w += best.gr.dw; bt.h += best.gr.dh; take(bt);
    }
    var holes = 0, err = 0;
    for(var hr = 0; hr < rows; hr++) for(var hc = 0; hc < lastC; hc++) if(free(hr, hc)) holes++;
    tiles.forEach(function(t){ err += shapeErr(t, t.w, t.h); });
    return { tiles: tiles, cols: lastC, holes: holes, err: err };
  }
  function mosaic(items, W, H, strip, mix){
    var g = GAP.mosaic, n = items.length, cols, rows, cw, ch, p;
    if(strip){
      rows = n <= 3 ? 1 : n <= 7 ? 2 : 3;
      ch = (H - (rows - 1) * g) / rows; cw = ch;
      p = packCells(items, 0, rows, true, mix, { cw: cw, ch: ch, g: g });
    } else {
      // try every grid that holds the pictures without cells getting too thin or too squat, and
      // keep the one that crops them least (more, smaller cells cost a little)
      var best = null;
      for(var c = 1; c <= 24; c++) for(var r0 = 1; r0 <= 16; r0++){
        var cap = c * r0; if(cap < n || cap > n * 2.6 + 4) continue;
        var cw0 = (W - (c - 1) * g) / c, ch0 = (H - (r0 - 1) * g) / r0, asp = cw0 / ch0;
        if(asp < 0.5 || asp > 2.2 || cw0 < 24 || ch0 < 24) continue;
        [false, true].forEach(function(byCol){                   // filled row by row, or column by column
          var p0 = packCells(items, c, r0, byCol, mix, { cw: cw0, ch: ch0, g: g });
          var score = p0.err / n + p0.holes * 0.5 + cap / n * 0.03 + Math.abs(Math.log(asp)) * 0.08 + (byCol ? 0.02 : 0);
          if(!best || score < best.score) best = { score: score, p: p0, cols: c, rows: r0, cw: cw0, ch: ch0 };
        });
      }
      p = best.p; cols = best.cols; rows = best.rows; cw = best.cw; ch = best.ch;
    }
    var rects = p.tiles.map(function(t){
      return { id: t.it.id, x: t.c * (cw + g), y: t.r * (ch + g), w: t.w * cw + (t.w - 1) * g, h: t.h * ch + (t.h - 1) * g, rot: 0, z: 1 };
    });
    return { rects: rects, W: strip ? p.cols * (cw + g) : W, H: H, holes: p.holes };
  }

  // ---------- masonry: columns of pictures at their own shapes ----------
  // Columns (rows, on a strip) are stretched to fill the board, which crops their pictures a little.
  // A locked tile (item.lock) stays exactly 16:9: the unlocked pictures beside it take the stretch.
  var LOCK = 16 / 9;
  function mshape(it){ return it.lock ? LOCK : ratio(it); }
  // one column's pictures, fitted to the board's height: [{ e, h, w (of the column), dx }]
  function fitColumn(list, cw, H, g){
    var avail = H - (list.length - 1) * g, lockH = 0, freeH = 0, nu = 0;
    list.forEach(function(e){ if(e.it.lock) lockH += e.h; else { freeH += e.h; nu++; } });
    var s = 1, minFree = 48 * nu;
    if(lockH > 0 && lockH > avail - minFree) s = Math.max(0.2, (avail - minFree) / lockH);   // too many to fit: locked tiles go narrower
    var f = nu ? (avail - lockH * s) / freeH : 1;
    var used = list.reduce(function(a, e){ return a + e.h * (e.it.lock ? s : f); }, 0) + (list.length - 1) * g;
    var y = nu ? 0 : Math.max(0, (H - used) / 2);             // only locked tiles: centred in the column
    return list.map(function(e){
      var lk = e.it.lock, h = e.h * (lk ? s : f), w = lk ? cw * s : cw, o = { e: e, y: y, h: h, w: w, dx: (cw - w) / 2 };
      y += h + g; return o;
    });
  }
  function columnScore(list, H, g){
    var avail = H - (list.length - 1) * g, lockH = 0, freeH = 0;
    list.forEach(function(e){ if(e.it.lock) lockH += e.h; else freeH += e.h; });
    if(freeH) return avail - lockH > 0 ? Math.abs(Math.log((avail - lockH) / freeH)) : 3;
    return Math.abs(Math.log(Math.max(1, avail) / lockH)) * 0.6;   // a gap (or narrower tiles), not a crop
  }
  function masonry(items, W, H, strip, mix){
    var g = GAP.masonry, n = items.length, rects = [];
    if(strip){
      // rows of pictures, each as wide as its shape says, the rows evened out to one length
      var R = n <= 5 ? 1 : n <= 14 ? 2 : 3, rh = (H - (R - 1) * g) / R, rows = [];
      for(var k = 0; k < R; k++) rows.push({ len: 0, list: [] });
      items.forEach(function(it){
        var row = rows.reduce(function(a, b){ return b.len < a.len ? b : a; });
        var w = rh * mshape(it); row.list.push({ it: it, w: w }); row.len += w + g;
      });
      var S = Math.max.apply(null, rows.map(function(r){ return r.len; }));
      rows.forEach(function(row, ri){
        var lockW = 0, freeW = 0;
        row.list.forEach(function(e){ if(e.it.lock) lockW += e.w; else freeW += e.w; });
        var room = S - row.list.length * g - lockW, f = freeW && room > 0 ? room / freeW : 1, x = 0;
        row.list.forEach(function(e){ var w = e.it.lock ? e.w : e.w * f; rects.push({ id: e.it.id, x: x, y: ri * (rh + g), w: w, h: rh, rot: 0, z: 1, lock: !!e.it.lock }); x += w + g; });
      });
      return { rects: rects, W: S, H: H };
    }
    // the number of columns whose pictures, stacked, come closest to the board's height
    var best = null;
    for(var c = 1; c <= Math.min(n, 12); c++){
      var cw = (W - (c - 1) * g) / c, cols = [];
      for(var j = 0; j < c; j++) cols.push({ h: 0, list: [] });
      items.forEach(function(it){
        var col = cols.reduce(function(a, b){ return b.h < a.h ? b : a; });
        var h = cw / mshape(it); col.list.push({ it: it, h: h }); col.h += h;
      });
      var score = 0;
      cols.forEach(function(col){
        if(!col.list.length){ score += 9; return; }
        score = Math.max(score, columnScore(col.list, H, g));
      });
      if(c === 1 && n > 2) score += 0.6;                       // one picture on top of another isn't a wall
      if(!best || score < best.score - 0.02) best = { score: score, cols: cols, cw: cw };
    }
    best.cols.forEach(function(col, ci){
      fitColumn(col.list, best.cw, H, g).forEach(function(o){
        rects.push({ id: o.e.it.id, x: ci * (best.cw + g) + o.dx, y: o.y, w: o.w, h: o.h, rot: 0, z: 1, lock: !!o.e.it.lock });
      });
    });
    return { rects: rects, W: W, H: H };
  }

  // ---------- scattered: prints on a table ----------
  function print(it, cx, cy, bw, bh, mix, k, capH){
    var r = ratio(it), s = 1.02 + rnd(it.id, mix, 's') * 0.18;
    var pw = Math.min(bw * s, bh * s * r * 0.86), ph = pw / r;  // a little room for the frame
    if(capH && ph * 1.12 > capH){ ph = capH / 1.12; pw = ph * r; }
    var b = Math.max(3, Math.round(pw * 0.04)), pol = rnd(it.id, mix, 'pol') < 0.45, bb = pol ? Math.round(b * 3.4) : b;
    var w = pw + 2 * b, h = ph + b + bb;
    return { id: it.id, x: cx - w / 2, y: cy - h / 2, w: w, h: h, rot: (rnd(it.id, mix, 'rot') - 0.5) * 14,
             z: 2 + Math.floor(rnd(it.id, mix, 'z') * 1000), frame: { b: b, bb: bb, pol: pol }, k: k };
  }
  function scattered(items, W, H, strip, mix){
    var n = items.length, rects = [];
    if(strip){
      var R = n <= 5 ? 1 : 2, ch = H / R, cw = ch * 1.18, cols = Math.ceil(n / R);
      items.forEach(function(it, k){
        var col = Math.floor(k / R), row = k % R;
        var cx = (col + 0.5) * cw + (rnd(it.id, mix, 'jx') - 0.5) * 0.22 * cw;
        var cy = (row + 0.5) * ch + (rnd(it.id, mix, 'jy') - 0.5) * 0.2 * ch;
        var p = print(it, cx, cy, cw * 0.92, ch * 0.92, mix, k, H * (R === 1 ? 0.78 : 0.56));
        p.y = Math.max(p.h * 0.07, Math.min(H - p.h * 1.07, p.y));   // turned corners stay inside the strip
        rects.push(p);
      });
      return { rects: rects, W: cols * cw, H: H };
    }
    var c = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * W / H * 0.9)))), rowsN = Math.ceil(n / c);
    var cw2 = W / c, ch2 = H / rowsN;
    items.forEach(function(it, k){
      var row = Math.floor(k / c), col = k % c, inRow = Math.min(c, n - row * c), off = (c - inRow) * cw2 / 2;
      var cx = off + (col + 0.5) * cw2 + (rnd(it.id, mix, 'jx') - 0.5) * 0.2 * cw2;
      var cy = (row + 0.5) * ch2 + (rnd(it.id, mix, 'jy') - 0.5) * 0.2 * ch2;
      var p = print(it, cx, cy, cw2, ch2, mix, k);
      // kept on the board (just about: a corner may hang over, like a real one)
      p.x = Math.max(-p.w * 0.03, Math.min(W - p.w * 0.97, p.x));
      p.y = Math.max(-p.h * 0.03, Math.min(H - p.h * 0.97, p.y));
      rects.push(p);
    });
    return { rects: rects, W: W, H: H };
  }

  // ---------- contact sheet: even, numbered 3:2 frames ----------
  var FR = 1.5;
  // the frames circled on the sheet: about one in nine, the same ones every time
  function picks(items, mix){
    var n = items.length, want = n >= 4 ? Math.max(1, Math.round(n / 9)) : 0, out = {};
    items.map(function(it){ return { id: it.id, u: rnd(it.id, mix, 'pick') }; }).sort(function(a, b){ return a.u - b.u; })
      .slice(0, want).forEach(function(x){ out[x.id] = true; });
    return out;
  }
  function labH(fw){ return Math.max(13, Math.round(fw * 0.085)); }
  function contact(items, W, H, strip, mix){
    var g = GAP.contact, n = items.length, rects = [], pk = picks(items, mix);
    if(strip){
      var R = n <= 4 ? 1 : 2, fh = (H - (R - 1) * g) / R, fw = fh * 0.9 * FR;
      fh = fw / FR; var lab = labH(fw); fw = (H - (R - 1) * g - R * lab) / R * FR; fh = fw / FR; lab = labH(fw);
      items.forEach(function(it, k){
        var col = Math.floor(k / R), row = k % R;
        rects.push({ id: it.id, x: col * (fw + g), y: row * (fh + lab + g), w: fw, h: fh, rot: 0, z: 1, no: k + 1, lab: lab,
                     pick: !!pk[it.id] });
      });
      return { rects: rects, W: Math.ceil(n / R) * (fw + g), H: H };
    }
    var best = null;
    for(var c = 1; c <= n; c++){
      var rows = Math.ceil(n / c), w = (W - (c - 1) * g) / c;
      var hrow = (H - (rows - 1) * g) / rows, wh = hrow / (1 / FR + 0.085);
      if(wh * 0.085 < 13) wh = (hrow - 13) * FR;
      w = Math.min(w, wh);
      if(!best || w > best.w) best = { c: c, rows: rows, w: w };
    }
    var fw2 = best.w, fh2 = fw2 / FR, lab2 = labH(fw2);
    var gw = best.c * fw2 + (best.c - 1) * g, gh = best.rows * (fh2 + lab2) + (best.rows - 1) * g;
    var ox = (W - gw) / 2, oy = Math.max(0, (H - gh) / 2);
    items.forEach(function(it, k){
      var row = Math.floor(k / best.c), col = k % best.c;
      rects.push({ id: it.id, x: ox + col * (fw2 + g), y: oy + row * (fh2 + lab2 + g), w: fw2, h: fh2, rot: 0, z: 1, no: k + 1, lab: lab2,
                   pick: !!pk[it.id] });
    });
    return { rects: rects, W: W, H: H };
  }

  var BY = { mosaic: mosaic, masonry: masonry, scattered: scattered, contact: contact };
  var memo = {}, memoN = 0;
  function layout(style, mode, items, W, H, mix){
    if(!items.length) return { rects: [], W: mode === 'strip' ? 0 : W, H: H };
    var key = [style, mode, Math.round(W), Math.round(H), mix || 0].concat(items.map(function(it){ return it.id + ':' + ratio(it).toFixed(3) + (it.lock ? 'L' : ''); })).join('|');
    if(memo[key]) return memo[key];
    if(++memoN > 60){ memo = {}; memoN = 1; }
    return (memo[key] = (BY[style] || mosaic)(items, Math.max(40, W), Math.max(40, H), mode === 'strip', mix || 0));
  }

  // ---------- the board's tiles ----------
  // the layout's own pictures: data-samples on the board, "path|ratio path|ratio …"
  function sampleItems(board){
    return (board.getAttribute('data-samples') || '').trim().split(/\s+/).filter(Boolean).map(function(s, k){
      var p = s.split('|'); return { id: 's' + k, def: p[0], r: +p[1] || 4 / 3 };
    });
  }
  function stateOf(board, a){
    var cl = (a && a.cl) || {};
    return {
      style: STYLES.indexOf(cl.style) > -1 ? cl.style : (board.getAttribute('data-style') || 'mosaic'),
      motion: MOTIONS.indexOf(cl.motion) > -1 ? cl.motion : (board.getAttribute('data-motion') || 'static'),
      mix: cl.mix || 0, title: cl.title !== false,
      items: Array.isArray(cl.items) ? cl.items : sampleItems(board)
    };
  }
  function tileFor(it, sid){
    var m = document.createElement('div');
    m.className = 'media cl-tile'; m.setAttribute('data-cid', it.id);
    if(sid) m.setAttribute('data-mid', sid + '.c' + it.id);
    if(it.def) m.setAttribute('data-default-src', it.def);
    m.setAttribute('data-bg-pos', 'center');
    return m;
  }
  function paintClasses(board, st){
    var cls = board.className.split(/\s+/).filter(function(c){ return !/^cl-(mosaic|masonry|scattered|contact|static|drift|shuffle)$/.test(c); });
    board.className = cls.concat(['cl-' + st.style, 'cl-' + st.motion]).join(' ');
    var s = board.closest('.slide'); if(s) s.classList.toggle('cl-bare', !st.title);
  }
  // build a moodboard slide's tiles (before the engine names the slide's tiles)
  function build(slide, a){
    var board = slide.querySelector('.cl-board'); if(!board) return null;
    var st = stateOf(board, a), sid = a && a.id;
    board._cl = st;
    board.innerHTML = '<div class="cl-track"><div class="cl-set"></div></div>';
    var set = board.querySelector('.cl-set');
    st.items.forEach(function(it){ set.appendChild(tileFor(it, sid)); });
    paintClasses(board, st);
    return board;
  }
  // put tiles where a layout says (in board px)
  function applyRects(board, res, st){
    var set = board.querySelector('.cl-set:not(.cl-copy)'); if(!set) return;
    var byId = {};
    res.rects.forEach(function(r){ byId[r.id] = r; });
    Array.prototype.forEach.call(set.querySelectorAll(':scope > .cl-tile'), function(m){
      var r = byId[m.getAttribute('data-cid')];
      m.classList.toggle('cl-off', !r);
      if(!r) return;
      placeTile(m, r);
    });
    set.style.width = res.W + 'px';
  }
  function placeTile(m, r){
    var s = m.style;
    s.left = r.x.toFixed(1) + 'px'; s.top = r.y.toFixed(1) + 'px'; s.width = r.w.toFixed(1) + 'px'; s.height = r.h.toFixed(1) + 'px';
    s.zIndex = r.z || 1;
    m.classList.toggle('cl-locked', !!r.lock);
    m.setAttribute('data-rot', (r.rot || 0).toFixed(2));
    s.setProperty('--rot', (r.rot || 0).toFixed(2) + 'deg');
    if(r.frame){ s.setProperty('--pb', r.frame.b + 'px'); s.setProperty('--pbb', r.frame.bb + 'px'); m.classList.toggle('cl-pol', r.frame.pol); }
    if(r.lab){ s.setProperty('--lab', r.lab + 'px'); }
    m.classList.toggle('cl-pick', !!r.pick);
    var no = m.querySelector(':scope > .cl-no');
    if(r.no){
      if(!no){ no = document.createElement('span'); no.className = 'cl-no'; no.setAttribute('aria-hidden', 'true'); m.appendChild(no); }
      no.textContent = String(r.no).padStart(2, '0') + 'A';
    } else if(no) no.remove();
  }
  function place(board, W, H, mode){
    var st = board._cl; if(!st) return null;
    var res = layout(st.style, mode, st.items, W, H, st.mix);
    applyRects(board, res, st);
    return res;
  }

  window.SleekCollage = {
    NOMINAL: NOMINAL, STYLES: STYLES, MOTIONS: MOTIONS,
    rnd: rnd, layout: layout, build: build, place: place, placeTile: placeTile, tileFor: tileFor,
    stateOf: stateOf, sampleItems: sampleItems, paintClasses: paintClasses
  };
})();
