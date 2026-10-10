/* =====================================================================
   D&D CAMPAIGNS — page title
   ---------------------------------------------------------------------
   <body data-title="The Party" data-campaign-name="Shrouded — Campaign One">
   -> "The Party · Shrouded — Campaign One · VisTectus"
   ===================================================================== */
(function () {
  "use strict";
  function setTitle() {
    var b = document.body, page = b.getAttribute("data-title"), camp = b.getAttribute("data-campaign-name");
    if (!camp) return;
    document.title = (page && page !== "Campaign" ? page + " · " : "") + camp + " · VisTectus";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setTitle);
  else setTitle();
})();
