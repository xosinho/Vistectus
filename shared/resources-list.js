/* =====================================================================
   VISTECTUS — a chronicle's reference list (the Resources page)
   ---------------------------------------------------------------------
   One copy for every chronicle and campaign, in the site's files or
   made with the Builder:

     <div id="resources"></div>
     ...
     <script src="assets/data/resources.js"></script>     (if it has one)
     <script src="/shared/resources-list.js" data-list="HUNTER_RESOURCES"
             data-unit="chronicle"></script>

   data-list   the page's own list (window.HUNTER_RESOURCES,
               VAMPIRE_RESOURCES or CAMPAIGN_RESOURCES); none is fine.
   data-unit   "chronicle" or "campaign", for the empty-list sentence.
   The chronicle's id comes from <body data-chronicle> (D&D pages:
   data-campaign). When the page loads /content.js, the reference links
   the Storyteller/DM added in the workshop follow the file's ones.

   Each entry: { title, category, kind, when, href, external,
   description }. Grouped by category, in the order each first appears.
   Text goes in as text, never as markup; only plain paths and web
   addresses become links.
   ===================================================================== */
(function () {
  "use strict";
  var me = document.currentScript;
  var root = document.getElementById("resources");
  if (!root) return;
  var body = document.body;
  var CHRONICLE = body.getAttribute("data-campaign") || body.getAttribute("data-chronicle") || "";
  var LIST = (me && me.getAttribute("data-list")) || "";
  var UNIT = (me && me.getAttribute("data-unit")) || "chronicle";

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
      empty.appendChild(el("p", "empty", "Reference material will appear here as the " + UNIT + " goes on."));
      root.appendChild(empty);
      return;
    }

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

  var fileList = (LIST && Array.isArray(window[LIST])) ? window[LIST] : [];
  if (window.ChronicleContent && window.ChronicleContent.merge) {
    window.ChronicleContent.merge("resource", fileList, CHRONICLE).then(draw);
  } else {
    draw(fileList);
  }
})();
