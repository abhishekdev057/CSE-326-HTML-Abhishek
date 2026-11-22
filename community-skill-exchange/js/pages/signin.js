/* ==========================================================================
   Barterly — Sign in page
   Order of options (decided for students on mobile-first campuses):
     1. Google — one tap, no password to remember (shown first).
     2. Username/email + password — default tab, works everywhere.
     3. Mobile OTP — second tab, for people who prefer their phone.
   The page remembers the last method used and opens on that tab.
   New Google / OTP users are handed over to sign-up with their verified
   details pre-filled instead of being turned away.
   ========================================================================== */
(function (SE) {
  'use strict';

  var U = SE.utils;
  var A = SE.auth;
  var UI = SE.authUI;

  function goHome(user, method) {
    SE.storage.setJSON('flash', {
      type: 'success',
      title: 'Welcome back, ' + String(user.name || user.username).split(' ')[0] + '!',
      message: 'Signed in with ' + (method === 'google' ? 'Google' : method === 'otp' ? 'mobile OTP' : 'your password') + '.'
    });
    window.location.href = './dashboard.html';
  }

  function handOffToSignup(data, message) {
    A.setPendingSignup(data);
    SE.storage.setJSON('flash', { type: 'info', title: 'Let’s create your account', message: message });
    window.location.href = './signup.html';
  }

  /* ---------- Tabs ---------- */
  function initTabs() {
    var tablist = U.qs('[data-auth-tabs]');
    var tabs = U.qsa('[role="tab"]', tablist);

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      tablist.style.setProperty('--tab-index', tabs.indexOf(tab));
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        select(tab);
        var first = U.qs('#' + tab.getAttribute('aria-controls') + ' input:not([type="checkbox"])');
        if (first) window.setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
      });
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          select(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length], true);
        }
      });
    });

    var params = new URLSearchParams(window.location.search);
    var wanted = params.get('method') || SE.storage.get('last-method', 'password');
    var initial = tabs.filter(function (t) { return t.dataset.method === wanted; })[0] || tabs[0];
    select(initial);

    return { selectOtp: function () { select(tabs[1]); } };
  }

  /* ---------- Password sign-in ---------- */
  function initPasswordForm() {
    var form = U.qs('[data-password-form]');
    var idInput = form.identifier;
    var pwInput = form.password;
    var submit = form.querySelector('[type="submit"]');

    var lastId = SE.storage.get('last-login-id', '');
    if (lastId) idInput.value = lastId;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      UI.showFormError(form, '');
      var ok = true;
      if (!idInput.value.trim()) { UI.setError(idInput, 'Enter your username or email.'); ok = false; }
      if (!pwInput.value) { UI.setError(pwInput, 'Enter your password.'); ok = false; }
      if (!ok) { form.querySelector('[aria-invalid="true"]').focus(); return; }

      UI.setLoading(submit, true, 'Signing in…');
      A.signInWithPassword(idInput.value, pwInput.value)
        .then(function (user) {
          var remember = form.remember.checked;
          A.startSession(user, 'password', remember);
          if (remember) SE.storage.set('last-login-id', idInput.value.trim());
          else SE.storage.remove('last-login-id');
          goHome(user, 'password');
        })
        .catch(function (err) {
          UI.setLoading(submit, false);
          if (err.field === 'password') {
            UI.setError(pwInput, err.message);
            pwInput.select();
          } else if (err.field === 'identifier') {
            UI.setError(idInput, err.message);
            idInput.focus();
          } else {
            UI.showFormError(form, err.message);
          }
        });
    });
  }

  /* ---------- Mobile OTP sign-in ---------- */
  function initOtpForm() {
    var form = U.qs('[data-otp-form]');
    var phoneStep = form.querySelector('[data-otp-phone-step]');
    var codeStep = form.querySelector('[data-otp-code-step]');
    var phoneInput = form.phone;
    var sendBtn = form.querySelector('[data-send-otp]');
    var verifyBtn = form.querySelector('[data-verify-otp]');
    var resendBtn = form.querySelector('[data-resend]');
    var timerEl = form.querySelector('[data-otp-timer]');
    var errorEl = form.querySelector('[data-otp-error]');
    var demoBox = form.querySelector('[data-otp-demo]');
    var stopTimer = null;
    var phone = '';
    var busy = false;

    UI.initPhoneInput(phoneInput);

    var otp = UI.otpWidget(form.querySelector('[data-otp-inputs]'), {
      length: A.config.otpLength,
      onComplete: function () { verify(); }
    });

    function showOtpError(msg) {
      if (!msg) { errorEl.hidden = true; return; }
      errorEl.innerHTML = U.icon('alert') + '<span>' + U.escapeHtml(msg) + '</span>';
      errorEl.hidden = false;
    }

    function startTimer(resendAt) {
      if (stopTimer) stopTimer();
      resendBtn.disabled = true;
      stopTimer = UI.countdown(resendAt, function (left) {
        timerEl.textContent = left > 0 ? 'Resend available in ' + left + 's' : 'Didn’t get it?';
      }, function () { resendBtn.disabled = false; });
    }

    function send() {
      UI.showFormError(form, '');
      var p = A.normPhone(phoneInput.value);
      if (!p) {
        UI.setError(phoneInput, 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.');
        phoneInput.focus();
        return;
      }
      UI.setLoading(sendBtn, true, 'Sending code…');
      A.sendOtp(p).then(function (res) {
        UI.setLoading(sendBtn, false);
        phone = res.phone;
        form.querySelector('[data-otp-target]').textContent = A.formatPhone(phone);
        phoneStep.hidden = true;
        codeStep.hidden = false;
        otp.clear();
        showOtpError('');
        UI.showDemoOtp(demoBox, res.code, function (code) { otp.fill(code); });
        startTimer(res.resendAt);
        otp.focus();
      }).catch(function (err) {
        UI.setLoading(sendBtn, false);
        UI.setError(phoneInput, err.message);
      });
    }

    function verify() {
      if (busy) return;
      var code = otp.value();
      if (code.length !== A.config.otpLength) {
        otp.setState('error');
        showOtpError('Enter all ' + A.config.otpLength + ' digits.');
        return;
      }
      busy = true;
      UI.setLoading(verifyBtn, true, 'Verifying…');
      A.verifyOtp(phone, code).then(function () {
        otp.setState('success');
        if (stopTimer) stopTimer();
        var user = A.findByPhone(phone);
        if (user) {
          var remember = codeStep.querySelector('[name="remember"]').checked;
          A.startSession(user, 'otp', remember);
          goHome(user, 'otp');
        } else {
          handOffToSignup({ method: 'otp', phone: phone, phoneVerified: true },
            'Your number ' + A.formatPhone(phone) + ' is verified. Just a few details to set up your profile.');
        }
      }).catch(function (err) {
        busy = false;
        UI.setLoading(verifyBtn, false);
        otp.setState('error');
        showOtpError(err.message);
        if (/expired|new code|Too many/.test(err.message)) resendBtn.disabled = false;
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (codeStep.hidden) send();
      else verify();
    });

    resendBtn.addEventListener('click', function () {
      UI.setLoading(resendBtn, true);
      A.sendOtp(phone).then(function (res) {
        UI.setLoading(resendBtn, false);
        otp.clear();
        showOtpError('');
        UI.showDemoOtp(demoBox, res.code, function (code) { otp.fill(code); });
        startTimer(res.resendAt);
        otp.focus();
        U.toast('A new code is on its way.', { type: 'success' });
      }).catch(function (err) {
        UI.setLoading(resendBtn, false);
        showOtpError(err.message);
      });
    });

    form.querySelector('[data-change-number]').addEventListener('click', function () {
      if (stopTimer) stopTimer();
      codeStep.hidden = true;
      phoneStep.hidden = false;
      demoBox.hidden = true;
      phoneInput.focus();
    });
  }

  /* ---------- Google ---------- */
  function initGoogle() {
    A.mountGoogleButton(U.qs('[data-google-slot]'), function (profile) {
      var user = A.findByGoogleId(profile.sub) || A.findByEmail(profile.email);
      if (user) {
        if (!user.googleId) user = A.updateUser(user.id, { googleId: profile.sub });
        A.startSession(user, 'google', true);
        goHome(user, 'google');
      } else {
        handOffToSignup({ method: 'google', google: profile },
          'Signed in with Google as ' + profile.email + '. Tell us a bit about yourself to finish.');
      }
    }, { text: 'signin_with' });
  }

  function init() {
    var tabs = initTabs();
    initPasswordForm();
    initOtpForm();
    initGoogle();
    UI.initPasswordToggles();
    UI.initSlides();
    UI.initGoogleNote();

    U.qs('[data-forgot]').addEventListener('click', function () {
      tabs.selectOtp();
      U.toast('Sign in with a one-time code sent to your registered mobile number.', { title: 'Forgot your password?' });
    });

    if (A.currentUser()) U.qs('[data-signed-in]').hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SE = window.SE || {});
