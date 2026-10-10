/* =====================================================================
   VISTECTUS — Admin: chronicles and their members
   ---------------------------------------------------------------------
   For site admins (the site_admins table). Each chronicle lists its
   Storytellers and players, with a form to add or remove them; a new
   chronicle can be added at the bottom. Each chronicle's Storytellers
   can also add and remove its players on their own Storyteller page.
   Above them: the worlds and chronicles made with the Builder that are
   waiting for approval, and the list of invited builders
   (builders/sql/world-builder.sql).
   ===================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("admin");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  // Where a chronicle's or campaign's pages live (chronicles.path).
  function home(c) {
    var p = c.path || ((c.game === "hunter" ? "htr" : c.game === "vampire" ? "vtda" : "dnd") + "/" + c.world + "/" + c.id + "/");
    return "../" + p.split("/").map(encodeURIComponent).join("/");
  }
  var GAMES = { hunter: "Hunter: the Reckoning", vampire: "Vampire: the Dark Ages", dnd: "Dungeons & Dragons 5e" };

  function setup() {
    return '<section class="xp-panel"><details><summary><strong>One-time setup in Supabase</strong> (done once; here for reference)</summary>' +
      '<ol class="admin-steps">' +
        "<li><strong>SQL Editor</strong>: run <code>admin/sql/access.sql</code>, then <code>vtda/hungary-1242/crown-of-ice-and-bone/assets/sql/setup.sql</code>, <code>dnd/sql/setup.sql</code> and, last, <code>builders/sql/world-builder.sql</code>.</li>" +
        "<li><strong>Authentication → Hooks</strong>: add a <em>Before User Created</em> hook of type Postgres, function <code>public.hook_before_user_created</code>. This is what lets only the emails added here create an account.</li>" +
        "<li><strong>Authentication → Sign In / Providers</strong>: turn <em>Allow new users to sign up</em> on (the hook above decides who actually may).</li>" +
        "<li><strong>Authentication → URL Configuration → Redirect URLs</strong>: <code>https://vistectus.com/**</code>, so sign-in links can come back to any page.</li>" +
      "</ol></details></section>";
  }

  var PATHS = { hunter: "htr", vampire: "vtda", dnd: "dnd" };
  function worldHome(w) { return "../" + (w.static_path || (PATHS[w.game] + "/" + w.id + "/")).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/"); }

  // Worlds and chronicles made with the Builder, waiting for a decision.
  async function reviews(db) {
    var w = await db.from("worlds").select("id,game,name,tagline,status,created_by,updated_at,static_path").eq("status", "pending").order("updated_at", { ascending: true });
    var c = await db.from("chronicles").select("id,name,game,world,path,status,tagline,created_by").eq("status", "pending").order("name", { ascending: true });
    var h = '<section class="xp-panel" id="reviews"><h2>Waiting for approval</h2>';
    if (w.error || c.error) return h + '<p class="sheet-notice">This list needs <code>builders/sql/world-builder.sql</code>: ' + esc(errText(w.error || c.error)) + "</p></section>";
    var worlds = w.data || [], chrons = c.data || [];
    var inWorld = {};
    worlds.forEach(function (x) { inWorld[x.id] = 1; });
    if (!worlds.length && !chrons.length) return h + '<p class="empty-line">Nothing is waiting. A builder&rsquo;s world appears here when they send it for approval.</p></section>';
    h += '<p class="xp-hint">Open each one to look it over (signed in, you see it as it will appear). Approving a world approves the chronicles sent with it. The note is shown to the builder; it is required when sending something back.</p>' +
      '<table class="xp-table"><thead><tr><th>What</th><th>By</th><th></th></tr></thead><tbody>';
    function row(kind, label, href, by, world, chron, extra) {
      return "<tr><td><strong>" + esc(label) + '</strong> <span class="status status-pending">' + kind + "</span>" + (extra || "") +
        '<a href="' + href + '" target="_blank" rel="noopener">Open it</a></td><td>' + esc(by || "") + "</td>" +
        '<td class="acts"><input class="review-note" aria-label="Note to the builder" placeholder="Note to the builder" maxlength="2000"> ' +
        '<button type="button" class="btn" data-review="1" data-world="' + esc(world) + '" data-chronicle="' + esc(chron || "") + '">Approve</button> ' +
        '<button type="button" class="btn btn--ghost" data-review="0" data-world="' + esc(world) + '" data-chronicle="' + esc(chron || "") + '">Send back</button></td></tr>';
    }
    worlds.forEach(function (x) {
      var mine = chrons.filter(function (k) { return k.world === x.id; });
      var extra = '<span class="note">' + esc(GAMES[x.game] || x.game) + (x.tagline ? " · " + esc(x.tagline) : "") +
        (mine.length ? " · with " + mine.map(function (k) { return esc(k.name); }).join(", ") : "") + "</span>";
      h += row("World", x.name, worldHome(x) + "index.html", x.created_by, x.id, "", extra);
    });
    chrons.filter(function (k) { return !inWorld[k.world]; }).forEach(function (k) {
      h += row(k.game === "dnd" ? "Campaign" : "Chronicle", k.name, home(k) + "index.html", k.created_by, k.world, k.id,
        '<span class="note">in ' + esc(k.world) + (k.tagline ? " · " + esc(k.tagline) : "") + "</span>");
    });
    return h + '</tbody></table><p class="sheet-status" id="reviewMsg" role="status"></p></section>';
  }

  // The people invited to build worlds.
  async function builders(db) {
    var r = await db.rpc("admin_builders");
    var h = '<section class="xp-panel" id="builders"><h2>Builders</h2>' +
      '<p class="xp-hint">The people who may make worlds with the <a href="../builders/index.html">Builder</a>. Adding an email is the invitation: they sign in at the Builder with a link sent to that address. What they make stays private until you approve it above.</p>';
    if (r.error) return h + '<p class="sheet-notice">This list needs <code>builders/sql/world-builder.sql</code>: ' + esc(errText(r.error)) + "</p></section>";
    var list = r.data || [];
    h += list.length ? '<table class="xp-table"><thead><tr><th>Email</th><th class="num">Worlds</th><th>Since</th><th></th></tr></thead><tbody>' + list.map(function (b) {
      return "<tr><td>" + esc(b.email) + '</td><td class="num">' + esc(b.worlds) + "</td><td>" + esc(String(b.added_at || "").slice(0, 10)) + "</td>" +
        '<td class="acts"><button type="button" class="btn btn--ghost" data-unbuild="' + esc(b.email) + '">Remove</button></td></tr>';
    }).join("") + "</tbody></table>" : '<p class="empty-line">No builders yet.</p>';
    return h + '<form class="xp-form" id="builderNew" style="margin-top:.8rem"><label style="flex:1">Email<input name="email" type="email" required maxlength="200" placeholder="builder@example.com" style="width:100%"></label>' +
      '<button class="btn" type="submit">Add builder</button></form><p class="sheet-status" id="builderMsg" role="status"></p></section>';
  }

  async function draw(gate) {
    var db = gate.db;
    var r = await db.from("chronicles").select("*").order("name", { ascending: true });
    if (r.error) {
      root.innerHTML = setup() + '<div class="sheet-notice">The chronicles could not be read: ' + esc(errText(r.error)) + "</div>";
      return;
    }
    var h = '<div class="sheet-bar"><span class="sheet-status">Signed in as ' + esc(gate.email) + ' · site admin</span><span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" id="adminOut">Sign out</button></div>' + setup() +
      (await reviews(db)) + (await builders(db));
    (r.data || []).forEach(function (c) {
      h += '<section class="xp-panel"><div class="chron-head"><h2>' + esc(c.name) + '</h2><span class="meta">' +
        esc(GAMES[c.game] || c.game) + " · " + esc(c.world) + "</span>" +
        (c.status && c.status !== "approved" ? '<span class="status status-' + esc(c.status) + '">' + esc(c.status) + "</span>" : "") + "</div>" +
        '<p class="chron-links"><a href="' + home(c) + 'index.html">' + (c.game === "dnd" ? "Campaign" : "Chronicle") + "</a>" +
        '<a href="' + home(c) + (c.game === "dnd" ? 'dm.html">DM Screen' : 'storyteller.html">Storyteller page') + "</a></p>" +
        '<div class="members" data-chronicle="' + esc(c.id) + '" data-dnd="' + (c.game === "dnd" ? "1" : "") + '"><p class="sheet-status">Opening…</p></div></section>';
    });
    h += '<section class="xp-panel"><h2>Add a chronicle or campaign</h2>' +
      '<form class="xp-form" id="chronNew">' +
        '<label>Short name<input name="cid" required pattern="[a-z0-9-]{1,60}" placeholder="e.g. winter-court"></label>' +
        '<label style="flex:1">Name<input name="cname" required maxlength="120" placeholder="e.g. The Winter Court" style="width:100%"></label>' +
        '<label>Game<select name="game"><option value="vampire">Vampire: the Dark Ages</option><option value="hunter">Hunter: the Reckoning</option><option value="dnd">Dungeons &amp; Dragons 5e</option></select></label>' +
        '<label>World<input name="world" required pattern="[a-z0-9-]{1,60}" placeholder="e.g. hungary-1242"></label>' +
        '<label>Folder (optional)<input name="cpath" pattern="[a-z0-9/-]{1,200}/" placeholder="e.g. dnd/shrouded/campaign-two/"></label>' +
        '<button class="btn" type="submit">Add</button></form>' +
      '<p class="xp-hint" style="margin-top:.4rem">This adds it to the list, so people can be allocated to it. Most chronicles are better made with the <a href="../builders/index.html">Builder</a>, which also makes their pages. One added here uses the folder given (pages in the site&rsquo;s files) or, left empty, the Builder&rsquo;s pages at <code>htr|vtda|dnd/&lt;world&gt;/&lt;short name&gt;/</code>.</p>' +
      '<p class="sheet-status" id="chronMsg" role="status"></p></section>';
    root.innerHTML = h;

    document.getElementById("adminOut").addEventListener("click", async function () { await db.auth.signOut(); window.location.reload(); });
    root.querySelectorAll(".members").forEach(function (el) {
      var dnd = el.getAttribute("data-dnd") === "1";
      window.ChronicleMembers.render(el, { db: db, chronicle: el.getAttribute("data-chronicle"), admin: true,
        unit: dnd ? "campaign" : "chronicle", dm: dnd ? "Dungeon Master" : "Storyteller" });
    });
    root.querySelectorAll("[data-review]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var ok = b.getAttribute("data-review") === "1";
        var note = b.closest("tr").querySelector(".review-note").value.trim();
        var msg = document.getElementById("reviewMsg");
        if (!ok && !note) { msg.textContent = "Say in the note what should change before sending it back."; return; }
        b.disabled = true;
        var r = await db.rpc("admin_review", { p_world: b.getAttribute("data-world"), p_chronicle: b.getAttribute("data-chronicle") || null, p_approve: ok, p_note: note });
        if (r.error) { b.disabled = false; msg.textContent = "Not done: " + errText(r.error); return; }
        draw(gate);
      });
    });
    root.querySelectorAll("[data-unbuild]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var email = b.getAttribute("data-unbuild");
        if (!window.confirm("Remove " + email + " from the builders? Their worlds stay; they can no longer make new ones.")) return;
        var r = await db.rpc("admin_set_builder", { p_email: email, p_add: false });
        if (r.error) { document.getElementById("builderMsg").textContent = "Not removed: " + errText(r.error); return; }
        draw(gate);
      });
    });
    var bn = document.getElementById("builderNew");
    if (bn) bn.addEventListener("submit", async function (e) {
      e.preventDefault();
      var r = await db.rpc("admin_set_builder", { p_email: bn.email.value.trim(), p_add: true });
      if (r.error) { document.getElementById("builderMsg").textContent = "Not added: " + errText(r.error); return; }
      draw(gate);
    });
    document.getElementById("chronNew").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var s = await db.rpc("save_chronicle", { p_id: f.cid.value.trim(), p_name: f.cname.value.trim(), p_game: f.game.value, p_world: f.world.value.trim(), p_path: f.cpath.value.trim() });
      if (s.error) { document.getElementById("chronMsg").textContent = "Not added: " + errText(s.error); return; }
      draw(gate);
    });
  }

  window.Gate.ready.then(draw);
})();
