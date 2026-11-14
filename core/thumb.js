/* A picture of your own for a tile on a start screen (a page in Docs, a board in Tasks; Slides has its
   own copy of this in features/library.js).

     SleekThumb.choose(done)   ask for a picture, then done(file)
     SleekThumb.shrink(file)   that picture cut to a tile's shape (16:9) and kept small, as a JPEG data
                               address to keep with the page or the board
     SleekThumb.is(v)          true when v is such a picture

   The picture is made here, in the browser, and kept with your work; it is not sent anywhere. */
(function(){
  var input = document.createElement('input'), then = null;
  input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
  input.addEventListener('change', function(){ var f = input.files[0], fn = then; then = null; if(f && fn) fn(f); });
  function choose(done){ if(!input.isConnected) document.body.appendChild(input); then = done; input.value = ''; input.click(); }
  function shrink(file){
    return new Promise(function(ok, no){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var W = 960, H = 540, iw = img.naturalWidth, ih = img.naturalHeight;
        if(!iw || !ih){ URL.revokeObjectURL(url); no(new Error('empty')); return; }
        var k = Math.max(W / iw, H / ih), sw = W / k, sh = H / k;                 // cover: fill the tile, crop the overflow evenly
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var g = cv.getContext('2d'); g.fillStyle = '#0B0B0D'; g.fillRect(0, 0, W, H);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
        URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function(){ URL.revokeObjectURL(url); no(new Error('unreadable')); };
      img.src = url;
    });
  }
  function is(v){ return typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v); }
  window.SleekThumb = { choose: choose, shrink: shrink, is: is };
})();
