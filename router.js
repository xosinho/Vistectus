/* =====================================================================
   VISTECTUS — pages for worlds and chronicles made with the Builder
   ---------------------------------------------------------------------
   Runs on 404.html. See the comment there. The templates live in
     /htr/_world/   /vtda/_world/   /dnd/_world/
       index.html                 the world
       factions/index.html        its factions
       options/index.html         its player options
       rules.html                 (vtda) its rules from Obsidian
       _chronicle/<page>.html     a chronicle's pages (and subfolders)
   and carry these placeholders, filled in (HTML-escaped) here:
     {{WORLD_ID}} {{WORLD_NAME}} {{CHRONICLE_ID}} {{CHRONICLE_NAME}}
   Everything else on those pages is drawn by their scripts from the
   database. A world or chronicle still waiting for approval is only
   found for those allowed to see it (its builder, members, admins).
   ===================================================================== */
(function () {
  "use strict";

  var SYSTEMS = { htr: "hunter", vtda: "vampire", dnd: "dnd" };
  var WORLD_PAGES = { factions: 1, options: 1 };
  var box = document.getElementById("routing");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function notFound(msg) {
    document.title = "Page not found · VisTectus";
    box.innerHTML = '<p class="kicker">VisTectus</p><h1>Page not found</h1><p class="lede">' +
      (msg || "There is nothing at this address.") + '</p><p><a class="btn" href="/">Back to the hub</a></p>';
  }

  async function route() {
    var path = window.location.pathname;
    var segs = path.split("/").filter(Boolean).map(decodeURIComponent);
    var sys = segs[0], game = SYSTEMS[sys];
    if (!game || segs.length < 2 || segs[1].charAt(0) === "_") return notFound();
    // A folder address needs its trailing slash, or relative links break.
    var last = segs[segs.length - 1];
    if (!/\.html$/i.test(last) && !/\/$/.test(path)) { window.location.replace(path + "/" + window.location.search + window.location.hash); return; }

    var cfg = window.BUILDERS_CONFIG || {};
    if (!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)) return notFound();
    var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    var worldId = segs[1], rest = segs.slice(2);
    var w = await db.from("worlds").select("id,name,game,static_path,status").eq("id", worldId).maybeSingle();
    if (!w.error && !w.data) return notFound("There is nothing at this address, or it is a world still being built. If it is yours, <a href=\"/builders/index.html\">sign in</a> first, then come back to this page.");
    if (w.error || w.data.game !== game) return notFound();
    var world = w.data, template = null, chron = null;

    if (!rest.length || (rest.length === 1 && rest[0] === "index.html")) {
      if (world.static_path) return notFound();
      template = "index.html";
    } else if (WORLD_PAGES[rest[0]]) {
      if (world.static_path) return notFound();
      template = rest[0] + "/" + (rest[1] || "index.html");
    } else if (sys === "vtda" && rest.length === 1 && rest[0] === "rules.html") {
      if (world.static_path) return notFound();
      template = "rules.html";
    } else {
      var c = await db.from("chronicles").select("id,name,world,game,status").eq("id", rest[0]).maybeSingle();
      if (c.error || !c.data || c.data.world !== world.id) {
        // A chronicle waiting for approval is found only once signed in
        // (as its Storyteller, a member or an admin); the Builder's sign-in
        // serves the whole site.
        return notFound(c.data ? "" : "There is no chronicle here, or it is not open to this account yet. If it is yours, <a href=\"/builders/index.html\">sign in</a> first, then come back to this page.");
      }
      chron = c.data;
      template = "_chronicle/" + (rest.slice(1).join("/") || "index.html");
      if (/\/$/.test(path) && rest.length > 1) template += "/index.html";
    }

    var res = await fetch("/" + sys + "/_world/" + template, { cache: "no-cache" });
    if (!res.ok) return notFound();
    var html = await res.text();
    html = html.split("{{WORLD_ID}}").join(esc(world.id)).split("{{WORLD_NAME}}").join(esc(world.name))
               .split("{{CHRONICLE_ID}}").join(esc(chron ? chron.id : "")).split("{{CHRONICLE_NAME}}").join(esc(chron ? chron.name : ""));
    // A chronicle's pages also load their world's own world.css; only the
    // worlds in the site's files have one.
    if (!world.static_path) html = html.replace(/[ \t]*<link rel="stylesheet" href="(?:\.\.\/)*world\.css[^"]*">\n?/g, "");
    document.open();
    document.write(html);
    document.close();
  }

  route().catch(function (e) { console.error(e); notFound("This page could not be opened just now. Try again in a moment."); });
})();
