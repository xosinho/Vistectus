/* =====================================================================
   VISTECTUS — a chronicle's members (players and Storytellers)
   ---------------------------------------------------------------------
   Used by each chronicle's Storyteller page and by the Admin page:

     ChronicleMembers.render(element, { db, chronicle, admin, onChange, unit, dm })

   unit and dm are the words for the page: "campaign" and "Dungeon
   Master" for D&D; "chronicle" and "Storyteller" by default.

   Lists who is in the chronicle and lets the viewer add or remove
   people. A chronicle's Storyteller adds and removes players; a site
   admin (admin: true) also adds and removes Storytellers. The database
   enforces the same (admin/sql/access.sql); this only draws the form.

   Adding an email is the invitation: that person signs in with it on
   any of the chronicle's pages, and the first link creates their
   account. Nothing is sent by adding them: tell them yourself.
   ===================================================================== */
(function () {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  async function render(el, o) {
    var db = o.db, admin = !!o.admin, UNIT = o.unit || "chronicle", DM = o.dm || "Storyteller";
    var r = await db.rpc("members_of", { p_chronicle: o.chronicle });
    if (r.error) {
      el.innerHTML = '<div class="sheet-notice">The member list could not be read: ' + esc(errText(r.error)) +
        ". Has <code>admin/sql/access.sql</code> been run in Supabase?</div>";
      return;
    }
    var rows = r.data || [];
    var h = '<table class="xp-table members-table"><tr><th>Email</th><th>Role</th><th>Account</th><th>Added</th><th></th></tr>';
    if (!rows.length) h += '<tr><td colspan="5" class="empty-line">Nobody yet.</td></tr>';
    rows.forEach(function (m) {
      var removable = admin || m.role === "player";
      h += "<tr><td>" + esc(m.email) + "</td><td>" + (m.role === "storyteller" ? esc(DM) : "Player") + "</td>" +
        "<td>" + (m.has_account ? "Signed in before" : '<span class="status status-pending">Not yet</span>') + "</td>" +
        "<td>" + esc(fmtDate(m.added_at)) + '</td><td class="acts">' +
        (removable ? '<button type="button" class="btn btn--ghost" data-remove="' + esc(m.email) + '">Remove</button>' : "") + "</td></tr>";
    });
    h += "</table>" +
      '<form class="xp-form members-add" style="margin-top:.8rem">' +
        '<label style="flex:1">Email<input type="email" name="email" required autocomplete="off" placeholder="name@example.com" style="width:100%"></label>' +
        (admin ? '<label>Role<select name="role"><option value="player">Player</option><option value="storyteller">' + esc(DM) + '</option></select></label>' : "") +
        '<button class="btn" type="submit">Add</button></form>' +
      '<p class="xp-hint" style="margin-top:.4rem">Adding an email lets that person in: they sign in with it on any of this ' + UNIT + '&rsquo;s pages, and the first sign-in link creates their account. Nothing is emailed when you add them, so let them know. ' +
        (admin ? "" : "Only a site admin can add or remove " + esc(DM) + "s. ") +
        "Removing someone takes away their access, and their characters&rsquo; sheets stay for you to give to someone else.</p>" +
      '<p class="sheet-status members-msg" role="status" aria-live="polite"></p>';
    el.innerHTML = h;

    var msg = el.querySelector(".members-msg");
    el.querySelector(".members-add").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector("button");
      btn.disabled = true; msg.textContent = "Adding…";
      var a = await db.rpc("add_member", { p_chronicle: o.chronicle, p_email: f.email.value.trim(), p_role: f.role ? f.role.value : "player" });
      btn.disabled = false;
      if (a.error) { msg.textContent = "Not added: " + errText(a.error); return; }
      await render(el, o);
      el.querySelector(".members-msg").textContent = "Added. Tell them to sign in with that email.";
      if (o.onChange) o.onChange();
    });
    el.querySelectorAll("[data-remove]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var email = b.getAttribute("data-remove");
        if (!window.confirm("Remove " + email + " from the " + UNIT + "? They lose access to its pages, and to any character sheet they play here.")) return;
        var d = await db.rpc("remove_member", { p_chronicle: o.chronicle, p_email: email });
        if (d.error) { window.alert("Not removed: " + errText(d.error)); return; }
        await render(el, o);
        if (o.onChange) o.onChange();
      });
    });
  }

  window.ChronicleMembers = { render: render };
})();
