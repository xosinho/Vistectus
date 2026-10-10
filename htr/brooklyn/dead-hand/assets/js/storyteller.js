/* =====================================================================
   THE DEAD HAND — Storyteller sign-in and overview
   ---------------------------------------------------------------------
   Only for Dead Hand's Storytellers: the page opens through the gate
   (gate.js, data-need="storyteller"), which signs people in. It lists
   every hunter's XP, who plays them, the purchases and new characters
   waiting for approval, and the chronicle's players.

   Being Dead Hand's Storyteller means being added to it as Storyteller
   on the Admin page; the database checks that, not this page.
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = "dead-hand";
  var db = null;
  var root = document.getElementById("st");
  var LABELS = { animalken: "Animal Ken", drive: "Driving" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function label(k) { return LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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

  /* -------------------------------------------------------- signed in */
  function accountBar(session, note) {
    return '<div class="sheet-bar"><span class="sheet-status">Signed in as ' + esc(session.user && session.user.email) +
      (note ? " · " + note : "") + '</span><span class="spacer"></span>' +
      '<a class="btn" href="../../../builders/workshop.html?c=dead-hand">Open the workshop</a> ' +
      '<button type="button" class="btn btn--ghost" id="stOut">Sign out</button></div>' +
      '<p class="xp-hint" style="margin:-.4rem 0 1rem">The workshop is where you add NPCs, handouts, maps, places and factions as the chronicle goes on.</p>';
  }
  function wireSignOut() {
    document.getElementById("stOut").addEventListener("click", async function () {
      await db.auth.signOut();
      window.location.reload();
    });
  }

  async function overview(session) {
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name").eq("chronicle", CHRONICLE).order("name", { ascending: true }),
      db.from("xp_awards").select("slug,amount"),
      db.from("xp_requests").select("*").order("requested_at", { ascending: true }),
      db.rpc("sheet_owners_of", { p_chronicle: CHRONICLE }),
      db.rpc("members_of", { p_chronicle: CHRONICLE }),
      db.from("character_drafts").select("id,email,name,status,submitted_at,updated_at").eq("chronicle", CHRONICLE).order("updated_at", { ascending: false })
    ]);
    r.slice(0, 3).forEach(function (x) { if (x.error) throw x.error; });
    var sheets = r[0].data || [], awards = r[1].data || [], reqs = r[2].data || [];
    var owners = {}, members = r[4].data || [], drafts = r[5].data || [];
    (r[3].data || []).forEach(function (o) { owners[o.slug] = o.email; });
    var names = {};
    sheets.forEach(function (s) { names[s.slug] = s.name; });

    var h = accountBar(session, "Storyteller") +
      '<section class="xp-panel"><h2>The cell</h2>' +
      '<p class="xp-hint">Open a hunter to award XP, approve or refund purchases, or edit the sheet. Choose who plays each hunter from the chronicle&rsquo;s players (add players under <strong>Players</strong>, below).</p>' +
      '<table class="xp-table"><tr><th>Hunter</th><th class="num">Awarded</th><th class="num">Spent</th>' +
      '<th class="num">Available</th><th class="num">Waiting</th><th>Played by</th><th></th></tr>';
    sheets.forEach(function (s) {
      var total = 0, spent = 0, pending = 0, waiting = 0;
      awards.forEach(function (a) { if (a.slug === s.slug) total += a.amount; });
      reqs.forEach(function (q) {
        if (q.slug !== s.slug) return;
        if (q.status === "approved") spent += q.cost;
        if (q.status === "pending") { pending += q.cost; waiting++; }
      });
      h += "<tr><td>" + esc(s.name) + '</td><td class="num">' + total + '</td><td class="num">' + spent +
        '</td><td class="num">' + (total - spent - pending) + '</td><td class="num">' +
        (waiting ? '<span class="status status-pending">' + waiting + "</span>" : "0") + "</td>" +
        "<td>" + ownerPicker(s.slug, owners[s.slug], members) + "</td>" +
        '<td class="acts"><a class="btn btn--ghost" href="sheet.html?c=' + encodeURIComponent(s.slug) + '">Open sheet</a></td></tr>';
    });
    h += "</table>";

    var pendingList = reqs.filter(function (q) { return q.status === "pending" && names[q.slug]; });
    h += "<h3>XP purchases waiting for your approval</h3>";
    if (!pendingList.length) h += '<p class="empty-line">Nothing waiting.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Date</th><th>Hunter</th><th>Purchase</th><th class="num">XP</th><th></th></tr>';
      pendingList.forEach(function (q) {
        h += "<tr><td>" + esc(fmtDate(q.requested_at)) + "</td><td>" + esc(names[q.slug]) + "</td><td>" + esc(describe(q)) +
          '</td><td class="num">' + q.cost + '</td><td class="acts"><a class="btn" href="sheet.html?c=' +
          encodeURIComponent(q.slug) + '#xpTitle">Review</a></td></tr>';
      });
      h += "</table>";
    }
    h += draftsHtml(drafts);
    root.innerHTML = h + "</section>" +
      '<section class="xp-panel"><h2>Players</h2><div id="members"></div></section>' +
      xpAwardsHtml() + '<div id="npcSheets"></div>';
    wireSignOut();
    wireOwners();
    window.ChronicleMembers.render(document.getElementById("members"), { db: db, chronicle: CHRONICLE, admin: false, onChange: function () { render(); } });
    npcSheets();
  }

  /* --------------------------------------------- end-of-session XP
     The award questions from the Dead Hand Compendium. Award what the
     table earns from each hunter's sheet (the Award XP form). */
  var XP_AWARDS = [
    { q: "Attendance", question: "Did you show up and play tonight?",
      note: "The baseline award — for being present and engaged at the table, regardless of how the session went for your character." },
    { q: "Advancing the Hunt", question: "Did the cell learn something important, gain a resource, or otherwise move the investigation forward?",
      note: "Covers information, leads, gear, allies, or leverage the cell walks away with — progress on the case itself, not just on the plot as the Storyteller sees it." },
    { q: "Drive & Redemption", question: "Did you actively engage your character’s Drive this session — whether or not it paid off in Redemption?",
      note: "Reward the attempt, not just the success. A hunter who chased their Drive and came up short still played their character honestly." },
    { q: "Creed in Action", question: "Did you play your Creed convincingly, especially when it complicated things rather than made them easier?",
      note: "An Inquisitive hunter stopping to dig deeper when it costs time, or a Martial hunter refusing to back down when retreat was smarter — that’s Creed showing up in the choices, not just the character sheet." },
    { q: "Risk & Sacrifice", question: "Did your character take a real risk, make a costly sacrifice, or put something on the line for someone else or for the Hunt?",
      note: "This is the \"answering the call\" question — the moment a hunter chooses the harder, more dangerous path because it’s the right one." },
    { q: "Table Contribution", question: "Did you help another player have a better session — setting up their spotlight moment, sharing the scene, or supporting their choices?",
      note: "Rewards collaborative play. A cell that makes room for each other’s character moments is doing something the mechanics alone can’t capture." },
    { q: "Storyteller’s Call", question: "Did the Storyteller feel this session meaningfully moved the chronicle forward — twist, reveal, escalation, or consequence?",
      note: "A discretionary bonus point for sessions that land a genuine turning point, at the Storyteller’s judgment." }
  ];

  function xpAwardsHtml() {
    return '<section class="xp-panel"><h2>End-of-session XP</h2>' +
      '<p class="xp-hint">Standard questions to run through with the table once a session wraps. Ask each one aloud — a “yes” typically earns the character 1 XP (Storyteller’s call on anything borderline). Keep it quick; this should take a few minutes, not derail the after-session debrief.</p>' +
      '<div class="xp-awards">' + XP_AWARDS.map(function (x) {
        return '<article class="xp-award"><div class="xp-award-top"><h3>' + esc(x.q) + '</h3><span class="xp-award-badge">+1 XP</span></div>' +
          '<p class="xp-award-q">' + esc(x.question) + "</p>" +
          '<p class="xp-award-why"><span>Why it counts</span>' + esc(x.note) + "</p></article>";
      }).join("") + "</div>" +
      '<p class="xp-hint" style="margin-top:1rem">Then award each hunter’s total from the <strong>Award XP</strong> form on their sheet (Open sheet, above).</p></section>';
  }

  /* ------------------------------------------------- NPC stat sheets
     Same layout as the hunters' sheets, without XP. They live only in
     the npc_sheets table, which the database lets no one but a
     Storyteller read or change (setup: assets/sheets/sql/npc-sheets.sql). */
  function slugify(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34) || "npc";
  }

  async function npcSheets() {
    var box = document.getElementById("npcSheets");
    var r = await db.from("npc_sheets").select("slug,name,updated_at").eq("chronicle", CHRONICLE).order("name", { ascending: true });
    var h = '<section class="xp-panel"><h2>NPC stat sheets</h2>' +
      '<p class="xp-hint">Laid out like the hunters’ sheets, without experience: change anything with <strong>Edit sheet</strong>. Only Storytellers can open these; players and visitors are refused by the database itself.</p>';
    if (r.error) {
      box.innerHTML = h + '<div class="sheet-notice">The NPC sheets are not set up yet: run <code>assets/sheets/sql/npc-sheets.sql</code> in Supabase. (' + esc(errText(r.error)) + ")</div></section>";
      return;
    }
    var rows = r.data || [];
    if (!rows.length) h += '<p class="empty-line">No NPC sheets yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>NPC</th><th>Last changed</th><th></th></tr>';
      rows.forEach(function (n) {
        h += "<tr><td>" + esc(n.name) + "</td><td>" + esc(fmtDate(n.updated_at)) + '</td><td class="acts">' +
          '<a class="btn" href="sheet.html?npc=' + encodeURIComponent(n.slug) + '">Open sheet</a> ' +
          '<button type="button" class="btn btn--ghost" data-delnpc="' + esc(n.slug) + '" data-name="' + esc(n.name) + '">Delete</button></td></tr>';
      });
      h += "</table>";
    }
    var names = (window.DEAD_HAND_NPCS || []).map(function (n) { return n.name; });
    h += '<h3>New NPC sheet</h3><form class="xp-form" id="npcNew">' +
      '<label style="flex:1">Name<input id="npcName" list="npcNames" maxlength="120" required placeholder="e.g. Guido Giovanni" style="width:100%"></label>' +
      '<datalist id="npcNames">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>" +
      '<button class="btn" type="submit">Create sheet</button></form>' +
      '<p class="sheet-status" id="npcMsg" role="status" aria-live="polite" style="margin-top:.6rem"></p></section>';
    box.innerHTML = h;

    document.getElementById("npcNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("npcName").value.trim();
      if (!name) return;
      var taken = {};
      rows.forEach(function (n) { taken[n.slug] = true; });
      var base = slugify(name), slug = base, i = 2;
      while (taken[slug]) slug = base + "-" + (i++);
      var msg = document.getElementById("npcMsg");
      msg.textContent = "Creating…";
      var ins = await db.from("npc_sheets").insert({ slug: slug, chronicle: "dead-hand", name: name, data: { name: name }, play: {} });
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

  /* -------------------------------------- who plays which hunter */
  function ownerPicker(slug, email, members) {
    var players = members.filter(function (m) { return m.role === "player" || m.email === email; });
    return '<select class="owner-pick" data-slug="' + esc(slug) + '" aria-label="Played by">' +
      '<option value="">— nobody —</option>' + players.map(function (m) {
        return '<option value="' + esc(m.email) + '"' + (m.email === email ? " selected" : "") + ">" + esc(m.email) + "</option>";
      }).join("") + "</select>";
  }
  function wireOwners() {
    root.querySelectorAll(".owner-pick").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        sel.disabled = true;
        var r = await db.rpc("set_sheet_owner", { p_slug: sel.getAttribute("data-slug"), p_email: sel.value });
        sel.disabled = false;
        if (r.error) { window.alert("Not changed: " + errText(r.error)); render(); }
      });
    });
  }

  /* ------------------------------- new characters (Create Hunter) */
  function draftsHtml(drafts) {
    var waiting = drafts.filter(function (d) { return d.status === "submitted"; });
    var working = drafts.filter(function (d) { return d.status === "draft" || d.status === "rejected"; });
    var h = "<h3>New hunters waiting for your approval</h3>";
    if (!waiting.length) h += '<p class="empty-line">None waiting.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Sent</th><th>Hunter</th><th>Player</th><th></th></tr>';
      waiting.forEach(function (d) {
        h += "<tr><td>" + esc(fmtDate(d.submitted_at)) + "</td><td>" + esc(d.name || "(no name)") + "</td><td>" + esc(d.email) +
          '</td><td class="acts"><a class="btn" href="create.html?review=' + encodeURIComponent(d.id) + '">Review</a></td></tr>';
      });
      h += "</table>";
    }
    if (working.length) {
      h += '<p class="xp-hint" style="margin-top:.6rem">Being made: ' + working.map(function (d) {
        return esc(d.name || "(no name)") + " (" + esc(d.email) + (d.status === "rejected" ? ", sent back" : "") + ")";
      }).join(", ") + ".</p>";
    }
    return h;
  }

  async function render() {
    try { await overview(Gate.session); }
    catch (e) {
      console.error(e);
      root.innerHTML = '<div class="sheet-notice">Could not reach the sheets: ' + esc(errText(e)) + "</div>";
    }
  }

  var Gate = null;
  window.Gate.ready.then(function (g) { Gate = g; db = g.db; render(); });
})();
