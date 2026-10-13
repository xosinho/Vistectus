/* =====================================================================
   VISTECTUS — a character's XP history, under their row on the
   Storyteller page or DM Screen
   ---------------------------------------------------------------------
   Every system's Storyteller page lists the characters in a table. Each
   row gets a History button; it opens a row beneath with everything that
   happened to that character's XP, newest first: awards (with their
   note), and purchases or level-ups with what became of them.

     XpHistory.button(slug, entries)          the button, for the row's last cell
     XpHistory.row(slug, entries, columns)    the hidden row that follows it
     XpHistory.wire(root)                     makes the buttons work

   entries: [{ at: ISO date, amount: "+3" | "−10" | "+1 level" | "",
               text: "XP awarded", status: "approved" | "pending" | ...,
               note: "" }]
   Text goes in escaped; nothing here comes out as markup.
   ===================================================================== */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function day(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function id(slug) { return "xph-" + String(slug).replace(/[^a-z0-9-]/gi, "-"); }
  var STATUS = { pending: "waiting", approved: "approved", rejected: "turned down", cancelled: "withdrawn", refunded: "refunded" };

  var css = document.createElement("style");
  css.textContent =
    ".xp-history > td { background: var(--bg-sunken, rgba(0,0,0,.18)); padding: .5rem .9rem .8rem; }" +
    ".xp-log { list-style: none; margin: 0; padding: 0; }" +
    ".xp-log li { display: grid; grid-template-columns: 7.5rem 5.5rem 1fr; gap: .2rem .8rem; padding: .35rem 0; border-bottom: 1px solid var(--line, #333); }" +
    ".xp-log li:last-child { border-bottom: 0; }" +
    ".xp-log time { font-family: var(--font-mono, monospace); font-size: .75rem; color: var(--ink-soft, #aaa); padding-top: .15rem; }" +
    ".xp-log .amt { font-family: var(--font-mono, monospace); text-align: right; white-space: nowrap; }" +
    ".xp-log .amt.plus { color: #8fc28a; }" +
    ".xp-log .amt.off { color: var(--ink-dim, #777); text-decoration: line-through; }" +
    ".xp-log .what .status { margin-left: .4rem; }" +
    ".xp-log .note { display: block; color: var(--ink-soft, #aaa); font-size: .85rem; font-style: italic; }" +
    "@media (max-width: 560px) { .xp-log li { grid-template-columns: 1fr auto; } .xp-log time { grid-column: 1 / -1; } }";
  document.head.appendChild(css);

  function button(slug, entries) {
    var n = (entries || []).length;
    return '<button type="button" class="btn btn--ghost" data-xph="' + esc(id(slug)) + '" aria-expanded="false" aria-controls="' + esc(id(slug)) + '"' +
      (n ? "" : " disabled") + ">History" + (n ? " (" + n + ")" : "") + "</button>";
  }

  function row(slug, entries, columns) {
    var list = (entries || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var h = '<tr class="xp-history" id="' + esc(id(slug)) + '" hidden><td colspan="' + (columns || 1) + '"><ol class="xp-log">';
    list.forEach(function (e) {
      var counts = !e.status || e.status === "approved";
      var cls = !counts ? " off" : (/^\+/.test(e.amount || "") ? " plus" : "");
      h += "<li><time>" + esc(day(e.at)) + '</time><span class="amt' + cls + '">' + esc(e.amount || "") + "</span>" +
        '<span class="what">' + esc(e.text) +
        (e.status ? '<span class="status status-' + esc(e.status) + '">' + esc(STATUS[e.status] || e.status) + "</span>" : "") +
        (e.note ? '<span class="note">' + esc(e.note) + "</span>" : "") + "</span></li>";
    });
    return h + "</ol></td></tr>";
  }

  function wire(root) {
    (root || document).querySelectorAll("[data-xph]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = document.getElementById(b.getAttribute("data-xph"));
        if (!r) return;
        r.hidden = !r.hidden;
        b.setAttribute("aria-expanded", r.hidden ? "false" : "true");
      });
    });
  }

  window.XpHistory = { button: button, row: row, wire: wire };
})();
