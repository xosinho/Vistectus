/* =====================================================================
   THE DEAD HAND — Documents and Maps
   ---------------------------------------------------------------------
   Draws the list for documents.html (from assets/data/documents.js) or
   the gallery for maps.html (from assets/data/maps.js), and opens each
   item in a pop-up over the page.

   The page says which it is:  <div id="collection" data-kind="documents">
   Nothing here needs editing to add a document or a map.
   ===================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("collection");
  if (!root) return;
  var kind = root.getAttribute("data-kind");
  var items = (kind === "maps" ? window.DEAD_HAND_MAPS : window.DEAD_HAND_DOCUMENTS) || [];
  items = items.filter(function (x) { return x && x.title && (kind === "maps" ? x.image : x.file); });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;        // never innerHTML: data stays data
    return e;
  }
  // File names may contain spaces; keep them working as addresses.
  function url(path) { return encodeURI(path); }
  function ext(path) { var m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(path || ""); return m ? m[1].toLowerCase() : ""; }
  function isImage(path) { return /^(jpe?g|png|gif|webp|avif)$/.test(ext(path)); }

  /* --------------------------------------------------------- the pop-up */
  var dlg = el("dialog", "viewer");
  dlg.setAttribute("aria-labelledby", "viewerTitle");
  dlg.innerHTML =
    '<div class="viewer-bar">' +
      '<h2 id="viewerTitle"></h2>' +
      '<span class="viewer-tools">' +
        '<button type="button" class="viewer-btn" data-step="-1" hidden aria-label="Previous map">&lsaquo; Prev</button>' +
        '<button type="button" class="viewer-btn" data-step="1" hidden aria-label="Next map">Next &rsaquo;</button>' +
        '<a class="viewer-btn" id="viewerPdf" download hidden>Download PDF</a>' +
        '<a class="viewer-btn" id="viewerOpen" target="_blank" rel="noopener">Open in new tab</a>' +
        '<button type="button" class="viewer-btn viewer-close" aria-label="Close">&times;</button>' +
      "</span>" +
    "</div>" +
    '<div class="viewer-body"></div>' +
    '<p class="viewer-note" hidden></p>';
  document.body.appendChild(dlg);
  var body = dlg.querySelector(".viewer-body");
  var current = -1;

  function show(i) {
    var item = items[i];
    if (!item) return;
    current = i;
    var path = kind === "maps" ? item.image : item.file;
    dlg.querySelector("#viewerTitle").textContent = item.title;
    dlg.querySelector("#viewerOpen").href = url(path);
    var pdf = dlg.querySelector("#viewerPdf");
    pdf.hidden = !item.pdf;
    if (item.pdf) pdf.href = url(item.pdf);
    dlg.querySelectorAll("[data-step]").forEach(function (b) { b.hidden = kind !== "maps" || items.length < 2; });

    body.textContent = "";
    body.classList.remove("is-zoomed");
    if (isImage(path)) {
      var img = el("img");
      img.src = url(path);
      img.alt = item.title;
      if (kind === "maps") {
        img.title = "Click to see it at full size";
        img.addEventListener("click", function () { body.classList.toggle("is-zoomed"); });
      }
      body.appendChild(img);
    } else {
      var frame = el("iframe");
      frame.src = url(path);
      frame.title = item.title;
      body.appendChild(frame);
    }
    // Phones often show only the first page of a PDF inside a page.
    var note = dlg.querySelector(".viewer-note");
    note.hidden = ext(path) !== "pdf";
    note.textContent = "If the PDF does not show in full, use Open in new tab.";
    if (!dlg.open) dlg.showModal();
  }

  function close() {
    dlg.close();
  }
  dlg.addEventListener("close", function () {
    body.textContent = "";                 // stops anything playing, frees the frame
    var back = root.querySelector('[data-i="' + current + '"]');
    if (back) back.focus();
  });
  dlg.querySelector(".viewer-close").addEventListener("click", close);
  dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });   // the dimmed backdrop
  dlg.querySelectorAll("[data-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      show((current + (+b.getAttribute("data-step")) + items.length) % items.length);
    });
  });
  dlg.addEventListener("keydown", function (e) {
    if (kind !== "maps" || items.length < 2) return;
    if (e.key === "ArrowRight") show((current + 1) % items.length);
    if (e.key === "ArrowLeft") show((current - 1 + items.length) % items.length);
  });

  /* ------------------------------------------------------------ the list */
  if (!items.length) {
    var empty = el("section", "row");
    empty.appendChild(el("p", "empty", kind === "maps"
      ? "No maps yet. They will appear here as the chronicle goes on."
      : "No documents yet. They will appear here as the chronicle goes on."));
    root.appendChild(empty);
    return;
  }

  if (kind === "maps") {
    var sec = el("section", "row");
    var grid = el("div", "map-grid");
    items.forEach(function (m, i) {
      var b = el("button", "map-tile");
      b.type = "button";
      b.setAttribute("data-i", i);
      var img = el("img");
      img.src = url(m.image);
      img.alt = "";
      img.loading = "lazy";
      b.appendChild(img);
      var cap = el("span", "map-cap");
      cap.appendChild(el("strong", null, m.title));
      var meta = [m.when, m.description].filter(Boolean).join(" · ");
      if (meta) cap.appendChild(el("span", null, meta));
      b.appendChild(cap);
      b.addEventListener("click", function () { show(i); });
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    root.appendChild(sec);
    return;
  }

  // Documents: grouped by type, in the order each type first appears.
  var order = [], groups = {};
  items.forEach(function (d, i) {
    var t = d.type || "Other";
    if (!groups[t]) { groups[t] = []; order.push(t); }
    groups[t].push(i);
  });
  order.forEach(function (t) {
    var section = el("section", "row");
    var head = el("div", "row-head");
    head.appendChild(el("h2", null, t));
    section.appendChild(head);
    var list = el("div", "doc-list");
    groups[t].forEach(function (i) {
      var d = items[i];
      var b = el("button", "doc-item");
      b.type = "button";
      b.setAttribute("data-i", i);
      b.appendChild(el("span", "doc-kind", (ext(d.file) === "pdf" ? "PDF" : isImage(d.file) ? "Image" : "Document")));
      b.appendChild(el("strong", "doc-title", d.title));
      var meta = [d.when, d.description].filter(Boolean).join(" · ");
      if (meta) b.appendChild(el("span", "doc-meta", meta));
      b.addEventListener("click", function () { show(i); });
      list.appendChild(b);
    });
    section.appendChild(list);
    root.appendChild(section);
  });
})();
