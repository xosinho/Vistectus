/* =====================================================================
   THE DEAD HAND — Storyteller sign-in and overview
   ---------------------------------------------------------------------
   Signs in the same way as the character sheets (an emailed link), so
   signing in here also signs you in on every sheet and the RICO board.
   Signed in as a Storyteller, it lists every hunter's XP and the
   purchases waiting for approval, each with a link to that sheet,
   where approving happens.

   Being a Storyteller means having your email in the storytellers
   table; the database checks that, not this page.
   ===================================================================== */
(function () {
  "use strict";

  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
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

  /* ------------------------------------------------------- signed out */
  function signInForm() {
    root.innerHTML =
      '<section class="xp-panel" style="max-width:32rem">' +
        "<h2>Sign in</h2>" +
        '<p class="xp-hint">Enter your email and a sign-in link will be sent to it. It brings you back here, signed in; the sheets and the RICO board then recognise you too.</p>' +
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
      db.from("character_sheets").select("slug,name").eq("chronicle", "dead-hand").order("name", { ascending: true }),
      db.from("xp_awards").select("slug,amount"),
      db.from("xp_requests").select("*").order("requested_at", { ascending: true })
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    var sheets = r[0].data || [], awards = r[1].data || [], reqs = r[2].data || [];
    var names = {};
    sheets.forEach(function (s) { names[s.slug] = s.name; });

    var h = accountBar(session, "Storyteller") +
      '<section class="xp-panel"><h2>The cell</h2>' +
      '<p class="xp-hint">Open a hunter to award XP, approve or refund purchases, or edit the sheet.</p>' +
      '<table class="xp-table"><tr><th>Hunter</th><th class="num">Awarded</th><th class="num">Spent</th>' +
      '<th class="num">Available</th><th class="num">Waiting</th><th></th></tr>';
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
        (waiting ? '<span class="status status-pending">' + waiting + "</span>" : "0") +
        '</td><td class="acts"><a class="btn btn--ghost" href="sheet.html?c=' + encodeURIComponent(s.slug) + '">Open sheet</a></td></tr>';
    });
    h += "</table>";

    var pendingList = reqs.filter(function (q) { return q.status === "pending" && names[q.slug]; });
    h += "<h3>Waiting for your approval</h3>";
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
    root.innerHTML = h + "</section>";
    wireSignOut();
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
          '<div class="sheet-notice">This account is not a Storyteller. Players update their hunters from their own ' +
          '<a href="players.html">character sheets</a>. To make this account a Storyteller, add its email to the ' +
          "<code>storytellers</code> table (see the chronicle README).</div>";
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
    // Arriving from the emailed link: the session appears a moment after load.
    db.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") render();
    });
  }
  render();
})();
