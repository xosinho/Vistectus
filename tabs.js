/* =====================================================================
   tabs.js — marks the tab for whichever section is on screen.

   Only tabs that point into the same page (href="#setting") take part.
   Tabs that lead to other pages are marked with aria-current in the
   HTML and are left alone here. Without JavaScript the tabs still work
   as ordinary links; they just do not light up as you scroll.

   How "on screen" is decided:
   - The current section is the last one whose top has passed a line
     30% of the way down the window.
   - At the very bottom of the page the last section counts, even if it
     is too short ever to reach that line. On a short page the final
     section would otherwise never light up.
   - A clicked tab lights at once and stays lit while the page scrolls
     to it, so a jump that ends near the bottom cannot hand the
     highlight to a neighbouring section.
   ===================================================================== */
(function () {
  "use strict";

  var links = Array.prototype.slice.call(
    document.querySelectorAll('.tabs a[href^="#"]')
  );

  var items = links.map(function (a) {
    return { link: a, el: document.getElementById(a.getAttribute("href").slice(1)) };
  }).filter(function (x) { return x.el; });
  if (!items.length) return;

  // Page order, which is not always tab order.
  var byPage = items.slice().sort(function (a, b) {
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  function mark(item) {
    links.forEach(function (a) { a.classList.toggle("is-active", !!item && item.link === a); });
  }

  function current() {
    var doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
      return byPage[byPage.length - 1];
    }
    var line = window.innerHeight * 0.3, found = null;
    byPage.forEach(function (x) {
      if (x.el.getBoundingClientRect().top <= line) found = x;
    });
    return found;
  }

  var locked = false, settle = null, ticking = false;

  function unlockSoon() {
    clearTimeout(settle);
    settle = setTimeout(function () { locked = false; }, 150);
  }

  window.addEventListener("scroll", function () {
    if (locked) { unlockSoon(); return; }        // still travelling to a clicked tab
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { ticking = false; mark(current()); });
  }, { passive: true });

  items.forEach(function (x) {
    x.link.addEventListener("click", function () {
      mark(x);
      locked = true;
      unlockSoon();                              // in case the page does not need to move
    });
  });

  mark(current());
})();
