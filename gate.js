/* =====================================================================
   VISTECTUS — the members' gate
   ---------------------------------------------------------------------
   A chronicle's pages are for its members. Load this after supabase-js
   and builders/config.js:

     <script src="../../../gate.js" data-chronicle="dead-hand"></script>
     <script src="../../gate.js" data-world="hungary-1242"></script>
     <script src="..." data-chronicle="dead-hand" data-need="storyteller"></script>
     <script src="../gate.js" data-need="admin"></script>        (site admins)

   and put this first thing in <head>, so nothing shows before the check:

     <script>document.documentElement.classList.add("gate-pending")</script>

   The page's <main> stays hidden until the signed-in account is shown
   to be a member (or the chronicle's Storyteller, with
   data-need="storyteller"). Otherwise a sign-in box, or a "not in this
   chronicle" note, takes its place. Pages without a <main> (the board,
   the map) are covered entirely.

   Scripts that need to know who is looking wait for it:
     Gate.ready.then(function (g) { g.role; g.session; g.email; })
   (role: "player" or "storyteller"; Gate.ready never settles for
   someone turned away.)

   This only decides what the page shows. What the database hands out
   is decided by the database itself (admin/sql/access.sql).
   ===================================================================== */
(function () {
  "use strict";

  var me = document.currentScript;
  var CHRONICLE = me && me.getAttribute("data-chronicle");
  var WORLD = me && me.getAttribute("data-world");
  var NEED = (me && me.getAttribute("data-need")) || "member";
  var root = document.documentElement;
  root.classList.add("gate-pending");

  var css = document.createElement("style");
  css.textContent =
    ".gate-pending main, .gate-pending.gate-all body > *:not(.gate-box) { visibility: hidden !important; }" +
    ".gate-box { max-width: 34rem; margin: 3rem auto; padding: 1.4rem 1.6rem; background: var(--bg-raised, #191222);" +
    "  border: 1px solid var(--line, #2f2140); color: var(--ink, #eee); font-family: var(--font-body, Georgia, serif); }" +
    ".gate-all .gate-box { position: fixed; z-index: 9999; left: 50%; top: 12vh; transform: translateX(-50%); width: calc(100% - 2rem); margin: 0; }" +
    ".gate-box h2 { margin: 0 0 .6rem; font-family: var(--font-display, Georgia, serif); }" +
    ".gate-box p { margin: .4rem 0; color: var(--ink-soft, #bbb); line-height: 1.5; }" +
    ".gate-box form { display: flex; gap: .6rem; flex-wrap: wrap; margin: 1rem 0 .4rem; }" +
    ".gate-box input { flex: 1; min-width: 13rem; padding: .55rem .65rem; font: inherit; color: var(--ink, #eee);" +
    "  background: var(--bg-sunken, #09060e); border: 1px solid var(--line, #2f2140); }" +
    ".gate-box .gate-msg { font-family: var(--font-mono, monospace); font-size: .8rem; min-height: 1.2em; }" +
    ".gate-box a { color: var(--accent, #b03a55); }";
  document.head.appendChild(css);

  var resolveReady;
  var Gate = window.Gate = { ready: new Promise(function (r) { resolveReady = r; }), role: null, session: null, db: null };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }

  var box = null;
  function show(html) {
    var main = document.querySelector("main");
    if (!main) root.classList.add("gate-all");
    if (!box) {
      box = document.createElement("section");
      box.className = "gate-box";
      box.setAttribute("role", "region");
      box.setAttribute("aria-live", "polite");
      if (main) main.parentNode.insertBefore(box, main.nextSibling);
      else document.body.appendChild(box);
    }
    box.innerHTML = html;
    return box;
  }

  var where = NEED === "admin" ? "the site&rsquo;s administrators" : WORLD ? "this world&rsquo;s chronicles" : "this chronicle";
  function signInBox(db) {
    var b = show("<h2>Members only</h2>" +
      "<p>These pages are for the players and Storytellers of " + where + ". Sign in with the email your Storyteller added, and a link will be sent to it. The first time, that link also creates your account.</p>" +
      '<form class="gate-form"><input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email">' +
      '<button class="btn" type="submit">Send link</button></form><p class="gate-msg" role="status"></p>');
    b.querySelector("form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = b.querySelector(".gate-msg"), btn = b.querySelector("button");
      btn.disabled = true; msg.textContent = "Sending…";
      try {
        var r = await db.auth.signInWithOtp({
          email: b.querySelector("input").value.trim(),
          options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split("#")[0] }
        });
        if (r.error) throw r.error;
        msg.textContent = "Link sent. Open it from your email and this page opens again, signed in.";
      } catch (err) {
        console.error(err);
        msg.textContent = /not been invited|signups? not allowed|not found|invalid login|hook/i.test(errText(err))
          ? "That email has not been added to a chronicle. Ask your Storyteller to add it."
          : "Could not send the link: " + errText(err);
        btn.disabled = false;
      }
    });
  }

  function refused(db, session, text) {
    var b = show("<h2>Not for this account</h2><p>" + text + "</p>" +
      "<p>Signed in as " + esc(session.user && session.user.email) + '. <a href="#" class="gate-out">Sign out</a></p>');
    b.querySelector(".gate-out").addEventListener("click", async function (e) {
      e.preventDefault(); await db.auth.signOut(); window.location.reload();
    });
  }

  async function check() {
    var cfg = window.BUILDERS_CONFIG || {};
    var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
      ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
    if (!db) { show("<h2>Not connected</h2><p>Signing in is not available just now. Try again later.</p>"); return; }
    Gate.db = db;
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) {
        signInBox(db);
        db.auth.onAuthStateChange(function (event) { if (event === "SIGNED_IN") window.location.reload(); });
        return;
      }
      var role = null;
      if (NEED === "admin") {
        var a = await db.rpc("is_admin");
        if (a.error) throw a.error;
        role = a.data === true ? "admin" : null;
        if (!role) return refused(db, session, "This page is for the site&rsquo;s administrators.");
      } else if (WORLD) {
        var w = await db.rpc(NEED === "storyteller" ? "is_world_storyteller" : "is_world_member", { p_world: WORLD });
        if (w.error) throw w.error;
        role = w.data === true ? (NEED === "storyteller" ? "storyteller" : "member") : null;
        if (role === "member") {
          var st = await db.rpc("is_world_storyteller", { p_world: WORLD });
          if (!st.error && st.data === true) role = "storyteller";
        }
      } else {
        var r = await db.rpc("chronicle_role", { p_chronicle: CHRONICLE });
        if (r.error) throw r.error;
        role = r.data || null;
      }
      if (!role) return refused(db, session, "This account is not part of " + where + ". If it should be, ask your Storyteller to add this email.");
      if (NEED === "storyteller" && role !== "storyteller") return refused(db, session, "This page is for the Storyteller.");
      Gate.role = role; Gate.session = session; Gate.email = session.user && session.user.email;
      root.classList.remove("gate-pending", "gate-all");
      if (box) { box.remove(); box = null; }
      db.auth.onAuthStateChange(function (event) { if (event === "SIGNED_OUT") window.location.reload(); });
      resolveReady(Gate);
    } catch (e) {
      console.error(e);
      // Could not tell: show nothing rather than everything.
      var b = show("<h2>Could not check</h2><p>Your membership could not be checked just now (" + esc(errText(e)) + ").</p>" +
        '<p><a href="#" class="gate-retry">Try again</a></p>');
      b.querySelector(".gate-retry").addEventListener("click", function (ev) { ev.preventDefault(); check(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
})();
