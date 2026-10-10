/* =====================================================================
   VAMPIRE: THE DARK AGES — a world's rules (from the Obsidian vault),
   shared by every Vampire world made with the Builder
   ---------------------------------------------------------------------
   rules.html?p=<path> shows one note, e.g. ?p=concepts/abilities.

   The notes are the Storytellers' Obsidian notes on Vampire: the Dark
   Ages, kept in the vault_notes table under the world's id, which comes
   from <body data-world="..."> (its name from data-world-name). Every
   player and Storyteller of a chronicle in the world can read them (the
   gate, gate.js data-world, and the database both check); nobody else.

   HOW THE NOTES GET HERE. The website cannot reach Obsidian on your
   computer, so a Storyteller copies the notes up from this page: the
   "Update from Obsidian" box (the world's Storytellers only) reads the
   chosen folder of the vault in the browser and sends every note to the
   database. Do it again after changing the notes in Obsidian.

   Obsidian's [[links]] work: [[abilities]], [[../factions/brujah|Brujah]]
   and [[the-roads#Road of Kings]] open the note they name.
   ===================================================================== */
(function () {
  "use strict";

  var WORLD = document.body.getAttribute("data-world") || "";
  var WORLD_NAME = document.body.getAttribute("data-world-name") || WORLD;
  var HOME = "index";
  var db = null;
  var root = document.getElementById("rules");
  var notes = [];          // [{path, title}]
  var byPath = {};
  var byBase = {};         // file name -> [paths]

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function current() { return new URLSearchParams(window.location.search).get("p") || HOME; }
  function href(path, anchor) { return "rules.html?p=" + encodeURIComponent(path) + (anchor ? "#" + anchorId(anchor) : ""); }
  function anchorId(s) {
    return "h-" + String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
        var r = await db.from("vault_notes").select("path,title").eq("world", WORLD).ilike("body", "%" + safe + "%").limit(25);
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
    var r = await db.from("vault_notes").select("path,title,body,updated_at").eq("world", WORLD).eq("path", path).maybeSingle();
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
      '<p class="rules-foot">From the Storytellers&rsquo; notes on <em>Vampire: the Dark Ages</em>, for the players of ' + esc(WORLD_NAME) + ' only. Please do not copy or share them.</p>';
    document.title = n.title + " · The rules · " + WORLD_NAME + " · VisTectus";
    // Headings get ids, so [[note#Heading]] lands on them.
    article.querySelectorAll(".rules-body h1, .rules-body h2, .rules-body h3, .rules-body h4").forEach(function (h) { h.id = anchorId(h.textContent); });
    // Links to other sites open in a new tab.
    article.querySelectorAll(".rules-body a[href]").forEach(function (a) {
      if (/^https?:/i.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener"; }
    });
    var target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }

  /* ------------------------------------------- update from Obsidian
     Storytellers only. The browser reads the chosen folder's notes and
     sends them to the database; nothing is kept anywhere else. */
  var SMALL = { of: 1, the: 1, and: 1, "in": 1, a: 1, to: 1 };
  var TITLE_OVERRIDE = {
    "factions/setite": "Followers of Set", "factions/salubri-healer": "Salubri (Healer)",
    "factions/salubri-warrior": "Salubri (Warrior)", "factions/salubri-watcher": "Salubri (Watcher)",
    "factions/true-brujah": "True Brujah", "disciplines/necromancy/the-graves-decay": "The Grave’s Decay",
    "index": "Rules index", "overview": "Overview"
  };
  function titleFor(path, body) {
    if (TITLE_OVERRIDE[path]) return TITLE_OVERRIDE[path];
    var h1 = /^#\s+(.+)$/m.exec(body);
    if (h1) return h1[1].trim();
    return path.split("/").pop().split("-").map(function (w, i) {
      return i && SMALL[w] ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }
  function stripFrontmatter(text) {
    return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  async function uploadPanel(open) {
    var box = document.getElementById("rulesUpload");
    var total = await db.from("vault_notes").select("path", { count: "exact", head: true }).eq("world", WORLD);
    var last = await db.from("vault_notes").select("updated_at").eq("world", WORLD).order("updated_at", { ascending: false }).limit(1);
    var state = total.error ? "The rules store is not set up yet (" + esc(errText(total.error)) + ")."
      : total.count ? total.count + " notes online, last updated " + esc(fmtDate(last.data[0].updated_at)) + "." : "No notes online yet.";
    box.innerHTML = "<details" + (open ? " open" : "") + '><summary>Update from Obsidian <small>(Storytellers only)</small></summary>' +
      '<p class="rules-status">' + state + "</p>" +
      "<ol class=\"rules-steps\">" +
        "<li>Make your changes in Obsidian as usual, in the folder of your vault that holds this world&rsquo;s Dark Ages rules (one note per page; its <code>index</code> note opens first).</li>" +
        "<li>Here, press <strong>Choose folder</strong> and pick that folder. Your browser may ask whether to upload the files: they are only read by this page and sent to the rules database.</li>" +
        "<li>Press <strong>Upload</strong>. Every note is copied, notes you have deleted in Obsidian are removed here, and players see the new version straight away.</li>" +
      "</ol>" +
      '<form class="rules-form" id="vaultForm"><label class="btn btn--ghost" for="vaultDir">Choose folder</label>' +
      '<input type="file" id="vaultDir" webkitdirectory directory multiple hidden>' +
      '<span class="rules-status" id="vaultPicked">No folder chosen.</span>' +
      '<button class="btn" type="submit" id="vaultSend" disabled>Upload</button></form>' +
      '<p class="rules-status" id="vaultMsg" role="status" aria-live="polite"></p></details>';
    var dir = document.getElementById("vaultDir"), send = document.getElementById("vaultSend");
    dir.addEventListener("change", function () {
      var n = Array.prototype.filter.call(dir.files, function (f) { return /\.md$/i.test(f.name); }).length;
      var top = dir.files.length ? (dir.files[0].webkitRelativePath || "").split("/")[0] : "";
      document.getElementById("vaultPicked").textContent = n ? n + " notes in “" + top + "”" : "That folder has no notes (.md files).";
      send.disabled = !n;
    });
    document.getElementById("vaultForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var files = Array.prototype.filter.call(dir.files, function (f) { return /\.md$/i.test(f.name); });
      var msg = document.getElementById("vaultMsg");
      if (!files.length) return;
      send.disabled = true;
      try {
        var list = [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          // "dark-ages/concepts/abilities.md" -> "concepts/abilities"
          var rel = (f.webkitRelativePath || f.name).replace(/\\/g, "/").split("/").slice(1).join("/").replace(/\.md$/i, "");
          if (!rel || !/^[A-Za-z0-9 ._\/-]{1,200}$/.test(rel)) { console.warn("Skipped", f.webkitRelativePath); continue; }
          var body = stripFrontmatter(await f.text());
          list.push({ path: rel, title: titleFor(rel, body), body: body });
        }
        if (!window.confirm("Upload " + list.length + " notes? Notes online that are not in this folder will be removed.")) {
          send.disabled = false; return;
        }
        var sent = 0, batch = [], size = 0;
        async function flush() {
          if (!batch.length) return;
          var r = await db.rpc("vault_sync_notes", { p_world: WORLD, p_notes: batch });
          if (r.error) throw r.error;
          sent += batch.length; batch = []; size = 0;
          msg.textContent = "Uploaded " + sent + " of " + list.length + "…";
        }
        for (var j = 0; j < list.length; j++) {
          batch.push(list[j]); size += list[j].body.length;
          if (size > 250000 || batch.length >= 40) await flush();
        }
        await flush();
        var pr = await db.rpc("vault_prune_notes", { p_world: WORLD, p_keep: list.map(function (n) { return n.path; }) });
        if (pr.error) throw pr.error;
        msg.textContent = "Done: " + sent + " notes uploaded" + (pr.data ? ", " + pr.data + " old ones removed" : "") + ". Reloading…";
        setTimeout(function () { window.location.reload(); }, 1500);
      } catch (err) {
        console.error(err);
        msg.textContent = "Upload stopped: " + errText(err);
        send.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------- start */
  async function start(gate) {
    db = gate.db;
    var st = gate.role === "storyteller";
    try {
      var r = await db.from("vault_notes").select("path,title").eq("world", WORLD).order("path", { ascending: true });
      if (r.error) throw r.error;
      notes = r.data || [];
      root.innerHTML = (st ? '<div id="rulesUpload" class="rules-upload"></div>' : "") +
        (notes.length ? '<div class="rules-layout"><aside class="rules-side" id="rulesSide"></aside>' +
                        '<article class="rules-article" id="rulesArticle"></article></div>'
                      : '<div class="sheet-notice">' + (st ? "No notes yet: upload them with the box above."
                          : "The Storytellers have not put the rules up yet.") + "</div>");
      if (st) uploadPanel(!notes.length);
      if (!notes.length) return;
      byPath = {}; byBase = {};
      notes.forEach(function (n) {
        byPath[n.path] = n;
        var base = n.path.split("/").pop().toLowerCase();
        (byBase[base] = byBase[base] || []).push(n.path);
      });
      var path = current();
      if (!byPath[path]) path = byPath[HOME] ? HOME : notes[0].path;
      document.getElementById("rulesSide").innerHTML = sidebar(path);
      wireSearch();
      await show(path);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="sheet-notice">The rules could not be reached just now: ' + esc(errText(e)) + "</div>";
    }
  }

  window.Gate.ready.then(start);
})();
