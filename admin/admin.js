/* =====================================================================
   VISTECTUS — Admin: chronicles and their members
   ---------------------------------------------------------------------
   For site admins (the site_admins table). Each chronicle lists its
   Storytellers and players, with a form to add or remove them; a new
   chronicle can be added at the bottom. Each chronicle's Storytellers
   can also add and remove its players on their own Storyteller page.
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
        "<li><strong>SQL Editor</strong>: run <code>admin/sql/access.sql</code>, then <code>vtda/hungary-1242/crown-of-ice-and-bone/assets/sql/setup.sql</code> and <code>dnd/sql/setup.sql</code>.</li>" +
        "<li><strong>Authentication → Hooks</strong>: add a <em>Before User Created</em> hook of type Postgres, function <code>public.hook_before_user_created</code>. This is what lets only the emails added here create an account.</li>" +
        "<li><strong>Authentication → Sign In / Providers</strong>: turn <em>Allow new users to sign up</em> on (the hook above decides who actually may).</li>" +
        "<li><strong>Authentication → URL Configuration → Redirect URLs</strong>: <code>https://vistectus.com/**</code>, so sign-in links can come back to any page.</li>" +
      "</ol></details></section>";
  }

  async function draw(gate) {
    var db = gate.db;
    var r = await db.from("chronicles").select("*").order("name", { ascending: true });
    if (r.error) {
      root.innerHTML = setup() + '<div class="sheet-notice">The chronicles could not be read: ' + esc(errText(r.error)) + "</div>";
      return;
    }
    var h = '<div class="sheet-bar"><span class="sheet-status">Signed in as ' + esc(gate.email) + ' · site admin</span><span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" id="adminOut">Sign out</button></div>' + setup();
    (r.data || []).forEach(function (c) {
      h += '<section class="xp-panel"><div class="chron-head"><h2>' + esc(c.name) + '</h2><span class="meta">' +
        esc(GAMES[c.game] || c.game) + " · " + esc(c.world) + "</span></div>" +
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
      '<p class="xp-hint" style="margin-top:.4rem">This adds it to the list, so people can be allocated to it. Its pages are made separately, in the site&rsquo;s files, by copying an existing chronicle&rsquo;s or campaign&rsquo;s folder; give that folder here (empty: <code>htr|vtda|dnd/&lt;world&gt;/&lt;short name&gt;/</code>). A D&amp;D campaign&rsquo;s pages carry its short name in <code>&lt;body data-campaign=&quot;…&quot;&gt;</code>.</p>' +
      '<p class="sheet-status" id="chronMsg" role="status"></p></section>';
    root.innerHTML = h;

    document.getElementById("adminOut").addEventListener("click", async function () { await db.auth.signOut(); window.location.reload(); });
    root.querySelectorAll(".members").forEach(function (el) {
      var dnd = el.getAttribute("data-dnd") === "1";
      window.ChronicleMembers.render(el, { db: db, chronicle: el.getAttribute("data-chronicle"), admin: true,
        unit: dnd ? "campaign" : "chronicle", dm: dnd ? "Dungeon Master" : "Storyteller" });
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
