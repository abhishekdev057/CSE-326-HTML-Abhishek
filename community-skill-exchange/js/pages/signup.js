/* ==========================================================================
   Barterly — Sign-up wizard
   7 steps: Account → About you → Teach → Learn → Interests → Location → Review

   Account step, per method:
     • Google           → name + verified email come from Google; we ask mobile.
     • Mobile OTP       → number verified by OTP; we ask email.
     • Username/password→ we ask username, email, mobile and a strong password.

   Progress (minus passwords) is auto-saved to localStorage, so a refresh or
   coming back later resumes where the user stopped.
   ========================================================================== */
(function (SE) {
  'use strict';

  var U = SE.utils;
  var A = SE.auth;
  var UI = SE.authUI;

  var TOTAL = 7;
  var GOOGLE_ICON = '<svg class="google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  var DRAFT_KEY = 'signup-draft';

  var VISUALS = [
    ['Your bridge to every skill', 'Join students who teach what they know and learn what they love.'],
    ['Tell us who you are', 'A friendly, honest profile helps the right people find you.'],
    ['Everyone has something to teach', 'Your notes, hobbies and hacks can unlock someone else’s progress.'],
    ['What will you learn next?', 'From placement prep to playing guitar — pick what pulls you in.'],
    ['Find people on your wavelength', 'Shared interests and free time make the best learning partners.'],
    ['Learn close to home', 'Meet on campus, nearby, or keep it online — your call.'],
    ['You’re almost there', 'One last look before you join the community.']
  ];

  var SKILLS = [
    'Python', 'Java', 'C', 'C++', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Web development', 'App development',
    'Flutter', 'Android development', 'DSA', 'Competitive programming', 'SQL', 'Data analysis', 'Machine learning',
    'Deep learning', 'Power BI', 'Excel', 'Cloud computing', 'AWS', 'Cybersecurity', 'Linux', 'Git & GitHub',
    'UI/UX design', 'Figma', 'Graphic design', 'Canva', 'Photography', 'Video editing', 'Animation', '3D modelling',
    'Content writing', 'Creative writing', 'Public speaking', 'Spoken English', 'Hindi', 'Punjabi', 'French',
    'German', 'Spanish', 'Japanese', 'Korean', 'Sign language', 'Guitar', 'Keyboard', 'Singing', 'Tabla', 'Drums',
    'Music production', 'Dance', 'Bhangra', 'Classical dance', 'Digital marketing', 'Social media marketing',
    'Entrepreneurship', 'Personal finance', 'Stock market basics', 'Accounting', 'Resume building', 'Interview prep',
    'Aptitude', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Cooking', 'Baking', 'Yoga',
    'Fitness training', 'Cricket', 'Football', 'Badminton', 'Chess', 'Painting', 'Sketching', 'Calligraphy',
    'Crochet', 'Gardening', 'Event management', 'Leadership'
  ];

  var PICKERS = {
    teach: {
      levels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      defaultLevel: 'Intermediate',
      popular: ['Python', 'Excel', 'Spoken English', 'Guitar', 'Photography', 'DSA']
    },
    learn: {
      levels: ['New to it', 'Some basics', 'Intermediate'],
      defaultLevel: 'New to it',
      popular: ['UI/UX design', 'Public speaking', 'Machine learning', 'Guitar', 'French', 'Video editing']
    }
  };

  var STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
    'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
    'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
    'West Bengal'];

  var CAMPUS = {
    line1: 'Lovely Professional University, Jalandhar–Delhi G.T. Road',
    city: 'Phagwara',
    state: 'Punjab',
    pincode: '144411'
  };

  /* Text inputs ↔ state keys */
  var BINDINGS = {
    'su-username': 'username', 'su-email': 'email', 'su-email-otp': 'email', 'su-name': 'name', 'su-dob': 'dob',
    'su-gender': 'gender', 'su-institution': 'institution', 'su-program': 'program', 'su-year': 'year',
    'su-org': 'org', 'su-title': 'title', 'su-bio': 'bio', 'su-hostel': 'hostel', 'su-line1': 'line1',
    'su-line2': 'line2', 'su-city': 'city', 'su-state': 'state', 'su-pincode': 'pincode'
  };

  function defaultState() {
    return {
      step: 0, maxStep: 0, method: '', google: null, phone: '', phoneVerified: false, email: '', username: '',
      name: '', photo: '', dob: '', gender: '', role: '', institution: 'Lovely Professional University',
      program: '', year: '', org: '', title: '', bio: '', teach: [], noTeach: false, learn: [], goal: '',
      interests: [], formats: [], days: [], times: [], languages: ['English', 'Hindi'],
      onCampus: false, hostel: '', line1: '', line2: '', city: '', state: '', pincode: '', visibility: 'City only'
    };
  }

  var state = defaultState();
  var form, steps, nextBtn, backBtn, otp, stopTimer;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Draft ---------- */
  var saveDraft = U.debounce(function () {
    if (form.hidden) return;
    SE.storage.setJSON(DRAFT_KEY, state);
  }, 300);

  function clearDraft() { SE.storage.remove(DRAFT_KEY); }

  /* ---------- Rendering state → DOM ---------- */
  function renderInputs() {
    Object.keys(BINDINGS).forEach(function (id) {
      var el = $(id);
      if (el) el.value = state[BINDINGS[id]] || '';
    });
    U.qsa('[data-phone]').forEach(function (el) { el.value = formatPhoneInput(state.phone); });
    $('su-no-teach').checked = !!state.noTeach;
    $('su-on-campus').checked = !!state.onCampus;
    U.qsa('[data-choice]').forEach(renderChoice);
    renderMethod();
    renderRoleFields();
    renderCampus();
    renderPhoto();
    renderGoogle();
    renderOtpVerified();
    $('su-bio').dispatchEvent(new Event('input'));
    Object.keys(PICKERS).forEach(function (k) { PICKERS[k].render(); });
  }

  function formatPhoneInput(p) {
    p = String(p || '');
    return p.length > 5 ? p.slice(0, 5) + ' ' + p.slice(5) : p;
  }

  /* ---------- Steps ---------- */
  function go(target, opts) {
    opts = opts || {};
    target = Math.max(0, Math.min(TOTAL - 1, target));
    var forward = target > state.step;

    if (forward && !opts.skipValidation) {
      for (var s = state.step; s < target; s++) {
        if (!validate(s)) {
          if (s !== state.step) show(s, false);
          return;
        }
      }
    }
    show(target, forward);
  }

  function show(index, forward) {
    var previous = state.step;
    state.step = index;
    state.maxStep = Math.max(state.maxStep, index);

    steps.forEach(function (section, i) {
      var active = i === index;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
      if (active && previous !== index) {
        section.classList.remove('enter-forward', 'enter-back');
        void section.offsetWidth; // restart animation
        section.classList.add(forward ? 'enter-forward' : 'enter-back');
      }
    });

    // Stepper
    U.qsa('[data-stepper] li').forEach(function (li, i) {
      li.classList.toggle('is-current', i === index);
      li.classList.toggle('is-done', i < index || (i <= state.maxStep && i !== index && i < state.maxStep));
      var btn = li.querySelector('button');
      btn.disabled = i > state.maxStep;
      if (i === index) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
    });

    // Visual side
    U.qsa('[data-step-images] .auth-slide').forEach(function (fig, i) {
      fig.classList.toggle('is-active', i === index);
    });
    U.qs('[data-visual-title]').textContent = VISUALS[index][0];
    U.qs('[data-visual-text]').textContent = VISUALS[index][1];

    // Progress
    U.qs('[data-progress]').style.width = ((index + 1) / TOTAL * 100) + '%';
    U.qs('[data-progress-label]').textContent = 'Step ' + (index + 1) + ' of ' + TOTAL;

    // Actions
    backBtn.hidden = index === 0;
    renderSwitch();
    nextBtn.querySelector('.button-label').textContent = index === TOTAL - 1 ? 'Create my account' : 'Continue';

    if (index === TOTAL - 1) renderReview();

    var num = U.qs('[data-sv-num]');
    if (num) num.textContent = (index < 9 ? '0' : '') + (index + 1);

    if (previous !== index) {
      var area = U.qs('[data-scroll-area]');
      if (area) area.scrollTo({ top: 0, behavior: 'smooth' });
      var heading = $('step-' + index + '-title');
      if (heading) window.setTimeout(function () { heading.focus({ preventScroll: true }); }, 60);
    }
    saveDraft();
  }

  /* ---------- Validation ---------- */
  function fail(input, message, list) {
    UI.setError(input, message);
    list.push(input);
  }

  function failGroup(errorId, message, list, focusEl) {
    var el = $(errorId);
    el.innerHTML = U.icon('alert') + '<span>' + U.escapeHtml(message) + '</span>';
    el.hidden = false;
    list.push(focusEl || el);
  }

  function clearGroupError(errorId) {
    var el = $(errorId);
    if (el) el.hidden = true;
  }

  function phoneInputFor(method) {
    return $('su-phone-' + method);
  }

  function validatePhone(input, invalid) {
    var p = A.normPhone(state.phone);
    if (!p) { fail(input, 'Enter a valid 10-digit mobile number starting with 6–9.', invalid); return false; }
    if (A.findByPhone(p)) { fail(input, 'This number is already registered — sign in instead.', invalid); return false; }
    return true;
  }

  function validateEmail(input, invalid) {
    if (!A.isEmail(state.email)) { fail(input, 'Enter a valid email address.', invalid); return false; }
    if (A.findByEmail(state.email)) { fail(input, 'An account already uses this email — sign in instead.', invalid); return false; }
    return true;
  }

  function validate(step) {
    var invalid = [];

    if (step === 0) {
      clearGroupError('method-error');
      if (!state.method || state.choosingMethod) {
        failGroup('method-error', 'Choose how you want to sign up.', invalid, U.qs('[data-method]'));
      } else if (state.method === 'google') {
        clearGroupError('google-error');
        if (!state.google) {
          failGroup('google-error', 'Continue with Google to connect your account.', invalid, U.qs('[data-google-slot] button') || $('google-error'));
        } else if (A.findByEmail(state.google.email) || A.findByGoogleId(state.google.sub)) {
          failGroup('google-error', 'This Google account is already registered — sign in instead.', invalid);
        }
        validatePhone(phoneInputFor('google'), invalid);
      } else if (state.method === 'otp') {
        var phoneEl = phoneInputFor('otp');
        if (validatePhone(phoneEl, invalid) && !state.phoneVerified) {
          fail(phoneEl, 'Verify your number with the OTP first.', invalid);
        }
        validateEmail($('su-email-otp'), invalid);
      } else if (state.method === 'password') {
        var un = $('su-username');
        if (!A.isUsername(state.username)) fail(un, 'Use 3–20 characters: lowercase letters, numbers or _.', invalid);
        else if (A.findByUsername(state.username)) fail(un, 'That username is taken. Try another.', invalid);
        validateEmail($('su-email'), invalid);
        validatePhone(phoneInputFor('password'), invalid);
        var pw = $('su-password');
        var strength = A.passwordStrength(pw.value);
        if (!pw.value) fail(pw, 'Create a password.', invalid);
        else if (strength.score < 3 || !strength.checks.length) {
          fail(pw, 'Make it stronger: 8+ characters with upper & lower case and a number or symbol.', invalid);
        }
        var cf = $('su-confirm');
        if (!cf.value) fail(cf, 'Confirm your password.', invalid);
        else if (cf.value !== pw.value) fail(cf, 'Passwords don’t match.', invalid);
      }
    }

    if (step === 1) {
      clearGroupError('role-error');
      if (String(state.name).trim().length < 2) fail($('su-name'), 'Enter your full name.', invalid);
      var dob = state.dob ? new Date(state.dob + 'T00:00:00') : null;
      if (!dob || isNaN(dob)) {
        fail($('su-dob'), 'Enter your date of birth.', invalid);
      } else {
        var age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age < 13) fail($('su-dob'), 'You need to be at least 13 to join Barterly.', invalid);
        else if (age > 100) fail($('su-dob'), 'Please check the year.', invalid);
      }
      if (!state.role) failGroup('role-error', 'Choose the option that describes you best.', invalid, U.qs('[data-choice="role"] .choice'));
      if (state.role === 'Student') {
        if (!String(state.institution).trim()) fail($('su-institution'), 'Enter your college or university.', invalid);
        if (!state.program) fail($('su-program'), 'Choose your programme.', invalid);
        if (!state.year) fail($('su-year'), 'Choose your year.', invalid);
      }
    }

    if (step === 2) {
      clearGroupError('teach-error');
      if (!state.teach.length && !state.noTeach) {
        failGroup('teach-error', 'Add at least one skill — or tick “I’m just starting out”.', invalid, $('su-teach-input'));
      }
    }

    if (step === 3) {
      clearGroupError('learn-error');
      clearGroupError('goal-error');
      if (!state.learn.length) failGroup('learn-error', 'Add at least one skill you want to learn.', invalid, $('su-learn-input'));
      if (!state.goal) failGroup('goal-error', 'Pick your main goal.', invalid, U.qs('[data-choice="goal"] .choice'));
    }

    if (step === 4) {
      [['interests', 3, 'Pick at least 3 interests.'], ['formats', 1, 'Choose at least one way to learn.'],
        ['days', 1, 'Choose at least one day.'], ['times', 1, 'Choose a preferred time.'],
        ['languages', 1, 'Choose at least one language.']].forEach(function (rule) {
        clearGroupError(rule[0] + '-error');
        if (state[rule[0]].length < rule[1]) {
          failGroup(rule[0] + '-error', rule[2], invalid, U.qs('[data-choice="' + rule[0] + '"] .choice'));
        }
      });
    }

    if (step === 5) {
      if (state.onCampus && !String(state.hostel).trim()) fail($('su-hostel'), 'Enter your hostel or block.', invalid);
      if (!String(state.line1).trim()) fail($('su-line1'), 'Enter your address.', invalid);
      if (!String(state.city).trim()) fail($('su-city'), 'Enter your city.', invalid);
      if (!state.state) fail($('su-state'), 'Choose your state.', invalid);
      if (!/^[1-9]\d{5}$/.test(String(state.pincode))) fail($('su-pincode'), 'Enter a valid 6-digit PIN code.', invalid);
    }

    if (step === 6) {
      clearGroupError('su-terms-error');
      if (!$('su-terms').checked) failGroup('su-terms-error', 'Please accept the community guidelines to continue.', invalid, $('su-terms'));
    }

    if (invalid.length) {
      if (step !== state.step) show(step, false);
      var first = invalid[0];
      window.setTimeout(function () {
        if (first.focus) first.focus();
        if (first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 80);
      return false;
    }
    return true;
  }

  /* ---------- Generic bindings ---------- */
  function initBindings() {
    Object.keys(BINDINGS).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var key = BINDINGS[id];
        state[key] = key === 'username' ? el.value.toLowerCase().replace(/\s/g, '') : el.value;
        if (key === 'username' && el.value !== state.username) el.value = state.username;
        if (key === 'pincode') { state.pincode = el.value.replace(/\D/g, '').slice(0, 6); el.value = state.pincode; }
        if (key === 'name') renderPhoto();
        saveDraft();
      });
    });

    U.qsa('[data-phone]').forEach(function (input) {
      UI.initPhoneInput(input);
      input.addEventListener('input', function () {
        var digits = input.value.replace(/\D/g, '');
        if (digits !== state.phone) {
          state.phone = digits;
          if (state.phoneVerified) {
            state.phoneVerified = false;
            renderOtpVerified();
          }
        }
        U.qsa('[data-phone]').forEach(function (other) { if (other !== input) other.value = input.value; });
        saveDraft();
      });
    });

    $('su-no-teach').addEventListener('change', function () {
      state.noTeach = this.checked;
      clearGroupError('teach-error');
      saveDraft();
    });

    $('su-bio').addEventListener('input', function () {
      U.qs('[data-bio-count]').textContent = this.value.length;
    });
  }

  /* ---------- Choice chips ---------- */
  function renderChoice(group) {
    var key = group.getAttribute('data-choice');
    var single = group.hasAttribute('data-single');
    U.qsa('.choice', group).forEach(function (btn) {
      var v = btn.getAttribute('data-value');
      var on = single ? state[key] === v : state[key].indexOf(v) !== -1;
      btn.setAttribute(single ? 'aria-checked' : 'aria-pressed', String(on));
    });
  }

  function initChoices() {
    U.qsa('[data-choice]').forEach(function (group) {
      var key = group.getAttribute('data-choice');
      var single = group.hasAttribute('data-single');
      group.addEventListener('click', function (event) {
        var btn = event.target.closest('.choice');
        if (!btn) return;
        var v = btn.getAttribute('data-value');
        if (single) {
          state[key] = v;
        } else {
          var i = state[key].indexOf(v);
          if (i === -1) state[key].push(v);
          else state[key].splice(i, 1);
        }
        renderChoice(group);
        clearGroupError(key + '-error');
        if (key === 'role') renderRoleFields();
        saveDraft();
      });
    });
  }

  function renderRoleFields() {
    U.qsa('[data-role-fields]').forEach(function (el) {
      el.hidden = !state.role || el.getAttribute('data-role-fields').split(' ').indexOf(state.role) === -1;
    });
  }

  /* ---------- Step 1: method ---------- */
  var METHOD_INFO = {
    google: { label: 'Google', sub: 'Signing up with Google — we’ll use your verified Google email.', icon: GOOGLE_ICON },
    otp: { label: 'Mobile OTP', sub: 'Signing up with your mobile number — verify it with a 6-digit code.', icon: U.icon('smartphone') },
    password: { label: 'Username & password', sub: 'Signing up with a username and password.', icon: U.icon('key') }
  };
  var DEFAULT_SUB = 'Choose how you’d like to sign in. It only takes a minute.';

  /*
   * Once a method is picked the three cards collapse so its form fits without
   * scrolling; a "Switch" pill in the fixed action bar brings them back.
   */
  function renderMethod() {
    var collapsed = !!state.method && !state.choosingMethod;
    var step0 = U.qs('[data-step="0"]');
    step0.classList.toggle('has-method', collapsed);
    U.qs('[data-method-group]').hidden = collapsed;
    U.qsa('[data-method]').forEach(function (card) {
      card.setAttribute('aria-checked', String(card.getAttribute('data-method') === state.method));
    });
    U.qsa('[data-method-panel]').forEach(function (panel) {
      panel.hidden = !collapsed || panel.getAttribute('data-method-panel') !== state.method;
    });
    var info = METHOD_INFO[state.method];
    U.qs('[data-method-sub]').textContent = collapsed && info ? info.sub : DEFAULT_SUB;
    renderSwitch();
  }

  function renderSwitch() {
    var btn = U.qs('[data-switch-method]');
    if (!btn) return;
    var info = METHOD_INFO[state.method];
    var show = state.step === 0 && !!info && !state.choosingMethod;
    btn.hidden = !show;
    if (!show) return;
    U.qs('[data-switch-icon]', btn).innerHTML = info.icon;
    U.qs('[data-switch-label]', btn).textContent = info.label;
  }

  function initMethod() {
    var cards = U.qsa('[data-method]');
    U.qs('[data-switch-method]').addEventListener('click', function () {
      state.choosingMethod = true;
      renderMethod();
      var area = U.qs('[data-scroll-area]');
      if (area) area.scrollTop = 0;
      var current = U.qs('[data-method][aria-checked="true"]') || cards[0];
      window.setTimeout(function () { current.focus({ preventScroll: true }); }, 60);
    });
    cards.forEach(function (card, i) {
      card.addEventListener('click', function () {
        state.method = card.getAttribute('data-method');
        state.choosingMethod = false;
        clearGroupError('method-error');
        renderMethod();
        saveDraft();
        var area = U.qs('[data-scroll-area]');
        if (area) area.scrollTop = 0;
        var panel = U.qs('[data-method-panel="' + state.method + '"]');
        var first = panel && panel.querySelector('input:not([readonly]), button');
        if (first) window.setTimeout(function () { first.focus({ preventScroll: true }); }, 80);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
          cards[(i + d + cards.length) % cards.length].focus();
        }
      });
    });
  }

  /* Google */
  function renderGoogle() {
    var slot = U.qs('[data-google-slot]');
    var card = U.qs('[data-google-connected]');
    var g = state.google;
    slot.hidden = !!g;
    card.hidden = !g;
    if (!g) return;
    U.qs('[data-google-name]').textContent = g.name;
    U.qs('[data-google-email]').textContent = g.email;
    U.qs('[data-google-avatar]').innerHTML = g.picture
      ? '<img src="' + U.escapeHtml(g.picture) + '" alt="">'
      : '<span>' + U.escapeHtml(U.initials(g.name)) + '</span>';
  }

  function initGoogle() {
    A.mountGoogleButton(U.qs('[data-google-slot]'), function (profile) {
      clearGroupError('google-error');
      if (A.findByGoogleId(profile.sub) || A.findByEmail(profile.email)) {
        failGroup('google-error', 'This Google account is already registered — please sign in instead.', []);
        return;
      }
      state.google = profile;
      state.email = profile.email;
      if (!state.name) state.name = profile.name;
      $('su-name').value = state.name;
      renderGoogle();
      renderPhoto();
      saveDraft();
      U.toast('Connected ' + profile.email, { type: 'success', title: 'Google account linked' });
      window.setTimeout(function () { phoneInputFor('google').focus(); }, 100);
    }, { text: 'signup_with' });

    U.qs('[data-google-change]').addEventListener('click', function () {
      state.google = null;
      state.email = '';
      renderGoogle();
      saveDraft();
    });
  }

  /* Mobile OTP */
  function renderOtpVerified() {
    var verified = state.method === 'otp' ? state.phoneVerified : false;
    U.qs('[data-otp-verified]').hidden = !state.phoneVerified;
    U.qs('[data-phone-verified]').hidden = !state.phoneVerified;
    U.qs('[data-send-otp]').hidden = !!state.phoneVerified;
    if (state.phoneVerified) {
      U.qs('[data-otp-box]').hidden = true;
      U.qs('[data-otp-verified-number]').textContent = A.formatPhone(state.phone);
    }
    return verified;
  }

  function initOtp() {
    var box = U.qs('[data-otp-box]');
    var sendBtn = U.qs('[data-send-otp]');
    var resendBtn = box.querySelector('[data-resend]');
    var timerEl = box.querySelector('[data-otp-timer]');
    var errorEl = box.querySelector('[data-otp-error]');
    var demoBox = box.querySelector('[data-otp-demo]');
    var phoneEl = phoneInputFor('otp');
    var busy = false;

    otp = UI.otpWidget(box.querySelector('[data-otp-inputs]'), {
      length: A.config.otpLength,
      onComplete: verify
    });

    function showErr(msg) {
      if (!msg) { errorEl.hidden = true; return; }
      errorEl.innerHTML = U.icon('alert') + '<span>' + U.escapeHtml(msg) + '</span>';
      errorEl.hidden = false;
    }

    function startTimer(at) {
      if (stopTimer) stopTimer();
      resendBtn.disabled = true;
      stopTimer = UI.countdown(at, function (left) {
        timerEl.textContent = left > 0 ? 'Resend available in ' + left + 's' : 'Didn’t get it?';
      }, function () { resendBtn.disabled = false; });
    }

    function send(button) {
      var p = A.normPhone(state.phone);
      if (!p) { UI.setError(phoneEl, 'Enter a valid 10-digit mobile number starting with 6–9.'); phoneEl.focus(); return; }
      if (A.findByPhone(p)) { UI.setError(phoneEl, 'This number is already registered — sign in instead.'); return; }
      UI.setLoading(button, true, 'Sending…');
      A.sendOtp(p).then(function (res) {
        UI.setLoading(button, false);
        box.querySelector('[data-otp-target]').textContent = A.formatPhone(p);
        box.hidden = false;
        otp.clear();
        showErr('');
        UI.showDemoOtp(demoBox, res.code, function (code) { otp.fill(code); });
        startTimer(res.resendAt);
        otp.focus();
      }).catch(function (err) {
        UI.setLoading(button, false);
        UI.setError(phoneEl, err.message);
      });
    }

    function verify() {
      if (busy) return;
      busy = true;
      A.verifyOtp(state.phone, otp.value()).then(function () {
        busy = false;
        otp.setState('success');
        if (stopTimer) stopTimer();
        state.phoneVerified = true;
        saveDraft();
        window.setTimeout(function () {
          renderOtpVerified();
          U.toast('Your number is verified.', { type: 'success' });
          $('su-email-otp').focus();
        }, 450);
      }).catch(function (err) {
        busy = false;
        otp.setState('error');
        showErr(err.message);
      });
    }

    sendBtn.addEventListener('click', function () { send(sendBtn); });
    resendBtn.addEventListener('click', function () { send(resendBtn); });
    phoneEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !state.phoneVerified) {
        e.preventDefault();
        send(sendBtn);
      }
    });
  }

  /* Username + password */
  function initPasswordMethod() {
    var un = $('su-username');
    var ok = U.qs('[data-username-ok]');
    var check = U.debounce(function () {
      ok.hidden = true;
      if (!state.username) return;
      if (!A.isUsername(state.username)) {
        if (state.username.length >= 3) UI.setError(un, 'Only lowercase letters, numbers and _ (3–20).');
        return;
      }
      if (A.findByUsername(state.username)) UI.setError(un, 'That username is taken. Try another.');
      else { UI.clearError(un); ok.hidden = false; }
    }, 350);
    un.addEventListener('input', check);

    var pw = $('su-password');
    var meter = U.qs('[data-strength]');
    pw.addEventListener('input', function () {
      var s = A.passwordStrength(pw.value);
      meter.setAttribute('data-score', pw.value ? s.score : '');
      U.qs('[data-strength-label]').textContent = pw.value ? 'Strength: ' + s.label : 'Password strength';
      Object.keys(s.checks).forEach(function (k) {
        var li = meter.querySelector('[data-rule="' + k + '"]');
        if (li) li.classList.toggle('is-met', s.checks[k]);
      });
    });
  }

  /* ---------- Step 2: photo ---------- */
  function renderPhoto() {
    var preview = U.qs('[data-photo-preview]');
    var src = state.photo || (state.google && state.google.picture) || '';
    preview.innerHTML = src
      ? '<img src="' + U.escapeHtml(src) + '" alt="Your profile photo">'
      : '<span>' + U.escapeHtml(U.initials(state.name)) + '</span>';
    preview.classList.toggle('has-photo', !!src);
    U.qs('[data-photo-remove]').hidden = !state.photo;
  }

  function initPhoto() {
    var input = U.qs('[data-photo-input]');
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        U.toast('Please choose an image under 8 MB.', { type: 'error' });
        input.value = '';
        return;
      }
      U.resizeImage(file, 192).then(function (dataUrl) {
        state.photo = dataUrl;
        renderPhoto();
        saveDraft();
      }).catch(function (err) {
        U.toast(err.message, { type: 'error' });
      });
      input.value = '';
    });
    U.qs('[data-photo-remove]').addEventListener('click', function () {
      state.photo = '';
      renderPhoto();
      saveDraft();
    });
  }

  /* ---------- Steps 3 & 4: skill pickers ---------- */
  function canonical(name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < SKILLS.length; i++) if (SKILLS[i].toLowerCase() === lower) return SKILLS[i];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function initPicker(key) {
    var cfg = PICKERS[key];
    var root = U.qs('[data-skill-picker="' + key + '"]');
    var input = root.querySelector('input');
    var listbox = root.querySelector('.combo-list');
    var listEl = root.querySelector('[data-skill-list]');
    var empty = root.querySelector('[data-skill-empty]');
    var quick = root.querySelector('[data-quick]');
    var options = [];
    var active = -1;
    var other = key === 'teach' ? 'learn' : 'teach';

    function has(name) {
      return state[key].some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
    }

    function add(raw) {
      var name = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!name) return;
      if (name.length > 40) { U.toast('Keep skill names under 40 characters.', { type: 'error' }); return; }
      name = canonical(name);
      if (has(name)) { U.toast(name + ' is already on your list.'); return; }
      if (state[key].length >= 10) { U.toast('You can add up to 10 skills here.', { type: 'error' }); return; }
      var clash = state[other].some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
      if (clash) {
        U.toast(name + ' is already in your “' + (other === 'teach' ? 'can teach' : 'want to learn') + '” list.', { type: 'error' });
        return;
      }
      state[key].push({ name: name, level: cfg.defaultLevel });
      if (key === 'teach' && state.noTeach) { state.noTeach = false; $('su-no-teach').checked = false; }
      clearGroupError(key + '-error');
      input.value = '';
      closeList();
      render();
      saveDraft();
    }

    function remove(name) {
      state[key] = state[key].filter(function (s) { return s.name !== name; });
      render();
      saveDraft();
    }

    function render() {
      listEl.innerHTML = state[key].map(function (s) {
        var levels = cfg.levels.map(function (lv) {
          return '<button type="button" class="level' + (lv === s.level ? ' is-on' : '') + '" aria-pressed="' + (lv === s.level) + '" data-level="' + U.escapeHtml(lv) + '">' + U.escapeHtml(lv) + '</button>';
        }).join('');
        return '<li class="skill-item" data-name="' + U.escapeHtml(s.name) + '">' +
          '<span class="skill-item-name">' + U.icon(key === 'teach' ? 'award' : 'target') + U.escapeHtml(s.name) + '</span>' +
          '<span class="level-group" role="group" aria-label="' + (key === 'teach' ? 'Your level in ' : 'Your current level in ') + U.escapeHtml(s.name) + '">' + levels + '</span>' +
          '<button type="button" class="skill-remove" aria-label="Remove ' + U.escapeHtml(s.name) + '">' + U.icon('x') + '</button>' +
          '</li>';
      }).join('');
      empty.hidden = state[key].length > 0;
      quick.innerHTML = cfg.popular.filter(function (p) { return !has(p); }).slice(0, 5).map(function (p) {
        return '<button type="button" class="chip" data-quick-add="' + U.escapeHtml(p) + '">' + U.icon('plus') + U.escapeHtml(p) + '</button>';
      }).join('');
      quick.parentElement.hidden = !quick.innerHTML;
    }
    cfg.render = render;

    listEl.addEventListener('click', function (event) {
      var item = event.target.closest('.skill-item');
      if (!item) return;
      var name = item.getAttribute('data-name');
      if (event.target.closest('.skill-remove')) { remove(name); return; }
      var lvBtn = event.target.closest('[data-level]');
      if (lvBtn) {
        state[key].forEach(function (s) { if (s.name === name) s.level = lvBtn.getAttribute('data-level'); });
        render();
        saveDraft();
        var again = listEl.querySelector('.skill-item[data-name="' + CSS.escape(name) + '"] [data-level="' + CSS.escape(lvBtn.getAttribute('data-level')) + '"]');
        if (again) again.focus();
      }
    });

    quick.addEventListener('click', function (event) {
      var b = event.target.closest('[data-quick-add]');
      if (b) add(b.getAttribute('data-quick-add'));
    });

    /* Combobox */
    function closeList() {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function openList() {
      var q = input.value.trim().toLowerCase();
      if (!q) { closeList(); return; }
      var matches = SKILLS.filter(function (s) { return s.toLowerCase().indexOf(q) !== -1 && !has(s); })
        .sort(function (a, b) { return a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q); })
        .slice(0, 6);
      var exact = SKILLS.some(function (s) { return s.toLowerCase() === q; });
      options = matches.slice();
      if (!exact && !has(input.value.trim())) options.push({ custom: input.value.trim() });
      listbox.innerHTML = options.map(function (o, i) {
        var label = typeof o === 'string'
          ? U.escapeHtml(o)
          : U.icon('plus') + 'Add “' + U.escapeHtml(o.custom) + '”';
        return '<li role="option" id="' + key + '-opt-' + i + '" class="combo-option' + (typeof o !== 'string' ? ' is-custom' : '') + '" aria-selected="false" data-index="' + i + '">' + label + '</li>';
      }).join('');
      listbox.hidden = !options.length;
      input.setAttribute('aria-expanded', String(!!options.length));
      active = -1;
    }

    function highlight(i) {
      var items = U.qsa('.combo-option', listbox);
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (el, k) { el.setAttribute('aria-selected', String(k === active)); });
      input.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }

    function pick(i) {
      var o = options[i];
      if (o === undefined) return;
      add(typeof o === 'string' ? o : o.custom);
    }

    input.addEventListener('input', openList);
    input.addEventListener('focus', openList);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (listbox.hidden) openList(); highlight(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
      else if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var typed = input.value.trim();
        if (active >= 0) pick(active);
        else if (typed) {
          // "pyt" + Enter → "Python" when a suggestion starts with what was typed
          var first = !listbox.hidden && typeof options[0] === 'string' ? options[0] : '';
          add(first && first.toLowerCase().indexOf(typed.toLowerCase()) === 0 ? first : typed);
        }
      } else if (e.key === 'Escape') {
        closeList();
      } else if (e.key === 'Backspace' && !input.value && state[key].length) {
        remove(state[key][state[key].length - 1].name);
      }
    });
    listbox.addEventListener('mousedown', function (e) {
      var li = e.target.closest('.combo-option');
      if (li) { e.preventDefault(); pick(Number(li.getAttribute('data-index'))); }
    });
    input.addEventListener('blur', function () { window.setTimeout(closeList, 120); });

    render();
  }

  /* ---------- Step 6: location ---------- */
  function renderCampus() {
    U.qs('[data-campus-only]').hidden = !state.onCampus;
  }

  function initLocation() {
    var select = U.qs('[data-states]');
    select.innerHTML = '<option value="">Select state</option>' + STATES.map(function (s) {
      return '<option>' + U.escapeHtml(s) + '</option>';
    }).join('');
    select.value = state.state || '';

    $('su-on-campus').addEventListener('change', function () {
      state.onCampus = this.checked;
      if (state.onCampus) {
        Object.keys(CAMPUS).forEach(function (k) { state[k] = CAMPUS[k]; });
        ['line1', 'city', 'state', 'pincode'].forEach(function (k) {
          var el = $('su-' + k);
          el.value = state[k];
          UI.clearError(el);
        });
        window.setTimeout(function () { $('su-hostel').focus(); }, 50);
      }
      renderCampus();
      saveDraft();
    });
  }

  /* ---------- Step 7: review ---------- */
  function list(items, map) {
    if (!items || !items.length) return '<span class="muted">—</span>';
    return '<span class="review-tags">' + items.map(function (x) {
      return '<span class="review-tag">' + U.escapeHtml(map ? map(x) : x) + '</span>';
    }).join('') + '</span>';
  }

  function row(label, value) {
    return '<div class="review-row"><dt>' + U.escapeHtml(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function txt(v) { return v ? U.escapeHtml(v) : '<span class="muted">—</span>'; }

  function renderReview() {
    var methodLabel = { google: 'Google', otp: 'Mobile OTP', password: 'Username & password' }[state.method] || '—';
    var account = row('Sign-in method', U.escapeHtml(methodLabel)) +
      (state.username ? row('Username', '@' + U.escapeHtml(state.username)) : '') +
      row('Email', txt(state.email)) +
      row('Mobile', txt(A.formatPhone(state.phone)) + (state.phoneVerified ? ' <span class="badge badge-success">Verified</span>' : ''));

    var about = row('Name', txt(state.name)) +
      row('Date of birth', txt(state.dob ? new Date(state.dob + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '')) +
      row('I am a', txt(state.role)) +
      (state.role === 'Student'
        ? row('Studying', txt([state.program, state.year, state.institution].filter(Boolean).join(' · ')))
        : row('Work', txt([state.title, state.org].filter(Boolean).join(' at ')))) +
      (state.bio ? row('Bio', txt(state.bio)) : '');

    var skills = row('Can teach', state.noTeach && !state.teach.length ? '<span class="muted">Adding later</span>' : list(state.teach, function (s) { return s.name + ' · ' + s.level; })) +
      row('Wants to learn', list(state.learn, function (s) { return s.name + ' · ' + s.level; })) +
      row('Main goal', txt(state.goal));

    var prefs = row('Interests', list(state.interests)) +
      row('Formats', list(state.formats)) +
      row('Available', txt(state.days.join(', ') + (state.times.length ? ' · ' + state.times.join(', ') : ''))) +
      row('Languages', list(state.languages));

    var loc = row('Address', txt([state.onCampus && state.hostel ? state.hostel : '', state.line1, state.line2].filter(Boolean).join(', '))) +
      row('City', txt([state.city, state.state, state.pincode].filter(Boolean).join(', '))) +
      row('Visible to', txt(state.visibility));

    var photo = state.photo || (state.google && state.google.picture);
    var head = '<div class="review-profile">' +
      '<span class="user-avatar user-avatar-xl">' + (photo ? '<img src="' + U.escapeHtml(photo) + '" alt="">' : '<span>' + U.escapeHtml(U.initials(state.name)) + '</span>') + '</span>' +
      '<div><strong>' + txt(state.name) + '</strong><span>' + txt(state.role === 'Student' ? [state.program, state.institution].filter(Boolean).join(' · ') : state.title) + '</span></div></div>';

    function section(title, icon, step, body) {
      return '<section class="review-card"><header><h2>' + U.icon(icon) + U.escapeHtml(title) + '</h2>' +
        '<button type="button" class="link-button" data-edit="' + step + '">' + U.icon('edit') + 'Edit</button></header>' +
        '<dl>' + body + '</dl></section>';
    }

    U.qs('[data-review]').innerHTML = head +
      section('Account', 'key', 0, account) +
      section('About you', 'user', 1, about) +
      section('Skills', 'award', 2, skills) +
      section('Interests & availability', 'heart', 4, prefs) +
      section('Location', 'map-pin', 5, loc);
  }

  /* ---------- Create account ---------- */
  function create() {
    var pw = $('su-password').value;
    if (state.method === 'password' && !pw) {
      show(0, false);
      UI.setError($('su-password'), 'For your security, please re-enter your password.');
      $('su-password').focus();
      return;
    }

    var profile = {
      name: state.name.trim(),
      username: state.method === 'password' ? state.username : '',
      email: state.email,
      phone: state.phone,
      googleId: state.google ? state.google.sub : '',
      photo: state.photo || (state.google && state.google.picture) || '',
      dob: state.dob,
      gender: state.gender,
      role: state.role,
      institution: state.role === 'Student' ? state.institution.trim() : '',
      program: state.role === 'Student' ? state.program : '',
      year: state.role === 'Student' ? state.year : '',
      organisation: state.role !== 'Student' ? state.org.trim() : '',
      jobTitle: state.role !== 'Student' ? state.title.trim() : '',
      bio: state.bio.trim(),
      teach: state.teach,
      learn: state.learn,
      goal: state.goal,
      interests: state.interests,
      formats: state.formats,
      availability: { days: state.days, times: state.times },
      languages: state.languages,
      location: {
        onCampus: state.onCampus, hostel: state.onCampus ? state.hostel.trim() : '',
        line1: state.line1.trim(), line2: state.line2.trim(), city: state.city.trim(),
        state: state.state, pincode: state.pincode, country: 'India', visibility: state.visibility
      },
      signupMethod: state.method,
      emailVerified: state.method === 'google',
      phoneVerified: state.method === 'otp' && state.phoneVerified
    };

    UI.setLoading(nextBtn, true, 'Creating your account…');
    A.createUser(profile, state.method === 'password' ? pw : null).then(function (user) {
      A.startSession(user, state.method, true);
      clearDraft();
      if (stopTimer) stopTimer();
      showSuccess(user);
    }).catch(function (err) {
      UI.setLoading(nextBtn, false);
      U.toast(err.message, { type: 'error', title: 'Couldn’t create your account' });
      if (err.field) show(0, false);
    });
  }

  function showSuccess(user) {
    form.hidden = true;
    U.qs('.signup-progress').hidden = true;
    U.qs('[data-draft-banner]').hidden = true;
    var success = U.qs('[data-success]');
    success.hidden = false;
    U.qs('[data-success-name]').textContent = user.name.split(' ')[0];
    U.qs('[data-success-avatar]').innerHTML = user.photo
      ? '<img src="' + U.escapeHtml(user.photo) + '" alt="">'
      : '<span>' + U.escapeHtml(U.initials(user.name)) + '</span>';
    var t = user.teach.length;
    var l = user.learn.length;
    var skillsLine = t
      ? 'You can teach ' + t + ' skill' + (t === 1 ? '' : 's') + ' and want to learn ' + l + '.'
      : 'You want to learn ' + l + ' skill' + (l === 1 ? '' : 's') + '.';
    U.qs('[data-success-text]').textContent = skillsLine + ' We’ll look for learning partners' +
      (user.location.city ? ' around ' + user.location.city : '') + ' who match your interests.';

    U.qsa('[data-stepper] li').forEach(function (li) { li.classList.add('is-done'); li.classList.remove('is-current'); });
    U.qs('[data-visual-title]').textContent = 'Welcome to the community';
    U.qs('[data-visual-text]').textContent = 'Your skills are now one exchange away from someone who needs them.';
    confetti(success);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    U.qs('#success-title').focus({ preventScroll: true });
  }

  function confetti(host) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#4f46e5', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#f97316'];
    var wrap = document.createElement('div');
    wrap.className = 'confetti';
    wrap.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      p.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      wrap.appendChild(p);
    }
    host.appendChild(wrap);
    window.setTimeout(function () { wrap.remove(); }, 4000);
  }

  /* ---------- Boot ---------- */
  function restore() {
    var pending = A.takePendingSignup();
    var draft = SE.storage.getJSON(DRAFT_KEY, null);

    if (draft && typeof draft === 'object') {
      var base = defaultState();
      Object.keys(base).forEach(function (k) { if (draft[k] !== undefined) state[k] = draft[k]; });
      if (state.method || state.maxStep > 0) U.qs('[data-draft-banner]').hidden = false;
    }

    if (pending) {
      state.method = pending.method;
      if (pending.method === 'google' && pending.google) {
        state.google = pending.google;
        state.email = pending.google.email;
        state.name = state.name || pending.google.name;
      }
      if (pending.method === 'otp') {
        state.phone = pending.phone;
        state.phoneVerified = !!pending.phoneVerified;
      }
      state.step = 0;
      U.qs('[data-draft-banner]').hidden = true;
    }
  }

  function init() {
    form = U.qs('[data-signup-form]');
    steps = U.qsa('.step', form);
    nextBtn = U.qs('[data-next]');
    backBtn = U.qs('[data-back]');

    restore();
    initBindings();
    initChoices();
    initMethod();
    initGoogle();
    initOtp();
    initPasswordMethod();
    initPhoto();
    initPicker('teach');
    initPicker('learn');
    initLocation();
    UI.initPasswordToggles();
    UI.initGoogleNote();
    renderInputs();
    show(Math.min(state.step || 0, state.maxStep || 0), true);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.step === TOTAL - 1) {
        if (validate(TOTAL - 1)) create();
      } else {
        go(state.step + 1);
      }
    });

    backBtn.addEventListener('click', function () { go(state.step - 1); });

    U.qsa('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = Number(btn.getAttribute('data-goto'));
        if (target <= state.maxStep) go(target, { skipValidation: target <= state.step });
      });
    });

    U.qs('[data-review]').addEventListener('click', function (event) {
      var b = event.target.closest('[data-edit]');
      if (b) go(Number(b.getAttribute('data-edit')), { skipValidation: true });
    });

    U.qs('[data-start-over]').addEventListener('click', function () {
      clearDraft();
      window.location.reload();
    });

    if (A.currentUser()) U.qs('[data-signed-in]').hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SE = window.SE || {});
