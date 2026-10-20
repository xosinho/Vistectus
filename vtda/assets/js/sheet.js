/* =====================================================================
   VAMPIRE: THE DARK AGES — character sheet (shared by every chronicle
   made with the Builder; the chronicle comes from <body data-chronicle>)
   ---------------------------------------------------------------------
   sheet.html?c=<slug> shows one Cainite's sheet. sheet.html?npc=<slug>
   is an NPC sheet: Storyteller only, read from the npc_sheets table,
   which the database lets no one else read. NPC sheets have no XP.

   The sheets live in the site's Supabase project (setup: the Crown of
   Ice and Bone's assets/sql/setup.sql, shared by every Vampire chronicle). Who may change what is decided
   by the database, not by this file:
     - anyone reads a Cainite's sheet;
     - the player marks damage, blood and Willpower, keeps their own
       notes and the like, and asks to buy traits with XP;
     - the Storyteller approves purchases, awards XP and can edit
       everything.

   Names and costs for the dropdowns come from vtda/assets/data/rules-data.js
   (window.VAMPIRE_RULES). Each Clan, Road, Discipline and Path links to
   its page in the world's members-only rules (../rules.html).
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = document.body.getAttribute("data-chronicle") || "";
  var CHRONICLE_NAME = document.body.getAttribute("data-chronicle-name") || CHRONICLE;
  var RULES = window.VAMPIRE_RULES || { abilities: {}, clans: [], disciplines: [], paths: [], roads: [], archetypes: [],
    backgrounds: [], merits: [], generations: [], health: [], expertise: [] };

  var ATTRS = [
    ["Physical", ["strength", "dexterity", "stamina"]],
    ["Social",   ["charisma", "manipulation", "appearance"]],
    ["Mental",   ["perception", "intelligence", "wits"]]
  ];
  var ALL_ATTRS = [].concat.apply([], ATTRS.map(function (g) { return g[1]; }));
  function key(name) { return String(name).toLowerCase().replace(/[^a-z]/g, ""); }
  var ABILITIES = ["Talents", "Skills", "Knowledges"].map(function (g) {
    return [g, (RULES.abilities[g] || []).map(function (n) { return [key(n), n]; })];
  });
  var ALL_ABILITIES = [].concat.apply([], ABILITIES.map(function (g) { return g[1]; }));
  var ABILITY_NAME = {};
  ALL_ABILITIES.forEach(function (a) { ABILITY_NAME[a[0]] = a[1]; });
  var VIRTUES = { conscience: "Conscience", conviction: "Conviction", selfcontrol: "Self-Control", instinct: "Instinct", courage: "Courage" };
  var HEALTH = RULES.health && RULES.health.length ? RULES.health
    : [["Bruised", 0], ["Hurt", -1], ["Injured", -1], ["Wounded", -2], ["Mauled", -2], ["Crippled", -5], ["Incapacitated", null]];
  var GEN_NAMES = ["Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth"];

  /* The sheet follows the official four-page Dark Ages sheet
     (vtda/assets/sheets/blank-character-sheet.pdf), which Download PDF fills. */
  var TEMPLATE_PDF = "../../assets/sheets/blank-character-sheet.pdf";
  var PDF_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
  var PDF_LIB_SRI = "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI";
  // Page three: notes on each Background, then the "Other" box, which holds the Domain.
  var EXPANDED = ["allies", "contacts", "fame", "herd", "influence", "mentor", "resources", "retainers", "status"];
  // [play key, heading, lines on the printed sheet]
  var POSSESSIONS = [["gear", "Gear (carried)", 5], ["owned", "Equipment (owned)", 5],
                     ["feeding", "Feeding grounds", 4], ["transport", "Transportation", 4]];
  var COMBAT_COLS = [["weapon", "Weapon / attack"], ["diff", "Diff."], ["damage", "Damage"], ["range", "Range"],
                     ["rate", "Rate"], ["clip", "Clip"], ["conceal", "Conceal"]];
  var COMBAT_ROWS = 6;
  // Page four, left column: [play key, label]. Apparent age and R.I.P.
  // (the Embrace) were on the sheet before, under the same keys.
  var DESCRIPTION = [["age", "Age"], ["apparentAge", "Apparent age"], ["dob", "Date of birth"], ["embraced", "R.I.P. (the Embrace)"],
                     ["hair", "Hair"], ["eyes", "Eyes"], ["race", "Race"], ["nationality", "Nationality"],
                     ["height", "Height"], ["weight", "Weight"], ["sex", "Sex"]];

  var cfg = window.BUILDERS_CONFIG || {};
  // The members' gate's client when it is already there (one sign-in).
  var db = (window.Gate && window.Gate.db) || ((cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null);

  var params = new URLSearchParams(window.location.search);
  var NPC = params.has("npc");
  var slug = ((NPC ? params.get("npc") : params.get("c")) || "").toLowerCase();

  var S = {
    sheet: null, online: false, role: "viewer", session: null,
    costs: {}, costList: [], requests: [], awards: [],
    spend: false, edit: null, newKind: "clan_discipline",
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
  function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }
  function num(v, max, min) { v = parseInt(v, 10); min = min || 0; return isNaN(v) ? min : Math.max(min, Math.min(max, v)); }
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
  function same(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }

  /* -------------------------------------------------------- rules data */
  function rulesLink(page, text) {
    return page ? '<a href="../rules.html?p=' + encodeURIComponent(page) + '" title="Open the rules (members only)">' + esc(text) + "</a>" : esc(text);
  }
  function findByName(list, name) { return (list || []).filter(function (x) { return same(x.name, name); })[0] || null; }
  function clanOf(d) { return findByName(RULES.clans, d.clan); }
  function roadOf(d) { return findByName(RULES.roads, d.road); }
  function genRow(d) { return (RULES.generations || [])[Math.min(10, Math.max(0, d.generation - 3))] || null; }
  function traitMax(d) { var g = genRow(d); return g ? Math.max(5, g.maxTrait) : 5; }
  // The Road decides which pair of Virtues the Cainite uses.
  function virtuePair(d) {
    var r = roadOf(d);
    var v = r ? r.virtues : ["Conscience", "Self-Control"];
    return [key(v[0]), key(v[1]), "courage"];
  }
  // The Road's Aura modifier at a rating, as the printed sheet writes it.
  function auraMod(rating) { return rating >= 10 ? "−2" : rating >= 8 ? "−1" : rating >= 4 ? "0" : rating >= 2 ? "+1" : "+2"; }
  function auraNote(d) {
    var r = roadOf(d), m = auraMod(d.roadRating);
    return "Aura" + (r && r.aura ? " of " + r.aura : "") + ": " + (m === "0" ? "no modifier" : m + " difficulty");
  }

  /* Fill in anything a sheet is missing, so rendering never trips. */
  function normalise(sheet) {
    var d = sheet.data = sheet.data || {}, p = sheet.play = sheet.play || {};
    d.attributes = d.attributes || {}; d.abilities = d.abilities || {}; d.virtues = d.virtues || {};
    ALL_ATTRS.forEach(function (k) { d.attributes[k] = num(d.attributes[k], 10, 0); });
    ALL_ABILITIES.forEach(function (a) { d.abilities[a[0]] = num(d.abilities[a[0]], 10); });
    Object.keys(VIRTUES).forEach(function (k) { d.virtues[k] = num(d.virtues[k] == null ? 1 : d.virtues[k], 5); });
    d.generation = num(d.generation || 12, 13, 3);
    d.roadRating = num(d.roadRating, 10);
    d.willpower = num(d.willpower, 10);
    ["name", "player", "nature", "demeanor", "concept", "clan", "sire", "road", "weakness", "derangements", "haven", "domain"].forEach(function (k) { d[k] = String(d[k] || ""); });
    d.disciplines = (Array.isArray(d.disciplines) ? d.disciplines : []).map(function (x) {
      return { name: String(x.name || ""), dots: num(x.dots, 10), clan: !!x.clan };
    });
    d.paths = (Array.isArray(d.paths) ? d.paths : []).map(function (x) {
      return { name: String(x.name || ""), dots: num(x.dots, 5), sorcery: x.sorcery === "Necromancy" ? "Necromancy" : "Thaumaturgy", primary: !!x.primary };
    });
    d.rituals = (Array.isArray(d.rituals) ? d.rituals : []).map(function (x) { return { name: String(x.name || ""), level: num(x.level, 10, 1) }; });
    d.backgrounds = (Array.isArray(d.backgrounds) ? d.backgrounds : []).map(function (x) { return { name: String(x.name || ""), dots: num(x.dots, 5) }; });
    d.expertise = (Array.isArray(d.expertise) ? d.expertise : []).map(function (x) { return { ability: String(x.ability || "academics"), name: String(x.name || "") }; });
    d.meritsFlaws = (Array.isArray(d.meritsFlaws) ? d.meritsFlaws : []).map(function (x) {
      return { name: String(x.name || ""), points: num(x.points, 7), kind: x.kind === "Flaw" ? "Flaw" : "Merit" };
    });
    d.otherTraits = (Array.isArray(d.otherTraits) ? d.otherTraits : []).map(function (x) { return { name: String(x.name || ""), dots: num(x.dots, 9) }; });
    d.extraHealth = num(d.extraHealth, 3);
    var levels = HEALTH.length + d.extraHealth;
    p.health = (Array.isArray(p.health) ? p.health : []).slice(0, levels).map(mark);
    while (p.health.length < levels) p.health.push("");
    p.willpower = (Array.isArray(p.willpower) ? p.willpower : []).slice(0, 10).map(function (v) { return v === "/" ? "/" : ""; });
    while (p.willpower.length < 10) p.willpower.push("");
    p.blood = num(p.blood, 60);
    // Possessions, as the printed sheet has them. The old single Equipment
    // list (twelve lines) becomes Gear (carried), then Equipment (owned).
    if (Array.isArray(p.equipment) && !p.gear) {
      var old = p.equipment.map(String).filter(function (s) { return s.trim(); });
      p.gear = old.slice(0, 5);
      p.owned = old.slice(5, 9).concat(old.length > 9 ? [old.slice(9).join("; ")] : []);
    }
    delete p.equipment;
    POSSESSIONS.forEach(function (b) { p[b[0]] = lines(p[b[0]], b[2]); });
    p.combat = (Array.isArray(p.combat) ? p.combat : []).slice(0, COMBAT_ROWS).map(function (r) {
      var o = {}; COMBAT_COLS.forEach(function (c) { o[c[0]] = String((r && r[c[0]]) || ""); }); return o;
    });
    while (p.combat.length < COMBAT_ROWS) p.combat.push(blankCombat());
    var a = p.armor && typeof p.armor === "object" ? p.armor : {};
    p.armor = { class: String(a.class || ""), rating: String(a.rating || ""), penalty: String(a.penalty || ""), description: String(a.description || "") };
    var bn = p.bgNotes && typeof p.bgNotes === "object" ? p.bgNotes : {};
    p.bgNotes = {};
    EXPANDED.forEach(function (k) { p.bgNotes[k] = String(bn[k] || ""); });
    ["apparentAge", "embraced", "appearance", "history", "notes", "goals", "havenNotes"].concat(DESCRIPTION.map(function (x) { return x[0]; }))
      .forEach(function (k) { p[k] = String(p[k] || ""); });
    return sheet;
  }
  function lines(v, n) {
    v = (Array.isArray(v) ? v : []).slice(0, n).map(function (s) { return String(s || ""); });
    while (v.length < n) v.push("");
    return v;
  }
  function blankCombat() { var o = {}; COMBAT_COLS.forEach(function (c) { o[c[0]] = ""; }); return o; }
  // Damage: / bashing, X lethal, * aggravated.
  function mark(v) { v = String(v || "").trim().toUpperCase(); return v === "X" || v === "/" || v === "*" ? v : ""; }

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
  // The price of the next dot when the trait stands at `current`.
  function costFor(kind, current) {
    var c = S.costs[kind];
    if (!c) return null;
    if (kind === "expertise") return c.new_cost;
    if (kind === "ritual") return c.per_level == null ? null : c.per_level * current;   // current = the Ritual's level
    if (current === 0) return c.new_cost;
    return c.per_level == null ? null : c.per_level * current;
  }
  function pendingFor(kind, trait) {
    return S.requests.filter(function (r) {
      return r.status === "pending" && r.kind === kind && same(r.trait, trait);
    }).length;
  }
  function traitLabel(kind, t) {
    if (kind === "attribute") return cap(t);
    if (kind === "ability" || kind === "expertise") return ABILITY_NAME[t] || cap(t);
    if (kind === "virtue") return VIRTUES[t] || cap(t);
    if (kind === "road") return "Road";
    if (kind === "willpower") return "Willpower";
    return t;
  }
  function describe(r) {
    var name = traitLabel(r.kind, r.trait);
    switch (r.kind) {
      case "expertise": return "Expertise: " + name + " (" + r.detail + ")";
      case "ritual": return "Ritual: " + r.trait + " (level " + r.to_level + ")";
      case "clan_discipline": case "discipline": case "path": case "background":
        if (r.from_level === 0) return "New " + (r.kind === "clan_discipline" ? "clan Discipline" : r.kind === "discipline" ? "Discipline" : r.kind === "path" ? "Path" : "Background") + ": " + name;
    }
    return name + " " + r.from_level + " → " + r.to_level;
  }

  /* ---------------------------------------------------------- pieces */
  function dots(kind, k, level, pending, editable, max) {
    max = max || 5;
    var h = '<span class="dots' + (max > 5 ? " ten" : "") + '" role="img" aria-label="' + level + " of " + max + (pending ? ", " + pending + " waiting" : "") + '">';
    for (var i = 1; i <= max; i++) {
      var cls = i <= level ? "dot on" : (i <= level + pending ? "dot pending" : "dot");
      h += editable
        ? '<button type="button" class="' + cls + '" data-action="dot" data-kind="' + kind + '" data-key="' + esc(k) + '" data-n="' + i + '" aria-label="Set to ' + i + '"></button>'
        : '<span class="' + cls + '"></span>';
    }
    return h + "</span>";
  }

  function buyChip(kind, trait, level, max) {
    if (!S.spend || !canSpend() || S.edit) return "";
    var cur = level + pendingFor(kind, trait);
    if (cur + 1 > max) return "";
    var cost = costFor(kind, cur), avail = xp().available;
    var ok = cost != null && cost <= avail;
    return '<button type="button" class="buy" data-action="buy" data-kind="' + kind + '" data-trait="' + esc(trait) + '"' +
      (ok ? "" : " disabled") + ' title="' + (cost == null ? "Cannot be bought with XP" : "Raise to " + (cur + 1) + " for " + cost + " XP") + '">' +
      (cost == null ? "—" : "+" + cost + " XP") + "</button>";
  }

  function trait(kind, k, nameHtml, sub, level, max) {
    return '<div class="trait"><span class="trait-name">' + nameHtml + (sub ? "<small>" + esc(sub) + "</small>" : "") +
      '</span><span class="trait-end">' + buyChip(kind, k, level, max) +
      dots(kind, k, level, S.edit ? 0 : pendingFor(kind, k), !!S.edit, max) + "</span></div>";
  }

  // A line of text, or a dropdown in the Storyteller's editor.
  function field(name, src, k, options, linkPage) {
    var v = view()[src][k];
    var editable = src === "play" ? canPlay() : !!S.edit;
    var inner;
    if (editable && options) {
      var known = options.some(function (o) { return o === v; });
      inner = '<select data-src="' + src + '" data-key="' + k + '" aria-label="' + esc(name) + '"><option value=""' + (v ? "" : " selected") + ">—</option>" +
        (v && !known ? '<option selected value="' + esc(v) + '">' + esc(v) + "</option>" : "") +
        options.map(function (o) { return '<option' + (o === v ? " selected" : "") + ' value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
    } else if (editable) {
      inner = '<input data-src="' + src + '" data-key="' + k + '" value="' + esc(v) + '" aria-label="' + esc(name) + '">';
    } else {
      inner = '<span class="val">' + (linkPage ? rulesLink(linkPage, v) : esc(v)) + "</span>";
    }
    return '<div class="field"><b>' + esc(name) + "</b>" + inner + "</div>";
  }
  // A block of text; `sub` names a key inside an object (bgNotes.allies).
  function area(src, k, rows, name, sub) {
    var v = view()[src][k];
    if (sub) v = v[sub];
    var editable = src === "play" ? canPlay() : !!S.edit;
    return editable
      ? '<textarea data-src="' + src + '" data-key="' + k + '"' + (sub ? ' data-field="' + sub + '"' : "") + ' rows="' + (rows || 6) + '" aria-label="' + esc(name) + '">' + esc(v) + "</textarea>"
      : '<div class="prose-box">' + (v ? esc(v) : "") + "</div>";
  }

  /* ------------------------------------------------------------ page 1 */
  function page1() {
    var v = view(), d = v.data, p = v.play, max = traitMax(d);
    var clan = clanOf(d), road = roadOf(d);
    var h = '<section class="page" aria-label="Character sheet, page one">';
    var genOptions = GEN_NAMES.map(function (g, i) { return g; });
    // The printed sheet's three columns: who, what kind of person, what blood.
    h += '<div class="sheet-head"><div class="sheet-band"><strong>Vampire</strong><span>The Dark Ages</span></div><div class="sheet-ident cols-down">' +
      field("Name", "data", "name") +
      field("Player", "data", "player") +
      '<div class="field"><b>Chronicle</b><span class="val">' + esc(CHRONICLE_NAME) + "</span></div>" +
      field("Nature", "data", "nature", RULES.archetypes) +
      field("Demeanor", "data", "demeanor", RULES.archetypes) +
      field("Concept", "data", "concept") +
      field("Clan", "data", "clan", RULES.clans.map(function (c) { return c.name; }), clan && clan.page) +
      genField(d, genOptions) +
      field("Sire", "data", "sire") +
      "</div></div>";

    h += "<h3>Attributes</h3><div class=\"cols3\">";
    ATTRS.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (k) { h += trait("attribute", k, esc(cap(k)), "", d.attributes[k], max); });
      h += "</div>";
    });
    h += "</div>";

    h += "<h3>Abilities</h3><div class=\"cols3\">";
    ABILITIES.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (a) {
        var fields = expertiseOf(d, a[0]);
        var needs = (RULES.expertise || []).indexOf(a[1]) >= 0 && d.abilities[a[0]] > 0 && !fields.length ? "field to be chosen" : "";
        h += trait("ability", a[0], esc(a[1]), fields.join(", ") || needs, d.abilities[a[0]], max);
      });
      h += "</div>";
    });
    h += "</div>";

    h += "<h3>Advantages</h3><div class=\"adv3\">" +
      "<div><h4>Disciplines</h4>" + disciplinesHtml(d, max) + "</div>" +
      "<div><h4>Backgrounds</h4>" + backgroundsHtml(d) + "</div>" +
      "<div><h4>Virtues</h4>" + virtuesHtml(d) + "</div></div>";

    h += '<div class="lower">';
    h += '<div><div class="block"><h4>Other Traits</h4>' + otherLinesHtml(d) + "</div></div>";
    h += '<div><div class="block"><h4>' + (road ? rulesLink(road.page, road.name) : "Road") + "</h4>" +
      (S.edit ? '<div style="margin-bottom:.35rem">' + field("Road", "data", "road", RULES.roads.map(function (r) { return r.name; })) + "</div>" : "") +
      buyChip("road", "road", d.roadRating, 10) + dots("road", "road", d.roadRating, S.edit ? 0 : pendingFor("road", "road"), !!S.edit, 10) +
      '<span class="tracker-note">' + esc(auraNote(d)) + "</span></div>";
    h += '<div class="block"><h4>Willpower</h4>' + buyChip("willpower", "willpower", d.willpower, 10) +
      dots("willpower", "willpower", d.willpower, S.edit ? 0 : pendingFor("willpower", "willpower"), !!S.edit, 10) +
      '<div style="margin-top:.35rem">' + willpowerBoxes(d, p) + "</div>" +
      '<span class="tracker-note">' + (d.willpower - p.willpower.slice(0, d.willpower).filter(Boolean).length) + " of " + d.willpower + " left</span></div>";
    h += '<div class="block"><h4>Blood Pool</h4>' + bloodBoxes(d, p) + "</div></div>";
    h += '<div><div class="block"><h4>Health</h4>' + healthTable(d, p) + "</div>" +
      '<div class="block"><h4>Weakness</h4>' + (S.edit ? area("data", "weakness", 3, "Weakness") : '<div class="weakness">' + esc(d.weakness) + "</div>") + "</div></div>";
    h += "</div>";
    if (canPlay() && !S.edit) h += '<p class="tracker-note" style="text-align:center">Health: click a box once for bashing ( / ), twice for lethal ( X ), three times for aggravated ( * ), a fourth time to clear. Blood: click the last full box to spend from there. Willpower: click a box to mark it spent.</p>';
    return h + "</section>";
  }

  function genField(d, names) {
    var g = genRow(d), label = (GEN_NAMES[d.generation - 3] || "") + " Generation";
    if (S.edit) {
      return '<div class="field"><b>Generation</b><select data-src="data" data-key="generation" data-int aria-label="Generation">' +
        names.map(function (n, i) { return '<option value="' + (i + 3) + '"' + (d.generation === i + 3 ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></div>";
    }
    return '<div class="field"><b>Generation</b><span class="val">' + rulesLink("concepts/generation", label) + "</span></div>";
  }

  function disciplinesHtml(d, max) {
    var clan = clanOf(d), h = "";
    if (S.edit) {
      var names = RULES.disciplines.map(function (x) { return x.name; });
      h += '<div class="edit-list">';
      d.disciplines.forEach(function (x, i) {
        h += '<div class="row">' + listSelect("disciplines", i, "name", x.name, names) +
          '<label class="chk"><input type="checkbox" data-list="disciplines" data-i="' + i + '" data-field="clan"' + (x.clan ? " checked" : "") + "> clan</label>" +
          dots("discipline", String(i), x.dots, 0, true, max) + delBtn("disciplines", i) + "</div>";
      });
      h += addBtn("disciplines", "+ Discipline") + "</div>";
      if (clan && clan.disciplines.length) h += '<p class="tracker-note">' + esc(clan.name) + ": " + esc(clan.disciplines.join(", ")) + (clan.note ? ", " + esc(clan.note) : "") + "</p>";
      return h;
    }
    if (!d.disciplines.length) h += '<p class="empty-line">None yet.</p>';
    d.disciplines.forEach(function (x) {
      var rule = findByName(RULES.disciplines, x.name), kind = x.clan ? "clan_discipline" : "discipline";
      h += trait(kind, x.name, (rule ? rulesLink(rule.page, x.name) : esc(x.name)) + (x.clan ? '<span class="clan-mark" title="Clan Discipline">◆</span>' : ""), "", x.dots, max);
    });
    S.requests.forEach(function (r) {
      if ((r.kind === "clan_discipline" || r.kind === "discipline") && r.status === "pending" && r.from_level === 0 &&
          !d.disciplines.some(function (x) { return same(x.name, r.trait); })) {
        h += '<div class="trait"><span class="trait-name">' + esc(r.trait) + " <small>(waiting)</small></span>" + dots(r.kind, r.trait, 0, 1, false, max) + "</div>";
      }
    });
    return h;
  }

  function backgroundsHtml(d) {
    var h = "";
    if (S.edit) {
      h += '<div class="edit-list">';
      d.backgrounds.forEach(function (x, i) {
        h += '<div class="row">' + listInput("backgrounds", i, "name", x.name, "bgNames") + dots("background", String(i), x.dots, 0, true, 5) + delBtn("backgrounds", i) + "</div>";
      });
      return h + '<datalist id="bgNames">' + RULES.backgrounds.map(function (b) { return '<option value="' + esc(b) + '">'; }).join("") + "</datalist>" +
        addBtn("backgrounds", "+ Background") + "</div>";
    }
    if (!d.backgrounds.length) return '<p class="empty-line">None yet.</p>';
    d.backgrounds.forEach(function (x) {
      var base = RULES.backgrounds.filter(function (b) { return same(b, x.name.split(/\s+[-–—(:]/)[0]); })[0];
      h += trait("background", x.name, base ? rulesLink("concepts/backgrounds", x.name) : esc(x.name), "", x.dots, 5);
    });
    return h;
  }

  function virtuesHtml(d) {
    var pair = virtuePair(d), h = "";
    pair.forEach(function (k) { h += trait("virtue", k, rulesLink("concepts/virtues-and-willpower", VIRTUES[k]), "", d.virtues[k], 5); });
    h += '<p class="tracker-note">' + (roadOf(d) ? "Set by the " + esc(roadOf(d).name) : "Conscience and Self-Control until a Road is chosen") + ".</p>";
    return h;
  }

  // Rituals on the left and Paths on the right, as on the printed sheet.
  function pathsHtml(d) {
    var h = '<div class="split"><div class="paths-col"><h4>Paths</h4>';
    if (S.edit) {
      var names = RULES.paths.map(function (x) { return x.name; });
      h += '<div class="edit-list">';
      d.paths.forEach(function (x, i) {
        h += '<div class="row">' + listSelect("paths", i, "name", x.name, names) +
          '<select data-list="paths" data-i="' + i + '" data-field="sorcery" style="flex:0 0 8rem">' + ["Thaumaturgy", "Necromancy"].map(function (s) {
            return "<option" + (x.sorcery === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
          '<label class="chk"><input type="checkbox" data-list="paths" data-i="' + i + '" data-field="primary"' + (x.primary ? " checked" : "") + "> primary</label>" +
          dots("path", String(i), x.dots, 0, true, 5) + delBtn("paths", i) + "</div>";
      });
      h += addBtn("paths", "+ Path") + "</div>";
    } else {
      if (!d.paths.length) h += '<p class="empty-line">None.</p>';
      d.paths.forEach(function (x) {
        var rule = findByName(RULES.paths, x.name);
        h += x.primary
          ? '<div class="trait"><span class="trait-name">' + (rule ? rulesLink(rule.page, x.name) : esc(x.name)) + "<small>" + esc(x.sorcery) + ", primary: rises with the Discipline</small></span>" + dots("path", x.name, x.dots, 0, false, 5) + "</div>"
          : trait("path", x.name, rule ? rulesLink(rule.page, x.name) : esc(x.name), x.sorcery, x.dots, 5);
      });
    }
    h += '</div><div class="rituals-col"><h4>Rituals</h4>';
    if (S.edit) {
      h += '<div class="edit-list">';
      d.rituals.forEach(function (x, i) {
        h += '<div class="row">' + listInput("rituals", i, "name", x.name) +
          '<input class="num" type="number" min="1" max="10" data-list="rituals" data-i="' + i + '" data-field="level" value="' + x.level + '" aria-label="Level">' + delBtn("rituals", i) + "</div>";
      });
      h += addBtn("rituals", "+ Ritual") + "</div>";
    } else {
      if (!d.rituals.length) h += '<p class="empty-line">None.</p>';
      d.rituals.forEach(function (x) { h += '<div class="merit-row"><span>' + esc(x.name) + '</span><span class="pts">Level ' + x.level + "</span></div>"; });
      S.requests.forEach(function (r) {
        if (r.kind === "ritual" && r.status === "pending") h += '<div class="merit-row"><span>' + esc(r.trait) + ' <small>(waiting)</small></span><span class="pts">Level ' + r.to_level + "</span></div>";
      });
    }
    return h + "</div></div>";
  }

  function meritsHtml(d) {
    var h = "";
    if (S.edit) {
      h += '<div class="edit-list">';
      d.meritsFlaws.forEach(function (x, i) {
        h += '<div class="row">' + listInput("meritsFlaws", i, "name", x.name, "mfNames") +
          '<select data-list="meritsFlaws" data-i="' + i + '" data-field="kind" style="flex:0 0 5.5rem"><option' + (x.kind === "Merit" ? " selected" : "") + ">Merit</option><option" + (x.kind === "Flaw" ? " selected" : "") + ">Flaw</option></select>" +
          '<input class="num" type="number" min="0" max="7" data-list="meritsFlaws" data-i="' + i + '" data-field="points" value="' + x.points + '" aria-label="Points">' + delBtn("meritsFlaws", i) + "</div>";
      });
      return h + '<datalist id="mfNames">' + RULES.merits.map(function (m) { return '<option value="' + esc(m.name) + '">' + esc(m.type + " · " + m.group + " · " + m.cost) + "</option>"; }).join("") + "</datalist>" +
        addBtn("meritsFlaws", "+ Merit or Flaw") + "</div>";
    }
    // Two tables, Merits and Flaws, each with the trait's type and cost.
    h = '<div class="split">';
    ["Merit", "Flaw"].forEach(function (kind) {
      var rows = d.meritsFlaws.filter(function (x) { return x.kind === kind; });
      h += '<table class="grid-table mf-table"><thead><tr><th>' + kind + "</th><th>Type</th><th>Cost</th></tr></thead><tbody>" +
        (rows.length ? rows.map(function (x) {
          return "<tr><td>" + rulesLink("concepts/merits-and-flaws", x.name) + "</td><td>" + esc(mfType(x)) + '</td><td class="num">' + x.points + "</td></tr>";
        }).join("") : '<tr><td colspan="3" class="empty">None.</td></tr>') + "</tbody></table>";
    });
    return h + "</div>";
  }
  // Physical, Mental, Social, Supernatural or Aura, from the rules.
  function mfType(x) { var r = findByName(RULES.merits, x.name); return r ? r.group : ""; }

  function willpowerBoxes(d, p) {
    var h = '<span class="boxes wrap">';
    for (var i = 0; i < 10; i++) {
      if (i >= d.willpower) { h += '<span class="box off"></span>'; continue; }
      var spent = p.willpower[i] === "/";
      h += canPlay() && !S.edit
        ? '<button type="button" class="box' + (spent ? " spent" : "") + '" data-action="wp" data-i="' + i + '" aria-label="Willpower point ' + (i + 1) + (spent ? ", spent" : "") + '"></button>'
        : '<span class="box' + (spent ? " spent" : "") + '"></span>';
    }
    return h + "</span>";
  }

  function bloodBoxes(d, p) {
    var g = genRow(d), pool = g && g.pool ? g.pool : 10, cur = Math.min(p.blood, pool);
    var h = '<span class="boxes wrap" role="group" aria-label="Blood, ' + cur + " of " + pool + '">';
    for (var i = 1; i <= pool; i++) {
      var cls = "box blood" + (i <= cur ? " on" : "");
      h += canPlay() && !S.edit
        ? '<button type="button" class="' + cls + '" data-action="blood" data-n="' + i + '" aria-label="Set blood to ' + (cur === i ? i - 1 : i) + '"></button>'
        : '<span class="' + cls + '"></span>';
    }
    return h + '</span><span class="tracker-note">' + cur + " of " + pool +
      (g && g.perTurn ? " · " + g.perTurn + " per turn" : "") + "</span>";
  }

  function healthTable(d, p) {
    var rows = [];
    for (var e = 0; e < d.extraHealth; e++) rows.push(["Bruised", 0]);
    rows = rows.concat(HEALTH);
    var h = '<table class="health-table">';
    rows.forEach(function (r, i) {
      var v = p.health[i] || "";
      h += "<tr><td>" + esc(r[0]) + '</td><td class="pen">' + (r[1] === null ? "" : r[1] === 0 ? "" : "−" + Math.abs(r[1])) + '</td><td class="mark">' +
        (canPlay() && !S.edit
          ? '<button type="button" class="box" data-action="health" data-i="' + i + '" aria-label="' + esc(r[0]) + ": " + (v === "/" ? "bashing" : v === "X" ? "lethal" : v === "*" ? "aggravated" : "unhurt") + '">' + esc(v) + "</button>"
          : '<span class="box">' + esc(v) + "</span>") + "</td></tr>";
    });
    h += "</table>";
    if (S.edit) h += '<span class="tracker-note">Extra Bruised levels (e.g. Sturdy) <input class="num" type="number" min="0" max="3" data-src="data" data-key="extraHealth" data-int value="' + d.extraHealth + '" style="width:3.5rem"></span>';
    return h;
  }

  /* ------------------------------------------------- editing helpers */
  function listSelect(list, i, f, value, options) {
    var known = options.some(function (o) { return o === value; });
    return '<select data-list="' + list + '" data-i="' + i + '" data-field="' + f + '" aria-label="' + esc(f) + '"><option value="">—</option>' +
      (value && !known ? '<option selected value="' + esc(value) + '">' + esc(value) + "</option>" : "") +
      options.map(function (o) { return "<option" + (o === value ? " selected" : "") + ' value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
  }
  function listInput(list, i, f, value, datalist) {
    return '<input data-list="' + list + '" data-i="' + i + '" data-field="' + f + '" value="' + esc(value) + '"' + (datalist ? ' list="' + datalist + '"' : "") + ' aria-label="' + esc(f) + '">';
  }
  function delBtn(list, i) { return '<button type="button" class="mini" data-action="del-row" data-list="' + list + '" data-i="' + i + '" aria-label="Remove">✕</button>'; }
  function addBtn(list, text) { return '<p><button type="button" class="mini" data-action="add-row" data-list="' + list + '">' + text + "</button></p>"; }

  function expertiseEditor(d) {
    var h = '<div class="edit-list" style="margin-top:.6rem"><h4 style="text-align:left">Areas of expertise</h4>';
    d.expertise.forEach(function (x, i) {
      h += '<div class="row"><select data-list="expertise" data-i="' + i + '" data-field="ability">' + ALL_ABILITIES.map(function (a) {
        return '<option value="' + a[0] + '"' + (a[0] === x.ability ? " selected" : "") + ">" + esc(a[1]) + "</option>"; }).join("") + "</select>" +
        listInput("expertise", i, "name", x.name) + delBtn("expertise", i) + "</div>";
    });
    return h + addBtn("expertise", "+ Area of expertise") + "</div>";
  }

  // Areas of expertise of one Ability, with any still waiting for approval.
  function expertiseOf(d, ability) {
    var fields = d.expertise.filter(function (x) { return x.ability === ability; }).map(function (x) { return x.name; });
    S.requests.forEach(function (r) {
      if (r.kind === "expertise" && r.status === "pending" && r.trait === ability) fields.push(r.detail + " (waiting)");
    });
    return fields;
  }
  // Page one's Other Traits: the areas of expertise (where the printed sheet keeps them).
  function otherLinesHtml(d) {
    if (S.edit) return expertiseEditor(d);
    var h = "";
    ALL_ABILITIES.forEach(function (a) {
      expertiseOf(d, a[0]).forEach(function (f) { h += '<div class="merit-row"><span>' + esc(a[1]) + '</span><span class="pts">' + esc(f) + "</span></div>"; });
    });
    if (d.extraHealth) h += '<div class="merit-row"><span>Extra Bruised levels</span><span class="pts">' + d.extraHealth + "</span></div>";
    return h || '<p class="empty-line">None.</p>';
  }

  /* ------------------------------------------------------------ page 2 */
  function pageHead(d, title) {
    return '<div class="page2-top"><strong style="font-family:var(--sheet-head);font-size:1.3rem">' + esc(d.name) + "</strong>" +
      '<span class="page-no">' + title + "</span></div>";
  }
  function page2() {
    var v = view(), d = v.data, p = v.play;
    var h = '<section class="page" aria-label="Character sheet, page two">' + pageHead(d, "Page two");
    h += "<h3>Merits and Flaws</h3>" + meritsHtml(d);
    h += "<h3>Other Traits</h3>" + otherTraitsHtml(d);
    h += "<h3>Rituals and Paths</h3>" + pathsHtml(d);
    h += '<div class="split"><div><h3>Experience</h3>' + experienceHtml() + "</div>" +
      '<div><h3>Derangements</h3><div class="labelled" style="border-top:1px solid var(--paper-ink)">' + area("data", "derangements", 4, "Derangements") + "</div></div></div>";
    h += "<h3>Combat</h3>" + combatHtml(p);
    return h + "</section>";
  }

  function otherTraitsHtml(d) {
    var max = traitMax(d);
    if (S.edit) {
      var h = '<div class="edit-list">';
      d.otherTraits.forEach(function (x, i) {
        h += '<div class="row">' + listInput("otherTraits", i, "name", x.name) + dots("other", String(i), x.dots, 0, true, max) + delBtn("otherTraits", i) + "</div>";
      });
      return h + addBtn("otherTraits", "+ Other Trait") + '<p class="tracker-note">Anything else with dots: a second Road, True Faith, a sorcery, a Tome of Secrets trait.</p></div>';
    }
    if (!d.otherTraits.length) return '<p class="empty-line">None.</p>';
    var out = '<div class="cols3 skills">', per = Math.ceil(d.otherTraits.length / 3);
    for (var c = 0; c < 3; c++) {
      out += "<div>";
      // Not bought with XP: the Storyteller sets these.
      d.otherTraits.slice(c * per, c * per + per).forEach(function (x) {
        out += '<div class="trait"><span class="trait-name">' + esc(x.name) + '</span><span class="trait-end">' + dots("other", x.name, x.dots, 0, false, max) + "</span></div>";
      });
      out += "</div>";
    }
    return out + "</div>";
  }

  // The XP figures, and what the XP went on (the approved purchases).
  function experienceHtml() {
    if (NPC) return '<p class="empty-line">NPCs have no experience.</p>';
    var x = xp();
    var h = '<div class="xp-figures"><div>Total <span>' + (S.online ? x.total : "") + "</span></div>" +
      "<div>Total spent <span>" + (S.online ? x.spent : "") + "</span></div></div>";
    var spent = S.requests.filter(function (r) { return r.status === "approved"; });
    h += '<div class="labelled" style="border-top:1px solid var(--paper-ink);margin-top:.5rem"><b>Spent on</b>';
    h += spent.length ? spent.map(function (r) { return '<div class="merit-row"><span>' + esc(describe(r)) + '</span><span class="pts">' + r.cost + " XP</span></div>"; }).join("")
      : '<p class="empty-line">Nothing yet.</p>';
    return h + "</div>";
  }

  function combatHtml(p) {
    var edit = canPlay();
    var h = '<div class="combat"><div class="table-scroll"><table class="grid-table combat-table"><thead><tr>' +
      COMBAT_COLS.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") + "</tr></thead><tbody>";
    p.combat.forEach(function (r, i) {
      h += "<tr>" + COMBAT_COLS.map(function (c) {
        return "<td>" + (edit ? '<input data-src="play" data-key="combat" data-i="' + i + '" data-field="' + c[0] + '" value="' + esc(r[c[0]]) + '" aria-label="' + esc(c[1]) + ", row " + (i + 1) + '">' : esc(r[c[0]])) + "</td>";
      }).join("") + "</tr>";
    });
    h += '</tbody></table></div><div class="armor"><h4>Armor</h4>';
    [["class", "Class"], ["rating", "Rating"], ["penalty", "Penalty"]].forEach(function (a) {
      h += '<div class="field"><b>' + a[1] + "</b>" + (edit ? '<input data-src="play" data-key="armor" data-field="' + a[0] + '" value="' + esc(p.armor[a[0]]) + '" aria-label="Armor ' + a[1] + '">'
        : '<span class="val">' + esc(p.armor[a[0]]) + "</span>") + "</div>";
    });
    h += '<div class="labelled" style="border-top:1px solid var(--paper-ink);margin-top:.4rem"><b>Description</b>' +
      (edit ? '<textarea data-src="play" data-key="armor" data-field="description" rows="3" aria-label="Armor description">' + esc(p.armor.description) + "</textarea>"
            : '<div class="prose-box">' + esc(p.armor.description) + "</div>") + "</div>";
    return h + "</div></div>";
  }

  /* ------------------------------------------------------------ page 3 */
  function page3() {
    var v = view(), d = v.data, p = v.play;
    var h = '<section class="page" aria-label="Character sheet, page three">' + pageHead(d, "Page three");
    h += '<h3>Expanded Backgrounds</h3><div class="eb-grid">';
    EXPANDED.forEach(function (k) {
      h += '<div class="labelled"><b>' + esc(cap(k)) + "</b>" + area("play", "bgNotes", 3, cap(k), k) + "</div>";
    });
    h += '<div class="labelled"><b>Other (Domain)</b>' + area("data", "domain", 3, "Domain") + "</div></div>";
    h += '<h3>Possessions</h3><div class="eb-grid">';
    POSSESSIONS.forEach(function (b) {
      h += '<div class="labelled"><b>' + esc(b[1]) + "</b>" + lineInputs(b[0], p[b[0]], b[1]) + "</div>";
    });
    h += "</div><h3>Haven</h3>";
    h += '<div class="haven"><div class="labelled" style="border-top:1px solid var(--paper-ink)"><b>Location</b>' +
      (S.edit ? '<input data-src="data" data-key="haven" value="' + esc(d.haven) + '" aria-label="Haven">' : '<div class="prose-box">' + esc(d.haven) + "</div>") + "</div>" +
      '<div class="labelled" style="border-top:1px solid var(--paper-ink)"><b>Description</b>' + area("play", "havenNotes", 4, "Haven description") + "</div></div>";
    return h + "</section>";
  }
  function lineInputs(k, list, label) {
    var edit = canPlay();
    return '<div class="line-list">' + list.map(function (s, i) {
      return edit ? '<input data-src="play" data-key="' + k + '" data-i="' + i + '" value="' + esc(s) + '" aria-label="' + esc(label) + " " + (i + 1) + '">'
                  : "<span>" + esc(s) + "</span>";
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------------ page 4 */
  function page4() {
    var v = view(), d = v.data, p = v.play, edit = canPlay();
    var h = '<section class="page" aria-label="Character sheet, page four">' + pageHead(d, "Page four");
    h += '<h3>History</h3><div class="labelled" style="border-top:1px solid var(--paper-ink)"><b>Prelude</b>' + area("play", "history", 10, "Prelude") + "</div>" +
      '<div class="labelled"><b>Goals</b>' + area("play", "goals", 3, "Goals") + "</div>";
    h += '<h3>Description</h3><div class="desc-grid"><div>';
    DESCRIPTION.forEach(function (x, i) {
      h += '<div class="labelled"' + (i ? "" : ' style="border-top:1px solid var(--paper-ink)"') + "><b>" + esc(x[1]) + "</b>" +
        (edit ? '<input data-src="play" data-key="' + x[0] + '" value="' + esc(p[x[0]]) + '" aria-label="' + esc(x[1]) + '">' : "<span>" + esc(p[x[0]]) + "</span>") + "</div>";
    });
    h += '</div><div class="labelled" style="border-top:1px solid var(--paper-ink)"><b>Appearance</b>' + area("play", "appearance", 12, "Appearance") + "</div></div>";
    h += '<h3>Notes</h3><div class="labelled" style="border-top:1px solid var(--paper-ink)"><b>Not on the printed sheet</b>' + area("play", "notes", 6, "Notes") + "</div>";
    return h + "</section>";
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
      h += '<p class="xp-hint">Press <strong>Spend XP</strong> above the sheet to show the price of the next dot beside each trait, or buy something new below. Each purchase waits for the Storyteller&rsquo;s approval; until then its dots show striped, and you can withdraw it. No trait may rise by more than one dot in a story.</p>';
    } else if (S.role === "storyteller") {
      h += '<p class="xp-hint">You can approve, reject or refund purchases below, award XP, and edit the whole sheet with <strong>Edit sheet</strong>.</p>';
    } else {
      h += '<p class="xp-hint">XP is spent by the player and approved by the Storyteller. ' + (S.session ? "" : "Sign in to spend XP on your own Cainite.") + "</p>";
    }

    if (canSpend()) h += newPurchaseForm(d, x);

    h += '<h3>Purchase costs</h3><table class="xp-table"><tr><th>Buying</th><th>Cost</th></tr>';
    S.costList.forEach(function (c) { h += "<tr><td>" + esc(c.label) + "</td><td>" + esc(c.rule) + "</td></tr>"; });
    h += '</table><p class="xp-hint" style="margin-top:.5rem">&ldquo;Current rating&rdquo; is the rating before the purchase: raising Melee from 2 to 3 costs 2 &times; 2 = 4 XP; a clan Discipline from 3 to 4 costs 15. Raising a Virtue with XP does not raise the Road or Willpower.</p>';

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

  // New things: a Discipline, a Path, a Ritual, an area of expertise.
  // (A new Ability is bought from its own dots: the first dot costs 3.)
  function newPurchaseForm(d, x) {
    var k = S.newKind, cost;
    var kinds = [["clan_discipline", "A new clan Discipline"], ["discipline", "A new Discipline (not of the clan)"],
                 ["path", "A new Path (blood sorcery)"], ["ritual", "A Ritual"], ["expertise", "An area of expertise"]];
    var h = '<h3>Buy something new</h3><form class="xp-form" id="buyNewForm"><label>What<select name="kind" id="newKind">' +
      kinds.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === k ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
    if (k === "clan_discipline" || k === "discipline") {
      var clan = clanOf(d), have = {};
      d.disciplines.forEach(function (x) { have[key(x.name)] = true; });
      var opts = RULES.disciplines.filter(function (x) {
        if (have[key(x.name)]) return false;
        if (!clan || !clan.disciplines.length) return true;
        var inClan = clan.disciplines.some(function (c) { return same(c, x.name); });
        return k === "clan_discipline" ? inClan : !inClan;
      });
      h += '<label>Discipline<select name="trait">' + opts.map(function (o) { return '<option value="' + esc(o.name) + '">' + esc(o.name) + "</option>"; }).join("") + "</select></label>";
      if (!opts.length) h += '<span class="xp-hint">Nothing left to learn here.</span>';
      h += '<span class="xp-hint" style="flex-basis:100%">Learning a Discipline from outside the clan needs a teacher who has it; only Celerity, Fortitude and Potence can be self-taught.</span>';
      cost = costFor(k, 0);
    } else if (k === "path") {
      var havePath = {};
      d.paths.forEach(function (x) { havePath[key(x.name)] = true; });
      h += '<label>Path<select name="trait">' + RULES.paths.filter(function (x) { return !havePath[key(x.name)]; }).map(function (o) {
        return '<option value="' + esc(o.name) + '" data-sorcery="' + esc(o.sorcery) + '">' + esc(o.name) + " (" + esc(o.sorcery) + ")</option>"; }).join("") + "</select></label>";
      cost = costFor("path", 0);
    } else if (k === "ritual") {
      h += '<label>Ritual<input name="trait" maxlength="80" required placeholder="e.g. Defense of the Sacred Haven"></label>' +
        '<label>Level<input class="num" type="number" name="detail" min="1" max="10" value="1" required id="ritualLevel"></label>';
      cost = costFor("ritual", S.ritualLevel || 1);
    } else {
      var has = ALL_ABILITIES.filter(function (a) { return d.abilities[a[0]] > 0; });
      h += '<label>Ability<select name="trait">' + has.map(function (a) { return '<option value="' + a[0] + '">' + esc(a[1]) + "</option>"; }).join("") + "</select></label>" +
        '<label>Field<input name="detail" maxlength="80" required placeholder="e.g. Canon law"></label>';
      cost = costFor("expertise", 0);
    }
    h += '<button class="btn" type="submit"' + (cost == null || cost > x.available ? " disabled" : "") + ">" +
      (cost == null ? "Cannot be bought" : "Request for " + cost + " XP") + "</button></form>";
    return h;
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (!S.sheet) return;
    $("sheet").innerHTML = page1() + page2() + page3() + page4();
    $("xp").innerHTML = xpPanel();
    var name = view().data.name || (NPC ? "NPC sheet" : "Character sheet");
    $("sheetTitle").textContent = name;
    $("crumbName").textContent = name;
    document.title = name + (NPC ? " · NPC sheet" : " · Character sheet") + " · " + CHRONICLE_NAME + " · VisTectus";

    $("btnSpend").hidden = !canSpend() || !!S.edit;
    $("btnSpend").textContent = S.spend ? "Hide prices" : "Spend XP";
    $("btnSpend").setAttribute("aria-pressed", S.spend ? "true" : "false");
    $("btnEdit").hidden = !isST() || !!S.edit;
    $("btnSaveSheet").hidden = !S.edit;
    $("btnCancelEdit").hidden = !S.edit;
    $("btnPdf").hidden = !!S.edit;
    $("btnAccount").hidden = !db;
    $("btnAccount").textContent = S.session ? "Sign out" : "Sign in";
    $("btnAccount").title = S.session && S.session.user ? "Signed in as " + S.session.user.email : "Sign in to update your Cainite";
    if (!S.saving && !S.saveFailed) setStatus(roleLine());
  }
  function roleLine() {
    if (!S.online) return "";
    if (S.edit) return "Editing the whole sheet: nothing is saved until you press Save sheet.";
    if (NPC) return "Storyteller only: players cannot see this sheet. Damage and notes save as you go.";
    if (S.role === "storyteller") return "Storyteller: you can change anything on this sheet.";
    if (S.role === "owner") return "Your Cainite: damage, blood, Willpower and notes save as you go.";
    return S.session ? "You are viewing another Cainite's sheet." : "";
  }

  /* ------------------------------------------------------------ loading */
  async function fetchOnline() {
    if (NPC) return fetchNpc();
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name,data,play,chronicle").eq("slug", slug).maybeSingle(),
      db.from("vtda_xp_costs").select("*").order("sort", { ascending: true }),
      db.from("vtda_xp_requests").select("*").eq("slug", slug).order("requested_at", { ascending: false }),
      db.from("vtda_xp_awards").select("*").eq("slug", slug).order("awarded_at", { ascending: false })
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    if (!r[0].data || r[0].data.chronicle !== CHRONICLE) return false;
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

  async function fetchNpc() {
    S.session = (await db.auth.getSession()).data.session;
    S.online = false; S.role = "viewer";
    if (!S.session) return "signin";
    var st = await db.rpc("is_chronicle_storyteller", { p_chronicle: CHRONICLE });
    if (st.error || st.data !== true) return "denied";
    var r = await db.from("npc_sheets").select("slug,name,data,play,chronicle").eq("slug", slug).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data || r.data.chronicle !== CHRONICLE) return false;
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
    $("btnAccount").hidden = !db || !S.session;
    $("btnAccount").textContent = "Sign out";
    var msg = {
      signin: 'NPC sheets are for the Storyteller. <a href="storyteller.html">Sign in on the Storyteller page</a>, then open the sheet from there.',
      denied: "NPC sheets are for the Storyteller, and this account is not one.",
      error: "The NPC sheets could not be reached just now. Try again in a moment."
    }[why] || 'There is no NPC sheet at this address. Open one from the <a href="storyteller.html">Storyteller page</a>.';
    $("sheet").innerHTML = '<div class="sheet-notice">' + msg + "</div>";
  }

  async function load() {
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return NPC ? storytellerOnly(false) : notFound();
    setStatus("Opening the sheet…");
    if (NPC) {
      var got = "error";
      if (db) { try { got = await fetchNpc(); } catch (e) { console.error(e); got = "error"; } }
      if (got !== true) return storytellerOnly(got);
      $("sheetNotice").hidden = true;
      setStatus("");
      render();
      return;
    }
    var ok = false;
    if (db) {
      try { ok = await fetchOnline(); if (!ok) return notFound(); }
      catch (e) {
        console.error(e);
        setStatus("");
        $("sheet").innerHTML = '<div class="sheet-notice">The sheet could not be reached just now. Try again in a moment.</div>';
        return;
      }
    } else {
      setStatus("");
      $("sheet").innerHTML = '<div class="sheet-notice">Online sheets are not connected.</div>';
      return;
    }
    $("sheetNotice").hidden = true;
    setStatus("");
    render();
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
    $("sheet").innerHTML = '<div class="sheet-notice">There is no character sheet at this address. Go back to <a href="players.html">the coterie</a> and open a Cainite from there.</div>';
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
  var LIST_KIND = { discipline: "disciplines", background: "backgrounds", path: "paths", other: "otherTraits" };

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b || !S.sheet) return;
    var a = b.getAttribute("data-action"), v = view();

    if (a === "health" && canPlay()) {
      var i = +b.getAttribute("data-i"), cur = v.play.health[i];
      v.play.health[i] = cur === "" ? "/" : cur === "/" ? "X" : cur === "X" ? "*" : "";
      render(); savePlaySoon();
    } else if (a === "wp" && canPlay()) {
      var w = +b.getAttribute("data-i");
      v.play.willpower[w] = v.play.willpower[w] === "/" ? "" : "/";
      render(); savePlaySoon();
    } else if (a === "blood" && canPlay()) {
      var n = +b.getAttribute("data-n");
      v.play.blood = v.play.blood === n ? n - 1 : n;
      render(); savePlaySoon();
    } else if (a === "dot" && S.edit) {
      var kind = b.getAttribute("data-kind"), k = b.getAttribute("data-key"), to = +b.getAttribute("data-n"), d = v.data;
      function step(cur) { return cur === to ? to - 1 : to; }
      if (LIST_KIND[kind]) { var row = d[LIST_KIND[kind]][+k]; row.dots = step(row.dots); }
      else if (kind === "attribute") d.attributes[k] = step(d.attributes[k]);
      else if (kind === "ability") d.abilities[k] = step(d.abilities[k]);
      else if (kind === "virtue") d.virtues[k] = step(d.virtues[k]);
      else if (kind === "road") d.roadRating = step(d.roadRating);
      else if (kind === "willpower") d.willpower = step(d.willpower);
      render();
    } else if (a === "add-row" && S.edit) {
      var ln = b.getAttribute("data-list"), blank = {
        disciplines: { name: "", dots: 1, clan: false }, backgrounds: { name: "", dots: 1 },
        paths: { name: "", dots: 1, sorcery: "Thaumaturgy", primary: false }, rituals: { name: "", level: 1 },
        expertise: { ability: "academics", name: "" }, meritsFlaws: { name: "", points: 1, kind: "Merit" },
        otherTraits: { name: "", dots: 1 }
      }[ln];
      if (blank) v.data[ln].push(blank);
      render();
    } else if (a === "del-row" && S.edit) {
      v.data[b.getAttribute("data-list")].splice(+b.getAttribute("data-i"), 1);
      render();
    } else if (a === "buy") {
      buy(b.getAttribute("data-kind"), b.getAttribute("data-trait"));
    } else if (a === "approve") {
      rpc("vtda_approve_xp_request", { p_id: +b.getAttribute("data-id"), p_note: "" }, "Approved: it is on the sheet now.");
    } else if (a === "reject") {
      var why = window.prompt("Reject this purchase? You can add a reason for the player (optional):", "");
      if (why !== null) rpc("vtda_close_xp_request", { p_id: +b.getAttribute("data-id"), p_note: why }, "Rejected; the XP is free again.");
    } else if (a === "withdraw") {
      if (window.confirm("Withdraw this purchase? Any later purchase of the same trait is withdrawn with it.")) {
        rpc("vtda_close_xp_request", { p_id: +b.getAttribute("data-id"), p_note: "" }, "Withdrawn; the XP is free again.");
      }
    } else if (a === "refund") {
      var note = window.prompt("Refund this purchase? It comes off the sheet and the XP goes back. Note for the player (optional):", "");
      if (note !== null) rpc("vtda_refund_xp_request", { p_id: +b.getAttribute("data-id"), p_note: note }, "Refunded.");
    } else if (a === "del-award") {
      if (window.confirm("Remove this XP award?")) rpc("vtda_delete_xp_award", { p_id: +b.getAttribute("data-id") }, "Award removed.");
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!S.sheet || !t.matches("input[data-src], textarea[data-src], input[data-list]")) return;
    var v = view();
    if (t.hasAttribute("data-list")) {
      if (!S.edit || t.type === "checkbox") return;
      var row = v.data[t.getAttribute("data-list")][+t.getAttribute("data-i")], f = t.getAttribute("data-field");
      row[f] = (f === "level" || f === "points") ? num(t.value, 10) : t.value;
      return;
    }
    var src = t.getAttribute("data-src"), k = t.getAttribute("data-key");
    if (src === "data" && !S.edit) return;
    if (src === "play" && !canPlay()) return;
    var val = t.hasAttribute("data-int") ? num(t.value, 13) : t.value;
    var holder = v[src][k], f = t.getAttribute("data-field");
    if (t.hasAttribute("data-i")) {
      if (f) holder[+t.getAttribute("data-i")][f] = val;   // a combat row
      else holder[+t.getAttribute("data-i")] = val;         // a line of a list
    } else if (f) holder[f] = val;                           // armor, a Background's notes
    else v[src][k] = val;
    if (src === "play") savePlaySoon();
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "newKind") { S.newKind = t.value; render(); return; }
    if (t.id === "ritualLevel") { S.ritualLevel = num(t.value, 10, 1); var keep = t.value; render(); var r = $("ritualLevel"); if (r) r.value = keep; return; }
    if (!S.edit) return;
    var d = view().data;
    if (t.matches("[data-list]")) {
      var row = d[t.getAttribute("data-list")][+t.getAttribute("data-i")], f = t.getAttribute("data-field");
      row[f] = t.type === "checkbox" ? t.checked : t.value;
      // A Discipline picked from the list: tick "clan" when the clan has it.
      if (t.getAttribute("data-list") === "disciplines" && f === "name") {
        var clan = clanOf(d);
        if (clan) row.clan = clan.disciplines.some(function (c) { return same(c, t.value); });
        render();
      }
      if (t.getAttribute("data-list") === "paths" && f === "name") {
        var pr = findByName(RULES.paths, t.value);
        if (pr) row.sorcery = pr.sorcery;
        render();
      }
      return;
    }
    if (t.matches("select[data-src]")) {
      var k = t.getAttribute("data-key");
      d[k] = t.hasAttribute("data-int") ? num(t.value, 13, 3) : t.value;
      render();
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id === "awardForm") {
      e.preventDefault();
      var f = e.target, amount = parseInt(f.amount.value, 10);
      if (!amount) { window.alert("Award a number of XP other than zero."); return; }
      rpc("vtda_award_xp", { p_slug: slug, p_amount: amount, p_note: f.note.value.trim() },
        (amount > 0 ? "+" : "") + amount + " XP awarded.");
    } else if (e.target.id === "buyNewForm") {
      e.preventDefault();
      var g = e.target, kind = g.kind.value;
      var traitVal = (g.trait && g.trait.value || "").trim(), detail = (g.detail && g.detail.value || "").trim();
      if (!traitVal) return;
      var cost, what;
      if (kind === "path") {
        var opt = g.trait.options[g.trait.selectedIndex];
        detail = opt ? opt.getAttribute("data-sorcery") : "";
        cost = costFor("path", 0); what = "the Path " + traitVal;
      } else if (kind === "ritual") {
        cost = costFor("ritual", num(detail, 10, 1)); what = "the Ritual " + traitVal + " (level " + detail + ")";
      } else if (kind === "expertise") {
        cost = costFor("expertise", 0); what = "the field " + detail + " for " + traitLabel("ability", traitVal);
      } else {
        cost = costFor(kind, 0); what = (kind === "clan_discipline" ? "the clan Discipline " : "the Discipline ") + traitVal;
      }
      if (!window.confirm("Ask to buy " + what + " for " + cost + " XP? The Storyteller approves it before it goes on your sheet.")) return;
      rpc("vtda_request_xp", { p_slug: slug, p_kind: kind, p_trait: traitVal, p_detail: detail },
        "Requested. It shows on your sheet once the Storyteller approves it.");
    }
  });

  function buy(kind, traitKey) {
    var d = view().data, level;
    if (kind === "clan_discipline" || kind === "discipline") level = (d.disciplines.filter(function (x) { return same(x.name, traitKey); })[0] || { dots: 0 }).dots;
    else if (kind === "path") level = (d.paths.filter(function (x) { return same(x.name, traitKey); })[0] || { dots: 0 }).dots;
    else if (kind === "background") level = (d.backgrounds.filter(function (x) { return same(x.name, traitKey); })[0] || { dots: 0 }).dots;
    else if (kind === "attribute") level = d.attributes[traitKey];
    else if (kind === "ability") level = d.abilities[traitKey];
    else if (kind === "virtue") level = d.virtues[traitKey];
    else if (kind === "road") level = d.roadRating;
    else level = d.willpower;
    var cur = level + pendingFor(kind, traitKey), cost = costFor(kind, cur);
    var name = traitLabel(kind, traitKey);
    var extra = kind === "virtue" ? "\n\nRaising a Virtue with XP does not raise the Road or Willpower." : "";
    if (!window.confirm("Ask to raise " + name + " to " + (cur + 1) + " for " + cost + " XP?" + extra + "\n\nThe Storyteller approves it before it goes on your sheet. Until then it shows striped, and you can withdraw it.")) return;
    rpc("vtda_request_xp", { p_slug: slug, p_kind: kind, p_trait: traitKey, p_detail: "" },
      "Requested: " + name + " " + (cur + 1) + ". It goes on your sheet once approved.");
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
    var e = S.edit, d = e.data;
    ["disciplines", "backgrounds", "paths", "rituals", "meritsFlaws", "otherTraits"].forEach(function (k) {
      d[k] = d[k].filter(function (x) { return String(x.name).trim(); });
    });
    d.expertise = d.expertise.filter(function (x) { return x.name.trim(); });
    setStatus("Saving…");
    try {
      var r = NPC
        ? await db.from("npc_sheets").update({ name: (d.name || "").trim() || S.sheet.name, data: d, play: e.play,
            updated_at: new Date().toISOString() }).eq("slug", slug)
        : await db.rpc("vtda_save_sheet", { p_slug: slug, p_data: d, p_play: e.play });
      if (r.error) throw r.error;
      S.edit = null;
      toast("Sheet saved.");
      await reload();
    } catch (err) {
      console.error(err);
      setStatus("Not saved: " + errText(err), true);
    }
  });
  $("btnPrint").addEventListener("click", function () { window.print(); });
  $("btnPdf").addEventListener("click", downloadPdf);

  /* ------------------------------------------------------------------ PDF
     Fills the official four-page sheet with what the page shows now. Its
     text fields have plain names (name, clan, merits1...); its dots do
     not, so they are found by where they sit: each row of dots is the
     boxes on one line of a page, left to right. Coordinates are the
     template's own (points from the bottom-left corner). */
  var DOT_COLS = [[125, 210], [300, 385], [470, 560]];          // the three columns of dots
  var ATTR_ROWS = [591, 578, 565];
  var ABILITY_ROWS = [505, 492, 479, 467, 454, 441, 428, 415, 402, 389];
  var ADV_ROWS = [315, 302, 289, 276, 263];                     // Disciplines, Backgrounds
  var VIRTUE_ROWS = [315, 289, 263];
  var OTHER_ROWS = [512, 499, 486];                             // page two, Other Traits
  var PATH_ROWS = [434, 421, 408, 395, 382, 369, 356];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve;
      if (src === PDF_LIB) { s.integrity = PDF_LIB_SRI; s.crossOrigin = "anonymous"; }
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  // The PDF's built-in font covers Western European text only.
  var WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  function pdfSafe(s) {
    return String(s || "").replace(/[‐-‒−]/g, "-").replace(/ /g, " ").replace(/→/g, "->").replace(/◆/g, "")
      .replace(/[^\n\t\x20-\xff]/g, function (c) { return WIN_ANSI_EXTRA.indexOf(c) >= 0 ? c : "?"; });
  }

  async function downloadPdf() {
    if (!S.sheet) return;
    var btn = $("btnPdf"), was = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    try {
      if (!window.PDFLib) await loadScript(PDF_LIB);
      var L = window.PDFLib;
      var doc = await L.PDFDocument.load(await (await fetch(TEMPLATE_PDF)).arrayBuffer());
      var form = doc.getForm(), font = await doc.embedFont(L.StandardFonts.Helvetica);
      var texts = {}, boxes = [], onPage = new Map();
      // Which page each widget is on, from the pages' own lists of annotations.
      doc.getPages().forEach(function (pg, i) {
        var annots = pg.node.Annots();
        for (var k = 0; annots && k < annots.size(); k++) onPage.set(doc.context.lookup(annots.get(k)), i + 1);
      });
      function pageOf(widget) { return onPage.get(widget.dict) || 0; }
      form.getFields().forEach(function (f) {
        if (f instanceof L.PDFTextField || f instanceof L.PDFDropdown) texts[f.getName()] = f;
        else if (f instanceof L.PDFCheckBox) {
          f.acroField.getWidgets().forEach(function (w) {
            var r = w.getRectangle();
            boxes.push({ f: f, page: pageOf(w), x: Math.round(r.x), y: Math.round(r.y) });
          });
        }
      });
      // Text at the largest size, up to 10pt, that fits its box.
      function text(name, value) {
        var f = texts[name];
        if (!f || !(f instanceof L.PDFTextField)) return;
        value = pdfSafe(value).replace(/\s*\n\s*/g, f.isMultiline() ? "\n" : "; ");
        f.setText(value);
        if (!value) return;
        var r = f.acroField.getWidgets()[0].getRectangle(), s = Math.min(10, r.height * 0.72);
        if (f.isMultiline()) {
          for (s = 9; s > 4 && wrapped(value, s, r.width - 4).length * s * 1.2 > r.height - 2; s -= 0.25) {}
        } else {
          while (s > 4 && font.widthOfTextAtSize(value, s) > r.width - 4) s -= 0.25;
        }
        f.acroField.setDefaultAppearance("/Helv " + s.toFixed(2) + " Tf 0 g");
      }
      // Lines of words that fit `width` at `size`.
      function wrapped(value, size, width) {
        var out = [];
        String(value).split("\n").forEach(function (para) {
          var line = "";
          para.split(/\s+/).filter(Boolean).forEach(function (word) {
            var next = line ? line + " " + word : word;
            if (line && font.widthOfTextAtSize(next, size) > width) { out.push(line); line = word; }
            else line = next;
          });
          out.push(line);
        });
        while (out.length && !out[out.length - 1]) out.pop();
        return out;
      }
      // A block of text over a run of one-line fields: wrapped to their
      // width at 9pt; whatever does not fit goes on the last line, smaller.
      function textLines(names, value) {
        value = pdfSafe(value);
        var first = texts[names[0]];
        if (!first) return;
        var width = first.acroField.getWidgets()[0].getRectangle().width - 4;
        var ls = wrapped(value, 9, width);
        if (ls.length > names.length) ls = ls.slice(0, names.length - 1).concat([ls.slice(names.length - 1).join(" ")]);
        names.forEach(function (n, i) { text(n, ls[i] || ""); });
      }
      function names(prefix, from, to) { var o = []; for (var i = from; i <= to; i++) o.push(prefix + i); return o; }
      // Tick the first `level` dots of the row at height y, between x0 and x1.
      function tick(page, y, cols, level) {
        boxes.filter(function (b) { return b.page === page && Math.abs(b.y - y) <= 2 && b.x >= cols[0] && b.x <= cols[1]; })
          .sort(function (a, b) { return a.x - b.x; })
          .forEach(function (b, i) { if (i < level) b.f.check(); else b.f.uncheck(); });
      }

      var v = view(), d = v.data, p = v.play, x = xp(), road = roadOf(d);

      // Page one
      text("name", d.name); text("player", d.player); text("chronicle", CHRONICLE_NAME);
      text("nature", d.nature); text("demeanor", d.demeanor); text("concept", d.concept);
      text("clan", d.clan); text("gen", GEN_NAMES[d.generation - 3] || ""); text("sire", d.sire);
      ATTRS.forEach(function (g, c) { g[1].forEach(function (k, r) { tick(1, ATTR_ROWS[r], DOT_COLS[c], d.attributes[k]); }); });
      ABILITIES.forEach(function (g, c) { g[1].forEach(function (a, r) { if (r < ABILITY_ROWS.length) tick(1, ABILITY_ROWS[r], DOT_COLS[c], d.abilities[a[0]]); }); });
      d.disciplines.slice(0, 5).forEach(function (t, i) { text("disciplines" + (i + 1), t.name); tick(1, ADV_ROWS[i], DOT_COLS[0], t.dots); });
      d.backgrounds.slice(0, 5).forEach(function (t, i) { text("back" + (i + 1), t.name); tick(1, ADV_ROWS[i], DOT_COLS[1], t.dots); });
      virtuePair(d).forEach(function (k, i) { tick(1, VIRTUE_ROWS[i], DOT_COLS[2], d.virtues[k]); });
      // Other Traits: the areas of expertise, and anything that did not fit above.
      var misc = [];
      ALL_ABILITIES.forEach(function (a) { d.expertise.filter(function (e) { return e.ability === a[0]; }).forEach(function (e) { misc.push(a[1] + ": " + e.name); }); });
      d.disciplines.slice(5).forEach(function (t) { misc.push(t.name + " " + t.dots); });
      d.backgrounds.slice(5).forEach(function (t) { misc.push(t.name + " " + t.dots); });
      if (d.extraHealth) misc.push("Extra Bruised levels: " + d.extraHealth);
      misc.slice(0, 12).forEach(function (m, i) { text("misc" + (i + 1), m); });
      text("pathofenlight", d.road);
      text("bearing1", road && road.aura ? road.aura : ""); text("bearing2", auraMod(d.roadRating));
      boxes.filter(function (b) { return b.page === 1 && b.f.getName().indexOf("hdot") === 0; })
        .forEach(function (b) { var n = +b.f.getName().slice(4); if (n <= d.roadRating) b.f.check(); else b.f.uncheck(); });
      boxes.filter(function (b) { return b.page === 1 && /^willdot\d+$/.test(b.f.getName()); })
        .forEach(function (b) { var n = +b.f.getName().slice(7); if (n <= d.willpower) b.f.check(); else b.f.uncheck(); });
      // Willpower points left (the first row of small boxes), then the blood in the pool.
      var wpLeft = d.willpower - p.willpower.slice(0, d.willpower).filter(Boolean).length;
      var g = genRow(d), blood = Math.min(p.blood, g && g.pool ? g.pool : 10);
      boxes.filter(function (b) { return b.page === 1 && /^check\d+$/.test(b.f.getName()); }).forEach(function (b) {
        var n = +b.f.getName().slice(5);
        if (n <= 10 ? n <= wpLeft : n - 10 <= blood) b.f.check(); else b.f.uncheck();
      });
      for (var hl = 0; hl < 7; hl++) {
        var dd = texts["health" + (hl + 1)], m = p.health[d.extraHealth + hl] || "";
        if (dd && dd instanceof L.PDFDropdown && m) dd.select(m);
      }
      text("weakness", d.weakness);

      // Page two
      ["Merit", "Flaw"].forEach(function (kind) {
        var pre = kind === "Merit" ? "merits" : "flaws";
        d.meritsFlaws.filter(function (t) { return t.kind === kind; }).slice(0, 7).forEach(function (t, i) {
          text(pre + (i + 1), t.name); text(pre + (i + 8), mfType(t)); text(pre + (i + 15), String(t.points));
        });
      });
      d.otherTraits.slice(0, 9).forEach(function (t, i) {
        text("ot" + (i + 1), t.name);
        tick(2, OTHER_ROWS[i % 3], DOT_COLS[Math.floor(i / 3)], t.dots);
      });
      d.rituals.slice(0, 6).forEach(function (t, i) { text("rituals" + (i + 1), t.name); text("rituals" + (i + 7), String(t.level)); });
      d.paths.slice(0, 7).forEach(function (t, i) {
        text("paths" + (i + 1), t.name + " (" + t.sorcery + (t.primary ? ", primary" : "") + ")");
        tick(2, PATH_ROWS[i], [505, 560], t.dots);
      });
      if (S.online && !NPC) {
        text("exp1", String(x.total)); text("exp2", String(x.spent));
        textLines(names("exp", 3, 7), S.requests.filter(function (r) { return r.status === "approved"; })
          .map(function (r) { return describe(r) + " (" + r.cost + ")"; }).join("; "));
      }
      textLines(names("derangements", 1, 7), d.derangements);
      p.combat.forEach(function (r, i) { COMBAT_COLS.forEach(function (c, j) { text("combat" + (j * 6 + i + 1), r[c[0]]); }); });
      text("armor1", p.armor.class); text("armor2", p.armor.rating); text("armor3", p.armor.penalty);
      textLines(names("armor", 4, 6), p.armor.description);

      // Page three: each Background box has three lines; Other is the Domain.
      EXPANDED.forEach(function (k, i) {
        var at = i < 5 ? i * 3 + 1 : 16 + (i - 5) * 3;
        textLines(names("eb", at, at + 2), p.bgNotes[k]);
      });
      text("eb28", "Domain");
      textLines(["eb29", "eb30", "eb31"], d.domain);
      [["gear", 1], ["feeding", 6], ["owned", 10], ["transport", 15]].forEach(function (b) {
        var n = POSSESSIONS.filter(function (x) { return x[0] === b[0]; })[0][2];
        p[b[0]].slice(0, n).forEach(function (s, i) { text("possessions" + (b[1] + i), s); });
      });
      textLines(names("haven", 1, 4), d.haven);
      textLines(names("haven", 5, 8), p.havenNotes);

      // Page four
      textLines(names("history", 1, 10), p.history);
      textLines(names("history", 11, 13), p.goals);
      DESCRIPTION.forEach(function (k, i) { text("description" + (i + 1), p[k[0]]); });
      textLines(names("description", 12, 22), p.appearance);

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

  /* ------------------------------------------------------------ signing in */
  $("btnAccount").addEventListener("click", async function () {
    if (S.session) {
      if (!window.confirm("Sign out? You will need to sign in again to update your Cainite.")) return;
      await db.auth.signOut();
      S.session = null; S.role = "viewer"; S.spend = false; S.edit = null;
      if (NPC) return load();
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
        options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split("#")[0] }
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
      if ((event === "SIGNED_IN" && !S.session) || (event === "SIGNED_OUT" && S.session)) reload();
    });
  }

  window.addEventListener("beforeunload", function (e) {
    if (S.edit || S.saving || S.saveFailed) { e.preventDefault(); e.returnValue = ""; }
  });

  load();
})();
