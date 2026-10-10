/* =====================================================================
   A CROWN OF ICE AND BONE — the rules (from the Obsidian vault)
   ---------------------------------------------------------------------
   rules.html?p=<path> shows one note, e.g. ?p=concepts/abilities.
   The notes are the Storyteller's Obsidian notes on Vampire: the Dark
   Ages, uploaded on the Storyteller page into the vault_notes table.
   The database lets only a Storyteller, or a player with a sheet in
   this chronicle, read them; everyone else sees a sign-in box.

   Obsidian's [[links]] work: [[abilities]], [[../factions/brujah|Brujah]]
   and [[the-roads#Road of Kings]] open the note they name.
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = "crown-of-ice-and-bone";
  var HOME = "index";
  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  var root = document.getElementById("rules");
  var notes = [];          // [{path, title}]
  var byPath = {};
  var byBase = {};         // file name -> [paths]

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function current() { return new URLSearchParams(window.location.search).get("p") || HOME; }
  function href(path, anchor) { return "rules.html?p=" + encodeURIComponent(path) + (anchor ? "#" + anchorId(anchor) : ""); }
  function anchorId(s) {
    return "h-" + String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  var FOLDER_NAMES = { concepts: "Rules and setting", factions: "Clans and bloodlines", disciplines: "Disciplines",
    locations: "Places", roads: "Roads", apocrypha: "Apocrypha", necromancy: "Necromancy", thaumaturgy: "Thaumaturgy" };

  /* ---------------------------------------------------------- links
     Obsidian resolves a link relative to the note, then by file name
     anywhere in the vault. So does this. */
  function normalise(parts) {
    var out = [];
    parts.forEach(function (p) {
      if (!p || p === ".") return;
      if (p === "..") out.pop(); else out.push(p);
    });
    return out.join("/");
  }
  function resolve(from, target) {
    target = target.trim().replace(/\.md$/i, "");
    if (!target) return null;
    var dir = from.split("/").slice(0, -1);
    var rel = normalise(dir.concat(target.split("/")));
    if (byPath[rel]) return rel;
    var abs = normalise(target.split("/"));
    if (byPath[abs]) return abs;
    var hits = byBase[target.split("/").pop().toLowerCase()] || [];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // Several notes share the name: prefer the closest one.
      return hits.slice().sort(function (a, b) { return closeness(b, from) - closeness(a, from); })[0];
    }
    return null;
  }
  function closeness(a, b) {
    var x = a.split("/"), y = b.split("/"), n = 0;
    while (n < x.length && n < y.length && x[n] === y[n]) n++;
    return n;
  }

  // [[target#heading|label]] -> a Markdown link, before Markdown runs.
  function wikilinks(md, from) {
    return md
      .replace(/!\[\[[^\]]*\]\]/g, "")                         // embeds: none in these notes
      .replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, function (m, target, heading, label) {
        // Inside a table Obsidian writes the bar as \|.
        target = (target || "").replace(/\\$/, ""); if (heading) heading = heading.replace(/\\$/, "");
        var anchor = heading ? heading.slice(1) : "";
        var path = target ? resolve(from, target) : from;
        var text = (label || (target ? target.split("/").pop() : anchor) || "").replace(/[\[\]]/g, "");
        if (!label && target && byPath[path]) text = byPath[path].title;
        if (!path) return '<span class="rules-missing" title="Not in the rules">' + esc(text) + "</span>";
        return "[" + text + "](" + href(path, anchor) + ")";
      });
  }

  /* ----------------------------------------------------- signed out */
  function signIn(reason) {
    root.innerHTML =
      '<section class="xp-panel rules-gate">' +
        "<h2>For the coterie</h2>" +
        "<p>" + (reason || "The rules are for the players of this chronicle and the Storyteller. Sign in with the email your invitation went to, and a link will be sent to it.") + "</p>" +
        '<form class="rules-form" id="rulesForm">' +
          '<input type="email" id="rulesEmail" autocomplete="email" required placeholder="you@example.com" aria-label="Email">' +
          '<button class="btn" type="submit" id="rulesSend">Send link</button>' +
        "</form>" +
        '<p class="rules-status" id="rulesMsg" role="status" aria-live="polite"></p>' +
      "</section>";
    document.getElementById("rulesForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = document.getElementById("rulesMsg"), send = document.getElementById("rulesSend");
      send.disabled = true;
      msg.textContent = "Sending…";
      try {
        var r = await db.auth.signInWithOtp({
          email: document.getElementById("rulesEmail").value.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] }
        });
        if (r.error) throw r.error;
        msg.textContent = "Link sent. Open it from your email and the rules open here, signed in.";
      } catch (err) {
        console.error(err);
        msg.textContent = /sign ?ups? not allowed|not found|invalid login/i.test(errText(err))
          ? "That address has no account. Ask the Storyteller for an invitation."
          : "Could not send the link: " + errText(err);
        send.disabled = false;
      }
    });
  }

  /* ----------------------------------------------------------- index */
  function sidebar(active) {
    var groups = {}, order = [];
    notes.forEach(function (n) {
      var parts = n.path.split("/"), g = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(n);
    });
    order.sort(function (a, b) { return a === "" ? -1 : b === "" ? 1 : a.localeCompare(b); });
    var h = '<input type="search" id="rulesSearch" class="rules-search" placeholder="Search the rules…" aria-label="Search the rules">' +
      '<div id="rulesHits"></div><nav class="rules-nav" aria-label="All notes">';
    order.forEach(function (g) {
      var label = g ? g.split("/").map(function (x) { return FOLDER_NAMES[x] || (x.charAt(0).toUpperCase() + x.slice(1)); }).join(" › ") : "General";
      var open = !g || active.indexOf(g + "/") === 0;
      h += "<details" + (open ? " open" : "") + "><summary>" + esc(label) + " <small>" + groups[g].length + "</small></summary><ul>";
      groups[g].sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (n) {
        h += "<li><a href=\"" + href(n.path) + "\"" + (n.path === active ? ' aria-current="page"' : "") + ">" + esc(n.title) + "</a></li>";
      });
      h += "</ul></details>";
    });
    return h + "</nav>";
  }

  function wireSearch() {
    var box = document.getElementById("rulesSearch"), hits = document.getElementById("rulesHits"), timer;
    box.addEventListener("input", function () {
      clearTimeout(timer);
      var q = box.value.trim();
      if (q.length < 2) { hits.innerHTML = ""; return; }
      timer = setTimeout(async function () {
        var ql = q.toLowerCase();
        var byTitle = notes.filter(function (n) { return n.title.toLowerCase().indexOf(ql) >= 0; }).slice(0, 12);
        var safe = q.replace(/[%_\\]/g, function (c) { return "\\" + c; });
        var r = await db.from("vault_notes").select("path,title").eq("chronicle", CHRONICLE).ilike("body", "%" + safe + "%").limit(25);
        if (box.value.trim() !== q) return;
        var seen = {}, list = [];
        byTitle.concat(r.data || []).forEach(function (n) { if (!seen[n.path]) { seen[n.path] = 1; list.push(n); } });
        hits.innerHTML = list.length
          ? '<ul class="rules-hits">' + list.map(function (n) { return '<li><a href="' + href(n.path) + '">' + esc(n.title) + "</a> <small>" + esc(n.path) + "</small></li>"; }).join("") + "</ul>"
          : '<p class="rules-status">Nothing found.</p>';
      }, 250);
    });
  }

  /* ----------------------------------------------------------- a note */
  async function show(path) {
    var article = document.getElementById("rulesArticle");
    article.innerHTML = '<p class="rules-status">Opening…</p>';
    var r = await db.from("vault_notes").select("path,title,body,updated_at").eq("chronicle", CHRONICLE).eq("path", path).maybeSingle();
    if (r.error) { article.innerHTML = '<div class="sheet-notice">Could not open this note: ' + esc(errText(r.error)) + "</div>"; return; }
    if (!r.data) {
      article.innerHTML = '<div class="sheet-notice">There is no note called &ldquo;' + esc(path) + '&rdquo;. <a href="' + href(HOME) + '">Back to the index</a>.</div>';
      return;
    }
    var n = r.data;
    var md = wikilinks(n.body, n.path);
    var html = window.marked ? window.marked.parse(md, { gfm: true }) : "<pre>" + esc(md) + "</pre>";
    html = window.DOMPurify ? window.DOMPurify.sanitize(html) : esc(md);
    var crumbs = n.path.split("/").slice(0, -1).map(function (x) { return esc(FOLDER_NAMES[x] || x); }).join(" › ");
    article.innerHTML = '<p class="rules-crumb">' + (crumbs || "&nbsp;") + "</p>" +
      (/^\s*#\s/.test(n.body) ? "" : "<h1>" + esc(n.title) + "</h1>") +
      '<div class="rules-body">' + html + "</div>" +
      '<p class="rules-foot">From the Storyteller&rsquo;s notes on <em>Vampire: the Dark Ages</em>, for the players of this chronicle only. Please do not copy or share them.</p>';
    document.title = n.title + " · The rules · A Crown of Ice and Bone · VisTectus";
    // Headings get ids, so [[note#Heading]] lands on them.
    article.querySelectorAll(".rules-body h1, .rules-body h2, .rules-body h3, .rules-body h4").forEach(function (h) { h.id = anchorId(h.textContent); });
    // Links to other sites open in a new tab.
    article.querySelectorAll(".rules-body a[href]").forEach(function (a) {
      if (/^https?:/i.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener"; }
    });
    var target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------- start */
  async function start() {
    if (!db) { root.innerHTML = '<div class="sheet-notice">The rules are not connected.</div>'; return; }
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) return signIn();
      var r = await db.from("vault_notes").select("path,title").eq("chronicle", CHRONICLE).order("path", { ascending: true });
      if (r.error) throw r.error;
      notes = r.data || [];
      if (!notes.length) {
        var st = await db.rpc("is_storyteller");
        root.innerHTML = '<div class="sheet-notice">' + (st.data === true
          ? 'No notes uploaded yet. Upload them from the <a href="storyteller.html">Storyteller page</a>.'
          : "This account cannot read the rules: it plays no Cainite in this chronicle, or the Storyteller has not uploaded them yet. Ask the Storyteller.") +
          ' <button type="button" class="btn btn--ghost" id="rulesOut">Sign out</button></div>';
        document.getElementById("rulesOut").addEventListener("click", async function () { await db.auth.signOut(); start(); });
        return;
      }
      byPath = {}; byBase = {};
      notes.forEach(function (n) {
        byPath[n.path] = n;
        var base = n.path.split("/").pop().toLowerCase();
        (byBase[base] = byBase[base] || []).push(n.path);
      });
      var path = current();
      if (!byPath[path]) path = byPath[HOME] ? HOME : notes[0].path;
      root.innerHTML = '<div class="rules-layout"><aside class="rules-side">' + sidebar(path) + "</aside>" +
        '<article class="rules-article" id="rulesArticle"></article></div>';
      wireSearch();
      await show(path);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="sheet-notice">The rules could not be reached just now: ' + esc(errText(e)) + "</div>";
    }
  }

  db && db.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") start();
  });
  start();
})();
