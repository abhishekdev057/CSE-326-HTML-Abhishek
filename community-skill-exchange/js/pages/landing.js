/* ==========================================================================
   Barterly — Landing page motion
   GSAP + ScrollTrigger choreography for the editorial landing page.

   Effects used here (all disabled with prefers-reduced-motion):
     preloader · hero line reveal · scribble/SVG path drawing · layered mouse
     and scroll parallax · spotlight gradient · velocity-reactive marquee ·
     word-by-word scroll text · staggered headline reveal · pinned scene with
     path drawing (exchange) · horizontal scroll (how it works) · sticky
     storytelling with mask reveal (formats) · cursor image preview + live
     filter (categories) · number counters · scroll zoom (split, campus) ·
     clip-path image reveals · draggable rail with inertia (stories) ·
     smooth accordion (FAQ) · magnetic CTA (motion.js)
   ========================================================================== */
(function (SE) {
  'use strict';

  var M = SE.motion;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var animate = M.hasGsap && !M.reduce;
  var DESKTOP = '(min-width: 961px)';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Preloader (once per browser session) ---------- */
  function preloader(onDone) {
    var el = $('[data-preloader]');
    var seen = false;
    try { seen = sessionStorage.getItem('ss-preloaded') === '1'; } catch (e) { /* ignore */ }
    if (!el || M.reduce || seen || M.arrived) { onDone(); return; }

    try { sessionStorage.setItem('ss-preloaded', '1'); } catch (e) { /* ignore */ }
    el.classList.add('is-active');
    var count = $('[data-preloader-count]', el);
    var bar = $('[data-preloader-bar]', el);
    var start = performance.now();
    var duration = 1300;
    var finished = false;

    (function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      count.textContent = Math.round(eased * 100);
      bar.style.transform = 'scaleX(' + eased + ')';
      if (t < 1) { requestAnimationFrame(tick); return; }
      if (finished) return;
      finished = true;
      el.classList.add('is-done');
      window.setTimeout(onDone, 250);
      window.setTimeout(function () { el.classList.remove('is-active', 'is-done'); }, 1100);
    })(start);
  }

  /* ---------- Hero ---------- */
  function heroSetup() {
    if (!animate) return;
    gsap.set('.hero-title .line-i', { yPercent: 115 });
    gsap.set('.polaroid', { y: 120, opacity: 0 });
    gsap.set('.hero-collage .sticker, .hero-collage .rotate-badge', { scale: 0 });
    gsap.set('[data-hero-fade]', { y: 24, opacity: 0 });
    gsap.set('.hero .scribble path, .hero .doodle path', { strokeDashoffset: 1 });
    gsap.set('.hero .doodle-note', { opacity: 0 });
  }

  function heroPlay() {
    if (!animate) return;
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to('.hero-title .line-i', { yPercent: 0, duration: 1.3, stagger: 0.12 }, 0)
      .to('.polaroid', { y: 0, opacity: 1, duration: 1.4, stagger: 0.12 }, 0.25)
      .to('.hero-collage .sticker, .hero-collage .rotate-badge', { scale: 1, duration: 0.9, stagger: 0.1, ease: 'back.out(2.2)' }, 0.75)
      .to('.hero .scribble path', { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, 0.9)
      .to('.hero .doodle path', { strokeDashoffset: 0, duration: 0.9, stagger: 0.25, ease: 'power2.inOut' }, 1.1)
      .to('.hero .doodle-note', { opacity: 1, duration: 0.6 }, 1.4)
      .to('[data-hero-fade]', { y: 0, opacity: 1, duration: 1, stagger: 0.08 }, 0.6);
  }

  function heroParallax() {
    var hero = $('[data-hero]');
    if (!hero || M.reduce) return;
    var spot = $('[data-spotlight]');

    // Mouse: each layer moves by its own depth
    if (M.finePointer && animate) {
      var layers = $$('[data-depth]', hero);
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        layers.forEach(function (el) {
          var d = parseFloat(el.getAttribute('data-depth')) || 1;
          gsap.to(el, { x: dx * d * 26, y: dy * d * 18, duration: 1.1, ease: 'power3.out', overwrite: 'auto' });
        });
        if (spot) {
          spot.style.setProperty('--spot-x', (dx + 0.5) * 100 + '%');
          spot.style.setProperty('--spot-y', (dy + 0.5) * 100 + '%');
        }
      });
    }

    if (!animate) return;
    // Scroll: layers drift at different speeds as the hero leaves
    $$('[data-speed]', hero).forEach(function (el) {
      gsap.to(el, {
        yPercent: parseFloat(el.getAttribute('data-speed')),
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
      });
    });
    gsap.to('.hero-title', {
      y: 90, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
    });
    gsap.to('[data-rotate] svg', {
      rotation: '+=240', ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  /* ---------- Marquee that reacts to scroll velocity ---------- */
  function marquees() {
    var rows = $$('[data-marquee]');
    rows.forEach(function (row, i) {
      var track = $('.bm-track', row);
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      row.appendChild(clone);
      row.style.setProperty('--marquee-duration', (i === 0 ? 42 : 55) + 's');
      if (row.getAttribute('data-marquee') === '-1') row.style.setProperty('--marquee-dir', 'reverse');
      if (!M.reduce) row.classList.add('is-ready');
    });
    if (M.reduce || !rows.length || !Element.prototype.getAnimations) return;

    var lastY = window.scrollY;
    var velocity = 0;
    (function loop() {
      var y = window.scrollY;
      var target = (y - lastY);
      lastY = y;
      velocity += (target - velocity) * 0.1;
      var boost = Math.min(Math.abs(velocity) / 6, 5);
      var dir = velocity < -0.5 ? -1 : 1;
      rows.forEach(function (row, i) {
        $$('.bm-track', row).forEach(function (t) {
          t.getAnimations().forEach(function (a) { a.playbackRate = (1 + boost) * dir; });
        });
        if (i === 0) row.style.transform = 'skewX(' + Math.max(-8, Math.min(8, -velocity * 0.4)) + 'deg)';
      });
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- Text: manifesto + headline reveals ---------- */
  function texts() {
    var manifesto = $('[data-manifesto]');
    if (manifesto && animate) {
      var words = M.splitWords(manifesto);
      gsap.fromTo(words, { opacity: 0.13 }, {
        opacity: 1, ease: 'none', stagger: 0.05,
        scrollTrigger: { trigger: manifesto, start: 'top 80%', end: 'bottom 45%', scrub: true }
      });
      gsap.from('.inline-pic', {
        scale: 0, rotation: -20, ease: 'back.out(2)', stagger: 0.2,
        scrollTrigger: { trigger: manifesto, start: 'top 70%', end: 'center 50%', scrub: true }
      });
    }

    if (!animate) return;
    $$('[data-split]').forEach(function (el) {
      var w = M.splitWords(el);
      gsap.from(w, {
        yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    ST.batch('[data-fade-up]', {
      start: 'top 90%',
      onEnter: function (batch) {
        gsap.fromTo(batch, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.1, overwrite: true });
      }
    });
    gsap.set('[data-fade-up]', { opacity: 0 });

    $$('[data-mask]').forEach(function (el) {
      var img = $('img', el);
      gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
      if (img) gsap.from(img, { scale: 1.35, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
    });
  }

  /* ---------- Exchange bridge ---------- */
  /*
   * Lane A: Aarav "Offers Graphic design"  → Priya "Wants Graphic design"
   * Lane B: Priya "Offers Video editing"   → Aarav "Wants Video editing"
   * Both lanes curve through the Barterly hub, forming an X — the exchange.
   * Endpoints are measured from the real rows (offsetTop, so GSAP transforms
   * during the pinned intro don't skew them) and recomputed on resize.
   * On stacked (mobile) layouts the lanes run vertically between the cards.
   */
  function exchangeBridge() {
    var bridge = $('[data-ex-bridge]');
    var stage = bridge && bridge.parentElement;
    if (!bridge || !stage) return;
    var svg = $('svg', bridge);
    var NS = 'http://www.w3.org/2000/svg';

    function el(name, attrs, parent) {
      var node = document.createElementNS(NS, name);
      Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(node);
      return node;
    }

    var lanes = [
      { key: 'a', from: $('[data-lane-a-from]'), to: $('[data-lane-a-to]'), label: 'Graphic design', icon: 'pen', at: 0.24 },
      { key: 'b', from: $('[data-lane-b-from]'), to: $('[data-lane-b-to]'), label: 'Video editing', icon: 'video', at: 0.24 }
    ];

    lanes.forEach(function (lane) {
      var g = el('g', { class: 'ex-lane ex-lane-' + lane.key }, svg);
      lane.rail = el('path', { class: 'ex-rail', pathLength: '1' }, g);
      lane.beam = el('path', { class: 'ex-beam', pathLength: '1000' }, g);
      lane.portFromRing = el('circle', { class: 'ex-port-ring', r: '9' }, g);
      lane.portFrom = el('circle', { class: 'ex-port', r: '5' }, g);
      lane.portToRing = el('circle', { class: 'ex-port-ring', r: '9' }, g);
      lane.portTo = el('circle', { class: 'ex-port', r: '5' }, g);
      lane.chip = document.createElement('span');
      lane.chip.className = 'ex-chip ex-chip-' + lane.key;
      lane.chip.innerHTML = '<i>' + SE.utils.icon(lane.icon) + '</i><span>' + lane.label + '</span>' +
        '<b class="ex-chip-dir">' + SE.utils.icon('arrow-right') + '</b>';
      bridge.appendChild(lane.chip);
    });

    // Position of an element's centre relative to the stage, ignoring transforms
    function offsetIn(node, ancestor) {
      var x = 0, y = 0, n = node;
      while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: x, y: y, w: node.offsetWidth, h: node.offsetHeight };
    }

    var hub = $('[data-ex-center]', bridge);
    var caption = $('.ex-hub-caption', bridge);

    function layout() {
      var w = bridge.clientWidth;
      var h = bridge.clientHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var b = offsetIn(bridge, stage);
      // Stacked when the first card sits above the bridge instead of beside it
      var cardA = $('[data-ex-a]');
      var ca = cardA ? offsetIn(cardA, stage) : null;
      var stacked = !ca || ca.y + ca.h <= b.y + 4 || !lanes.every(function (l) { return l.from && l.to; });
      var cx = w / 2;
      var cy = h / 2;

      // 1. endpoints
      lanes.forEach(function (lane, i) {
        if (!stacked) {
          var f = offsetIn(lane.from, stage);
          var t = offsetIn(lane.to, stage);
          var fromLeft = f.x < b.x;
          var gap = 14;
          lane.p0 = { x: fromLeft ? -gap : w + gap, y: f.y + f.h / 2 - b.y };
          lane.p1 = { x: fromLeft ? w + gap : -gap, y: t.y + t.h / 2 - b.y };
        } else {
          var top = -14, bottom = h + 14, xa = w * 0.32, xb = w * 0.68;
          lane.p0 = i === 0 ? { x: xa, y: top } : { x: xb, y: bottom };
          lane.p1 = i === 0 ? { x: xb, y: bottom } : { x: xa, y: top };
        }
      });

      // 2. the hub sits where the lanes cross: level with the skill rows
      if (!stacked) {
        cy = lanes.reduce(function (sum, l) { return sum + l.p0.y + l.p1.y; }, 0) / (lanes.length * 2);
        cy = Math.max(56, Math.min(h - 80, cy));
      }
      hub.style.top = cy + 'px';
      caption.style.top = (cy + 66) + 'px';

      // 3. lanes: endpoint → hub centre → endpoint, with smooth tangents
      lanes.forEach(function (lane, i) {
        var p0 = lane.p0, p1 = lane.p1, d;
        if (!stacked) {
          var k = (cx - p0.x) * 0.55;
          d = 'M ' + p0.x + ' ' + p0.y +
            ' C ' + (p0.x + k) + ' ' + p0.y + ', ' + (cx - k * 0.45) + ' ' + cy + ', ' + cx + ' ' + cy +
            ' S ' + (p1.x - k) + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
        } else {
          var kk = (cy - p0.y) * 0.55;
          d = 'M ' + p0.x + ' ' + p0.y +
            ' C ' + p0.x + ' ' + (p0.y + kk) + ', ' + cx + ' ' + (cy - kk * 0.45) + ', ' + cx + ' ' + cy +
            ' S ' + p1.x + ' ' + (p1.y - kk) + ', ' + p1.x + ' ' + p1.y;
        }
        lane.rail.setAttribute('d', d);
        lane.beam.setAttribute('d', d);
        [['portFrom', p0], ['portFromRing', p0], ['portTo', p1], ['portToRing', p1]].forEach(function (pair) {
          lane[pair[0]].setAttribute('cx', pair[1].x);
          lane[pair[0]].setAttribute('cy', pair[1].y);
        });

        // 4. label chip on the half of the lane that runs from the hub to the
        //    learner, centred between the hub and the learner's card
        var len = lane.rail.getTotalLength();
        // 60% of the way from the hub to the learner keeps it clear of the hub
        var hubR = 58;
        var target = stacked
          ? cy + Math.sign(p1.y - cy) * (hubR + (Math.abs(p1.y - cy) - hubR) * 0.5)
          : cx + Math.sign(p1.x - cx) * (hubR + (Math.abs(p1.x - cx) - hubR) * 0.5);
        var lo = len / 2, hi = len, pt = lane.rail.getPointAtLength(len * 0.75);
        for (var n = 0; n < 20; n++) {
          var mid = (lo + hi) / 2;
          pt = lane.rail.getPointAtLength(mid);
          var v = stacked ? pt.y : pt.x;
          var end = stacked ? p1.y : p1.x;
          var start = stacked ? cy : cx;
          var past = end > start ? v >= target : v <= target;
          if (past) hi = mid; else lo = mid;
        }
        lane.chip.style.left = pt.x + 'px';
        lane.chip.style.top = pt.y + 'px';
        // arrow inside the chip points towards the learner
        var dx = p1.x - cx, dy = p1.y - cy;
        var angle = Math.atan2(stacked ? dy : 0, stacked ? 0.0001 : dx) * 180 / Math.PI;
        lane.chip.style.setProperty('--dir', angle + 'deg');
      });
    }

    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
    else window.addEventListener('resize', layout);

    // Start the beams + row glows only once the scene is on screen
    var scene = $('[data-exchange]');
    if ('IntersectionObserver' in window && scene) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { scene.classList.toggle('is-flowing', e.isIntersecting); });
      }, { threshold: 0.25 }).observe(scene);
    } else if (scene) {
      scene.classList.add('is-flowing');
    }
  }

  /* ---------- Exchange: pinned scene ---------- */
  function exchange(mm) {
    var scene = $('[data-exchange]');
    if (!scene || !animate) return;

    mm.add(DESKTOP, function () {
      var tl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top top', end: '+=130%', scrub: 1, pin: true }
      });
      tl.from('[data-ex-a]', { xPercent: -60, rotation: -6, opacity: 0, duration: 1 }, 0)
        .from('[data-ex-b]', { xPercent: 60, rotation: 6, opacity: 0, duration: 1 }, 0)
        .from('[data-ex-center]', { scale: 0.4, opacity: 0, duration: 0.7 }, 0.45)
        .fromTo('.ex-rail', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, stagger: 0.15 }, 0.6)
        .from('.ex-port, .ex-port-ring', { opacity: 0, duration: 0.3 }, 0.6)
        .from('.ex-beam', { opacity: 0, duration: 0.3 }, 1.2)
        .from('.ex-chip', { opacity: 0, y: 10, duration: 0.4, stagger: 0.1 }, 1.1)
        .from('.ex-hub-caption', { opacity: 0, y: 10, duration: 0.4 }, 1.2)
        .from('[data-ex-outcome]', { y: 40, opacity: 0, duration: 0.6 }, 1.3);
    });

    mm.add('(max-width: 960px)', function () {
      gsap.from('[data-ex-a], [data-ex-b]', {
        y: 60, opacity: 0, duration: 1, stagger: 0.2, ease: 'expo.out',
        scrollTrigger: { trigger: '.exchange-stage', start: 'top 80%' }
      });
      gsap.fromTo('.ex-rail', { strokeDashoffset: 1 }, {
        strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut', stagger: 0.2,
        scrollTrigger: { trigger: '.ex-bridge', start: 'top 85%' }
      });
    });
  }

  /* ---------- How it works: horizontal scroll ---------- */
  function horizontal(mm) {
    var section = $('[data-how]');
    var track = $('[data-how-track]');
    if (!section || !track || !animate) return;
    var current = $('[data-how-current]');
    var bar = $('[data-how-bar]');

    mm.add(DESKTOP, function () {
      var distance = function () { return Math.max(0, track.scrollWidth - document.documentElement.clientWidth); };
      var tween = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: function () { return '+=' + distance(); },
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            var step = Math.min(4, 1 + Math.floor(self.progress * 4.2));
            current.textContent = '0' + step;
            bar.style.transform = 'scaleX(' + (0.2 + self.progress * 0.8) + ')';
          }
        }
      });

      $$('.how-media img', track).forEach(function (img) {
        gsap.fromTo(img, { xPercent: -7 }, {
          xPercent: 7, ease: 'none',
          scrollTrigger: { trigger: img.closest('.how-panel'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true }
        });
      });
      $$('.how-num', track).forEach(function (num) {
        gsap.from(num, {
          yPercent: 60, opacity: 0, ease: 'none',
          scrollTrigger: { trigger: num.closest('.how-panel'), containerAnimation: tween, start: 'left 90%', end: 'left 40%', scrub: true }
        });
      });
    });
  }

  /* ---------- Formats: sticky storytelling ---------- */
  function formats() {
    var steps = $$('[data-fmt-step]');
    var imgs = $$('.fmt-img');
    var badge = $('[data-fmt-badge]');
    var count = $('[data-fmt-count]');
    if (!steps.length || !('IntersectionObserver' in window)) return;
    var active = 0;

    function setActive(i) {
      if (i === active) return;
      imgs[active].classList.remove('is-active');
      imgs[active].classList.add('is-leaving');
      var prev = imgs[active];
      window.setTimeout(function () { prev.classList.remove('is-leaving'); }, 1000);
      imgs[i].classList.add('is-active');
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      badge.textContent = steps[i].getAttribute('data-label');
      count.textContent = i + 1;
      active = i;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(Number(entry.target.getAttribute('data-fmt-step')));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Categories: cursor preview + filter ---------- */
  function categories() {
    var list = $('[data-cat-list]');
    if (!list) return;
    var rows = $$('.cat-row', list);
    var preview = $('[data-cat-preview]');
    var img = preview && $('img', preview);

    if (preview && M.finePointer && !M.reduce) {
      var tx = 0, ty = 0, cx = 0, cy = 0, running = false, lastX = 0;
      var loop = function () {
        cx += (tx - cx) * 0.14;
        cy += (ty - cy) * 0.14;
        var rot = Math.max(-12, Math.min(12, (tx - lastX) * 0.4));
        lastX += (tx - lastX) * 0.2;
        preview.style.setProperty('--px', cx + 'px');
        preview.style.setProperty('--py', cy + 'px');
        preview.style.setProperty('--pr', rot + 'deg');
        if (running) requestAnimationFrame(loop);
      };
      list.addEventListener('pointerenter', function (e) {
        tx = cx = lastX = e.clientX; ty = cy = e.clientY;
        running = true;
        requestAnimationFrame(loop);
      });
      list.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; });
      list.addEventListener('pointerleave', function () {
        preview.classList.remove('is-visible');
        running = false;
      });
      rows.forEach(function (row) {
        row.addEventListener('pointerenter', function () {
          var src = row.getAttribute('data-preview');
          if (img.getAttribute('src') !== src) img.setAttribute('src', src);
          preview.classList.add('is-visible');
        });
      });
    }

    // Live filter
    var form = $('[data-cat-search]');
    var input = form && $('input', form);
    var status = $('#cat-search-status');
    var fallback = $('[data-category-fallback]', list);

    function filter(term, jump) {
      var q = term.trim().toLowerCase();
      rows.forEach(function (r) { r.classList.remove('is-match'); });
      list.classList.toggle('is-filtering', !!q);
      if (!q) { status.textContent = ''; return; }
      var words = q.split(/\s+/).filter(function (w) { return w.length > 1; });
      var matches = rows.filter(function (r) {
        if (r === fallback) return false;
        var hay = (r.getAttribute('data-keywords') + ' ' + r.textContent).toLowerCase();
        return words.some(function (w) { return hay.indexOf(w) !== -1; });
      });
      if (!matches.length && fallback) matches = [fallback];
      matches.forEach(function (r) { r.classList.add('is-match'); });
      status.textContent = matches[0] === fallback
        ? 'No category for “' + term.trim() + '” yet — add it as your own under “And much more”.'
        : matches.length + ' match' + (matches.length === 1 ? '' : 'es') + ' for “' + term.trim() + '”.';
      if (jump && matches[0]) M.scrollTo(matches[0], { offset: -200 });
    }

    if (form) {
      input.addEventListener('input', SE.utils.debounce(function () { filter(input.value, false); }, 120));
      form.addEventListener('submit', function (e) { e.preventDefault(); filter(input.value, true); });
    }
  }

  /* ---------- Number counters ---------- */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length || !('IntersectionObserver' in window) || M.reduce) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var to = Number(el.getAttribute('data-count'));
        var from = Number(el.getAttribute('data-count-from') || 0);
        var start = performance.now();
        var dur = 1600;
        (function tick(now) {
          var t = Math.min(1, (now - start) / dur);
          var e = 1 - Math.pow(1 - t, 4);
          el.textContent = Math.round(from + (to - from) * e);
          if (t < 1) requestAnimationFrame(tick);
        })(start);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) {
      el.textContent = el.getAttribute('data-count-from') || '0';
      io.observe(el);
    });
  }

  /* ---------- Scroll zoom, campus reveal, small parallax ---------- */
  function zooms(mm) {
    if (!animate) return;

    $$('[data-zoom]').forEach(function (el) {
      gsap.fromTo($('img', el), { scale: 1.3 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    var campus = $('[data-campus]');
    if (campus) {
      mm.add(DESKTOP, function () {
        var tl = gsap.timeline({
          scrollTrigger: { trigger: campus, start: 'top top', end: '+=110%', scrub: 1, pin: true }
        });
        tl.fromTo('[data-campus-frame]',
          { clipPath: 'inset(16% 24% 16% 24% round 28px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
          .fromTo('[data-campus-img]', { scale: 1.35 }, { scale: 1, ease: 'power2.inOut', duration: 1 }, 0)
          .from('[data-campus-title]', { scale: 0.55, opacity: 0, ease: 'power3.out', duration: 0.8 }, 0.25)
          .from('[data-campus-tag]', { y: 30, opacity: 0, duration: 0.4 }, 0.7);
      });
      mm.add('(max-width: 960px)', function () {
        gsap.fromTo('[data-campus-frame]',
          { clipPath: 'inset(10% 6% 10% 6% round 22px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: campus, start: 'top 80%', end: 'center center', scrub: true } });
      });
    }

    $$('[data-inner-parallax]').forEach(function (img) {
      gsap.fromTo(img, { yPercent: -12 }, {
        yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    $$('[data-float-scroll]').forEach(function (el) {
      gsap.to(el, {
        y: parseFloat(el.getAttribute('data-float-scroll')), ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    var cta = $('[data-cta-img]');
    if (cta) {
      gsap.fromTo(cta, { yPercent: -16 }, {
        yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }

    var mark = $('[data-wordmark]');
    if (mark) {
      gsap.from(mark, {
        yPercent: 55, opacity: 0.2, ease: 'none',
        scrollTrigger: { trigger: '.site-footer', start: 'top 85%', end: 'bottom bottom', scrub: true }
      });
    }

    gsap.from('.story', {
      y: 90, opacity: 0, rotation: function (i) { return i % 2 ? 6 : -6; },
      duration: 1.2, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: '.stories-rail', start: 'top 85%' }
    });
  }

  /* ---------- Stories: drag with inertia ---------- */
  function dragRail() {
    var rail = $('[data-drag]');
    if (!rail) return;
    var down = false, startX = 0, startLeft = 0, lastX = 0, v = 0, moved = 0, raf = 0;

    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return; // touch uses native scrolling
      down = true; moved = 0;
      startX = lastX = e.clientX;
      startLeft = rail.scrollLeft;
      v = 0;
      cancelAnimationFrame(raf);
      rail.classList.add('is-dragging');
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      rail.scrollLeft = startLeft - dx;
      v = e.clientX - lastX;
      lastX = e.clientX;
    });
    function end() {
      if (!down) return;
      down = false;
      rail.classList.remove('is-dragging');
      if (M.reduce) return;
      (function glide() {
        v *= 0.94;
        rail.scrollLeft -= v;
        if (Math.abs(v) > 0.4) raf = requestAnimationFrame(glide);
      })();
    }
    rail.addEventListener('pointerup', end);
    rail.addEventListener('pointercancel', end);
    rail.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);

    rail.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { rail.scrollBy({ left: 360, behavior: 'smooth' }); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { rail.scrollBy({ left: -360, behavior: 'smooth' }); e.preventDefault(); }
    });
  }

  /* ---------- FAQ: smooth accordion (one open at a time) ---------- */
  function accordion() {
    var items = $$('[data-accordion] .faq-item');
    items.forEach(function (item) {
      var summary = $('summary', item);
      var answer = $('.faq-answer', item);

      function close(it) {
        var a = $('.faq-answer', it);
        if (M.reduce || !a.animate) { it.open = false; return; }
        var h = a.offsetHeight;
        a.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(0.22,1,0.36,1)' })
          .onfinish = function () { it.open = false; };
      }

      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.open) { close(item); return; }
        items.forEach(function (other) { if (other !== item && other.open) close(other); });
        item.open = true;
        if (M.reduce || !answer.animate) return;
        var h = answer.offsetHeight;
        answer.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(0.22,1,0.36,1)' });
      });
    });
  }

  /* ---------- Boot ---------- */
  function init() {
    var mm = animate ? gsap.matchMedia() : null;
    heroSetup();
    marquees();
    exchangeBridge();
    formats();
    categories();
    counters();
    dragRail();
    accordion();

    if (animate) {
      heroParallax();
      texts();
      exchange(mm);
      horizontal(mm);
      zooms(mm);
      window.addEventListener('load', function () { ST.refresh(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
    } else {
      heroParallax();
    }

    preloader(heroPlay);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SE = window.SE || {});
