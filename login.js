/* =====================================================================
   VISTECTUS — a chronicle's Log in page
   ---------------------------------------------------------------------
   login.html in each chronicle. Open to everyone (no gate): signed out,
   it asks for the email the Storyteller added; signed in, it shows the
   player's characters, those still being made, and the way to the
   members' pages.

     <div id="login"></div>
     <script src="../../../login.js" data-chronicle="dead-hand"
             data-noun="hunter" data-crew="The cell" data-create="Create Hunter"
             data-create-href="create.html?new"></script>
     (D&D adds data-unit="campaign" data-dm-label="Dungeon Master"
      data-dm-href="dm.html" data-dm-page="DM Screen".)

   Load it after supabase-js and builders/config.js.
   ===================================================================== */
(function () {
  "use strict";

  var me = document.currentScript;
  function attr(n, d) { return (me && me.getAttribute(n)) || d; }
  var CHRONICLE = attr("data-chronicle", "");
  var NOUN = attr("data-noun", "character");
  var CREW = attr("data-crew", "The players");
  var CREATE = attr("data-create", "Create a character");
  var CREATE_HREF = attr("data-create-href", "create.html");
  var UNIT = attr("data-unit", "chronicle");
  var DM = attr("data-dm-label", "Storyteller");
  var DM_HREF = attr("data-dm-href", "storyteller.html");
  var DM_PAGE = attr("data-dm-page", "Storyteller page");
  var root = document.getElementById("login");

  var css = document.createElement("style");
  css.textContent =
    ".login-box { max-width: 40rem; margin: 0 auto; background: var(--bg-raised); border: 1px solid var(--line); padding: 1.4rem 1.6rem; }" +
    ".login-box h2 { margin: 0 0 .6rem; }" +
    ".login-box h3 { font-family: var(--font-display); font-size: 1rem; letter-spacing: .06em; margin: 1.4rem 0 .5rem; }" +
    ".login-box p { color: var(--ink-soft); line-height: 1.55; margin: .4rem 0; }" +
    ".login-form { display: flex; gap: .6rem; flex-wrap: wrap; margin: 1rem 0 .4rem; }" +
    ".login-form input { flex: 1; min-width: 13rem; padding: .55rem .65rem; font: inherit; color: var(--ink); background: var(--bg-sunken); border: 1px solid var(--line); }" +
    ".login-msg, .login-who { font-family: var(--font-mono); font-size: .8rem; color: var(--ink-soft); min-height: 1.2em; }" +
    ".login-list { list-style: none; margin: 0; padding: 0; }" +
    ".login-list li { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; padding: .45rem 0; border-bottom: 1px solid var(--line); }" +
    ".login-list small { font-family: var(--font-mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-dim); }" +
    ".login-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1.4rem; }" +
    ".login-empty { color: var(--ink-dim); font-style: italic; }";
  document.head.appendChild(css);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }

  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  function signedOut() {
    root.innerHTML = '<section class="login-box"><h2>Log in</h2>' +
      "<p>Players and " + DM + "s of this " + UNIT + " sign in here with the email the " + DM + " added. A link is sent to it; open it and you come back here, signed in. The first time, that link also creates your account.</p>" +
      '<form class="login-form"><input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email">' +
      '<button class="btn" type="submit">Send link</button></form><p class="login-msg" role="status" aria-live="polite"></p>' +
      "<p>Not in the " + UNIT + " yet? Ask the " + DM + " to add your email.</p></section>";
    root.querySelector("form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = root.querySelector(".login-msg"), btn = root.querySelector("button");
      btn.disabled = true; msg.textContent = "Sending…";
      try {
        var r = await db.auth.signInWithOtp({
          email: root.querySelector("input").value.trim(),
          options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split("#")[0] }
        });
        if (r.error) throw r.error;
        msg.textContent = "Link sent. Open it from your email to finish logging in.";
      } catch (err) {
        console.error(err);
        msg.textContent = /not been invited|signups? not allowed|not found|invalid login|hook/i.test(errText(err))
          ? "That email has not been added to a " + UNIT + ". Ask your " + DM + " to add it."
          : "Could not send the link: " + errText(err);
        btn.disabled = false;
      }
    });
  }

  function signOutButton() {
    var b = root.querySelector(".login-out");
    if (b) b.addEventListener("click", async function () { await db.auth.signOut(); render(); });
  }

  async function signedIn(session) {
    var email = session.user && session.user.email;
    var role = await db.rpc("chronicle_role", { p_chronicle: CHRONICLE });
    if (role.error) throw role.error;
    if (!role.data) {
      root.innerHTML = '<section class="login-box"><h2>Not in this ' + esc(UNIT) + "</h2>" +
        '<p class="login-who">Logged in as ' + esc(email) + "</p>" +
        "<p>This email has not been added to this " + UNIT + ". If it should be, ask the " + DM + " to add it.</p>" +
        '<div class="login-actions"><button type="button" class="btn btn--ghost login-out">Log out</button></div></section>';
      signOutButton();
      return;
    }
    var st = role.data === "storyteller";
    var got = await Promise.all([
      db.rpc("my_sheets", { p_chronicle: CHRONICLE }),
      db.from("character_drafts").select("id,name,status,email").eq("chronicle", CHRONICLE).order("updated_at", { ascending: false })
    ]);
    var sheets = got[0].data || [];
    var drafts = (got[1].data || []).filter(function (d) { return d.email === String(email).toLowerCase() && d.status !== "approved"; });
    var STATUS = { draft: "Being made", submitted: "With the " + DM, rejected: "Sent back" };
    var h = '<section class="login-box"><h2>Welcome</h2>' +
      '<p class="login-who">Logged in as ' + esc(email) + " · " + (st ? esc(DM) : "Player") + "</p>" +
      "<h3>Your " + esc(NOUN) + (sheets.length === 1 ? "" : "s") + "</h3>";
    h += sheets.length
      ? '<ul class="login-list">' + sheets.map(function (s) {
          return '<li><a href="sheet.html?c=' + encodeURIComponent(s.slug) + '">' + esc(s.name) + "</a><small>Character sheet</small></li>";
        }).join("") + "</ul>"
      : '<p class="login-empty">No character sheet of yours here yet.</p>';
    if (drafts.length) {
      h += "<h3>Being made</h3><ul class=\"login-list\">" + drafts.map(function (d) {
        return '<li><a href="create.html">' + esc(d.name || "(no name yet)") + "</a><small>" + esc(STATUS[d.status] || d.status) + "</small></li>";
      }).join("") + "</ul>";
    }
    h += '<div class="login-actions"><a class="btn" href="' + esc(CREATE_HREF) + '">' + esc(CREATE) + "</a>" +
      '<a class="btn btn--ghost" href="players.html">' + esc(CREW) + "</a>" +
      (st ? '<a class="btn btn--ghost" href="' + esc(DM_HREF) + '">' + esc(DM_PAGE) + "</a>" : "") +
      '<button type="button" class="btn btn--ghost login-out">Log out</button></div></section>';
    root.innerHTML = h;
    signOutButton();
  }

  async function render() {
    if (!db) { root.innerHTML = '<section class="login-box"><p>Logging in is not available just now.</p></section>'; return; }
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) return signedOut();
      await signedIn(session);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<section class="login-box"><h2>Could not check</h2><p>Your account could not be checked just now (' + esc(errText(e)) + "). Try again in a moment.</p></section>";
    }
  }

  if (db) db.auth.onAuthStateChange(function (event) { if (event === "SIGNED_IN" || event === "SIGNED_OUT") render(); });
  render();
})();
