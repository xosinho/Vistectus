/* =====================================================================
   Builders — shared client and helpers
   ---------------------------------------------------------------------
   Loaded by every Builders page, after config.js and the Supabase
   library (and before content.js / cropper.js where those are used).
   Exposes window.Builders.

   Where the security actually is: NOT here. This file decides what the
   interface shows. What a builder, Storyteller or DM can read, upload,
   change or delete is decided by the row-level security policies and
   functions in sql/world-builder.sql and ../admin/sql/access.sql,
   enforced by Supabase on its servers. Someone who edits this script in
   their browser gains nothing.
   ===================================================================== */
(function () {
  "use strict";

  var cfg = window.BUILDERS_CONFIG || {};
  var connected = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  // One client per page: the anon key plus the session supabase-js keeps
  // in this browser's storage (it also picks up the emailed link's
  // session when the link lands on a Builders page).
  var client = connected ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  // content.js reuses a page's signed-in client through window.Gate.db.
  // The Builders pages do not load gate.js, so hand it ours.
  if (client && !window.Gate) window.Gate = { db: client, role: null, session: null };

  /* ---- the worlds a builder can file loose uploads against --------
     Used only by "Send other files to the site's admin" on the
     dashboard, together with the worlds the account can edit. */
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

  // What the old upload area accepts (bucket builder-uploads).
  var ACCEPT = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown"
  ];

  // What the world-media bucket accepts (sql/world-builder.sql), 10 MB each.
  var MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/markdown"];
  var MEDIA_MAX = 10 * 1024 * 1024;

  /* ---- the three games and their words ---------------------------- */
  var GAMES = {
    hunter: {
      id: "hunter", name: "Hunter: the Reckoning", short: "Hunter", path: "htr",
      unit: "chronicle", Unit: "Chronicle", st: "Storyteller", stShort: "Storyteller", crew: "cell",
      stPage: "storyteller.html", stPageLabel: "Storyteller page",
      blurb: "Modern horror. Ordinary people who have seen what hides in the dark, and hunt it.",
      wiki: "https://htr.paradoxwikis.com/Hunter_The_Reckoning_Wiki", wikiLabel: "the Hunter: the Reckoning wiki",
      optionsLabel: "Creeds"
    },
    vampire: {
      id: "vampire", name: "Vampire: the Dark Ages", short: "Vampire", path: "vtda",
      unit: "chronicle", Unit: "Chronicle", st: "Storyteller", stShort: "Storyteller", crew: "coterie",
      stPage: "storyteller.html", stPageLabel: "Storyteller page",
      blurb: "Gothic horror in the Middle Ages. The undead Cainites scheme among princes, churches and each other.",
      wiki: null, wikiLabel: "the world's own rules page",
      optionsLabel: "Clans and Bloodlines"
    },
    dnd: {
      id: "dnd", name: "Dungeons & Dragons", short: "D&D", path: "dnd",
      unit: "campaign", Unit: "Campaign", st: "Dungeon Master", stShort: "DM", crew: "party",
      stPage: "dm.html", stPageLabel: "DM Screen",
      blurb: "High fantasy, fifth edition. A party of adventurers, their quests, and the dangers between.",
      wiki: "https://dnd5e.wikidot.com/", wikiLabel: "the D&D 5e wiki",
      optionsLabel: "Species and classes"
    }
  };
  function game(id) { return GAMES[id] || GAMES.hunter; }
  // The rules link for a world: Vampire's lives with the world itself.
  function wikiFor(gameId, worldId) {
    var g = game(gameId);
    if (gameId === "vampire") return "../vtda/" + encodeURIComponent(worldId || "") + "/rules.html";
    return g.wiki;
  }

  var STATUS = {
    draft:    { label: "Draft", note: "Only you can see it." },
    pending:  { label: "Waiting for approval", note: "The site's admin has it." },
    approved: { label: "Approved", note: "On the site." },
    rejected: { label: "Sent back", note: "The site's admin asked for changes." }
  };
  function statusBadge(st) {
    var s = STATUS[st] || { label: st || "" };
    return '<span class="wb-status wb-status--' + esc(st || "none") + '">' + esc(s.label) + "</span>";
  }

  /* ---- text ------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function errText(e) {
    if (!e) return "Something went wrong.";
    var m = e.message || e.error_description || e.msg || String(e);
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "The site's database could not be reached. Check your connection and try again.";
    if (/row-level security|violates row-level/i.test(m)) return "The database refused this: this account may not change it.";
    if (/duplicate key/i.test(m)) return "That already exists.";
    return m;
  }
  // Paragraphs from plain text (blank line between them).
  function paras(s) {
    return String(s || "").split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
  }

  /* Safe path segment: lowercase, ascii, hyphens. */
  function slug(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled";
  }

  /* Short names (the address): a-z, 0-9 and dashes, 3 to 60. */
  var ID_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
  var RESERVED_WORLD = ["assets", "art", "admin", "builders", "index", "world", "worlds", "template", "rules", "factions", "options"];
  var RESERVED_CHRONICLE = ["assets", "art", "factions", "options", "rules", "index", "locations"];
  function shortName(s) {
    var x = String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    x = x.replace(/^(the|a|an)-(?=.)/, function (m) { return x.length > 24 ? "" : m; });
    if (x.length > 60) x = x.slice(0, 60).replace(/-+[^-]*$/, "") || x.slice(0, 60);
    return x.replace(/-+$/, "");
  }
  // A problem with a short name, in plain words, or "".
  function idProblem(id, kind) {
    if (!id) return "Choose a short name.";
    if (id.length < 3) return "The short name needs at least 3 characters.";
    if (id.length > 60) return "The short name can have at most 60 characters.";
    if (!ID_RE.test(id)) return "The short name may use only small letters a-z, numbers and dashes, and must start and end with a letter or number.";
    var res = kind === "chronicle" ? RESERVED_CHRONICLE : RESERVED_WORLD;
    if (res.indexOf(id) !== -1 || id.charAt(0) === "_") return "“" + id + "” is reserved by the site; choose another short name.";
    return "";
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /* ---- talking to the database ------------------------------------ */
  // The data of a supabase-js answer, or throws its error.
  async function q(p) {
    var r = await p;
    if (r && r.error) throw r.error;
    return r ? r.data : null;
  }
  function rpc(name, args) { return q(client.rpc(name, args || {})); }

  function getSession() {
    if (!connected) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) { return r.data.session; });
  }

  /* No session, no page. */
  function requireSession(signInPage) {
    return getSession().then(function (s) {
      if (!s) { window.location.replace(signInPage); return null; }
      if (window.Gate && window.Gate.db === client) { window.Gate.session = s; window.Gate.email = s.user && s.user.email; }
      return s;
    });
  }

  /* Emailed-link sign-in. The first link also creates the account, but
     only for an address the database knows: an invited builder, a
     Storyteller/DM or player of a chronicle, or a site admin (the
     sign-up check in sql/world-builder.sql refuses anyone else). */
  function sendLink(email) {
    var back = new URL("dashboard.html", window.location.href).href;
    return client.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: true, emailRedirectTo: back }
    });
  }

  function signOut() {
    return client ? client.auth.signOut() : Promise.resolve();
  }

  /* The "Signed in as ... · Sign out" line in the page heading. */
  function bindWho(session, whoEl, outEl) {
    if (whoEl) whoEl.textContent = "Signed in as " + ((session && session.user && session.user.email) || "");
    if (outEl) {
      outEl.hidden = false;
      outEl.addEventListener("click", function () {
        signOut().then(function () { window.location.replace("index.html"); });
      });
    }
  }

  /* ---- addresses -------------------------------------------------- */
  // From builders/: the world's page, a chronicle's pages.
  function worldHref(w) {
    if (!w) return "#";
    if (w.static_path) return "../" + String(w.static_path).replace(/^\/+/, "");
    return "../" + game(w.game).path + "/" + encodeURIComponent(w.id) + "/";
  }
  function chronicleHref(c, page) {
    if (!c) return "#";
    var p = c.path ? String(c.path).replace(/^\/+/, "") : game(c.game).path + "/" + c.world + "/" + c.id + "/";
    if (!/\/$/.test(p)) p += "/";
    return "../" + p + (page || "");
  }
  function storytellerHref(c) { return chronicleHref(c, game(c.game).stPage); }

  /* ---- pictures and files ----------------------------------------- */
  function mediaUrl(path) {
    if (!path) return "";
    if (/^(blob:|data:)/.test(path)) return path;
    return window.ChronicleContent ? window.ChronicleContent.mediaUrl(path) : path;
  }
  function removeMedia(path) {
    if (!path || !window.ChronicleContent) return Promise.resolve();
    return window.ChronicleContent.remove(path);
  }

  // Opens the browser's file chooser; resolves with a File or null.
  function chooseFile(accept) {
    return new Promise(function (resolve) {
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = accept || "";
      inp.className = "wb-file-input";
      inp.hidden = true;
      document.body.appendChild(inp);
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        inp.remove();
        resolve(f || null);
      });
      inp.click();
      // A cancelled chooser never fires "change"; the input is simply left
      // hidden until the next choice (and removed with the page).
    });
  }

  /* A picture or file field that uploads only when its form is saved.

       var f = Builders.mediaField(el, {
         mode: "card" | "portrait" | "file" | "image",
         label, hint, value: storedPath, required, folder: "npcs"
       });
       f.get()           -> the stored path, or "" (before saving: the old one)
       f.dirty()         -> true if changed
       await f.save(where)  where = [world] or [world, chronicle]
                         -> uploads a new choice; returns the new stored path
       f.commit()        -> after the record saved: removes the replaced file
       f.discard()       -> after a failed save: removes the new upload

     "card" (16:9) and "portrait" (3:4) go through ImageCropper first;
     "file" (handouts: PDF, picture or text) and "image" (maps) upload
     as they are. */
  function mediaField(el, o) {
    var mode = o.mode || "card";
    var cropped = mode === "card" || mode === "portrait";
    var original = o.value || "";
    var current = original;      // stored path, or "" when removed
    var pending = null;          // { blob, name, url }
    var uploaded = "";           // path uploaded by save(), not yet committed
    var id = "mf" + Math.random().toString(36).slice(2, 8);
    var accept = mode === "file" ? MEDIA_TYPES.join(",") : "image/jpeg,image/png,image/webp,image/gif";

    el.classList.add("wb-media", "wb-media--" + mode);
    function isImage(p, type) {
      if (type) return /^image\//.test(type);
      return /\.(jpe?g|png|webp|gif)$/i.test(p || "");
    }
    function draw() {
      var shown = pending ? pending.url : (current ? mediaUrl(current) : "");
      var showImg = shown && (pending ? isImage(null, pending.blob.type) : isImage(current));
      var name = pending ? pending.name : (current ? current.split("/").pop() : "");
      el.innerHTML =
        '<div class="wb-media__label" id="' + id + '-l">' + esc(o.label || "Picture") + (o.required ? "" : ' <span class="wb-opt">(optional)</span>') + "</div>" +
        (o.hint ? '<p class="hint">' + esc(o.hint) + "</p>" : "") +
        '<div class="wb-media__row">' +
          '<div class="wb-media__frame' + (shown ? "" : " is-empty") + '">' +
            (showImg ? '<img src="' + esc(shown) + '" alt="">' : (shown ? '<span class="wb-media__doc">' + esc(name) + "</span>" : '<span class="wb-media__none">' + (cropped ? (mode === "card" ? "16:9" : "3:4") : "No file") + "</span>")) +
          "</div>" +
          '<div class="wb-media__acts">' +
            '<button type="button" class="btn btn--ghost wb-small" data-m="choose" aria-describedby="' + id + '-l">' + (shown ? "Change" : "Choose") + (mode === "file" ? " file" : " picture") + "</button>" +
            (shown ? '<button type="button" class="linkbtn" data-m="clear">Remove</button>' : "") +
            (pending ? '<span class="hint">Uploads when you save.</span>' : "") +
          "</div>" +
        "</div>" +
        '<p class="wb-media__msg hint" role="status"></p>';
      el.querySelector('[data-m="choose"]').addEventListener("click", choose);
      var clr = el.querySelector('[data-m="clear"]');
      if (clr) clr.addEventListener("click", function () {
        if (pending) { URL.revokeObjectURL(pending.url); pending = null; }
        current = "";
        draw();
      });
    }
    function say(t) { var m = el.querySelector(".wb-media__msg"); if (m) m.textContent = t || ""; }

    async function take(file) {
      if (!file) return;
      say("");
      if (cropped || mode === "image") {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { say("Choose a picture: JPEG, PNG, WebP or GIF."); return; }
      } else if (MEDIA_TYPES.indexOf(file.type) === -1) {
        say("That kind of file cannot be uploaded. Use a PDF, a picture (JPEG, PNG, WebP, GIF) or a plain text or Markdown file."); return;
      }
      var blob = file, name = file.name;
      if (cropped) {
        try {
          blob = await window.ImageCropper.open(file, { aspect: mode, title: o.cropTitle || (mode === "card" ? "Choose the 16:9 card picture" : "Choose the 3:4 portrait") });
        } catch (e) { say(errText(e)); return; }
        if (!blob) return;
        name = String(file.name || "picture").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
      }
      if (blob.size > MEDIA_MAX) { say("That file is " + fmtSize(blob.size) + "; the limit is 10 MB."); return; }
      if (pending) URL.revokeObjectURL(pending.url);
      pending = { blob: blob, name: name, url: URL.createObjectURL(blob) };
      draw();
      if (o.onChange) o.onChange();
    }
    async function choose() { take(await chooseFile(accept)); }

    draw();
    return {
      el: el,
      take: take,
      get: function () { return current; },
      hasValue: function () { return !!(pending || current); },
      dirty: function () { return !!pending || current !== original; },
      save: async function (where) {
        if (!pending) return current;
        var path = await window.ChronicleContent.upload(where, o.folder || "media", pending.blob, pending.name);
        uploaded = path;
        return path;
      },
      commit: function () {
        var old = original;
        if (uploaded) { current = uploaded; }
        if (old && old !== current) removeMedia(old);
        original = current; uploaded = "";
        if (pending) { URL.revokeObjectURL(pending.url); pending = null; }
        draw();
      },
      discard: function () {
        if (uploaded) removeMedia(uploaded);
        uploaded = "";
      }
    };
  }

  /* ---- small DOM helpers ------------------------------------------ */
  function say(el, kind, text) {
    if (!el) return;
    el.dataset.kind = kind || "";
    el.textContent = text || "";
    el.hidden = !text;
  }
  // A list of problems as a status box.
  function problems(el, list) {
    if (!el) return;
    if (!list || !list.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.dataset.kind = "error";
    el.innerHTML = (list.length === 1 ? "<p>Before going on:</p>" : "<p>Before going on, please fix these:</p>") +
      "<ul>" + list.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
    el.hidden = false;
    try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) { /* old browsers */ }
  }
  function param(name) { return new URLSearchParams(window.location.search).get(name) || ""; }

  // Load a script once (the rules data files).
  var loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve;
      s.onerror = function () { delete loaded[src]; reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  window.Builders = {
    connected: connected,
    client: client,
    config: cfg,
    WORLDS: WORLDS,
    CATEGORIES: CATEGORIES,
    ACCEPT: ACCEPT,
    MEDIA_TYPES: MEDIA_TYPES,
    MEDIA_MAX: MEDIA_MAX,
    GAMES: GAMES,
    game: game,
    wikiFor: wikiFor,
    STATUS: STATUS,
    statusBadge: statusBadge,
    esc: esc,
    errText: errText,
    paras: paras,
    slug: slug,
    shortName: shortName,
    idProblem: idProblem,
    fmtSize: fmtSize,
    q: q,
    rpc: rpc,
    getSession: getSession,
    requireSession: requireSession,
    sendLink: sendLink,
    signOut: signOut,
    bindWho: bindWho,
    worldHref: worldHref,
    chronicleHref: chronicleHref,
    storytellerHref: storytellerHref,
    mediaUrl: mediaUrl,
    removeMedia: removeMedia,
    chooseFile: chooseFile,
    mediaField: mediaField,
    say: say,
    problems: problems,
    param: param,
    loadScript: loadScript
  };
})();
