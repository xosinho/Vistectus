/* =====================================================================
   VISTECTUS — picture cropper
   ---------------------------------------------------------------------
   Every picture is cut to the shape it is shown in before it uploads:
     cards (worlds, chronicles, resources)      16:9   (1600 x 900)
     portraits (adventurers, NPCs, factions)     3:4   (900 x 1200)

     ImageCropper.open(file, { aspect: "card" | "portrait", title })
       .then(function (blob) { ...blob is a JPEG, or null if cancelled... });

   The person drags the picture to choose what to keep and zooms with
   the slider (or the mouse wheel). Works with touch. No libraries.
   ===================================================================== */
(function () {
  "use strict";

  var SHAPES = {
    card:     { ratio: 16 / 9, w: 1600, h: 900,  label: "16:9 card picture" },
    portrait: { ratio: 3 / 4,  w: 900,  h: 1200, label: "3:4 portrait" }
  };

  var css = document.createElement("style");
  css.textContent =
    ".crop-back{position:fixed;inset:0;z-index:10000;background:rgba(5,4,8,.88);display:flex;align-items:center;justify-content:center;padding:1rem}" +
    ".crop-box{background:var(--bg-raised,#1a1526);color:var(--ink,#eee);border:1px solid var(--line,#2e2740);width:min(760px,100%);max-height:100%;overflow:auto;padding:1rem 1.2rem}" +
    ".crop-box h2{margin:0 0 .3rem;font-size:1.2rem}.crop-box p{margin:.2rem 0 .8rem;color:var(--ink-soft,#bbb);font-size:.92rem}" +
    ".crop-stage{position:relative;width:100%;background:#000;overflow:hidden;touch-action:none;cursor:grab;user-select:none}" +
    ".crop-stage:active{cursor:grabbing}.crop-stage img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;pointer-events:none}" +
    ".crop-stage .grid{position:absolute;inset:0;pointer-events:none;background:" +
      "linear-gradient(to right,transparent 33%,rgba(255,255,255,.25) 33%,rgba(255,255,255,.25) calc(33% + 1px),transparent calc(33% + 1px),transparent 66%,rgba(255,255,255,.25) 66%,rgba(255,255,255,.25) calc(66% + 1px),transparent calc(66% + 1px))," +
      "linear-gradient(to bottom,transparent 33%,rgba(255,255,255,.25) 33%,rgba(255,255,255,.25) calc(33% + 1px),transparent calc(33% + 1px),transparent 66%,rgba(255,255,255,.25) 66%,rgba(255,255,255,.25) calc(66% + 1px),transparent calc(66% + 1px))}" +
    ".crop-row{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-top:.8rem}.crop-row input[type=range]{flex:1;min-width:10rem}" +
    ".crop-row .spacer{flex:1}";
  document.head.appendChild(css);

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file is not a picture this browser can open.")); };
      img.src = url;
    });
  }

  function open(file, opts) {
    opts = opts || {};
    var shape = SHAPES[opts.aspect] || SHAPES.card;
    return loadImage(file).then(function (loaded) {
      return new Promise(function (resolve) {
        var img = loaded.img, iw = img.naturalWidth, ih = img.naturalHeight;
        var back = document.createElement("div");
        back.className = "crop-back";
        back.setAttribute("role", "dialog");
        back.setAttribute("aria-modal", "true");
        back.innerHTML = '<div class="crop-box"><h2></h2><p></p>' +
          '<div class="crop-stage"><img alt=""><div class="grid"></div></div>' +
          '<div class="crop-row"><label for="cropZoom">Zoom</label><input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1"></div>' +
          '<div class="crop-row"><span class="spacer"></span><button type="button" class="btn btn--ghost" data-c="cancel">Cancel</button>' +
          '<button type="button" class="btn" data-c="ok">Use this</button></div></div>';
        back.querySelector("h2").textContent = opts.title || "Choose what to keep";
        back.querySelector("p").textContent = "This is shown as a " + shape.label + ". Drag the picture to place it; zoom in with the slider.";
        document.body.appendChild(back);
        var stage = back.querySelector(".crop-stage"), el = back.querySelector("img"), zoomIn = back.querySelector("#cropZoom");
        el.src = loaded.url;

        var sw, sh, base, zoom = 1, x = 0, y = 0;   // stage size, cover scale, offset (stage px)
        function layout() {
          sw = stage.clientWidth; sh = Math.round(sw / shape.ratio);
          stage.style.height = sh + "px";
          base = Math.max(sw / iw, sh / ih);
          clamp(); draw();
        }
        function scale() { return base * zoom; }
        function clamp() {
          var w = iw * scale(), h = ih * scale();
          x = Math.min(0, Math.max(sw - w, x)); y = Math.min(0, Math.max(sh - h, y));
        }
        function draw() { el.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale() + ")"; }
        function zoomTo(z, cx, cy) {
          var old = scale(); zoom = Math.min(4, Math.max(1, z));
          var k = scale() / old;
          cx = cx == null ? sw / 2 : cx; cy = cy == null ? sh / 2 : cy;
          x = cx - (cx - x) * k; y = cy - (cy - y) * k;
          zoomIn.value = zoom; clamp(); draw();
        }
        layout();
        x = (sw - iw * scale()) / 2; y = (sh - ih * scale()) / 2; clamp(); draw();

        var drag = null;
        stage.addEventListener("pointerdown", function (e) { drag = { px: e.clientX, py: e.clientY, x: x, y: y }; stage.setPointerCapture(e.pointerId); });
        stage.addEventListener("pointermove", function (e) {
          if (!drag) return;
          x = drag.x + (e.clientX - drag.px); y = drag.y + (e.clientY - drag.py); clamp(); draw();
        });
        stage.addEventListener("pointerup", function () { drag = null; });
        stage.addEventListener("pointercancel", function () { drag = null; });
        stage.addEventListener("wheel", function (e) {
          e.preventDefault();
          var r = stage.getBoundingClientRect();
          zoomTo(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
        zoomIn.addEventListener("input", function () { zoomTo(parseFloat(zoomIn.value)); });
        window.addEventListener("resize", layout);

        function finish(blob) {
          window.removeEventListener("resize", layout);
          URL.revokeObjectURL(loaded.url);
          back.remove();
          resolve(blob);
        }
        back.querySelector('[data-c="cancel"]').addEventListener("click", function () { finish(null); });
        back.addEventListener("keydown", function (e) { if (e.key === "Escape") finish(null); });
        back.querySelector('[data-c="ok"]').addEventListener("click", function () {
          // The visible window, in picture pixels.
          var s = scale(), sx = -x / s, sy = -y / s, sWidth = sw / s, sHeight = sh / s;
          var outW = Math.min(shape.w, Math.round(sWidth)), outH = Math.round(outW / shape.ratio);
          if (outW < 200) { outW = shape.w; outH = shape.h; }   // tiny source: upscale to the standard size
          var canvas = document.createElement("canvas");
          canvas.width = outW; canvas.height = outH;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
          canvas.toBlob(function (blob) { finish(blob); }, "image/jpeg", 0.88);
        });
        back.querySelector('[data-c="ok"]').focus();
      });
    });
  }

  window.ImageCropper = { open: open, SHAPES: SHAPES };
})();
