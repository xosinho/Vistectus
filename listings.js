/* =====================================================================
   VISTECTUS — Builder-made worlds and chronicles on the file pages
   ---------------------------------------------------------------------
   The game index pages list their worlds, and the file worlds' pages
   their chronicles, as hand-written cards. This adds the approved ones
   made with the Builder, as cards in the same list:

     <script src="/listings.js" data-worlds="dnd" data-target="#worlds .cards"></script>
     <script src="/listings.js" data-chronicles="shrouded" data-target="#campaigns .cards"></script>

   Loads supabase-js and builders/config.js itself if the page has not.
   Cards already on the page (same link) are not repeated.
   ===================================================================== */
(function () {
  "use strict";
  var me = document.currentScript;
  var GAME = me.getAttribute("data-worlds"), WORLD = me.getAttribute("data-chronicles"), TARGET = me.getAttribute("data-target");
  var PATH = { hunter: "htr", vampire: "vtda", dnd: "dnd" }, GAMES = { htr: "hunter", vtda: "vampire", dnd: "dnd" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(src) { return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function cssUrl(url) { return /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/world-media\/[A-Za-z0-9%._\/-]+$/.test(url || "") ? "url('" + url + "')" : ""; }
  function media(cfg, path) {
    if (!path) return "";
    return String(cfg.supabaseUrl).replace(/\/+$/, "") + "/storage/v1/object/public/world-media/" + String(path).split("/").map(encodeURIComponent).join("/");
  }

  async function run() {
    var box = document.querySelector(TARGET);
    if (!box) return;
    if (!window.supabase) await load("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    if (!window.BUILDERS_CONFIG) await load("/builders/config.js");
    var cfg = window.BUILDERS_CONFIG || {};
    if (!cfg.supabaseUrl || !window.supabase) return;
    var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    var have = {};
    box.querySelectorAll("a[href]").forEach(function (a) { have[new URL(a.getAttribute("href"), location.href).pathname.replace(/index\.html$/, "")] = 1; });
    var cards = [];
    if (GAME) {
      var r = await db.from("worlds").select("id,name,tagline,card_image,static_path").eq("game", GAMES[GAME] || GAME).eq("status", "approved").is("static_path", null).order("name");
      (r.data || []).forEach(function (w) {
        var href = "/" + (PATH[GAMES[GAME] || GAME]) + "/" + encodeURIComponent(w.id) + "/";
        if (!have[href]) cards.push({ href: href + "index.html", name: w.name, meta: "World", text: w.tagline, image: media(cfg, w.card_image), badge: "World" });
      });
    }
    if (WORLD) {
      var c = await db.from("chronicles").select("id,name,tagline,card_image,path,game").eq("world", WORLD).eq("status", "approved").order("name");
      (c.data || []).forEach(function (x) {
        var href = "/" + String(x.path || "").replace(/^\/+/, "");
        if (!x.path || have[href]) return;
        cards.push({ href: href + "index.html", name: x.name, meta: x.game === "dnd" ? "Campaign" : "Chronicle", text: x.tagline, image: media(cfg, x.card_image), badge: "Running" });
      });
    }
    box.insertAdjacentHTML("beforeend", cards.map(function (o) {
      var art = cssUrl(o.image) ? ' style="--art: ' + cssUrl(o.image) + '"' : "";
      return '<article class="card"><a class="card-art" href="' + esc(o.href) + '"' + art + '><span class="card-badge">' + esc(o.badge) + "</span></a>" +
        '<div class="card-body"><h3><a href="' + esc(o.href) + '">' + esc(o.name) + '</a></h3><p class="meta">' + esc(o.meta) + "</p><p>" + esc(o.text || "") + "</p></div></article>";
    }).join(""));
  }
  run().catch(function (e) { console.warn("Builder-made listings are unavailable.", e); });
})();
