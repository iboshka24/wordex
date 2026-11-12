const assert = require('node:assert/strict');
const L = require('../learning');

assert.equal(L.validate('car', 'cat'), false);
assert.equal(L.validate('', 'water'), false);
assert.equal(L.validate(' WATER ', 'water'), true);
assert.equal(L.validate('remember', 'to remember'), true);
assert.equal(L.validate('бежать', 'бежать, мчаться'), true);
assert.equal(L.validate('remembr', 'remember'), true);
assert.equal(L.validate('eau', 'eaux'), false);
assert.equal(L.gap('2026-03-07', '2026-03-09'), 2);

let s = { count: 5, last: '2026-10-15', freezes: 2, enabled: true };
L.reconcile(s, '2026-10-17');
assert.equal(s.freezes, 1);
L.reconcile(s, '2026-10-17');
assert.equal(s.freezes, 1, 'reload cannot consume a second freeze');
L.reconcile(s, '2026-10-18');
assert.equal(s.freezes, 0, 'one more missed day spends exactly one more freeze');
L.complete(s, '2026-10-18');
assert.equal(s.count, 6);
L.complete(s, '2026-10-18');
assert.equal(s.count, 6, 'streak increments at most once per calendar day');
L.reconcile(s, '2026-10-20');
assert.equal(s.count, 0);
L.complete(s, '2026-10-20');
assert.equal(s.count, 1);
let disabled = { count: 4, last: '2026-10-15', freezes: 2, enabled: false };
L.reconcile(disabled, '2026-10-17');
assert.equal(disabled.count, 0);
assert.equal(disabled.freezes, 2);

const card = { streak: 0, fails: 0 };
L.grade(card, false, 100);
assert.equal(card.fails, 1); assert.equal(card.box, 0);
assert.equal(card.due, 100 + 600000, 'a lapse comes back in 10 minutes');
L.grade(card, true, 100); L.grade(card, true, 100);
assert.equal(card.streak, 2); assert.equal(card.interval, 6);
assert.equal(card.due, 100 + 6 * 86400000);

const words = ['apple','house','book','water','cat'].map((original, i) => ({original, translation: 'translation ' + i}));
words[0].examples = ['She ate an apple at lunch.'];
const qs = L.quiz(words, 5);
assert.equal(qs.length, 5);
for (const q of qs) {
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);
  assert(q.options.includes(q.card.original));
}
assert(qs.find(q => q.card.original === 'apple').sentence.includes('_____'));
assert.equal(L.quiz(words.slice(0,3), 5).length, 0);
console.log('✓ Learning rules: typing, freeze/reload/calendar, SRS, unique lexical distractors');

assert.equal(L.swapPairs('apple - яблоко\nhouse : дом\nserendipity'), 'яблоко - apple\nдом : house\nserendipity');
assert.equal(L.swapPairs('run - бежать, мчаться'), 'бежать, мчаться - run', 'commas inside a translation stay together');
assert.equal(L.swapPairs('cat - кошка, dog - собака'), 'кошка - cat, собака - dog');
assert.equal(L.swapPairs('1. to go - идти'), '1. идти - to go');
assert.equal(L.swapPairs(L.swapPairs('a - b\nc = d')), 'a - b\nc = d', 'swap twice is identity');

const rev = L.reverseCards([{ original: 'cat', translation: 'кошка', box: 4, fails: 3, streak: 5, due: 99 }, { original: 'x', translation: '—' }]);
assert.equal(rev.length, 1, 'untranslated cards are skipped');
assert.equal(rev[0].original, 'кошка'); assert.equal(rev[0].translation, 'cat');
assert.equal(rev[0].box, 0); assert.equal(rev[0].fails, 0);

assert.equal(L.hint('to achieve', 1), 't· a······');
assert.equal(L.hint('кошка', 2), 'ко···');
assert.equal(L.hint('бежать, мчаться', 1), 'б·····', 'hint uses the first variant only');

const pool = [{ original: 'a', translation: '1', fails: 1, due: 0 }, { original: 'b', translation: '2', fails: 3, due: 500 }, { original: 'c', translation: '3', fails: 0, due: 50 }, { original: 'd', translation: '—' }];
assert.deepEqual(L.pick(pool, 'hard', 100).map(c => c.original), ['b', 'a']);
assert.deepEqual(L.pick(pool, 'due', 100).map(c => c.original), ['a', 'c']);
assert.equal(L.pick(pool, 'all').length, 3);

