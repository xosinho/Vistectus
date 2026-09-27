/* =====================================================================
   tabs.js — marks the tab for whichever section is on screen.

   Only tabs that point into the same page (href="#setting") take part.
   Tabs that lead to other pages are marked with aria-current in the
   HTML and are left alone here. Without JavaScript the tabs still work
   as ordinary links; they just do not light up as you scroll.
   ===================================================================== */
(function () {
  "use strict";

  var links = Array.prototype.slice.call(
    document.querySelectorAll('.tabs a[href^="#"]')
  );
  if (!links.length || !("IntersectionObserver" in window)) return;

  var byId = {};
  links.forEach(function (a) {
    var el = document.getElementById(a.getAttribute("href").slice(1));
    if (el) byId[el.id] = a;
  });

  function mark(id) {
    links.forEach(function (a) { a.classList.toggle("is-active", byId[id] === a); });
  }

  // A section counts as current once it crosses the upper part of the
  // screen, just under the bar and the tabs themselves.
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) mark(e.target.id); });
  }, { rootMargin: "-20% 0px -70% 0px" });

  Object.keys(byId).forEach(function (id) {
    observer.observe(document.getElementById(id));
  });
})();
