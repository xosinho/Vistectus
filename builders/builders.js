/* =====================================================================
   Builders — shared client and helpers
   ---------------------------------------------------------------------
   Loaded by both Builders pages, after config.js and the Supabase
   library. Exposes window.Builders.

   Where the security actually is: NOT here. This file decides what the
   interface shows. What a Builder can read, upload or delete is decided
   by the policies in README.md, enforced by Supabase on its servers.
   Someone who edits this script in their browser gains nothing.
   ===================================================================== */
(function () {
  "use strict";

  var cfg = window.BUILDERS_CONFIG || {};
  var connected = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var client = connected ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  /* ---- the worlds a Builder can file uploads against --------------
     Mirrors the site. When a new world or chronicle goes live, add it
     here so Builders can pick it; "A new world" covers the gap. */
  var WORLDS = [
    {
      id: "brooklyn", name: "Brooklyn Chronicles", system: "Hunter: the Reckoning",
      chronicles: [{ id: "dead-hand", name: "Dead Hand" }]
    },
    {
      id: "hungary-1242", name: "Hungary 1242", system: "Vampire: the Dark Ages",
      chronicles: [{ id: "crown-of-ice-and-bone", name: "A Crown of Ice and Bone" }]
    }
  ];

  var CATEGORIES = [
    { id: "art",       name: "Artwork" },
    { id: "maps",      name: "Maps" },
    { id: "sheets",    name: "Character sheets" },
    { id: "handouts",  name: "Handouts" },
    { id: "lore",      name: "Lore and documents" },
    { id: "other",     name: "Other" }
  ];

  // What the dropzone accepts. The bucket's own MIME list in Supabase is
  // the real limit; this just stops obvious mistakes before they upload.
  var ACCEPT = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown"
  ];

  /* Safe path segment: lowercase, ascii, hyphens. The original name is
     kept in the database, so nothing the Builder typed is lost. */
  function slug(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled";
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function getSession() {
    if (!connected) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) { return r.data.session; });
  }

  /* For the dashboard: no session, no page. */
  function requireSession(signInPage) {
    return getSession().then(function (s) {
      if (!s) { window.location.replace(signInPage); return null; }
      return s;
    });
  }

  /* Magic-link sign-in. shouldCreateUser:false means only people you
     have invited in Supabase can get in: this is the gate. */
  function sendLink(email) {
    var back = new URL("dashboard.html", window.location.href).href;
    return client.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false, emailRedirectTo: back }
    });
  }

  function signOut() {
    return client ? client.auth.signOut() : Promise.resolve();
  }

  window.Builders = {
    connected: connected,
    client: client,
    config: cfg,
    WORLDS: WORLDS,
    CATEGORIES: CATEGORIES,
    ACCEPT: ACCEPT,
    slug: slug,
    fmtSize: fmtSize,
    getSession: getSession,
    requireSession: requireSession,
    sendLink: sendLink,
    signOut: signOut
  };
})();
