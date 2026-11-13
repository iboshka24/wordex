/* Grammar course: ready-made lessons by language and level, separate from the learner's words.
   v2.23 — language plates → path of topics → lesson → practice.
   v2.24 — the lesson is taught step by step: notice the pattern first, the rule in small pieces with a question
   after each, how it's built, fix a real mistake, write your own sentence (checked by the AI). Practice explains
   every mistake for that exercise, counts a combo, gives 1–3 stars; done topics come back for spaced reviews;
   each level ends with a checkpoint: grammar, listening, reading and writing.
   course/catalog.json lists the languages; course/<code>.json holds the lessons of a ready language.
   The pure helpers are tested in Node (test/course.js); mount() draws the course inside the grammar screen. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMCourse = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var UI = ['ru', 'en', 'uz'];
  var LEVELS = ['A1', 'A2', 'B1', 'B2'];
  var KINDS = ['choose', 'error', 'order', 'type'];
  var PASS = 0.75;                          // 6 of 8 counts as "done"
  var REVIEW_DAYS = [1, 3, 7, 14, 30, 60];  // spaced reviews of a done topic
  var REVIEW_SIZE = 5;
  var DAY = 86400000;

  /* ---------- pure helpers ---------- */
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFC').toLocaleLowerCase()
      .replace(/[’‘ʻʼ`]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/g, '').trim();
  }
  function shuffle(list, rand) {
    var r = rand || Math.random, a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function checkType(ex, value) {
    var v = norm(value);
    return !!v && (ex.a || []).some(function (a) { return norm(a) === v; });
  }
  function checkOrder(ex, tokens) {
    var got = norm((tokens || []).join(' '));
    return [ex.w].concat(ex.alt || []).some(function (w) { return norm(w.join(' ')) === got; });
  }
  // "Fix the mistake": the corrected sentence must match (case, curly quotes and final punctuation aside).
  function checkFix(mistake, value) { return norm(value) === norm(mistake.right) && norm(value) !== norm(mistake.wrong); }
  function prepare(ex, rand) {
    var item = { k: ex.k, src: ex };
    if (ex.k === 'choose' || ex.k === 'error') {
      var order = shuffle(ex.o.map(function (_, i) { return i; }), rand);
      item.options = order.map(function (i) { return ex.o[i]; });
      item.answer = order.indexOf(ex.a);
      item.q = ex.q || '';
    } else if (ex.k === 'order') {
      var tiles = shuffle(ex.w, rand), tries = 0;
      while (tiles.join(' ') === ex.w.join(' ') && ex.w.length > 1 && tries++ < 6) tiles = shuffle(ex.w, rand);
      item.tiles = tiles;
    } else { item.q = ex.q; }
    return item;
  }
  // A practice set: the topic's exercises in a fresh order (or `size` of them), options shuffled, the right one tracked.
  function buildSession(topic, rand, size) {
    var list = shuffle(topic.ex, rand);
    if (size) list = list.slice(0, size);
    return list.map(function (ex) { return prepare(ex, rand); });
  }
  function score(results) { return results.filter(Boolean).length; }
  function passed(best, total) { return total > 0 && best / total >= PASS; }
  // 6/8 → ★, 7/8 → ★★, 8/8 → ★★★ (scaled for other sizes).
  function stars(best, total) {
    if (!passed(best, total)) return 0;
    if (best >= total) return 3;
    return best >= total - Math.max(1, Math.round(total / 8)) ? 2 : 1;
  }
  function text(obj, lang) { return obj ? obj[lang] || obj.ru || obj.en || '' : ''; }
  function topicState(rec) {
    if (!rec) return 'new';
    if (rec.total && passed(rec.best || 0, rec.total)) return 'done';
    return 'seen';
  }
  function isDue(rec, now) { return topicState(rec) === 'done' && rec.due > 0 && rec.due <= now; }
  // After a finished practice or review: the next review moves further away when it goes well, back to tomorrow when not.
  function scheduleReview(rec, ok, now) {
    var rev = ok ? Math.min((rec.rev || 0) + 1, REVIEW_DAYS.length) : 0;
    return { rev: rev, due: now + REVIEW_DAYS[Math.min(rev, REVIEW_DAYS.length - 1)] * DAY };
  }
  function langDone(code, topics, progress) {
    return (topics || []).filter(function (t) { return topicState(progress[code + '.' + t.id]) === 'done'; }).length;
  }
  // "I *am* tired." → [{t:'I '}, {t:'am', hi:true}, {t:' tired.'}]
  function marked(s) {
    var out = [], parts = String(s).split('*');
    parts.forEach(function (p, i) { if (p) out.push({ t: p, hi: i % 2 === 1 }); });
    return out;
  }
  // The lesson, step by step.
  function lessonSteps(t) {
    var steps = [];
    if (t.discover) steps.push({ kind: 'discover' });
    (t.explain.ru || []).forEach(function (_, i) { steps.push({ kind: 'point', i: i }); });
    steps.push({ kind: 'build' });
    if (t.mistake) steps.push({ kind: 'fix' });
    if (t.write) steps.push({ kind: 'write' });
    return steps;
  }
  // Level checkpoint: grammar from every topic of the level, listening from their examples, the level's reading and writing.
  function checkpoint(file, level, rand) {
    var r = rand || Math.random, topics = file.topics.filter(function (t) { return t.level === level; });
    var grammar = shuffle(topics, r).slice(0, 8).map(function (t) {
      var pool = t.ex.filter(function (e) { return e.k === 'choose' || e.k === 'error'; });
      var it = prepare(pool[Math.floor(r() * pool.length)], r); it.topic = t.id; return it;
    });
    var sentences = [];
    topics.forEach(function (t) { t.examples.forEach(function (e) { sentences.push(e.s); }); });
    var listening = shuffle(sentences, r).slice(0, 3).map(function (s) {
      var others = shuffle(sentences.filter(function (x) { return x !== s; }), r).slice(0, 2);
      var opts = shuffle([s].concat(others), r);
      return { k: 'listen', say: s, options: opts, answer: opts.indexOf(s) };
    });
    var lv = (file.levels || {})[level] || {};
    var reading = lv.reading ? lv.reading.qs.map(function (q) {
      var order = shuffle(q.o.map(function (_, i) { return i; }), r);
      return { k: 'read', q: q.q, options: order.map(function (i) { return q.o[i]; }), answer: order.indexOf(q.a) };
    }) : [];
    return { level: level, grammar: grammar, listening: listening, reading: reading, text: lv.reading || null, write: lv.write || null };
  }
  function validateLessons(file) {
    var errs = [], seen = {};
    function need(cond, msg) { if (!cond) errs.push(msg); }
    function langs(o, where) { UI.forEach(function (l) { need(o && typeof o[l] === 'string' && o[l].trim(), where + ': missing ' + l); }); }
    function choice(c, at, gap) {
      need(Array.isArray(c.o) && c.o.length >= 2 && c.a >= 0 && c.a < c.o.length, at + ': options/answer');
      need(c.o && c.o.every(function (o, j) { return c.o.indexOf(o) === j; }), at + ': duplicate options');
      if (gap) need(/___/.test(c.q || ''), at + ': gap');
    }
    need(file && typeof file.lang === 'string', 'lang');
    (file && file.topics || []).forEach(function (t, n) {
      var w = (t.id || '#' + n);
      need(/^[a-z0-9-]{2,40}$/.test(t.id || ''), w + ': bad id');
      need(!seen[t.id], w + ': duplicate id'); seen[t.id] = true;
      need(LEVELS.indexOf(t.level) >= 0, w + ': bad level');
      langs(t.title, w + ' title'); langs(t.sum, w + ' sum'); langs(t.tip, w + ' tip');
      UI.forEach(function (l) { need(t.explain && Array.isArray(t.explain[l]) && t.explain[l].length >= 2, w + ' explain ' + l); });
      UI.forEach(function (l) { need(t.explain && t.explain[l] && t.explain[l].length === t.explain.ru.length, w + ' explain ' + l + ' length'); });
      need(Array.isArray(t.formula) && t.formula.length, w + ': formula');
      need(Array.isArray(t.examples) && t.examples.length >= 2, w + ': examples');
      (t.examples || []).forEach(function (e, i) { need(e.s && e.t && e.t.ru && e.t.uz, w + ' example ' + i); });
      need(t.mistake && t.mistake.wrong && t.mistake.right && t.mistake.wrong !== t.mistake.right, w + ': mistake');
      if (t.mistake) langs(t.mistake.note, w + ' mistake note');
      // v2.24 teaching steps
      need(t.discover && Array.isArray(t.discover.s) && t.discover.s.length >= 2 && t.discover.s.every(function (s) { return /\*[^*]+\*/.test(s); }), w + ': discover sentences with *marks*');
      if (t.discover) { langs(t.discover.q, w + ' discover q'); (t.discover.o || []).forEach(function (o, i) { langs(o, w + ' discover option ' + i); }); need(t.discover.a >= 0 && t.discover.a < (t.discover.o || []).length, w + ': discover answer'); }
      need(Array.isArray(t.checks) && t.explain && t.checks.length === t.explain.ru.length, w + ': one check per rule point');
      (t.checks || []).forEach(function (c, i) { choice(c, w + ' check ' + i, true); langs(c.e, w + ' check ' + i + ' why'); });
      langs(t.write, w + ' write');
      need(Array.isArray(t.ex) && t.ex.length >= 6, w + ': at least 6 exercises');
      (t.ex || []).forEach(function (e, i) {
        var at = w + ' ex ' + i;
        need(KINDS.indexOf(e.k) >= 0, at + ': kind');
        if (e.k === 'choose' || e.k === 'error') choice(e, at, e.k === 'choose');
        if (e.k === 'order') need(Array.isArray(e.w) && e.w.length >= 3, at + ': words');
        if (e.k === 'type') need(/___/.test(e.q || '') && Array.isArray(e.a) && e.a.length, at + ': gap/answers');
        if (e.k !== 'order') langs(e.e, at + ' why');
      });
    });
    var lv = file && file.levels || {};
    LEVELS.forEach(function (level) {
      if (!(file.topics || []).some(function (t) { return t.level === level; })) return;
      var L = lv[level];
      need(L && L.reading && L.reading.text && Array.isArray(L.reading.qs) && L.reading.qs.length >= 2, level + ': checkpoint reading');
      if (L && L.reading) L.reading.qs.forEach(function (q, i) { choice(q, level + ' reading ' + i, false); });
      if (L) langs(L.write, level + ' checkpoint write');
    });
    return errs;
  }

  /* ---------- UI ---------- */
  function mount(api) {
    var $ = function (id) { return document.getElementById(id); };
    var root = $('courseView');
    if (!root) return null;
    var tr = api.tr;
    var catalog = null, lessons = {}, lang = null, topic = null, session = null, lesson = null;
    var LANG_KEY = 'vm.course-lang';

    function h(tag, props, kids) {
      var el = document.createElement(tag);
      Object.keys(props || {}).forEach(function (k) {
        if (k === 'text') el.textContent = props[k];
        else if (k === 'className') el.className = props[k];
        else if (k === 'html') el.innerHTML = props[k]; // only for our own static strings
        else el.setAttribute(k, props[k]);
      });
      (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      return el;
    }
    function ui() { var l = api.uiLang(); return UI.indexOf(l) >= 0 ? l : 'ru'; }
    function progress() { return api.progress() || {}; }
    function rec(key) { return progress()[key]; }
    function save(key, patch) {
      var out = Object.assign({}, rec(key) || {}, patch);
      Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
      api.saveProgress(key, out);
    }
    function now() { return Date.now(); }
    function getJSON(url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    function loadCatalog() { return catalog ? Promise.resolve(catalog) : getJSON('course/catalog.json').then(function (c) { catalog = c; return c; }); }
    function loadLessons(code) {
      return lessons[code] ? Promise.resolve(lessons[code]) : getJSON('course/' + code + '.json').then(function (d) { lessons[code] = d; return d; });
    }
    function langInfo(code) { return catalog.languages.find(function (l) { return l.code === code; }); }
    function topicsOf(code) {
      var info = langInfo(code);
      return info.ready && lessons[code] ? lessons[code].topics : info.topics || [];
    }
    function show(view) {
      ['courseHome', 'courseLesson', 'coursePractice'].forEach(function (id) { $(id).hidden = id !== view; });
      root.dataset.view = view;
    }
    function focusTop(el) { if (!el) return; el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); var y = root.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > y) window.scrollTo({ top: y }); }
    var SPEAKER = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
    function sayBtn(s, cls) {
      var b = h('button', { className: 'speak-btn ' + (cls || 'lesson-say'), type: 'button', 'aria-label': tr('card.speak') + ': ' + s, html: SPEAKER });
      b.onclick = function () { api.speak(s, lang, b); };
      return b;
    }
    function starRow(n, big) {
      var row = h('span', { className: 'stars' + (big ? ' big' : ''), role: 'img', 'aria-label': tr('course.starsAria', { n: n }) });
      for (var i = 0; i < 3; i++) row.appendChild(h('i', { className: i < n ? 'on' : '', 'aria-hidden': 'true', text: '★' }));
      return row;
    }
    function markedLine(s, cls) {
      var p = h('p', { className: cls || 'mark-line', lang: lang });
      marked(s).forEach(function (part) { p.appendChild(part.hi ? h('mark', { text: part.t }) : document.createTextNode(part.t)); });
      return p;
    }

    /* ===== home: language plates + the path of topics ===== */
    function ring(done, total) {
      var r = 15, c = 2 * Math.PI * r, part = total ? done / total : 0;
      var svg = '<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true"><circle cx="18" cy="18" r="' + r + '" class="ring-bg"/>' +
        '<circle cx="18" cy="18" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * part).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>';
      return h('span', { className: 'plate-ring', html: svg });
    }
    function renderLangs() {
      var box = $('courseLangs'); box.textContent = '';
      // Only ready languages are plates; the rest share one quiet "coming soon" tile (v2.26).
      catalog.languages.filter(function (l) { return l.ready; }).forEach(function (l) {
        var topics = l.ready && lessons[l.code] ? lessons[l.code].topics : (l.topics || []);
        var done = l.ready ? langDone(l.code, topics, progress()) : 0;
        var b = h('button', { className: 'plate' + (l.code === lang ? ' on' : '') + (l.ready ? '' : ' soon'), type: 'button', role: 'radio', 'aria-checked': String(l.code === lang), 'data-code': l.code }, [
          h('span', { className: 'plate-glyph', text: l.glyph, lang: l.code }),
          h('span', { className: 'plate-name', text: l.native, lang: l.code }),
          h('span', { className: 'plate-meta', text: l.ready ? (lessons[l.code] ? done + '/' + topics.length : tr('course.topicsN', { n: topics.length || '…' })) : tr('course.soon') })
        ]);
        if (l.ready && lessons[l.code]) b.appendChild(ring(done, topics.length));
        b.onclick = function () { pickLang(l.code); };
        box.appendChild(b);
        if (l.code === lang && box.scrollWidth > box.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      var later = catalog.languages.filter(function (l) { return !l.ready; });
      if (later.length) {
        var more = h('div', { className: 'plate plate-more' }, [
          h('span', { className: 'plate-glyph', text: '+', 'aria-hidden': 'true' }),
          h('span', { className: 'plate-name', text: tr('course.moreSoon') })
        ]);
        var names = h('span', { className: 'plate-meta' });
        later.forEach(function (l, i) { if (i) names.appendChild(document.createTextNode(' · ')); names.appendChild(h('span', { text: l.native, lang: l.code })); });
        more.appendChild(names);
        box.appendChild(more);
      }
    }
    function pickLang(code) {
      lang = code;
      try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
      var info = langInfo(code);
      renderLangs();
      if (info.ready) {
        $('coursePath').setAttribute('aria-busy', 'true');
        loadLessons(code).then(function () { if (lang === code) { renderLangs(); renderPath(); } }, function () { renderError($('coursePath')); });
      } else renderPath();
    }
    function renderError(box) {
      box.removeAttribute('aria-busy');
      box.textContent = '';
      var retry = h('button', { className: 'link', type: 'button', text: tr('course.retry') });
      retry.onclick = function () { pickLang(lang); };
      box.appendChild(h('p', { className: 'course-error' }, [tr('course.loadErr') + ' ', retry]));
    }
    function dueTopics() {
      var t = now(), prog = progress();
      return topicsOf(lang).filter(function (x) { return isDue(prog[lang + '.' + x.id], t); });
    }
    function renderPath() {
      var box = $('coursePath'), info = langInfo(lang), topics = topicsOf(lang), prog = progress(), l = ui();
      box.removeAttribute('aria-busy');
      box.textContent = '';
      if (!info.ready) box.appendChild(h('p', { className: 'course-soon-note' }, [h('strong', { text: tr('course.soon') + ' · ' }), tr('course.soonText')]));
      else {
        var due = dueTopics();
        var next = topics.find(function (t) { return topicState(prog[lang + '.' + t.id]) !== 'done'; });
        var done = langDone(lang, topics, prog);
        var head = h('div', { className: 'course-resume' + (due.length ? ' is-review' : '') });
        var textBox = h('div', { className: 'course-resume-text' });
        var go;
        if (due.length) {
          textBox.appendChild(h('span', { className: 'eyebrow', text: tr('course.reviewDue', { n: due.length }) }));
          textBox.appendChild(h('strong', { text: text(due[0].title, l) }));
          textBox.appendChild(h('span', { className: 'course-resume-sub', text: tr('course.reviewWhy') }));
          go = h('button', { className: 'btn primary', type: 'button', text: tr('course.reviewGo', { n: REVIEW_SIZE }) });
          go.onclick = function () { topic = due[0]; startPractice('review'); };
        } else {
          textBox.appendChild(h('span', { className: 'eyebrow', text: tr('course.progress', { d: done, n: topics.length }) }));
          textBox.appendChild(h('strong', { text: next ? text(next.title, l) : tr('course.allDone') }));
          if (next) {
            go = h('button', { className: 'btn primary', type: 'button', text: topicState(prog[lang + '.' + next.id]) === 'new' ? tr('course.start') : tr('course.continue') });
            go.onclick = function () { openTopic(next.id); };
          }
        }
        head.appendChild(textBox);
        if (go) head.appendChild(go);
        var bar = h('span', { className: 'course-resume-bar' }); bar.appendChild(h('i', {}));
        bar.firstChild.style.width = (topics.length ? Math.round(done / topics.length * 100) : 0) + '%';
        head.appendChild(bar);
        box.appendChild(head);
      }
      var n = 0, t0 = now();
      LEVELS.forEach(function (level) {
        var list = topics.filter(function (t) { return t.level === level; });
        if (!list.length) return;
        var cp = info.ready ? prog[lang + '.check-' + level.toLowerCase()] : null;
        var chapter = h('section', { className: 'chapter', 'aria-label': level + ' · ' + tr('course.lvl.' + level) }, [
          h('header', { className: 'chapter-head' }, [h('span', { className: 'chapter-level', text: level }), h('span', { className: 'chapter-name', text: tr('course.lvl.' + level) }),
            cp && cp.done ? h('span', { className: 'chapter-badge', text: '✓ ' + tr('course.cpPassed') }) : null])
        ]);
        var ol = h('ol', { className: 'stops' });
        list.forEach(function (t) {
          n++;
          var r = prog[lang + '.' + t.id], st = info.ready ? topicState(r) : 'soon', due = info.ready && isDue(r, t0);
          var node = h('span', { className: 'stop-node', 'aria-hidden': 'true', text: due ? '↻' : st === 'done' ? '✓' : String(n) });
          var body = h('span', { className: 'stop-body' }, [
            h('span', { className: 'stop-title', text: text(t.title, l) }),
            t.sum ? h('span', { className: 'stop-sum', text: text(t.sum, l) }) : null
          ]);
          var chip;
          if (st === 'soon') chip = h('span', { className: 'stop-chip soon', text: tr('course.soon') });
          else if (due) chip = h('span', { className: 'stop-chip due', text: tr('course.reviewChip') });
          else if (st === 'done') { chip = h('span', { className: 'stop-chip done' }); chip.appendChild(starRow(stars(r.best, r.total))); }
          else if (st === 'seen') chip = h('span', { className: 'stop-chip seen', text: r.total ? tr('course.best', { s: r.best || 0, t: r.total }) : r.lesson ? tr('course.st.lesson') : tr('course.st.seen') });
          else chip = h('span', { className: 'stop-chip new', text: tr('course.minutes', { n: 8 }) });
          var row = h(info.ready ? 'button' : 'div', { className: 'stop ' + st + (due ? ' due' : '') }, [node, body, chip]);
          if (info.ready) { row.type = 'button'; row.onclick = function () { if (due) { topic = t; startPractice('review'); } else openTopic(t.id); }; }
          ol.appendChild(h('li', {}, [row]));
        });
        if (info.ready && lessons[lang].levels && lessons[lang].levels[level]) {
          var cpChip;
          if (cp && cp.total) { cpChip = h('span', { className: 'stop-chip ' + (cp.done ? 'done' : 'seen') }); cpChip.appendChild(starRow(stars(cp.best, cp.total))); }
          else cpChip = h('span', { className: 'stop-chip new', text: tr('course.minutes', { n: 12 }) });
          var cpRow = h('button', { className: 'stop checkpoint' + (cp && cp.done ? ' done' : ''), type: 'button' }, [
            h('span', { className: 'stop-node', 'aria-hidden': 'true', text: '◆' }),
            h('span', { className: 'stop-body' }, [h('span', { className: 'stop-title', text: tr('course.cpTitle', { l: level }) }), h('span', { className: 'stop-sum', text: tr('course.cpSum') })]),
            cpChip
          ]);
          cpRow.onclick = function () { startCheckpoint(level); };
          ol.appendChild(h('li', {}, [cpRow]));
        }
        chapter.appendChild(ol);
        box.appendChild(chapter);
      });
    }

    /* ===== lesson ===== */
    function openTopic(id, mode) {
      topic = lessons[lang].topics.find(function (t) { return t.id === id; });
      if (!topic) return;
      var key = lang + '.' + id, r = rec(key);
      if (!r) save(key, { seen: now() });
      lesson = { steps: lessonSteps(topic), i: 0, answered: {}, mode: mode || (r && r.lesson ? 'summary' : 'steps') };
      $('courseLessonLevel').textContent = topic.level + ' · ' + tr('course.lvl.' + topic.level);
      $('courseLessonTitle').textContent = text(topic.title, ui());
      $('courseLessonSum').textContent = text(topic.sum, ui());
      renderLessonMode();
      show('courseLesson');
      focusTop($('courseLessonTitle'));
    }
    function renderLessonMode() {
      var steps = lesson.mode === 'steps';
      $('lessonStepper').hidden = !steps;
      $('courseLessonBody').hidden = steps;
      $('lessonSummaryCta').hidden = steps;
      $('btnLessonMode').textContent = steps ? tr('course.toSummary') : tr('course.toSteps');
      $('btnCoursePractice').textContent = tr('course.practice', { n: topic.ex.length });
      if (steps) renderStep(); else renderSummary();
    }
    // The whole rule on one page (for a second look or a quick revision).
    function renderSummary() {
      var box = $('courseLessonBody'), l = ui(), t = topic;
      box.textContent = '';
      var rule = h('section', { className: 'lesson-rule' }, [h('h3', { className: 'lesson-h', text: tr('course.rule') })]);
      var ol = h('ol', { className: 'lesson-points' });
      (t.explain[l] || t.explain.ru).forEach(function (p) { ol.appendChild(h('li', { text: p })); });
      rule.appendChild(ol);
      box.appendChild(rule);
      box.appendChild(buildCard());
      var m = t.mistake;
      box.appendChild(h('aside', { className: 'lesson-mistake' }, [
        h('h3', { className: 'lesson-h', text: tr('course.mistake') }),
        h('p', { className: 'mistake-wrong', lang: lang }, [h('span', { className: 'mistake-mark', 'aria-label': tr('course.wrong'), text: '✗' }), h('s', { text: m.wrong })]),
        h('p', { className: 'mistake-right', lang: lang }, [h('span', { className: 'mistake-mark', 'aria-label': tr('course.right'), text: '✓' }), h('span', { text: m.right })]),
        h('p', { className: 'mistake-note', text: text(m.note, l) })
      ]));
    }
    function buildCard() {
      var t = topic, l = ui();
      var wrap = h('div', { className: 'lesson-build' });
      var formula = h('section', { className: 'lesson-formula' }, [h('h3', { className: 'lesson-h', text: tr('course.formula') })]);
      var cards = h('div', { className: 'formula-cards' });
      t.formula.forEach(function (f, i) { var fc = h('span', { className: 'formula-card', lang: lang, text: f }); fc.style.setProperty('--i', i); cards.appendChild(fc); });
      formula.appendChild(cards);
      wrap.appendChild(formula);
      var ex = h('section', { className: 'lesson-examples' }, [h('h3', { className: 'lesson-h', text: tr('course.examples') })]);
      t.examples.forEach(function (e) {
        var tl = e.t && e.t[l];
        ex.appendChild(h('div', { className: 'lesson-example' }, [sayBtn(e.s), h('div', {}, [h('p', { className: 'lesson-ex-s', lang: lang, text: e.s }), tl ? h('p', { className: 'lesson-ex-t', text: tl }) : null])]));
      });
      wrap.appendChild(ex);
      return wrap;
    }
    function stepTitle(step) {
      return step.kind === 'point' ? tr('course.step.point', { n: step.i + 1, t: topic.explain.ru.length }) : tr('course.step.' + step.kind);
    }
    // A multiple-choice question inside the lesson: answer, see why, then move on.
    function lessonQuestion(stage, opts, answer, onAnswered, whyRight, whyWrong) {
      var area = h('div', { className: 'practice-area is-pills lesson-q-opts' });
      var fb = h('div', { className: 'practice-feedback', role: 'status', 'aria-live': 'polite' });
      opts.forEach(function (o, i) {
        var b = h('button', { className: 'answer-opt', type: 'button', text: o });
        b.onclick = function () {
          if (area.dataset.done) return;
          area.dataset.done = '1';
          var ok = i === answer;
          area.querySelectorAll('.answer-opt').forEach(function (x, j) { x.disabled = true; if (j === answer) x.classList.add('right'); else if (j === i) x.classList.add('wrong'); });
          fb.textContent = '';
          fb.appendChild(h('p', { className: ok ? 'fb-ok' : 'fb-no' }, [ok ? tr('course.ok' + (1 + (answer % 3))) : tr('course.no') + ' ', ok ? null : h('strong', { text: opts[answer] })]));
          var why = ok ? whyRight : whyWrong;
          if (why) fb.appendChild(h('p', { className: 'fb-why', text: why }));
          stage.classList.add(ok ? 'is-ok' : 'is-no');
          api.sound(ok);
          onAnswered(ok);
        };
        area.appendChild(b);
      });
      stage.appendChild(area);
      stage.appendChild(fb);
    }
    function renderStep() {
      var l = ui(), t = topic, step = lesson.steps[lesson.i], stage = $('lessonStage');
      stage.textContent = ''; stage.className = 'lesson-stage kind-' + step.kind;
      var dots = $('lessonDots'); dots.textContent = '';
      lesson.steps.forEach(function (_, i) { dots.appendChild(h('i', { className: i < lesson.i ? 'done' : i === lesson.i ? 'now' : '' })); });
      $('lessonStepLabel').textContent = (lesson.i + 1) + ' / ' + lesson.steps.length + ' · ' + stepTitle(step);
      var nextBtn = $('btnStepNext'), backBtn = $('btnStepBack');
      backBtn.hidden = lesson.i === 0;
      var last = lesson.i === lesson.steps.length - 1;
      nextBtn.textContent = last ? tr('course.lessonDone') : tr('course.next');
      var gate = function (open) { nextBtn.disabled = !open; };
      var card = h('div', { className: 'step-card' });
      stage.appendChild(card);
      if (step.kind === 'discover') {
        var d = t.discover;
        card.appendChild(h('span', { className: 'step-eyebrow', text: tr('course.discoverEyebrow') }));
        card.appendChild(h('p', { className: 'step-lead', text: tr('course.discoverLead') }));
        var lines = h('div', { className: 'discover-lines' });
        d.s.forEach(function (s) { lines.appendChild(h('div', { className: 'discover-line' }, [sayBtn(s.replace(/\*/g, '')), markedLine(s)])); });
        card.appendChild(lines);
        card.appendChild(h('p', { className: 'step-question', text: text(d.q, l) }));
        lessonQuestion(card, d.o.map(function (o) { return text(o, l); }), d.a, function () { lesson.answered[lesson.i] = true; gate(true); },
          tr('course.discoverRight'), tr('course.discoverWrong'));
        gate(!!lesson.answered[lesson.i]);
      } else if (step.kind === 'point') {
        var c = t.checks[step.i];
        card.appendChild(h('span', { className: 'step-eyebrow', text: stepTitle(step) }));
        card.appendChild(h('p', { className: 'step-rule', text: (t.explain[l] || t.explain.ru)[step.i] }));
        var q = h('div', { className: 'step-check' }, [h('p', { className: 'practice-prompt', text: tr('course.checkNow') })]);
        var line = h('p', { className: 'practice-q small', lang: lang });
        c.q.split('___').forEach(function (part, i, all) { line.appendChild(document.createTextNode(part)); if (i < all.length - 1) line.appendChild(h('span', { className: 'gap', text: ' ' })); });
        q.appendChild(line);
        card.appendChild(q);
        lessonQuestion(q, c.o, c.a, function () {
          var gap = line.querySelector('.gap'); if (gap) { gap.textContent = c.o[c.a]; gap.classList.add('filled'); }
          lesson.answered[lesson.i] = true; gate(true);
        }, text(c.e, l), text(c.e, l));
        gate(!!lesson.answered[lesson.i]);
      } else if (step.kind === 'build') {
        card.appendChild(h('span', { className: 'step-eyebrow', text: tr('course.step.build') }));
        card.appendChild(h('p', { className: 'step-lead', text: tr('course.buildLead') }));
        card.appendChild(buildCard());
        gate(true);
      } else if (step.kind === 'fix') {
        var m = t.mistake;
        card.appendChild(h('span', { className: 'step-eyebrow', text: tr('course.step.fix') }));
        card.appendChild(h('p', { className: 'step-lead', text: tr('course.fixLead') }));
        var input = h('input', { className: 'type-input fix-input', type: 'text', lang: lang, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': tr('course.fixAria') });
        input.value = m.wrong;
        var fixFb = h('div', { className: 'practice-feedback', role: 'status', 'aria-live': 'polite' });
        var checkBtn = h('button', { className: 'btn primary', type: 'button', text: tr('course.check') });
        var reveal = h('button', { className: 'link', type: 'button', text: tr('course.showAnswer') });
        reveal.hidden = true;
        var done = function (ok) {
          input.readOnly = true; checkBtn.hidden = true; reveal.hidden = true;
          fixFb.textContent = '';
          fixFb.appendChild(h('p', { className: ok ? 'fb-ok' : 'fb-no' }, [ok ? tr('course.fixOk') : tr('course.no') + ' ', ok ? null : h('strong', { lang: lang, text: m.right })]));
          fixFb.appendChild(h('p', { className: 'fb-why', text: text(m.note, l) }));
          card.classList.add(ok ? 'is-ok' : 'is-no');
          lesson.answered[lesson.i] = true; gate(true);
        };
        checkBtn.onclick = function () {
          if (checkFix(m, input.value)) { api.sound(true); done(true); return; }
          api.sound(false);
          fixFb.textContent = '';
          fixFb.appendChild(h('p', { className: 'fb-no', text: norm(input.value) === norm(m.wrong) ? tr('course.fixSame') : tr('course.fixNot') }));
          reveal.hidden = false;
          input.focus();
        };
        reveal.onclick = function () { input.value = m.right; done(false); };
        input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!input.readOnly) checkBtn.click(); else nextBtn.click(); } };
        card.appendChild(h('p', { className: 'fix-wrong', lang: lang }, [h('span', { className: 'mistake-mark', text: '✗' }), h('s', { text: m.wrong })]));
        card.appendChild(input);
        card.appendChild(h('div', { className: 'fix-actions' }, [checkBtn, reveal]));
        card.appendChild(fixFb);
        if (lesson.answered[lesson.i]) { input.value = m.right; done(true); }
        else gate(false);
      } else if (step.kind === 'write') {
        card.appendChild(h('span', { className: 'step-eyebrow', text: tr('course.step.write') }));
        card.appendChild(h('p', { className: 'step-lead', text: text(t.write, l) }));
        writeBox(card, { topic: text(t.title, 'en'), task: text(t.write, 'en') }, function () { lesson.answered[lesson.i] = true; nextBtn.textContent = tr('course.lessonDone'); });
        nextBtn.textContent = lesson.answered[lesson.i] ? tr('course.lessonDone') : tr('course.skipFinish');
        gate(true);
      }
      var first = stage.querySelector('.answer-opt:not([disabled]), .fix-input:not([readonly]), textarea');
      if (first && lesson.i > 0) first.focus({ preventScroll: true });
    }
    // "Your turn": the learner's own sentences, checked by the AI (with a calm fallback when it isn't available).
    function writeBox(host, about, onChecked, onResult) {
      var l = ui();
      var area = h('textarea', { className: 'write-input', rows: '3', maxlength: '500', lang: lang, 'aria-label': tr('course.writeAria'), placeholder: tr('course.writePh') });
      var btn = h('button', { className: 'btn primary', type: 'button', text: tr('course.writeCheck') });
      var out = h('div', { className: 'write-result', role: 'status', 'aria-live': 'polite' });
      btn.disabled = true;
      area.oninput = function () { btn.disabled = !area.value.trim(); };
      btn.onclick = function () {
        var value = area.value.trim(); if (!value) return;
        btn.disabled = true; btn.textContent = tr('course.writeChecking');
        out.textContent = ''; out.className = 'write-result is-busy';
        api.check({ lang: lang, ui: l, topic: about.topic, task: about.task, text: value }).then(function (res) {
          out.className = 'write-result verdict-' + res.verdict;
          out.appendChild(h('p', { className: 'write-verdict', text: tr('course.verdict.' + res.verdict) }));
          if (res.verdict !== 'good' && res.corrected && norm(res.corrected) !== norm(value)) out.appendChild(h('p', { className: 'write-corrected', lang: lang }, [h('span', { className: 'write-label', text: tr('course.corrected') }), res.corrected]));
          if (res.notes.length) {
            var ul = h('ul', { className: 'write-notes' });
            res.notes.forEach(function (n) { ul.appendChild(h('li', {}, [h('s', { lang: lang, text: n.wrong }), ' → ', h('strong', { lang: lang, text: n.right }), n.why ? h('span', { className: 'write-why', text: n.why }) : null])); });
            out.appendChild(ul);
          }
          if (res.praise) out.appendChild(h('p', { className: 'write-praise', text: res.praise }));
          api.sound(res.verdict !== 'wrong');
          btn.textContent = tr('course.writeAgain'); btn.disabled = false;
          onChecked(res);
          if (onResult) onResult(res);
        }, function (e) {
          out.className = 'write-result is-off';
          out.appendChild(h('p', { text: tr(e && e.code === 'no-key' ? 'course.writeNoAI' : 'course.writeFail') }));
          btn.textContent = tr('course.writeCheck'); btn.disabled = false;
          if (onResult) onResult(null);
        });
      };
      area.onkeydown = function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!btn.disabled) btn.click(); } };
      host.appendChild(area);
      host.appendChild(h('div', { className: 'fix-actions' }, [btn, h('span', { className: 'write-hint', text: tr('course.writeHint') })]));
      host.appendChild(out);
    }
    function stepNext() {
      if ($('btnStepNext').disabled) return;
      if (lesson.i < lesson.steps.length - 1) { lesson.i++; renderStep(); focusTop($('lessonStepLabel')); return; }
      save(lang + '.' + topic.id, { lesson: now() });
      lesson.mode = 'summary';
      startPractice('topic');
    }
    function stepBack() { if (lesson.i > 0) { lesson.i--; renderStep(); focusTop($('lessonStepLabel')); } }

    /* ===== practice: a topic (8), a review (5) or a level checkpoint ===== */
    function startPractice(mode) {
      session = { mode: mode, items: buildSession(topic, null, mode === 'review' ? REVIEW_SIZE : 0), i: 0, results: [], answered: false, combo: 0, bestCombo: 0 };
      $('practiceTitle').textContent = (mode === 'review' ? tr('course.reviewing') + ' · ' : '') + text(topic.title, ui());
      $('btnPracticeQuit').textContent = mode === 'review' ? tr('course.toTopics') : tr('course.quit');
      show('coursePractice');
      renderQuestion();
    }
    function startCheckpoint(level) {
      topic = null;
      var cp = checkpoint(lessons[lang], level);
      var items = [];
      cp.grammar.forEach(function (it) { it.section = 'grammar'; items.push(it); });
      if (api.canSpeak()) cp.listening.forEach(function (it) { it.section = 'listening'; items.push(it); });
      cp.reading.forEach(function (it) { it.section = 'reading'; items.push(it); });
      if (cp.write) items.push({ k: 'write', section: 'writing', task: cp.write });
      session = { mode: 'checkpoint', level: level, cp: cp, items: items, i: 0, results: [], answered: false, combo: 0, bestCombo: 0 };
      $('practiceTitle').textContent = tr('course.cpTitle', { l: level });
      $('btnPracticeQuit').textContent = tr('course.toTopics');
      show('coursePractice');
      renderQuestion();
    }
    function renderCombo() {
      var c = $('practiceCombo'), n = session.combo;
      c.hidden = n < 2;
      c.textContent = tr('course.combo', { n: n });
      if (n >= 2) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    }
    function renderQuestion() {
      var s = session, it = s.items[s.i], box = $('practiceBody'), l = ui();
      s.answered = false; s.pick = null; s.built = [];
      $('practiceCount').textContent = (s.i + 1) + ' / ' + s.items.length;
      var dots = $('practiceDots'); dots.textContent = '';
      s.items.forEach(function (_, i) { dots.appendChild(h('i', { className: i < s.i ? (s.results[i] ? 'ok' : s.results[i] === null ? 'skip' : 'no') : i === s.i ? 'now' : '' })); });
      renderCombo();
      box.textContent = '';
      box.classList.remove('is-ok', 'is-no');
      var card = h('div', { className: 'practice-card', role: 'group', 'aria-labelledby': 'practicePrompt' });
      if (it.section) card.appendChild(h('span', { className: 'cp-section', text: tr('course.sec.' + it.section) }));
      card.appendChild(h('p', { className: 'practice-prompt', id: 'practicePrompt', text: tr('course.q.' + it.k) }));
      var area = h('div', { className: 'practice-area' });
      $('btnPracticeCheck').hidden = true; $('btnPracticeCheck').disabled = true;
      $('btnPracticeNext').hidden = true;
      if (it.k === 'listen') {
        var play = h('button', { className: 'listen-btn', type: 'button', 'aria-label': tr('course.listenPlay'), html: SPEAKER.replace('width="15" height="15"', 'width="30" height="30"') });
        play.onclick = function () { api.speak(it.say, lang, play); };
        card.appendChild(h('div', { className: 'listen-row' }, [play, h('span', { className: 'listen-hint', text: tr('course.listenHint') })]));
        setTimeout(function () { if (session === s && s.items[s.i] === it && !s.answered) play.click(); }, 350);
      }
      if (it.k === 'read' && s.cp && s.cp.text) {
        var txt = s.cp.text;
        card.appendChild(h('article', { className: 'read-text', lang: lang }, [h('h4', { text: txt.title }), h('p', { text: txt.text })]));
        card.appendChild(h('p', { className: 'practice-q small', lang: lang, text: it.q }));
      } else if (it.q && it.k !== 'listen') card.appendChild(gapLine(it.q));
      if (it.k === 'choose' || it.k === 'error' || it.k === 'listen' || it.k === 'read') {
        area.className += ' ' + (it.k === 'choose' ? 'is-pills' : 'is-sentences');
        it.options.forEach(function (o, i) {
          var b = h('button', { className: 'answer-opt', type: 'button', lang: lang, text: o, 'aria-pressed': 'false' });
          b.onclick = function () { if (s.answered) return; s.pick = i; area.querySelectorAll('.answer-opt').forEach(function (x, j) { x.classList.toggle('picked', j === i); x.setAttribute('aria-pressed', String(j === i)); }); check(); };
          area.appendChild(b);
        });
      } else if (it.k === 'order') {
        var built = h('div', { className: 'order-built', 'aria-live': 'polite' });
        var pool = h('div', { className: 'order-pool' });
        var redraw = function () {
          built.textContent = '';
          if (!s.built.length) built.appendChild(h('span', { className: 'order-ph', text: tr('course.orderPh') }));
          s.built.forEach(function (ti, n) {
            var c = h('button', { className: 'tile in', type: 'button', lang: lang, text: it.tiles[ti] });
            c.onclick = function () { if (s.answered) return; s.built.splice(n, 1); redraw(); };
            built.appendChild(c);
          });
          pool.textContent = '';
          it.tiles.forEach(function (w, ti) {
            var used = s.built.indexOf(ti) >= 0;
            var c = h('button', { className: 'tile' + (used ? ' used' : ''), type: 'button', lang: lang, text: w });
            if (used) { c.disabled = true; c.setAttribute('aria-hidden', 'true'); }
            c.onclick = function () { if (s.answered || used) return; s.built.push(ti); redraw(); };
            pool.appendChild(c);
          });
          $('btnPracticeCheck').disabled = s.built.length !== it.tiles.length;
        };
        area.appendChild(built); area.appendChild(pool);
        redraw();
        $('btnPracticeCheck').hidden = false;
      } else if (it.k === 'type') {
        var input = h('input', { className: 'type-input', id: 'practiceInput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: lang, 'aria-labelledby': 'practicePrompt', placeholder: tr('course.typePh') });
        input.oninput = function () { $('btnPracticeCheck').disabled = !input.value.trim(); };
        input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (s.answered) next(); else if (input.value.trim()) check(); } };
        area.appendChild(input);
        $('btnPracticeCheck').hidden = false;
      } else if (it.k === 'write') {
        card.appendChild(h('p', { className: 'step-lead', text: text(it.task, l) }));
        writeBox(area, { topic: 'Level ' + s.level + ' writing', task: text(it.task, 'en') }, function () {}, function (res) {
          if (s.answered) return;
          s.answered = true;
          s.results[s.i] = res ? res.verdict !== 'wrong' : null; // no AI: the writing part is simply not counted
          if (res) api.answer(res.verdict !== 'wrong');
          showNext();
        });
        var skip = h('button', { className: 'link', type: 'button', text: tr('course.skipWrite') });
        skip.onclick = function () { if (s.answered) return; s.answered = true; s.results[s.i] = null; showNext(); };
        area.appendChild(skip);
      }
      card.appendChild(area);
      card.appendChild(h('div', { className: 'practice-feedback', id: 'practiceFeedback', role: 'status', 'aria-live': 'polite' }));
      box.appendChild(card);
      var first = box.querySelector('.type-input, .answer-opt, .tile:not([disabled]), .write-input');
      if (first && it.k !== 'listen') first.focus({ preventScroll: true });
    }
    function gapLine(q) {
      var p = h('p', { className: 'practice-q', lang: lang });
      var parts = q.split('___');
      parts.forEach(function (part, i) {
        p.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) p.appendChild(h('span', { className: 'gap', id: 'practiceGap', text: ' ' }));
      });
      return p;
    }
    function showNext() {
      var s = session, nx = $('btnPracticeNext');
      $('btnPracticeCheck').hidden = true;
      nx.hidden = false;
      nx.textContent = s.i === s.items.length - 1 ? tr('course.finish') : tr('course.next');
      nx.focus({ preventScroll: true });
    }
    function check() {
      var s = session, it = s.items[s.i], ok;
      if (s.answered) return;
      var choice = it.k === 'choose' || it.k === 'error' || it.k === 'listen' || it.k === 'read';
      if (choice) ok = s.pick === it.answer;
      else if (it.k === 'order') ok = checkOrder(it.src, s.built.map(function (ti) { return it.tiles[ti]; }));
      else ok = checkType(it.src, $('practiceInput').value);
      s.answered = true;
      s.results[s.i] = ok;
      s.combo = ok ? s.combo + 1 : 0;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      api.answer(ok);
      var box = $('practiceBody'), fb = $('practiceFeedback'), l = ui();
      box.classList.add(ok ? 'is-ok' : 'is-no');
      var right = choice ? it.options[it.answer] : it.k === 'order' ? it.src.w.join(' ') : it.src.a[0];
      if (choice) box.querySelectorAll('.answer-opt').forEach(function (b, j) { b.disabled = true; if (j === it.answer) b.classList.add('right'); else if (j === s.pick) b.classList.add('wrong'); });
      if (it.k === 'type') $('practiceInput').readOnly = true;
      if (it.k === 'choose' || it.k === 'type') { var gap = $('practiceGap'); if (gap) { gap.textContent = right; gap.classList.add('filled'); } }
      fb.textContent = '';
      var why = it.src && it.src.e ? text(it.src.e, l) : '';
      if (!why && it.topic) { var tt = lessons[lang].topics.find(function (x) { return x.id === it.topic; }); why = tt ? text(tt.tip, l) : ''; }
      if (!why && topic && !ok) why = text(topic.tip, l);
      if (ok) fb.appendChild(h('p', { className: 'fb-ok', text: tr('course.ok' + (1 + (s.i % 3))) }));
      else fb.appendChild(h('p', { className: 'fb-no' }, [h('span', { text: tr('course.no') + ' ' }), h('strong', { lang: lang, text: right })]));
      if (it.k === 'listen' && !ok) fb.appendChild(h('p', { className: 'fb-why' }, [sayBtn(it.say, 'inline-say'), ' ', tr('course.listenAgain')]));
      if (why && it.k !== 'listen' && it.k !== 'read') fb.appendChild(h('p', { className: 'fb-why' + (ok ? ' soft' : ''), text: why }));
      api.sound(ok);
      renderCombo();
      showNext();
    }
    function next() {
      var s = session;
      if (!s.answered) return;
      if (s.i < s.items.length - 1) { s.i++; renderQuestion(); return; }
      finish();
    }
    function finish() {
      var s = session, counted = s.results.filter(function (r) { return r !== null && r !== undefined; });
      var got = score(counted), total = counted.length, t = now();
      var box = $('practiceBody'); box.textContent = ''; box.classList.remove('is-ok', 'is-no');
      $('practiceCount').textContent = '';
      $('practiceCombo').hidden = true;
      $('practiceDots').querySelectorAll('i').forEach(function (d, i) { d.className = s.results[i] ? 'ok' : s.results[i] === null ? 'skip' : 'no'; });
      var ok = passed(got, total), st = stars(got, total), key, before, wasDone = false, extra = null;
      if (s.mode === 'checkpoint') {
        key = lang + '.check-' + s.level.toLowerCase();
        before = rec(key) || {};
        wasDone = !!before.done;
        save(key, { total: total, best: Math.max(before.total === total ? before.best || 0 : 0, got), last: t, seen: before.seen || t, done: before.done || (ok ? t : undefined) });
        extra = h('ul', { className: 'cp-breakdown' });
        ['grammar', 'listening', 'reading', 'writing'].forEach(function (sec) {
          var idx = s.items.map(function (it, i) { return it.section === sec ? i : -1; }).filter(function (i) { return i >= 0; });
          if (!idx.length) return;
          var res = idx.map(function (i) { return s.results[i]; });
          var cnt = res.filter(function (r) { return r !== null && r !== undefined; });
          extra.appendChild(h('li', {}, [h('span', { text: tr('course.sec.' + sec) }), h('strong', { text: cnt.length ? score(cnt) + '/' + cnt.length : '—' })]));
        });
      } else {
        key = lang + '.' + topic.id;
        before = rec(key) || {};
        wasDone = topicState(before) === 'done';
        var patch = { last: t };
        if (s.mode === 'review') Object.assign(patch, scheduleReview(before, got >= total - 1, t));
        else {
          patch.total = total; patch.best = Math.max(before.total === total ? before.best || 0 : 0, got);
          if (!before.seen) patch.seen = t;
          if (ok && !before.done) { patch.done = t; Object.assign(patch, scheduleReview({ rev: -1 }, true, t)); }
        }
        save(key, patch);
      }
      if (ok) api.complete();
      var ratio = total ? got / total : 0, msg = s.mode === 'review' ? (got >= total - 1 ? 'reviewOk' : 'reviewLow') : ratio === 1 ? 'perfect' : ok ? 'great' : ratio >= 0.5 ? 'ok' : 'low';
      var big = h('div', { className: 'result-score' }, [ring(got, total), h('span', { className: 'result-num', text: tr('course.of', { s: got, t: total }) })]);
      var res = h('div', { className: 'practice-result', tabindex: '-1', id: 'practiceResult' }, [
        big,
        s.mode !== 'review' ? starRow(st, true) : null,
        h('h3', { className: 'result-h', text: tr('course.res.' + msg) }),
        s.bestCombo >= 3 ? h('p', { className: 'result-sub', text: tr('course.bestCombo', { n: s.bestCombo }) }) : null,
        s.mode === 'topic' && ok && !wasDone ? h('p', { className: 'result-sub', text: tr('course.res.doneNew') }) : null,
        s.mode === 'checkpoint' && ok && !wasDone ? h('p', { className: 'result-sub', text: tr('course.cpDoneNew', { l: s.level }) }) : null,
        extra
      ]);
      var actions = h('div', { className: 'actions result-actions' });
      if (s.mode === 'topic') {
        var topics = lessons[lang].topics, idx = topics.indexOf(topic), nextT = topics[idx + 1];
        if (nextT && ok) { var nb = h('button', { className: 'btn primary', type: 'button', text: tr('course.nextTopic') }); nb.onclick = function () { openTopic(nextT.id); }; actions.appendChild(nb); }
        if (!ok) { var rl = h('button', { className: 'btn primary', type: 'button', text: tr('course.reread') }); rl.onclick = function () { openTopic(topic.id, 'summary'); }; actions.appendChild(rl); }
      }
      var againMode = s.mode;
      var again = h('button', { className: 'btn' + (actions.children.length ? ' ghost' : ' primary'), type: 'button', text: tr('course.again') });
      again.onclick = function () { if (againMode === 'checkpoint') startCheckpoint(s.level); else startPractice(againMode); };
      actions.appendChild(again);
      var back = h('button', { className: 'link', type: 'button', text: tr('course.toTopics') });
      back.onclick = home;
      actions.appendChild(back);
      res.appendChild(actions);
      box.appendChild(res);
      $('btnPracticeCheck').hidden = true; $('btnPracticeNext').hidden = true;
      if (st === 3 && s.mode !== 'review' && api.celebrate) api.celebrate();
      res.focus({ preventScroll: true });
    }
    function home() {
      session = null; topic = null; lesson = null;
      show('courseHome');
      renderLangs(); renderPath();
      focusTop($('courseHomeTitle'));
    }

    $('btnCourseBack').onclick = home;
    $('btnCoursePractice').onclick = function () { startPractice('topic'); };
    $('btnLessonMode').onclick = function () { lesson.mode = lesson.mode === 'steps' ? 'summary' : 'steps'; if (lesson.mode === 'steps') lesson.i = 0; renderLessonMode(); };
    $('btnStepNext').onclick = stepNext;
    $('btnStepBack').onclick = stepBack;
    $('btnPracticeQuit').onclick = function () {
      if (!session || session.mode !== 'topic' || !topic) { home(); return; }
      openTopic(topic.id, 'summary');
    };
    $('btnPracticeCheck').onclick = check;
    $('btnPracticeNext').onclick = next;
    $('courseLangs').addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var plates = Array.prototype.slice.call(this.querySelectorAll('.plate')), i = plates.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = plates[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + plates.length) % plates.length];
      n.focus(); pickLang(n.dataset.code);
    });

    var started = false;
    function open() {
      if (started) { relabel(); return; }
      started = true;
      show('courseHome');
      $('coursePath').setAttribute('aria-busy', 'true');
      loadCatalog().then(function () {
        var saved = null; try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
        var pref = [saved, api.preferredLang()].find(function (c) { return c && langInfo(c) && langInfo(c).ready; }) || 'en';
        pickLang(pref);
      }, function () { started = false; renderError($('coursePath')); });
    }
    // Interface language changed (or the screen was reopened): redraw in place.
    function relabel() {
      if (!started || !catalog) return;
      var v = root.dataset.view;
      if (v === 'courseHome') { renderLangs(); renderPath(); }
      else if (v === 'courseLesson' && topic && lesson) { $('courseLessonTitle').textContent = text(topic.title, ui()); $('courseLessonSum').textContent = text(topic.sum, ui()); renderLessonMode(); }
    }
    return { open: open, relabel: relabel, home: home };
  }

  return { norm: norm, shuffle: shuffle, checkType: checkType, checkOrder: checkOrder, checkFix: checkFix, buildSession: buildSession, score: score,
    passed: passed, stars: stars, topicState: topicState, isDue: isDue, scheduleReview: scheduleReview, langDone: langDone, marked: marked,
    lessonSteps: lessonSteps, checkpoint: checkpoint, validateLessons: validateLessons, PASS: PASS, REVIEW_DAYS: REVIEW_DAYS, REVIEW_SIZE: REVIEW_SIZE, mount: mount };
});
