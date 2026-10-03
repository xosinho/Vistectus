/* =====================================================================
   THE DEAD HAND — character sheet
   ---------------------------------------------------------------------
   sheet.html?c=<slug> shows one hunter's sheet, laid out like the PDF.

   The sheet lives in the site's Supabase project (setup: the chronicle
   README and assets/sheets/sql/). If that cannot be reached, or the
   sheet is not online yet, the page shows the sheet as first published
   from assets/sheets/data/<slug>.json, read-only.

   Who may change what is decided by the database, not by this file:
     - anyone reads;
     - the player marks damage and keeps their own notes, equipment and
       the like, and asks to buy dots with XP;
     - the Storyteller approves purchases, awards XP and can edit
       everything.
   ===================================================================== */
(function () {
  "use strict";

  var TEMPLATE_PDF = "assets/sheets/pdf/blank-character-sheet.pdf";
  var PDF_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";

  var ATTRS = [
    ["Physical", ["strength", "dexterity", "stamina"]],
    ["Social",   ["charisma", "manipulation", "composure"]],
    ["Mental",   ["intelligence", "wits", "resolve"]]
  ];
  var SKILLS = [
    ["athletics", "brawl", "craft", "drive", "firearms", "larceny", "melee", "stealth", "survival"],
    ["animalken", "etiquette", "insight", "intimidation", "leadership", "performance", "persuasion", "streetwise", "subterfuge"],
    ["academics", "awareness", "finance", "investigation", "medicine", "occult", "politics", "science", "technology"]
  ];
  var ALL_SKILLS = [].concat.apply([], SKILLS);
  var LABELS = { animalken: "Animal Ken", drive: "Driving" };
  var MAX_ROWS = 11;          // Edges and Advantages: the PDF has room for eleven each

  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  /* sheet.html?c=<name> is a hunter's sheet. sheet.html?npc=<name> is an
     NPC sheet: Storyteller only. It is read from the npc_sheets table,
     which the database lets no one else read, and never from a file on
     the site. It has no XP: the Storyteller edits it directly. */
  var params = new URLSearchParams(window.location.search);
  var NPC = params.has("npc");
  var slug = ((NPC ? params.get("npc") : params.get("c")) || "").toLowerCase();

  var S = {
    sheet: null,          // {slug, name, data, play}
    online: false,        // false: the published file, read-only
    role: "viewer",       // viewer | owner | storyteller
    session: null,
    costs: {}, costList: [],
    requests: [], awards: [],
    spend: false,         // show prices next to traits
    edit: null,           // Storyteller editing: a working copy {data, play}
    newKind: "specialty",
    saveTimer: null, saving: false, saveFailed: false
  };

  if (NPC) {
    var back = document.querySelector('.sheet-bar a[href="players.html"]');
    if (back) { back.href = "storyteller.html"; back.innerHTML = "&larr; Storyteller"; }
    var crumb = document.querySelector('.crumbbar a[href="players.html"]');
    if (crumb) { crumb.href = "storyteller.html"; crumb.textContent = "Storyteller"; }
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.getAttribute("href") === "storyteller.html") a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var kicker = document.querySelector(".hero .kicker");
    if (kicker) kicker.textContent = "NPC sheet · Storyteller only";
  }

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function label(k) { return LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  function num(v, max) { v = parseInt(v, 10); return isNaN(v) ? 0 : Math.max(0, Math.min(max, v)); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function toast(msg) {
    var t = $("sheetToast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function setStatus(msg, isError) {
    var el = $("sheetStatus");
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  /* Fill in anything a sheet is missing, so rendering never trips. */
  function normalise(sheet) {
    var d = sheet.data = sheet.data || {}, p = sheet.play = sheet.play || {};
    d.attributes = d.attributes || {}; d.skills = d.skills || {};
    ATTRS.forEach(function (g) { g[1].forEach(function (k) { d.attributes[k] = num(d.attributes[k], 5); }); });
    ALL_SKILLS.forEach(function (k) { d.skills[k] = num(d.skills[k], 5); });
    d.specialties = Array.isArray(d.specialties) ? d.specialties : [];
    d.edges = (Array.isArray(d.edges) ? d.edges : []).map(function (e) {
      return { name: String(e.name || ""), perks: Array.isArray(e.perks) ? e.perks.map(String) : [], notes: String(e.notes || "") };
    });
    d.advantages = (Array.isArray(d.advantages) ? d.advantages : []).map(function (a) {
      return { name: String(a.name || ""), dots: num(a.dots, 5) };
    });
    ["name", "concept", "creed", "cell", "drive", "redemption", "tenets", "creedFields"].forEach(function (k) { d[k] = String(d[k] || ""); });
    // Optional Storyteller overrides for the number of Health and
    // Willpower boxes (a Discipline, a Merit...). Empty: the usual sums.
    ["healthMax", "willpowerMax"].forEach(function (k) {
      var n = parseInt(d[k], 10);
      d[k] = (n >= 1 && n <= 10) ? n : "";
    });
    function ten(a, n) { a = Array.isArray(a) ? a.slice(0, n) : []; while (a.length < n) a.push(""); return a; }
    p.health = ten(p.health, 10).map(mark);
    p.willpower = ten(p.willpower, 10).map(mark);
    p.equipment = ten(p.equipment, 14).map(String);
    // Despair runs 0-5. Sheets saved when it was a single box held true/false.
    p.despair = p.despair === true ? 1 : num(p.despair, 5);
    ["ambition", "desire", "touchstones", "notes", "age", "dob", "appearance", "features", "history"].forEach(function (k) { p[k] = String(p[k] || ""); });
    return sheet;
  }
  function mark(v) { v = String(v || "").trim().toUpperCase(); return v === "X" ? "X" : (v === "/" ? "/" : ""); }

  /* What is being shown: the Storyteller's working copy while editing. */
  function view() { return S.edit || S.sheet; }
  function canPlay() { return S.online && (S.role === "owner" || S.role === "storyteller"); }
  function canSpend() { return !NPC && canPlay(); }
  function isST() { return S.online && S.role === "storyteller"; }

  /* ---------------------------------------------------------------- XP */
  function sum(list, f) { return list.reduce(function (t, x) { return t + (f(x) || 0); }, 0); }
  function xp() {
    var total = sum(S.awards, function (a) { return a.amount; });
    var spent = sum(S.requests, function (r) { return r.status === "approved" ? r.cost : 0; });
    var pending = sum(S.requests, function (r) { return r.status === "pending" ? r.cost : 0; });
    return { total: total, spent: spent, pending: pending, available: total - spent - pending };
  }
  function costFor(kind, toLevel) {
    var c = S.costs[kind];
    if (!c || c.cost == null) return null;
    return c.per_level ? c.cost * toLevel : c.cost;
  }
  function pendingFor(kind, trait) {
    trait = String(trait).toLowerCase();
    return S.requests.filter(function (r) {
      return r.status === "pending" && r.kind === kind && String(r.trait).toLowerCase() === trait;
    }).length;
  }
  function describe(r) {
    switch (r.kind) {
      case "attribute": case "skill": return label(r.trait) + " " + r.from_level + " → " + r.to_level;
      case "advantage": return r.from_level === 0 ? "New Advantage: " + r.trait : r.trait + " " + r.from_level + " → " + r.to_level;
      case "specialty": return "Specialty: " + label(r.trait) + " (" + r.detail + ")";
      case "edge": return "Edge: " + r.trait;
      case "perk": return "Perk: " + r.detail + " (" + r.trait + ")";
    }
    return r.kind;
  }
  function costRule(c) {
    if (c.cost == null) return "Not set yet";
    return c.per_level ? "New level × " + c.cost : c.cost + " XP";
  }

  /* ---------------------------------------------------------- pieces */
  function dots(kind, key, level, pending, editable) {
    var h = '<span class="dots" role="img" aria-label="' + level + ' of 5' + (pending ? ", " + pending + " waiting" : "") + '">';
    for (var i = 1; i <= 5; i++) {
      var cls = i <= level ? "dot on" : (i <= level + pending ? "dot pending" : "dot");
      h += editable
        ? '<button type="button" class="' + cls + '" data-action="dot" data-kind="' + kind + '" data-key="' + esc(key) + '" data-n="' + i + '" aria-label="Set to ' + i + '"></button>'
        : '<span class="' + cls + '"></span>';
    }
    return h + "</span>";
  }

  function buyChip(kind, trait, level) {
    if (!S.spend || !canSpend() || S.edit) return "";
    var next = level + pendingFor(kind, trait) + 1;
    if (next > 5) return "";
    var cost = costFor(kind, next), avail = xp().available;
    var ok = cost != null && cost <= avail;
    return '<button type="button" class="buy" data-action="buy" data-kind="' + kind + '" data-trait="' + esc(trait) + '"' +
      (ok ? "" : " disabled") + ' title="' + (cost == null ? "No cost set yet" : "Raise to " + next + " for " + cost + " XP") + '">' +
      (cost == null ? "—" : "+" + cost + " XP") + "</button>";
  }

  function trait(kind, key, name, sub, level) {
    var editable = !!S.edit;
    return '<div class="trait"><span class="trait-name">' + esc(name) + (sub ? "<small>" + esc(sub) + "</small>" : "") +
      '</span><span class="trait-end">' + buyChip(kind, key, level) +
      dots(kind, key, level, S.edit ? 0 : pendingFor(kind, key), editable) + "</span></div>";
  }

  // A line of text: an input when this visitor may change it.
  function field(name, src, key, cls) {
    var v = view()[src][key];
    var editable = src === "play" ? canPlay() : !!S.edit;
    return '<div class="field ' + (cls || "") + '"><b>' + esc(name) + "</b>" +
      (editable ? '<input data-src="' + src + '" data-key="' + key + '" value="' + esc(v) + '" aria-label="' + esc(name) + '">'
                : '<span class="val">' + esc(v) + "</span>") + "</div>";
  }
  function area(src, key, rows, name) {
    var v = view()[src][key];
    var editable = src === "play" ? canPlay() : !!S.edit;
    return editable
      ? '<textarea data-src="' + src + '" data-key="' + key + '" rows="' + (rows || 6) + '" aria-label="' + esc(name) + '">' + esc(v) + "</textarea>"
      : '<div class="prose-box">' + (v ? esc(v) : "") + "</div>";
  }

  function boxes(track, values, max) {
    var editable = canPlay();
    var h = '<span class="boxes">';
    for (var i = 0; i < 10; i++) {
      if (i === 5) h += '<span class="gap"></span>';
      if (i >= max) { h += '<span class="box off" title="Beyond this hunter\'s ' + track + '"></span>'; continue; }
      var v = values[i];
      h += editable
        ? '<button type="button" class="box" data-action="box" data-track="' + track + '" data-i="' + i + '" aria-label="' + track + " box " + (i + 1) + ": " + (v === "X" ? "aggravated" : v === "/" ? "superficial" : "empty") + '">' + esc(v) + "</button>"
        : '<span class="box">' + esc(v) + "</span>";
    }
    return h + "</span>";
  }

  function despairBoxes(level) {
    var h = '<span class="boxes" role="group" aria-label="Despair, ' + level + ' of 5">';
    for (var i = 1; i <= 5; i++) {
      var cls = "box despair" + (i <= level ? " on" : "");
      h += canPlay()
        ? '<button type="button" class="' + cls + '" data-action="despair" data-n="' + i + '" aria-label="Set Despair to ' + (level === i ? i - 1 : i) + '"></button>'
        : '<span class="' + cls + '"></span>';
    }
    return h + "</span>";
  }

  /* ------------------------------------------------------------ page 1 */
  function page1() {
    var v = view(), d = v.data, p = v.play;
    var h = '<section class="page" aria-label="Character sheet, page one">';
    h += '<div class="sheet-head"><div class="sheet-band"><strong>Hunter</strong><span>The Reckoning</span></div><div class="sheet-ident">' +
      field("Name", "data", "name") + field("Concept", "data", "concept") + field("Creed", "data", "creed") +
      field("Cell", "data", "cell") + field("Drive", "data", "drive") + field("Redemption", "data", "redemption") +
      field("Ambition", "play", "ambition", "full") + field("Desire", "play", "desire", "full") + "</div></div>";

    h += "<h3>Attributes</h3><div class=\"cols3\">";
    ATTRS.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (k) { h += trait("attribute", k, label(k), "", d.attributes[k]); });
      h += "</div>";
    });
    h += "</div>";

    var hSum = Math.min(10, d.attributes.stamina + 3), wSum = Math.min(10, d.attributes.composure + d.attributes.resolve);
    var hMax = d.healthMax || hSum, wMax = d.willpowerMax || wSum;
    function trackerNote(key, max, sumText, sum) {
      if (S.edit) {
        return '<span class="tracker-note">Boxes <input class="num" type="number" min="1" max="10" data-src="data" data-key="' + key +
          '" value="' + (d[key] || "") + '" placeholder="' + sum + '" aria-label="Number of boxes; empty for ' + sumText + '"> (empty: ' + sumText + ")</span>";
      }
      return '<span class="tracker-note">' + (d[key] ? "Set by the Storyteller: " + max : sumText + " = " + max) + "</span>";
    }
    h += '<div class="trackers">' +
      '<div class="tracker"><h4>Health</h4>' + boxes("health", p.health, hMax) + trackerNote("healthMax", hMax, "Stamina + 3", hSum) + "</div>" +
      '<div class="tracker"><h4>Willpower</h4>' + boxes("willpower", p.willpower, wMax) + trackerNote("willpowerMax", wMax, "Composure + Resolve", wSum) + "</div>" +
      '<div class="tracker"><h4>Despair</h4>' + despairBoxes(p.despair) +
        '<span class="tracker-note">' + p.despair + " of 5</span></div></div>";
    if (canPlay()) h += '<p class="tracker-note" style="text-align:center">Click a box to mark it: once for superficial ( / ), twice for aggravated ( X ), a third time to clear.</p>';

    h += "<h3>Skills</h3><div class=\"cols3 skills\">";
    SKILLS.forEach(function (col) {
      h += "<div>";
      col.forEach(function (k) {
        var specs = d.specialties.filter(function (s) { return s.skill === k; }).map(function (s) { return s.name; }).join(", ");
        h += trait("skill", k, label(k), specs, d.skills[k]);
      });
      h += "</div>";
    });
    h += "</div>";
    h += S.edit ? specialtyEditor(d) : specialtiesBox(d);

    h += "<h3>Edges and Perks</h3>" + edgesTable(d);
    return h + "</section>";
  }

  /* Specialties get a box of their own under the Skills, the way the
     printed form gives Edges theirs. The rules require one for any dot in
     Academics, Craft, Performance or Science: a missing one shows as
     "to be chosen", so the gap is plain to player and Storyteller alike. */
  var NEEDS_SPECIALTY = ["academics", "craft", "performance", "science"];
  function specialtiesBox(d) {
    var rows = d.specialties.map(function (s) {
      return '<li><b>' + esc(label(s.skill)) + ':</b> ' + esc(s.name) + "</li>";
    });
    S.requests.forEach(function (r) {
      if (r.kind === "specialty" && r.status === "pending") {
        rows.push('<li class="spec-waiting"><b>' + esc(label(r.trait)) + ":</b> " + esc(r.detail) + " <small>(awaiting approval)</small></li>");
      }
    });
    var has = {};
    d.specialties.forEach(function (s) { has[s.skill] = true; });
    NEEDS_SPECIALTY.forEach(function (k) {
      if (d.skills[k] > 0 && !has[k]) rows.push('<li class="spec-missing"><b>' + label(k) + ":</b> to be chosen</li>");
    });
    return '<div class="spec-box"><h4>Specialties</h4>' +
      (rows.length ? '<ul class="spec-list">' + rows.join("") + "</ul>" : '<p class="spec-none">None yet.</p>') + "</div>";
  }

  function specialtyEditor(d) {
    var opts = function (sel) {
      return ALL_SKILLS.map(function (k) { return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + label(k) + "</option>"; }).join("");
    };
    var h = '<table class="grid-table" style="margin-top:.8rem"><tr><th style="width:35%">Specialty: skill</th><th>Name</th><th></th></tr>';
    d.specialties.forEach(function (s, i) {
      h += '<tr><td><select data-list="specialties" data-i="' + i + '" data-field="skill">' + opts(s.skill) + "</select></td>" +
        '<td><input data-list="specialties" data-i="' + i + '" data-field="name" value="' + esc(s.name) + '"></td>' +
        '<td><button type="button" class="mini" data-action="del-row" data-list="specialties" data-i="' + i + '">Remove</button></td></tr>';
    });
    return h + '</table><p><button type="button" class="mini" data-action="add-row" data-list="specialties">+ Specialty</button></p>';
  }

  function edgesTable(d) {
    var h = '<table class="grid-table"><tr><th style="width:32%">Edge</th><th style="width:34%">Perks</th><th>Notes</th>' + (S.edit ? "<th></th>" : "") + "</tr>";
    if (!d.edges.length && !S.edit) h += '<tr><td class="empty" colspan="3">No Edges yet.</td></tr>';
    d.edges.forEach(function (e, i) {
      if (S.edit) {
        h += '<tr><td><input data-list="edges" data-i="' + i + '" data-field="name" value="' + esc(e.name) + '" aria-label="Edge"></td>' +
          '<td><input data-list="edges" data-i="' + i + '" data-field="perks" value="' + esc(e.perks.join("; ")) + '" aria-label="Perks, separated by semicolons" placeholder="Perks; separated; by semicolons"></td>' +
          '<td><input data-list="edges" data-i="' + i + '" data-field="notes" value="' + esc(e.notes) + '" aria-label="Notes"></td>' +
          '<td><button type="button" class="mini" data-action="del-row" data-list="edges" data-i="' + i + '">Remove</button></td></tr>';
      } else {
        h += "<tr><td><b>" + esc(e.name) + "</b></td><td>" +
          (e.perks.length ? "<ul>" + e.perks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
          "</td><td>" + esc(e.notes) + "</td></tr>";
      }
    });
    h += "</table>";
    if (S.edit && d.edges.length < MAX_ROWS) h += '<p><button type="button" class="mini" data-action="add-row" data-list="edges">+ Edge</button></p>';
    return h;
  }

  /* ------------------------------------------------------------ page 2 */
  function page2() {
    var v = view(), d = v.data, p = v.play, x = xp();
    var h = '<section class="page" aria-label="Character sheet, page two">';
    h += '<div class="page2-top"><strong style="font-family:var(--sheet-head);font-size:1.3rem">' + esc(d.name) + "</strong>" +
      (NPC ? "" : '<div class="xp-figures"><div>Total Experience <span>' + (S.online ? x.total : "") + "</span></div>" +
      "<div>Spent Experience <span>" + (S.online ? x.spent : "") + "</span></div></div>") + "</div>";

    h += '<div class="boxes3"><div><h4>Chronicle Tenets</h4>' + area("data", "tenets", 7, "Chronicle Tenets") + "</div>" +
      "<div><h4>Touchstones</h4>" + area("play", "touchstones", 7, "Touchstones") + "</div>" +
      "<div><h4>Creed Fields</h4>" + area("data", "creedFields", 7, "Creed Fields") + "</div></div>";

    h += '<div class="split"><div><h3>Advantages &amp; Flaws</h3><div>';
    if (!d.advantages.length && !S.edit) h += '<div class="adv-row"><span class="empty-line">None yet.</span></div>';
    d.advantages.forEach(function (a, i) {
      if (S.edit) {
        h += '<div class="adv-row"><input data-list="advantages" data-i="' + i + '" data-field="name" value="' + esc(a.name) + '" aria-label="Advantage or Flaw">' +
          '<span class="trait-end">' + dots("advantage", String(i), a.dots, 0, true) +
          '<button type="button" class="mini" data-action="del-row" data-list="advantages" data-i="' + i + '" aria-label="Remove">✕</button></span></div>';
      } else {
        h += '<div class="adv-row"><span class="trait-name">' + esc(a.name) + '</span><span class="trait-end">' +
          (/\(flaw\)/i.test(a.name) ? "" : buyChip("advantage", a.name, a.dots)) +
          dots("advantage", a.name, a.dots, pendingFor("advantage", a.name), false) + "</span></div>";
      }
    });
    // Brand-new Advantages bought but not yet approved.
    if (!S.edit) {
      var seen = {};
      S.requests.forEach(function (r) {
        var key = String(r.trait).toLowerCase();
        if (r.kind === "advantage" && r.status === "pending" && r.from_level === 0 && !seen[key]) {
          seen[key] = true;
          h += '<div class="adv-row"><span class="trait-name">' + esc(r.trait) + " <small>(waiting)</small></span>" +
            dots("advantage", r.trait, 0, pendingFor("advantage", r.trait), false) + "</div>";
        }
      });
    }
    h += "</div>";
    if (S.edit && d.advantages.length < MAX_ROWS) h += '<p><button type="button" class="mini" data-action="add-row" data-list="advantages">+ Advantage or Flaw</button></p>';
    h += "</div>";

    h += "<div><h3>Equipment</h3><div class=\"equip\">";
    p.equipment.forEach(function (e, i) {
      h += canPlay()
        ? '<input data-src="play" data-key="equipment" data-i="' + i + '" value="' + esc(e) + '" aria-label="Equipment ' + (i + 1) + '">'
        : "<span>" + esc(e) + "</span>";
    });
    h += '</div><div style="margin-top:1rem">' +
      '<div class="labelled"><b>Age</b>' + line("age") + "</div>" +
      '<div class="labelled"><b>Date of birth</b>' + line("dob") + "</div>" +
      '<div class="labelled"><b>Appearance</b>' + area("play", "appearance", 4, "Appearance") + "</div>" +
      '<div class="labelled"><b>Distinguishing features</b>' + area("play", "features", 3, "Distinguishing features") + "</div>" +
      '<div class="labelled"><b>History</b>' + area("play", "history", 10, "History") + "</div>" +
      "</div></div></div>";

    h += "<h3>Notes</h3><div class=\"labelled\" style=\"border-top:1px solid var(--paper-ink)\">" + area("play", "notes", 8, "Notes") + "</div>";
    return h + "</section>";
  }
  function line(key) {
    var v = view().play[key];
    return canPlay() ? '<input data-src="play" data-key="' + key + '" value="' + esc(v) + '">' : "<span>" + esc(v) + "</span>";
  }

  /* -------------------------------------------------- experience panel */
  function xpPanel() {
    if (!S.online || NPC) return "";
    var x = xp(), d = S.sheet.data;
    var h = '<section class="xp-panel" aria-labelledby="xpTitle"><h2 id="xpTitle">Experience</h2>' +
      '<div class="xp-stats">' +
        '<div class="xp-stat"><b>' + x.total + "</b><span>Awarded</span></div>" +
        '<div class="xp-stat"><b>' + x.spent + "</b><span>Spent</span></div>" +
        '<div class="xp-stat"><b>' + x.pending + "</b><span>Awaiting approval</span></div>" +
        '<div class="xp-stat is-key"><b>' + x.available + "</b><span>Available</span></div></div>";

    if (S.role === "owner") {
      h += '<p class="xp-hint">Press <strong>Spend XP</strong> above the sheet to show the price of the next dot beside each Attribute, Skill and Advantage, or buy something new below. Each purchase waits for the Storyteller&rsquo;s approval; until then its dots show striped, and you can withdraw it.</p>';
    } else if (S.role === "storyteller") {
      h += '<p class="xp-hint">You can approve, reject or refund purchases below, award XP, and edit the whole sheet with <strong>Edit sheet</strong>.</p>';
    } else {
      h += '<p class="xp-hint">XP is spent by the player and approved by the Storyteller. ' + (S.session ? "" : "Sign in to spend XP on your own hunter.") + "</p>";
    }

    if (canSpend()) h += newPurchaseForm(d, x);

    h += '<h3>Purchase costs</h3><table class="xp-table"><tr><th>Buying</th><th class="num">Cost</th></tr>';
    S.costList.forEach(function (c) { h += "<tr><td>" + esc(c.label) + '</td><td class="num">' + esc(costRule(c)) + "</td></tr>"; });
    h += '</table><p class="xp-hint" style="margin-top:.5rem">Buying a dot costs the new level times the figure shown: Wits 3 &rarr; 4 costs 4 &times; 5 = 20 XP. Each dot is bought separately.</p>';

    h += "<h3>Purchases</h3>";
    if (!S.requests.length) h += '<p class="empty-line">Nothing bought yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Date</th><th>Purchase</th><th class="num">XP</th><th>Status</th><th></th></tr>';
      S.requests.forEach(function (r) {
        var acts = "";
        if (r.status === "pending" && S.role === "storyteller") {
          acts = '<button class="btn" data-action="approve" data-id="' + r.id + '">Approve</button> ' +
                 '<button class="btn btn--ghost" data-action="reject" data-id="' + r.id + '">Reject</button>';
        } else if (r.status === "pending" && S.role === "owner") {
          acts = '<button class="btn btn--ghost" data-action="withdraw" data-id="' + r.id + '">Withdraw</button>';
        } else if (r.status === "approved" && S.role === "storyteller") {
          acts = '<button class="btn btn--ghost" data-action="refund" data-id="' + r.id + '">Refund</button>';
        }
        h += "<tr><td>" + esc(fmtDate(r.requested_at)) + "</td><td>" + esc(describe(r)) +
          (r.note ? '<span class="note">' + esc(r.note) + "</span>" : "") + '</td><td class="num">' + r.cost +
          '</td><td><span class="status status-' + esc(r.status) + '">' + esc(r.status === "pending" ? "awaiting approval" : r.status) + "</span></td>" +
          '<td class="acts">' + acts + "</td></tr>";
      });
      h += "</table>";
    }

    h += "<h3>XP awarded</h3>";
    if (!S.awards.length) h += '<p class="empty-line">No XP awarded yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Date</th><th>For</th><th class="num">XP</th><th></th></tr>';
      S.awards.forEach(function (a) {
        h += "<tr><td>" + esc(fmtDate(a.awarded_at)) + "</td><td>" + esc(a.note) + '</td><td class="num">' + (a.amount > 0 ? "+" : "") + a.amount +
          '</td><td class="acts">' + (isST() ? '<button class="btn btn--ghost" data-action="del-award" data-id="' + a.id + '">Remove</button>' : "") + "</td></tr>";
      });
      h += "</table>";
    }
    if (isST()) {
      h += '<form class="xp-form" id="awardForm" style="margin-top:.8rem">' +
        '<label>XP<input class="num" type="number" name="amount" step="1" required value="1"></label>' +
        '<label>For<input name="note" maxlength="200" placeholder="e.g. Session 5"></label>' +
        '<button class="btn" type="submit">Award XP</button></form>' +
        '<p class="xp-hint" style="margin-top:.4rem">A negative number takes XP away, as long as it does not leave less than has been spent.</p>';
    }
    return h + "</section>";
  }

  function newPurchaseForm(d, x) {
    var k = S.newKind;
    var kinds = [["specialty", "A Specialty"], ["advantage", "A new Advantage"], ["edge", "An Edge"], ["perk", "A Perk"]];
    var h = '<h3>Buy something new</h3><form class="xp-form" id="buyNewForm"><label>What<select name="kind" id="newKind">' +
      kinds.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === k ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
    if (k === "specialty") {
      var have = ALL_SKILLS.filter(function (s) { return d.skills[s] > 0; });
      h += '<label>Skill<select name="trait">' + have.map(function (s) { return '<option value="' + s + '">' + label(s) + "</option>"; }).join("") + "</select></label>" +
        '<label>Specialty<input name="detail" maxlength="80" required placeholder="e.g. Paper trails"></label>';
    } else if (k === "perk") {
      if (!d.edges.length) return h + '</form><p class="xp-hint">A Perk belongs to an Edge, and this sheet has none yet.</p>';
      h += '<label>Edge<select name="trait">' + d.edges.map(function (e) { return '<option value="' + esc(e.name) + '">' + esc(e.name) + "</option>"; }).join("") + "</select></label>" +
        '<label>Perk<input name="detail" maxlength="80" required></label>';
    } else {
      h += '<label>Name<input name="trait" maxlength="80" required placeholder="' + (k === "edge" ? "e.g. Beast Hunter" : "e.g. Allies (a court clerk)") + '"></label>';
    }
    var cost = costFor(k, 1);
    h += '<button class="btn" type="submit"' + (cost == null || cost > x.available ? " disabled" : "") + ">" +
      (cost == null ? "No cost set yet" : "Request for " + cost + " XP") + "</button></form>";
    return h;
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (!S.sheet) return;
    $("sheet").innerHTML = page1() + page2();
    $("xp").innerHTML = xpPanel();
    var name = view().data.name || (NPC ? "NPC sheet" : "Character sheet");
    $("sheetTitle").textContent = name;
    $("crumbName").textContent = name;
    document.title = name + (NPC ? " · NPC sheet" : " · Character sheet") + " · Dead Hand · VisTectus";

    $("btnSpend").hidden = !canSpend() || !!S.edit;
    $("btnSpend").textContent = S.spend ? "Hide prices" : "Spend XP";
    $("btnSpend").setAttribute("aria-pressed", S.spend ? "true" : "false");
    $("btnEdit").hidden = !isST() || !!S.edit;
    $("btnSaveSheet").hidden = !S.edit;
    $("btnCancelEdit").hidden = !S.edit;
    $("btnAccount").hidden = !db;
    $("btnAccount").textContent = S.session ? "Sign out" : "Sign in";
    $("btnAccount").title = S.session && S.session.user ? "Signed in as " + S.session.user.email : "Sign in to update your hunter";
    if (!S.saving && !S.saveFailed) setStatus(roleLine());
  }
  function roleLine() {
    if (!S.online) return "";
    if (S.edit) return "Editing the whole sheet: nothing is saved until you press Save sheet.";
    if (NPC) return "Storyteller only: players cannot see this sheet. Damage and notes save as you go.";
    if (S.role === "storyteller") return "Storyteller: you can change anything on this sheet.";
    if (S.role === "owner") return "Your hunter: damage, notes and equipment save as you go.";
    return S.session ? "You are viewing another hunter's sheet." : "";
  }

  /* ------------------------------------------------------------ loading */
  async function fetchOnline() {
    if (NPC) return fetchNpc();
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name,data,play").eq("slug", slug).maybeSingle(),
      db.from("xp_costs").select("kind,label,cost,per_level,sort").order("sort", { ascending: true }),
      db.from("xp_requests").select("*").eq("slug", slug).order("requested_at", { ascending: false }),
      db.from("xp_awards").select("*").eq("slug", slug).order("awarded_at", { ascending: false })
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    if (!r[0].data) return false;
    S.sheet = normalise(r[0].data);
    S.costList = r[1].data || [];
    S.costs = {};
    S.costList.forEach(function (c) { S.costs[c.kind] = c; });
    S.requests = r[2].data || [];
    S.awards = r[3].data || [];
    S.online = true;
    S.session = (await db.auth.getSession()).data.session;
    S.role = "viewer";
    if (S.session) {
      var role = await db.rpc("sheet_role", { p_slug: slug });
      if (!role.error && role.data) S.role = role.data;
    }
    return true;
  }

  // NPC sheets: signed in, a Storyteller, and only then the sheet itself.
  async function fetchNpc() {
    S.session = (await db.auth.getSession()).data.session;
    S.online = false; S.role = "viewer";
    if (!S.session) return "signin";
    var st = await db.rpc("is_storyteller");
    if (st.error || st.data !== true) return "denied";
    var r = await db.from("npc_sheets").select("slug,name,data,play").eq("slug", slug).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return false;
    S.sheet = normalise(r.data);
    S.costList = []; S.costs = {}; S.requests = []; S.awards = [];
    S.online = true; S.role = "storyteller";
    return true;
  }

  function storytellerOnly(why) {
    setStatus("");
    S.sheet = null;
    $("sheetTitle").textContent = "NPC sheet";
    $("crumbName").textContent = "NPC sheet";
    $("xp").innerHTML = "";
    $("btnPdf").hidden = true;
    $("btnAccount").hidden = !db || !S.session;
    $("btnAccount").textContent = "Sign out";
    var msg = {
      signin: 'NPC sheets are for the Storyteller. <a href="storyteller.html">Sign in on the Storyteller page</a>, then open the sheet from there.',
      denied: "NPC sheets are for the Storyteller, and this account is not one.",
      error: "The NPC sheets could not be reached just now. Try again in a moment."
    }[why] || 'There is no NPC sheet at this address. Open one from the <a href="storyteller.html">Storyteller page</a>.';
    $("sheet").innerHTML = '<div class="sheet-notice">' + msg + "</div>";
  }

  async function fetchPublished() {
    var res = await fetch("assets/sheets/data/" + slug + ".json", { cache: "no-cache" });
    if (!res.ok) return false;
    var j = await res.json();
    S.sheet = normalise({ slug: slug, name: j.data && j.data.name, data: j.data, play: j.play });
    S.online = false;
    return true;
  }

  async function load() {
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return NPC ? storytellerOnly(false) : notFound();
    setStatus("Opening the sheet…");
    if (NPC) {
      var got = "error";
      if (db) { try { got = await fetchNpc(); } catch (e) { console.error(e); got = "error"; } }
      if (got !== true) return storytellerOnly(got);
      $("sheetNotice").hidden = true;
      $("btnPdf").hidden = false;
      setStatus("");
      render();
      return;
    }
    var ok = false, reason = "";
    if (db) {
      try { ok = await fetchOnline(); if (!ok) reason = "This sheet is not online yet."; }
      catch (e) { console.error(e); reason = "The online sheet could not be reached."; }
    } else {
      reason = "Online sheets are not connected.";
    }
    if (!ok) {
      try { ok = await fetchPublished(); } catch (e) { console.error(e); }
      if (!ok) return notFound();
      $("sheetNotice").hidden = false;
      $("sheetNotice").textContent = reason + " Showing the sheet as first published; it cannot be changed here.";
    } else {
      $("sheetNotice").hidden = true;
    }
    setStatus("");
    render();
    // A link to #xpTitle (from the Storyteller page) arrives before the sheet is drawn.
    var target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
  }

  async function reload() {
    if (NPC) return load();
    try { await fetchOnline(); }
    catch (e) { console.error(e); toast("Could not refresh the sheet: " + errText(e)); }
    render();
  }

  function notFound() {
    setStatus("");
    $("sheetTitle").textContent = "No such sheet";
    $("sheet").innerHTML = '<div class="sheet-notice">There is no character sheet at this address. Go back to <a href="players.html">the cell</a> and open a hunter from there.</div>';
  }

  /* ------------------------------------------------------------- saving */
  function savePlaySoon() {
    if (!canPlay() || S.edit) return;
    clearTimeout(S.saveTimer);
    S.saving = true; S.saveFailed = false;
    setStatus("Saving…");
    S.saveTimer = setTimeout(savePlay, 900);
  }
  async function savePlay() {
    try {
      var r = NPC
        ? await db.from("npc_sheets").update({ play: S.sheet.play, updated_at: new Date().toISOString() }).eq("slug", slug)
        : await db.rpc("save_play", { p_slug: slug, p_play: S.sheet.play });
      if (r.error) throw r.error;
      S.saving = false;
      setStatus("Saved.");
      setTimeout(function () { if (!S.saving && !S.saveFailed) setStatus(roleLine()); }, 1800);
    } catch (e) {
      console.error(e);
      S.saving = false; S.saveFailed = true;
      setStatus("Not saved: " + errText(e), true);
    }
  }

  async function rpc(fn, args, done) {
    try {
      var r = await db.rpc(fn, args);
      if (r.error) throw r.error;
      if (done) toast(done);
    } catch (e) {
      console.error(e);
      window.alert(errText(e));
    }
    await reload();
  }

  /* ------------------------------------------------------------ actions */
  function list(name) { return view().data[name]; }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b || !S.sheet) return;
    var a = b.getAttribute("data-action"), v = view();

    if (a === "box" && canPlay()) {
      var track = b.getAttribute("data-track"), i = +b.getAttribute("data-i");
      var cur = v.play[track][i];
      v.play[track][i] = cur === "" ? "/" : (cur === "/" ? "X" : "");
      render(); savePlaySoon();
    } else if (a === "despair" && canPlay()) {
      // Fill up to the box clicked; clicking the last filled box steps back one.
      var n = +b.getAttribute("data-n");
      v.play.despair = v.play.despair === n ? n - 1 : n;
      render(); savePlaySoon();
    } else if (a === "dot" && S.edit) {
      var kind = b.getAttribute("data-kind"), key = b.getAttribute("data-key"), n = +b.getAttribute("data-n");
      if (kind === "advantage") {
        var row = v.data.advantages[+key];
        row.dots = row.dots === n ? n - 1 : n;
      } else {
        var grp = v.data[kind + "s"];
        grp[key] = grp[key] === n ? n - 1 : n;
      }
      render();
    } else if (a === "add-row" && S.edit) {
      var ln = b.getAttribute("data-list");
      if (ln === "edges") list("edges").push({ name: "", perks: [], notes: "" });
      if (ln === "advantages") list("advantages").push({ name: "", dots: 0 });
      if (ln === "specialties") list("specialties").push({ skill: "academics", name: "" });
      render();
    } else if (a === "del-row" && S.edit) {
      list(b.getAttribute("data-list")).splice(+b.getAttribute("data-i"), 1);
      render();
    } else if (a === "buy") {
      buy(b.getAttribute("data-kind"), b.getAttribute("data-trait"));
    } else if (a === "approve") {
      rpc("approve_xp_request", { p_id: +b.getAttribute("data-id"), p_note: "" }, "Approved: it is on the sheet now.");
    } else if (a === "reject") {
      var why = window.prompt("Reject this purchase? You can add a reason for the player (optional):", "");
      if (why !== null) rpc("close_xp_request", { p_id: +b.getAttribute("data-id"), p_note: why }, "Rejected; the XP is free again.");
    } else if (a === "withdraw") {
      if (window.confirm("Withdraw this purchase? Any later purchase of the same trait is withdrawn with it.")) {
        rpc("close_xp_request", { p_id: +b.getAttribute("data-id"), p_note: "" }, "Withdrawn; the XP is free again.");
      }
    } else if (a === "refund") {
      var note = window.prompt("Refund this purchase? The dot comes off the sheet and the XP goes back. Note for the player (optional):", "");
      if (note !== null) rpc("refund_xp_request", { p_id: +b.getAttribute("data-id"), p_note: note }, "Refunded.");
    } else if (a === "del-award") {
      if (window.confirm("Remove this XP award?")) rpc("delete_xp_award", { p_id: +b.getAttribute("data-id") }, "Award removed.");
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!S.sheet || !t.matches("[data-src], [data-list]")) return;
    var v = view();
    if (t.hasAttribute("data-list")) {
      if (!S.edit) return;
      var row = v.data[t.getAttribute("data-list")][+t.getAttribute("data-i")];
      var f = t.getAttribute("data-field");
      row[f] = f === "perks" ? t.value.split(/\s*;\s*/).filter(Boolean) : t.value;
      return;
    }
    var src = t.getAttribute("data-src"), key = t.getAttribute("data-key");
    if (src === "data" && !S.edit) return;
    if (src === "play" && !canPlay()) return;
    if (t.hasAttribute("data-i")) v[src][key][+t.getAttribute("data-i")] = t.value;
    else v[src][key] = t.value;
    if (src === "play") savePlaySoon();
  });

  // Choosing a skill for a specialty is a <select>: it fires change, not input.
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "newKind") { S.newKind = t.value; render(); return; }
    if (S.edit && t.matches("select[data-list]")) {
      view().data[t.getAttribute("data-list")][+t.getAttribute("data-i")][t.getAttribute("data-field")] = t.value;
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id === "awardForm") {
      e.preventDefault();
      var f = e.target, amount = parseInt(f.amount.value, 10);
      if (!amount) { window.alert("Award a number of XP other than zero."); return; }
      rpc("award_xp", { p_slug: slug, p_amount: amount, p_note: f.note.value.trim() },
        (amount > 0 ? "+" : "") + amount + " XP awarded.");
    } else if (e.target.id === "buyNewForm") {
      e.preventDefault();
      var g = e.target, kind = g.kind.value;
      var traitVal = (g.trait && g.trait.value || "").trim(), detail = (g.detail && g.detail.value || "").trim();
      var cost = costFor(kind, 1);
      var what = kind === "specialty" ? "the Specialty " + label(traitVal) + " (" + detail + ")"
        : kind === "perk" ? "the Perk " + detail + " for " + traitVal
        : (kind === "edge" ? "the Edge " : "the Advantage ") + traitVal;
      if (!window.confirm("Ask to buy " + what + " for " + cost + " XP? The Storyteller approves it before it goes on your sheet.")) return;
      rpc("request_xp", { p_slug: slug, p_kind: kind, p_trait: traitVal, p_detail: detail },
        "Requested. It shows on your sheet once the Storyteller approves it.");
    }
  });

  function buy(kind, traitKey) {
    var d = view().data, level;
    if (kind === "advantage") {
      var row = d.advantages.filter(function (a) { return a.name.toLowerCase() === traitKey.toLowerCase(); })[0];
      level = row ? row.dots : 0;
    } else {
      level = d[kind + "s"][traitKey];
    }
    var next = level + pendingFor(kind, traitKey) + 1, cost = costFor(kind, next);
    var name = kind === "advantage" ? traitKey : label(traitKey);
    if (!window.confirm("Ask to raise " + name + " to " + next + " for " + cost + " XP?\n\nThe Storyteller approves it before it goes on your sheet. Until then it shows striped, and you can withdraw it.")) return;
    rpc("request_xp", { p_slug: slug, p_kind: kind, p_trait: traitKey, p_detail: "" },
      "Requested: " + name + " " + next + ". It goes on your sheet once approved.");
  }

  /* ----------------------------------------------------- toolbar buttons */
  $("btnSpend").addEventListener("click", function () { S.spend = !S.spend; render(); });

  $("btnEdit").addEventListener("click", function () {
    S.edit = JSON.parse(JSON.stringify({ data: S.sheet.data, play: S.sheet.play }));
    S.spend = false;
    render();
  });
  $("btnCancelEdit").addEventListener("click", function () {
    if (!window.confirm("Discard your changes to the sheet?")) return;
    S.edit = null; render();
  });
  $("btnSaveSheet").addEventListener("click", async function () {
    var e = S.edit;
    e.data.specialties = e.data.specialties.filter(function (s) { return s.name.trim(); });
    e.data.edges = e.data.edges.filter(function (x) { return x.name.trim() || x.perks.length || x.notes.trim(); });
    e.data.advantages = e.data.advantages.filter(function (x) { return x.name.trim() || x.dots; });
    setStatus("Saving…");
    try {
      var r = NPC
        ? await db.from("npc_sheets").update({ name: (e.data.name || "").trim() || S.sheet.name, data: e.data, play: e.play,
            updated_at: new Date().toISOString() }).eq("slug", slug)
        : await db.rpc("save_sheet", { p_slug: slug, p_data: e.data, p_play: e.play });
      if (r.error) throw r.error;
      S.edit = null;
      toast("Sheet saved.");
      await reload();
    } catch (err) {
      console.error(err);
      setStatus("Not saved: " + errText(err), true);
    }
  });

  $("btnPdf").addEventListener("click", downloadPdf);

  /* ------------------------------------------------------------ signing in */
  $("btnAccount").addEventListener("click", async function () {
    if (S.session) {
      if (!window.confirm("Sign out? You will need to sign in again to update your hunter.")) return;
      await db.auth.signOut();
      S.session = null; S.role = "viewer"; S.spend = false; S.edit = null;
      render();
      toast("Signed out.");
      return;
    }
    $("signInMsg").textContent = "";
    $("signInSend").disabled = false;
    $("signInDialog").showModal();
    $("signInEmail").focus();
  });
  $("signInCancel").addEventListener("click", function () { $("signInDialog").close(); });
  $("signInForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = $("signInMsg"), send = $("signInSend");
    send.disabled = true;
    msg.textContent = "Sending…";
    try {
      var r = await db.auth.signInWithOtp({
        email: $("signInEmail").value.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] }
      });
      if (r.error) throw r.error;
      msg.textContent = "Link sent. Open it from your email and this sheet reopens, signed in.";
    } catch (err) {
      console.error(err);
      msg.textContent = /sign ?ups? not allowed|not found|invalid login/i.test(errText(err))
        ? "That address has no account. Ask the Storyteller for an invitation."
        : "Could not send the link: " + errText(err);
      send.disabled = false;
    }
  });

  if (db) {
    db.auth.onAuthStateChange(function (event) {
      // A sign-in from the emailed link, or a sign-out in another tab.
      if ((event === "SIGNED_IN" && !S.session) || (event === "SIGNED_OUT" && S.session)) reload();
    });
  }

  window.addEventListener("beforeunload", function (e) {
    if (S.edit || S.saving || S.saveFailed) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ------------------------------------------------------------------ PDF
     Fills the official blank sheet (the same one the PDFs were made
     from) with what the page shows now. The fields' own names drive it:
     "wits3" is the third Wits dot, "adflaw4-2" the second dot of the
     third Advantage row, "edge 5" the middle cell of the second Edge row. */
  // The PDF's built-in font covers Western European text only.
  var WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  function pdfSafe(s) {
    return String(s || "").replace(/[‐-‒−]/g, "-").replace(/ /g, " ")
      .replace(/[^\n\t\x20-\xff]/g, function (c) { return WIN_ANSI_EXTRA.indexOf(c) >= 0 ? c : "?"; });
  }

  /* The template leaves text size to the PDF viewer, which lets long
     text run out of its box, and uses one size for a field that appears
     on both pages at different widths (the name). So: the largest size,
     up to a readable maximum, at which the text fits every box the
     field has. */
  function fitSize(f, value, font) {
    var multi = f.isMultiline(), best = multi ? 11 : 14;
    var single = value.replace(/\s*\n\s*/g, " ");
    f.acroField.getWidgets().forEach(function (w) {
      var r = w.getRectangle(), width = r.width - 6, height = r.height - 3;
      var s = multi ? 11 : Math.min(14, height * 0.7);
      for (; s > 4; s -= 0.25) {
        if (multi ? wrappedLines(value, s, width, font) * s * 1.25 <= height
                  : font.widthOfTextAtSize(single, s) <= width) break;
      }
      best = Math.min(best, s);
    });
    return Math.max(4, best);
  }
  function wrappedLines(value, size, width, font) {
    return value.split("\n").reduce(function (count, para) {
      var lines = 1, line = "";
      para.split(/\s+/).forEach(function (word) {
        var next = line ? line + " " + word : word;
        if (line && font.widthOfTextAtSize(next, size) > width) { lines++; line = word; }
        else line = next;
      });
      return count + lines;
    }, 0);
  }

  async function downloadPdf() {
    if (!S.sheet) return;
    var btn = $("btnPdf");
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = "Preparing…";
    try {
      if (!window.PDFLib) await loadScript(PDF_LIB);
      var L = window.PDFLib;
      var bytes = await (await fetch(TEMPLATE_PDF)).arrayBuffer();
      var doc = await L.PDFDocument.load(bytes);
      var form = doc.getForm();
      var texts = {}, checks = {};
      form.getFields().forEach(function (f) {
        var n = f.getName();
        if (f instanceof L.PDFTextField) texts[n] = f;
        else if (f instanceof L.PDFCheckBox) {
          var m = /^(.*?)[-_ ]?(\d+)$/.exec(n);
          var base = m ? m[1] : n;
          (checks[base] = checks[base] || []).push({ n: m ? +m[2] : 1, f: f });
        }
      });
      var font = await doc.embedFont(L.StandardFonts.Helvetica);
      function text(name, value) {
        var f = texts[name];
        if (!f) return;
        value = pdfSafe(value);
        var max = f.getMaxLength();
        if (max && value.length > max) value = value.slice(0, max);
        f.setText(value || "");
        // The template's fields inherit their text style from the form, so
        // each gets its own here, at the size that fits.
        if (value) f.acroField.setDefaultAppearance("/Helv " + fitSize(f, value, font).toFixed(2) + " Tf 0 g");
      }
      function tick(base, level) {
        (checks[base] || []).forEach(function (c) { if (c.n <= level) c.f.check(); else c.f.uncheck(); });
      }

      var v = view(), d = v.data, p = v.play, x = xp();
      text("Name", d.name); text("Concept", d.concept); text("Creed", d.creed); text("Cell", d.cell);
      text("Drive", d.drive); text("Redemption", d.redemption); text("Ambition", p.ambition); text("Desire", p.desire);
      ATTRS.forEach(function (g) { g[1].forEach(function (k) { tick(k, d.attributes[k]); }); });
      ALL_SKILLS.forEach(function (k) { tick(k, d.skills[k]); });
      for (var i = 0; i < 10; i++) { text("health" + (i + 1), p.health[i]); text("will" + (i + 1), p.willpower[i]); }
      tick("despair", p.despair > 0 ? 1 : 0);   // the printed sheet has a single box
      d.edges.slice(0, MAX_ROWS).forEach(function (e, r) {
        var perks = e.perks.map(function (k) { return "Perk: " + k; });
        text("edge " + (r * 3 + 1), e.name);
        text("edge " + (r * 3 + 2), perks[0] || "");
        text("edge " + (r * 3 + 3), perks.slice(1).concat(e.notes ? [e.notes] : []).join("  /  "));
      });
      if (S.online && !NPC) { text("Total XP", String(x.total)); text("Spent XP", String(x.spent)); }
      text("Chronicle Tenets", d.tenets); text("Touchstones", p.touchstones); text("Creed Fields", d.creedFields);
      d.advantages.slice(0, MAX_ROWS).forEach(function (a, r) {
        text("adflaw" + (r + 2), a.name);
        tick("adflaw" + (r + 2), a.dots);
      });
      p.equipment.forEach(function (e, i) { text("equip " + (i + 1), e); });
      text("Age", p.age); text("Date of birth", p.dob); text("Appearance", p.appearance);
      text("Distinguishing features", p.features); text("History", p.history);
      // The PDF has no place for Specialties: they go at the end of Notes, as before.
      var specs = d.specialties.map(function (s) { return label(s.skill) + " (" + s.name + ")"; });
      text("Notes", [p.notes, specs.length ? "SPECIALTIES\n" + specs.join("\n") : ""].filter(Boolean).join("\n\n"));

      form.updateFieldAppearances(font);
      var out = await doc.save();
      var url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = slug + "-character-sheet.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      console.error(e);
      window.alert("Could not make the PDF: " + errText(e));
    } finally {
      btn.disabled = false;
      btn.textContent = was;
    }
  }

  load();
})();