const act = L.activity({ '2026-10-17': { answers: 4, correct: 3 }, '2026-09-30': { answers: 2 } }, 20, '2026-10-17');
assert.equal(act.length, 20);
assert.equal(act[19].date, '2026-10-17'); assert.equal(act[19].answers, 4);
assert.equal(act[2].date, '2026-09-30'); assert.equal(act[2].answers, 2, 'crosses month boundary');
console.log('✓ Swap pairs, reverse deck, hints, hard/due picks, activity calendar');

const deck = [['cat','кошка'],['dog','собака'],['cat','кот'],['house','дом'],['home','дом'],['x','—'],['same','same']].map(([original, translation]) => ({ original, translation }));
const mp = L.pairs(deck, 6, () => 0.5);
const texts = mp.flatMap(c => [c.original, c.translation]);
assert.equal(new Set(texts).size, texts.length, 'matching tiles never repeat a text');
assert(!mp.some(c => c.translation === '—' || c.original === 'same'));
assert.equal(mp.length, 3, 'duplicate words or translations are skipped');
assert.equal(L.pairs(deck, 2).length, 2);
assert.deepEqual(L.pick([{ original: 'a', translation: '1', due: 90 }, { original: 'b', translation: '2', due: 10 }], 'due', 100).map(c => c.original), ['b', 'a'], 'most overdue first');
console.log('✓ Matching pairs are unique; due words come most-overdue first');

// SM-2 schedule: 1 → 6 → interval × ease; hard/easy shift both the interval and the ease.
const DAY = 86400000;
const run = ratings => ratings.reduce((c, r) => L.schedule(c, r, 0), {});
assert.deepEqual([1, 2, 3, 4].map(n => run(Array(n).fill('good')).interval), [1, 6, 15, 38]);
assert.equal(run(['good', 'good', 'good']).ease, 2.5, 'good keeps the ease');
assert.equal(run(['easy']).interval, 4);
assert.equal(run(['easy', 'easy']).interval, 8);
assert.equal(run(['easy', 'easy', 'easy']).interval, 29, '8 × 2.8 × 1.3');
assert.equal(run(['hard']).interval, 1);
assert.equal(run(['hard', 'hard']).interval, 3);
assert.equal(run(['good', 'good', 'hard']).interval, 7, 'hard: 6 × 1.2');
assert.equal(run(Array(10).fill('hard')).ease, 1.3, 'ease never drops below 1.3');
const lapsed = run(['good', 'good', 'good', 'again']);
assert.equal(lapsed.interval, 0); assert.equal(lapsed.reps, 0); assert.equal(lapsed.lapses, 1); assert.equal(lapsed.box, 0);
assert.equal(lapsed.ease, 1.96, 'a lapse (q=1) costs 0.54 ease, as in SM-2');
assert.equal(L.schedule(lapsed, 'good', 0).interval, 1, 'relearning restarts at 1 day');
const order = ['hard', 'good', 'easy'].map(r => run(['good', 'good', r]).interval);
assert(order[0] < order[1] && order[1] < order[2], 'hard < good < easy');
const long = run(Array(30).fill('easy'));
assert.equal(long.interval, 3650, 'intervals are capped at 10 years');
const legacy = L.schedule({ box: 4 }, 'good', 0);
assert.equal(legacy.interval, 18, 'pre-v2.7 box 4 (7 days) continues from 7 × 2.5');
assert.equal(legacy.due, 18 * DAY);
assert.throws(() => L.schedule({}, 'perfect'));
console.log('✓ SM-2 schedule: intervals, ease bounds, lapses, hard/good/easy ordering, legacy boxes');

// --- backup export / restore ---
const CODES = ['ru', 'en', 'uz'];
const lib = {
  decks: { 'en-ru': { source: 'en', target: 'ru', created: 1700000000000, cards: [
    { original: 'apple', translation: 'яблоко', hint: 'h', definition: 'd', examples: ['e1'], streak: 2, fails: 1, box: 2, due: 123, ease: 2.36, interval: 6, reps: 2, lapses: 1 },
    { original: 'pending', translation: '—', hint: '', definition: '', examples: [], streak: 0, fails: 0 }
  ] } },
  history: { '2026-10-17': { answers: 4, correct: 3, celebrated: true }, '2026-10-18': { answers: 1, correct: 1 } },
  goal: 15, batch: 20,
  streak: { count: 3, last: '2026-10-18', freezes: 1, enabled: true, checked: '2026-10-18' }
};
const roundTrip = L.restoreBackup(JSON.parse(JSON.stringify(L.backupFile(lib))), CODES);
assert.deepEqual(JSON.parse(JSON.stringify(roundTrip)), lib, 'export → import is exact, absent SM-2 fields stay absent');

