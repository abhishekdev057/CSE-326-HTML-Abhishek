/* ==========================================================================
   Barterly — Shared auth-page widgets (sign in + sign up)
   Field errors, password reveal, phone formatting, OTP boxes, countdowns
   and the rotating image/quote panel.
   ========================================================================== */
(function (SE) {
  'use strict';

  var U = SE.utils;

  /* ---------- Field errors ---------- */
  function errorEl(input) {
    var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      var el = ids[i] && document.getElementById(ids[i]);
      if (el && el.classList.contains('field-error')) return el;
    }
    var field = input.closest('.field');
    return field ? field.querySelector('.field-error') : null;
  }

  function setError(input, message) {
    if (!input) return;
    var el = errorEl(input);
    input.setAttribute('aria-invalid', 'true');
    if (el) {
      el.innerHTML = U.icon('alert') + '<span>' + U.escapeHtml(message) + '</span>';
      el.hidden = false;
    }
  }

  function clearError(input) {
    if (!input) return;
    var el = errorEl(input);
    input.removeAttribute('aria-invalid');
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function showFormError(form, message) {
    var box = form.querySelector('[data-form-error]');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      return;
    }
    box.innerHTML = U.icon('alert') + '<span>' + U.escapeHtml(message) + '</span>';
    box.hidden = false;
  }

  /* Clear an input's error as soon as the user edits it */
  document.addEventListener('input', function (event) {
    var t = event.target;
    if (t && t.getAttribute && t.getAttribute('aria-invalid') === 'true') clearError(t);
  });

  /* ---------- Button loading state ---------- */
  function setLoading(button, loading, label) {
    if (!button) return;
    var labelEl = button.querySelector('.button-label');
    if (loading) {
      button.dataset.label = labelEl ? labelEl.textContent : '';
      button.classList.add('is-loading');
      button.disabled = true;
      if (labelEl && label) labelEl.textContent = label;
      if (!button.querySelector('.spinner')) button.insertAdjacentHTML('afterbegin', '<span class="spinner" aria-hidden="true"></span>');
    } else {
      button.classList.remove('is-loading');
      button.disabled = false;
      if (labelEl && button.dataset.label) labelEl.textContent = button.dataset.label;
      var sp = button.querySelector('.spinner');
      if (sp) sp.remove();
    }
  }

  /* ---------- Password visibility ---------- */
  function initPasswordToggles(scope) {
    U.qsa('[data-toggle-password]', scope).forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-toggle-password'));
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.innerHTML = U.icon(show ? 'eye-off' : 'eye');
        input.focus();
      });
    });
  }

  /* ---------- Phone input: digits only, formatted "98765 43210" ---------- */
  function initPhoneInput(input) {
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '');
      if (d.length > 10 && d.indexOf('91') === 0) d = d.slice(2);
      d = d.slice(0, 10);
      input.value = d.length > 5 ? d.slice(0, 5) + ' ' + d.slice(5) : d;
    });
  }

  /* ---------- OTP boxes ---------- */
  function otpWidget(container, opts) {
    opts = opts || {};
    var length = opts.length || 6;
    container.innerHTML = '';
    var inputs = [];
    for (var i = 0; i < length; i++) {
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 1;
      input.autocomplete = i === 0 ? 'one-time-code' : 'off';
      input.setAttribute('aria-label', 'Digit ' + (i + 1) + ' of ' + length);
      container.appendChild(input);
      inputs.push(input);
    }

    function value() { return inputs.map(function (x) { return x.value; }).join(''); }

    function setState(state) {
      container.classList.toggle('is-error', state === 'error');
      container.classList.toggle('is-success', state === 'success');
    }

    function fill(digits, start) {
      digits = String(digits).replace(/\D/g, '');
      for (var k = 0; k < digits.length && start + k < length; k++) inputs[start + k].value = digits.charAt(k);
      var next = Math.min(start + digits.length, length - 1);
      inputs[next].focus();
      if (value().length === length && opts.onComplete) opts.onComplete(value());
    }

    inputs.forEach(function (input, index) {
      input.addEventListener('input', function () {
        setState('');
        var d = input.value.replace(/\D/g, '');
        if (!d) { input.value = ''; return; }
        if (d.length > 1) { input.value = ''; fill(d, index); return; }
        input.value = d;
        if (index < length - 1) inputs[index + 1].focus();
        if (value().length === length && opts.onComplete) opts.onComplete(value());
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Backspace' && !input.value && index > 0) {
          inputs[index - 1].value = '';
          inputs[index - 1].focus();
          event.preventDefault();
        } else if (event.key === 'ArrowLeft' && index > 0) {
          inputs[index - 1].focus();
        } else if (event.key === 'ArrowRight' && index < length - 1) {
          inputs[index + 1].focus();
        }
      });
      input.addEventListener('paste', function (event) {
        var text = (event.clipboardData || window.clipboardData).getData('text');
        if (/\d/.test(text)) {
          event.preventDefault();
          fill(text, index);
        }
      });
      input.addEventListener('focus', function () { input.select(); });
    });

    return {
      value: value,
      setState: setState,
      clear: function () { inputs.forEach(function (x) { x.value = ''; }); setState(''); },
      focus: function () { inputs[0].focus(); },
      fill: function (code) { fill(code, 0); }
    };
  }

  /* ---------- Countdown (resend timer) ---------- */
  function countdown(untilMs, onTick, onDone) {
    var timer;
    function tick() {
      var left = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
      onTick(left);
      if (left <= 0) {
        window.clearInterval(timer);
        if (onDone) onDone();
      }
    }
    tick();
    timer = window.setInterval(tick, 500);
    return function stop() { window.clearInterval(timer); };
  }

  /* ---------- Demo OTP display ---------- */
  function showDemoOtp(box, code, onUse) {
    if (!box) return;
    box.innerHTML = U.icon('info') +
      '<span>Demo SMS: your Barterly code is <strong>' + U.escapeHtml(code) + '</strong>. ' +
      'A real app would text this to your phone.</span>' +
      '<button class="link-button" type="button">Auto-fill</button>';
    box.hidden = false;
    box.querySelector('button').addEventListener('click', function () { onUse(code); });
  }

  /* ---------- Rotating quotes (and optional slides) ---------- */
  function initSlides() {
    var slides = U.qsa('[data-slides] .auth-slide');
    var quotes = U.qsa('.auth-quote-item');
    var dots = U.qsa('[data-slide-to]');
    var count = Math.max(slides.length, quotes.length);
    if (count < 2) return;
    var index = 0;
    var timer;

    function go(i) {
      index = (i + count) % count;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === index); });
      quotes.forEach(function (q, k) { q.classList.toggle('is-active', k === index); });
      dots.forEach(function (d, k) { d.setAttribute('aria-selected', String(k === index)); });
    }

    function start() {
      window.clearInterval(timer);
      timer = window.setInterval(function () { go(index + 1); }, 6000);
    }

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        go(Number(dot.getAttribute('data-slide-to')));
        start();
      });
    });

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) start();
  }

  /* ---------- Visual panel: mouse parallax + spotlight + entrance ---------- */
  function initVisual() {
    var panel = U.qs('[data-av]');
    var M = SE.motion || {};
    var gsap = window.gsap;
    var animate = !!gsap && !M.reduce;

    if (panel && M.finePointer && !M.reduce) {
      var spot = U.qs('[data-av-spot]', panel);
      var layers = U.qsa('[data-depth]', panel);
      panel.addEventListener('pointermove', function (e) {
        var r = panel.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        if (spot) {
          spot.style.setProperty('--sx', (dx + 0.5) * 100 + '%');
          spot.style.setProperty('--sy', (dy + 0.5) * 100 + '%');
        }
        if (!gsap) return;
        layers.forEach(function (el) {
          var d = parseFloat(el.getAttribute('data-depth')) || 1;
          gsap.to(el, { x: dx * d * 30, y: dy * d * 22, duration: 1.1, ease: 'power3.out', overwrite: 'auto' });
        });
      });
    }

    if (!animate) return;
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: M.arrived ? 0.35 : 0.05 });
    if (panel) {
      tl.from(U.qsa('.av-collage .polaroid, .sv-photos', panel), {
        y: 140, opacity: 0, rotation: function (i) { return i % 2 ? 14 : -14; }, duration: 1.3, stagger: 0.12
      }, 0)
        .from(U.qsa('.sticker, .rotate-badge', panel), { scale: 0, duration: 0.9, stagger: 0.1, ease: 'back.out(2.2)' }, 0.5)
        .from(U.qsa('.av-wordmark', panel), { yPercent: 70, opacity: 0, duration: 1.4 }, 0.2)
        .from(U.qsa('.auth-quote, .signup-visual-copy, .stepper, .sv-num', panel), { y: 30, opacity: 0, duration: 1, stagger: 0.08 }, 0.4);
    }

    var title = U.qs('[data-enter-title]');
    if (title && M.splitWords) {
      tl.from(M.splitWords(title), { yPercent: 115, duration: 1.1, stagger: 0.08 }, 0.15);
    }
    var items = U.qsa('[data-enter]');
    if (items.length) tl.from(items, { y: 26, opacity: 0, duration: 0.9, stagger: 0.06 }, 0.25);

    var firstStep = U.qs('.step.is-active');
    if (firstStep) {
      tl.from(U.qsa('.step-head > *, .method-card', firstStep), { y: 26, opacity: 0, duration: 0.9, stagger: 0.06 }, 0.25);
    }
  }

  function initGoogleNote() {
    U.qsa('[data-google-mode-note]').forEach(function (el) {
      el.textContent = SE.auth.googleMode() === 'live'
        ? 'Google Sign-In is connected.'
        : 'Google runs in demo mode until a client ID is added.';
    });
  }

  SE.authUI = {
    setError: setError,
    clearError: clearError,
    showFormError: showFormError,
    setLoading: setLoading,
    initPasswordToggles: initPasswordToggles,
    initPhoneInput: initPhoneInput,
    otpWidget: otpWidget,
    countdown: countdown,
    showDemoOtp: showDemoOtp,
    initSlides: initSlides,
    initVisual: initVisual,
    initGoogleNote: initGoogleNote
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVisual);
  else initVisual();
})(window.SE = window.SE || {});
