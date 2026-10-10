/* =====================================================================
   VISTECTUS — pages of Builder-made worlds and chronicle front pages
   ---------------------------------------------------------------------
   For the templates in /<htr|vtda|dnd>/_world/ (see 404.html and
   builders/ARCHITECTURE.md). Needs supabase-js, builders/config.js and
   content.js loaded first.

   <div id="world-page" data-system="hunter|vampire|dnd"></div>
     on a world page (<body data-world="...">): its Resources cards
     (Factions, player options, the rules), its chronicles/campaigns,
     and its overview, from the worlds table.

   <div id="chronicle-front" data-system="..."></div>
     on a chronicle's front page (<body data-chronicle="...">): its three
     cards (the cell/coterie/party, people, resources) and its premise.

   All text from the database is escaped.
   ===================================================================== */
(function () {
  "use strict";

  var SYS = {
    hunter: { path: "htr", unit: "chronicle", Units: "Chronicles", crew: "The cell", crewWho: "hunter", people: "People", peopleMeta: "Dossiers",
              options: "Creeds", optionsMeta: "Player options", optionsText: "The Creeds hunters may follow in this world.",
              rules: { label: "Hunter Wiki", href: "https://htr.paradoxwikis.com/Hunter_The_Reckoning_Wiki", ext: true, meta: "The rules and the world",
                       text: "The official Hunter: The Reckoning wiki from Paradox: rules, Creeds, Edges and the world of the Hunt. Opens in a new tab." } },
    vampire: { path: "vtda", unit: "chronicle", Units: "Chronicles", crew: "The coterie", crewWho: "Cainite", people: "People", peopleMeta: "Dossiers",
               options: "Clans & Bloodlines", optionsMeta: "Player options", optionsText: "The clans and bloodlines of Caine allowed in this world.",
               rules: { label: "The rules", href: "rules.html", ext: false, meta: "Vampire: the Dark Ages, members only",
                        text: "The rules of the Dark Ages from the Storytellers' notes, searchable and linked. For the players and Storytellers of this world: sign in to read." } },
    dnd: { path: "dnd", unit: "campaign", Units: "Campaigns", crew: "The Party", crewWho: "adventurer", people: "NPCs", peopleMeta: "Dramatis personae",
           options: "Available Races & Classes", optionsMeta: "Player options", optionsText: "The species and classes allowed in this world, each linked to the wiki.",
           rules: { label: "D&D 5e Wiki", href: "https://dnd5e.wikidot.com/", ext: true, meta: "The rules",
                    text: "Species, classes, backgrounds, feats and spells: the D&D 5th edition wiki. Opens in a new tab." } }
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function paras(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
  }
  // A picture URL as a CSS value, safely: only our own storage links.
  function cssUrl(url) {
    return /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/world-media\/[A-Za-z0-9%._\/-]+$/.test(url || "") ? "url('" + url + "')" : "";
  }
  function card(o) {
    var art = o.image ? ' style="--art: ' + cssUrl(o.image) + '"' : "";
    var target = o.ext ? ' target="_blank" rel="noopener"' : "";
    return '<article class="card"><a class="card-art" href="' + esc(o.href) + '"' + target + art + '><span class="card-badge">' + esc(o.badge) + "</span></a>" +
      '<div class="card-body"><h3><a href="' + esc(o.href) + '"' + target + ">" + esc(o.title) + "</a></h3>" +
      '<p class="meta">' + esc(o.meta || "") + "</p><p>" + esc(o.text || "") + "</p></div></article>";
  }
  function setHero(title, lede, image) {
    var h1 = document.querySelector(".hero h1"), lp = document.querySelector(".hero .lede"), hero = document.querySelector(".hero");
    if (h1 && title) h1.textContent = title;
    if (lp) lp.textContent = lede || "";
    if (hero && image && cssUrl(image)) hero.style.setProperty("--hero", cssUrl(image));
  }

  /* ------------------------------------------------------------ world */
  async function worldPage(el) {
    var sys = SYS[el.getAttribute("data-system")] || SYS.dnd, id = document.body.getAttribute("data-world");
    var C = window.ChronicleContent;
    var w = await C.world(id);
    if (!w) { el.innerHTML = '<section class="row"><p class="prose">This world could not be found.</p></section>'; return; }
    var media = C.mediaUrl;
    setHero(w.name, w.tagline, media(w.hero_image || w.card_image));
    document.title = w.name + " · VisTectus";
    var list = (await C.chronicles(id)).filter(function (c) { return c.status === "approved" || c.status === "draft" || c.status === "pending"; });
    var h = "";
    if (w.status !== "approved") {
      h += '<section class="row"><p class="form-status" data-kind="error">This world is ' + (w.status === "pending" ? "waiting for the site&rsquo;s approval" : w.status === "rejected" ? "back with its builder for changes" : "still being built") +
        ". Only its builder and the site&rsquo;s admins can see it. " + '<a href="../../builders/dashboard.html">Back to the Builder</a></p></section>';
    }
    h += '<section class="row" id="resources"><div class="row-head"><h2>Resources</h2></div><div class="cards">' +
      card({ href: "factions/index.html", badge: "Power and allegiance", title: "Factions", meta: "Who holds power",
             text: "The powers of " + w.name + ": what each wants, who speaks for it, and how its weight is felt." }) +
      card({ href: "options/index.html", badge: "Player options", title: sys.options, meta: sys.optionsMeta, text: sys.optionsText }) +
      card({ href: sys.rules.href, ext: sys.rules.ext, badge: sys.rules.ext ? "Reference" : "Members only", title: sys.rules.label, meta: sys.rules.meta, text: sys.rules.text }) +
      "</div></section>";
    h += '<section class="row" id="' + (sys.unit === "campaign" ? "campaigns" : "chronicles") + '"><div class="row-head"><h2>' + sys.Units + "</h2></div>";
    h += list.length ? '<div class="cards">' + list.map(function (c) {
      return card({ href: encodeURIComponent(c.id) + "/index.html", image: media(c.card_image), badge: c.status === "approved" ? "Running" : "In the making",
                    title: c.name, meta: c.tagline, text: "The " + sys.crew.replace(/^The /, "").toLowerCase() + ", the people they have met, and the " + sys.unit + "’s resources." });
    }).join("") + "</div>" : '<p class="prose">No ' + sys.unit + "s yet.</p>";
    h += "</section>";
    h += '<section class="row" id="overview"><div class="row-head"><h2>Overview</h2></div><div class="prose">' + (paras(w.overview) || "<p>The overview of " + esc(w.name) + " will appear here.</p>") + "</div></section>";
    el.innerHTML = h;
  }

  /* -------------------------------------------------- chronicle front */
  async function chronicleFront(el) {
    var sys = SYS[el.getAttribute("data-system")] || SYS.dnd;
    var id = document.body.getAttribute("data-chronicle") || document.body.getAttribute("data-campaign");
    var C = window.ChronicleContent, db = C.client();
    var r = db ? await db.from("chronicles").select("id,name,tagline,premise,card_image,status").eq("id", id).maybeSingle() : { data: null };
    var c = r.data;
    if (!c) { el.innerHTML = '<section class="row"><p class="prose">This ' + sys.unit + " could not be found.</p></section>"; return; }
    setHero(c.name, c.tagline, "");
    var img = C.mediaUrl(c.card_image);
    var h = '<section class="row" id="resources"><div class="row-head"><h2>' + (sys.unit === "campaign" ? "The campaign" : "Assets") + '</h2></div><div class="cards">' +
      card({ href: "players.html", image: img, badge: "Players", title: sys.crew, meta: "Players", text: "Backgrounds and character sheets for each " + sys.crewWho + "." }) +
      card({ href: "npcs.html", badge: sys.peopleMeta, title: sys.people, meta: sys.peopleMeta, text: "Everyone the " + sys.crew.replace(/^The /, "").toLowerCase() + " has crossed paths with so far." }) +
      card({ href: "resources.html", badge: "Archive", title: "Resources", meta: "Documents, maps and places", text: "Everything the table has been given over the " + sys.unit + "." }) +
      "</div></section>" +
      '<section class="row" id="about"><div class="row-head"><h2>The ' + sys.unit + '</h2></div><div class="prose">' + (paras(c.premise) || "<p>The premise of " + esc(c.name) + " will appear here.</p>") + "</div></section>";
    el.innerHTML = h;
  }

  function start() {
    var w = document.getElementById("world-page"), c = document.getElementById("chronicle-front");
    var run = w ? worldPage(w) : c ? chronicleFront(c) : null;
    if (run) run.catch(function (e) { console.error(e); (w || c).innerHTML = '<section class="row"><p class="prose">This page could not be loaded just now. Try again in a moment.</p></section>'; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.WorldPages = { SYSTEMS: SYS };
})();
