/* Pure learning rules, shared by the browser and Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMLearning = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function day(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function gap(a, b) {
    function utc(s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
    return Math.round((utc(b) - utc(a)) / 86400000);
  }
  function reconcile(s, today) {
    if (!s.last || gap(s.last, today) <= 1) return s;
    if (s.checked === today) return s;
    var boundary = s.protectedThrough || s.last;
    var missed = gap(boundary, today) - (s.protectedThrough ? 0 : 1);
    if (missed <= 0) return s;
    if (s.enabled && s.freezes >= missed) {
      s.freezes -= missed;
      s.protectedThrough = today;
    } else { s.count = 0; s.last = null; s.protectedThrough = null; }
    // Advance the reconciliation boundary, not the practice date. Prevent a
    // second reload (or a second missed day) from spending the same freeze.
    s.checked = today;
    return s;
  }
  function complete(s, today) {
    reconcile(s, today);
    if (s.last === today) return false;
    s.count = s.last && (gap(s.last, today) === 1 || s.protectedThrough === today) ? s.count + 1 : 1;
    s.last = today; s.checked = today; s.protectedThrough = null;
    return true;
  }
  function normalize(s) {
    return String(s || '').toLocaleLowerCase().normalize('NFC').replace(/ё/g, 'е').replace(/[’‘ʻʼ`]/g, "'").replace(/\s+/g, ' ').trim();
  }
  function distance(a, b) {
    var row = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
    for (var i = 1; i <= a.length; i++) {
      var prev = row[0]; row[0] = i;
      for (var j = 1; j <= b.length; j++) {
        var old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[b.length];
  }
  function validate(input, expected) {
    var a = normalize(input).replace(/^to /, '');
    if (!a) return false;
    return String(expected || '').split(/\s*[/,;]\s*/).some(function (v) {
      var b = normalize(v).replace(/^to /, '');
      // Short words must match exactly: "cat" must never accept "car".
      return a === b || (b.length >= 6 && distance(a, b) <= 1);
    });
  }
  var DAY = 86400000, RELEARN = 600000, MAX_DAYS = 3650;
  var QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };
  // Days per old Leitner box, so cards saved before v2.7 keep their progress.
  var LEGACY = [0, 0, 1, 3, 7, 21];
  // SM-2 (Wozniak) with Anki-style hard/easy multipliers. Changes only the
  // scheduling fields: ease, interval (days), reps, lapses, due, box.
  function schedule(card, rating, now) {
    var q = QUALITY[rating];
    if (!q) throw new Error('Unknown rating: ' + rating);
    var t = now == null ? Date.now() : now;
    if (card.interval == null && card.box) { card.interval = LEGACY[Math.min(5, card.box)]; card.reps = card.box; }
    var prev = card.interval || 0;
    var ef = Math.max(1.3, (card.ease || 2.5) + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    var days;
    if (q < 3) {
      card.reps = 0; card.lapses = (card.lapses || 0) + 1; days = 0;
    } else {
      card.reps = (card.reps || 0) + 1;
      if (card.reps === 1) days = rating === 'easy' ? 4 : 1;
      else if (card.reps === 2) days = rating === 'hard' ? 3 : rating === 'easy' ? 8 : 6;
      else days = Math.round(prev * (rating === 'hard' ? 1.2 : rating === 'easy' ? ef * 1.3 : ef));
      days = Math.min(MAX_DAYS, Math.max(days, prev + 1)); // a pass always pushes the card further out
    }
    card.ease = Math.round(ef * 100) / 100;
    card.interval = days;
    card.due = t + (days ? days * DAY : RELEARN);
    card.box = !days ? 0 : days < 3 ? 1 : days < 7 ? 2 : days < 21 ? 3 : days < 60 ? 4 : 5;
    return card;
  }
  function grade(card, ok, now) {
    card.streak = ok ? (card.streak || 0) + 1 : 0;
    card.fails = (card.fails || 0) + (ok ? 0 : 1);
    return schedule(card, ok ? 'good' : 'again', now);
  }
  function quiz(cards, count, random) {
    var rand = random || Math.random;
    function shuffle(list) {
      list = list.slice();
      for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
      return list;
    }
    var words = cards.filter(function (c) { return c.translation && c.translation !== '—'; });
    return shuffle(words).map(function (c) {
      var seen = Object.create(null); seen[normalize(c.original)] = true;
      var others = shuffle(words).filter(function (w) {
        var k = normalize(w.original);
        if (seen[k] || normalize(w.translation) === normalize(c.translation)) return false;
        seen[k] = true; return true;
      }).slice(0, 3);
      if (others.length < 3) return null;
      var base = c.original.replace(/^to /i, '');
      var ex = (c.examples || []).find(function (s) { return normalize(s).includes(normalize(base)); });
      var sentence = ex ? ex.replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____') : null;
      return { card: c, sentence: sentence, options: shuffle([c.original].concat(others.map(function (o) { return o.original; }))) };
    }).filter(Boolean).slice(0, count || 5);
  }
  var PAIR = /^([^\s:=].*?)(\s*(?:[:=]|\s+[-—–]\s+|\t+)\s*)(.+)$/;
  var MULTI = /,\s*(?=[^\s,]+(?:\s+[^\s,]+)*\s*(?:[:=]|\s+[-—–]\s+|\t+)\s*)/;
  // Flip "word - перевод" into "перевод - word"; single words stay as they are.
  function swapPairs(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      var m = line.match(/^(\s*(?:[-*•–—]|\d+[.)])*\s*)(.*)$/);
      return m[1] + m[2].split(MULTI).map(function (part) {
        var p = part.match(PAIR);
        return p ? p[3].trim() + p[2] + p[1].trim() : part;
      }).join(', ');
    }).join('\n');
  }
  // A reversed deck is a new skill: progress starts from zero.
  function reverseCards(cards) {
    return (cards || []).filter(function (c) { return c.translation && c.translation !== '—'; }).map(function (c) {
      return { original: c.translation, translation: c.original, hint: c.hint || '', definition: c.definition || '', examples: (c.examples || []).slice(), streak: 0, fails: 0, box: 0, due: 0 };
    });
  }
  // level 1 shows the first letter of every word, each next level one more.
  function hint(answer, level) {
    var n = Math.max(1, level || 1);
    return String(answer || '').split(/\s*[/,;]\s*/)[0].replace(/[\p{L}\p{N}]+/gu, function (w) {
      var chars = Array.from(w);
      return chars.map(function (ch, i) { return i < n ? ch : '·'; }).join('');
    });
  }
  function pick(cards, mode, now) {
    var t = now || Date.now();
    var ready = (cards || []).filter(function (c) { return c.translation && c.translation !== '—'; });
    if (mode === 'hard') return ready.filter(function (c) { return (c.fails || 0) > 0; }).sort(function (a, b) { return (b.fails || 0) - (a.fails || 0); });
    if (mode === 'due') return ready.filter(function (c) { return !c.due || c.due <= t; }).sort(function (a, b) { return (a.due || 0) - (b.due || 0); });
    if (mode === 'weak') return weakest(ready);
    return ready;
  }

  // ---- progress statistics (pure; the progress screen only draws them) ----
  function isTranslated(c) { return c && c.translation && c.translation !== '—'; }
  // A card that was never answered has no schedule at all.
  function isNew(c) { return !(c.reps > 0) && c.interval == null && !c.box && !c.due; }
  function intervalOf(c) { return c.interval != null ? c.interval : LEGACY[Math.min(5, c.box || 0)]; }
  // One word's state for the word vault: pending (no translation yet), new, due, learning or mastered.
  function status(c, now) {
    if (!isTranslated(c)) return 'pending';
    if (isNew(c)) return 'new';
    if (!c.due || c.due <= (now || Date.now())) return 'due';
    return intervalOf(c) >= 21 ? 'mastered' : 'learning';
  }
  // Reviews due per calendar day: index 0 is today and includes everything overdue.
  function forecast(cards, days, now) {
    var t = now == null ? Date.now() : now, today = day(new Date(t)), out = [];
    for (var i = 0; i < days; i++) out.push(0);
    var fresh = 0;
    (cards || []).filter(isTranslated).forEach(function (c) {
      if (isNew(c)) { fresh++; return; }
      var idx = c.due ? Math.max(0, gap(today, day(new Date(c.due)))) : 0;
      if (idx < days) out[idx]++;
    });
    return { days: out, fresh: fresh };
  }
  // new: never answered; learning: interval under 21 days; mature: 21 days or more.
  function maturity(cards) {
    var m = { fresh: 0, learning: 0, mature: 0, avgEase: null }, easeSum = 0, easeN = 0;
    (cards || []).filter(isTranslated).forEach(function (c) {
      if (isNew(c)) { m.fresh++; return; }
      if (intervalOf(c) >= 21) m.mature++; else m.learning++;
      easeSum += c.ease || 2.5; easeN++;
    });
    if (easeN) m.avgEase = Math.round(easeSum / easeN * 100) / 100;
    return m;
  }
  // Words with mistakes or a lowered ease, worst first (more mistakes, then lower ease).
  function weakest(cards, n) {
    var list = (cards || []).filter(function (c) { return isTranslated(c) && ((c.fails || 0) > 0 || (c.ease != null && c.ease < 2.3)); })
      .sort(function (a, b) { return (b.fails || 0) - (a.fails || 0) || (a.ease || 2.5) - (b.ease || 2.5) || a.original.localeCompare(b.original); });
    return n ? list.slice(0, n) : list;
  }
  // Last `days` days of answers with accuracy, plus totals; days without answers have pct null.
  function accuracy(history, days, today) {
    var list = activity(history, days, today).map(function (d) {
      var correct = Math.min(d.correct, d.answers);
      return { date: d.date, answers: d.answers, correct: correct, pct: d.answers ? Math.round(correct / d.answers * 100) : null };
    });
    var answers = 0, correct = 0, active = 0;
    list.forEach(function (d) { answers += d.answers; correct += d.correct; if (d.answers) active++; });
    return { days: list, answers: answers, correct: correct, active: active, pct: answers ? Math.round(correct / answers * 100) : null };
  }
  // Longest run of consecutive days with at least one answer.
  function longestStreak(history) {
    var dates = Object.keys(history || {}).filter(function (k) { return DATE.test(k) && history[k] && history[k].answers > 0; }).sort();
    var best = 0, run = 0;
    for (var i = 0; i < dates.length; i++) {
      run = i && gap(dates[i - 1], dates[i]) === 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }
  // Keeps the daily aggregate compact: days older than keepDays are dropped.
  function trimHistory(history, keepDays, today) {
    var t = today || day(), out = {};
    Object.keys(history || {}).forEach(function (k) { if (DATE.test(k) && gap(k, t) < keepDays) out[k] = history[k]; });
    return out;
  }
  // Up to n cards for the matching game; no two tiles may share a text.
  function pairs(cards, n, random) {
    var rand = random || Math.random, list = (cards || []).filter(function (c) { return c.translation && c.translation !== '—'; }).slice();
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var x = list[i]; list[i] = list[j]; list[j] = x; }
    var seen = Object.create(null), out = [];
    list.forEach(function (c) {
      var a = normalize(c.original), b = normalize(c.translation);
      if (out.length >= n || seen[a] || seen[b] || a === b) return;
      seen[a] = seen[b] = true; out.push(c);
    });
    return out;
  }
  // Last `days` calendar days ending today, oldest first.
  function activity(history, days, today) {
    var p = (today || day()).split('-').map(Number), out = [];
    for (var i = days - 1; i >= 0; i--) {
      var key = day(new Date(p[0], p[1] - 1, p[2] - i));
      var h = (history || {})[key] || {};
      out.push({ date: key, answers: h.answers || 0, correct: h.correct || 0 });
    }
    return out;
  }
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  // Decks live under "source-target" (the one deck a language pair had before named decks)
  // or "source-target:id" for every deck the learner names. Several named decks may share a pair.
  var DECK_KEY = /^([a-z]{2})-([a-z]{2})(?::([a-z0-9]{1,24}))?$/;
  var NAME_MAX = 60;
  function deckId(random) { return (Date.now().toString(36) + Math.floor((random || Math.random)() * 1e9).toString(36)).slice(0, 24); }
  function deckKey(source, target, id) { return source + '-' + target + (id ? ':' + id : ''); }
  function cleanName(name) { return String(name || '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
  // The key a deck is stored under, if it belongs to this deck's language pair; else the pair's plain key.
  // At most this many decks; existing libraries above the limit keep every deck but cannot grow.
  var MAX_DECKS = 10;
  function deckCount(lib) { return lib && lib.decks ? Object.keys(lib.decks).length : 0; }
  function canAddDeck(lib) { return deckCount(lib) < MAX_DECKS; }
  function keyFor(key, d) {
    var m = DECK_KEY.exec(String(key || ''));
    return m && m[1] === d.source && m[2] === d.target ? key : deckKey(d.source, d.target);
  }
  // Two copies of one learner's library (this device and the cloud) become one: every word from
  // both, and for a word known on both sides the copy with more reviews wins. Pure; inputs are not changed.
  function mergeLibrary(a, b) {
    function better(x, y) {
      var rx = x.reps || 0, ry = y.reps || 0;
      if (rx !== ry) return rx > ry ? x : y;
      var tx = isTranslated(x), ty = isTranslated(y);
      if (tx !== ty) return tx ? x : y;
      return (y.due || 0) > (x.due || 0) ? y : x;
    }
    var decks = {}, history = {};
    [a, b].forEach(function (lib) {
      Object.keys(lib.decks || {}).forEach(function (key) {
        var d = lib.decks[key], out = decks[key];
        if (!out) out = decks[key] = { source: d.source, target: d.target, cards: [], created: d.created, index: Object.create(null) };
        if (d.created && (!out.created || d.created < out.created)) out.created = d.created;
        if (d.name && !out.name) out.name = d.name;
        d.cards.forEach(function (c) {
          var k = normalize(c.original), i = out.index[k];
          if (i == null) { out.index[k] = out.cards.length; out.cards.push(Object.assign({}, c)); return; }
          var prev = out.cards[i], win = Object.assign({}, better(prev, c));
          var added = [prev.added, c.added].filter(function (v) { return v > 0; });
          if (added.length) win.added = Math.min.apply(null, added);
          // Grammar found on either device is kept; a reading too.
          if (Array.isArray(prev.grammarIds) || Array.isArray(c.grammarIds)) {
            win.grammarIds = (prev.grammarIds || []).concat(c.grammarIds || []).filter(function (id, n, all) { return all.indexOf(id) === n; }).slice(0, 6);
          }
          if (!win.reading && (prev.reading || c.reading)) win.reading = prev.reading || c.reading;
          out.cards[i] = win;
        });
      });
      Object.keys(lib.history || {}).forEach(function (day) {
        var h = lib.history[day], prev = history[day];
        if (!prev || (h.answers || 0) > (prev.answers || 0)) history[day] = Object.assign({}, h, prev && prev.celebrated ? { celebrated: true } : {});
        else if (h.celebrated) prev.celebrated = true;
      });
    });
    Object.keys(decks).forEach(function (k) { delete decks[k].index; });
    var sa = a.streak || {}, sb = b.streak || {};
    var streak = Object.assign({}, (sb.count || 0) > (sa.count || 0) || ((sb.count || 0) === (sa.count || 0) && String(sb.last || '') > String(sa.last || '')) ? sb : sa);
    var out = { decks: decks, history: history, goal: a.goal || b.goal || 10, streak: streak };
    if (a.batch != null || b.batch != null) out.batch = a.batch != null ? a.batch : b.batch;
    if (a.grammar || b.grammar) {
      var grammar = {};
      [a.grammar || {}, b.grammar || {}].forEach(function (g) { Object.keys(g).forEach(function (id) { if (!Object.prototype.hasOwnProperty.call(grammar, id)) grammar[id] = g[id]; }); });
      out.grammar = grammar;
    }
    if (a.course || b.course) out.course = mergeCourse(a.course, b.course);
    return out;
  }
  /* Grammar course progress (v2.23): library.course["en.present-perfect"] = { seen, best, total, last, done }. */
  var COURSE_KEY = /^[a-z]{2}\.[a-z0-9-]{2,40}$/;
  function cleanCourse(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).slice(0, 2000).forEach(function (k) {
      var r = raw[k];
      if (!COURSE_KEY.test(k) || !r || typeof r !== 'object') return;
      var rec = {};
      ['seen', 'last', 'done', 'lesson', 'due'].forEach(function (f) { var v = Number(r[f]); if (v > 0 && v < 1e14) rec[f] = Math.round(v); });
      var rev = Math.round(Number(r.rev)); if (rev >= 0 && rev <= 20) rec.rev = rev;
      var total = Math.round(Number(r.total)), best = Math.round(Number(r.best));
      if (total > 0 && total <= 100) { rec.total = total; rec.best = Math.max(0, Math.min(total, best || 0)); }
      if (Object.keys(rec).length) out[k] = rec;
    });
    return out;
  }
  // Two devices: the best score wins, the first "seen" and "done" are kept, the latest "last".
  function mergeCourse(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) {
        var r = src[k], o = out[k];
        if (!o) { out[k] = Object.assign({}, r); return; }
        ['seen', 'done', 'lesson'].forEach(function (f) { if (r[f] && (!o[f] || r[f] < o[f])) o[f] = r[f]; });
        if (r.last && (!o.last || r.last > o.last)) o.last = r.last;
        // Spaced reviews: the device that got further along (more reviews, then the later date) wins.
        if (r.rev !== undefined || r.due) {
          var rr = r.rev || 0, or = o.rev || 0;
          if (rr > or || (rr === or && (r.due || 0) > (o.due || 0))) { if (r.rev !== undefined) o.rev = r.rev; if (r.due) o.due = r.due; }
        }
        if (r.total && (r.best || 0) >= (o.best || 0)) { o.best = r.best || 0; o.total = r.total; }
      });
    });
    return out;
  }
  function backupFile(library) { return { version: 2, library: library }; }
  // Validates a parsed backup file and returns a clean library. Nothing from the
  // file is trusted: unknown fields are dropped, numbers are clamped, and fields
  // that are absent stay absent so a backup restores exactly.
  // Throws an Error whose .code is 'not-backup', 'bad-deck' or 'bad-word'.
  // Optional card fields added after v2.20: kept when well-formed, absent otherwise (older files have none).
  var GRAMMAR_ID = /^[a-z]{2}\.[a-z-]{2,20}\.[a-z0-9-]{2,60}$/;
  function withOptional(src, card) {
    if (typeof src.reading === 'string' && src.reading.trim()) card.reading = src.reading.slice(0, 200);
    // grammarIds: [] means "analysed, no rules"; absent means "not analysed yet".
    if (Array.isArray(src.grammarIds)) card.grammarIds = src.grammarIds.filter(function (id, i, all) { return typeof id === 'string' && GRAMMAR_ID.test(id) && all.indexOf(id) === i; }).slice(0, 6);
    return card;
  }
  // cleanGrammar (optional): validates library.grammar (grammar.js cleanStore). Without it, rules are not restored.
  function restoreBackup(data, langCodes, cleanGrammar) {
    function fail(code) { var e = new Error(code); e.code = code; return e; }
    function opt(v, min, max) { return v == null || v === '' || isNaN(Number(v)) ? undefined : Math.max(min, Math.min(max, Number(v))); }
    function count(v) { return Math.max(0, Number(v) || 0); }
    var incoming = data && data.version === 2 && data.library;
    if (!incoming || typeof incoming !== 'object' || !incoming.decks || typeof incoming.decks !== 'object' || !incoming.history || !incoming.streak) throw fail('not-backup');
    var langs = Object.create(null); // a plain {} would accept "__proto__" as a language
    (langCodes || []).forEach(function (c) { langs[c] = true; });
    var decks = {};
    Object.keys(incoming.decks).forEach(function (key) {
      var d = incoming.decks[key];
      if (!d || !langs[d.source] || !langs[d.target] || d.source === d.target || !Array.isArray(d.cards) || d.cards.length > 5000) throw fail('bad-deck');
      var cards = d.cards.map(function (c) {
        if (!c || typeof c.original !== 'string' || typeof c.translation !== 'string' || !c.original.trim() || c.original.length > 500 || c.translation.length > 1000) throw fail('bad-word');
        return withOptional(c, { original: c.original, translation: c.translation, hint: String(c.hint || '').slice(0, 1000), definition: String(c.definition || '').slice(0, 2000),
          examples: Array.isArray(c.examples) ? c.examples.filter(function (x) { return typeof x === 'string'; }).slice(0, 2).map(function (x) { return x.slice(0, 1000); }) : [],
          streak: count(c.streak), fails: count(c.fails), box: opt(c.box, 0, 5), due: opt(c.due, 0, 1e14), ease: opt(c.ease, 1.3, 5),
          interval: opt(c.interval, 0, 3650), reps: opt(c.reps, 0, 1e6), lapses: opt(c.lapses, 0, 1e6), added: opt(c.added, 0, 1e14) });
      });
      var deck = { source: d.source, target: d.target, cards: cards, created: opt(d.created, 0, 1e14) || Date.now() };
      var name = cleanName(d.name);
      if (name) deck.name = name;
      decks[keyFor(key, d)] = deck;
    });
    var history = {};
    Object.keys(incoming.history).filter(function (k) { return DATE.test(k); }).forEach(function (k) {
      var h = incoming.history[k] || {};
      history[k] = { answers: count(h.answers), correct: Math.min(count(h.answers), count(h.correct)) };
      if (h.celebrated) history[k].celebrated = true;
    });
    var s = incoming.streak;
    var streak = { count: count(s.count), last: DATE.test(s.last || '') ? s.last : null, freezes: Math.min(2, count(s.freezes)), enabled: s.enabled !== false };
    ['checked', 'protectedThrough'].forEach(function (k) { if (DATE.test(s[k] || '')) streak[k] = s[k]; });
    var batch = Number(incoming.batch);
    var out = { decks: decks, history: history, goal: Math.max(1, Math.min(200, Number(incoming.goal) || 10)), batch: [10, 20, 30].indexOf(batch) >= 0 ? batch : 0, streak: streak };
    if (typeof cleanGrammar === 'function' && incoming.grammar) {
      var grammar = cleanGrammar(incoming.grammar);
      if (Object.keys(grammar).length) out.grammar = grammar;
    }
    if (incoming.course) { var course = cleanCourse(incoming.course); if (Object.keys(course).length) out.course = course; }
    return out;
  }
  function librarySize(library) {
    var keys = Object.keys((library && library.decks) || {});
    return { decks: keys.length, words: keys.reduce(function (n, k) { return n + library.decks[k].cards.length; }, 0) };
  }
  return { forecast: forecast, maturity: maturity, weakest: weakest, accuracy: accuracy, longestStreak: longestStreak, trimHistory: trimHistory,
    backupFile: backupFile, restoreBackup: restoreBackup, librarySize: librarySize, day: day, gap: gap, reconcile: reconcile, complete: complete, validate: validate, grade: grade, schedule: schedule, quiz: quiz, swapPairs: swapPairs, reverseCards: reverseCards, hint: hint, pick: pick, pairs: pairs, activity: activity, status: status, mergeLibrary: mergeLibrary, DECK_KEY: DECK_KEY, deckId: deckId, deckKey: deckKey, cleanName: cleanName, keyFor: keyFor, NAME_MAX: NAME_MAX, MAX_DECKS: MAX_DECKS, deckCount: deckCount, canAddDeck: canAddDeck, cleanCourse: cleanCourse, mergeCourse: mergeCourse };
});
