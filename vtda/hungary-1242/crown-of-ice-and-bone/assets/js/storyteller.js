/* =====================================================================
   A CROWN OF ICE AND BONE — Storyteller page
   ---------------------------------------------------------------------
   Signs in the same way as the character sheets (an emailed link), so
   signing in here also signs you in on every sheet, the Intrigue Board,
   the Locations app and the rules.

   Signed in as a Storyteller:
     - the coterie: every Cainite's XP and waiting purchases, the player
       who plays each one, new sheets;
     - end-of-session XP;
     - NPC stat sheets (Storyteller only);
     - the rules: upload the Dark Ages notes from the Obsidian vault.

   Being a Storyteller means having your email in the storytellers
   table; the database checks that, not this page.
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = "crown-of-ice-and-bone";
  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  var root = document.getElementById("st");
  var RULES = window.CROWN_RULES || { abilities: {} };
  var ABILITY_NAME = {};
  Object.keys(RULES.abilities || {}).forEach(function (g) {
    RULES.abilities[g].forEach(function (n) { ABILITY_NAME[n.toLowerCase().replace(/[^a-z]/g, "")] = n; });
  });
  var VIRTUES = { conscience: "Conscience", conviction: "Conviction", selfcontrol: "Self-Control", instinct: "Instinct", courage: "Courage" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function slugify(s, n) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n || 34);
  }
  function describe(r) {
    var name = r.kind === "attribute" ? cap(r.trait) : (r.kind === "ability" || r.kind === "expertise") ? (ABILITY_NAME[r.trait] || r.trait)
      : r.kind === "virtue" ? (VIRTUES[r.trait] || r.trait) : r.kind === "road" ? "Road" : r.kind === "willpower" ? "Willpower" : r.trait;
    if (r.kind === "expertise") return "Expertise: " + name + " (" + r.detail + ")";
    if (r.kind === "ritual") return "Ritual: " + name + " (level " + r.to_level + ")";
    if (r.from_level === 0 && /discipline|path|background/.test(r.kind)) return "New " + r.kind.replace("_", " ").replace("clan discipline", "clan Discipline") + ": " + name;
    return name + " " + r.from_level + " → " + r.to_level;
  }

  /* ------------------------------------------------------- signed out */
  function signInForm() {
    root.innerHTML =
      '<section class="xp-panel" style="max-width:32rem">' +
        "<h2>Sign in</h2>" +
        '<p class="xp-hint">Enter your email and a sign-in link will be sent to it. It brings you back here, signed in; the sheets, the rules and the Intrigue Board then recognise you too.</p>' +
        '<form class="xp-form" id="stForm">' +
          '<label style="flex:1">Email<input type="email" id="stEmail" autocomplete="email" required style="width:100%"></label>' +
          '<button class="btn" type="submit" id="stSend">Send link</button>' +
        "</form>" +
        '<p class="sheet-status" id="stMsg" role="status" aria-live="polite" style="margin-top:.8rem"></p>' +
      "</section>";
    document.getElementById("stForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = document.getElementById("stMsg"), send = document.getElementById("stSend");
      send.disabled = true;
      msg.textContent = "Sending…";
      try {
        var r = await db.auth.signInWithOtp({
          email: document.getElementById("stEmail").value.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] }
        });
        if (r.error) throw r.error;
        msg.textContent = "Link sent. Open it from your email to finish signing in.";
      } catch (err) {
        console.error(err);
        msg.textContent = /sign ?ups? not allowed|not found|invalid login/i.test(errText(err))
          ? "That address has no account. Invite it first under Authentication → Users in Supabase."
          : "Could not send the link: " + errText(err);
        send.disabled = false;
      }
    });
  }

  /* -------------------------------------------------------- signed in */
  function accountBar(session, note) {
    return '<div class="sheet-bar"><span class="sheet-status">Signed in as ' + esc(session.user && session.user.email) +
      (note ? " · " + note : "") + '</span><span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" id="stOut">Sign out</button></div>';
  }
  function wireSignOut() {
    document.getElementById("stOut").addEventListener("click", async function () {
      await db.auth.signOut();
      render();
    });
  }

  async function overview(session) {
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name").eq("chronicle", CHRONICLE).order("name", { ascending: true }),
      db.from("vtda_xp_awards").select("slug,amount"),
      db.from("vtda_xp_requests").select("*").order("requested_at", { ascending: true }),
      db.rpc("sheet_owners_of", { p_chronicle: CHRONICLE })
    ]);
    var setupMissing = r.some(function (x) { return x.error; });
    if (setupMissing) {
      var err = r.filter(function (x) { return x.error; })[0].error;
      root.innerHTML = accountBar(session, "Storyteller") +
        '<div class="sheet-notice">The sheets for this chronicle are not set up yet: run <code>assets/sql/setup.sql</code> in Supabase (see README.md). (' + esc(errText(err)) + ")</div>" +
        xpAwardsHtml() + '<div id="npcSheets"></div><div id="rulesSync"></div>';
      wireSignOut(); npcSheets(); rulesSync();
      return;
    }
    var sheets = r[0].data || [], awards = r[1].data || [], reqs = r[2].data || [], owners = {};
    (r[3].data || []).forEach(function (o) { owners[o.slug] = o.email; });
    var names = {};
    sheets.forEach(function (s) { names[s.slug] = s.name; });

    var h = accountBar(session, "Storyteller") +
      '<section class="xp-panel"><h2>The coterie</h2>' +
      '<p class="xp-hint">Open a Cainite to award XP, approve or refund purchases, or edit the sheet. The player&rsquo;s email decides who may update the sheet; it is kept private in the database and shown only to you.</p>';
    if (!sheets.length) h += '<p class="empty-line">No sheets yet. Create the first one below.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Cainite</th><th class="num">Awarded</th><th class="num">Spent</th>' +
        '<th class="num">Available</th><th class="num">Waiting</th><th>Player</th><th></th></tr>';
      sheets.forEach(function (s) {
        var total = 0, spent = 0, pending = 0, waiting = 0;
        awards.forEach(function (a) { if (a.slug === s.slug) total += a.amount; });
        reqs.forEach(function (q) {
          if (q.slug !== s.slug) return;
          if (q.status === "approved") spent += q.cost;
          if (q.status === "pending") { pending += q.cost; waiting++; }
        });
        h += "<tr><td>" + esc(s.name) + '<br><small class="xp-hint">sheet.html?c=' + esc(s.slug) + '</small></td><td class="num">' + total + '</td><td class="num">' + spent +
          '</td><td class="num">' + (total - spent - pending) + '</td><td class="num">' +
          (waiting ? '<span class="status status-pending">' + waiting + "</span>" : "0") + "</td>" +
          '<td><form class="xp-form owner-form" data-slug="' + esc(s.slug) + '" style="margin:0"><input type="email" name="email" value="' + esc(owners[s.slug] || "") +
          '" placeholder="player@example.com" aria-label="Player email for ' + esc(s.name) + '" style="min-width:12rem"><button class="btn btn--ghost" type="submit">Save</button></form></td>' +
          '<td class="acts"><a class="btn btn--ghost" href="sheet.html?c=' + encodeURIComponent(s.slug) + '">Open sheet</a> ' +
          '<button type="button" class="btn btn--ghost" data-delsheet="' + esc(s.slug) + '" data-name="' + esc(s.name) + '">Delete</button></td></tr>';
      });
      h += "</table>";
    }
    h += '<h3>New character sheet</h3><form class="xp-form" id="sheetNew">' +
      '<label style="flex:1">Name<input id="sheetName" maxlength="120" required placeholder="e.g. István of Esztergom" style="width:100%"></label>' +
      '<label>Short name<input id="sheetSlug" maxlength="40" pattern="[a-z0-9-]{1,40}" required placeholder="istvan"></label>' +
      '<button class="btn" type="submit">Create sheet</button></form>' +
      '<p class="xp-hint" style="margin-top:.4rem">The short name is the sheet&rsquo;s address, and goes in the <code>sheet</code> field of the player&rsquo;s entry in <code>assets/data/players.js</code>. The player&rsquo;s email must also be invited under Authentication → Users in Supabase before they can sign in.</p>' +
      '<p class="sheet-status" id="sheetMsg" role="status" aria-live="polite"></p>';

    var pendingList = reqs.filter(function (q) { return q.status === "pending" && names[q.slug]; });
    h += "<h3>Waiting for your approval</h3>";
    if (!pendingList.length) h += '<p class="empty-line">Nothing waiting.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Date</th><th>Cainite</th><th>Purchase</th><th class="num">XP</th><th></th></tr>';
      pendingList.forEach(function (q) {
        h += "<tr><td>" + esc(fmtDate(q.requested_at)) + "</td><td>" + esc(names[q.slug]) + "</td><td>" + esc(describe(q)) +
          '</td><td class="num">' + q.cost + '</td><td class="acts"><a class="btn" href="sheet.html?c=' +
          encodeURIComponent(q.slug) + '#xpTitle">Review</a></td></tr>';
      });
      h += "</table>";
    }
    root.innerHTML = h + "</section>" + xpAwardsHtml() + '<div id="npcSheets"></div><div id="rulesSync"></div>';
    wireSignOut();
    wireCoterie(sheets);
    npcSheets();
    rulesSync();
  }

  function wireCoterie(sheets) {
    var nameIn = document.getElementById("sheetName"), slugIn = document.getElementById("sheetSlug"), slugTouched = false;
    nameIn.addEventListener("input", function () { if (!slugTouched) slugIn.value = slugify(nameIn.value.split(/\s+(?:of|the|de|von)\s+/i)[0], 40); });
    slugIn.addEventListener("input", function () { slugTouched = true; });
    document.getElementById("sheetNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = document.getElementById("sheetMsg");
      msg.textContent = "Creating…";
      var r = await db.rpc("vtda_create_sheet", { p_slug: slugIn.value.trim(), p_chronicle: CHRONICLE, p_name: nameIn.value.trim() });
      if (r.error) { msg.textContent = "Could not create it: " + errText(r.error); return; }
      window.location.href = "sheet.html?c=" + encodeURIComponent(slugIn.value.trim());
    });
    root.querySelectorAll(".owner-form").forEach(function (f) {
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var btn = f.querySelector("button");
        btn.disabled = true;
        var r = await db.rpc("set_sheet_owner", { p_slug: f.getAttribute("data-slug"), p_email: f.email.value.trim() });
        btn.disabled = false;
        if (r.error) { window.alert("Could not save it: " + errText(r.error)); return; }
        btn.textContent = "Saved";
        setTimeout(function () { btn.textContent = "Save"; }, 1600);
      });
    });
    root.querySelectorAll("[data-delsheet]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var name = b.getAttribute("data-name");
        var typed = window.prompt('Delete the sheet of "' + name + '", with all its XP and purchases? This cannot be undone.\n\nType the name to confirm:', "");
        if (typed === null) return;
        if (typed.trim() !== name) { window.alert("The name did not match; nothing was deleted."); return; }
        var r = await db.rpc("vtda_delete_sheet", { p_slug: b.getAttribute("data-delsheet") });
        if (r.error) { window.alert("Could not delete it: " + errText(r.error)); return; }
        render();
      });
    });
  }

  /* --------------------------------------------- end-of-session XP
     The award criteria of the Dark Ages rules, in brief. Award what the
     table earns from each Cainite's sheet (the Award XP form). */
  var XP_AWARDS = [
    { q: "Automatic", award: "1–3 XP", note: "For every Cainite at the table, every session, whatever happened." },
    { q: "Learning", award: "+1", note: "The character learned something that matters, and the player can say what." },
    { q: "Obstacles", award: "+1", note: "The coterie got past something that genuinely stood in its way." },
    { q: "Risks", award: "+1", note: "A risk taken for the story's sake, not the safe play." },
    { q: "Ingenuity", award: "+1", note: "A problem solved in a way the Storyteller did not see coming." },
    { q: "Headway", award: "+1", note: "Real progress on the chronicle's larger threads." },
    { q: "Connections", award: "+1", note: "New ties made with the chronicle's people: allies, rivals, debts." }
  ];
  function xpAwardsHtml() {
    return '<section class="xp-panel"><h2>End-of-session XP</h2>' +
      '<p class="xp-hint">Two to five XP a session is the usual pace. Run through these with the table once the session ends; a clear &ldquo;yes&rdquo; earns the point. When a story arc closes, award every Cainite a further 3 for a lesser arc or 5 for a major one. No trait may rise by more than one dot in a story.</p>' +
      '<div class="xp-awards">' + XP_AWARDS.map(function (x) {
        return '<article class="xp-award"><div class="xp-award-top"><h3>' + esc(x.q) + '</h3><span class="xp-award-badge">' + esc(x.award) + "</span></div>" +
          '<p class="xp-award-why">' + esc(x.note) + "</p></article>";
      }).join("") + "</div>" +
      '<p class="xp-hint" style="margin-top:1rem">Then award each Cainite&rsquo;s total from the <strong>Award XP</strong> form on their sheet (Open sheet, above). The full rules: <a href="rules.html?p=concepts%2Fexperience">Experience</a>.</p></section>';
  }

  /* ------------------------------------------------- NPC stat sheets
     Laid out like the Cainites' sheets, without XP. They live only in
     the npc_sheets table (Dead Hand setup: npc-sheets.sql), which the
     database lets no one but a Storyteller read or change. */
  async function npcSheets() {
    var box = document.getElementById("npcSheets");
    var r = await db.from("npc_sheets").select("slug,name,updated_at").eq("chronicle", CHRONICLE).order("name", { ascending: true });
    var h = '<section class="xp-panel"><h2>NPC stat sheets</h2>' +
      '<p class="xp-hint">Laid out like the coterie&rsquo;s sheets, without experience: change anything with <strong>Edit sheet</strong>. Only Storytellers can open these; players and visitors are refused by the database itself.</p>';
    if (r.error) {
      box.innerHTML = h + '<div class="sheet-notice">The NPC sheets are not set up yet: run the Dead Hand <code>npc-sheets.sql</code> in Supabase. (' + esc(errText(r.error)) + ")</div></section>";
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
    var names = (window.CROWN_NPCS || []).map(function (n) { return n.name; });
    h += '<h3>New NPC sheet</h3><form class="xp-form" id="npcNew">' +
      '<label style="flex:1">Name<input id="npcName" list="npcNames" maxlength="120" required placeholder="e.g. Bishop Konrad" style="width:100%"></label>' +
      '<datalist id="npcNames">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>" +
      '<button class="btn" type="submit">Create sheet</button></form>' +
      '<p class="sheet-status" id="npcMsg" role="status" aria-live="polite" style="margin-top:.6rem"></p></section>';
    box.innerHTML = h;

    document.getElementById("npcNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("npcName").value.trim();
      if (!name) return;
      // NPC sheet names share one table with the Dead Hand's: prefix to keep them apart.
      var base = "ib-" + (slugify(name) || "npc"), slug = base, i = 2;
      var taken = await db.from("npc_sheets").select("slug").like("slug", base + "%");
      var have = {};
      (taken.data || []).forEach(function (n) { have[n.slug] = true; });
      while (have[slug]) slug = base + "-" + (i++);
      var msg = document.getElementById("npcMsg");
      msg.textContent = "Creating…";
      var ins = await db.from("npc_sheets").insert({ slug: slug, chronicle: CHRONICLE, name: name, data: { name: name }, play: {} });
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

  /* ------------------------------------------------------- the rules
     The rules pages (rules.html) show the Dark Ages notes from the
     Obsidian vault. They are uploaded from here: choose the vault's
     dark-ages folder, and every note in it is sent to the vault_notes
     table, which only the coterie and Storytellers can read. Notes no
     longer in the folder are removed. Nothing is stored in the site's
     files, and no key is kept on your computer. */
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

  async function rulesSync() {
    var box = document.getElementById("rulesSync");
    var count = await db.from("vault_notes").select("path,updated_at").eq("chronicle", CHRONICLE).order("updated_at", { ascending: false }).limit(1);
    var total = await db.from("vault_notes").select("path", { count: "exact", head: true }).eq("chronicle", CHRONICLE);
    var h = '<section class="xp-panel"><h2>The rules (Obsidian)</h2>' +
      '<p class="xp-hint">The <a href="rules.html">rules pages</a> show your Dark Ages notes from Obsidian, to the coterie and Storytellers only. After you change the notes in Obsidian, upload them again here: choose the folder <code>Obsidian Vault/RPG/wiki/dark-ages</code>. Every note in it is sent; notes you have deleted are removed from the site.</p>';
    if (count.error) {
      box.innerHTML = h + '<div class="sheet-notice">The rules store is not set up yet: run <code>assets/sql/setup.sql</code> in Supabase. (' + esc(errText(count.error)) + ")</div></section>";
      return;
    }
    h += '<p class="xp-hint">' + (total.count ? total.count + " notes online, last uploaded " + esc(fmtDate(count.data[0].updated_at)) + "." : "No notes uploaded yet.") + "</p>" +
      '<form class="xp-form" id="vaultForm"><label style="flex:1">Folder<input type="file" id="vaultDir" webkitdirectory directory multiple required></label>' +
      '<button class="btn" type="submit" id="vaultSend">Upload the notes</button></form>' +
      '<p class="sheet-status" id="vaultMsg" role="status" aria-live="polite" style="margin-top:.6rem"></p></section>';
    box.innerHTML = h;

    document.getElementById("vaultForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var files = Array.prototype.filter.call(document.getElementById("vaultDir").files, function (f) { return /\.md$/i.test(f.name); });
      var msg = document.getElementById("vaultMsg"), send = document.getElementById("vaultSend");
      if (!files.length) { msg.textContent = "There are no notes (.md files) in that folder."; return; }
      send.disabled = true;
      try {
        var notes = [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          // "dark-ages/concepts/abilities.md" -> "concepts/abilities"
          var rel = (f.webkitRelativePath || f.name).replace(/\\/g, "/").split("/").slice(1).join("/").replace(/\.md$/i, "");
          if (!rel || !/^[A-Za-z0-9 ._\/-]{1,200}$/.test(rel)) { console.warn("Skipped", f.webkitRelativePath); continue; }
          var body = stripFrontmatter(await f.text());
          notes.push({ path: rel, title: titleFor(rel, body), body: body });
        }
        if (!window.confirm("Upload " + notes.length + " notes to the rules pages? Notes on the site that are not in this folder will be removed.")) {
          msg.textContent = ""; send.disabled = false; return;
        }
        var sent = 0, batch = [], size = 0;
        async function flush() {
          if (!batch.length) return;
          var r = await db.rpc("vault_sync_notes", { p_chronicle: CHRONICLE, p_notes: batch });
          if (r.error) throw r.error;
          sent += batch.length; batch = []; size = 0;
          msg.textContent = "Uploaded " + sent + " of " + notes.length + "…";
        }
        for (var j = 0; j < notes.length; j++) {
          batch.push(notes[j]); size += notes[j].body.length;
          if (size > 250000 || batch.length >= 40) await flush();
        }
        await flush();
        var pr = await db.rpc("vault_prune_notes", { p_chronicle: CHRONICLE, p_keep: notes.map(function (n) { return n.path; }) });
        if (pr.error) throw pr.error;
        msg.textContent = "Done: " + sent + " notes uploaded" + (pr.data ? ", " + pr.data + " old ones removed" : "") + ".";
        setTimeout(rulesSync, 2500);
      } catch (err) {
        console.error(err);
        msg.textContent = "Upload stopped: " + errText(err);
        send.disabled = false;
      }
    });
  }

  async function render() {
    if (!db) {
      root.innerHTML = '<div class="sheet-notice">Online sign-in is not connected yet.</div>';
      return;
    }
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) return signInForm();
      var st = await db.rpc("is_storyteller");
      if (st.error) throw st.error;
      if (!st.data) {
        root.innerHTML = accountBar(session) +
          '<div class="sheet-notice">This account is not a Storyteller. Players update their Cainites from their own ' +
          '<a href="players.html">character sheets</a>, and read the <a href="rules.html">rules</a>.</div>';
        wireSignOut();
        return;
      }
      await overview(session);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="sheet-notice">Could not reach the sheets: ' + esc(errText(e)) + "</div>";
    }
  }

  if (db) {
    db.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") render();
    });
  }
  render();
})();
