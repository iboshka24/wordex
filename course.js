/* Grammar course (v2.23): ready-made lessons by language and level, separate from the learner's words.
   course/catalog.json lists the languages and their topics; course/<code>.json holds the lessons of a ready
   language. The pure helpers (checking answers, building a practice set, validating lessons) are tested in
   Node (test/course.js); mount() draws the course inside the grammar screen. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMCourse = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var UI = ['ru', 'en', 'uz'];
  var LEVELS = ['A1', 'A2', 'B1', 'B2'];
  var KINDS = ['choose', 'error', 'order', 'type'];
  var PASS = 0.75; // 6 of 8 counts as "done"

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
  // A typed answer is right when it matches one of the accepted forms (case, apostrophes and end punctuation aside).
  function checkType(ex, value) {
    var v = norm(value);
    return !!v && (ex.a || []).some(function (a) { return norm(a) === v; });
  }
  // Word order: the tokens put together must give the sentence (or one of its accepted alternatives).
  function checkOrder(ex, tokens) {
    var got = norm((tokens || []).join(' '));
    return [ex.w].concat(ex.alt || []).some(function (w) { return norm(w.join(' ')) === got; });
  }
  // A practice set: the topic's exercises in a fresh order, options shuffled, the right one tracked.
  function buildSession(topic, rand) {
    return shuffle(topic.ex, rand).map(function (ex) {
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
    });
  }
  function score(results) { return results.filter(Boolean).length; }
  function passed(best, total) { return total > 0 && best / total >= PASS; }
  function text(obj, lang) { return obj ? obj[lang] || obj.ru || obj.en || '' : ''; }
  // What the topic list shows for one topic: new, opened, done (+ best score).
  function topicState(rec) {
    if (!rec) return 'new';
    if (rec.total && passed(rec.best || 0, rec.total)) return 'done';
    return 'seen';
  }
  // Progress of a language: how many of its topics are done.
  function langDone(code, topics, progress) {
    return (topics || []).filter(function (t) { return topicState(progress[code + '.' + t.id]) === 'done'; }).length;
  }
  // Checks a lesson file; returns a list of problems (empty = fine). Used by the tests to keep the content honest.
  function validateLessons(file) {
    var errs = [], seen = {};
    function need(cond, msg) { if (!cond) errs.push(msg); }
    function langs(o, where) { UI.forEach(function (l) { need(o && typeof o[l] === 'string' && o[l].trim(), where + ': missing ' + l); }); }
    need(file && typeof file.lang === 'string', 'lang');
    (file && file.topics || []).forEach(function (t, n) {
      var w = (t.id || '#' + n);
      need(/^[a-z0-9-]{2,40}$/.test(t.id || ''), w + ': bad id');
      need(!seen[t.id], w + ': duplicate id'); seen[t.id] = true;
      need(LEVELS.indexOf(t.level) >= 0, w + ': bad level');
      langs(t.title, w + ' title'); langs(t.sum, w + ' sum'); langs(t.tip, w + ' tip');
      UI.forEach(function (l) { need(t.explain && Array.isArray(t.explain[l]) && t.explain[l].length >= 2, w + ' explain ' + l); });
      need(Array.isArray(t.formula) && t.formula.length, w + ': formula');
      need(Array.isArray(t.examples) && t.examples.length >= 2, w + ': examples');
      (t.examples || []).forEach(function (e, i) { need(e.s && e.t && e.t.ru && e.t.uz, w + ' example ' + i); });
      need(t.mistake && t.mistake.wrong && t.mistake.right && t.mistake.wrong !== t.mistake.right, w + ': mistake');
      if (t.mistake) langs(t.mistake.note, w + ' mistake note');
      need(Array.isArray(t.ex) && t.ex.length >= 6, w + ': at least 6 exercises');
      (t.ex || []).forEach(function (e, i) {
        var at = w + ' ex ' + i;
        need(KINDS.indexOf(e.k) >= 0, at + ': kind');
        if (e.k === 'choose' || e.k === 'error') {
          need(Array.isArray(e.o) && e.o.length >= 2 && e.a >= 0 && e.a < e.o.length, at + ': options/answer');
          need(e.o && e.o.every(function (o, j) { return e.o.indexOf(o) === j; }), at + ': duplicate options');
          if (e.k === 'choose') need(/___/.test(e.q || ''), at + ': gap');
        }
        if (e.k === 'order') need(Array.isArray(e.w) && e.w.length >= 3, at + ': words');
        if (e.k === 'type') need(/___/.test(e.q || '') && Array.isArray(e.a) && e.a.length, at + ': gap/answers');
      });
    });
    return errs;
  }

  /* ---------- UI ---------- */
  function mount(api) {
    var $ = function (id) { return document.getElementById(id); };
    var root = $('courseView');
    if (!root) return null;
    var tr = api.tr;
    var catalog = null, lessons = {}, lang = null, topic = null, session = null;
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

    /* home: language plates + the path of topics */
    function ring(done, total) {
      var r = 15, c = 2 * Math.PI * r, part = total ? done / total : 0;
      var svg = '<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true"><circle cx="18" cy="18" r="' + r + '" class="ring-bg"/>' +
        '<circle cx="18" cy="18" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * part).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>';
      return h('span', { className: 'plate-ring', html: svg });
    }
    function renderLangs() {
      var box = $('courseLangs'); box.textContent = '';
      catalog.languages.forEach(function (l) {
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
    function renderPath() {
      var box = $('coursePath'), info = langInfo(lang), topics = topicsOf(lang), prog = progress(), l = ui();
      box.removeAttribute('aria-busy');
      box.textContent = '';
      if (!info.ready) box.appendChild(h('p', { className: 'course-soon-note' }, [h('strong', { text: tr('course.soon') + ' · ' }), tr('course.soonText')]));
      else {
        var next = topics.find(function (t) { return topicState(prog[lang + '.' + t.id]) !== 'done'; });
        var done = langDone(lang, topics, prog);
        var head = h('div', { className: 'course-resume' }, [
          h('div', { className: 'course-resume-text' }, [
            h('span', { className: 'eyebrow', text: tr('course.progress', { d: done, n: topics.length }) }),
            h('strong', { text: next ? text(next.title, l) : tr('course.allDone') })
          ])
        ]);
        if (next) {
          var go = h('button', { className: 'btn primary', type: 'button', text: topicState(prog[lang + '.' + next.id]) === 'new' ? tr('course.start') : tr('course.continue') });
          go.onclick = function () { openTopic(next.id); };
          head.appendChild(go);
        }
        var bar = h('span', { className: 'course-resume-bar' }); bar.appendChild(h('i', {}));
        bar.firstChild.style.width = (topics.length ? Math.round(done / topics.length * 100) : 0) + '%';
        head.appendChild(bar);
        box.appendChild(head);
      }
      var n = 0;
      LEVELS.forEach(function (level) {
        var list = topics.filter(function (t) { return t.level === level; });
        if (!list.length) return;
        var chapter = h('section', { className: 'chapter', 'aria-label': level + ' · ' + tr('course.lvl.' + level) }, [
          h('header', { className: 'chapter-head' }, [h('span', { className: 'chapter-level', text: level }), h('span', { className: 'chapter-name', text: tr('course.lvl.' + level) })])
        ]);
        var ol = h('ol', { className: 'stops' });
        list.forEach(function (t) {
          n++;
          var rec = prog[lang + '.' + t.id], st = info.ready ? topicState(rec) : 'soon';
          var node = h('span', { className: 'stop-node', 'aria-hidden': 'true', text: st === 'done' ? '✓' : String(n) });
          var body = h('span', { className: 'stop-body' }, [
            h('span', { className: 'stop-title', text: text(t.title, l) }),
            t.sum ? h('span', { className: 'stop-sum', text: text(t.sum, l) }) : null
          ]);
          var chip = h('span', { className: 'stop-chip ' + st, text: st === 'soon' ? tr('course.soon') : st === 'done' ? tr('course.best', { s: rec.best, t: rec.total }) : st === 'seen' ? (rec.total ? tr('course.best', { s: rec.best || 0, t: rec.total }) : tr('course.st.seen')) : tr('course.minutes', { n: 5 }) });
          var row = h(info.ready ? 'button' : 'div', { className: 'stop ' + st }, [node, body, chip]);
          if (info.ready) { row.type = 'button'; row.onclick = function () { openTopic(t.id); }; }
          ol.appendChild(h('li', {}, [row]));
        });
        chapter.appendChild(ol);
        box.appendChild(chapter);
      });
    }

    /* lesson page */
    function openTopic(id) {
      topic = lessons[lang].topics.find(function (t) { return t.id === id; });
      if (!topic) return;
      var key = lang + '.' + id, rec = progress()[key];
      if (!rec) api.saveProgress(key, { seen: Date.now() });
      renderLesson();
      show('courseLesson');
      focusTop($('courseLessonTitle'));
    }
    function renderLesson() {
      var box = $('courseLessonBody'), l = ui(), t = topic;
      box.textContent = '';
      $('courseLessonLevel').textContent = t.level + ' · ' + tr('course.lvl.' + t.level);
      $('courseLessonTitle').textContent = text(t.title, l);
      $('courseLessonSum').textContent = text(t.sum, l);
      var rule = h('section', { className: 'lesson-rule' }, [h('h3', { className: 'lesson-h', text: tr('course.rule') })]);
      var ol = h('ol', { className: 'lesson-points' });
      (t.explain[l] || t.explain.ru).forEach(function (p) { ol.appendChild(h('li', { text: p })); });
      rule.appendChild(ol);
      box.appendChild(rule);
      var formula = h('section', { className: 'lesson-formula' }, [h('h3', { className: 'lesson-h', text: tr('course.formula') })]);
      var cards = h('div', { className: 'formula-cards' });
      t.formula.forEach(function (f, i) { var fc = h('span', { className: 'formula-card', lang: lang, text: f }); fc.style.setProperty('--i', i); cards.appendChild(fc); });
      formula.appendChild(cards);
      box.appendChild(formula);
      var ex = h('section', { className: 'lesson-examples' }, [h('h3', { className: 'lesson-h', text: tr('course.examples') })]);
      t.examples.forEach(function (e) {
        var say = h('button', { className: 'speak-btn lesson-say', type: 'button', 'aria-label': tr('card.speak') + ': ' + e.s, html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>' });
        say.onclick = function () { api.speak(e.s, lang, say); };
        var tl = e.t && e.t[l];
        ex.appendChild(h('div', { className: 'lesson-example' }, [say, h('div', {}, [h('p', { className: 'lesson-ex-s', lang: lang, text: e.s }), tl ? h('p', { className: 'lesson-ex-t', text: tl }) : null])]));
      });
      box.appendChild(ex);
      var m = t.mistake;
      box.appendChild(h('aside', { className: 'lesson-mistake' }, [
        h('h3', { className: 'lesson-h', text: tr('course.mistake') }),
        h('p', { className: 'mistake-wrong', lang: lang }, [h('span', { className: 'mistake-mark', 'aria-label': tr('course.wrong'), text: '✗' }), h('s', { text: m.wrong })]),
        h('p', { className: 'mistake-right', lang: lang }, [h('span', { className: 'mistake-mark', 'aria-label': tr('course.right'), text: '✓' }), h('span', { text: m.right })]),
        h('p', { className: 'mistake-note', text: text(m.note, l) })
      ]));
      $('btnCoursePractice').textContent = tr('course.practice', { n: t.ex.length });
    }

    /* practice */
    function startPractice() {
      session = { items: buildSession(topic), i: 0, results: [], answered: false };
      show('coursePractice');
      renderQuestion();
    }
    function renderQuestion() {
      var s = session, it = s.items[s.i], box = $('practiceBody'), l = ui();
      s.answered = false; s.pick = null; s.built = [];
      $('practiceCount').textContent = (s.i + 1) + ' / ' + s.items.length;
      var dots = $('practiceDots'); dots.textContent = '';
      s.items.forEach(function (_, i) { dots.appendChild(h('i', { className: i < s.i ? (s.results[i] ? 'ok' : 'no') : i === s.i ? 'now' : '' })); });
      box.textContent = '';
      box.classList.remove('is-ok', 'is-no');
      var card = h('div', { className: 'practice-card', role: 'group', 'aria-labelledby': 'practicePrompt' });
      card.appendChild(h('p', { className: 'practice-prompt', id: 'practicePrompt', text: tr('course.q.' + it.k) }));
      if (it.q) card.appendChild(gapLine(it.q, it.k === 'type' ? null : '___'));
      var area = h('div', { className: 'practice-area' });
      if (it.k === 'choose' || it.k === 'error') {
        area.className += ' ' + (it.k === 'error' ? 'is-sentences' : 'is-pills');
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
      } else {
        var input = h('input', { className: 'type-input', id: 'practiceInput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: lang, 'aria-labelledby': 'practicePrompt', placeholder: tr('course.typePh') });
        input.oninput = function () { $('btnPracticeCheck').disabled = !input.value.trim(); };
        input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (s.answered) next(); else if (input.value.trim()) check(); } };
        area.appendChild(input);
      }
      card.appendChild(area);
      card.appendChild(h('div', { className: 'practice-feedback', id: 'practiceFeedback', role: 'status', 'aria-live': 'polite' }));
      box.appendChild(card);
      var needsCheck = it.k === 'order' || it.k === 'type';
      $('btnPracticeCheck').hidden = !needsCheck;
      $('btnPracticeCheck').disabled = true;
      $('btnPracticeNext').hidden = true;
      var first = box.querySelector('.type-input, .answer-opt, .tile:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
    // The sentence with its gap drawn as a soft blank (or filled in after the answer).
    function gapLine(q, mark) {
      var p = h('p', { className: 'practice-q', lang: lang });
      var parts = q.split('___');
      parts.forEach(function (part, i) {
        p.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) p.appendChild(h('span', { className: 'gap', id: 'practiceGap', text: ' ' }));
      });
      return p;
    }
    function check() {
      var s = session, it = s.items[s.i], ok;
      if (s.answered) return;
      if (it.k === 'choose' || it.k === 'error') ok = s.pick === it.answer;
      else if (it.k === 'order') ok = checkOrder(it.src, s.built.map(function (ti) { return it.tiles[ti]; }));
      else ok = checkType(it.src, $('practiceInput').value);
      s.answered = true;
      s.results[s.i] = ok;
      api.answer(ok);
      var box = $('practiceBody'), fb = $('practiceFeedback'), l = ui();
      box.classList.add(ok ? 'is-ok' : 'is-no');
      var right = it.k === 'choose' || it.k === 'error' ? it.options[it.answer] : it.k === 'order' ? it.src.w.join(' ') : it.src.a[0];
      if (it.k === 'choose' || it.k === 'error') {
        box.querySelectorAll('.answer-opt').forEach(function (b, j) { b.disabled = true; if (j === it.answer) b.classList.add('right'); else if (j === s.pick) b.classList.add('wrong'); });
      }
      if (it.k === 'type') $('practiceInput').readOnly = true;
      if (it.k === 'choose' || it.k === 'type') { var gap = $('practiceGap'); if (gap) { gap.textContent = right; gap.classList.add('filled'); } }
      fb.textContent = '';
      if (ok) fb.appendChild(h('p', { className: 'fb-ok', text: tr('course.ok' + (1 + (s.i % 3))) }));
      else {
        fb.appendChild(h('p', { className: 'fb-no' }, [h('span', { text: tr('course.no') + ' ' }), h('strong', { lang: lang, text: right })]));
        fb.appendChild(h('p', { className: 'fb-tip', text: text(topic.tip, l) }));
      }
      api.sound(ok);
      $('btnPracticeCheck').hidden = true;
      var nx = $('btnPracticeNext');
      nx.hidden = false;
      nx.textContent = s.i === s.items.length - 1 ? tr('course.finish') : tr('course.next');
      nx.focus({ preventScroll: true });
    }
    function next() {
      var s = session;
      if (!s.answered) return;
      if (s.i < s.items.length - 1) { s.i++; renderQuestion(); return; }
      finish();
    }
    function finish() {
      var s = session, got = score(s.results), total = s.items.length, key = lang + '.' + topic.id;
      var rec = Object.assign({}, progress()[key] || {});
      var wasDone = topicState(rec) === 'done';
      rec.total = total; rec.best = Math.max(rec.best || 0, got); rec.last = Date.now(); if (!rec.seen) rec.seen = rec.last;
      if (passed(got, total) && !rec.done) rec.done = rec.last;
      api.saveProgress(key, rec);
      if (passed(got, total)) api.complete();
      var box = $('practiceBody'); box.textContent = ''; box.classList.remove('is-ok', 'is-no');
      $('practiceCount').textContent = '';
      $('practiceDots').querySelectorAll('i').forEach(function (d, i) { d.className = s.results[i] ? 'ok' : 'no'; });
      var ratio = got / total, msg = ratio === 1 ? 'perfect' : passed(got, total) ? 'great' : ratio >= 0.5 ? 'ok' : 'low';
      var big = h('div', { className: 'result-score' }, [ring(got, total), h('span', { className: 'result-num', text: tr('course.of', { s: got, t: total }) })]);
      var res = h('div', { className: 'practice-result', tabindex: '-1', id: 'practiceResult' }, [
        big,
        h('h3', { className: 'result-h', text: tr('course.res.' + msg) }),
        passed(got, total) && !wasDone ? h('p', { className: 'result-sub', text: tr('course.res.doneNew') }) : null
      ]);
      var actions = h('div', { className: 'actions result-actions' });
      var topics = lessons[lang].topics, idx = topics.indexOf(topic), nextT = topics[idx + 1];
      if (nextT && passed(got, total)) {
        var nb = h('button', { className: 'btn primary', type: 'button', text: tr('course.nextTopic') });
        nb.onclick = function () { openTopic(nextT.id); };
        actions.appendChild(nb);
      }
      var again = h('button', { className: 'btn' + (nextT && passed(got, total) ? ' ghost' : ' primary'), type: 'button', text: tr('course.again') });
      again.onclick = startPractice;
      actions.appendChild(again);
      var back = h('button', { className: 'link', type: 'button', text: tr('course.toTopics') });
      back.onclick = home;
      actions.appendChild(back);
      res.appendChild(actions);
      box.appendChild(res);
      $('btnPracticeCheck').hidden = true; $('btnPracticeNext').hidden = true;
      res.focus({ preventScroll: true });
    }
    function home() {
      session = null; topic = null;
      show('courseHome');
      renderLangs(); renderPath();
      focusTop($('courseHomeTitle'));
    }

    $('btnCourseBack').onclick = home;
    $('btnCoursePractice').onclick = startPractice;
    $('btnPracticeQuit').onclick = function () { renderLesson(); show('courseLesson'); focusTop($('courseLessonTitle')); };
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
      if (started) { if (root.dataset.view === 'courseHome') { renderLangs(); renderPath(); } else if (root.dataset.view === 'courseLesson') renderLesson(); return; }
      started = true;
      show('courseHome');
      $('coursePath').setAttribute('aria-busy', 'true');
      loadCatalog().then(function () {
        var saved = null; try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
        var pref = [saved, api.preferredLang()].find(function (c) { return c && langInfo(c); }) || 'en';
        pickLang(pref);
      }, function () { started = false; renderError($('coursePath')); });
    }
    // Interface language changed: redraw in place.
    function relabel() { if (!started || !catalog) return; if (root.dataset.view === 'courseHome') { renderLangs(); renderPath(); } else if (root.dataset.view === 'courseLesson') renderLesson(); }
    return { open: open, relabel: relabel, home: home };
  }

  return { norm: norm, shuffle: shuffle, checkType: checkType, checkOrder: checkOrder, buildSession: buildSession, score: score,
    passed: passed, topicState: topicState, langDone: langDone, validateLessons: validateLessons, PASS: PASS, mount: mount };
});
