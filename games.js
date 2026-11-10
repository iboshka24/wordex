/* Mini-games over the user's own words: "word in context" (pick the word that fills the gap),
   "build the word" (letters in order) and "true or false" (60-second sprint).
   The puzzle builders are pure and tested in Node (test/games.js); mount() draws the games screen. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMGames = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function norm(s) { return String(s || '').toLocaleLowerCase().normalize('NFC').replace(/ё/g, 'е').replace(/[’‘ʻʼ`]/g, "'").replace(/\s+/g, ' ').trim(); }
  function shuffle(list, rand) {
    var r = rand || Math.random, a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function usable(c) { return c && typeof c.original === 'string' && c.original.trim() && c.translation && c.translation !== '—'; }
  // "to achieve" is shown and answered as "achieve": the infinitive marker never fits a gap.
  function base(word) { return String(word || '').trim().replace(/^to\s+/i, ''); }
  function isVerb(c) { return /^to\s+/i.test(String(c.original || '').trim()); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Where the word (or a simple inflection of it: achieved, journeys, running) sits in a sentence.
  function findWord(sentence, word) {
    var text = String(sentence || ''), b = base(word);
    if (!b || !text) return null;
    if (/\s/.test(b)) {
      var i = text.toLocaleLowerCase().indexOf(b.toLocaleLowerCase());
      return i < 0 ? null : { start: i, end: i + b.length };
    }
    var stem = b.length > 4 && /e$/i.test(b) ? b.slice(0, -1) : b;
    var re;
    try { re = new RegExp('(^|[^\\p{L}])(' + esc(stem) + '\\p{L}*)', 'iu'); } catch (e) { return null; }
    var m = re.exec(text);
    if (!m || m[2].length > b.length + 4) return null;
    var start = m.index + m[1].length;
    return { start: start, end: start + m[2].length };
  }

  // Up to `n` other words as wrong options: different spelling and meaning, same kind first (verbs with verbs).
  function distractors(card, pool, n, rand) {
    var seen = Object.create(null);
    seen[norm(base(card.original))] = true;
    var others = shuffle(pool, rand).filter(function (o) {
      var k = norm(base(o.original));
      if (seen[k] || norm(o.translation) === norm(card.translation)) return false;
      seen[k] = true; return true;
    });
    var same = others.filter(function (o) { return isVerb(o) === isVerb(card); });
    var rest = others.filter(function (o) { return isVerb(o) !== isVerb(card); });
    return same.concat(rest).slice(0, n);
  }

  // Gap-fill questions from the card's own examples (or extra sentences from `more(card)`).
  function cloze(cards, count, rand, more) {
    var pool = (cards || []).filter(usable);
    if (pool.length < 4) return [];
    var out = [];
    shuffle(pool, rand).forEach(function (c) {
      if (out.length >= (count || 10)) return;
      var sentences = (c.examples || []).concat(more ? more(c) || [] : []);
      for (var i = 0; i < sentences.length; i++) {
        var at = findWord(sentences[i], c.original);
        if (!at) continue;
        var wrong = distractors(c, pool, 3, rand);
        if (wrong.length < 3) return;
        out.push({
          card: c, before: sentences[i].slice(0, at.start), gap: sentences[i].slice(at.start, at.end), after: sentences[i].slice(at.end),
          answer: base(c.original), options: shuffle([base(c.original)].concat(wrong.map(function (o) { return base(o.original); })), rand)
        });
        return;
      }
    });
    return out;
  }

  // Letter tiles: user-perceived characters (Intl.Segmenter when available), with Uzbek oʻ / gʻ kept as one tile
  // whatever apostrophe was typed. sh / ch / ng stay separate letters.
  var SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  function tiles(word) {
    var w = String(word || '');
    var parts = SEGMENTER ? Array.from(SEGMENTER.segment(w), function (x) { return x.segment; }) : Array.from(w);
    var out = [];
    parts.forEach(function (p) {
      var prev = out[out.length - 1];
      if (prev && /^[oOgG]$/.test(prev) && /^['‘’`ʻʼ]$/.test(p)) out[out.length - 1] = prev + p;
      else out.push(p);
    });
    return out;
  }

  // Single words of 3-12 letters, letters shuffled so the word is not already spelled out.
  function scramble(cards, count, rand) {
    var out = [], seen = Object.create(null);
    shuffle((cards || []).filter(usable), rand).forEach(function (c) {
      var w = base(c.original);
      if (out.length >= (count || 8) || seen[norm(w)] || !/^[\p{L}'-]{3,12}$/u.test(w)) return;
      seen[norm(w)] = true;
      var letters = tiles(w), tries = 0, mixed = letters;
      while (tries++ < 12 && mixed.join('') === w) mixed = shuffle(letters, rand);
      if (mixed.join('').toLocaleLowerCase() === w.toLocaleLowerCase() && new Set(letters.map(function (x) { return x.toLocaleLowerCase(); })).size > 1) return;
      out.push({ card: c, word: w, letters: mixed });
    });
    return out;
  }

  // Word + translation pairs; about half of them show another word's translation.
  function trueFalse(cards, count, rand) {
    var r = rand || Math.random, pool = (cards || []).filter(usable);
    if (pool.length < 4) return [];
    var out = [], list = [];
    while (list.length < (count || 40)) list = list.concat(shuffle(pool, r));
    list.slice(0, count || 40).forEach(function (c) {
      var truth = r() < 0.5, shown = c.translation;
      if (!truth) {
        var other = shuffle(pool, r).find(function (o) { return norm(o.translation) !== norm(c.translation); });
        if (other) shown = other.translation; else truth = true;
      }
      out.push({ card: c, shown: shown, truth: truth });
    });
    return out;
  }


  /* ---------------- arcade engine: pure rules shared by Word Heist, Boss Battle and Sentence Factory ---------------- */

  // A stream of `n` quick questions: a gap-fill when the card has a usable sentence, otherwise
  // "which word means …" (translation shown, four originals offered). Cycles through the deck when it is short.
  function questions(cards, n, rand, more) {
    var pool = (cards || []).filter(usable);
    if (pool.length < 4) return [];
    var out = [], order = [];
    while (out.length < (n || 20)) {
      if (!order.length) order = shuffle(pool, rand);
      var c = order.pop(), wrong = distractors(c, pool, 3, rand);
      if (wrong.length < 3) return out;
      var sentences = (c.examples || []).concat(more ? more(c) || [] : []), q = null;
      for (var i = 0; i < sentences.length && !q; i++) {
        var at = findWord(sentences[i], c.original);
        if (at) q = { type: 'context', before: sentences[i].slice(0, at.start), gap: sentences[i].slice(at.start, at.end), after: sentences[i].slice(at.end) };
      }
      if (!q) q = { type: 'meaning', prompt: c.translation };
      q.card = c; q.answer = base(c.original);
      q.options = shuffle([q.answer].concat(wrong.map(function (o) { return base(o.original); })), rand);
      out.push(q);
    }
    return out;
  }

  // Word Heist: a right answer opens one of three chests.
  var CHESTS = [{ type: 'coins', value: 100 }, { type: 'coins', value: 200 }, { type: 'coins', value: 300 }, { type: 'coins', value: 400 }, { type: 'coins', value: 500 }, { type: 'shield' }, { type: 'multiplier', value: 2 }];
  function chests(rand) {
    var r = rand || Math.random;
    return [0, 1, 2].map(function () { return CHESTS[Math.floor(r() * CHESTS.length)]; });
  }
  function heistPenalty(coins) { return Math.floor(Math.max(0, coins) * 0.1); }
  var HEIST = { seconds: 120, target: 5000, lockoutMs: 3000 };

  // Boss Battle: faster answers hit harder; mistakes and expired questions hurt the player.
  var BOSS = { hp: 1500, playerHp: 100, seconds: 60, questionMs: 8000, crit: 300, hit: 100, hurt: 20 };
  function bossHit(ms, correct) {
    if (!correct) return { damage: 0, crit: false, hurt: BOSS.hurt };
    return ms < 2000 ? { damage: BOSS.crit, crit: true, hurt: 0 } : { damage: BOSS.hit, crit: false, hurt: 0 };
  }

  // Sentence Factory: tokens buy permanent upgrades. State lives in localStorage ('vm.factory').
  var FACTORY = {
    multiplier: { max: 5, cost: function (level) { return 150 * Math.pow(2, level); } },
    autohint: { max: 1, cost: function () { return 400; } },
    saver: { max: 3, cost: function () { return 120; } }
  };
  function factoryDefaults() { return { tokens: 0, multiplier: 0, autohint: 0, saver: 0, earned: 0 }; }
  function factoryCost(state, id) { var u = FACTORY[id]; return u && state[id] < u.max ? u.cost(state[id]) : null; }
  // Returns the new state, or null when the upgrade is maxed out or unaffordable. Never mutates.
  function factoryBuy(state, id) {
    var cost = factoryCost(state, id);
    if (cost == null || state.tokens < cost) return null;
    var next = Object.assign({}, state); next.tokens -= cost; next[id] += 1;
    return next;
  }
  function factoryEarn(state, combo) { return Math.round(10 * (1 + 0.5 * (state.multiplier || 0))) + (combo >= 3 ? 5 : 0); }
  var FACTORY_PENALTY = 5, FACTORY_ROUND = 10, HINT_EVERY = 5;

  /* ---------------- screen ---------------- */

  var ROUNDS = { context: 10, scramble: 8, truefalse: 60 }; // truefalse: seconds
  function mount(api) {
    var doc = document, $ = function (id) { return doc.getElementById(id); };
    var game = null, timer = null;
    function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function deckKey() { return api.activeKey ? api.activeKey() : $('gameDeck').value; }
    function deck() { return api.decks()[deckKey()]; }
    function best(kind) { try { return JSON.parse(localStorage.getItem('vm.game-best') || '{}')[kind] || 0; } catch (e) { return 0; } }
    function saveBest(kind, score) {
      try { var b = JSON.parse(localStorage.getItem('vm.game-best') || '{}'); if (score > (b[kind] || 0)) { b[kind] = score; localStorage.setItem('vm.game-best', JSON.stringify(b)); return true; } } catch (e) {}
      return false;
    }

    function fillDecks() {
      var sel = $('gameDeck'), keep = api.activeKey ? api.activeKey() : sel.value, decks = api.decks(), keys = Object.keys(decks);
      sel.innerHTML = '';
      keys.sort(function (a, b) { return decks[b].cards.length - decks[a].cards.length; }).forEach(function (k) {
        var d = decks[k], o = el('option', null, api.deckLabel(d) + ' · ' + api.trn('words.count', d.cards.length));
        o.value = k; sel.appendChild(o);
      });
      if (keys.indexOf(keep) >= 0) sel.value = keep;
      // With a working deck (v2.22) the games need at least 4 of its words; the empty state offers the demo deck.
      var active = api.activeKey ? decks[api.activeKey()] : null;
      var ready = api.activeKey ? !!(active && active.cards.length >= 4) : keys.length > 0;
      $('gamesEmpty').hidden = ready;
      $('gamesHub').hidden = !ready;
      document.querySelectorAll('#gamesHub [data-game]').forEach(function (b) {
        var k = b.dataset.game, rec = b.querySelector('.game-best');
        if (rec) rec.textContent = k === 'factory' ? api.tr('arc.tokensShort', { n: loadFactory().tokens }) : best(k) ? api.tr('game.best', { n: best(k) }) : '';
      });
    }
    function stop() { clearInterval(timer); timer = null; doc.removeEventListener('keydown', onKey); }
    function leave() { stop(); game = null; $('gameStage').className = 'panel game-stage'; $('gameStage').hidden = true; $('gamesHub').hidden = false; $('gamesPick').hidden = false; fillDecks(); }

    function start(kind) {
      if (kind === 'match') { api.openMatch(deckKey()); return; }
      var d = deck();
      if (!d) { api.toast(api.tr('toast.createDeck'), 'err'); return; }
      if (ARCADE[kind]) { startArcade(kind, d); return; }
      var items = kind === 'context' ? cloze(d.cards, ROUNDS.context, null, api.moreSentences(d))
        : kind === 'scramble' ? scramble(d.cards, ROUNDS.scramble) : trueFalse(d.cards, 200);
      if (!items.length) { api.toast(api.tr(kind === 'context' ? 'game.needExamples' : kind === 'scramble' ? 'game.needWords' : 'toast.needMatch'), 'err', 5000); return; }
      stop();
      game = { kind: kind, items: items, i: 0, score: 0, answered: 0, deck: d, ends: kind === 'truefalse' ? Date.now() + ROUNDS.truefalse * 1000 : 0 };
      $('gamesHub').hidden = true; $('gamesPick').hidden = true; $('gameStage').hidden = false;
      $('gameTitle').textContent = api.tr('game.' + kind);
      doc.addEventListener('keydown', onKey);
      if (game.ends) timer = setInterval(tick, 250);
      render();
    }
    function tick() {
      if (!game) return stop();
      var left = Math.max(0, Math.ceil((game.ends - Date.now()) / 1000));
      $('gameProgress').textContent = api.tr('game.timeLeft', { s: left });
      $('gameBar').style.width = (left / ROUNDS.truefalse * 100) + '%';
      if (left <= 0) finish();
    }
    function header() {
      $('gameScore').textContent = api.tr('game.score', { n: game.score });
      if (game.kind === 'truefalse') { tick(); return; }
      $('gameProgress').textContent = api.tr('quiz.progress', { i: game.i + 1, n: game.items.length });
      $('gameBar').style.width = (game.i / game.items.length * 100) + '%';
    }
    function render() {
      header();
      var body = $('gameBody'); body.innerHTML = ''; $('gameFeedback').textContent = ''; $('gameNext').hidden = true;
      var q = game.items[game.i];
      if (game.kind === 'context') renderContext(body, q);
      else if (game.kind === 'scramble') renderScramble(body, q);
      else renderTrueFalse(body, q);
    }
    function next() {
      if (!game) return;
      if (game.arcade) { nextArcade(); return; }
      game.i++;
      if (game.i >= game.items.length) finish(); else render();
    }
    function answered(q, ok, feedback, grade) {
      game.answered++; if (ok) game.score++;
      api.answer(q.card, ok, grade);
      $('gameFeedback').textContent = feedback;
      $('gameFeedback').className = 'game-feedback ' + (ok ? 'ok' : 'bad');
      $('gameScore').textContent = api.tr('game.score', { n: game.score });
    }

    function renderContext(body, q) {
      var card = el('div', 'context-card');
      var p = el('p', 'context-sentence'); p.lang = game.deck.source;
      p.appendChild(doc.createTextNode(q.before));
      var gap = el('span', 'context-gap', '_____'); gap.setAttribute('aria-label', api.tr('game.gap'));
      p.appendChild(gap); p.appendChild(doc.createTextNode(q.after));
      card.appendChild(el('span', 'eyebrow', api.tr('game.contextAsk')));
      card.appendChild(p);
      body.appendChild(card);
      var opts = el('div', 'quiz-options game-options');
      q.options.forEach(function (o, idx) {
        var b = el('button', 'quiz-option', (idx + 1) + '.  ' + o); b.type = 'button'; b.lang = game.deck.source; b.dataset.value = o;
        b.onclick = function () {
          if (game.done) return;
          game.done = true;
          var ok = o === q.answer;
          opts.querySelectorAll('button').forEach(function (x) { x.disabled = true; if (x.dataset.value === q.answer) x.classList.add('correct'); });
          if (!ok) b.classList.add('wrong');
          gap.textContent = q.gap; gap.classList.add(ok ? 'filled-ok' : 'filled-bad');
          answered(q, ok, (ok ? api.tr('quiz.correct') : api.tr('quiz.answerWas')) + q.answer + ' — ' + q.card.translation, true);
          showNext();
        };
        opts.appendChild(b);
      });
      game.done = false;
      body.appendChild(opts);
      var first = opts.querySelector('button'); if (first) first.focus({ preventScroll: true });
    }

    function renderScramble(body, q) {
      game.typed = []; game.done = false;
      body.appendChild(el('p', 'scramble-clue', api.tr('game.scrambleAsk', { t: q.card.translation })));
      var slots = el('div', 'scramble-slots'); slots.id = 'scrambleSlots'; slots.setAttribute('aria-live', 'polite'); slots.lang = game.deck.source;
      var tiles = el('div', 'scramble-tiles');
      q.letters.forEach(function (ch, idx) {
        var b = el('button', 'letter-tile', ch); b.type = 'button'; b.dataset.idx = idx; b.lang = game.deck.source;
        b.onclick = function () { pickLetter(q, idx); };
        tiles.appendChild(b);
      });
      var tools = el('div', 'row-gap');
      var undo = el('button', 'chip-btn', api.tr('game.erase')); undo.type = 'button'; undo.onclick = function () { eraseLetter(q); };
      var skip = el('button', 'chip-btn', api.tr('game.giveUp')); skip.type = 'button'; skip.onclick = function () { revealScramble(q, false); };
      tools.appendChild(undo); tools.appendChild(skip);
      body.appendChild(slots); body.appendChild(tiles); body.appendChild(tools);
      drawSlots(q);
    }
    function drawSlots(q) {
      var slots = $('scrambleSlots'); if (!slots) return;
      slots.innerHTML = '';
      for (var i = 0; i < q.letters.length; i++) slots.appendChild(el('span', 'slot' + (game.typed[i] != null ? ' on' : ''), game.typed[i] != null ? q.letters[game.typed[i]] : ''));
      document.querySelectorAll('.letter-tile').forEach(function (b) { b.disabled = game.done || game.typed.indexOf(Number(b.dataset.idx)) >= 0; });
    }
    function pickLetter(q, idx) {
      if (game.done || game.typed.indexOf(idx) >= 0) return;
      game.typed.push(idx); drawSlots(q);
      if (game.typed.length === q.letters.length) {
        var word = game.typed.map(function (i) { return q.letters[i]; }).join('');
        if (norm(word) === norm(q.word)) revealScramble(q, true);
        else { $('gameFeedback').textContent = api.tr('game.notQuite'); $('gameFeedback').className = 'game-feedback bad'; api.sound(false); }
      }
    }
    function eraseLetter(q) { if (!game.done && game.typed.length) { game.typed.pop(); drawSlots(q); $('gameFeedback').textContent = ''; } }
    function revealScramble(q, ok) {
      if (game.done) return;
      game.done = true;
      game.typed = Array.from(q.word).map(function (ch, i) { return i; });
      q.letters = Array.from(q.word);
      drawSlots(q);
      answered(q, ok, (ok ? api.tr('quiz.correct') : api.tr('quiz.answerWas')) + q.word + ' — ' + q.card.translation, true);
      showNext();
    }

    function renderTrueFalse(body, q) {
      game.done = false;
      var card = el('div', 'tf-card');
      var w = el('strong', 'tf-word', q.card.original); w.lang = game.deck.source;
      var t = el('span', 'tf-trans', q.shown); t.lang = game.deck.target;
      card.appendChild(w); card.appendChild(el('span', 'tf-eq', '=')); card.appendChild(t);
      body.appendChild(card);
      var row = el('div', 'tf-buttons');
      var no = el('button', 'btn danger big', api.tr('game.false')); no.type = 'button'; no.onclick = function () { judge(q, false); };
      var yes = el('button', 'btn success big', api.tr('game.true')); yes.type = 'button'; yes.onclick = function () { judge(q, true); };
      row.appendChild(no); row.appendChild(yes);
      body.appendChild(row);
      body.appendChild(el('p', 'mini', api.tr('game.tfKeys')));
    }
    function judge(q, said) {
      if (!game || game.done) return;
      game.done = true;
      var ok = said === q.truth;
      answered(q, ok, ok ? api.tr('quiz.correct').trim() : api.tr('game.tfWrong', { w: q.card.original, t: q.card.translation }), false);
      api.sound(ok);
      setTimeout(next, ok ? 250 : 900);
    }

    function showNext() {
      $('gameNext').hidden = false;
      $('gameNext').textContent = api.tr(game.i + 1 >= game.items.length ? 'game.finish' : 'btn.next');
      $('gameNext').focus({ preventScroll: true });
    }
    function finish() {
      if (!game) return;
      stop();
      var g = game; g.finished = true;
      var record = saveBest(g.kind, g.score);
      api.complete();
      var body = $('gameBody'); body.innerHTML = '';
      $('gameBar').style.width = '100%';
      $('gameProgress').textContent = api.tr('game.over');
      var res = el('div', 'game-result');
      res.appendChild(el('strong', 'game-result-score', g.kind === 'truefalse' ? String(g.score) : g.score + ' / ' + g.items.length));
      res.appendChild(el('p', null, g.kind === 'truefalse' ? api.tr('game.tfResult', { n: g.score, a: g.answered }) : api.tr('game.result', { n: g.score, t: g.items.length })));
      if (record && g.score) res.appendChild(el('p', 'game-record', api.tr('game.record')));
      var row = el('div', 'row-gap');
      var again = el('button', 'btn primary', api.tr('game.again')); again.type = 'button'; again.onclick = function () { start(g.kind); };
      var back = el('button', 'btn', api.tr('game.back')); back.type = 'button'; back.onclick = leave;
      row.appendChild(again); row.appendChild(back); res.appendChild(row);
      body.appendChild(res);
      $('gameFeedback').textContent = ''; $('gameNext').hidden = true;
      again.focus({ preventScroll: true });
      game = null;
    }

    function onKey(e) {
      if (!game || e.altKey || e.ctrlKey || e.metaKey || e.target.matches('input,textarea,select')) return;
      if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
      if (game.kind === 'truefalse') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); judge(game.items[game.i], false); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); judge(game.items[game.i], true); }
        return;
      }
      if (e.key === 'Enter' && !$('gameNext').hidden && e.target === doc.body) { e.preventDefault(); next(); return; }
      if (game.arcade) {
        var chestRow = $('arcChests');
        if (chestRow && /^[1-3]$/.test(e.key)) { var ch = chestRow.querySelectorAll('button')[Number(e.key) - 1]; if (ch && !ch.disabled) { e.preventDefault(); ch.click(); } return; }
        if (/^[1-4]$/.test(e.key) && !game.done) { var ob = $('gameBody').querySelectorAll('#arcOptions .quiz-option')[Number(e.key) - 1]; if (ob && !ob.disabled) { e.preventDefault(); ob.click(); } }
        if (e.key.toLowerCase() === 'h' && $('arcHint') && !$('arcHint').disabled) { e.preventDefault(); $('arcHint').click(); }
        return;
      }
      var q = game.items[game.i];
      if (game.kind === 'context' && /^[1-4]$/.test(e.key) && !game.done) {
        var b = $('gameBody').querySelectorAll('.quiz-option')[Number(e.key) - 1]; if (b) { e.preventDefault(); b.click(); }
      } else if (game.kind === 'scramble' && !game.done) {
        if (e.key === 'Backspace') { e.preventDefault(); eraseLetter(q); return; }
        if (e.key.length !== 1) return;
        var idx = q.letters.findIndex(function (ch, i) { return game.typed.indexOf(i) < 0 && ch.toLocaleLowerCase() === e.key.toLocaleLowerCase(); });
        if (idx >= 0) { e.preventDefault(); pickLetter(q, idx); }
      }
    }


    /* ---------------- arcade modes ---------------- */
    var ARCADE = { heist: true, boss: true, factory: true };
    function loadFactory() { try { return Object.assign(factoryDefaults(), JSON.parse(localStorage.getItem('vm.factory') || '{}')); } catch (e) { return factoryDefaults(); } }
    function saveFactory(f) { try { localStorage.setItem('vm.factory', JSON.stringify(f)); } catch (e) {} }
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function burst(kind, n) {
      if (reduced) return;
      var stage = $('gameStage');
      for (var i = 0; i < (n || 14); i++) {
        var p = el('span', 'arc-particle ' + (kind || ''));
        p.style.setProperty('--x', ((Math.random() - 0.5) * 360).toFixed(0) + 'px');
        p.style.setProperty('--y', (-80 - Math.random() * 220).toFixed(0) + 'px');
        p.style.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
        p.style.setProperty('--d', (0.6 + Math.random() * 0.5).toFixed(2) + 's');
        stage.appendChild(p);
        p.addEventListener('animationend', function () { this.remove(); });
      }
    }
    function flash(cls) { var s = $('gameStage'); s.classList.remove(cls); void s.offsetWidth; s.classList.add(cls); }
    function fx(kind) { if (api.fx) api.fx(kind); else api.sound(kind === 'bad' || kind === 'hit' || kind === 'lose' ? false : true); }

    // Delayed steps belong to the game that scheduled them; leaving or finishing a round cancels them.
    function later(g, fn, ms) { setTimeout(function () { if (game === g) fn(); }, ms); }
    function startArcade(kind, d) {
      var items = questions(d.cards, kind === 'factory' ? FACTORY_ROUND : 400, null, api.moreSentences(d));
      if (items.length < 4) { api.toast(api.tr('toast.needMatch'), 'err', 5000); return; }
      stop();
      var now = Date.now();
      game = { kind: kind, arcade: true, items: items, i: 0, score: 0, answered: 0, correct: 0, combo: 0, bestCombo: 0, deck: d, done: false,
        ends: kind === 'heist' ? now + HEIST.seconds * 1000 : kind === 'boss' ? now + BOSS.seconds * 1000 : 0, duration: kind === 'heist' ? HEIST.seconds : BOSS.seconds };
      if (kind === 'heist') { game.coins = 0; game.mult = 1; game.shield = 0; game.lockUntil = 0; }
      if (kind === 'boss') { game.bossHp = BOSS.hp; game.playerHp = BOSS.playerHp; }
      if (kind === 'factory') { game.factory = loadFactory(); game.tokens = 0; game.hintIn = HINT_EVERY; game.hintUsed = false; }
      $('gamesHub').hidden = true; $('gamesPick').hidden = true; $('gameStage').hidden = false;
      $('gameStage').classList.add('arcade', 'arc-' + kind);
      $('gameTitle').textContent = api.tr('game.' + kind);
      doc.addEventListener('keydown', onKey);
      if (game.ends) timer = setInterval(arcadeTick, 100);
      renderArcade();
    }
    function arcadeTick() {
      if (!game || !game.arcade) return stop();
      var now = Date.now(), left = Math.max(0, (game.ends - now) / 1000);
      $('gameProgress').textContent = api.tr('game.timeLeft', { s: Math.ceil(left) });
      $('gameBar').style.width = (left / game.duration * 100) + '%';
      if (left <= 3 && Math.ceil(left) !== game.lastTick) { game.lastTick = Math.ceil(left); fx('tick'); }
      if (game.kind === 'heist' && game.lockUntil) {
        var lock = $('arcLock');
        if (now >= game.lockUntil) { game.lockUntil = 0; if (lock) lock.remove(); nextArcade(); }
        else if (lock) lock.querySelector('b').textContent = (Math.ceil((game.lockUntil - now) / 1000)) + '';
      }
      if (game.kind === 'boss' && game.qStart && !game.done) {
        var qLeft = Math.max(0, game.qStart + BOSS.questionMs - now);
        var qb = $('arcQBar'); if (qb) qb.style.width = (qLeft / BOSS.questionMs * 100) + '%';
        if (qLeft <= 0) answerArcade(null); // expired
      }
      if (left <= 0) finishArcade(game.kind === 'boss' ? false : null);
    }
    function hud() {
      var g = game, host = $('arcHud');
      if (!host) { host = el('div', 'arc-hud'); host.id = 'arcHud'; $('gameBody').appendChild(host); }
      host.innerHTML = '';
      if (g.kind === 'heist') {
        host.appendChild(stat('arc-coins', api.tr('arc.coins'), String(g.coins), 'arcCoins'));
        host.appendChild(stat('arc-combo', api.tr('arc.combo'), 'x' + g.combo, 'arcCombo'));
        host.appendChild(stat('arc-goal', api.tr('arc.goal'), String(HEIST.target)));
        var perks = el('div', 'arc-perks');
        if (g.shield) perks.appendChild(el('span', 'arc-perk shield', api.tr('arc.shield')));
        if (g.mult > 1) perks.appendChild(el('span', 'arc-perk mult', 'x' + g.mult + ' ' + api.tr('arc.multiplier')));
        host.appendChild(perks);
      } else if (g.kind === 'boss') {
        host.appendChild(bar('boss', api.tr('arc.boss'), g.bossHp, BOSS.hp));
        host.appendChild(bar('player', api.tr('arc.you'), g.playerHp, BOSS.playerHp));
        host.appendChild(stat('arc-combo', api.tr('arc.combo'), 'x' + g.combo, 'arcCombo'));
      } else {
        host.appendChild(stat('arc-coins', api.tr('arc.tokens'), String(g.factory.tokens + g.tokens), 'arcCoins'));
        host.appendChild(stat('arc-combo', api.tr('arc.combo'), 'x' + g.combo, 'arcCombo'));
        var perks2 = el('div', 'arc-perks');
        if (g.factory.multiplier) perks2.appendChild(el('span', 'arc-perk mult', 'x' + (1 + 0.5 * g.factory.multiplier).toFixed(1) + ' ' + api.tr('arc.tokens')));
        if (g.factory.saver) perks2.appendChild(el('span', 'arc-perk shield', api.tr('arc.saverLeft', { n: g.factory.saver })));
        host.appendChild(perks2);
      }
      $('gameScore').textContent = g.kind === 'boss' ? api.tr('arc.damage', { n: g.score }) : api.tr('game.score', { n: g.kind === 'heist' ? g.coins : g.factory.tokens + g.tokens });
    }
    function stat(cls, label, value, id) {
      var s = el('div', 'arc-stat ' + cls); s.appendChild(el('span', 'arc-stat-label', label));
      var v = el('strong', null, value); if (id) v.id = id; s.appendChild(v); return s;
    }
    function bar(cls, label, value, max) {
      var b = el('div', 'arc-bar ' + cls);
      var top = el('div', 'arc-bar-top'); top.appendChild(el('span', null, label)); top.appendChild(el('span', 'arc-bar-value', value + ' / ' + max)); b.appendChild(top);
      var track = el('div', 'arc-track'); var fill = el('i'); fill.style.width = (Math.max(0, value) / max * 100) + '%'; track.appendChild(fill); b.appendChild(track);
      b.setAttribute('role', 'progressbar'); b.setAttribute('aria-valuenow', String(Math.max(0, value))); b.setAttribute('aria-valuemax', String(max)); b.setAttribute('aria-label', label);
      return b;
    }
    function renderArcade() {
      var body = $('gameBody'); body.innerHTML = ''; $('gameFeedback').textContent = ''; $('gameNext').hidden = true;
      game.done = false; game.hinted = false;
      hud();
      if (game.ends) arcadeTick(); else { $('gameProgress').textContent = api.tr('quiz.progress', { i: game.i + 1, n: game.items.length }); $('gameBar').style.width = (game.i / game.items.length * 100) + '%'; }
      var q = game.items[game.i];
      var card = el('div', 'context-card arc-question');
      if (game.kind === 'boss') { var qt = el('div', 'arc-qtrack'); var qf = el('i'); qf.id = 'arcQBar'; qf.style.width = '100%'; qt.appendChild(qf); card.appendChild(qt); }
      card.appendChild(el('span', 'eyebrow', api.tr(q.type === 'context' ? 'game.contextAsk' : 'arc.meaningAsk')));
      var p = el('p', 'context-sentence');
      if (q.type === 'context') {
        p.lang = game.deck.source; p.appendChild(doc.createTextNode(q.before));
        var gap = el('span', 'context-gap', '_____'); gap.id = 'arcGap'; gap.setAttribute('aria-label', api.tr('game.gap'));
        p.appendChild(gap); p.appendChild(doc.createTextNode(q.after));
      } else { p.lang = game.deck.target; p.textContent = q.prompt; }
      card.appendChild(p); body.appendChild(card);
      var opts = el('div', 'quiz-options game-options'); opts.id = 'arcOptions';
      q.options.forEach(function (o, idx) {
        var b = el('button', 'quiz-option', (idx + 1) + '.  ' + o); b.type = 'button'; b.lang = game.deck.source; b.dataset.value = o;
        b.onclick = function () { answerArcade(o); };
        opts.appendChild(b);
      });
      body.appendChild(opts);
      if (game.kind === 'factory' && game.factory.autohint) {
        var hint = el('button', 'chip-btn arc-hint', api.tr('arc.hint') + (game.hintIn > 0 ? ' · ' + api.tr('arc.hintIn', { n: game.hintIn }) : '')); hint.type = 'button'; hint.id = 'arcHint';
        hint.disabled = game.hintIn > 0;
        hint.onclick = function () {
          if (game.done || game.hintIn > 0 || game.hinted) return;
          game.hinted = true; game.hintIn = HINT_EVERY; hint.disabled = true;
          var removed = 0;
          opts.querySelectorAll('button').forEach(function (x) { if (removed < 2 && x.dataset.value !== q.answer) { x.disabled = true; x.classList.add('eliminated'); removed++; } });
          fx('chest');
        };
        body.appendChild(hint);
      }
      game.qStart = Date.now();
      var first = opts.querySelector('button'); if (first) first.focus({ preventScroll: true });
    }
    function answerArcade(value) {
      var g = game; if (!g || g.done || g.lockUntil) return;
      g.done = true;
      var q = g.items[g.i], ok = value === q.answer, ms = Date.now() - g.qStart;
      g.answered++;
      var opts = $('arcOptions');
      if (opts) opts.querySelectorAll('button').forEach(function (x) { x.disabled = true; if (x.dataset.value === q.answer) x.classList.add('correct'); else if (x.dataset.value === value) x.classList.add('wrong'); });
      var gap = $('arcGap'); if (gap) { gap.textContent = q.gap; gap.classList.add(ok ? 'filled-ok' : 'filled-bad'); }
      api.answer(q.card, ok, true);
      if (ok) { g.correct++; g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo); }
      if (g.kind === 'heist') heistAnswer(ok, q);
      else if (g.kind === 'boss') bossAnswer(ok, ms, q, value === null);
      else factoryAnswer(ok, q);
    }
    function feedback(ok, text) {
      $('gameFeedback').textContent = text;
      $('gameFeedback').className = 'game-feedback ' + (ok ? 'ok' : 'bad');
      var combo = $('arcCombo'); if (combo) { combo.textContent = 'x' + game.combo; combo.classList.toggle('hot', game.combo >= 3); if (ok) { combo.classList.remove('bump'); void combo.offsetWidth; combo.classList.add('bump'); } }
    }
    function nextArcade() {
      if (!game) return;
      game.i++;
      if (game.i >= game.items.length) { finishArcade(game.kind === 'boss' ? false : null); return; }
      renderArcade();
    }
    function heistAnswer(ok, q) {
      var g = game;
      if (!ok) {
        if (g.shield) { g.shield = 0; feedback(false, api.tr('arc.shieldSaved', { w: q.answer })); fx('bad'); hud(); later(g, nextArcade, 900); return; }
        var lost = heistPenalty(g.coins); g.coins -= lost; g.combo = 0;
        feedback(false, api.tr('arc.heistWrong', { w: q.answer, t: q.card.translation, n: lost }));
        fx('bad'); flash('arc-shake');
        g.lockUntil = Date.now() + HEIST.lockoutMs;
        var lock = el('div', 'arc-lock'); lock.id = 'arcLock'; lock.setAttribute('role', 'status');
        lock.appendChild(el('span', null, api.tr('arc.lockout'))); lock.appendChild(el('b', null, '3'));
        $('gameBody').appendChild(lock); hud();
        return;
      }
      fx('ok'); burst('gold', 10);
      feedback(true, api.tr('arc.pickChest'));
      var picked = chests(), row = el('div', 'arc-chests'); row.id = 'arcChests';
      picked.forEach(function (c, i) {
        var b = el('button', 'arc-chest', ''); b.type = 'button'; b.setAttribute('aria-label', api.tr('arc.chestN', { n: i + 1 }));
        b.appendChild(el('span', 'arc-chest-lid')); b.appendChild(el('span', 'arc-chest-body', '?'));
        b.onclick = function () { openChest(row, b, c); };
        row.appendChild(b);
      });
      $('gameBody').appendChild(row);
      var first = row.querySelector('button'); if (first) first.focus({ preventScroll: true });
    }
    function openChest(row, b, c) {
      var g = game; if (!g || g.chestOpen) return;
      g.chestOpen = true;
      row.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
      b.classList.add('open');
      var text;
      if (c.type === 'coins') { var gain = c.value * g.mult; g.coins += gain; text = '+' + gain; if (g.mult > 1) g.mult = 1; burst('gold', 18); fx('chest'); }
      else if (c.type === 'shield') { g.shield = 1; text = api.tr('arc.shield'); fx('chest'); }
      else { g.mult = c.value; text = 'x' + c.value; fx('crit'); }
      b.querySelector('.arc-chest-body').textContent = text;
      b.classList.add(c.type);
      hud();
      $('gameFeedback').textContent = c.type === 'coins' ? api.tr('arc.gotCoins', { n: text }) : c.type === 'shield' ? api.tr('arc.gotShield') : api.tr('arc.gotMult');
      if (g.coins >= HEIST.target) { later(g, function () { finishArcade(true); }, 700); return; }
      later(g, function () { g.chestOpen = false; nextArcade(); }, 900);
    }
    function bossAnswer(ok, ms, q, expired) {
      var g = game, hit = bossHit(ms, ok);
      if (ok) {
        g.bossHp = Math.max(0, g.bossHp - hit.damage); g.score += hit.damage;
        feedback(true, (hit.crit ? api.tr('arc.crit', { n: hit.damage }) : api.tr('arc.hit', { n: hit.damage })) + ' · ' + (ms / 1000).toFixed(1) + ' ' + api.tr('arc.sec'));
        fx(hit.crit ? 'crit' : 'hit'); flash(hit.crit ? 'arc-crit' : 'arc-hitflash'); burst(hit.crit ? 'crit' : 'spark', hit.crit ? 20 : 8);
      } else {
        g.playerHp = Math.max(0, g.playerHp - hit.hurt); g.combo = 0;
        feedback(false, (expired ? api.tr('arc.expired') : api.tr('quiz.answerWas') + q.answer + ' — ' + q.card.translation) + ' · −' + hit.hurt + ' HP');
        fx('bad'); flash('arc-shake');
      }
      hud();
      if (g.bossHp <= 0) { later(g, function () { finishArcade(true); }, 600); return; }
      if (g.playerHp <= 0) { later(g, function () { finishArcade(false); }, 600); return; }
      later(g, nextArcade, ok ? 500 : 1100);
    }
    function factoryAnswer(ok, q) {
      var g = game, f = g.factory;
      if (ok) {
        var earn = factoryEarn(f, g.combo); g.tokens += earn;
        feedback(true, api.tr('arc.earned', { n: earn })); fx('ok'); burst('gold', 8);
      } else if (f.saver > 0) {
        f.saver--; saveFactory(f);
        feedback(false, api.tr('arc.saverUsed', { w: q.answer })); fx('bad');
      } else {
        g.combo = 0; g.tokens -= Math.min(FACTORY_PENALTY, Math.max(0, f.tokens + g.tokens));
        feedback(false, api.tr('quiz.answerWas') + q.answer + ' — ' + q.card.translation + ' · −' + FACTORY_PENALTY); fx('bad'); flash('arc-shake');
      }
      if (g.hintIn > 0) g.hintIn--;
      hud();
      $('gameNext').hidden = false;
      $('gameNext').textContent = api.tr(g.i + 1 >= g.items.length ? 'game.finish' : 'btn.next');
      $('gameNext').focus({ preventScroll: true });
    }
    function finishArcade(won) {
      var g = game; if (!g) return;
      stop();
      var lock = $('arcLock'); if (lock) lock.remove();
      var score = g.kind === 'heist' ? g.coins : g.kind === 'boss' ? g.score : g.tokens;
      var record = saveBest(g.kind, score);
      if (g.kind === 'factory') { g.factory.tokens = Math.max(0, g.factory.tokens + g.tokens); g.factory.earned = (g.factory.earned || 0) + Math.max(0, g.tokens); saveFactory(g.factory); }
      api.complete();
      var body = $('gameBody'); body.innerHTML = '';
      $('gameBar').style.width = '100%'; $('gameProgress').textContent = api.tr(won === true ? 'arc.won' : won === false ? 'arc.lost' : 'game.over');
      var res = el('div', 'game-result arc-result');
      res.appendChild(el('strong', 'game-result-score', g.kind === 'heist' ? g.coins + ' ◈' : g.kind === 'boss' ? String(g.score) : '+' + Math.max(0, g.tokens)));
      res.appendChild(el('p', null, g.kind === 'heist' ? api.tr(won ? 'arc.heistWon' : 'arc.heistEnd', { n: g.coins, c: g.correct, a: g.answered })
        : g.kind === 'boss' ? api.tr(won ? 'arc.bossWon' : 'arc.bossLost', { n: g.score, s: Math.max(0, Math.round((g.ends - Date.now()) / 1000)) })
        : api.tr('arc.factoryEnd', { n: Math.max(0, g.tokens), t: g.factory.tokens })));
      res.appendChild(el('p', 'mini', api.tr('arc.bestCombo', { n: g.bestCombo })));
      if (record && score > 0) res.appendChild(el('p', 'game-record', api.tr('game.record')));
      if (g.kind === 'factory') res.appendChild(store(g.factory));
      var row = el('div', 'row-gap');
      var again = el('button', 'btn primary', api.tr('game.again')); again.type = 'button'; again.onclick = function () { start(g.kind); };
      var back = el('button', 'btn', api.tr('game.back')); back.type = 'button'; back.onclick = leave;
      row.appendChild(again); row.appendChild(back); res.appendChild(row);
      body.appendChild(res);
      $('gameFeedback').textContent = ''; $('gameNext').hidden = true;
      if (won === true) { fx('win'); burst('gold', 30); } else if (won === false) fx('lose');
      again.focus({ preventScroll: true });
      game = null;
    }
    // The upgrade store of the Sentence Factory; `f` is saved on every purchase.
    function store(f) {
      var box = el('div', 'arc-store'); box.id = 'arcStore';
      box.appendChild(el('h3', null, api.tr('arc.store')));
      box.appendChild(el('p', 'mini', api.tr('arc.storeTokens', { n: f.tokens })));
      var list = el('div', 'arc-upgrades');
      Object.keys(FACTORY).forEach(function (id) {
        var cost = factoryCost(f, id), item = el('div', 'arc-upgrade');
        item.appendChild(el('strong', null, api.tr('arc.up.' + id)));
        item.appendChild(el('span', 'mini', api.tr('arc.up.' + id + 'Sub')));
        item.appendChild(el('span', 'arc-level', id === 'multiplier' ? 'x' + (1 + 0.5 * f.multiplier).toFixed(1) : id === 'saver' ? api.tr('arc.saverLeft', { n: f.saver }) : (f.autohint ? api.tr('arc.owned') : '')));
        var buy = el('button', 'btn', cost == null ? api.tr('arc.maxed') : api.tr('arc.buy', { n: cost })); buy.type = 'button'; buy.dataset.upgrade = id;
        buy.disabled = cost == null || f.tokens < cost;
        buy.onclick = function () {
          var next = factoryBuy(f, id); if (!next) return;
          Object.assign(f, next); saveFactory(f); fx('chest'); burst('gold', 10);
          var fresh = store(f); box.replaceWith(fresh); var again = fresh.querySelector('[data-upgrade="' + id + '"]'); if (again) again.focus();
        };
        item.appendChild(buy); list.appendChild(item);
      });
      box.appendChild(list);
      return box;
    }

    $('gamesHub').addEventListener('click', function (e) { var b = e.target.closest('[data-game]'); if (b) start(b.dataset.game); });
    $('gameNext').onclick = next;
    $('gameQuit').onclick = leave;
    return { refresh: function () { if (!game) fillDecks(); }, leave: function () { if (game) leave(); }, active: function () { return Boolean(game); } };
  }

  return { tiles: tiles, findWord: findWord, cloze: cloze, scramble: scramble, trueFalse: trueFalse, base: base, mount: mount,
    questions: questions, chests: chests, CHESTS: CHESTS, heistPenalty: heistPenalty, HEIST: HEIST, BOSS: BOSS, bossHit: bossHit,
    FACTORY: FACTORY, factoryDefaults: factoryDefaults, factoryCost: factoryCost, factoryBuy: factoryBuy, factoryEarn: factoryEarn };
});