const rejects = (data, code) => assert.throws(() => L.restoreBackup(data, CODES), e => e.code === code, code + ': ' + JSON.stringify(data).slice(0, 60));
for (const data of [null, 42, 'x', {}, { version: 1, library: lib }, { version: 2 }, { version: 2, library: { decks: {}, history: {} } }, { version: 2, library: { decks: null, history: {}, streak: {} } }]) rejects(data, 'not-backup');
const withDeck = d => ({ version: 2, library: { decks: { k: d }, history: {}, streak: {} } });
for (const d of [null, { source: 'xx', target: 'ru', cards: [] }, { source: 'en', target: 'en', cards: [] }, { source: 'en', target: 'ru', cards: 'nope' }, { source: 'en', target: 'ru', cards: Array(5001).fill({ original: 'a', translation: 'b' }) }]) rejects(withDeck(d), 'bad-deck');
for (const c of [null, {}, { original: '', translation: 'x' }, { original: '  ', translation: 'x' }, { original: 'a', translation: 5 }, { original: 'a'.repeat(501), translation: 'x' }, { original: 'a', translation: 'x'.repeat(1001) }]) rejects(withDeck({ source: 'en', target: 'ru', cards: [c] }), 'bad-word');

const dirty = L.restoreBackup({ version: 2, library: {
  decks: { whatever: { source: 'en', target: 'ru', cards: [{ original: 'a', translation: 'b', ease: 9, interval: 99999, box: -3, streak: 'abc', fails: -2, reps: '4', lapses: null, due: 'soon',
    hint: 'h'.repeat(2000), examples: ['one', 2, 'three', 'four'], evil: '<script>', __proto__: { polluted: true } }] } },
  history: { 'not-a-date': { answers: 5 }, '2026-01-01': { answers: '3', correct: 9, celebrated: 0 }, '2026-01-02': null },
  goal: 9999, batch: 25,
  streak: { count: -1, last: 'yesterday', freezes: 7, enabled: false, protectedThrough: '2026-01-02', checked: 'bad' }
} }, CODES);
const card0 = dirty.decks['en-ru'].cards[0];
assert.equal(card0.ease, 5); assert.equal(card0.interval, 3650); assert.equal(card0.box, 0);
assert.equal(card0.streak, 0); assert.equal(card0.fails, 0); assert.equal(card0.reps, 4); assert.equal(card0.lapses, undefined); assert.equal(card0.due, undefined);
assert.equal(card0.hint.length, 1000); assert.deepEqual(card0.examples, ['one', 'three']);
assert.equal('evil' in card0, false, 'unknown fields are dropped');
assert.equal({}.polluted, undefined, 'no prototype pollution');
assert.equal(typeof dirty.decks['en-ru'].created, 'number');
assert.deepEqual(Object.keys(dirty.history), ['2026-01-01', '2026-01-02']);
assert.deepEqual(dirty.history['2026-01-01'], { answers: 3, correct: 3 }, 'correct never exceeds answers; celebrated only when true');
assert.equal(dirty.goal, 200); assert.equal(dirty.batch, 0);
assert.deepEqual(dirty.streak, { count: 0, last: null, freezes: 2, enabled: false, protectedThrough: '2026-01-02' });
const proto = L.restoreBackup(JSON.parse('{"version":2,"library":{"decks":{"__proto__":{"source":"uz","target":"ru","cards":[]}},"history":{},"streak":{}}}'), CODES);
assert.deepEqual(Object.keys(proto.decks), ['uz-ru']); assert.equal({}.source, undefined);
assert.deepEqual(L.librarySize(lib), { decks: 1, words: 2 }); assert.deepEqual(L.librarySize({}), { decks: 0, words: 0 });
console.log('✓ Backups: exact round-trip, every malformed shape rejected with a code, values clamped, unknown fields and prototype keys ignored');

