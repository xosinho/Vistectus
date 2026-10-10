/* =====================================================================
   D&D CAMPAIGNS — the DM Screen
   ---------------------------------------------------------------------
   Only for the campaign's Dungeon Masters: the page opens through the
   gate (gate.js, data-need="storyteller"), which signs people in.
     - how the campaign advances (XP or milestones), and awards for the
       whole party after a session;
     - the party: levels, XP, who plays whom, level-ups waiting;
     - new characters from Create a Character, waiting for approval;
     - the players (add and remove them);
     - NPC stat sheets (DM only).
   Being a campaign's DM means being added to it as Dungeon Master on
   the Admin page; the database checks that, not this page.
   ===================================================================== */
(function () {
  "use strict";

  var CAMPAIGN = document.body.getAttribute("data-campaign") || "";
  var R = window.DND_RULES || {};
  var XP_T = R.xpThresholds || [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  var db = null, Gate = null;
  var root = document.getElementById("st");

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  function slugify(s, n) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n || 34);
  }
  function level(d) { return ((d && d.classes) || []).reduce(function (t, c) { return t + (parseInt(c.level, 10) || 0); }, 0); }
  function classLine(d) {
    return ((d && d.classes) || []).map(function (c) { return (c.name || c.key) + " " + c.level; }).join(" / ");
  }

  async function overview() {
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name,data").eq("chronicle", CAMPAIGN).order("name", { ascending: true }),
      db.from("dnd_awards").select("slug,xp,levels"),
      db.from("dnd_levelups").select("id,slug,from_level,to_level,status,requested_at").eq("status", "pending").order("requested_at", { ascending: true }),
      db.from("campaign_settings").select("*").eq("chronicle", CAMPAIGN).maybeSingle(),
      db.rpc("sheet_owners_of", { p_chronicle: CAMPAIGN }),
      db.rpc("members_of", { p_chronicle: CAMPAIGN }),
      db.from("character_drafts").select("id,email,name,status,submitted_at,updated_at").eq("chronicle", CAMPAIGN).order("updated_at", { ascending: false })
    ]);
    var bar = '<div class="sheet-bar"><span class="sheet-status">Signed in as ' + esc(Gate.email) + ' · Dungeon Master</span><span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" id="stOut">Sign out</button></div>';
    var broken = r.slice(0, 4).filter(function (x) { return x.error; })[0];
    if (broken) {
      root.innerHTML = bar + '<div class="sheet-notice">The D&amp;D tables are not set up yet: run <code>dnd/sql/setup.sql</code> in Supabase (see dnd/README.md). (' + esc(errText(broken.error)) + ")</div>";
      wireSignOut();
      return;
    }
    var sheets = r[0].data || [], awards = r[1].data || [], levelups = r[2].data || [];
    var settings = r[3].data || { advancement: "xp", start_level: 1 }, mile = settings.advancement === "milestone";
    var owners = {}, members = r[5].data || [], drafts = r[6].data || [];
    (r[4].data || []).forEach(function (o) { owners[o.slug] = o.email; });
    var bySlug = {};
    sheets.forEach(function (s) { bySlug[s.slug] = s; });

    var h = bar;
    // ---- how the campaign advances
    h += '<section class="xp-panel"><h2>Advancement</h2>' +
      '<form class="xp-form" id="advForm"><label>The campaign uses<select name="mode">' +
        '<option value="xp"' + (mile ? "" : " selected") + ">Experience points</option>" +
        '<option value="milestone"' + (mile ? " selected" : "") + ">Milestones</option></select></label>" +
        '<label>Starting level<input class="num" type="number" name="start" min="1" max="20" value="' + (settings.start_level || 1) + '"></label>' +
        '<button class="btn btn--ghost" type="submit">Save</button></form>' +
      '<p class="xp-hint" style="margin-top:.4rem">' + (mile
        ? "Milestones: grant the party a level when it reaches one. Each adventurer then levels up on their sheet, and you approve it."
        : "Experience points: award XP after each session; at each threshold an adventurer may level up on their sheet, and you approve it.") +
      " The starting level is the level a new character may reach before any award.</p>";
    if (sheets.length) {
      h += "<h3>" + (mile ? "Grant the party a level" : "Award the party XP") + "</h3>" +
        '<form class="xp-form" id="partyAward"><label>' + (mile ? "Levels each" : "XP each") +
        '<input class="num" type="number" name="amount" step="1" required value="' + (mile ? 1 : 100) + '"></label>' +
        (mile ? "" : '<label class="chk" style="flex-direction:row;align-items:center;gap:.3rem"><input type="checkbox" name="split"> split this total between them</label>') +
        '<label style="flex:1">For<input name="note" maxlength="200" placeholder="e.g. Session 4: the drowned chapel" style="width:100%"></label>' +
        '<button class="btn" type="submit">' + (mile ? "Grant" : "Award") + "</button></form>" +
        '<p class="sheet-status" id="partyMsg" role="status"></p>';
      if (!mile) h += '<p class="xp-hint">Encounter XP: add up the XP of the creatures defeated (each creature&rsquo;s XP is in its stat block) and split it between the adventurers who took part. Award XP for problems solved and goals reached in the same way.</p>';
    }
    h += "</section>";

    // ---- the party
    h += '<section class="xp-panel"><h2>The Party</h2>' +
      '<p class="xp-hint">Open an adventurer to award them alone, see their level-ups, or edit the sheet. Choose who plays each one from the campaign&rsquo;s players (add players under <strong>Players</strong>, below). Players make their own with <a href="create.html">Create a Character</a>; it comes to you below for approval.</p>';
    if (!sheets.length) h += '<p class="empty-line">No adventurers yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Adventurer</th><th>Class</th><th class="num">Level</th><th class="num">' + (mile ? "Granted" : "XP") + "</th><th>Played by</th><th></th></tr>";
      sheets.forEach(function (s) {
        var xp = 0, lv = 0;
        awards.forEach(function (a) { if (a.slug === s.slug) { xp += a.xp || 0; lv += a.levels || 0; } });
        var cur = level(s.data), reach = mile ? Math.min(20, (settings.start_level || 1) + lv) : XP_T.filter(function (t) { return xp >= t; }).length;
        reach = Math.max(reach, settings.start_level || 1);
        h += "<tr><td>" + esc(s.name) + '<br><small class="xp-hint">sheet.html?c=' + esc(s.slug) + "</small></td><td>" + esc(classLine(s.data)) +
          '</td><td class="num">' + cur + (reach > cur ? ' <span class="status status-pending" title="May level up">→ ' + reach + "</span>" : "") +
          '</td><td class="num">' + (mile ? "+" + lv : xp.toLocaleString()) + "</td><td>" + ownerPicker(s.slug, owners[s.slug], members) + "</td>" +
          '<td class="acts"><a class="btn btn--ghost" href="sheet.html?c=' + encodeURIComponent(s.slug) + '">Open sheet</a> ' +
          '<button type="button" class="btn btn--ghost" data-delsheet="' + esc(s.slug) + '" data-name="' + esc(s.name) + '">Delete</button></td></tr>';
      });
      h += "</table>";
    }
    h += "<h3>Level-ups waiting for you</h3>";
    var lu = levelups.filter(function (l) { return bySlug[l.slug]; });
    if (!lu.length) h += '<p class="empty-line">None waiting.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Sent</th><th>Adventurer</th><th>Level</th><th></th></tr>' + lu.map(function (l) {
        return "<tr><td>" + esc(fmtDate(l.requested_at)) + "</td><td>" + esc(bySlug[l.slug].name) + "</td><td>" + l.from_level + " → " + l.to_level +
          '</td><td class="acts"><a class="btn" href="levelup.html?c=' + encodeURIComponent(l.slug) + '">Review</a></td></tr>';
      }).join("") + "</table>";
    }
    h += draftsHtml(drafts);
    h += '<h3>A blank sheet</h3><form class="xp-form" id="sheetNew">' +
      '<label style="flex:1">Name<input id="sheetName" maxlength="120" required placeholder="e.g. Ser Aldric" style="width:100%"></label>' +
      '<label>Short name<input id="sheetSlug" maxlength="40" pattern="[a-z0-9-]{1,40}" required placeholder="aldric"></label>' +
      '<button class="btn btn--ghost" type="submit">Create sheet</button></form>' +
      '<p class="xp-hint" style="margin-top:.4rem">Normally players make their characters with Create a Character. A blank sheet is for a character you build yourself with <strong>Edit sheet</strong>. The short name is the sheet&rsquo;s address, and goes in the <code>sheet</code> field of the adventurer&rsquo;s card in <code>assets/data/players.js</code>.</p>' +
      '<p class="sheet-status" id="sheetMsg" role="status"></p></section>';

    h += '<section class="xp-panel"><h2>Players</h2><div id="members"></div></section><div id="npcSheets"></div>';
    root.innerHTML = h;
    wireSignOut();
    wireForms(sheets, mile);
    window.ChronicleMembers.render(document.getElementById("members"), { db: db, chronicle: CAMPAIGN, admin: false,
      unit: "campaign", dm: "Dungeon Master", onChange: function () { render(); } });
    npcSheets();
  }

  function wireSignOut() {
    document.getElementById("stOut").addEventListener("click", async function () { await db.auth.signOut(); window.location.reload(); });
  }

  function ownerPicker(slug, email, members) {
    var players = members.filter(function (m) { return m.role === "player" || m.email === email; });
    return '<select class="owner-pick" data-slug="' + esc(slug) + '" aria-label="Played by"><option value="">— nobody —</option>' +
      players.map(function (m) { return '<option value="' + esc(m.email) + '"' + (m.email === email ? " selected" : "") + ">" + esc(m.email) + "</option>"; }).join("") + "</select>";
  }

  function draftsHtml(drafts) {
    var waiting = drafts.filter(function (d) { return d.status === "submitted"; });
    var working = drafts.filter(function (d) { return d.status === "draft" || d.status === "rejected"; });
    var h = "<h3>New characters waiting for your approval</h3>";
    if (!waiting.length) h += '<p class="empty-line">None waiting.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Sent</th><th>Character</th><th>Player</th><th></th></tr>' + waiting.map(function (d) {
        return "<tr><td>" + esc(fmtDate(d.submitted_at)) + "</td><td>" + esc(d.name || "(no name)") + "</td><td>" + esc(d.email) +
          '</td><td class="acts"><a class="btn" href="create.html?review=' + encodeURIComponent(d.id) + '">Review</a></td></tr>';
      }).join("") + "</table>";
    }
    if (working.length) {
      h += '<p class="xp-hint" style="margin-top:.6rem">Being made: ' + working.map(function (d) {
        return esc(d.name || "(no name)") + " (" + esc(d.email) + (d.status === "rejected" ? ", sent back" : "") + ")";
      }).join(", ") + ".</p>";
    }
    return h;
  }

  function wireForms(sheets, mile) {
    document.getElementById("advForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var s = await db.rpc("dnd_set_advancement", { p_chronicle: CAMPAIGN, p_mode: f.mode.value, p_start_level: parseInt(f.start.value, 10) || 1 });
      if (s.error) { window.alert("Not saved: " + errText(s.error)); return; }
      render();
    });
    var pa = document.getElementById("partyAward");
    if (pa) pa.addEventListener("submit", async function (e) {
      e.preventDefault();
      var n = parseInt(pa.amount.value, 10), msg = document.getElementById("partyMsg");
      if (!n) { msg.textContent = "Give a number other than zero."; return; }
      var each = n;
      if (!mile && pa.split.checked) each = Math.floor(n / sheets.length);
      if (!window.confirm((mile ? "Grant " + each + " level(s)" : "Award " + each + " XP") + " to each of the " + sheets.length + " adventurers?")) return;
      msg.textContent = "Awarding…";
      for (var i = 0; i < sheets.length; i++) {
        var a = await db.rpc("dnd_award", { p_slug: sheets[i].slug, p_xp: mile ? 0 : each, p_levels: mile ? each : 0, p_note: pa.note.value.trim() });
        if (a.error) { msg.textContent = "Stopped at " + sheets[i].name + ": " + errText(a.error); return; }
      }
      render();
    });
    var nameIn = document.getElementById("sheetName"), slugIn = document.getElementById("sheetSlug"), touched = false;
    nameIn.addEventListener("input", function () { if (!touched) slugIn.value = slugify(nameIn.value.replace(/^(ser|sir|lady|lord|dame)\s+/i, "").split(/\s+/)[0], 40); });
    slugIn.addEventListener("input", function () { touched = true; });
    document.getElementById("sheetNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = document.getElementById("sheetMsg");
      msg.textContent = "Creating…";
      var r = await db.rpc("dnd_create_sheet", { p_slug: slugIn.value.trim(), p_chronicle: CAMPAIGN, p_name: nameIn.value.trim() });
      if (r.error) { msg.textContent = "Could not create it: " + errText(r.error); return; }
      window.location.href = "sheet.html?c=" + encodeURIComponent(slugIn.value.trim());
    });
    root.querySelectorAll(".owner-pick").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        sel.disabled = true;
        var r = await db.rpc("set_sheet_owner", { p_slug: sel.getAttribute("data-slug"), p_email: sel.value });
        sel.disabled = false;
        if (r.error) { window.alert("Not changed: " + errText(r.error)); render(); }
      });
    });
    root.querySelectorAll("[data-delsheet]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var name = b.getAttribute("data-name");
        var typed = window.prompt('Delete the sheet of "' + name + '", with its XP and level-ups? This cannot be undone.\n\nType the name to confirm:', "");
        if (typed === null) return;
        if (typed.trim() !== name) { window.alert("The name did not match; nothing was deleted."); return; }
        var r = await db.rpc("dnd_delete_sheet", { p_slug: b.getAttribute("data-delsheet") });
        if (r.error) { window.alert("Could not delete it: " + errText(r.error)); return; }
        render();
      });
    });
  }

  /* --------------------------------------------- NPC stat sheets
     Laid out like the adventurers' sheets. They live only in the
     npc_sheets table, which only the campaign's DMs can read. */
  async function npcSheets() {
    var box = document.getElementById("npcSheets");
    var r = await db.from("npc_sheets").select("slug,name,updated_at").eq("chronicle", CAMPAIGN).order("name", { ascending: true });
    var h = '<section class="xp-panel"><h2>NPC stat sheets</h2>' +
      '<p class="xp-hint">Laid out like the adventurers&rsquo; sheets: build them with <strong>Edit sheet</strong>. Only this campaign&rsquo;s Dungeon Masters can open them.</p>';
    if (r.error) { box.innerHTML = h + '<div class="sheet-notice">The NPC sheets could not be read: ' + esc(errText(r.error)) + "</div></section>"; return; }
    var rows = r.data || [];
    if (!rows.length) h += '<p class="empty-line">No NPC sheets yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>NPC</th><th>Last changed</th><th></th></tr>' + rows.map(function (n) {
        return "<tr><td>" + esc(n.name) + "</td><td>" + esc(fmtDate(n.updated_at)) + '</td><td class="acts">' +
          '<a class="btn" href="sheet.html?npc=' + encodeURIComponent(n.slug) + '">Open sheet</a> ' +
          '<button type="button" class="btn btn--ghost" data-delnpc="' + esc(n.slug) + '" data-name="' + esc(n.name) + '">Delete</button></td></tr>';
      }).join("") + "</table>";
    }
    var names = (window.CAMPAIGN_NPCS || []).map(function (n) { return n.name; });
    h += '<h3>New NPC sheet</h3><form class="xp-form" id="npcNew">' +
      '<label style="flex:1">Name<input id="npcName" list="npcNames" maxlength="120" required style="width:100%"></label>' +
      '<datalist id="npcNames">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>" +
      '<button class="btn" type="submit">Create sheet</button></form><p class="sheet-status" id="npcMsg" role="status"></p></section>';
    box.innerHTML = h;
    document.getElementById("npcNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("npcName").value.trim();
      if (!name) return;
      // NPC sheet names share one table with every chronicle: prefix them with the campaign.
      var base = (CAMPAIGN.split("-").map(function (w) { return w[0]; }).join("") + "-" + (slugify(name) || "npc")).slice(0, 36), slug = base, i = 2;
      var taken = await db.from("npc_sheets").select("slug").like("slug", base + "%"), have = {};
      (taken.data || []).forEach(function (n) { have[n.slug] = true; });
      while (have[slug]) slug = base + "-" + (i++);
      var msg = document.getElementById("npcMsg");
      msg.textContent = "Creating…";
      var ins = await db.from("npc_sheets").insert({ slug: slug, chronicle: CAMPAIGN, name: name, data: { name: name }, play: {} });
      if (ins.error) { msg.textContent = "Could not create it: " + errText(ins.error); return; }
      window.location.href = "sheet.html?npc=" + encodeURIComponent(slug);
    });
    box.querySelectorAll("[data-delnpc]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!window.confirm('Delete the NPC sheet for "' + b.getAttribute("data-name") + '"? This cannot be undone.')) return;
        var d = await db.from("npc_sheets").delete().eq("slug", b.getAttribute("data-delnpc"));
        if (d.error) { window.alert("Could not delete it: " + errText(d.error)); return; }
        npcSheets();
      });
    });
  }

  async function render() {
    try { await overview(); }
    catch (e) { console.error(e); root.innerHTML = '<div class="sheet-notice">Could not reach the campaign: ' + esc(errText(e)) + "</div>"; }
  }

  window.Gate.ready.then(function (g) { Gate = g; db = g.db; render(); });
})();
