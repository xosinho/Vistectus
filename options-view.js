/* =====================================================================
   VISTECTUS — a Builder-made world's player options
   ---------------------------------------------------------------------
   /<sys>/_world/options/index.html. The world's choices (worlds.options)
   narrow the game's full list; a missing key means everything:
     Hunter   {"creeds": [...]}   the Creeds (rules_creeds table)
     Vampire  {"clans": [...]}    clans and bloodlines (rules-data.js)
     D&D      {"species": [...], "classes": [...]}   (rules-5e.js; drawn
              by dnd/assets/js/available.js, given WORLD_AVAILABLE)
   <div id="options" data-system="hunter|vampire|dnd"></div>
   Names and short facts only; each links to the game's wiki or rules.
   ===================================================================== */
(function () {
  "use strict";
  var el = document.getElementById("options");
  if (!el) return;
  var system = el.getAttribute("data-system"), worldId = document.body.getAttribute("data-world");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function allowed(list, names) {
    if (!Array.isArray(names)) return list;
    var want = {};
    names.forEach(function (n) { want[String(n).toLowerCase()] = 1; });
    return list.filter(function (x) { return want[String(x.name).toLowerCase()]; });
  }
  function load(src) {
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
  }

  async function run() {
    var w = await window.ChronicleContent.world(worldId);
    if (!w) { el.innerHTML = '<section class="row"><p class="prose">This world could not be found.</p></section>'; return; }
    var opts = w.options || {};
    var h1 = document.querySelector(".hero .lede");
    if (system === "dnd") {
      window.WORLD_AVAILABLE = { species: opts.species || null, classes: opts.classes || null, note: "" };
      el.id = "available";
      await load("../../assets/js/available.js?v=20261015");
      return;
    }
    if (system === "hunter") {
      var db = window.ChronicleContent.client();
      var r = await db.from("rules_creeds").select("name,summary,creed_field,url").order("sort", { ascending: true });
      var creeds = allowed(r.data || [], opts.creeds);
      el.innerHTML = '<section class="row"><div class="row-head"><h2>Creeds</h2></div><div class="entries">' + (creeds.length ? creeds.map(function (c) {
        return '<article class="entry"><h3>' + (/^https:\/\/htr\.paradoxwikis\.com\//.test(c.url || "") ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.name) + "</a>" : esc(c.name)) + "</h3>" +
          (c.creed_field ? '<p class="meta">' + esc(c.creed_field) + "</p>" : "") + "<p>" + esc(c.summary) + "</p></article>";
      }).join("") : "<p class=\"prose\">The Creeds will appear here.</p>") + "</div></section>";
      return;
    }
    // Vampire: clans and bloodlines from the rules data.
    var R = window.VAMPIRE_RULES || window.CROWN_RULES;
    if (!R) { await load("/vtda/assets/data/rules-data.js").catch(function () { return load("/vtda/hungary-1242/crown-of-ice-and-bone/assets/data/rules-data.js"); }); R = window.VAMPIRE_RULES || window.CROWN_RULES; }
    var clans = allowed((R && R.clans) || [], opts.clans);
    function group(kind, title) {
      var list = clans.filter(function (c) { return c.kind === kind; });
      if (!list.length) return "";
      return '<section class="row"><div class="row-head"><h2>' + title + '</h2></div><div class="entries">' + list.map(function (c) {
        return '<article class="entry"><h3><a href="../rules.html?p=' + encodeURIComponent(c.page || "") + '">' + esc(c.name) + "</a></h3>" +
          '<p class="meta">' + esc((c.disciplines || []).join(" · ")) + (c.note ? " · " + esc(c.note) : "") + "</p></article>";
      }).join("") + "</div></section>";
    }
    el.innerHTML = group("Clan", "The Clans of Caine") + group("Bloodline", "Bloodlines") + group("Clanless", "The clanless") +
      '<section class="row"><p class="prose">Each name opens its page in this world&rsquo;s rules (members only).</p></section>';
  }
  run().catch(function (e) { console.error(e); el.innerHTML = '<section class="row"><p class="prose">This page could not be loaded just now.</p></section>'; });
})();
