/* D&D CAMPAIGNS — the Resources page's reference list, from assets/data/resources.js. */
(function () {
  "use strict";
  var list = window.CAMPAIGN_RESOURCES || [];
  var root = document.getElementById("resources");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;          // never innerHTML: data stays data
    return e;
  }

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
      var a = el("a", null, r.title);
      a.href = r.href;
      if (r.external || /^https?:/i.test(r.href)) { a.target = "_blank"; a.rel = "noopener"; }
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
})();
