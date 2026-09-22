/**
 * RUŌOD — the site's only script.
 *
 * Two jobs, both of them enhancements: fade sections in as they arrive, and
 * keep the year in the colophon honest. The page is complete and readable
 * with this file blocked — the `.reveal` rules in styles.css only apply once
 * the inline snippet in <head> has removed the `no-js` class.
 *
 * It sets no styles from here. The deployed CSP is style-src 'self', so an
 * inline style would be dropped in production; every visual state is a class
 * that the stylesheet owns.
 */
(function () {
  'use strict';

  var revealables = document.querySelectorAll('.reveal');
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showAll() {
    for (var i = 0; i < revealables.length; i++) {
      revealables[i].classList.add('is-in');
    }
  }

  if (!('IntersectionObserver' in window) || reduced) {
    // No observer, or the visitor asked for no motion: show everything now.
    showAll();
  } else {
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('is-in');
          observer.unobserve(entries[i].target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    for (var j = 0; j < revealables.length; j++) {
      observer.observe(revealables[j]);
    }

    // Anything already on screen at load should not wait for a scroll that
    // may never come — on a short page there is nothing left to scroll.
    window.setTimeout(function () {
      for (var k = 0; k < revealables.length; k++) {
        var box = revealables[k].getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) {
          revealables[k].classList.add('is-in');
        }
      }
    }, 60);
  }

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
