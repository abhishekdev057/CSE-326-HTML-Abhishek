/* ==========================================================================
   Barterly — App bootstrap (shared by every page)

   Theme rules
   • First visit: follow the operating-system preference ("system").
   • When the user picks Light, Dark or System, that choice is saved to
     localStorage ("ss-theme") together with the accent colour ("ss-accent"),
     so every page opens exactly where they left off.
   • The <head> of each page applies the saved values before first paint.
   ========================================================================== */
(function (SE) {
  'use strict';

  var root = document.documentElement;
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MODES = ['light', 'dark', 'system'];
  var ACCENTS = ['barterly', 'saffron', 'indigo', 'ocean', 'emerald', 'violet', 'rose', 'amber'];

  /* ---------- Theme ---------- */
  function getMode() {
    var saved = SE.storage.get('theme', 'system');
    return MODES.indexOf(saved) === -1 ? 'system' : saved;
  }

  function resolve(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  function syncThemeControls(mode) {
    var resolved = resolve(mode);
    document.querySelectorAll('[data-theme-option]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-option') === mode));
    });
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0a0e1a' : '#fafbfe');
  }

  function applyTheme(mode) {
    root.setAttribute('data-theme', resolve(mode));
    syncThemeControls(mode);
  }

  /**
   * Run a visual change with a circular reveal that grows from the element
   * the user clicked (View Transitions API). Falls back to an instant change.
   */
  function withReveal(origin, change) {
    if (!document.startViewTransition || reduceMotion) {
      change();
      return;
    }
    if (origin && origin.getBoundingClientRect) {
      var r = origin.getBoundingClientRect();
      root.style.setProperty('--vt-x', Math.round(r.left + r.width / 2) + 'px');
      root.style.setProperty('--vt-y', Math.round(r.top + r.height / 2) + 'px');
    }
    document.startViewTransition(change);
  }

  function setMode(mode, origin) {
    if (MODES.indexOf(mode) === -1) return;
    SE.storage.set('theme', mode);
    var before = root.getAttribute('data-theme');
    if (before === resolve(mode)) {
      syncThemeControls(mode);
      return;
    }
    withReveal(origin, function () { applyTheme(mode); });
  }

  /* ---------- Accent ---------- */
  function getAccent() {
    var saved = SE.storage.get('accent', 'barterly');
    return ACCENTS.indexOf(saved) === -1 ? 'barterly' : saved;
  }

  function applyAccent(accent) {
    if (accent === 'barterly') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', accent);

    document.querySelectorAll('[data-accent-option]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-accent-option') === accent));
    });
  }

  function setAccent(accent, origin) {
    if (ACCENTS.indexOf(accent) === -1) return;
    SE.storage.set('accent', accent);
    if (accent === getAccentApplied()) return;
    withReveal(origin, function () { applyAccent(accent); });
  }

  function getAccentApplied() {
    return root.getAttribute('data-accent') || 'barterly';
  }

  function initThemeControls() {
    applyTheme(getMode());
    applyAccent(getAccent());

    // Follow the OS while the user is on "System"
    if (darkQuery) {
      var onChange = function () {
        if (getMode() === 'system') applyTheme('system');
      };
      if (darkQuery.addEventListener) darkQuery.addEventListener('change', onChange);
      else if (darkQuery.addListener) darkQuery.addListener(onChange);
    }

    // Keep other open tabs in sync
    window.addEventListener('storage', function (event) {
      if (event.key === 'ss-theme') applyTheme(getMode());
      if (event.key === 'ss-accent') applyAccent(getAccent());
    });

    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', btn);
      });
    });

    document.querySelectorAll('[data-theme-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.getAttribute('data-theme-option'), btn);
      });
    });

    document.querySelectorAll('[data-accent-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setAccent(btn.getAttribute('data-accent-option'), btn);
      });
    });

    initPopover();
  }

  function initPopover() {
    var picker = document.querySelector('[data-theme-picker]');
    if (!picker) return;
    var button = picker.querySelector('[data-theme-picker-button]');
    var popover = picker.querySelector('.theme-popover');

    function setOpen(open) {
      popover.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!popover.classList.contains('is-open'));
    });

    document.addEventListener('click', function (event) {
      if (!picker.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && popover.classList.contains('is-open')) {
        setOpen(false);
        button.focus();
      }
    });
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    var items = document.querySelectorAll('[data-reveal]');

    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* ---------- Back to top ---------- */
  function initBackToTop() {
    var btn = document.querySelector('[data-back-to-top]');
    if (!btn) return;
    var update = function () {
      btn.classList.toggle('is-visible', window.scrollY > 700);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* Show a message handed over from the previous page (e.g. "Welcome back"). */
  function initFlash() {
    var flash = SE.storage.getJSON('flash', null);
    if (!flash || !SE.utils) return;
    SE.storage.remove('flash');
    window.setTimeout(function () {
      SE.utils.toast(flash.message, { type: flash.type || 'success', title: flash.title });
    }, 400);
  }

  SE.theme = { setMode: setMode, setAccent: setAccent, getMode: getMode, getAccent: getAccent };

  function init() {
    initThemeControls();
    if (SE.navigation) SE.navigation.init();
    if (SE.auth) SE.auth.renderHeader();
    initReveal();
    initBackToTop();
    initYear();
    initFlash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SE = window.SE || {});
