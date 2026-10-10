/* =====================================================================
   D&D WORLDS — Available Races & Classes
   ---------------------------------------------------------------------
   Lists the species and classes of the rules data (rules-5e.js),
   narrowed to the world's choices (window.WORLD_AVAILABLE in
   available.js beside the page; null = everything). Each links to its
   page on dnd5e.wikidot.com. Names and numbers only: the descriptions
   are on the wiki.
   ===================================================================== */
(function () {
  "use strict";
  var R = window.DND_RULES || {}, W = window.WORLD_AVAILABLE || {};
  var root = document.getElementById("available");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function link(url, text) {
    return /^https:\/\/dnd5e\.wikidot\.com\//.test(url || "") ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>" : esc(text);
  }
  function pick(list, allowed) {
    if (!Array.isArray(allowed)) return list || [];
    var want = {};
    allowed.forEach(function (n) { want[String(n).trim().toLowerCase()] = true; });
    return (list || []).filter(function (x) { return want[String(x.name).toLowerCase()]; });
  }
  var ABIL = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
  var PHB = /Player's Handbook/i;

  function group(list) {
    // The Player's Handbook first, then the other books, then everything else.
    var core = list.filter(function (x) { return PHB.test(x.source || ""); });
    var rest = list.filter(function (x) { return !PHB.test(x.source || ""); });
    return { core: core, rest: rest };
  }

  function speciesCard(s) {
    return '<article class="opt"><h3>' + link(s.url, s.name) + "</h3>" +
      '<p class="opt-meta">' + esc([s.size, s.speed ? s.speed + " ft." : ""].filter(Boolean).join(" · ")) + "</p>" +
      (s.subraces && s.subraces.length ? '<p class="opt-sub">' + (s.subraceRequired ? "Choose one: " : "Also: ") +
        s.subraces.map(function (x) { return link(x.url, x.name); }).join(", ") + "</p>" : "") +
      '<p class="opt-src">' + esc(s.source || "") + "</p></article>";
  }
  function classCard(c) {
    var sc = c.spellcasting;
    var facts = [c.hitDie ? "Hit die d" + c.hitDie : "", (c.saves || []).length ? "Saves " + c.saves.map(function (k) { return ABIL[k] || k; }).join(", ") : "",
      sc ? "Spellcaster (" + (ABIL[sc.ability] || sc.ability) + ")" : ""].filter(Boolean).join(" · ");
    return '<article class="opt"><h3>' + link(c.url, c.name) + "</h3>" +
      (facts ? '<p class="opt-meta">' + esc(facts) + "</p>" : "") +
      ((c.subclasses || []).length ? '<details class="opt-sub"><summary>' + c.subclasses.length + " " + esc(c.subclassLabel || "subclasses") + "</summary><p>" +
        c.subclasses.map(function (x) { return link(x.url, x.name); }).join(", ") + "</p></details>" : "") +
      '<p class="opt-src">' + esc(c.source || "") + "</p></article>";
  }

  function section(id, title, list, card, filterLabel) {
    var g = group(list);
    var h = '<section class="row" id="' + id + '"><div class="row-head"><h2>' + esc(title) + '</h2><span class="opt-count">' + list.length + "</span></div>";
    if (list.length > 12) h += '<input type="search" class="opt-filter" data-for="' + id + '" placeholder="' + esc(filterLabel) + '" aria-label="' + esc(filterLabel) + '">';
    if (g.core.length) h += "<h3 class=\"opt-group\">Player&rsquo;s Handbook</h3><div class=\"opts\">" + g.core.map(card).join("") + "</div>";
    if (g.rest.length) h += "<h3 class=\"opt-group\">" + (g.core.length ? "Other books, Unearthed Arcana and more" : "") + "</h3><div class=\"opts\">" + g.rest.map(card).join("") + "</div>";
    if (!list.length) h += '<p class="prose">None listed yet.</p>';
    return h + "</section>";
  }

  if (!R.species) { root.innerHTML = '<section class="row"><p class="prose">The rules data could not be loaded.</p></section>'; return; }
  var species = pick(R.species, W.species), classes = pick(R.classes, W.classes);
  root.innerHTML =
    '<section class="row"><div class="prose"><p>' + (W.note ? esc(W.note) :
      (Array.isArray(W.species) || Array.isArray(W.classes) ? "The species and classes chosen for this world." :
       "Everything on the D&amp;D 5e wiki is open in this world, including Unearthed Arcana and other books; the Dungeon Master has the last word on any choice.")) +
    " Names link to the wiki, which opens in a new tab.</p></div></section>" +
    section("species", "Races (species)", species, speciesCard, "Find a species…") +
    section("classes", "Classes", classes, classCard, "Find a class or subclass…");

  root.querySelectorAll(".opt-filter").forEach(function (box) {
    box.addEventListener("input", function () {
      var q = box.value.trim().toLowerCase();
      document.getElementById(box.getAttribute("data-for")).querySelectorAll(".opt").forEach(function (o) {
        o.hidden = q && o.textContent.toLowerCase().indexOf(q) < 0;
      });
    });
  });
})();
