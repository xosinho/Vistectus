/* D&D CAMPAIGNS — the Resources page's reference list, from assets/data/resources.js.
   When the page also loads /content.js, the reference links added on the
   site (the workshop; table chronicle_items) follow the file's ones. */
(function () {
  "use strict";
  var root = document.getElementById("resources");
  if (!root) return;
  var CHRONICLE = (document.body && document.body.getAttribute("data-campaign")) || "";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;          // never innerHTML: data stays data
    return e;
  }
  // Relative paths and http(s) links only: never javascript: or the like.
  function safeHref(h) {
    h = String(h == null ? "" : h).trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(h) || /^\/\//.test(h)) return "";
    return h;
  }

  function draw(list) {
    root.textContent = "";
    list = (list || []).filter(function (r) { return r && r.title; });
    if (!list.length) {
      var empty = el("section", "row");
      empty.appendChild(el("p", "empty", "Reference material will appear here as the campaign goes on."));
      root.appendChild(empty);
      return;
    }

    // Group by category, in the order each category first appears.
    var order = [], groups = {};
    list.forEach(function (r) {
      var c = r.category || "Other";
      if (!groups[c]) { groups[c] = []; order.push(c); }
      groups[c].push(r);
    });

    order.forEach(function (cat) {
      var section = el("section", "row");
      var head = el("div", "row-head");
      head.appendChild(el("h2", null, cat));
      section.appendChild(head);

      var entries = el("div", "entries");
      groups[cat].forEach(function (r) {
        var item = el("article", "entry");
        var h3 = el("h3");
        var href = safeHref(r.href);
        var a = el(href ? "a" : "span", null, r.title);
        if (href) {
          a.href = href;
          if (r.external || /^https?:/i.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
        }
        h3.appendChild(a);
        item.appendChild(h3);

        var meta = [r.kind, r.when].filter(Boolean).join(" · ");
        if (meta) item.appendChild(el("p", "meta", meta));
        if (r.description) item.appendChild(el("p", null, r.description));
        entries.appendChild(item);
      });
      section.appendChild(entries);
      root.appendChild(section);
    });
  }

  var fileList = window.CAMPAIGN_RESOURCES || [];
  if (window.ChronicleContent && window.ChronicleContent.merge) {
    window.ChronicleContent.merge("resource", fileList, CHRONICLE).then(draw);
  } else {
    draw(fileList);
  }
})();
