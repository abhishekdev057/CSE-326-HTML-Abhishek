/* ==========================================================================
   Barterly — Dashboard (single-page app over SE.api)
   Views: overview · discover · requests · messages · sessions · wallet · profile
   Extras: command palette (⌘K / Ctrl+K / "/"), notifications drawer,
   member profile drawer, swipe deck, live countdown, .ics export.
   All data goes through SE.api, so swapping localStorage for a real backend
   later needs no changes here.
   ========================================================================== */
(function (SE) {
  'use strict';

  var U = SE.utils;
  var A = SE.auth;
  var api = SE.api;
  var M = SE.motion || {};
  var esc = U.escapeHtml;
  var ic = U.icon;

  if (!A.currentUser()) {
    window.location.replace('./signin.html?next=dashboard');
    return;
  }

  var VIEWS = {
    overview: { title: 'Overview', kicker: '(01) — Dashboard', render: renderOverview },
    discover: { title: 'Discover <em class="serif">matches</em>', kicker: '(02) — Find your people', render: renderDiscover },
    requests: { title: 'Swap <em class="serif">requests</em>', kicker: '(03) — Inbox', render: renderRequests },
    messages: { title: 'Messages', kicker: '(04) — Conversations', render: renderMessages },
    sessions: { title: 'Sessions', kicker: '(05) — Your calendar', render: renderSessions },
    wallet: { title: 'Time <em class="serif">wallet</em>', kicker: '(06) — Credits', render: renderWallet },
    profile: { title: 'Your <em class="serif">profile</em>', kicker: '(07) — You', render: renderProfile }
  };

  var host = U.qs('[data-view-host]');
  var drawer = U.qs('[data-drawer]');
  var state = {
    view: null,
    discover: { q: '', category: 'All', mode: 'Any', day: 'Any', mutual: false, sort: 'match', layout: SE.storage.get('disc-layout', 'grid') },
    reqTab: 'incoming',
    thread: null,
    weekOffset: 0,
    sessLayout: SE.storage.get('sess-layout', 'week')
  };
  var intervals = [];
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

  /* ==========================================================================
     Helpers
     ========================================================================== */
  function first(name) { return String(name || '').split(' ')[0]; }

  function avatar(m, size) {
    var s = size || 44;
    var inner = m && m.avatar
      ? '<img src="' + esc(m.avatar) + '" alt="" loading="lazy">'
      : esc(U.initials(m ? m.name : '?'));
    return '<span class="avatar-img" style="--s:' + s + 'px">' + inner + '</span>';
  }

  function meAvatar(me, size) {
    return avatar({ name: me.name || me.username, avatar: me.photo }, size);
  }

  function ring(score, size) {
    return '<span class="ring" style="--p:' + score + ';--rs:' + (size || 52) + 'px"><span>' + score + '<small>%</small></span></span>';
  }

  function pills(list, cls, hits) {
    hits = (hits || []).map(function (h) { return String(h).toLowerCase(); });
    return (list || []).map(function (x) {
      var name = x.name || x;
      var hit = hits.indexOf(String(name).toLowerCase()) !== -1;
      return '<span class="pill' + (hit ? ' ' + (cls || 'is-hit') : '') + '">' + esc(name) + '</span>';
    }).join('');
  }

  function timeAgo(iso) {
    var s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 604800) return Math.round(s / 86400) + 'd ago';
    return fmtDay(iso);
  }

  function fmtDay(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  function relDay(iso) {
    var d = new Date(iso);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'long' });
  }

  function hours(n) {
    var r = Math.round(n * 10) / 10;
    return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1));
  }

  function greet() {
    var h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function emptyState(iconName, title, text, actionHtml) {
    return '<div class="empty"><span class="icon-tile">' + ic(iconName) + '</span><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p>' + (actionHtml || '') + '</div>';
  }

  function animateIn(scope) {
    if (!window.gsap || M.reduce) return;
    var items = U.qsa('[data-anim]', scope || host);
    if (items.length) window.gsap.from(items, { y: 26, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05, clearProps: 'transform,opacity' });
  }

  function countUp(scope) {
    U.qsa('[data-count-to]', scope || host).forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-count-to')) || 0;
      var decimals = (String(to).split('.')[1] || '').length;
      if (M.reduce) { el.textContent = to.toFixed(decimals); return; }
      var start = performance.now();
      (function tick(now) {
        var t = Math.min(1, (now - start) / 1100);
        var e = 1 - Math.pow(1 - t, 3);
        el.textContent = (to * e).toFixed(decimals);
        if (t < 1) requestAnimationFrame(tick);
      })(start);
    });
  }

  function fail(err) {
    U.toast(err && err.message ? err.message : 'Something went wrong', { type: 'error' });
  }

  /* ==========================================================================
     Router
     ========================================================================== */
  function route() {
    var v = (window.location.hash || '#overview').slice(1).split('?')[0];
    if (!VIEWS[v]) v = 'overview';
    show(v);
  }

  function show(v) {
    state.view = v;
    intervals.forEach(window.clearInterval);
    intervals = [];
    U.qsa('[data-view-link]').forEach(function (a) {
      var on = a.getAttribute('data-view-link') === v;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    U.qs('[data-view-title]').innerHTML = VIEWS[v].title;
    U.qs('[data-view-kicker]').textContent = VIEWS[v].kicker;
    document.title = U.qs('[data-view-title]').textContent + ' — Barterly';
    U.qs('[data-app]').classList.remove('is-menu-open');
    host.innerHTML = '<div class="view"><div class="skel" style="height:220px"></div><div class="skel" style="height:140px;margin-top:16px"></div></div>';
    window.scrollTo(0, 0);
    VIEWS[v].render().then(function () {
      animateIn();
      countUp();
    }).catch(function (err) {
      if (err && err.code === 401) window.location.replace('./signin.html?next=dashboard');
      else fail(err);
    });
    refreshChrome();
  }

  function rerender() { if (state.view) VIEWS[state.view].render().catch(fail); }

  /* ---------- sidebar badges, credits, bell ---------- */
  function refreshChrome() {
    return api.stats().then(function (st) {
      U.qsa('[data-badge="requests"]').forEach(function (b) { b.textContent = st.pendingIncoming; b.hidden = !st.pendingIncoming; });
      U.qsa('[data-badge="messages"]').forEach(function (b) { b.textContent = st.unread; b.hidden = !st.unread; });
      U.qs('[data-bell-dot]').hidden = !st.unreadNotifications;
      U.qs('[data-credit-value]').textContent = hours(st.credits);
      return st;
    });
  }

  /* ==========================================================================
     Overview
     ========================================================================== */
  function renderOverview() {
    return Promise.all([api.me(), api.stats(), api.sessions(), api.matches({ hideSkipped: true }), api.notifications()]).then(function (r) {
      var me = r[0], st = r[1], sessions = r[2], matches = r[3].slice(0, 4), notes = r[4].slice(0, 6);
      var next = sessions.filter(function (s) {
        return s.status === 'upcoming' && new Date(s.start).getTime() + s.duration * 60000 > Date.now();
      })[0];

      var bits = [];
      if (st.pendingIncoming) bits.push(st.pendingIncoming + ' new swap request' + (st.pendingIncoming > 1 ? 's' : ''));
      if (st.unread) bits.push(st.unread + ' unread message' + (st.unread > 1 ? 's' : ''));
      if (next) bits.push('a session ' + relDay(next.start) + ' at ' + fmtTime(next.start));
      var summary = bits.length ? 'You have ' + bits.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : 'All quiet — a great time to find your next match.';

      var learnLeft = Math.max(0, Math.floor(st.credits));

      host.innerHTML =
        '<div class="view ov-grid">' +
        // Hero
        '<article class="panel hero-card" data-anim>' +
        '<div><span class="panel-kicker">' + esc(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })) + '</span>' +
        '<h2>' + greet() + ', <em class="serif">' + esc(first(me.name || me.username)) + '.</em></h2>' +
        '<p>' + esc(summary) + '</p></div>' +
        '<div class="hero-actions">' +
        '<a class="btn btn-ink" href="#discover"><span class="btn-roll" data-text="Find a match">Find a match</span><span class="btn-arrow">' + ic('compass') + '</span></a>' +
        '<button class="btn btn-line" type="button" data-act="new-session"><span class="btn-roll" data-text="Book a session">Book a session</span></button>' +
        '</div>' +
        '<div class="rotate-badge hero-badge" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="hb-c" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"/></defs><text><textPath href="#hb-c" textLength="286" lengthAdjust="spacing">LEARN • TEACH • GROW • REPEAT •</textPath></text></svg>' +
        '<span class="rotate-badge-mark"><img src="./assets/brand/barterly-logo.svg" alt=""></span></div>' +
        '</article>' +
        // Next session
        '<article class="panel next-card" data-anim>' +
        '<div class="panel-head"><div><span class="panel-kicker">Up next</span><h2>Next <em class="serif">session</em></h2></div>' +
        '<a class="link-more" href="#sessions">Calendar' + ic('arrow-right') + '</a></div>' +
        (next
          ? '<div class="next-who">' + avatar(next.member, 52) + '<div><strong>' + esc(next.skill) + '</strong><span>' + (next.role === 'learn' ? 'Learning from ' : 'Teaching ') + esc(next.member ? next.member.name : '') + '</span></div></div>' +
            '<div class="countdown" data-countdown="' + esc(next.start) + '"><div><b data-cd="h">0</b><span>hours</span></div><div><b data-cd="m">0</b><span>min</span></div><div><b data-cd="s">0</b><span>sec</span></div></div>' +
            '<div class="next-meta"><span class="pill">' + ic('calendar') + esc(fmtDay(next.start)) + ', ' + esc(fmtTime(next.start)) + '</span><span class="pill">' + ic(next.mode === 'Online' ? 'video' : 'map-pin') + esc(next.place || next.mode) + '</span><span class="pill">' + ic('clock') + next.duration + ' min</span></div>' +
            '<div class="next-actions"><button class="btn btn-line btn-sm" type="button" data-act="ics" data-id="' + next.id + '"><span class="btn-roll" data-text="Add to calendar">Add to calendar</span></button>' +
            '<button class="btn btn-ink btn-sm" type="button" data-act="chat" data-id="' + next.memberId + '"><span class="btn-roll" data-text="Message">Message</span></button></div>'
          : emptyState('calendar', 'Nothing booked yet', 'Accept a request or book a session to see it here.', '<button class="btn btn-ink btn-sm" type="button" data-act="new-session"><span class="btn-roll" data-text="Book one">Book one</span></button>')) +
        '</article>' +
        // Stats
        statCard('wallet', 'Time credits', '<span data-count-to="' + hours(st.credits) + '">0</span><small>hours</small>', '≈ ' + learnLeft + ' one-hour session' + (learnLeft === 1 ? '' : 's') + ' you can learn', null, '#wallet') +
        statCard('check-circle', 'Sessions done', '<span data-count-to="' + st.sessionsDone + '">0</span>', st.upcoming + ' upcoming', null, '#sessions') +
        statCard('star', 'Your rating', st.rating ? '<span data-count-to="' + st.rating.toFixed(1) + '">0</span><small>/ 5</small>' : '—', st.rating ? 'From people you taught' : 'Teach a session to get rated', null, '#profile') +
        statCard('trending-up', 'Taught · Learned', hours(st.hoursTaught) + '<small>h</small> · ' + hours(st.hoursLearned) + '<small>h</small>', 'Balance keeps the exchange fair',
          (st.hoursTaught + st.hoursLearned) ? Math.round(st.hoursTaught / (st.hoursTaught + st.hoursLearned) * 100) : 50, '#wallet') +
        // Orbit
        '<article class="panel orbit-card" data-anim>' +
        '<div class="panel-head"><div><span class="panel-kicker">What you trade</span><h2>Your skill <em class="serif">orbit</em></h2></div><a class="link-more" href="#profile">Edit' + ic('arrow-right') + '</a></div>' +
        orbitHtml(me) +
        '<div class="orbit-legend"><span><i style="background:var(--accent-2)"></i>Can teach</span><span><i style="background:var(--primary)"></i>Wants to learn</span></div>' +
        '</article>' +
        // Matches
        '<article class="panel matches-card" data-anim>' +
        '<div class="panel-head"><div><span class="panel-kicker">Picked for you</span><h2>Top <em class="serif">matches</em></h2></div><a class="link-more" href="#discover">See all' + ic('arrow-right') + '</a></div>' +
        '<div class="mini-matches">' + matches.map(miniMatch).join('') + '</div>' +
        '</article>' +
        // Activity
        '<article class="panel activity-card" data-anim>' +
        '<div class="panel-head"><div><span class="panel-kicker">Latest</span><h2>Activity</h2></div><button class="link-more" type="button" data-act="notifications">All' + ic('arrow-right') + '</button></div>' +
        (notes.length ? '<ul class="feed">' + notes.map(feedItem).join('') + '</ul>' : emptyState('bell', 'No activity yet', 'Your requests, messages and sessions will show up here.')) +
        '</article>' +
        // Profile strength
        '<article class="panel strength-card" data-anim>' +
        '<div class="panel-head"><div><span class="panel-kicker">Get matched faster</span><h2>Profile <em class="serif">strength</em></h2></div></div>' +
        '<div class="strength">' + ring(st.profileStrength, 96) +
        '<ul class="checklist">' + (st.missing.length
          ? st.missing.map(function (m) { return '<li>' + ic('plus') + esc(m) + '</li>'; }).join('') + '<li><a class="link-more" href="#profile">Complete profile' + ic('arrow-right') + '</a></li>'
          : '<li>' + ic('check-circle') + 'Your profile is complete — nice!</li>') +
        '</ul></div></article>' +
        '</div>';

      layoutOrbit();
      if (next) startCountdown();
      initRolls();
    });
  }

  function statCard(iconName, label, value, foot, bar, href) {
    return '<a class="panel stat-card" href="' + href + '" data-anim>' +
      '<span class="stat-top">' + esc(label) + '<span class="icon-tile">' + ic(iconName) + '</span></span>' +
      '<span class="stat-value">' + value + '</span>' +
      (bar !== null && bar !== undefined ? '<span class="stat-bar"><i style="width:' + bar + '%"></i></span>' : '') +
      '<span class="stat-foot">' + esc(foot) + '</span></a>';
  }

  function orbitHtml(me) {
    var teach = me.teach.length ? me.teach : [{ name: 'Add a skill' }];
    var learn = me.learn.length ? me.learn : [{ name: 'Add a goal' }];
    function chips(list, offset) {
      return list.map(function (s, i) {
        return '<span class="orbit-chip" style="--a:' + Math.round(offset + (360 / list.length) * i) + 'deg"><span>' + esc(s.name) + '</span></span>';
      }).join('');
    }
    return '<div class="orbit" data-orbit>' +
      '<div class="orbit-ring is-outer">' + chips(learn, 30) + '</div>' +
      '<div class="orbit-ring is-inner">' + chips(teach, -60) + '</div>' +
      '<div class="orbit-core">' + meAvatar(me, 120) + '</div></div>';
  }

  function layoutOrbit() {
    U.qsa('.orbit-ring').forEach(function (ringEl) {
      ringEl.style.setProperty('--r', ringEl.offsetWidth / 2 + 'px');
    });
  }

  function miniMatch(m) {
    var action = m.connected
      ? '<button class="btn btn-line btn-sm" type="button" data-act="chat" data-id="' + m.id + '"><span class="btn-roll" data-text="Chat">Chat</span></button>'
      : m.pending
        ? '<span class="pill pill-warn">' + ic('clock') + 'Pending</span>'
        : '<button class="btn btn-ink btn-sm" type="button" data-act="request" data-id="' + m.id + '"><span class="btn-roll" data-text="Request">Request</span></button>';
    return '<div class="mini-match">' +
      '<button type="button" data-act="view-member" data-id="' + m.id + '" aria-label="View ' + esc(m.name) + '">' + avatar(m, 48) + '</button>' +
      '<div><strong>' + esc(m.name) + (m.verified ? ic('badge-check', 'verified') : '') + '</strong>' +
      '<div class="mini-swap"><span class="pill is-hit">' + esc(m.match.theyTeach) + '</span>' + ic('arrow-left-right') + '<span class="pill is-give">' + esc(m.match.youTeach) + '</span></div></div>' +
      ring(m.match.score, 48) + action + '</div>';
  }

  function feedItem(n) {
    return '<li class="' + (n.read ? '' : 'is-unread') + '"><span class="icon-tile">' + ic(n.icon || 'bell') + '</span>' +
      '<div><strong>' + esc(n.title) + '</strong><span>' + esc(n.body) + '</span></div><time>' + esc(timeAgo(n.at)) + '</time></li>';
  }

  function startCountdown() {
    var el = U.qs('[data-countdown]');
    if (!el) return;
    var target = new Date(el.getAttribute('data-countdown')).getTime();
    function tick() {
      var d = Math.max(0, target - Date.now());
      U.qs('[data-cd="h"]', el).textContent = Math.floor(d / 3600000);
      U.qs('[data-cd="m"]', el).textContent = String(Math.floor(d / 60000) % 60).padStart(2, '0');
      U.qs('[data-cd="s"]', el).textContent = String(Math.floor(d / 1000) % 60).padStart(2, '0');
    }
    tick();
    intervals.push(window.setInterval(tick, 1000));
  }

  /* ==========================================================================
     Discover
     ========================================================================== */
  function renderDiscover() {
    var f = state.discover;
    var cats = ['All'].concat(api.categories.filter(function (c) { return c !== 'Other'; }));
    host.innerHTML =
      '<div class="view">' +
      '<div class="toolbar" data-anim>' +
      '<label class="search-field">' + ic('search') + '<input type="search" placeholder="Search by name, skill or interest…" value="' + esc(f.q) + '" data-f="q" aria-label="Search members"></label>' +
      '<select class="select-pill" data-f="mode" aria-label="Format">' + ['Any', 'Online', 'In person'].map(function (o) { return '<option' + (f.mode === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<select class="select-pill" data-f="day" aria-label="Free on">' + ['Any'].concat(DAYS).map(function (o) { return '<option value="' + o + '"' + (f.day === o ? ' selected' : '') + '>' + (o === 'Any' ? 'Any day' : 'Free ' + o) + '</option>'; }).join('') + '</select>' +
      '<select class="select-pill" data-f="sort" aria-label="Sort">' + [['match', 'Best match'], ['rating', 'Top rated'], ['sessions', 'Most sessions']].map(function (o) { return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<button class="chip-toggle" type="button" aria-pressed="' + f.mutual + '" data-f="mutual">' + '⇄ Mutual only</button>' +
      '<span class="grow"></span>' +
      '<div class="segmented-sm" role="group" aria-label="Layout">' +
      '<button type="button" aria-pressed="' + (f.layout === 'grid') + '" data-layout="grid">' + ic('grid') + 'Grid</button>' +
      '<button type="button" aria-pressed="' + (f.layout === 'swipe') + '" data-layout="swipe">' + ic('cards') + 'Swipe</button></div>' +
      '</div>' +
      '<div class="chips-scroll" data-anim>' + cats.map(function (c) { return '<button class="chip-toggle" type="button" data-cat="' + c + '" aria-pressed="' + (f.category === c) + '">' + c + '</button>'; }).join('') + '</div>' +
      '<div data-results></div></div>';

    var view = U.qs('.view', host);
    U.qs('[data-f="q"]', view).addEventListener('input', U.debounce(function (e) { f.q = e.target.value; loadResults(); }, 180));
    ['mode', 'day', 'sort'].forEach(function (k) {
      U.qs('[data-f="' + k + '"]', view).addEventListener('change', function (e) { f[k] = e.target.value; loadResults(); });
    });
    U.qs('[data-f="mutual"]', view).addEventListener('click', function (e) {
      f.mutual = !f.mutual;
      e.currentTarget.setAttribute('aria-pressed', String(f.mutual));
      loadResults();
    });
    U.qsa('[data-cat]', view).forEach(function (b) {
      b.addEventListener('click', function () {
        f.category = b.getAttribute('data-cat');
        U.qsa('[data-cat]', view).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        loadResults();
      });
    });
    U.qsa('[data-layout]', view).forEach(function (b) {
      b.addEventListener('click', function () {
        f.layout = b.getAttribute('data-layout');
        SE.storage.set('disc-layout', f.layout);
        U.qsa('[data-layout]', view).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        loadResults();
      });
    });
    return loadResults();
  }

  function loadResults() {
    var f = state.discover;
    var box = U.qs('[data-results]');
    if (!box) return Promise.resolve();
    return api.matches({ q: f.q, category: f.category, mode: f.mode, day: f.day, mutual: f.mutual, sort: f.sort, hideSkipped: f.layout === 'swipe' }).then(function (list) {
      if (f.layout === 'swipe') { renderDeck(box, list); return; }
      box.innerHTML = '<p class="result-meta">' + list.length + ' ' + (list.length === 1 ? 'person' : 'people') + ' · sorted by ' + ({ match: 'best match', rating: 'rating', sessions: 'sessions' })[f.sort] + '</p>' +
        (list.length ? '<div class="m-grid">' + list.map(memberCard).join('') + '</div>'
          : emptyState('search', 'No one matches those filters', 'Try another category or clear the search.'));
      animateIn(box);
      initRolls(box);
    });
  }

  function memberCard(m) {
    var me = A.currentUser() || {};
    var myTeach = (me.teach || []).map(function (t) { return t.name; });
    return '<article class="m-card" data-anim>' +
      '<header><button type="button" data-act="view-member" data-id="' + m.id + '" aria-label="View ' + esc(m.name) + '">' + avatar(m, 56) + '</button>' +
      '<div><span class="m-name">' + esc(m.name) + (m.verified ? ic('badge-check', 'verified') : '') + '</span>' +
      '<span class="m-sub">' + esc([m.program, m.year].filter(Boolean).join(' · ') || 'Member') + '</span></div>' + ring(m.match.score) + '</header>' +
      (m.bio ? '<p class="m-bio">' + esc(m.bio) + '</p>' : '') +
      '<div class="m-row"><span class="m-label">Teaches</span>' + pills(m.teach, 'is-hit', m.match.wantHits) + '</div>' +
      '<div class="m-row"><span class="m-label">Wants</span>' + pills(m.learn, 'is-give', myTeach) + '</div>' +
      (m.match.reasons.length ? '<ul class="reasons">' + m.match.reasons.slice(0, 3).map(function (r) { return '<li>' + ic('check-circle') + esc(r) + '</li>'; }).join('') + '</ul>' : '') +
      '<footer><span class="m-rating">' + (m.rating ? '<b>★</b> ' + m.rating.toFixed(1) + ' · ' + m.sessionsDone + ' sessions' : 'New member') + '</span>' +
      '<button class="icon-button save-btn" type="button" aria-label="Save ' + esc(m.name) + '" aria-pressed="' + !!m.saved + '" data-act="save" data-id="' + m.id + '">' + ic('heart') + '</button>' +
      (m.connected
        ? '<button class="btn btn-line btn-sm" type="button" data-act="chat" data-id="' + m.id + '"><span class="btn-roll" data-text="Chat">Chat</span></button>'
        : m.pending
          ? '<span class="pill pill-warn">' + ic('clock') + 'Pending</span>'
          : '<button class="btn btn-ink btn-sm" type="button" data-act="request" data-id="' + m.id + '"><span class="btn-roll" data-text="Request swap">Request swap</span></button>') +
      '</footer></article>';
  }

  /* ---------- Swipe deck ---------- */
  function renderDeck(box, list) {
    // Only people you haven't connected with or already asked
    list = list.filter(function (m) { return !m.pending && !m.connected; });
    var queue = list.slice();
    box.innerHTML = '<div class="deck-wrap"><div class="deck" data-deck tabindex="0" aria-label="Swipe deck. Right arrow to request, left arrow to skip."></div>' +
      '<div class="deck-actions">' +
      '<button class="deck-btn is-nope" type="button" data-deck-act="nope" aria-label="Skip">' + ic('x') + '</button>' +
      '<button class="deck-btn is-save" type="button" data-deck-act="save" aria-label="Save">' + ic('heart') + '</button>' +
      '<button class="deck-btn is-like" type="button" data-deck-act="like" aria-label="Request swap">' + ic('arrow-left-right') + '</button></div>' +
      '<p class="deck-hint">Drag the card · ← skip · → request a swap</p></div>';
    var deck = U.qs('[data-deck]', box);

    function cardHtml(m) {
      return '<article class="deck-card" data-id="' + m.id + '">' +
        '<div class="deck-hero">' + avatar(m, 132) + ring(m.match.score, 64) +
        '<span class="deck-stamp is-like">SWAP</span><span class="deck-stamp is-nope">SKIP</span></div>' +
        '<div class="deck-body"><span class="m-name">' + esc(m.name) + (m.verified ? ic('badge-check', 'verified') : '') + '</span>' +
        '<span class="m-sub">' + esc([m.program, m.year].filter(Boolean).join(' · ')) + (m.rating ? ' · ★ ' + m.rating.toFixed(1) : '') + '</span>' +
        '<div class="deck-swap"><span class="pill is-hit">' + esc(m.match.theyTeach) + '</span>' + ic('arrow-left-right') + '<span class="pill is-give">' + esc(m.match.youTeach) + '</span></div>' +
        (m.bio ? '<p class="m-bio">' + esc(m.bio) + '</p>' : '') +
        '<ul class="reasons">' + m.match.reasons.slice(0, 3).map(function (r) { return '<li>' + ic('check-circle') + esc(r) + '</li>'; }).join('') + '</ul>' +
        '</div></article>';
    }

    function fill() {
      var shown = U.qsa('.deck-card', deck).length;
      while (shown < 3 && queue.length) {
        deck.insertAdjacentHTML('afterbegin', cardHtml(queue.shift()));
        shown++;
      }
      if (!U.qsa('.deck-card', deck).length) {
        deck.innerHTML = emptyState('sparkles', 'You’re all caught up', 'You’ve seen everyone for these filters.',
          '<button class="btn btn-ink btn-sm" type="button" data-deck-reset><span class="btn-roll" data-text="Show skipped again">Show skipped again</span></button>');
        var reset = U.qs('[data-deck-reset]', deck);
        if (reset) reset.addEventListener('click', function () { api.clearSkipped().then(loadResults); });
      }
      bindTop();
    }

    function top() { var all = U.qsa('.deck-card', deck); return all[all.length - 1]; }

    function fly(card, dir) {
      var id = card.getAttribute('data-id');
      card.style.transition = 'transform 500ms cubic-bezier(.22,1,.36,1), opacity 400ms ease';
      card.style.transform = 'translate(' + dir * 140 + '%, -10%) rotate(' + dir * 24 + 'deg)';
      card.style.opacity = '0';
      window.setTimeout(function () { card.remove(); fill(); }, 380);
      var m = list.filter(function (x) { return x.id === id; })[0];
      if (dir > 0 && m) openRequestModal(m);
      else api.skip(id);
    }

    function bindTop() {
      var card = top();
      if (!card || card.dataset.bound) return;
      card.dataset.bound = '1';
      var startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
      var like = U.qs('.is-like', card), nope = U.qs('.is-nope', card);
      card.addEventListener('pointerdown', function (e) {
        dragging = true; startX = e.clientX; startY = e.clientY; dx = dy = 0;
        card.classList.add('is-dragging');
        card.setPointerCapture(e.pointerId);
      });
      card.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        dx = e.clientX - startX; dy = e.clientY - startY;
        card.style.transform = 'translate(' + dx + 'px,' + dy * 0.3 + 'px) rotate(' + dx / 16 + 'deg)';
        like.style.opacity = Math.max(0, Math.min(1, dx / 100));
        nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
      });
      function end() {
        if (!dragging) return;
        dragging = false;
        card.classList.remove('is-dragging');
        if (Math.abs(dx) > 110) { fly(card, dx > 0 ? 1 : -1); return; }
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) { openMember(card.getAttribute('data-id')); }
        card.style.transform = '';
        like.style.opacity = nope.style.opacity = 0;
      }
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    }

    U.qsa('[data-deck-act]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var card = top();
        if (!card) return;
        var act = b.getAttribute('data-deck-act');
        if (act === 'save') {
          api.toggleSave(card.getAttribute('data-id')).then(function (saved) { U.toast(saved ? 'Saved to your list' : 'Removed from saved', { type: 'success' }); });
          return;
        }
        fly(card, act === 'like' ? 1 : -1);
      });
    });

    deck.addEventListener('keydown', function (e) {
      var card = top();
      if (!card) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); fly(card, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); fly(card, -1); }
    });

    fill();
  }

  /* ---------- Request modal ---------- */
  function openRequestModal(m) {
    var me = A.currentUser() || {};
    var mine = (me.teach || []).map(function (t) { return t.name; });
    var theirs = (m.teach || []).map(function (t) { return t.name; });
    var match = m.match || api.score(me, m);
    var formats = ['One-to-one', 'Small group', 'Online', 'In person', 'Project-based'];
    var dlg = U.modal({
      title: 'Propose a swap with ' + first(m.name),
      html:
        '<form class="form-stack" novalidate data-req-form>' +
        '<div class="mini-match" style="grid-template-columns:auto 1fr auto">' + avatar(m, 44) + '<div><strong>' + esc(m.name) + '</strong><div class="mini-swap">' + esc(m.program || '') + '</div></div>' + ring(match.score, 44) + '</div>' +
        '<div class="form-row">' +
        '<label class="field"><span class="field-label">You teach</span>' +
        (mine.length ? '<select class="select" name="offer">' + mine.map(function (s) { return '<option' + (s === match.youTeach ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>'
          : '<input class="input" name="offer" placeholder="A skill you can share" required>') + '</label>' +
        '<label class="field"><span class="field-label">You learn</span><select class="select" name="want">' + theirs.map(function (s) { return '<option' + (s === match.theyTeach ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">Format</span><select class="select" name="format">' + formats.map(function (s) { return '<option' + ((m.formats || [])[0] === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="field-label">Message <small>Say hi — it helps!</small></span><textarea class="textarea" name="message" rows="3" maxlength="400">Hi ' + esc(first(m.name)) + '! I’d love to learn ' + esc(match.theyTeach) + ' from you, and I can teach you ' + esc(match.youTeach) + ' in return. When are you usually free?</textarea></label>' +
        '<button class="button button-primary button-lg button-block" type="submit"><span class="button-label">Send request</span>' + ic('send', 'icon-shift') + '</button>' +
        '</form>'
    });
    dlg.el.parentElement.classList.add('modal-wide');
    U.qs('[data-req-form]', dlg.el).addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.currentTarget;
      var offer = form.offer.value.trim();
      if (!offer) { form.offer.focus(); return; }
      api.sendRequest({ memberId: m.id, offer: offer, want: form.want.value, format: form.format.value, message: form.message.value.trim() })
        .then(function () {
          dlg.close();
          U.toast('Request sent to ' + first(m.name) + '. Demo members usually reply within seconds.', { type: 'success', title: 'Swap proposed' });
          refreshChrome();
          if (state.view === 'discover' && state.discover.layout === 'grid') loadResults();
          if (state.view === 'overview') rerender();
        }).catch(fail);
    });
  }

  /* ==========================================================================
     Requests
     ========================================================================== */
  function renderRequests() {
    return api.requests().then(function (all) {
      var tabs = {
        incoming: all.filter(function (r) { return r.direction === 'incoming' && r.status === 'pending'; }),
        sent: all.filter(function (r) { return r.direction === 'outgoing' && r.status === 'pending'; }),
        history: all.filter(function (r) { return r.status !== 'pending'; })
      };
      var list = tabs[state.reqTab];
      host.innerHTML = '<div class="view">' +
        '<div class="toolbar" data-anim><div class="segmented-sm" role="tablist" aria-label="Requests">' +
        [['incoming', 'Incoming'], ['sent', 'Sent'], ['history', 'History']].map(function (t) {
          return '<button type="button" role="tab" aria-selected="' + (state.reqTab === t[0]) + '" data-req-tab="' + t[0] + '">' + t[1] + ' <b>' + tabs[t[0]].length + '</b></button>';
        }).join('') + '</div><span class="grow"></span><a class="btn btn-ink btn-sm" href="#discover"><span class="btn-roll" data-text="Find people">Find people</span></a></div>' +
        (list.length ? '<div class="req-list">' + list.map(requestItem).join('') + '</div>'
          : emptyState('inbox', state.reqTab === 'incoming' ? 'No new requests' : state.reqTab === 'sent' ? 'Nothing pending' : 'No history yet',
            'Requests you send and receive will appear here.', '<a class="btn btn-ink btn-sm" href="#discover"><span class="btn-roll" data-text="Discover matches">Discover matches</span></a>')) +
        '</div>';
      U.qsa('[data-req-tab]', host).forEach(function (b) {
        b.addEventListener('click', function () { state.reqTab = b.getAttribute('data-req-tab'); renderRequests().then(function () { animateIn(); }); });
      });
      initRolls();
    });
  }

  function requestItem(r) {
    var m = r.member || { name: 'Member' };
    var incoming = r.direction === 'incoming';
    var status = { pending: ['pill-warn', 'Pending'], accepted: ['pill-success', 'Accepted'], declined: ['pill-danger', 'Declined'], cancelled: ['', 'Cancelled'] }[r.status] || ['', r.status];
    var theyTeach = incoming ? r.offer : r.want;
    var youTeach = incoming ? r.want : r.offer;
    var actions = '';
    if (r.status === 'pending' && incoming) {
      actions = '<button class="btn btn-ink btn-sm" type="button" data-act="accept" data-id="' + r.id + '"><span class="btn-roll" data-text="Accept">Accept</span></button>' +
        '<button class="btn btn-line btn-sm" type="button" data-act="decline" data-id="' + r.id + '"><span class="btn-roll" data-text="Decline">Decline</span></button>';
    } else if (r.status === 'pending') {
      actions = '<button class="btn btn-line btn-sm" type="button" data-act="cancel-req" data-id="' + r.id + '"><span class="btn-roll" data-text="Withdraw">Withdraw</span></button>';
    } else if (r.status === 'accepted') {
      actions = '<button class="btn btn-ink btn-sm" type="button" data-act="chat" data-id="' + r.memberId + '"><span class="btn-roll" data-text="Open chat">Open chat</span></button>';
    }
    return '<article class="req" data-anim>' +
      '<button type="button" data-act="view-member" data-id="' + r.memberId + '" aria-label="View ' + esc(m.name) + '">' + avatar(m, 52) + '</button>' +
      '<div><h3>' + (incoming ? esc(first(m.name)) + ' wants to swap' : 'You asked ' + esc(first(m.name))) + ' <span class="pill ' + status[0] + '">' + status[1] + '</span></h3>' +
      '<div class="req-swap"><span class="pill is-hit">They teach · ' + esc(theyTeach) + '</span>' + ic('arrow-left-right') + '<span class="pill is-give">You teach · ' + esc(youTeach) + '</span>' + (r.format ? '<span class="pill">' + esc(r.format) + '</span>' : '') + '</div>' +
      (r.message ? '<p class="req-msg">“' + esc(r.message) + '”</p>' : '') +
      '<p class="req-meta">' + esc(timeAgo(r.at)) + (m.rating ? ' · ★ ' + m.rating.toFixed(1) + ' · ' + m.sessionsDone + ' sessions' : '') + '</p></div>' +
      '<div class="req-actions">' + actions + '</div></article>';
  }

  /* ==========================================================================
     Messages
     ========================================================================== */
  function renderMessages() {
    return api.threads().then(function (threads) {
      if (!threads.length) {
        host.innerHTML = '<div class="view">' + emptyState('message', 'No conversations yet', 'Accept a request or propose a swap to start chatting.', '<a class="btn btn-ink btn-sm" href="#discover"><span class="btn-roll" data-text="Discover matches">Discover matches</span></a>') + '</div>';
        initRolls();
        return;
      }
      if (!state.thread || !threads.some(function (t) { return t.id === state.thread; })) {
        state.thread = window.innerWidth > 760 ? threads[0].id : null;
      }
      host.innerHTML = '<div class="view chat' + (state.thread && window.innerWidth <= 760 ? ' is-thread-open' : '') + '" data-anim>' +
        '<div class="threads"><label class="search-field">' + ic('search') + '<input type="search" placeholder="Search chats" data-thread-search aria-label="Search chats"></label>' +
        '<ul class="thread-list" data-thread-list></ul></div>' +
        '<section class="convo" data-convo></section></div>';
      drawThreads(threads);
      U.qs('[data-thread-search]').addEventListener('input', function (e) {
        var q = e.target.value.toLowerCase();
        drawThreads(threads.filter(function (t) { return (t.member ? t.member.name : '').toLowerCase().indexOf(q) !== -1; }));
      });
      if (state.thread) openThread(state.thread, threads);
    });
  }

  function lastText(t) {
    var last = t.messages[t.messages.length - 1];
    if (!last) return 'Say hi 👋';
    return (last.from === 'me' ? 'You: ' : '') + last.text;
  }

  function drawThreads(threads) {
    var ul = U.qs('[data-thread-list]');
    if (!ul) return;
    ul.innerHTML = threads.map(function (t) {
      var m = t.member || { name: 'Member' };
      return '<li><button class="thread-item' + (t.id === state.thread ? ' is-active' : '') + '" type="button" data-thread="' + t.id + '">' + avatar(m, 44) +
        '<span><strong>' + esc(m.name) + '</strong><p>' + esc(lastText(t)) + '</p></span>' +
        '<span class="thread-side">' + esc(timeAgo(t.updatedAt)) + (t.unread && t.id !== state.thread ? '<b>' + t.unread + '</b>' : '') + '</span></button></li>';
    }).join('');
    U.qsa('[data-thread]', ul).forEach(function (b) {
      b.addEventListener('click', function () {
        state.thread = b.getAttribute('data-thread');
        api.threads().then(function (all) {
          drawThreads(all);
          openThread(state.thread, all);
        });
      });
    });
  }

  function openThread(id, threads) {
    var t = threads.filter(function (x) { return x.id === id; })[0];
    var box = U.qs('[data-convo]');
    if (!t || !box) return;
    var m = t.member || { name: 'Member' };
    U.qs('.chat').classList.add('is-thread-open');
    box.innerHTML =
      '<header class="convo-head"><button class="icon-button convo-back" type="button" aria-label="Back to chats" data-convo-back>' + ic('arrow-left') + '</button>' +
      '<button type="button" data-act="view-member" data-id="' + t.memberId + '">' + avatar(m, 44) + '</button>' +
      '<div><strong>' + esc(m.name) + '</strong><span class="convo-status"><i></i>' + (m.demo ? 'Demo member · replies instantly' : 'Member') + '</span></div>' +
      '<button class="btn btn-line btn-sm" type="button" data-act="book" data-id="' + t.memberId + '"><span class="btn-roll" data-text="Book session">Book session</span></button></header>' +
      '<div class="msgs" data-msgs aria-live="polite">' + messagesHtml(t.messages, m) + '</div>' +
      '<div class="quick-replies">' + ['When are you free this week? 📅', 'Library or online?', 'Can you share some notes?', 'Thanks a lot! 🙌'].map(function (q) {
        return '<button class="chip" type="button" data-quick="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('') + '</div>' +
      '<form class="composer" data-composer><label class="sr-only" for="composer-input">Message</label>' +
      '<textarea id="composer-input" rows="1" placeholder="Message ' + esc(first(m.name)) + '…" maxlength="2000"></textarea>' +
      '<button class="send-btn" type="submit" aria-label="Send" disabled>' + ic('send') + '</button></form>';

    var msgs = U.qs('[data-msgs]', box);
    msgs.scrollTop = msgs.scrollHeight;
    api.markThreadRead(id).then(refreshChrome);

    var form = U.qs('[data-composer]', box);
    var ta = U.qs('textarea', form);
    var send = U.qs('.send-btn', form);
    ta.addEventListener('input', function () {
      ta.style.height = 'auto';
      ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
      send.disabled = !ta.value.trim();
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      ta.style.height = 'auto';
      send.disabled = true;
      api.sendMessage(id, text).then(function (msg) {
        appendMessage(msg, m);
        updateThreadPreview(id, msg);
      }).catch(fail);
    });
    U.qsa('[data-quick]', box).forEach(function (b) {
      b.addEventListener('click', function () { ta.value = b.getAttribute('data-quick'); ta.dispatchEvent(new Event('input')); ta.focus(); });
    });
    U.qs('[data-convo-back]', box).addEventListener('click', function () {
      U.qs('.chat').classList.remove('is-thread-open');
    });
    if (window.innerWidth > 760) ta.focus({ preventScroll: true });
  }

  function messagesHtml(list, m) {
    var out = '';
    var lastDay = '';
    list.forEach(function (msg) {
      var day = new Date(msg.at).toDateString();
      if (day !== lastDay) {
        out += '<span class="day-sep">' + esc(relDay(msg.at) === 'today' ? 'Today' : relDay(msg.at) === 'yesterday' ? 'Yesterday' : fmtDay(msg.at)) + '</span>';
        lastDay = day;
      }
      out += bubble(msg, m);
    });
    return out;
  }

  function bubble(msg) {
    if (msg.from === 'system') return '<p class="msg msg-system">' + esc(msg.text) + '</p>';
    return '<p class="msg ' + (msg.from === 'me' ? 'msg-me' : 'msg-them') + '">' + esc(msg.text) + '<time>' + esc(fmtTime(msg.at)) + '</time></p>';
  }

  function appendMessage(msg, m) {
    var msgs = U.qs('[data-msgs]');
    if (!msgs) return;
    var typing = U.qs('.typing', msgs);
    if (typing) typing.remove();
    msgs.insertAdjacentHTML('beforeend', bubble(msg, m));
    msgs.scrollTop = msgs.scrollHeight;
  }

  function updateThreadPreview(id, msg) {
    var btn = U.qs('[data-thread="' + id + '"]');
    if (!btn) return;
    var p = U.qs('p', btn);
    if (p) p.textContent = (msg.from === 'me' ? 'You: ' : '') + msg.text;
    var li = btn.parentElement;
    li.parentElement.prepend(li);
  }

  /* ==========================================================================
     Sessions
     ========================================================================== */
  function weekStart(offset) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    var day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day + offset * 7);
    return d;
  }

  function renderSessions() {
    return api.sessions().then(function (sessions) {
      var start = weekStart(state.weekOffset);
      var end = new Date(start.getTime() + 7 * 86400000);
      var label = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' – ' + new Date(end - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      var week = state.sessLayout === 'week';
      host.innerHTML = '<div class="view">' +
        '<div class="toolbar" data-anim>' +
        '<div class="segmented-sm" role="group" aria-label="Layout"><button type="button" aria-pressed="' + week + '" data-sess-layout="week">' + ic('calendar') + 'Week</button><button type="button" aria-pressed="' + !week + '" data-sess-layout="list">' + ic('menu') + 'List</button></div>' +
        (week ? '<button class="icon-button" type="button" aria-label="Previous week" data-week="-1">' + ic('chevron-left') + '</button><strong>' + esc(label) + '</strong><button class="icon-button" type="button" aria-label="Next week" data-week="1">' + ic('chevron-right') + '</button><button class="chip-toggle" type="button" data-week="0">Today</button>' : '') +
        '<span class="grow"></span><button class="btn btn-ink btn-sm" type="button" data-act="new-session"><span class="btn-roll" data-text="New session">New session</span></button></div>' +
        (week ? weekHtml(start, sessions) : listHtml(sessions)) +
        '<div class="legend"><span><i style="background:var(--accent-2)"></i>You teach</span><span><i style="background:var(--primary)"></i>You learn</span></div>' +
        '</div>';
      U.qsa('[data-sess-layout]', host).forEach(function (b) {
        b.addEventListener('click', function () { state.sessLayout = b.getAttribute('data-sess-layout'); SE.storage.set('sess-layout', state.sessLayout); renderSessions().then(function () { animateIn(); }); });
      });
      U.qsa('[data-week]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = Number(b.getAttribute('data-week'));
          state.weekOffset = v === 0 ? 0 : state.weekOffset + v;
          renderSessions();
        });
      });
      var scroller = U.qs('.week', host);
      if (scroller) scroller.scrollTop = 46 * 8;
      initRolls();
    });
  }

  function weekHtml(start, sessions) {
    var H0 = 8, H1 = 22, SLOT = 46;
    var todayKey = new Date().toDateString();
    var out = '<div class="week" data-anim><div></div>';
    for (var i = 0; i < 7; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      out += '<div class="week-head' + (d.toDateString() === todayKey ? ' is-today' : '') + '">' + DAYS[i] + '<b>' + d.getDate() + '</b></div>';
    }
    out += '<div class="week-hours">';
    for (var h = H0; h < H1; h++) out += '<span>' + (h % 12 || 12) + (h < 12 ? 'am' : 'pm') + '</span>';
    out += '</div>';
    for (var c = 0; c < 7; c++) {
      var day = new Date(start.getTime() + c * 86400000);
      var isToday = day.toDateString() === todayKey;
      out += '<div class="week-col' + (isToday ? ' is-today' : '') + '">';
      for (var s = H0; s < H1; s++) out += '<span class="slot"></span>';
      if (isToday) {
        var now = new Date();
        var mins = (now.getHours() - H0) * 60 + now.getMinutes();
        if (mins >= 0 && mins <= (H1 - H0) * 60) out += '<span class="now-line" style="top:' + (mins / 60 * SLOT) + 'px"></span>';
      }
      sessions.filter(function (x) { return new Date(x.start).toDateString() === day.toDateString(); }).forEach(function (x) {
        var st = new Date(x.start);
        var top = ((st.getHours() - H0) * 60 + st.getMinutes()) / 60 * SLOT;
        var height = Math.max(34, x.duration / 60 * SLOT - 4);
        if (top < 0 || top > (H1 - H0) * SLOT) return;
        out += '<button class="ev is-' + x.role + ' is-' + x.status + '" type="button" style="top:' + top + 'px;height:' + height + 'px" data-act="session" data-id="' + x.id + '">' +
          '<strong>' + esc(x.skill) + '</strong><span>' + esc(fmtTime(x.start)) + ' · ' + esc(first(x.member ? x.member.name : '')) + '</span></button>';
      });
      out += '</div>';
    }
    return out + '</div>';
  }

  function listHtml(sessions) {
    var now = Date.now();
    var upcoming = sessions.filter(function (s) { return s.status === 'upcoming' && new Date(s.start).getTime() + s.duration * 60000 > now; });
    var past = sessions.filter(function (s) { return upcoming.indexOf(s) === -1; }).reverse();
    function item(s) {
      var d = new Date(s.start);
      var status = s.status === 'completed' ? '<span class="pill pill-success">Completed</span>' : s.status === 'cancelled' ? '<span class="pill pill-danger">Cancelled</span>' : '<span class="pill pill-warn">' + esc(relDay(s.start)) + '</span>';
      return '<article class="sess" data-anim><span class="sess-date"><b>' + d.getDate() + '</b><span>' + d.toLocaleDateString('en-IN', { month: 'short' }) + '</span></span>' + avatar(s.member, 44) +
        '<div><h3>' + esc(s.skill) + ' ' + status + '</h3><p>' + (s.role === 'learn' ? 'Learning from ' : 'Teaching ') + esc(s.member ? s.member.name : '') + ' · ' + esc(fmtTime(s.start)) + ' · ' + s.duration + ' min · ' + esc(s.place || s.mode) + '</p></div>' +
        '<div class="sess-actions">' + sessionActions(s) + '</div></article>';
    }
    return '<div class="sess-list">' +
      '<p class="panel-kicker" data-anim>Upcoming</p>' + (upcoming.length ? upcoming.map(item).join('') : emptyState('calendar', 'Nothing upcoming', 'Book a session with one of your connections.')) +
      '<p class="panel-kicker" data-anim style="margin-top:12px">Past</p>' + (past.length ? past.map(item).join('') : '<p class="stat-foot">No past sessions yet.</p>') +
      '</div>';
  }

  function sessionActions(s) {
    var out = '<button class="icon-button" type="button" aria-label="Add to calendar" data-act="ics" data-id="' + s.id + '">' + ic('download') + '</button>' +
      '<button class="icon-button" type="button" aria-label="Message" data-act="chat" data-id="' + s.memberId + '">' + ic('message') + '</button>';
    if (s.status === 'upcoming') {
      out += '<button class="btn btn-ink btn-sm" type="button" data-act="complete" data-id="' + s.id + '"><span class="btn-roll" data-text="Mark done">Mark done</span></button>' +
        '<button class="icon-button" type="button" aria-label="Cancel session" data-act="cancel-sess" data-id="' + s.id + '">' + ic('x') + '</button>';
    }
    return out;
  }

  function openSessionDetail(id) {
    api.sessions().then(function (all) {
      var s = all.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var dlg = U.modal({
        title: s.skill,
        html: '<div class="form-stack"><div class="next-who">' + avatar(s.member, 52) + '<div><strong>' + esc(s.member ? s.member.name : '') + '</strong><span>' + (s.role === 'learn' ? 'Teaching you' : 'Learning from you') + '</span></div></div>' +
          '<div class="next-meta"><span class="pill">' + ic('calendar') + esc(fmtDay(s.start)) + ', ' + esc(fmtTime(s.start)) + '</span><span class="pill">' + ic('clock') + s.duration + ' min</span><span class="pill">' + ic(s.mode === 'Online' ? 'video' : 'map-pin') + esc(s.place || s.mode) + '</span><span class="pill">' + esc(s.status) + '</span></div>' +
          (s.ratingGiven ? '<p class="req-msg">You rated ' + '★'.repeat(s.ratingGiven.stars) + (s.ratingGiven.tags && s.ratingGiven.tags.length ? ' · ' + esc(s.ratingGiven.tags.join(', ')) : '') + '</p>' : '') +
          '<div class="sess-actions" data-detail-actions>' + sessionActions(s) + '</div></div>'
      });
      U.qs('[data-detail-actions]', dlg.el).addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        dlg.close();
        handleAction(b);
      });
    });
  }

  function openSessionModal(pre) {
    pre = pre || {};
    Promise.all([api.members(), api.threads()]).then(function (r) {
      var members = r[0];
      var connectedIds = r[1].map(function (t) { return t.memberId; });
      var me = A.currentUser() || {};
      var tomorrow = new Date(Date.now() + 86400000);
      var dateVal = tomorrow.toISOString().slice(0, 10);
      function opt(m) { return '<option value="' + m.id + '"' + (m.id === pre.memberId ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }
      var connected = members.filter(function (m) { return connectedIds.indexOf(m.id) !== -1; });
      var others = members.filter(function (m) { return connectedIds.indexOf(m.id) === -1; });
      var dlg = U.modal({
        title: 'Book a session',
        html: '<form class="form-stack" novalidate data-sess-form>' +
          '<label class="field"><span class="field-label">Partner</span><select class="select" name="member">' +
          (connected.length ? '<optgroup label="Your connections">' + connected.map(opt).join('') + '</optgroup>' : '') +
          '<optgroup label="Everyone">' + others.map(opt).join('') + '</optgroup></select></label>' +
          '<label class="field"><span class="field-label">Skill</span><select class="select" name="skill" data-skill-select></select></label>' +
          '<div class="form-row"><label class="field"><span class="field-label">Date</span><input class="input" type="date" name="date" value="' + dateVal + '" min="' + new Date().toISOString().slice(0, 10) + '"></label>' +
          '<label class="field"><span class="field-label">Time</span><input class="input" type="time" name="time" value="18:00" step="900"></label></div>' +
          '<div class="form-row"><label class="field"><span class="field-label">Duration</span><select class="select" name="duration"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>' +
          '<label class="field"><span class="field-label">Mode</span><select class="select" name="mode"><option>Online</option><option>In person</option></select></label></div>' +
          '<label class="field"><span class="field-label">Where <small>Link or place</small></span><input class="input" name="place" placeholder="meet.google.com/… or Library, Block 32"></label>' +
          '<p class="field-error" data-sess-error hidden></p>' +
          '<button class="button button-primary button-lg button-block" type="submit"><span class="button-label">Book session</span>' + ic('calendar', 'icon-shift') + '</button></form>'
      });
      dlg.el.parentElement.classList.add('modal-wide');
      var form = U.qs('[data-sess-form]', dlg.el);
      function fillSkills() {
        var m = members.filter(function (x) { return x.id === form.member.value; })[0] || {};
        var learn = (m.teach || []).map(function (t) { return '<option value="learn|' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('');
        var teach = (me.teach || []).map(function (t) { return '<option value="teach|' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('');
        form.skill.innerHTML = (learn ? '<optgroup label="Learn from ' + esc(first(m.name)) + '">' + learn + '</optgroup>' : '') + (teach ? '<optgroup label="Teach ' + esc(first(m.name)) + '">' + teach + '</optgroup>' : '');
        if (pre.skill) form.skill.value = 'learn|' + pre.skill;
      }
      form.member.addEventListener('change', fillSkills);
      form.mode.addEventListener('change', function () { form.place.placeholder = form.mode.value === 'Online' ? 'meet.google.com/…' : 'Library, Block 32'; });
      fillSkills();
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = U.qs('[data-sess-error]', form);
        var when = new Date(form.date.value + 'T' + (form.time.value || '18:00'));
        if (!form.skill.value || isNaN(when)) { err.textContent = 'Choose a skill, date and time.'; err.hidden = false; return; }
        if (when.getTime() < Date.now() - 60000) { err.textContent = 'Pick a time in the future.'; err.hidden = false; return; }
        var parts = form.skill.value.split('|');
        api.createSession({ memberId: form.member.value, role: parts[0], skill: parts[1], start: when.toISOString(), duration: form.duration.value, mode: form.mode.value, place: form.place.value.trim() })
          .then(function () {
            dlg.close();
            U.toast('Added to your calendar. Download the .ics from the session to add it to Google Calendar.', { type: 'success', title: 'Session booked' });
            state.weekOffset = Math.floor((when - weekStart(0)) / (7 * 86400000));
            if (state.view === 'sessions' || state.view === 'overview') rerender();
            refreshChrome();
          }).catch(fail);
      });
    });
  }

  function openRatingModal(id) {
    api.sessions().then(function (all) {
      var s = all.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var tags = ['Patient', 'Clear', 'Prepared', 'Fun', 'On time', 'Knowledgeable'];
      var stars = 5;
      var dlg = U.modal({
        title: 'How was ' + s.skill + '?',
        html: '<form class="form-stack" data-rate-form><p>' + (s.role === 'teach' ? 'You’ll earn ' : 'This uses ') + '<strong>' + hours(s.duration / 60) + 'h</strong> of time credit.</p>' +
          '<div class="star-input" role="group" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="is-on" data-star="' + n + '" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">★</button>'; }).join('') + '</div>' +
          '<div class="m-row">' + tags.map(function (t) { return '<button class="chip-toggle" type="button" aria-pressed="false" data-tag="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
          '<label class="field"><span class="field-label">Note <small>Optional, private</small></span><textarea class="textarea" name="note" rows="2" placeholder="What went well?"></textarea></label>' +
          '<button class="button button-primary button-lg button-block" type="submit"><span class="button-label">Complete session</span>' + ic('check', 'icon-shift') + '</button></form>'
      });
      var form = U.qs('[data-rate-form]', dlg.el);
      U.qsa('[data-star]', form).forEach(function (b) {
        b.addEventListener('click', function () {
          stars = Number(b.getAttribute('data-star'));
          U.qsa('[data-star]', form).forEach(function (x) { x.classList.toggle('is-on', Number(x.getAttribute('data-star')) <= stars); });
        });
      });
      U.qsa('[data-tag]', form).forEach(function (b) {
        b.addEventListener('click', function () { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var chosen = U.qsa('[data-tag][aria-pressed="true"]', form).map(function (b) { return b.getAttribute('data-tag'); });
        api.completeSession(id, { stars: stars, tags: chosen, note: form.note.value.trim() }).then(function (done) {
          dlg.close();
          var h = hours(done.duration / 60);
          U.toast((done.role === 'teach' ? '+' : '−') + h + 'h ' + (done.role === 'teach' ? 'added to' : 'spent from') + ' your wallet.', { type: 'success', title: 'Session completed' });
          rerender();
          refreshChrome();
        }).catch(fail);
      });
    });
  }

  /* ==========================================================================
     Wallet
     ========================================================================== */
  function renderWallet() {
    return api.wallet().then(function (w) {
      var chron = w.ledger.slice().reverse();
      host.innerHTML = '<div class="view"><div class="wallet-grid">' +
        '<article class="balance-card" data-anim><span class="panel-kicker">Available balance</span>' +
        '<span class="balance-value"><span data-count-to="' + hours(w.balance) + '">0</span><small> hours</small></span>' +
        '<p>Every hour you teach adds an hour you can spend learning from anyone on Barterly — no money involved.</p>' +
        '<div class="hero-actions"><a class="btn btn-ink" href="#discover" style="background:#f4efe6;color:#141220"><span class="btn-roll" data-text="Spend on learning">Spend on learning</span></a>' +
        '<button class="btn btn-line" type="button" data-act="new-session" style="border-color:rgba(244,239,230,.3);color:#f4efe6"><span class="btn-roll" data-text="Earn by teaching">Earn by teaching</span></button></div></article>' +
        '<article class="panel" data-anim><div class="panel-head"><div><span class="panel-kicker">History</span><h2>Balance over <em class="serif">time</em></h2></div></div>' + chartSvg(chron) + '</article>' +
        '</div>' +
        '<div class="wallet-grid" style="margin-top:18px">' +
        '<article class="panel" data-anim><div class="panel-head"><div><span class="panel-kicker">Simple & fair</span><h2>How credits <em class="serif">work</em></h2></div></div>' +
        '<div class="how-credits"><div><b>i.</b><p>Teach for an hour → earn 1 credit.</p></div><div><b>ii.</b><p>Learn for an hour → spend 1 credit.</p></div><div><b>iii.</b><p>Direct swaps can also be credit-neutral.</p></div></div></article>' +
        '<article class="panel" data-anim><div class="panel-head"><div><span class="panel-kicker">Ledger</span><h2>Transactions</h2></div></div>' +
        '<ul class="ledger">' + w.ledger.map(function (l) {
          var plus = l.amount >= 0;
          return '<li><span class="icon-tile' + (plus ? ' icon-tile-green' : '') + '">' + ic(plus ? 'trending-up' : 'book') + '</span><div><strong>' + esc(l.note) + '</strong><br><span>' + esc(fmtDay(l.at)) + ' · balance ' + hours(l.balance) + 'h</span></div>' +
            '<span class="amt ' + (plus ? 'is-plus' : 'is-minus') + '">' + (plus ? '+' : '−') + hours(Math.abs(l.amount)) + 'h</span></li>';
        }).join('') + '</ul></article></div></div>';
      initRolls();
    });
  }

  function chartSvg(points) {
    if (!points.length) return emptyState('wallet', 'No history yet', 'Complete a session to see your balance move.');
    var data = points.map(function (p) { return { t: new Date(p.at).getTime(), v: p.balance }; });
    if (data.length === 1) data.unshift({ t: data[0].t - 86400000, v: 0 });
    var W = 600, H = 220, P = 30;
    var t0 = data[0].t, t1 = data[data.length - 1].t || t0 + 1;
    var vMax = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.v; }))) * 1.2;
    var vMin = Math.min(0, Math.min.apply(null, data.map(function (d) { return d.v; })));
    function x(t) { return P + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - P * 2); }
    function y(v) { return H - P - ((v - vMin) / (vMax - vMin)) * (H - P * 2); }
    var line = data.map(function (d, i) { return (i ? 'L' : 'M') + x(d.t).toFixed(1) + ' ' + y(d.v).toFixed(1); }).join(' ');
    var area = line + ' L' + x(t1).toFixed(1) + ' ' + (H - P) + ' L' + x(t0).toFixed(1) + ' ' + (H - P) + ' Z';
    var grid = [0, 0.5, 1].map(function (k) {
      var v = vMin + (vMax - vMin) * k;
      return '<line class="grid-line" x1="' + P + '" x2="' + (W - P) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="0" y="' + (y(v) + 4) + '">' + hours(v) + 'h</text>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Credit balance over time">' +
      '<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>' +
      data.map(function (d) { return '<circle class="dot" r="4.5" cx="' + x(d.t) + '" cy="' + y(d.v) + '"/>'; }).join('') + '</svg>';
  }

  /* ==========================================================================
     Profile
     ========================================================================== */
  function renderProfile() {
    return Promise.all([api.me(), api.stats()]).then(function (r) {
      var me = r[0], st = r[1];
      var draft = { teach: me.teach.slice(), learn: me.learn.slice(), days: (me.availability.days || []).slice(), times: (me.availability.times || []).slice() };
      var link = 'https://barterly.example/u/' + encodeURIComponent(me.username || me.id);
      var badges = [
        ['users', 'First swap', 'Complete a session', st.sessionsDone >= 1],
        ['award', 'Rising mentor', 'Teach 3+ hours', st.hoursTaught >= 3],
        ['lightbulb', 'Curious mind', 'Learn 3+ skills', me.learn.length >= 3],
        ['languages', 'Polyglot', 'Speak 3+ languages', me.languages.length >= 3],
        ['star', 'Five-star', 'Rating 4.8+', (st.rating || 0) >= 4.8],
        ['map-pin', 'Campus local', 'Live on campus', !!me.location.onCampus]
      ];
      host.innerHTML = '<div class="view profile-grid">' +
        '<div>' +
        '<figure class="id-card" data-anim><span class="tape" aria-hidden="true"></span>' +
        '<div class="id-top">' + meAvatar(me, 76) + '<div><strong>' + esc(me.name || me.username) + '</strong><span>' + esc([me.program, me.institution].filter(Boolean).join(' · ') || me.role || 'Member') + '</span></div><img class="id-logo" src="./assets/brand/barterly-logo.svg" alt=""></div>' +
        '<div class="id-body">' + (me.bio ? '<p>“' + esc(me.bio) + '”</p>' : '') +
        '<div class="m-row"><span class="m-label">Teaches</span>' + (me.teach.length ? pills(me.teach) : '<span class="pill">—</span>') + '</div>' +
        '<div class="m-row"><span class="m-label">Learning</span>' + (me.learn.length ? pills(me.learn) : '<span class="pill">—</span>') + '</div>' +
        '<div class="id-foot"><span>Member since ' + esc(new Date(me.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })) + '</span><span>' + (st.rating ? '★ ' + st.rating.toFixed(1) : 'No ratings yet') + '</span></div></div></figure>' +
        '<div class="share-row" data-anim><input class="input" readonly value="' + esc(link) + '" aria-label="Public profile link"><button class="btn btn-ink btn-sm" type="button" data-copy="' + esc(link) + '"><span class="btn-roll" data-text="Copy link">Copy link</span></button></div>' +
        '<article class="panel" style="margin-top:18px" data-anim><div class="panel-head"><div><span class="panel-kicker">' + badges.filter(function (b) { return b[3]; }).length + ' of ' + badges.length + ' earned</span><h2>Achievements</h2></div></div>' +
        '<div class="badges">' + badges.map(function (b) { return '<div class="badge-tile' + (b[3] ? ' is-earned' : '') + '"><span class="medal">' + ic(b[0]) + '</span><strong>' + b[1] + '</strong>' + b[2] + '</div>'; }).join('') + '</div></article>' +
        '</div>' +
        '<form class="panel form-stack" data-profile-form data-anim novalidate>' +
        '<div class="panel-head"><div><span class="panel-kicker">Visible to matches</span><h2>Edit <em class="serif">profile</em></h2></div></div>' +
        '<label class="field"><span class="field-label">Full name</span><input class="input" name="name" value="' + esc(me.name || '') + '" maxlength="60"></label>' +
        '<label class="field"><span class="field-label">Bio <small>200 characters</small></span><textarea class="textarea" name="bio" maxlength="200" rows="3">' + esc(me.bio || '') + '</textarea></label>' +
        skillEditor('teach', 'Skills you teach', ['Beginner', 'Intermediate', 'Advanced', 'Expert']) +
        skillEditor('learn', 'Skills you want to learn', ['New to it', 'Some basics', 'Intermediate']) +
        '<div class="field"><span class="field-label">Free on</span><div class="m-row" data-days>' + DAYS.map(function (d) { return '<button class="chip-toggle" type="button" data-day="' + d + '" aria-pressed="' + (draft.days.indexOf(d) !== -1) + '">' + d + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><span class="field-label">Preferred time</span><div class="m-row" data-times>' + TIMES.map(function (t) { return '<button class="chip-toggle" type="button" data-time="' + t + '" aria-pressed="' + (draft.times.indexOf(t) !== -1) + '">' + t + '</button>'; }).join('') + '</div></div>' +
        '<label class="field"><span class="field-label">Languages <small>Comma separated</small></span><input class="input" name="languages" value="' + esc(me.languages.join(', ')) + '"></label>' +
        '<button class="button button-primary button-lg button-block" type="submit"><span class="button-label">Save changes</span>' + ic('check', 'icon-shift') + '</button>' +
        '<div class="panel-head" style="margin:12px 0 0"><div><span class="panel-kicker">Prototype tools</span><h2>Danger <em class="serif">zone</em></h2></div></div>' +
        '<div class="danger-zone"><button class="btn btn-line btn-sm" type="button" data-reset-demo><span class="btn-roll" data-text="Reset demo data">Reset demo data</span></button>' +
        '<button class="btn btn-line btn-sm" type="button" data-sign-out-now><span class="btn-roll" data-text="Sign out">Sign out</span></button></div>' +
        '</form></div>';

      var form = U.qs('[data-profile-form]', host);
      bindSkillEditor(form, 'teach', draft);
      bindSkillEditor(form, 'learn', draft);
      U.qsa('[data-day]', form).forEach(function (b) { b.addEventListener('click', function () { toggleIn(draft.days, b.getAttribute('data-day'), b); }); });
      U.qsa('[data-time]', form).forEach(function (b) { b.addEventListener('click', function () { toggleIn(draft.times, b.getAttribute('data-time'), b); }); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.name.value.trim();
        if (name.length < 2) { U.toast('Please enter your name.', { type: 'error' }); form.name.focus(); return; }
        api.updateMe({
          name: name, bio: form.bio.value.trim(), teach: draft.teach, learn: draft.learn,
          availability: { days: draft.days, times: draft.times },
          languages: form.languages.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        }).then(function () {
          U.toast('Your profile is updated — matches refresh instantly.', { type: 'success', title: 'Saved' });
          A.renderHeader();
          renderProfile().then(function () { initRolls(); });
          refreshChrome();
        }).catch(fail);
      });
      U.qs('[data-copy]', host).addEventListener('click', function (e) {
        var text = e.currentTarget.getAttribute('data-copy');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
          U.toast('Link copied to clipboard.', { type: 'success' });
        }).catch(function () { U.toast('Copy failed — select the link and copy it manually.', { type: 'error' }); });
      });
      U.qs('[data-reset-demo]', host).addEventListener('click', function () {
        var dlg = U.modal({
          title: 'Reset demo data?',
          html: '<p>This clears your requests, chats, sessions and wallet history in this browser and creates fresh demo data. Your account and profile stay.</p>' +
            '<div class="danger-zone" style="margin-top:18px"><button class="button button-primary" type="button" data-confirm>Reset</button><button class="button button-secondary" type="button" data-cancel>Cancel</button></div>'
        });
        U.qs('[data-cancel]', dlg.el).addEventListener('click', dlg.close);
        U.qs('[data-confirm]', dlg.el).addEventListener('click', function () {
          api.resetDemo().then(function () { dlg.close(); U.toast('Fresh demo data is ready.', { type: 'success' }); refreshChrome(); });
        });
      });
      U.qs('[data-sign-out-now]', host).addEventListener('click', function () {
        A.signOut();
        window.location.href = './index.html';
      });
      initRolls();
    });
  }

  function toggleIn(list, value, btn) {
    var i = list.indexOf(value);
    if (i === -1) list.push(value); else list.splice(i, 1);
    btn.setAttribute('aria-pressed', String(i === -1));
  }

  function skillEditor(key, label, levels) {
    return '<div class="field" data-editor="' + key + '" data-levels="' + levels.join('|') + '"><span class="field-label">' + label + '</span>' +
      '<ul class="edit-skill-list" data-list></ul>' +
      '<div class="add-skill"><input class="input" placeholder="Add a skill and press Enter" data-add-input aria-label="Add skill to ' + label + '"><button class="btn btn-line btn-sm" type="button" data-add-btn><span class="btn-roll" data-text="Add">Add</span></button></div></div>';
  }

  function bindSkillEditor(form, key, draft) {
    var box = U.qs('[data-editor="' + key + '"]', form);
    var levels = box.getAttribute('data-levels').split('|');
    var listEl = U.qs('[data-list]', box);
    var input = U.qs('[data-add-input]', box);
    function draw() {
      listEl.innerHTML = draft[key].map(function (s, i) {
        return '<li><strong>' + esc(s.name) + '</strong><select data-i="' + i + '" aria-label="Level for ' + esc(s.name) + '">' + levels.map(function (l) { return '<option' + (l === s.level ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>' +
          '<button class="icon-button" type="button" data-rm="' + i + '" aria-label="Remove ' + esc(s.name) + '">' + ic('x') + '</button></li>';
      }).join('') || '<li><span class="stat-foot">Nothing here yet.</span></li>';
    }
    function add() {
      var v = input.value.trim().replace(/\s+/g, ' ');
      if (!v) return;
      if (draft[key].some(function (s) { return s.name.toLowerCase() === v.toLowerCase(); })) { U.toast(v + ' is already listed.'); return; }
      if (draft[key].length >= 10) { U.toast('Up to 10 skills.', { type: 'error' }); return; }
      draft[key].push({ name: v.charAt(0).toUpperCase() + v.slice(1), level: levels[key === 'teach' ? 1 : 0] });
      input.value = '';
      draw();
    }
    listEl.addEventListener('change', function (e) {
      var i = e.target.getAttribute('data-i');
      if (i !== null) draft[key][Number(i)].level = e.target.value;
    });
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]');
      if (b) { draft[key].splice(Number(b.getAttribute('data-rm')), 1); draw(); }
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    U.qs('[data-add-btn]', box).addEventListener('click', add);
    draw();
  }

  /* ==========================================================================
     Drawer: member profile + notifications
     ========================================================================== */
  function openDrawer(html) {
    U.qs('[data-drawer-body]').innerHTML = html;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    U.qs('[data-drawer-scrim]').hidden = false;
    drawer.focus();
    initRolls(drawer);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    U.qs('[data-drawer-scrim]').hidden = true;
  }

  function openMember(id) {
    Promise.all([api.member(id), api.matches({})]).then(function (r) {
      var m = r[0];
      var meta = r[1].filter(function (x) { return x.id === id; })[0] || {};
      var me = A.currentUser() || {};
      var myTeach = (me.teach || []).map(function (t) { return t.name; });
      openDrawer(
        '<div class="profile-hero">' + avatar(m, 104) + '<h2>' + esc(m.name) + '</h2><p>' + esc([m.program, m.year, m.institution].filter(Boolean).join(' · ')) + '</p>' + ring(m.match.score, 60) + '</div>' +
        '<div class="profile-stats"><div><b>' + (m.rating ? m.rating.toFixed(1) : '—') + '</b><span>rating</span></div><div><b>' + (m.sessionsDone || 0) + '</b><span>sessions</span></div><div><b>' + (m.reviews || 0) + '</b><span>reviews</span></div></div>' +
        (m.bio ? '<p class="req-msg">“' + esc(m.bio) + '”</p>' : '') +
        (m.match.reasons.length ? '<section class="drawer-section"><h3>Why you match</h3><ul class="reasons" style="border:0;padding:0">' + m.match.reasons.map(function (x) { return '<li>' + ic('check-circle') + esc(x) + '</li>'; }).join('') + '</ul></section>' : '') +
        '<section class="drawer-section"><h3>Teaches</h3><div class="m-row">' + m.teach.map(function (t) { return '<span class="pill' + (m.match.wantHits.indexOf(t.name) !== -1 ? ' is-hit' : '') + '">' + esc(t.name) + ' · ' + esc(t.level) + '</span>'; }).join('') + '</div></section>' +
        '<section class="drawer-section"><h3>Wants to learn</h3><div class="m-row">' + pills(m.learn, 'is-give', myTeach) + '</div></section>' +
        '<section class="drawer-section"><h3>Availability</h3><div class="m-row">' + pills((m.availability || {}).days) + pills((m.availability || {}).times) + '</div></section>' +
        '<section class="drawer-section"><h3>Languages · formats</h3><div class="m-row">' + pills(m.languages) + pills(m.formats) + '</div></section>' +
        (m.reviewsList.length ? '<section class="drawer-section"><h3>Reviews</h3>' + m.reviewsList.map(function (rv) {
          return '<div class="review-item">' + avatar({ name: rv.from, avatar: rv.avatar }, 36) + '<div><p>“' + esc(rv.text) + '”</p><small>' + esc(rv.from) + ' · ' + '★'.repeat(rv.stars) + '</small></div></div>';
        }).join('') + '</section>' : '') +
        '<div class="drawer-actions">' +
        '<button class="icon-button save-btn" type="button" aria-label="Save" aria-pressed="' + !!meta.saved + '" data-act="save" data-id="' + m.id + '">' + ic('heart') + '</button>' +
        (meta.connected
          ? '<button class="btn btn-ink" type="button" data-act="chat" data-id="' + m.id + '"><span class="btn-roll" data-text="Message">Message</span></button><button class="btn btn-line" type="button" data-act="book" data-id="' + m.id + '"><span class="btn-roll" data-text="Book">Book</span></button>'
          : meta.pending ? '<span class="pill pill-warn" style="flex:1;justify-content:center">' + ic('clock') + 'Request pending</span>'
            : '<button class="btn btn-ink" type="button" data-act="request" data-id="' + m.id + '"><span class="btn-roll" data-text="Request swap">Request swap</span></button>') +
        '</div>'
      );
    }).catch(fail);
  }

  function openNotifications() {
    api.notifications().then(function (list) {
      openDrawer('<h2>Notifications</h2><p class="stat-foot" style="margin:4px 0 14px">' + list.filter(function (n) { return !n.read; }).length + ' unread</p>' +
        (list.length ? '<ul class="feed">' + list.map(function (n) {
          return feedItem(n).replace('<li class="', '<li data-link="' + esc(n.link) + '" style="cursor:pointer" class="');
        }).join('') + '</ul>' : emptyState('bell', 'You’re all caught up', 'New activity shows up here.')) +
        '<div class="drawer-actions"><button class="btn btn-line" type="button" data-read-all><span class="btn-roll" data-text="Mark all as read">Mark all as read</span></button></div>');
      U.qsa('[data-link]', drawer).forEach(function (li) {
        li.addEventListener('click', function () {
          var link = li.getAttribute('data-link');
          closeDrawer();
          if (link) window.location.hash = '#' + link;
        });
      });
      U.qs('[data-read-all]', drawer).addEventListener('click', function () {
        api.readAllNotifications().then(function () { closeDrawer(); refreshChrome(); if (state.view === 'overview') rerender(); });
      });
    });
  }

  /* ==========================================================================
     Actions (delegated)
     ========================================================================== */
  function handleAction(b) {
    var act = b.getAttribute('data-act');
    var id = b.getAttribute('data-id');
    switch (act) {
      case 'view-member': openMember(id); break;
      case 'request':
        closeDrawer();
        api.matches({}).then(function (list) {
          var m = list.filter(function (x) { return x.id === id; })[0];
          if (m) openRequestModal(m);
        });
        break;
      case 'save':
        api.toggleSave(id).then(function (saved) {
          U.qsa('[data-act="save"][data-id="' + id + '"]').forEach(function (x) { x.setAttribute('aria-pressed', String(saved)); });
          U.toast(saved ? 'Saved to your list.' : 'Removed from saved.', { type: 'success' });
        });
        break;
      case 'chat':
        closeDrawer();
        api.openThread(id).then(function (tid) {
          state.thread = tid;
          if (state.view === 'messages') renderMessages(); else window.location.hash = '#messages';
        });
        break;
      case 'book': closeDrawer(); openSessionModal({ memberId: id }); break;
      case 'new-session': openSessionModal({}); break;
      case 'accept':
      case 'decline':
        api.respondRequest(id, act === 'accept' ? 'accepted' : 'declined').then(function (res) {
          refreshChrome();
          if (act === 'accept') {
            U.toast('Say hi and plan your first session.', { type: 'success', title: 'Swap accepted 🎉' });
            state.thread = res.threadId;
            window.location.hash = '#messages';
          } else {
            U.toast('Request declined.');
            rerender();
          }
        }).catch(fail);
        break;
      case 'cancel-req': api.cancelRequest(id).then(function () { U.toast('Request withdrawn.'); rerender(); refreshChrome(); }); break;
      case 'session': openSessionDetail(id); break;
      case 'ics':
        api.sessions().then(function (all) {
          var s = all.filter(function (x) { return x.id === id; })[0];
          if (!s) return;
          download('barterly-' + s.skill.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics', api.icsFor(s, s.member ? s.member.name : 'partner'), 'text/calendar');
          U.toast('Calendar file downloaded — open it to add the session.', { type: 'success' });
        });
        break;
      case 'complete': openRatingModal(id); break;
      case 'cancel-sess': api.cancelSession(id).then(function () { U.toast('Session cancelled.'); rerender(); }); break;
      case 'notifications': openNotifications(); break;
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !(host.contains(b) || drawer.contains(b))) return;
    e.preventDefault();
    handleAction(b);
  });

  /* ==========================================================================
     Command palette
     ========================================================================== */
  var palette = U.qs('[data-palette]');
  var pInput = U.qs('[data-palette-input]');
  var pList = U.qs('[data-palette-list]');
  var pItems = [];
  var pActive = 0;
  var membersCache = null;

  function paletteSource() {
    var items = Object.keys(VIEWS).map(function (k) {
      return { group: 'Go to', icon: { overview: 'dashboard', discover: 'compass', requests: 'inbox', messages: 'message', sessions: 'calendar', wallet: 'wallet', profile: 'user' }[k], label: VIEWS[k].title.replace(/<[^>]+>/g, ''), run: function () { window.location.hash = '#' + k; } };
    });
    items.push(
      { group: 'Actions', icon: 'calendar', label: 'Book a new session', run: function () { openSessionModal({}); } },
      { group: 'Actions', icon: 'cards', label: 'Swipe through matches', run: function () { state.discover.layout = 'swipe'; SE.storage.set('disc-layout', 'swipe'); window.location.hash = '#discover'; if (state.view === 'discover') renderDiscover(); } },
      { group: 'Actions', icon: 'bell', label: 'Open notifications', run: openNotifications },
      { group: 'Actions', icon: 'moon', label: 'Toggle dark / light theme', run: function () { U.qs('[data-theme-toggle]').click(); } },
      { group: 'Actions', icon: 'home', label: 'Go to the Barterly website', run: function () { window.location.href = './index.html'; } },
      { group: 'Actions', icon: 'log-out', label: 'Sign out', run: function () { A.signOut(); window.location.href = './index.html'; } }
    );
    (membersCache || []).forEach(function (m) {
      items.push({ group: 'People', member: m, label: m.name, hint: (m.teach[0] || {}).name, run: function () { openMember(m.id); } });
    });
    var skills = {};
    (membersCache || []).forEach(function (m) { m.teach.forEach(function (t) { skills[t.name] = (skills[t.name] || 0) + 1; }); });
    Object.keys(skills).forEach(function (s) {
      items.push({ group: 'Skills', icon: 'search', label: s, hint: skills[s] + ' teacher' + (skills[s] > 1 ? 's' : ''), run: function () { state.discover.q = s; state.discover.layout = 'grid'; window.location.hash = '#discover'; if (state.view === 'discover') renderDiscover(); } });
    });
    return items;
  }

  function drawPalette() {
    var q = pInput.value.trim().toLowerCase();
    var src = paletteSource().filter(function (it) { return !q || (it.label + ' ' + (it.hint || '') + ' ' + it.group).toLowerCase().indexOf(q) !== -1; });
    var groups = {};
    src.forEach(function (it) { (groups[it.group] = groups[it.group] || []).push(it); });
    pItems = [];
    var html = '';
    ['Go to', 'People', 'Skills', 'Actions'].forEach(function (g) {
      if (!groups[g]) return;
      html += '<li class="palette-group" role="presentation">' + g + '</li>';
      groups[g].slice(0, q ? 8 : 6).forEach(function (it) {
        var i = pItems.length;
        pItems.push(it);
        html += '<li class="palette-item" role="option" id="pal-' + i + '" data-i="' + i + '" aria-selected="false">' +
          (it.member ? avatar(it.member, 28) : ic(it.icon || 'arrow-right')) + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</li>';
      });
    });
    pList.innerHTML = html || '<li class="palette-group">No results</li>';
    pActive = 0;
    highlight();
  }

  function highlight() {
    U.qsa('.palette-item', pList).forEach(function (el, i) {
      el.setAttribute('aria-selected', String(i === pActive));
      if (i === pActive) { el.scrollIntoView({ block: 'nearest' }); pInput.setAttribute('aria-activedescendant', el.id); }
    });
  }

  function openPalette() {
    palette.hidden = false;
    pInput.value = '';
    drawPalette();
    pInput.focus();
    if (!membersCache) api.members().then(function (m) { membersCache = m; drawPalette(); });
  }

  function closePalette() { palette.hidden = true; }

  function runPalette(i) {
    var it = pItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }

  pInput.addEventListener('input', drawPalette);
  pInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); pActive = Math.min(pItems.length - 1, pActive + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pActive = Math.max(0, pActive - 1); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(pActive); }
    else if (e.key === 'Escape') { closePalette(); }
  });
  pList.addEventListener('click', function (e) {
    var li = e.target.closest('[data-i]');
    if (li) runPalette(Number(li.getAttribute('data-i')));
  });
  palette.addEventListener('mousedown', function (e) { if (e.target === palette) closePalette(); });
  U.qs('[data-palette-open]').addEventListener('click', openPalette);
  U.qs('[data-kbd]').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (palette.hidden) openPalette(); else closePalette(); }
    else if (e.key === '/' && !typing && palette.hidden && !document.querySelector('.modal-backdrop')) { e.preventDefault(); openPalette(); }
    else if (e.key === 'Escape') { if (!palette.hidden) closePalette(); else if (drawer.classList.contains('is-open')) closeDrawer(); }
  });

  /* ==========================================================================
     Shell wiring
     ========================================================================== */
  function initRolls(scope) {
    U.qsa('.btn-roll', scope || document).forEach(function (el) {
      if (el.querySelector('.btn-roll-i')) return;
      var text = el.textContent.trim();
      el.innerHTML = '<span class="btn-roll-i" data-text="' + esc(text) + '">' + esc(text) + '</span>';
    });
  }

  U.qs('[data-notif-open]').addEventListener('click', openNotifications);
  U.qsa('[data-drawer-close], [data-drawer-scrim]').forEach(function (el) { el.addEventListener('click', closeDrawer); });
  U.qs('[data-sidebar-open]').addEventListener('click', function () { U.qs('[data-app]').classList.add('is-menu-open'); });
  U.qsa('[data-sidebar-close]').forEach(function (el) { el.addEventListener('click', function () { U.qs('[data-app]').classList.remove('is-menu-open'); }); });

  var topbar = U.qs('.topbar');
  window.addEventListener('scroll', function () { topbar.classList.toggle('is-scrolled', window.scrollY > 4); }, { passive: true });
  window.addEventListener('resize', U.debounce(layoutOrbit, 150));

  /* Realtime (demo) events */
  api.on('typing', function (e) {
    if (state.view !== 'messages' || e.threadId !== state.thread) return;
    var msgs = U.qs('[data-msgs]');
    if (!msgs) return;
    var t = U.qs('.typing', msgs);
    if (e.typing && !t) {
      msgs.insertAdjacentHTML('beforeend', '<span class="typing" aria-label="Typing"><i></i><i></i><i></i></span>');
      msgs.scrollTop = msgs.scrollHeight;
    } else if (!e.typing && t) t.remove();
  });

  api.on('message', function (e) {
    if (state.view === 'messages' && e.threadId === state.thread && U.qs('[data-msgs]')) {
      appendMessage(e.message);
      updateThreadPreview(e.threadId, e.message);
      api.markThreadRead(e.threadId).then(refreshChrome);
      return;
    }
    refreshChrome();
    api.threads().then(function (all) {
      var t = all.filter(function (x) { return x.id === e.threadId; })[0];
      if (t && t.member) U.toast(e.message.text, { title: first(t.member.name) + ' sent a message' });
      if (state.view === 'messages') drawThreads(all);
    });
  });

  api.on('notify', function (n) {
    U.toast(n.body, { type: 'success', title: n.title });
  });

  api.on('change', function (e) {
    refreshChrome();
    if (e.scope === 'requests' && (state.view === 'requests' || state.view === 'overview')) rerender();
    if (e.scope === 'all') rerender();
  });

  window.addEventListener('hashchange', route);
  route();
})(window.SE = window.SE || {});