// --- progress statistics ---
const NOW = new Date(2026, 9, 18, 12, 0, 0).getTime();          // 18 Oct 2026, noon local time
const at = (dayOffset, hour = 9) => new Date(2026, 9, 18 + dayOffset, hour).getTime();
const stat = [
  { original: 'new', translation: 'новое' },                                              // never answered
  { original: 'pending', translation: '—' },                                              // ignored: no translation
  { original: 'overdue', translation: 'x', due: at(-3), interval: 1, reps: 1, ease: 2.5 }, // overdue → today
  { original: 'today-late', translation: 'x', due: at(0, 23), interval: 1, reps: 1, ease: 2.36 },
  { original: 'tomorrow-early', translation: 'x', due: at(1, 0), interval: 6, reps: 2, ease: 2.6 },
  { original: 'in-a-week', translation: 'x', due: at(7), interval: 15, reps: 3, ease: 2.5, fails: 2 },
  { original: 'mature', translation: 'x', due: at(40), interval: 38, reps: 4, ease: 2.7 },
  { original: 'legacy', translation: 'x', box: 4, due: at(2), fails: 1 },                  // pre-v2.7: 7-day box
  { original: 'relearn', translation: 'x', box: 0, due: at(0, 8), interval: 0, reps: 0, lapses: 1, ease: 1.96, fails: 1 }
];
const fc7 = L.forecast(stat, 7, NOW);
assert.deepEqual(fc7.days, [3, 1, 1, 0, 0, 0, 0], 'overdue + today, then by calendar day');
assert.equal(fc7.fresh, 1, 'never-answered words are counted separately');
const fc30 = L.forecast(stat, 30, NOW);
assert.equal(fc30.days.length, 30); assert.equal(fc30.days[7], 1, 'the week-out card'); assert.equal(fc30.days.reduce((a, b) => a + b), 6, 'cards beyond the window are left out');
assert.deepEqual(L.forecast([], 7, NOW), { days: [0, 0, 0, 0, 0, 0, 0], fresh: 0 });

const mat = L.maturity(stat);
assert.deepEqual([mat.fresh, mat.learning, mat.mature], [1, 6, 1], 'interval 21+ is mature; legacy box 4 (7 d) is learning');
assert.equal(mat.avgEase, Math.round((2.5 + 2.36 + 2.6 + 2.5 + 2.7 + 2.5 + 1.96) / 7 * 100) / 100, 'legacy cards count with the default ease');
assert.equal(L.maturity([{ original: 'a', translation: 'b' }]).avgEase, null, 'no ease without answers');

assert.deepEqual(L.weakest(stat).map(c => c.original), ['in-a-week', 'relearn', 'legacy'], 'mistakes first, then lower ease; one "hard" (2.36) is not weak yet');
assert.deepEqual(L.weakest([{ original: 'a', translation: 'b', ease: 2.22 }]).length, 1, 'two "hard" answers make a word weak');
assert.equal(L.weakest(stat, 2).length, 2);
assert.deepEqual(L.pick(stat, 'weak').map(c => c.original), L.weakest(stat).map(c => c.original), 'practice mode "weak" uses the same order');

const hist = { '2026-10-18': { answers: 10, correct: 8 }, '2026-10-17': { answers: 5, correct: 5 }, '2026-10-15': { answers: 2, correct: 9 }, '2024-01-01': { answers: 3, correct: 3 } };
const acc30 = L.accuracy(hist, 30, '2026-10-18');
assert.equal(acc30.days.length, 30); assert.equal(acc30.days[29].pct, 80); assert.equal(acc30.days[28].pct, 100);
assert.equal(acc30.days[26].correct, 2, 'correct never exceeds answers'); assert.equal(acc30.days[27].pct, null, 'a day without answers has no accuracy');
assert.deepEqual([acc30.answers, acc30.correct, acc30.active, acc30.pct], [17, 15, 3, 88]);
assert.equal(L.accuracy({}, 30, '2026-10-18').pct, null);

assert.equal(L.longestStreak(hist), 2);
assert.equal(L.longestStreak({ '2026-10-01': { answers: 1 }, '2026-10-02': { answers: 1 }, '2026-10-03': { answers: 0 }, '2026-09-30': { answers: 4 }, bogus: { answers: 9 } }), 3, 'zero-answer days break a run');
assert.equal(L.longestStreak({}), 0);

assert.deepEqual(Object.keys(L.trimHistory(hist, 730, '2026-10-18')).sort(), ['2026-10-15', '2026-10-17', '2026-10-18'], 'days older than two years are dropped');
assert.equal(Object.keys(L.trimHistory(hist, 2, '2026-10-18')).length, 2);
console.log('✓ Progress stats: forecast by calendar day, maturity buckets, weakest words, 30-day accuracy, longest streak, history trimming');
assert.throws(() => L.restoreBackup({ version: 2, library: { decks: { k: { source: '__proto__', target: 'ru', cards: [] } }, history: {}, streak: {} } }, ['ru', 'en']), e => e.code === 'bad-deck', '"__proto__" is not a language');
console.log('✓ Backups: prototype keys are never accepted as languages');

