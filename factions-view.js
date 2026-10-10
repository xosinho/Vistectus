/* =====================================================================
   VISTECTUS — factions from the database, in the faction-page format
   ---------------------------------------------------------------------
   On every Factions page (the four file worlds' pages, and the template
   for Builder-made worlds). The world's factions added on the site
   (world_factions) are appended after those written in the page, in the
   same markup, and listed in the page's contents (nav.contents ol).

     <script src="/factions-view.js" data-world="shrouded"></script>
   (or <body data-world="..."> on the template). Load after supabase-js,
   builders/config.js and content.js. All text is escaped.
   ===================================================================== */
(function () {
  "use strict";
  var me = document.currentScript;
  var WORLD = (me && me.getAttribute("data-world")) || document.body.getAttribute("data-world");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function slug(s) { return "f-" + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50); }
  function safeImg(url) { return /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/world-media\/[A-Za-z0-9%._\/-]+$/.test(url || "") ? url : ""; }

  function section(f, right) {
    var goals = (f.goals || []).filter(Boolean), figs = (f.figures || []).filter(function (x) { return x && x.name; });
    var prose = String(f.prose || "").split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var img = safeImg(f.image);
    return '<section class="faction' + (right ? " faction--right" : "") + '" id="' + esc(slug(f.name)) + '">' +
      '<figure class="faction__art">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" width="900" height="1200">' : "") + "</figure>" +
      '<div class="faction__body"><div class="faction__head">' +
        (f.chip ? '<p class="chip">' + esc(f.chip) + "</p>" : "") + "<h2>" + esc(f.name) + "</h2>" +
        (f.epithet ? '<p class="epithet">' + esc(f.epithet) + "</p>" : "") + "</div>" +
      '<div class="faction__cols"><div class="faction__stats">' +
        (goals.length ? '<div class="stat"><h3>Goals</h3><ul>' + goals.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul></div>" : "") +
        (figs.length ? '<div class="stat"><h3>Key figures</h3><ul>' + figs.map(function (x) {
          return '<li><span class="who">' + esc(x.name) + "</span>" + (x.note ? '<span class="sep">·</span>' + esc(x.note) : "") + "</li>";
        }).join("") + "</ul></div>" : "") +
      '</div><div class="faction__prose">' + prose.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div></div></div></section>";
  }

  async function run() {
    if (!WORLD || !window.ChronicleContent) return;
    var list = await window.ChronicleContent.factions(WORLD);
    var main = document.querySelector("main");
    if (!main) return;
    // A template page holds only a placeholder until the factions arrive.
    var empty = document.getElementById("factions-empty");
    if (!list.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.remove();
    var already = main.querySelectorAll("section.faction").length;
    main.insertAdjacentHTML("beforeend", list.map(function (f, i) { return section(f, (already + i) % 2 === 1); }).join(""));
    var nav = document.querySelector("nav.contents ol");
    if (nav) nav.insertAdjacentHTML("beforeend", list.map(function (f) {
      return '<li><a href="#' + esc(slug(f.name)) + '">' + esc(f.name) + (f.chip ? '<span class="sub">' + esc(f.chip) + "</span>" : "") + "</a></li>";
    }).join(""));
    var navBox = document.querySelector("nav.contents");
    if (navBox) navBox.hidden = false;
  }
  run().catch(function (e) { console.warn("Factions from the database are unavailable.", e); });
})();
