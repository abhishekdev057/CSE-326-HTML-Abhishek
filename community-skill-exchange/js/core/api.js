/* ==========================================================================
   Barterly — Data API (backend-ready)

   Every method returns a Promise and mirrors a REST endpoint, e.g.
     api.matches(filters)        → GET  /api/matches?…
     api.sendRequest(payload)    → POST /api/requests
     api.respondRequest(id, s)   → PATCH /api/requests/:id
     api.sendMessage(tid, text)  → POST /api/threads/:id/messages
     api.completeSession(id, r)  → POST /api/sessions/:id/complete
   Today the "server" is localStorage (one database per signed-in user,
   key "ss-db-<userId>") plus a small demo community. To connect a real
   backend, replace the bodies of these methods with fetch() calls — the
   dashboard only talks to SE.api, never to storage directly.

   Realtime events (later: WebSocket) are emitted through api.on():
     'notify'   { title, body, link }   something the user should see now
     'message'  { threadId, message }   new incoming chat message
     'typing'   { threadId, typing }    demo partner typing indicator
     'change'   { scope }               anything that should refresh UI
   ========================================================================== */
(function (SE) {
  'use strict';

  var A = SE.auth;
  var DAY = 86400000;

  /* ---------- tiny helpers ---------- */
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function lower(s) { return String(s || '').toLowerCase().trim(); }
  function respond(fn) {
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        try { resolve(clone(fn())); } catch (e) { reject(e); }
      }, 60 + Math.random() * 120);
    });
  }

  var listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { /* ignore */ } }); }

  /* ==========================================================================
     Demo community (clearly marked demo: true)
     ========================================================================== */
  var AV = './assets/avatars/';
  var COMMUNITY = [
    { id: 'm_ravi', name: 'Ravi Sharma', avatar: AV + 'ravi.jpg', program: 'B.Tech CSE', year: '3rd year', bio: 'Competitive programmer and DSA nerd. Finally want to learn guitar before placements end.',
      teach: [['DSA', 'Expert'], ['Python', 'Advanced'], ['Competitive programming', 'Advanced']], learn: [['Guitar', 'New to it'], ['Public speaking', 'Some basics']],
      interests: ['Technology', 'Music', 'Gaming'], formats: ['One-to-one', 'Online'], days: ['Tue', 'Thu', 'Sat'], times: ['Evening', 'Night'], languages: ['English', 'Hindi'], rating: 4.9, reviews: 18, sessions: 23 },
    { id: 'm_ananya', name: 'Ananya Singh', avatar: AV + 'ananya.jpg', program: 'B.Des', year: '2nd year', bio: 'Product designer in the making. I run weekend Figma jams and want to get better at Python.',
      teach: [['UI/UX design', 'Advanced'], ['Figma', 'Expert'], ['Canva', 'Advanced']], learn: [['Python', 'New to it'], ['Spoken English', 'Some basics']],
      interests: ['Design', 'Technology', 'Photography'], formats: ['Small group', 'In person', 'Project-based'], days: ['Sat', 'Sun'], times: ['Morning', 'Afternoon'], languages: ['English', 'Hindi', 'Punjabi'], rating: 4.8, reviews: 12, sessions: 15 },
    { id: 'm_kabir', name: 'Kabir Malhotra', avatar: AV + 'kabir.jpg', program: 'B.Tech ECE', year: '2nd year', bio: 'Lead guitarist of a campus band. Trading chords for code since first year.',
      teach: [['Guitar', 'Expert'], ['Music production', 'Intermediate'], ['Singing', 'Intermediate']], learn: [['Python', 'New to it'], ['Web development', 'New to it']],
      interests: ['Music', 'Technology', 'Gaming'], formats: ['One-to-one', 'In person'], days: ['Mon', 'Wed', 'Sat'], times: ['Evening'], languages: ['English', 'Hindi', 'Punjabi'], rating: 4.9, reviews: 21, sessions: 30 },
    { id: 'm_meera', name: 'Meera Iyer', avatar: AV + 'meera.jpg', program: 'B.Sc Hospitality', year: '3rd year', bio: 'Home cook, baker and French learner. My hostel room smells like cardamom.',
      teach: [['Cooking', 'Expert'], ['Baking', 'Advanced'], ['French', 'Intermediate']], learn: [['Excel', 'Some basics'], ['Photography', 'New to it']],
      interests: ['Cooking', 'Languages', 'Travel'], formats: ['In person', 'Small group'], days: ['Sun', 'Fri'], times: ['Afternoon', 'Evening'], languages: ['English', 'Tamil', 'Hindi'], rating: 4.7, reviews: 9, sessions: 11 },
    { id: 'm_ishaan', name: 'Ishaan Verma', avatar: AV + 'ishaan.jpg', program: 'BA Journalism', year: '2nd year', bio: 'Video editor and campus vlogger. Stage fright is my last boss.',
      teach: [['Video editing', 'Advanced'], ['Photography', 'Intermediate'], ['Content writing', 'Intermediate']], learn: [['Public speaking', 'New to it'], ['Graphic design', 'Some basics']],
      interests: ['Photography', 'Writing', 'Public speaking'], formats: ['One-to-one', 'Project-based'], days: ['Tue', 'Wed', 'Sun'], times: ['Evening', 'Night'], languages: ['English', 'Hindi'], rating: 4.6, reviews: 7, sessions: 9 },
    { id: 'm_diya', name: 'Diya Kapoor', avatar: AV + 'diya.jpg', program: 'BA English', year: '3rd year', bio: 'DELF B2 in French, debate captain. Want to learn UI design for my portfolio.',
      teach: [['French', 'Advanced'], ['Spoken English', 'Expert'], ['Creative writing', 'Advanced']], learn: [['UI/UX design', 'New to it'], ['Yoga', 'Some basics']],
      interests: ['Languages', 'Writing', 'Design'], formats: ['Online', 'Small group'], days: ['Mon', 'Thu', 'Sat'], times: ['Morning', 'Evening'], languages: ['English', 'Hindi', 'French'], rating: 5.0, reviews: 14, sessions: 19 },
    { id: 'm_simran', name: 'Simran Gill', avatar: AV + 'simran.jpg', program: 'B.Des', year: '4th year', bio: 'Photographer and visual designer. Need someone to help me build my portfolio site.',
      teach: [['Photography', 'Expert'], ['Graphic design', 'Advanced']], learn: [['Web development', 'New to it'], ['Video editing', 'Some basics']],
      interests: ['Photography', 'Design', 'Travel'], formats: ['Project-based', 'In person'], days: ['Fri', 'Sat', 'Sun'], times: ['Afternoon'], languages: ['English', 'Punjabi', 'Hindi'], rating: 4.8, reviews: 16, sessions: 20 },
    { id: 'm_kavya', name: 'Kavya Reddy', avatar: AV + 'kavya.jpg', program: 'B.Sc Maths', year: '2nd year', bio: 'Maths topper who loves explaining calculus with memes. Learning to dance.',
      teach: [['Mathematics', 'Expert'], ['Aptitude', 'Advanced']], learn: [['Dance', 'New to it'], ['Excel', 'Some basics']],
      interests: ['Academics', 'Music', 'Wellness'], formats: ['One-to-one', 'Online'], days: ['Mon', 'Tue', 'Wed'], times: ['Evening'], languages: ['English', 'Telugu', 'Hindi'], rating: 4.9, reviews: 22, sessions: 27 },
    { id: 'm_rohan', name: 'Rohan Mehta', avatar: AV + 'rohan.jpg', program: 'M.Tech AI', year: '1st year', bio: 'ML researcher by day, chess blitz by night. Want to sing without embarrassing myself.',
      teach: [['Machine learning', 'Expert'], ['Power BI', 'Advanced'], ['Chess', 'Advanced']], learn: [['Singing', 'New to it'], ['French', 'New to it']],
      interests: ['Technology', 'Data & AI', 'Gaming'], formats: ['Online', 'One-to-one'], days: ['Wed', 'Thu', 'Sun'], times: ['Night'], languages: ['English', 'Hindi', 'Gujarati'], rating: 4.7, reviews: 10, sessions: 13 },
    { id: 'm_priya', name: 'Priya Nair', avatar: AV + 'priya.jpg', program: 'MBA', year: '1st year', bio: 'Ex-agency video editor now doing an MBA. Excel shortcuts are my love language.',
      teach: [['Video editing', 'Expert'], ['Excel', 'Advanced'], ['Digital marketing', 'Advanced']], learn: [['Graphic design', 'Some basics'], ['Chess', 'New to it']],
      interests: ['Business', 'Design', 'Finance'], formats: ['One-to-one', 'Online'], days: ['Tue', 'Fri', 'Sat'], times: ['Evening'], languages: ['English', 'Malayalam', 'Hindi'], rating: 4.8, reviews: 11, sessions: 14 },
    { id: 'm_aarav', name: 'Aarav Joshi', avatar: AV + 'aarav.jpg', program: 'B.Des', year: '3rd year', bio: 'Graphic designer who wants to learn video editing so my motion posters finally move.',
      teach: [['Graphic design', 'Expert'], ['Figma', 'Advanced'], ['Sketching', 'Advanced']], learn: [['Video editing', 'New to it'], ['Guitar', 'Some basics']],
      interests: ['Design', 'Music', 'Photography'], formats: ['In person', 'Project-based'], days: ['Wed', 'Sat'], times: ['Afternoon', 'Evening'], languages: ['English', 'Hindi', 'Marathi'], rating: 4.6, reviews: 8, sessions: 10 }
  ].map(function (m) {
    return {
      id: m.id, name: m.name, avatar: m.avatar, role: 'Student', program: m.program, year: m.year,
      institution: 'Lovely Professional University', bio: m.bio,
      teach: m.teach.map(function (t) { return { name: t[0], level: t[1] }; }),
      learn: m.learn.map(function (t) { return { name: t[0], level: t[1] }; }),
      interests: m.interests, formats: m.formats, availability: { days: m.days, times: m.times },
      languages: m.languages, location: { city: 'Phagwara', state: 'Punjab', onCampus: true },
      rating: m.rating, reviews: m.reviews, sessionsDone: m.sessions, verified: true, demo: true
    };
  });

  var REVIEW_POOL = [
    'Super patient — explained everything twice without making me feel slow.',
    'Came prepared with notes and practice problems. 10/10.',
    'Our sessions were the highlight of my week, honestly.',
    'Clear, friendly and always on time.',
    'Turned a scary topic into something fun.'
  ];

  /* ==========================================================================
     Matching
     ========================================================================== */
  var CATS = {
    Technology: ['python', 'java', 'c++', 'javascript', 'typescript', 'react', 'node', 'web', 'app', 'flutter', 'android', 'dsa', 'competitive', 'sql', 'linux', 'git', 'cloud', 'aws', 'cyber'],
    'Data & AI': ['data', 'machine', 'deep', 'power bi', 'excel', 'analytics'],
    Design: ['ui', 'ux', 'figma', 'graphic', 'canva', 'photo', 'video', 'animation', '3d', 'sketch', 'painting', 'calligraphy'],
    Languages: ['english', 'hindi', 'punjabi', 'french', 'german', 'spanish', 'japanese', 'korean', 'sign', 'writing'],
    Music: ['guitar', 'keyboard', 'singing', 'tabla', 'drum', 'music', 'dance', 'bhangra'],
    Business: ['marketing', 'entrepreneur', 'finance', 'stock', 'accounting', 'resume', 'interview', 'leadership', 'event'],
    Academics: ['math', 'physics', 'chemistry', 'biology', 'economics', 'aptitude'],
    Lifestyle: ['cooking', 'baking', 'yoga', 'fitness', 'cricket', 'football', 'badminton', 'chess', 'crochet', 'garden']
  };

  function categoryOf(skill) {
    var s = lower(skill);
    var found = 'Other';
    Object.keys(CATS).some(function (c) {
      if (CATS[c].some(function (k) { return s.indexOf(k) !== -1; })) { found = c; return true; }
      return false;
    });
    return found;
  }

  function names(list) { return (list || []).map(function (x) { return x.name; }); }

  function hits(wants, offers) {
    var exact = [];
    var related = [];
    names(wants).forEach(function (w) {
      var match = names(offers).filter(function (o) { return lower(o) === lower(w); })[0];
      if (match) { exact.push(match); return; }
      var cat = categoryOf(w);
      var rel = cat !== 'Other' && names(offers).filter(function (o) { return categoryOf(o) === cat; })[0];
      if (rel) related.push({ want: w, offer: rel });
    });
    return { exact: exact, related: related };
  }

  function overlap(a, b) {
    a = a || []; b = b || [];
    return a.filter(function (x) { return b.indexOf(x) !== -1; });
  }

  /** Score a member for `me` (0–99) with human-readable reasons. */
  function score(me, m) {
    var want = hits(me.learn, m.teach);   // they can teach what I want
    var give = hits(m.learn, me.teach);   // they want what I can teach
    var wantPts = Math.min(1, (want.exact.length + want.related.length * 0.35) / 1.2) * 42;
    var givePts = Math.min(1, (give.exact.length + give.related.length * 0.35) / 1.2) * 28;
    var sharedInterests = overlap(me.interests, m.interests);
    var union = (me.interests || []).length + (m.interests || []).length - sharedInterests.length;
    var interestPts = union ? (sharedInterests.length / union) * 10 : 0;
    var days = overlap((me.availability || {}).days, (m.availability || {}).days);
    var times = overlap((me.availability || {}).times, (m.availability || {}).times);
    var timePts = Math.min(1, days.length / 2) * 8 + (times.length ? 4 : 0);
    var langs = overlap(me.languages, m.languages);
    var langPts = langs.length ? 4 : 0;
    var place = lower((me.location || {}).city) && lower((me.location || {}).city) === lower((m.location || {}).city);
    var placePts = place ? 4 : 0;
    var total = Math.max(8, Math.min(99, Math.round(wantPts + givePts + interestPts + timePts + langPts + placePts)));

    var reasons = [];
    if (want.exact.length) reasons.push('Teaches ' + want.exact.join(', ') + ' you want');
    else if (want.related.length) reasons.push('Teaches ' + want.related[0].offer + ' (close to ' + want.related[0].want + ')');
    if (give.exact.length) reasons.push('Wants your ' + give.exact.join(', '));
    else if (give.related.length) reasons.push('Interested in ' + give.related[0].want);
    if (sharedInterests.length) reasons.push(sharedInterests.length + ' shared interest' + (sharedInterests.length > 1 ? 's' : ''));
    if (days.length) reasons.push('Both free on ' + days.slice(0, 2).join(' & ') + (times.length ? ' ' + times[0].toLowerCase() + 's' : ''));
    if (langs.length) reasons.push('Speaks ' + langs.slice(0, 2).join(' & '));
    if (place && (me.location || {}).onCampus && (m.location || {}).onCampus) reasons.push('Also on campus');

    return {
      score: total,
      mutual: !!(want.exact.length && give.exact.length),
      theyTeach: want.exact[0] || (want.related[0] && want.related[0].offer) || (m.teach[0] && m.teach[0].name) || '',
      youTeach: give.exact[0] || (give.related[0] && give.related[0].want) || (me.teach[0] && me.teach[0].name) || '',
      wantHits: want.exact,
      giveHits: give.exact,
      reasons: reasons
    };
  }

  /* ==========================================================================
     Per-user database
     ========================================================================== */
  function normaliseMe(u) {
    u = clone(u) || {};
    u.teach = u.teach || [];
    u.learn = u.learn || [];
    u.interests = u.interests || [];
    u.formats = u.formats || [];
    u.availability = u.availability || { days: [], times: [] };
    u.languages = u.languages || [];
    u.location = u.location || {};
    return u;
  }

  function requireUser() {
    var u = A.currentUser();
    if (!u) {
      var err = new Error('Not signed in');
      err.code = 401;
      throw err;
    }
    return normaliseMe(u);
  }

  function dbKey(u) { return 'db-' + u.id; }

  function emptyDb() {
    return { version: 1, seeded: false, requests: [], threads: [], sessions: [], ledger: [], notifications: [], saved: [], skipped: [] };
  }

  function load() {
    var me = requireUser();
    var db = SE.storage.getJSON(dbKey(me), null) || emptyDb();
    if (!db.seeded) seed(db, me);
    return db;
  }

  function save(db) {
    var me = requireUser();
    SE.storage.setJSON(dbKey(me), db);
  }

  function allMembers() {
    var me = A.currentUser();
    var real = (SE.storage.getJSON('users', []) || [])
      .filter(function (u) { return !me || u.id !== me.id; })
      .map(function (u) {
        var n = normaliseMe(u);
        return {
          id: u.id, name: u.name || u.username || 'Member', avatar: u.photo || '', role: u.role, program: u.program,
          year: u.year, institution: u.institution, bio: u.bio, teach: n.teach, learn: n.learn, interests: n.interests,
          formats: n.formats, availability: n.availability, languages: n.languages, location: n.location,
          rating: null, reviews: 0, sessionsDone: 0, verified: !!u.phoneVerified || !!u.emailVerified, demo: false
        };
      });
    return COMMUNITY.concat(real);
  }

  function memberById(id) {
    return allMembers().filter(function (m) { return m.id === id; })[0] || null;
  }

  function notify(db, n) {
    db.notifications.unshift({ id: uid('n'), at: new Date().toISOString(), read: false, icon: n.icon || 'bell', title: n.title, body: n.body || '', link: n.link || '' });
    db.notifications = db.notifications.slice(0, 40);
  }

  function threadWith(db, memberId) {
    return db.threads.filter(function (t) { return t.memberId === memberId; })[0];
  }

  function ensureThread(db, memberId, systemText) {
    var t = threadWith(db, memberId);
    if (!t) {
      t = { id: uid('t'), memberId: memberId, messages: [], unread: 0, updatedAt: new Date().toISOString() };
      db.threads.unshift(t);
    }
    if (systemText) t.messages.push({ id: uid('msg'), from: 'system', text: systemText, at: new Date().toISOString() });
    return t;
  }

  function at(offsetMs) { return new Date(Date.now() + offsetMs).toISOString(); }

  function atHour(daysFromNow, hour) {
    var d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  /** First-visit demo data, personalised to the new member's skills. */
  function seed(db, me) {
    var members = COMMUNITY.map(function (m) { return { m: m, s: score(me, m) }; })
      .sort(function (a, b) { return b.s.score - a.s.score; });
    var best = members[0];
    var second = members[1];
    var third = members.filter(function (x) { return x.m.id !== best.m.id && x.m.id !== second.m.id; })[0];
    var myFirst = (me.teach[0] && me.teach[0].name) || 'your skill';

    db.ledger.push({ id: uid('l'), at: at(-6 * DAY), amount: 2, note: 'Welcome bonus — 2 free hours to start trading' });

    // A thread + an upcoming session with the best match
    var t = ensureThread(db, best.m.id, 'You matched with ' + best.m.name.split(' ')[0] + ' — ' + best.s.theyTeach + ' ⇄ ' + best.s.youTeach);
    t.messages.push({ id: uid('msg'), from: best.m.id, text: 'Hey! Saw you want to learn ' + best.s.theyTeach + ' — I’d love to help. And I’ve been meaning to pick up ' + best.s.youTeach + ' 😄', at: at(-26 * 3600000) });
    t.messages.push({ id: uid('msg'), from: 'me', text: 'That’s perfect! Does tomorrow evening work for a first session?', at: at(-25 * 3600000) });
    t.messages.push({ id: uid('msg'), from: best.m.id, text: 'Tomorrow 6 pm works. I’ll share a Meet link — bring any questions!', at: at(-24 * 3600000) });
    t.unread = 1;
    t.updatedAt = at(-24 * 3600000);
    db.sessions.push({ id: uid('s'), memberId: best.m.id, skill: best.s.theyTeach, role: 'learn', start: atHour(1, 18), duration: 60, mode: 'Online', place: 'meet.google.com/brt-swap-01', status: 'upcoming', createdAt: at(-24 * 3600000) });

    // A completed session where the member taught (credits earned + rating)
    db.sessions.push({ id: uid('s'), memberId: third.m.id, skill: myFirst, role: 'teach', start: atHour(-3, 17), duration: 60, mode: 'In person', place: 'Library, Block 32', status: 'completed', ratingGiven: { stars: 5, tags: ['Curious', 'On time'] }, ratingReceived: { stars: 5, text: 'Really clear explanations — thank you!' }, createdAt: at(-5 * DAY) });
    db.ledger.push({ id: uid('l'), at: atHour(-3, 18), amount: 1, note: 'Taught ' + myFirst + ' to ' + third.m.name.split(' ')[0] });
    ensureThread(db, third.m.id, 'Session completed — ' + myFirst + ' with ' + third.m.name.split(' ')[0]).updatedAt = atHour(-3, 18);

    // Two incoming requests
    [second, members[2] && members[2].m.id !== third.m.id ? members[2] : members[3]].forEach(function (x, i) {
      if (!x) return;
      db.requests.push({
        id: uid('r'), direction: 'incoming', memberId: x.m.id, offer: x.s.theyTeach, want: x.s.youTeach, format: x.m.formats[0],
        message: i === 0
          ? 'Hi! I can teach you ' + x.s.theyTeach + ' and would love to learn ' + x.s.youTeach + '. Weekends work best for me.'
          : 'Your profile popped up as a great match. Swap ' + x.s.theyTeach + ' for ' + x.s.youTeach + '?',
        status: 'pending', at: at(-(i + 1) * 5 * 3600000)
      });
    });

    notify(db, { icon: 'sparkles', title: 'Welcome to Barterly!', body: 'You have 2 free hours of credit to start trading skills.', link: 'wallet' });
    notify(db, { icon: 'inbox', title: second.m.name.split(' ')[0] + ' sent you a swap request', body: second.s.theyTeach + ' ⇄ ' + second.s.youTeach, link: 'requests' });
    notify(db, { icon: 'calendar', title: 'Session tomorrow at 6 pm', body: best.s.theyTeach + ' with ' + best.m.name.split(' ')[0], link: 'sessions' });

    db.seeded = true;
    save(db);
  }

  /* ---------- demo partner behaviour ---------- */
  var REPLIES = [
    function (m, s) { return 'Sounds great! I’ll prepare a few exercises on ' + s + '.'; },
    function () { return 'Haha yes, let’s do it 🙌'; },
    function (m) { return 'I’m usually free ' + m.availability.days.slice(0, 2).join(' or ') + ' ' + (m.availability.times[0] || '').toLowerCase() + '. Want me to block a slot?'; },
    function () { return 'Perfect — should we meet in the library or keep it online?'; }
  ];

  function demoReply(threadId, userText) {
    var db = load();
    var t = db.threads.filter(function (x) { return x.id === threadId; })[0];
    if (!t) return;
    var m = memberById(t.memberId);
    if (!m || !m.demo) return;
    var text;
    var q = lower(userText);
    if (/thank|thanks|thx/.test(q)) text = 'Anytime! That’s what Barterly is for 😊';
    else if (/when|free|time|slot|schedule|tomorrow|weekend|saturday|sunday/.test(q)) text = REPLIES[2](m);
    else if (/where|library|online|meet|zoom|campus/.test(q)) text = REPLIES[3](m);
    else if (/\?$/.test(q)) text = 'Good question! Short answer: yes — I’ll show you in our session.';
    else text = REPLIES[Math.floor(Math.random() * 2)](m, (m.teach[0] || {}).name || 'it');

    emit('typing', { threadId: threadId, typing: true });
    window.setTimeout(function () {
      var db2 = load();
      var t2 = db2.threads.filter(function (x) { return x.id === threadId; })[0];
      if (!t2) return;
      var msg = { id: uid('msg'), from: m.id, text: text, at: new Date().toISOString() };
      t2.messages.push(msg);
      t2.unread = (t2.unread || 0) + 1;
      t2.updatedAt = msg.at;
      save(db2);
      emit('typing', { threadId: threadId, typing: false });
      emit('message', { threadId: threadId, message: msg });
    }, 1400 + Math.random() * 1200);
  }

  function demoAccept(requestId) {
    window.setTimeout(function () {
      var db = load();
      var r = db.requests.filter(function (x) { return x.id === requestId; })[0];
      if (!r || r.status !== 'pending') return;
      var m = memberById(r.memberId);
      if (!m || !m.demo) return;
      r.status = 'accepted';
      r.respondedAt = new Date().toISOString();
      var t = ensureThread(db, m.id, m.name.split(' ')[0] + ' accepted your request — ' + r.want + ' ⇄ ' + r.offer);
      t.messages.push({ id: uid('msg'), from: m.id, text: 'Yay, accepted! When do you want to start?', at: new Date().toISOString() });
      t.unread = (t.unread || 0) + 1;
      t.updatedAt = new Date().toISOString();
      notify(db, { icon: 'check-circle', title: m.name.split(' ')[0] + ' accepted your swap', body: r.want + ' ⇄ ' + r.offer, link: 'messages' });
      save(db);
      emit('notify', { title: m.name.split(' ')[0] + ' accepted your swap 🎉', body: 'Say hi in Messages — ' + r.want + ' ⇄ ' + r.offer, link: 'messages' });
      emit('change', { scope: 'requests' });
    }, 5000 + Math.random() * 3000);
  }

  /* ==========================================================================
     Public API
     ========================================================================== */
  var api = {
    on: on,
    categoryOf: categoryOf,
    categories: Object.keys(CATS).concat(['Other']),

    me: function () { return respond(function () { return requireUser(); }); },

    updateMe: function (patch) {
      return respond(function () {
        var me = requireUser();
        var updated = A.updateUser(me.id, patch);
        emit('change', { scope: 'me' });
        return updated;
      });
    },

    members: function () { return respond(allMembers); },
    member: function (id) {
      return respond(function () {
        var m = memberById(id);
        if (!m) throw new Error('Member not found');
        var me = requireUser();
        m.match = score(me, m);
        m.reviewsList = m.demo ? REVIEW_POOL.slice((m.name.length % 3), (m.name.length % 3) + 3).map(function (text, i) {
          var from = COMMUNITY[(i * 3 + m.name.length) % COMMUNITY.length];
          return { from: from.name.split(' ')[0], avatar: from.avatar, text: text, stars: i === 2 ? 4 : 5 };
        }) : [];
        return m;
      });
    },

    matches: function (f) {
      f = f || {};
      return respond(function () {
        var me = requireUser();
        var db = load();
        var q = lower(f.q);
        var list = allMembers().map(function (m) {
          m.match = score(me, m);
          m.saved = db.saved.indexOf(m.id) !== -1;
          m.skipped = db.skipped.indexOf(m.id) !== -1;
          m.pending = db.requests.some(function (r) { return r.memberId === m.id && r.status === 'pending'; });
          m.connected = !!threadWith(db, m.id);
          return m;
        }).filter(function (m) {
          if (q) {
            var hay = lower(m.name + ' ' + m.program + ' ' + names(m.teach).join(' ') + ' ' + names(m.learn).join(' ') + ' ' + (m.interests || []).join(' '));
            if (hay.indexOf(q) === -1) return false;
          }
          if (f.category && f.category !== 'All' && !m.teach.some(function (t) { return categoryOf(t.name) === f.category; })) return false;
          if (f.mode === 'Online' && (m.formats || []).indexOf('Online') === -1) return false;
          if (f.mode === 'In person' && (m.formats || []).indexOf('In person') === -1) return false;
          if (f.day && f.day !== 'Any' && ((m.availability || {}).days || []).indexOf(f.day) === -1) return false;
          if (f.mutual && !m.match.mutual) return false;
          if (f.savedOnly && !m.saved) return false;
          if (f.hideSkipped && m.skipped) return false;
          return true;
        });
        var sorters = {
          match: function (a, b) { return b.match.score - a.match.score; },
          rating: function (a, b) { return (b.rating || 0) - (a.rating || 0); },
          sessions: function (a, b) { return (b.sessionsDone || 0) - (a.sessionsDone || 0); }
        };
        return list.sort(sorters[f.sort] || sorters.match);
      });
    },

    toggleSave: function (id) {
      return respond(function () {
        var db = load();
        var i = db.saved.indexOf(id);
        if (i === -1) db.saved.push(id); else db.saved.splice(i, 1);
        save(db);
        return i === -1;
      });
    },

    skip: function (id) {
      return respond(function () {
        var db = load();
        if (db.skipped.indexOf(id) === -1) db.skipped.push(id);
        save(db);
        return true;
      });
    },

    clearSkipped: function () {
      return respond(function () {
        var db = load();
        db.skipped = [];
        save(db);
        return true;
      });
    },

    requests: function () {
      return respond(function () {
        var db = load();
        return db.requests.map(function (r) { r.member = memberById(r.memberId); return r; })
          .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
      });
    },

    sendRequest: function (p) {
      return respond(function () {
        var db = load();
        if (db.requests.some(function (r) { return r.memberId === p.memberId && r.status === 'pending'; })) {
          throw new Error('You already have a pending request with this member.');
        }
        var r = { id: uid('r'), direction: 'outgoing', memberId: p.memberId, offer: p.offer, want: p.want, format: p.format, message: p.message, status: 'pending', at: new Date().toISOString() };
        db.requests.push(r);
        save(db);
        emit('change', { scope: 'requests' });
        demoAccept(r.id);
        return r;
      });
    },

    respondRequest: function (id, status) {
      return respond(function () {
        var db = load();
        var r = db.requests.filter(function (x) { return x.id === id; })[0];
        if (!r) throw new Error('Request not found');
        r.status = status;
        r.respondedAt = new Date().toISOString();
        var t = null;
        if (status === 'accepted') {
          var m = memberById(r.memberId);
          t = ensureThread(db, r.memberId, 'You accepted ' + (m ? m.name.split(' ')[0] : 'the') + '’s request — ' + r.offer + ' ⇄ ' + r.want);
          t.updatedAt = new Date().toISOString();
        }
        save(db);
        emit('change', { scope: 'requests' });
        return { request: r, threadId: t && t.id };
      });
    },

    cancelRequest: function (id) {
      return respond(function () {
        var db = load();
        db.requests.forEach(function (r) { if (r.id === id) r.status = 'cancelled'; });
        save(db);
        emit('change', { scope: 'requests' });
        return true;
      });
    },

    threads: function () {
      return respond(function () {
        var db = load();
        return db.threads.map(function (t) { t.member = memberById(t.memberId); return t; })
          .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      });
    },

    openThread: function (memberId) {
      return respond(function () {
        var db = load();
        var t = ensureThread(db, memberId);
        save(db);
        return t.id;
      });
    },

    markThreadRead: function (id) {
      return respond(function () {
        var db = load();
        db.threads.forEach(function (t) { if (t.id === id) t.unread = 0; });
        save(db);
        return true;
      });
    },

    sendMessage: function (threadId, text) {
      return respond(function () {
        var clean = String(text || '').trim();
        if (!clean) throw new Error('Message is empty');
        var db = load();
        var t = db.threads.filter(function (x) { return x.id === threadId; })[0];
        if (!t) throw new Error('Conversation not found');
        var msg = { id: uid('msg'), from: 'me', text: clean.slice(0, 2000), at: new Date().toISOString() };
        t.messages.push(msg);
        t.updatedAt = msg.at;
        save(db);
        demoReply(threadId, clean);
        return msg;
      });
    },

    sessions: function () {
      return respond(function () {
        var db = load();
        return db.sessions.map(function (s) { s.member = memberById(s.memberId); return s; })
          .sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
      });
    },

    createSession: function (p) {
      return respond(function () {
        var db = load();
        if (!p.memberId || !p.skill || !p.start) throw new Error('Choose a partner, a skill and a time.');
        var s = { id: uid('s'), memberId: p.memberId, skill: p.skill, role: p.role || 'learn', start: p.start, duration: Number(p.duration) || 60, mode: p.mode || 'Online', place: p.place || '', status: 'upcoming', createdAt: new Date().toISOString() };
        db.sessions.push(s);
        var m = memberById(p.memberId);
        var t = ensureThread(db, p.memberId, 'Session booked — ' + s.skill + ' on ' + new Date(s.start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }));
        t.updatedAt = new Date().toISOString();
        notify(db, { icon: 'calendar', title: 'Session booked with ' + (m ? m.name.split(' ')[0] : 'your partner'), body: s.skill, link: 'sessions' });
        save(db);
        emit('change', { scope: 'sessions' });
        return s;
      });
    },

    cancelSession: function (id) {
      return respond(function () {
        var db = load();
        db.sessions.forEach(function (s) { if (s.id === id) s.status = 'cancelled'; });
        save(db);
        emit('change', { scope: 'sessions' });
        return true;
      });
    },

    completeSession: function (id, rating) {
      return respond(function () {
        var db = load();
        var s = db.sessions.filter(function (x) { return x.id === id; })[0];
        if (!s) throw new Error('Session not found');
        if (s.status === 'completed') throw new Error('Already completed');
        s.status = 'completed';
        s.ratingGiven = rating;
        var hours = Math.round((s.duration / 60) * 100) / 100;
        var m = memberById(s.memberId);
        var first = m ? m.name.split(' ')[0] : 'partner';
        db.ledger.push({
          id: uid('l'), at: new Date().toISOString(), amount: s.role === 'teach' ? hours : -hours,
          note: (s.role === 'teach' ? 'Taught ' : 'Learned ') + s.skill + (s.role === 'teach' ? ' to ' : ' from ') + first
        });
        notify(db, { icon: 'wallet', title: (s.role === 'teach' ? '+' : '−') + hours + 'h credit', body: s.skill + ' with ' + first, link: 'wallet' });
        save(db);
        emit('change', { scope: 'sessions' });
        return s;
      });
    },

    wallet: function () {
      return respond(function () {
        var db = load();
        var ledger = db.ledger.slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
        var running = 0;
        ledger.forEach(function (l) { running += l.amount; l.balance = Math.round(running * 100) / 100; });
        return { balance: Math.round(running * 100) / 100, ledger: ledger.reverse() };
      });
    },

    notifications: function () { return respond(function () { return load().notifications; }); },

    readAllNotifications: function () {
      return respond(function () {
        var db = load();
        db.notifications.forEach(function (n) { n.read = true; });
        save(db);
        return true;
      });
    },

    stats: function () {
      return respond(function () {
        var db = load();
        var me = requireUser();
        var done = db.sessions.filter(function (s) { return s.status === 'completed'; });
        var taught = done.filter(function (s) { return s.role === 'teach'; }).reduce(function (n, s) { return n + s.duration / 60; }, 0);
        var learned = done.filter(function (s) { return s.role === 'learn'; }).reduce(function (n, s) { return n + s.duration / 60; }, 0);
        var received = done.map(function (s) { return s.ratingReceived && s.ratingReceived.stars; }).filter(Boolean);
        var checks = [!!me.photo, !!me.bio, me.teach.length > 0, me.learn.length > 0, (me.availability.days || []).length > 0, me.languages.length > 0, !!me.location.city, me.interests.length >= 3];
        return {
          credits: db.ledger.reduce(function (n, l) { return n + l.amount; }, 0),
          sessionsDone: done.length,
          upcoming: db.sessions.filter(function (s) { return s.status === 'upcoming' && new Date(s.start) > new Date(); }).length,
          hoursTaught: taught,
          hoursLearned: learned,
          rating: received.length ? received.reduce(function (a, b) { return a + b; }, 0) / received.length : null,
          pendingIncoming: db.requests.filter(function (r) { return r.direction === 'incoming' && r.status === 'pending'; }).length,
          unread: db.threads.reduce(function (n, t) { return n + (t.unread || 0); }, 0),
          unreadNotifications: db.notifications.filter(function (n) { return !n.read; }).length,
          profileStrength: Math.round(checks.filter(Boolean).length / checks.length * 100),
          missing: [
            !me.photo && 'Add a profile photo', !me.bio && 'Write a short bio',
            (me.availability.days || []).length === 0 && 'Set your availability', me.interests.length < 3 && 'Pick 3+ interests'
          ].filter(Boolean)
        };
      });
    },

    resetDemo: function () {
      return respond(function () {
        var me = requireUser();
        SE.storage.remove(dbKey(me));
        load();
        emit('change', { scope: 'all' });
        return true;
      });
    },

    /** Build an .ics calendar file for a session (client-side, no server needed). */
    icsFor: function (session, memberName) {
      function fmt(d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
      var end = new Date(new Date(session.start).getTime() + session.duration * 60000);
      return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Barterly//Skill exchange//EN', 'BEGIN:VEVENT',
        'UID:' + session.id + '@barterly', 'DTSTAMP:' + fmt(new Date()), 'DTSTART:' + fmt(session.start), 'DTEND:' + fmt(end),
        'SUMMARY:' + session.skill + ' with ' + memberName + ' (Barterly)',
        'LOCATION:' + (session.place || session.mode), 'DESCRIPTION:Skill swap booked on Barterly', 'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
    }
  };

  api.score = score;
  SE.api = api;
})(window.SE = window.SE || {});