// Named decks: several decks per language pair survive a backup; keys that do not match their pair are repaired.
{
  const lib = { decks: {
    'en-ru': { source: 'en', target: 'ru', cards: [{ original: 'a', translation: 'б' }], created: 1 },
    'en-ru:b2course': { source: 'en', target: 'ru', name: '  English   B2 ', cards: [{ original: 'c', translation: 'д' }], created: 2 },
    'de-ru:x': { source: 'en', target: 'ru', name: 'wrong pair in key', cards: [{ original: 'e', translation: 'ж' }] },
    'en-ru:WEIRD KEY!': { source: 'en', target: 'ru', name: 'x'.repeat(100), cards: [{ original: 'g', translation: 'з' }] }
  }, history: {}, streak: { count: 0 } };
  const r = L.restoreBackup(L.backupFile(lib), ['en', 'ru', 'de']);
  assert.deepEqual(Object.keys(r.decks).sort(), ['en-ru', 'en-ru:b2course'], 'good keys stay; bad keys fall back to the plain pair key');
  assert.equal(r.decks['en-ru:b2course'].name, 'English B2', 'names are trimmed');
  assert.equal(r.decks['en-ru'].name.length, 60, 'the last bad-keyed deck wins the plain key and its name is capped');
  assert.equal(r.decks['en-ru'].cards[0].original, 'g');
  assert.match(L.deckKey('en', 'ru', L.deckId(() => 0.5)), L.DECK_KEY);
  assert.equal(L.deckKey('en', 'ru'), 'en-ru');
  assert.equal(L.keyFor('en-ru:abc', { source: 'en', target: 'ru' }), 'en-ru:abc');
  assert.equal(L.keyFor('en-ru:abc', { source: 'de', target: 'ru' }), 'de-ru');
  assert.equal(L.cleanName('\u0000Deutsch\n A2\t'), 'Deutsch A2');
  const m = L.mergeLibrary({ decks: { 'en-ru:n1': { source: 'en', target: 'ru', cards: [] } }, history: {}, streak: {} },
    { decks: { 'en-ru:n1': { source: 'en', target: 'ru', name: 'Named', cards: [] } }, history: {}, streak: {} });
  assert.equal(m.decks['en-ru:n1'].name, 'Named', 'merging keeps the name whichever side has it');
  console.log('✓ Named decks: multiple decks per language pair, key repair, name clean-up, merge keeps names');
  const many = n => ({ decks: Object.fromEntries(Array.from({ length: n }, (_, i) => ['en-ru:d' + i, { source: 'en', target: 'ru', cards: [] }])) });
  assert.equal(L.MAX_DECKS, 10);
  assert.equal(L.deckCount(many(0)), 0); assert.equal(L.deckCount(null), 0);
  assert.equal(L.canAddDeck(many(9)), true, 'a ninth deck leaves room for one more');
  assert.equal(L.canAddDeck(many(10)), false, 'ten decks are the maximum');
  assert.equal(L.canAddDeck(many(12)), false, 'a library above the limit (old backup) keeps its decks but cannot grow');
  console.log('✓ Deck limit: at most 10 decks, libraries above it are kept as they are');
}

{
  // v2.25: several meanings and the "no AI" mark survive backups; an AI translation wins a merge
  const lib = { decks: { 'de-ru': { source: 'de', target: 'ru', created: 1, cards: [
    { original: 'meinen', translation: 'думать; мой', meanings: [{ translation: 'думать', note: 'глагол' }, { translation: 'мой' }, { translation: 'x' }, { translation: 'y' }], streak: 0, fails: 0 },
    { original: 'Haus', translation: 'дом', noAI: true, meanings: 'bad', streak: 0, fails: 0 }
  ] } }, history: {}, streak: { count: 0, last: null } };
  const back = L.restoreBackup(L.backupFile(lib), ['de', 'ru']);
  const cards = back.decks['de-ru'].cards;
  assert.equal(cards[0].meanings.length, 3, 'at most three meanings');
  assert.deepEqual(cards[0].meanings[0], { translation: 'думать', note: 'глагол' });
  assert.equal(cards[1].noAI, true); assert.equal(cards[1].meanings, undefined);
  const a = { decks: { 'de-ru': { source: 'de', target: 'ru', created: 1, cards: [{ original: 'Haus', translation: 'Haus', noAI: true, streak: 3, fails: 0, due: 5, reps: 3 }] } }, history: {}, streak: {} };
  const b = { decks: { 'de-ru': { source: 'de', target: 'ru', created: 1, cards: [{ original: 'Haus', translation: 'дом', hint: 'h', streak: 0, fails: 0 }] } }, history: {}, streak: {} };
  const merged = L.mergeLibrary(a, b).decks['de-ru'].cards[0];
  assert.equal(merged.translation, 'дом'); assert.equal(merged.noAI, undefined); assert.equal(merged.streak, 3, 'progress stays');
  console.log('✓ Meanings and the no-AI mark: kept in backups, AI translation wins a merge');
}
