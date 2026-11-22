/* ==========================================================================
   Barterly — Motion layer (shared by every page)

   • Lenis smooth scrolling (synced with GSAP ScrollTrigger when present)
   • Scroll progress bar
   • Page transitions: an ink curtain covers the page on internal navigation
     and lifts on arrival
   • Custom cursor (dot + ring with labels: data-cursor="View")
   • Magnetic elements (data-magnetic) and 3D tilt (data-tilt)
   • Word splitting helper for text animations

   Everything is progressive: with reduced motion, touch input or missing
   libraries the page still works and simply doesn't animate.
   ========================================================================== */
(function (SE) {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var lenis = null;

  if (hasGsap) window.gsap.registerPlugin(window.ScrollTrigger);

  /* ---------- Smooth scroll ---------- */
  function initLenis() {
    if (reduce || !window.Lenis || !document.body.hasAttribute('data-smooth')) return;
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1 });

    if (hasGsap) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }

    // In-page anchors glide with Lenis
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link || event.defaultPrevented) return;
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -20, duration: 1.4 });
      history.replaceState(null, '', id);
    });
  }

  function scrollTo(target, opts) {
    if (lenis) lenis.scrollTo(target, opts || {});
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    else if (target && target.scrollIntoView) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- Scroll progress ---------- */
  function initProgress() {
    var bar = document.querySelector('[data-scroll-progress] span');
    if (!bar) return;
    var update = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = 'scaleX(' + p + ')';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* ---------- Page transitions (curtain) ---------- */
  function initTransitions() {
    var curtain = document.querySelector('[data-curtain]');
    if (!curtain) return;

    // Arrival: if we came here via a curtain, lift it
    var arriving = false;
    try { arriving = sessionStorage.getItem('ss-curtain') === '1'; sessionStorage.removeItem('ss-curtain'); } catch (e) { /* ignore */ }
    SE.motion.arrived = arriving;
    if (arriving && !reduce) {
      curtain.classList.add('is-covering', 'no-transition');
      void curtain.offsetWidth;
      curtain.classList.remove('no-transition');
      requestAnimationFrame(function () {
        curtain.classList.remove('is-covering');
        curtain.classList.add('is-leaving');
        window.setTimeout(function () { curtain.classList.remove('is-leaving'); }, 900);
      });
    }

    if (reduce) return;

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download') || link.dataset.noTransition !== undefined) return;
      var url;
      try { url = new URL(link.href, window.location.href); } catch (e) { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return; // same page anchor
      if (!/\.html$|\/$/.test(url.pathname)) return;

      event.preventDefault();
      var label = curtain.querySelector('[data-curtain-label]');
      if (label) label.textContent = link.getAttribute('data-curtain-text') || pageLabel(url.pathname);
      curtain.classList.add('is-covering');
      try { sessionStorage.setItem('ss-curtain', '1'); } catch (e) { /* ignore */ }
      window.setTimeout(function () { window.location.href = url.href; }, 620);
    });

    // Back/forward cache: make sure the curtain isn't left covering the page
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) curtain.classList.remove('is-covering', 'is-leaving');
    });
  }

  function pageLabel(path) {
    if (/signin/.test(path)) return 'Sign in';
    if (/signup/.test(path)) return 'Join Barterly';
    return 'Barterly';
  }

  /* ---------- Custom cursor ---------- */
  function initCursor() {
    var cursor = document.querySelector('[data-cursor-root]');
    if (!cursor || reduce || !finePointer) return;
    root.classList.add('has-cursor');

    var dot = cursor.querySelector('.cursor-dot');
    var ring = cursor.querySelector('.cursor-ring');
    var label = cursor.querySelector('.cursor-label');
    var x = window.innerWidth / 2;
    var y = window.innerHeight / 2;
    var rx = x;
    var ry = y;
    var visible = false;

    window.addEventListener('pointermove', function (e) {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (!visible) { visible = true; cursor.classList.add('is-visible'); }
    }, { passive: true });

    document.addEventListener('pointerleave', function () { visible = false; cursor.classList.remove('is-visible'); });

    (function loop() {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
      requestAnimationFrame(loop);
    })();

    document.addEventListener('pointerover', function (e) {
      var labelled = e.target.closest('[data-cursor]');
      var interactive = e.target.closest('a, button, [role="tab"], label, summary, select');
      var field = e.target.closest('input, textarea');
      cursor.classList.toggle('is-label', !!labelled);
      cursor.classList.toggle('is-hover', !labelled && !!interactive);
      cursor.classList.toggle('is-text', !!field);
      label.textContent = labelled ? labelled.getAttribute('data-cursor') : '';
    });

    window.addEventListener('pointerdown', function () { cursor.classList.add('is-down'); });
    window.addEventListener('pointerup', function () { cursor.classList.remove('is-down'); });
  }

  /* ---------- Magnetic elements ---------- */
  function initMagnetic() {
    if (reduce || !finePointer) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var strength = parseFloat(el.getAttribute('data-magnetic')) || 0.35;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var mx = (e.clientX - (r.left + r.width / 2)) * strength;
        var my = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transition = 'transform 120ms linear';
        el.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transition = 'transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1)';
        el.style.transform = '';
      });
    });
  }

  /* ---------- 3D tilt ---------- */
  function initTilt() {
    if (reduce || !finePointer) return;
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-tilt')) || 8;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transition = 'transform 100ms linear';
        el.style.transform = 'perspective(900px) rotateY(' + (px * max) + 'deg) rotateX(' + (-py * max) + 'deg) translateZ(0)';
        el.style.setProperty('--glare-x', (px + 0.5) * 100 + '%');
        el.style.setProperty('--glare-y', (py + 0.5) * 100 + '%');
      });
      el.addEventListener('pointerleave', function () {
        el.style.transition = 'transform 600ms var(--ease)';
        el.style.transform = '';
      });
    });
  }

  /* ---------- Text splitting ---------- */
  /**
   * Wrap every word of `el` in <span class="w"><span class="w-i">word</span></span>
   * while keeping inline elements (em, strong, svg…) intact.
   * Returns the inner word spans.
   */
  function splitWords(el) {
    if (!el || el.dataset.split === 'done') return Array.prototype.slice.call(el ? el.querySelectorAll('.w-i') : []);
    var words = [];

    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var outer = document.createElement('span');
            outer.className = 'w';
            var inner = document.createElement('span');
            inner.className = 'w-i';
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
            words.push(inner);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && !/^(SVG|IMG|BR)$/i.test(child.tagName) && !child.hasAttribute('data-no-split')) {
          walk(child);
        }
      });
    }

    walk(el);
    el.dataset.split = 'done';
    return words;
  }

  SE.motion = {
    reduce: reduce,
    finePointer: finePointer,
    hasGsap: hasGsap,
    get lenis() { return lenis; },
    scrollTo: scrollTo,
    splitWords: splitWords
  };

  /* ---------- Rolling button labels ---------- */
  function initRollingLabels() {
    document.querySelectorAll('.btn-roll').forEach(function (el) {
      if (el.querySelector('.btn-roll-i')) return;
      var text = el.textContent.trim();
      var inner = document.createElement('span');
      inner.className = 'btn-roll-i';
      inner.setAttribute('data-text', text);
      inner.textContent = text;
      el.textContent = '';
      el.appendChild(inner);
    });
  }

  function init() {
    initRollingLabels();
    initLenis();
    initProgress();
    initTransitions();
    initCursor();
    initMagnetic();
    initTilt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SE = window.SE || {});
