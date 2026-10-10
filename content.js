/* =====================================================================
   VISTECTUS — content kept in the database (the World Builder)
   ---------------------------------------------------------------------
   Worlds, factions and a chronicle's NPCs, adventurers' cards, handouts,
   maps and reference links can live in Supabase as well as in the
   site's files (builders/sql/world-builder.sql). This file reads them
   back in the same shape as the data files, so the existing pages can
   show both:

     ChronicleContent.merge("npc", window.CROWN_NPCS, "crown-of-ice-and-bone")
       .then(function (list) { ...render list... });

   kinds: "player", "npc", "document", "map", "resource".
   Pictures and files are stored in the public bucket "world-media" as
   paths ("<world>/<chronicle>/npcs/....jpg"); these helpers turn them
   into links. Load after supabase-js and builders/config.js (and after
   gate.js on members-only pages, whose client it reuses).

   Never fails loudly: if the database cannot be reached, the page shows
   what is in its files.
   ===================================================================== */
(function () {
  "use strict";

  var cfg = window.BUILDERS_CONFIG || {};
  var BUCKET = "world-media";
  var anon = null;

  function client() {
    if (window.Gate && window.Gate.db) return window.Gate.db;
    if (!anon && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) anon = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return anon;
  }

  // A stored path -> its public link. Full links pass through.
  function mediaUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return String(cfg.supabaseUrl || "").replace(/\/+$/, "") + "/storage/v1/object/public/" + BUCKET + "/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }

  // A database row -> the shape of an entry in the matching data file.
  function shape(kind, row) {
    var d = {};
    Object.keys(row.data || {}).forEach(function (k) { d[k] = row.data[k]; });
    d._id = row.id; d._db = true;
    if ((kind === "npc" || kind === "player") && d.portrait) d.portrait = mediaUrl(d.portrait);
    if (kind === "document") { if (d.file) d.file = mediaUrl(d.file); if (d.pdf) d.pdf = mediaUrl(d.pdf); }
    if (kind === "map" && d.image) d.image = mediaUrl(d.image);
    if (kind === "resource" && d.href && !/^https?:\/\//i.test(d.href)) d.href = mediaUrl(d.href);
    return d;
  }

  async function items(db, chronicle, kind) {
    var r = await db.from("chronicle_items").select("id,kind,data,sort,created_at")
      .eq("chronicle", chronicle).eq("kind", kind).order("sort", { ascending: true }).order("created_at", { ascending: true });
    if (r.error) throw r.error;
    return (r.data || []).map(function (x) { return shape(kind, x); });
  }

  // What the page's data file has, followed by what was added on the site.
  async function merge(kind, list, chronicle) {
    list = Array.isArray(list) ? list.slice() : [];
    try {
      if (window.Gate && window.Gate.ready) await window.Gate.ready;
      var db = client();
      if (!db || !chronicle) return list;
      return list.concat(await items(db, chronicle, kind));
    } catch (e) {
      console.warn("Content from the site's database is unavailable; showing the files only.", e);
      return list;
    }
  }

  function shapeFaction(f) {
    return { _id: f.id, _db: true, name: f.name, chip: f.chip, epithet: f.epithet, goals: f.goals || [],
             figures: f.figures || [], prose: f.prose, image: mediaUrl(f.image), sort: f.sort };
  }
  async function factions(world) {
    try {
      var db = client();
      if (!db) return [];
      var r = await db.from("world_factions").select("*").eq("world", world).order("sort", { ascending: true }).order("created_at", { ascending: true });
      if (r.error) throw r.error;
      return (r.data || []).map(shapeFaction);
    } catch (e) { console.warn("Factions from the database are unavailable.", e); return []; }
  }

  async function world(id) {
    var db = client();
    if (!db) return null;
    var r = await db.from("worlds").select("*").eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  async function chronicles(worldId) {
    var db = client();
    if (!db) return [];
    var r = await db.from("chronicles").select("id,name,game,world,path,status,tagline,premise,card_image").eq("world", worldId).order("name", { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* Upload a picture or file; returns its stored path.
     where: [world] or [world, chronicle]; folder: "npcs", "maps"... */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function safeName(s) {
    return String(s || "file").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  }
  async function upload(where, folder, blob, name) {
    var db = client();
    if (!db) throw new Error("Not connected.");
    var type = blob.type || "application/octet-stream";
    var ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf",
                 "text/plain": "txt", "text/markdown": "md" })[type];
    if (!ext) throw new Error("That kind of file cannot be uploaded (pictures, PDF, plain text or Markdown only).");
    var base = safeName(String(name || "").replace(/\.[a-z0-9]+$/i, ""));
    var path = where.filter(Boolean).join("/") + "/" + folder + "/" + uid() + "-" + base + "." + ext;
    var r = await db.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
    if (r.error) throw r.error;
    return path;
  }
  async function remove(path) {
    var db = client();
    if (!db || !path || /^https?:/i.test(path)) return;
    try { await db.storage.from(BUCKET).remove([path]); } catch (e) { console.warn(e); }
  }

  window.ChronicleContent = {
    BUCKET: BUCKET, client: client, mediaUrl: mediaUrl, items: items, merge: merge,
    factions: factions, world: world, chronicles: chronicles, upload: upload, remove: remove
  };
})();
