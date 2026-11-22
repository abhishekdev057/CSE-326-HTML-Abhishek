/* ==========================================================================
   Barterly — Utilities
   Small DOM helpers, toasts and an accessible modal used across pages.
   ========================================================================== */
(function (SE) {
  'use strict';

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function icon(name, extraClass) {
    return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  /* ---------- Toasts ---------- */
  function toastRegion() {
    var region = qs('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }

  /**
   * Show a short notification.
   * @param {string} message  plain text (escaped)
   * @param {object} [opts]   { type: 'success'|'error'|'info', title, duration }
   */
  function toast(message, opts) {
    opts = opts || {};
    var type = opts.type || 'info';
    var iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert' : 'info';
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = icon(iconName, 'toast-icon') +
      '<div class="toast-body">' +
      (opts.title ? '<strong>' + escapeHtml(opts.title) + '</strong>' : '') +
      '<span>' + escapeHtml(message) + '</span></div>' +
      '<button class="toast-close" type="button" aria-label="Dismiss">' + icon('x') + '</button>';

    var region = toastRegion();
    region.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-visible'); });

    function close() {
      el.classList.remove('is-visible');
      window.setTimeout(function () { el.remove(); }, 300);
    }
    el.querySelector('.toast-close').addEventListener('click', close);
    window.setTimeout(close, opts.duration || 4500);
    return close;
  }

  /* ---------- Modal ---------- */
  /**
   * Open a dialog. Returns { el, close }.
   * @param {object} opts { title, html, onClose, labelledBy }
   */
  function modal(opts) {
    var previous = document.activeElement;
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<button class="modal-close icon-button" type="button" aria-label="Close">' + icon('x') + '</button>' +
      (opts.title ? '<h2 class="modal-title" id="modal-title">' + escapeHtml(opts.title) + '</h2>' : '') +
      '<div class="modal-content">' + (opts.html || '') + '</div></div>';

    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

    var dialog = backdrop.querySelector('.modal');

    function focusables() {
      return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dialog)
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    }

    function onKey(event) {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('is-open');
      document.body.classList.remove('modal-open');
      window.setTimeout(function () { backdrop.remove(); }, 250);
      if (previous && previous.focus) previous.focus();
      if (opts.onClose) opts.onClose();
    }

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) close();
    });
    backdrop.querySelector('.modal-close').addEventListener('click', close);

    window.setTimeout(function () {
      var items = focusables();
      (items[1] || items[0] || dialog).focus();
    }, 50);

    return { el: dialog, close: close };
  }

  /* ---------- Images ---------- */
  /** Resize an uploaded image File to a square JPEG data URL (keeps storage small). */
  function resizeImage(file, size) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that image.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not read that image.')); };
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          var ctx = canvas.getContext('2d');
          var side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  SE.utils = {
    qs: qs,
    qsa: qsa,
    debounce: debounce,
    escapeHtml: escapeHtml,
    initials: initials,
    icon: icon,
    toast: toast,
    modal: modal,
    resizeImage: resizeImage
  };
})(window.SE = window.SE || {});
