/* ==========================================================================
   Barterly — Authentication (front-end prototype)

   Three ways in:
     1. Username (or email) + password
     2. Google  — real Google Identity Services when CONFIG.googleClientId is
                  set, otherwise a clearly-labelled demo account chooser
     3. Mobile OTP — a 6-digit code (demo: shown on screen; production would
                  send it by SMS from a server, e.g. Firebase Phone Auth)

   There is no backend yet, so accounts live in this browser's localStorage.
   Passwords are never stored in plain text: they are salted and hashed with
   PBKDF2-SHA-256 (Web Crypto). A real deployment must move all of this to a
   server, verify Google ID tokens server-side and send OTPs over SMS.
   ========================================================================== */
(function (SE) {
  'use strict';

  var CONFIG = {
    /* Paste a Google OAuth 2.0 "Web application" client ID here to enable real
       Google Sign-In. Create one at https://console.cloud.google.com/apis/credentials
       and add http://127.0.0.1:5500 and http://localhost:5500 as
       "Authorised JavaScript origins". Leave empty to use demo mode. */
    googleClientId: '',
    otpLength: 6,
    otpTtlMs: 5 * 60 * 1000,
    otpResendMs: 30 * 1000,
    otpMaxAttempts: 5,
    pbkdf2Iterations: 120000
  };

  var USERS_KEY = 'users';
  var SESSION_KEY = 'session';
  var u = function () { return SE.utils; };

  /* ---------- sessionStorage helpers (per-tab data) ---------- */
  function sGet(key) {
    try { return JSON.parse(window.sessionStorage.getItem('ss-' + key)); } catch (e) { return null; }
  }
  function sSet(key, value) {
    try { window.sessionStorage.setItem('ss-' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function sRemove(key) {
    try { window.sessionStorage.removeItem('ss-' + key); } catch (e) { /* ignore */ }
  }

  /* ---------- Normalisers & validators ---------- */
  function normEmail(value) { return String(value || '').trim().toLowerCase(); }
  function normUsername(value) { return String(value || '').trim().toLowerCase(); }

  /** Returns a 10-digit Indian mobile number or '' when invalid. */
  function normPhone(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : '';
  }

  function formatPhone(phone) {
    var p = normPhone(phone);
    return p ? '+91 ' + p.slice(0, 5) + ' ' + p.slice(5) : '';
  }

  function maskPhone(phone) {
    var p = normPhone(phone);
    return p ? '+91 ' + p.slice(0, 2) + '••• ••' + p.slice(7) : '';
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
  }

  function isUsername(value) {
    return /^[a-z0-9_]{3,20}$/.test(normUsername(value));
  }

  /** Simple strength score 0–4 plus which rules pass. */
  function passwordStrength(pw) {
    pw = String(pw || '');
    var checks = {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw) && /[a-z]/.test(pw),
      number: /\d/.test(pw),
      symbol: /[^A-Za-z0-9]/.test(pw)
    };
    var score = 0;
    Object.keys(checks).forEach(function (k) { if (checks[k]) score += 1; });
    if (pw.length >= 12 && score >= 3) score = Math.min(4, score + 1);
    if (!checks.length) score = Math.min(score, 1);
    var labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score: score, label: labels[score], checks: checks };
  }

  /* ---------- Users ---------- */
  function listUsers() { return SE.storage.getJSON(USERS_KEY, []); }
  function saveUsers(list) { return SE.storage.setJSON(USERS_KEY, list); }

  function findBy(field, value, normaliser) {
    var v = normaliser(value);
    if (!v) return null;
    return listUsers().filter(function (user) { return normaliser(user[field]) === v; })[0] || null;
  }

  function findByEmail(email) { return findBy('email', email, normEmail); }
  function findByUsername(name) { return findBy('username', name, normUsername); }
  function findByPhone(phone) { return findBy('phone', phone, normPhone); }
  function findByGoogleId(sub) { return findBy('googleId', sub, function (x) { return String(x || ''); }); }
  function findById(id) { return findBy('id', id, function (x) { return String(x || ''); }); }

  /** Username or email → user */
  function findByLogin(identifier) {
    var id = String(identifier || '').trim();
    return id.indexOf('@') !== -1 ? findByEmail(id) : findByUsername(id.replace(/^@/, ''));
  }

  /* ---------- Hashing ---------- */
  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(arr);
    else for (var i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function randomDigits(length) {
    var out = '';
    var arr = new Uint32Array(length);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(arr);
    for (var i = 0; i < length; i++) out += String((arr[i] || Math.floor(Math.random() * 1e9)) % 10);
    return out;
  }

  function subtleAvailable() {
    return !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false);
  }

  /** Fallback for contexts without Web Crypto (e.g. some file:// setups). Not secure — demo only. */
  function fallbackHash(text) {
    var h1 = 0xdeadbeef;
    var h2 = 0x41c6ce57;
    for (var round = 0; round < 2000; round++) {
      for (var i = 0; i < text.length; i++) {
        var ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    }
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }

  function hashPassword(password, salt, algo) {
    algo = algo || (subtleAvailable() ? 'pbkdf2' : 'fallback');
    if (algo === 'fallback') {
      return Promise.resolve({ algo: 'fallback', hash: fallbackHash(salt + ':' + password) });
    }
    if (!subtleAvailable()) {
      return Promise.reject(new Error('Open Barterly through the local server to sign in with this password.'));
    }
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return window.crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations: CONFIG.pbkdf2Iterations, hash: 'SHA-256' },
          key, 256);
      })
      .then(function (bits) {
        var hex = Array.prototype.map.call(new Uint8Array(bits), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
        return { algo: 'pbkdf2', hash: hex };
      });
  }

  /* ---------- Account creation & sign-in ---------- */
  function AuthError(message, field) {
    var err = new Error(message);
    err.field = field;
    return err;
  }

  /**
   * Create an account. `profile` holds everything collected at sign-up.
   * Pass `password` only for username/password accounts.
   */
  function createUser(profile, password) {
    if (profile.email && findByEmail(profile.email)) {
      return Promise.reject(AuthError('An account with this email already exists.', 'email'));
    }
    if (profile.username && findByUsername(profile.username)) {
      return Promise.reject(AuthError('That username is taken.', 'username'));
    }
    if (profile.phone && findByPhone(profile.phone)) {
      return Promise.reject(AuthError('This mobile number is already registered.', 'phone'));
    }
    if (profile.googleId && findByGoogleId(profile.googleId)) {
      return Promise.reject(AuthError('This Google account is already registered.', 'google'));
    }

    var user = JSON.parse(JSON.stringify(profile));
    user.id = 'u_' + Date.now().toString(36) + randomHex(4);
    user.email = normEmail(user.email);
    user.username = user.username ? normUsername(user.username) : '';
    user.phone = normPhone(user.phone);
    user.createdAt = new Date().toISOString();

    var withPassword = password
      ? (function () {
        var salt = randomHex(16);
        return hashPassword(password, salt).then(function (h) {
          user.auth = { salt: salt, algo: h.algo, hash: h.hash };
        });
      })()
      : Promise.resolve();

    return withPassword.then(function () {
      var list = listUsers();
      list.push(user);
      if (!saveUsers(list)) {
        throw AuthError('Could not save your account — browser storage is full or blocked.');
      }
      return user;
    });
  }

  function verifyPassword(user, password) {
    if (!user || !user.auth) return Promise.resolve(false);
    return hashPassword(password, user.auth.salt, user.auth.algo).then(function (h) {
      return h.hash === user.auth.hash;
    });
  }

  function signInWithPassword(identifier, password) {
    var user = findByLogin(identifier);
    if (!user) {
      return Promise.reject(AuthError('We couldn’t find an account with that username or email.', 'identifier'));
    }
    if (!user.auth) {
      var via = user.googleId ? 'Google' : 'mobile OTP';
      return Promise.reject(AuthError('This account doesn’t use a password. Sign in with ' + via + ' instead.', 'identifier'));
    }
    return verifyPassword(user, password).then(function (ok) {
      if (!ok) throw AuthError('Incorrect password. Please try again.', 'password');
      return user;
    });
  }

  function updateUser(id, patch) {
    var list = listUsers();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.keys(patch).forEach(function (k) { list[i][k] = patch[k]; });
        saveUsers(list);
        return list[i];
      }
    }
    return null;
  }

  /* ---------- Session ---------- */
  function startSession(user, method, remember) {
    var session = { userId: user.id, method: method, at: Date.now() };
    if (remember === false) {
      sSet(SESSION_KEY, session);
      SE.storage.remove(SESSION_KEY);
    } else {
      SE.storage.setJSON(SESSION_KEY, session);
      sRemove(SESSION_KEY);
    }
    SE.storage.set('last-method', method);
    updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  }

  function currentUser() {
    var session = SE.storage.getJSON(SESSION_KEY, null) || sGet(SESSION_KEY);
    return session ? findById(session.userId) : null;
  }

  function signOut() {
    SE.storage.remove(SESSION_KEY);
    sRemove(SESSION_KEY);
  }

  /* ---------- Mobile OTP ---------- */
  function sendOtp(phone) {
    var p = normPhone(phone);
    if (!p) return Promise.reject(AuthError('Enter a valid 10-digit Indian mobile number.', 'phone'));

    var existing = sGet('otp');
    if (existing && existing.phone === p && Date.now() - existing.sentAt < CONFIG.otpResendMs) {
      var wait = Math.ceil((CONFIG.otpResendMs - (Date.now() - existing.sentAt)) / 1000);
      return Promise.reject(AuthError('Please wait ' + wait + 's before requesting another code.', 'phone'));
    }

    var record = {
      phone: p,
      code: randomDigits(CONFIG.otpLength),
      sentAt: Date.now(),
      expires: Date.now() + CONFIG.otpTtlMs,
      attempts: 0
    };
    sSet('otp', record);

    // Simulated network delay. A real app would POST to a server that sends an SMS.
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({ phone: p, code: record.code, expiresAt: record.expires, resendAt: record.sentAt + CONFIG.otpResendMs });
      }, 700);
    });
  }

  function verifyOtp(phone, code) {
    var p = normPhone(phone);
    var rec = sGet('otp');
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        if (!rec || rec.phone !== p) return reject(AuthError('Request a code for this number first.', 'otp'));
        if (Date.now() > rec.expires) {
          sRemove('otp');
          return reject(AuthError('This code has expired. Request a new one.', 'otp'));
        }
        if (rec.attempts >= CONFIG.otpMaxAttempts) {
          sRemove('otp');
          return reject(AuthError('Too many incorrect attempts. Request a new code.', 'otp'));
        }
        if (String(code) !== rec.code) {
          rec.attempts += 1;
          sSet('otp', rec);
          var left = CONFIG.otpMaxAttempts - rec.attempts;
          return reject(AuthError('Incorrect code. ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left.', 'otp'));
        }
        sRemove('otp');
        resolve({ phone: p });
      }, 500);
    });
  }

  /* ---------- Google ---------- */
  function googleMode() { return CONFIG.googleClientId ? 'live' : 'demo'; }

  function decodeJwt(token) {
    var part = String(token).split('.')[1] || '';
    var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var json = decodeURIComponent(Array.prototype.map.call(window.atob(b64), function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(json);
  }

  var gsiPromise = null;
  function loadGsi() {
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { gsiPromise = null; reject(new Error('Could not load Google Sign-In.')); };
      document.head.appendChild(script);
    });
    return gsiPromise;
  }

  /**
   * Turn `container` into a Google sign-in control.
   * onProfile({ sub, name, email, picture, emailVerified, demo }) is called on success.
   */
  function mountGoogleButton(container, onProfile, opts) {
    opts = opts || {};
    if (!container) return;

    if (googleMode() === 'live') {
      loadGsi().then(function () {
        window.google.accounts.id.initialize({
          client_id: CONFIG.googleClientId,
          callback: function (response) {
            // NOTE: a backend must verify this ID token before trusting it.
            var p = decodeJwt(response.credential);
            onProfile({ sub: p.sub, name: p.name, email: p.email, picture: p.picture, emailVerified: !!p.email_verified, demo: false });
          },
          ux_mode: 'popup'
        });
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: opts.text || 'continue_with',
          width: Math.min(400, container.offsetWidth || 360)
        });
      }).catch(function (err) {
        u().toast(err.message, { type: 'error' });
      });
      return;
    }

    var button = container.querySelector('[data-google-demo]');
    if (button) {
      button.addEventListener('click', function () { openDemoGoogle(onProfile); });
    }
  }

  function googleLogo() {
    return '<svg class="google-logo" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>' +
      '<path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>' +
      '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>' +
      '<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>' +
      '</svg>';
  }

  /** Demo stand-in for Google's account chooser (used when no client ID is configured). */
  function openDemoGoogle(onProfile) {
    var esc = u().escapeHtml;
    var demo = { name: 'Demo Student', email: 'demo.student@example.com' };
    var dlg = u().modal({
      title: 'Choose an account',
      html:
        '<div class="gchooser">' +
        '<div class="gchooser-head">' + googleLogo() + '<p>to continue to <strong>Barterly</strong></p></div>' +
        '<p class="gchooser-note">' + u().icon('info') + ' Demo mode — no Google client ID is configured, so no real Google account is used.</p>' +
        '<button type="button" class="gchooser-account" data-demo-account>' +
        '<span class="gchooser-avatar">DS</span><span><strong>' + esc(demo.name) + '</strong><small>' + esc(demo.email) + '</small></span>' +
        u().icon('arrow-right') + '</button>' +
        '<form class="gchooser-form" novalidate>' +
        '<p class="gchooser-sub">Or use another account</p>' +
        '<label class="field"><span class="field-label">Full name</span>' +
        '<input class="input" name="gname" autocomplete="name" placeholder="e.g. Ananya Sharma" required></label>' +
        '<label class="field"><span class="field-label">Email</span>' +
        '<input class="input" name="gemail" type="email" autocomplete="email" placeholder="you@gmail.com" required></label>' +
        '<p class="field-error" data-gerror hidden></p>' +
        '<button class="button button-primary" type="submit">Continue</button>' +
        '</form></div>'
    });

    function finish(name, email) {
      var el = dlg.el;
      el.classList.add('is-loading');
      el.querySelector('.modal-content').innerHTML =
        '<div class="gchooser-loading">' + googleLogo() + '<span class="spinner" aria-hidden="true"></span><p>Signing in as ' + esc(email) + '…</p></div>';
      window.setTimeout(function () {
        dlg.close();
        onProfile({
          sub: 'demo-' + fallbackHash(normEmail(email)),
          name: name,
          email: normEmail(email),
          picture: '',
          emailVerified: true,
          demo: true
        });
      }, 900);
    }

    dlg.el.querySelector('[data-demo-account]').addEventListener('click', function () {
      finish(demo.name, demo.email);
    });

    dlg.el.querySelector('.gchooser-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var name = this.gname.value.trim();
      var email = this.gemail.value.trim();
      var error = dlg.el.querySelector('[data-gerror]');
      if (name.length < 2 || !isEmail(email)) {
        error.textContent = 'Enter your name and a valid email address.';
        error.hidden = false;
        return;
      }
      finish(name, email);
    });
  }

  /* ---------- Hand-off between sign-in and sign-up ---------- */
  function setPendingSignup(data) { sSet('pending-signup', data); }
  function takePendingSignup() {
    var data = sGet('pending-signup');
    sRemove('pending-signup');
    return data;
  }

  /* ---------- Header: guest vs signed-in ---------- */
  function renderHeader() {
    var user = currentUser();
    u().qsa('[data-auth="guest"]').forEach(function (el) { el.hidden = !!user; });
    u().qsa('[data-auth="user"]').forEach(function (el) { el.hidden = !user; });
    if (!user) return;

    u().qsa('[data-user-name]').forEach(function (el) { el.textContent = user.name || user.username || 'Member'; });
    u().qsa('[data-user-first]').forEach(function (el) { el.textContent = String(user.name || user.username || 'there').split(' ')[0]; });
    u().qsa('[data-user-sub]').forEach(function (el) {
      el.textContent = user.email || formatPhone(user.phone) || ('@' + user.username);
    });
    u().qsa('[data-user-avatar]').forEach(function (el) {
      el.innerHTML = user.photo
        ? '<img src="' + u().escapeHtml(user.photo) + '" alt="">'
        : '<span>' + u().escapeHtml(u().initials(user.name || user.username)) + '</span>';
    });

    u().qsa('[data-user-menu]').forEach(function (menu) {
      var button = menu.querySelector('[data-user-menu-button]');
      var panel = menu.querySelector('.user-menu-panel');
      if (!button || !panel || menu.dataset.bound) return;
      menu.dataset.bound = '1';
      function setOpen(open) {
        panel.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
      }
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        setOpen(!panel.classList.contains('is-open'));
      });
      document.addEventListener('click', function (event) {
        if (!menu.contains(event.target)) setOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setOpen(false);
      });
    });

    u().qsa('[data-sign-out]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        signOut();
        u().toast('You have been signed out.', { type: 'success' });
        window.setTimeout(function () { window.location.reload(); }, 700);
      });
    });
  }

  SE.auth = {
    config: CONFIG,
    normPhone: normPhone,
    formatPhone: formatPhone,
    maskPhone: maskPhone,
    isEmail: isEmail,
    isUsername: isUsername,
    normUsername: normUsername,
    passwordStrength: passwordStrength,
    findByEmail: findByEmail,
    findByUsername: findByUsername,
    findByPhone: findByPhone,
    findByGoogleId: findByGoogleId,
    createUser: createUser,
    signInWithPassword: signInWithPassword,
    updateUser: updateUser,
    startSession: startSession,
    currentUser: currentUser,
    signOut: signOut,
    sendOtp: sendOtp,
    verifyOtp: verifyOtp,
    googleMode: googleMode,
    googleLogo: googleLogo,
    mountGoogleButton: mountGoogleButton,
    setPendingSignup: setPendingSignup,
    takePendingSignup: takePendingSignup,
    renderHeader: renderHeader
  };
})(window.SE = window.SE || {});
