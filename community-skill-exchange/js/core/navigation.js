/* ==========================================================================
   Barterly — Navigation
   Floating header (shrinks after scrolling, hides while scrolling down,
   returns when scrolling up), sliding underline indicator, full-screen
   mobile menu with morphing burger, and active-section highlighting.
   ========================================================================== */
(function (SE) {
  'use strict';

  var MOBILE_BREAKPOINT = 960;

  function initHeader() {
    var header = document.querySelector('[data-header]');
    if (!header) return;
    var lastY = window.scrollY;
    var ticking = false;

    function update() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      var goingDown = y > lastY + 4;
      var goingUp = y < lastY - 4;
      if (!document.body.classList.contains('nav-open')) {
        if (goingDown && y > 320) header.classList.add('is-hidden');
        else if (goingUp || y < 120) header.classList.remove('is-hidden');
      }
      if (Math.abs(y - lastY) > 4) lastY = y;
      ticking = false;
    }

    update();
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });

    // Keyboard users tabbing into the header should always see it
    header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
  }

  function initIndicator() {
    var list = document.querySelector('[data-nav-list]');
    var indicator = document.querySelector('[data-nav-indicator]');
    if (!list || !indicator) return;

    function moveTo(link) {
      if (!link || window.innerWidth <= MOBILE_BREAKPOINT) {
        list.style.setProperty('--ind-o', '0');
        return;
      }
      var l = link.getBoundingClientRect();
      var p = list.getBoundingClientRect();
      list.style.setProperty('--ind-x', (l.left - p.left + 12) + 'px');
      list.style.setProperty('--ind-w', Math.max(0, l.width - 24) + 'px');
      list.style.setProperty('--ind-o', '1');
    }

    list.addEventListener('pointerover', function (e) {
      var link = e.target.closest('.nav-link');
      if (link) moveTo(link);
    });
    list.addEventListener('pointerleave', function () {
      moveTo(list.querySelector('.nav-link.is-active'));
    });

    SE.navigation.moveIndicator = function () {
      moveTo(list.querySelector('.nav-link.is-active'));
    };
    window.addEventListener('resize', SE.navigation.moveIndicator);
  }

  function initMobileMenu() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('primary-nav');
    if (!toggle || !nav) return;
    var body = document.body;

    function setOpen(open) {
      body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      var lenis = SE.motion && SE.motion.lenis;
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
    }

    toggle.addEventListener('click', function () {
      setOpen(!body.classList.contains('nav-open'));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && body.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > MOBILE_BREAKPOINT && body.classList.contains('nav-open')) setOpen(false);
    });
  }

  function initActiveLinks() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (link) {
      var section = document.querySelector(link.getAttribute('href'));
      if (section) byId[section.id] = link;
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.remove('is-active');
          l.removeAttribute('aria-current');
        });
        var active = byId[entry.target.id];
        if (active) {
          active.classList.add('is-active');
          active.setAttribute('aria-current', 'true');
        }
        if (SE.navigation.moveIndicator) SE.navigation.moveIndicator();
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    document.querySelectorAll('main section[id]').forEach(function (s) { observer.observe(s); });
  }

  SE.navigation = {
    init: function () {
      initHeader();
      initIndicator();
      initMobileMenu();
      initActiveLinks();
    }
  };
})(window.SE = window.SE || {});
