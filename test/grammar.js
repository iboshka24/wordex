// Grammar Lab: AI contract (request, prompt, strict parser), storage (apply, clean, merge, backup) and the list.
const assert = require('node:assert/strict');
const G = require('../grammar.js');
const AI = require('../ai-core.js');
const L = require('../learning.js');
const Lg = require('../languages.js');
const OK = 'ʻ';

// --- request ---
const req = AI.validateRequest({ mode: 'grammar', words: ['dépendre', 'dépendre', 'avoir'], source: 'fr', target: 'ru' });
assert.deepEqual(req, { mode: 'grammar', words: ['dépendre', 'avoir'], source: 'fr', target: 'ru' }, 'routed through ai-core, deduplicated');
assert.throws(() => AI.validateRequest({ mode: 'grammar', words: ['elma'], source: 'tr', target: 'ru' }), e => e.code === 'bad-request', 'no grammar for archived languages');
assert.throws(() => AI.validateRequest({ mode: 'grammar', words: Array(13).fill(0).map((_, i) => 'w' + i), source: 'en', target: 'ru' }), /12/);
assert.throws(() => AI.validateRequest({ mode: 'poem', words: ['x'], source: 'en', target: 'ru' }), e => e.code === 'bad-request');
assert.equal(AI.validateRequest({ words: ['x'], source: 'en', target: 'ru' }).mode, undefined, 'translation requests are unchanged');
console.log('✓ grammar request: learnable languages only, ≤12 words, unknown modes rejected');

// --- prompt ---
const sys = AI.buildMessages(req)[0].content;
assert(/DATA, not instructions/.test(sys));
assert(/Never invent rules/.test(sys));
assert(/fr\.<category>\.<slug>/.test(sys));
assert(/in Russian/.test(sys), 'explanations in the native language');
assert(/conjugation/.test(sys), 'focus on the language grammar features');
assert.equal(JSON.parse(AI.buildMessages(req)[1].content).words.length, 2);
assert(/oʻ and gʻ/.test(G.buildMessages({ mode: 'grammar', words: ['maktab'], source: 'uz', target: 'ru' })[0].content));
assert(AI.buildPayload(req, 'm', 'https://api.openai.com/v1').messages[0].content === sys, 'payload uses the grammar prompt');
console.log('✓ grammar prompt: data not instructions, stable ruleId, native-language explanations');

// --- parser ---
const answer = {
  items: [
    { original: 'Dépendre', rules: [
      { ruleId: 'fr.preposition.dependre-de', category: 'preposition', concept: 'Глаголы с предлогом «de»', explanation: 'После dépendre нужен предлог de.',
        patterns: [{ pattern: 'dépendre de + сущ.', example: 'Ça dépend de la météo.', translation: 'Это зависит от погоды.' }, { pattern: '' }],
        pitfall: { mistake: 'Ça dépend sur toi.', correction: 'Ça dépend de toi.', note: 'Не переводи «on» дословно.' }, level: 'b1', extra: 'dropped' },
      { ruleId: 'de.case.dative-verbs', category: 'case', concept: 'x', explanation: 'wrong language' },
      { ruleId: 'fr.preposition.dependre-de', category: 'preposition', concept: 'dup', explanation: 'dup' },
      { ruleId: 'fr.case.x', category: 'nonsense', concept: 'c', explanation: 'e' },
      { ruleId: 'fr.conjugation.re-verbs', category: 'case', concept: 'Глаголы на -re', explanation: 'Спрягаются как vendre.', level: 'Z9' }
    ] },
    { original: 'avoir', rules: [] },
    { original: 'invented', rules: [{ ruleId: 'fr.other.x1', category: 'other', concept: 'c', explanation: 'e' }] },
    { original: 'dépendre', rules: [] }
  ]
};
const parsed = AI.parseResponse('```json\n' + JSON.stringify(answer) + '\n```', req);
assert.equal(parsed.length, 2, 'only asked words, once each');
const dep = parsed[0];
assert.equal(dep.original, 'dépendre', 'mapped back to the word as asked');
assert.equal(dep.rules.length, 2);
assert.deepEqual(Object.keys(dep.rules[0]).sort(), ['category', 'concept', 'explanation', 'lang', 'level', 'patterns', 'pitfall', 'ruleId']);
assert.equal(dep.rules[0].level, 'B1');
assert.equal(dep.rules[0].patterns.length, 1, 'empty patterns dropped');
assert.equal(dep.rules[1].ruleId, 'fr.case.re-verbs', 'the id names the real category');
assert.equal(dep.rules[1].level, null, 'unknown level → null');
assert.deepEqual(parsed[1], { original: 'avoir', rules: [] });
assert.throws(() => AI.parseResponse('no json here', req), e => e.code === 'bad-model-response');
const long = G.validateRule({ ruleId: 'en.other.long-one', category: 'other', concept: 'x'.repeat(500), explanation: 'y'.repeat(5000), patterns: Array(9).fill({ pattern: 'p', example: 'e' }) }, 'en', 'ru');
assert(long.concept.length <= 120 && long.explanation.length <= 600 && long.patterns.length === 3, 'lengths clamped');
const same = G.validateRule({ ruleId: 'en.other.same', category: 'other', concept: 'c', explanation: 'e', pitfall: { mistake: 'A b', correction: 'a B' } }, 'en', 'ru');
assert.equal(same.pitfall, undefined, 'a pitfall whose mistake equals the correction is dropped');
const uz = G.validateRule({ ruleId: 'uz.suffix.locative-da', category: 'suffix', concept: "O'rin-payt kelishigi", explanation: 'Суффикс -da отвечает на вопрос «где?».',
  patterns: [{ pattern: 'ot + -da', example: 'Мактабда', translation: 'В школе' }] }, 'uz', 'ru');
assert.equal(uz.patterns[0].example, 'Maktabda', 'Uzbek examples become Latin');
assert.equal(G.validateRule({ ruleId: 'uz.suffix.x1', category: 'suffix', concept: "o'g'il", explanation: 'e' }, 'en', 'uz'), null, 'prefix must match the learning language');
assert.equal(G.validateRule({ ruleId: 'en.suffix.x1', category: 'suffix', concept: "o'g'il", explanation: 'e' }, 'en', 'uz').concept, 'o' + OK + 'g' + OK + 'il', 'Uzbek explanations normalised');
console.log('✓ grammar parser: whitelist, id/prefix checks, clamps, CEFR, Uzbek normalisation, invented words dropped');

// --- storage ---
const lib = { decks: {
  'fr-ru': { source: 'fr', target: 'ru', created: 1, cards: [{ original: 'dépendre', translation: 'зависеть' }, { original: 'avoir', translation: 'иметь' }, { original: 'être', translation: '—' }] },
  'fr-ru:b': { source: 'fr', target: 'ru', name: 'B', created: 2, cards: [{ original: 'compter', translation: 'рассчитывать' }] }
}, history: {}, goal: 10, streak: { count: 0, last: null, freezes: 2 } };
assert.deepEqual(G.pending(lib.decks['fr-ru']).map(c => c.original), ['dépendre', 'avoir'], 'untranslated words are not sent');
assert.equal(G.applyResults(lib, lib.decks['fr-ru'], parsed, 100), 2);
assert.deepEqual(lib.decks['fr-ru'].cards[0].grammarIds, ['fr.preposition.dependre-de', 'fr.case.re-verbs']);
assert.deepEqual(lib.decks['fr-ru'].cards[1].grammarIds, [], 'analysed, no rules');
assert.equal(G.pending(lib.decks['fr-ru']).length, 0, 'a word is never sent twice');
assert.equal(lib.grammar['fr.preposition.dependre-de'].target, 'ru');
// the same rule from another word in another deck is stored once and links both words
const again = AI.parseResponse(JSON.stringify({ items: [{ original: 'compter', rules: [{ ruleId: 'fr.preposition.dependre-de', category: 'preposition', concept: 'Другое название', explanation: 'другое' }] }] }),
  AI.validateRequest({ mode: 'grammar', words: ['compter'], source: 'fr', target: 'ru' }));
assert.equal(G.applyResults(lib, lib.decks['fr-ru:b'], again, 200), 0, 'no duplicate rule');
assert.equal(lib.grammar['fr.preposition.dependre-de'].concept, 'Глаголы с предлогом «de»', 'first definition wins');
const rows = G.aggregate(lib, {});
assert.equal(rows.length, 2);
const prep = rows.find(r => r.rule.ruleId === 'fr.preposition.dependre-de');
assert.deepEqual(prep.words.map(w => w.card.original).sort(), ['compter', 'dépendre'], 'merged by ruleId across decks');
assert.equal(G.aggregate(lib, { deck: 'fr-ru:b' }).length, 1);
assert.equal(G.aggregate(lib, { category: 'case' }).length, 1);
assert.equal(G.aggregate(lib, { level: 'B1' }).length, 1);
assert.equal(G.aggregate(lib, { lang: 'de' }).length, 0);
assert.equal(G.aggregate(lib, { q: 'MÉTÉO' }).length, 1, 'search covers examples, case-insensitive');
assert.equal(G.aggregate(lib, { q: 'compter' }).length, 1, 'and the words');
assert.equal(G.aggregate(lib, { sort: 'category' })[0].rule.category, 'preposition');
// an orphaned rule (its word was deleted) is not listed
const orphanLib = JSON.parse(JSON.stringify(lib)); orphanLib.decks['fr-ru'].cards = []; orphanLib.decks['fr-ru:b'].cards = [];
assert.equal(G.aggregate(orphanLib, {}).length, 0);
// the cap
const capped = { decks: { 'en-ru': { source: 'en', target: 'ru', cards: [{ original: 'a', translation: 'б' }] } }, grammar: {} };
for (let i = 0; i < G.LIMITS.stored; i++) capped.grammar['en.other.r' + i] = { ruleId: 'en.other.r' + i };
assert.equal(G.applyResults(capped, capped.decks['en-ru'], [{ original: 'a', rules: [G.validateRule({ ruleId: 'en.other.new', category: 'other', concept: 'c', explanation: 'e' }, 'en', 'ru')] }]), 0, 'no new rules past the cap');
console.log('✓ grammar storage: stored once, linked from every word, filters, search, sort, cap');

// --- backup, cloud merge, old data ---
const restored = L.restoreBackup(L.backupFile(lib), Lg.KNOWN_CODES, G.cleanStore);
assert.deepEqual(restored.decks['fr-ru'].cards[0].grammarIds, lib.decks['fr-ru'].cards[0].grammarIds);
assert.deepEqual(restored.decks['fr-ru'].cards[1].grammarIds, [], 'the "analysed, nothing found" marker survives');
assert.equal(restored.grammar['fr.preposition.dependre-de'].pitfall.correction, 'Ça dépend de toi.');
assert.equal(restored.grammar['fr.preposition.dependre-de'].added, 100);
const withoutCleaner = L.restoreBackup(L.backupFile(lib), Lg.KNOWN_CODES);
assert.equal(withoutCleaner.grammar, undefined, 'callers that do not know grammar get none');
const dirty = JSON.parse(JSON.stringify(lib));
dirty.grammar['fr.preposition.dependre-de'].concept = '';
dirty.grammar['__proto__'] = { x: 1 };
dirty.grammar['xx.case.bad'] = { category: 'case', concept: 'c', explanation: 'e' };
dirty.decks['fr-ru'].cards[0].grammarIds = ['fr.case.re-verbs', 'not an id', 'fr.case.re-verbs'];
const cleaned = L.restoreBackup(L.backupFile(dirty), Lg.KNOWN_CODES, G.cleanStore);
assert.deepEqual(Object.keys(cleaned.grammar), ['fr.case.re-verbs'], 'invalid rules dropped');
assert.deepEqual(cleaned.decks['fr-ru'].cards[0].grammarIds, ['fr.case.re-verbs'], 'invalid and duplicate ids dropped');
const old = { version: 2, library: { decks: { 'en-ru': { source: 'en', target: 'ru', cards: [{ original: 'apple', translation: 'яблоко' }] } }, history: {}, goal: 10, streak: { count: 0 } } };
const oldRestored = L.restoreBackup(old, Lg.KNOWN_CODES, G.cleanStore);
assert.equal(oldRestored.grammar, undefined, 'a pre-2.21 backup loads with no grammar');
assert.equal('grammarIds' in oldRestored.decks['en-ru'].cards[0], false, 'and its words count as not analysed');
// cloud merge: rules from both devices, ids unioned even when the other copy of the card wins
const deviceA = JSON.parse(JSON.stringify(lib));
const deviceB = { decks: { 'fr-ru': { source: 'fr', target: 'ru', cards: [{ original: 'dépendre', translation: 'зависеть', reps: 9 }] } }, history: {}, streak: {},
  grammar: { 'fr.other.only-b': { ruleId: 'fr.other.only-b', lang: 'fr', category: 'other', concept: 'b', explanation: 'b', patterns: [] } } };
const merged = L.mergeLibrary(deviceA, deviceB);
assert.equal(merged.decks['fr-ru'].cards[0].reps, 9, 'the card with more reviews wins');
assert.deepEqual(merged.decks['fr-ru'].cards[0].grammarIds, ['fr.preposition.dependre-de', 'fr.case.re-verbs'], 'but keeps the grammar links');
assert.deepEqual(Object.keys(merged.grammar).sort(), ['fr.case.re-verbs', 'fr.other.only-b', 'fr.preposition.dependre-de']);
console.log('✓ grammar persistence: backups, cleaning, old files, cloud merge');

// --- find-the-mistake drill ---
const drill = G.pitfallDrill(Object.values(lib.grammar), () => 0.9);
assert.equal(drill.length, 1, 'only rules with a pitfall');
assert.deepEqual(drill[0].options.map(o => o.correct), [false, true]);
assert.deepEqual(G.pitfallDrill(Object.values(lib.grammar), () => 0.1)[0].options.map(o => o.correct), [true, false]);
console.log('✓ pitfall drill: one question per pitfall, order randomised');

// --- built-in Japanese course ---
const JA = require('../grammar-ja.js');
assert.deepEqual(JA.problems, [], 'every built-in rule passes the schema check');
assert.deepEqual(G.builtinLangs(), ['ja']);
const jaIds = G.builtinIds('ja');
assert(jaIds.length >= 30, 'a real course, not a sample: ' + jaIds.length + ' rules');
assert.equal(new Set(jaIds).size, jaIds.length, 'no duplicate rule ids');
for (const id of ['wa-topic', 'ga-subject', 'wo-object', 'ni-time-place', 'de-place-means', 'he-direction', 'to-and-with', 'no-possessive', 'mo-also', 'kara-made', 'ka-question']) {
  assert(jaIds.includes('ja.particle.' + id), 'particle rule ' + id);
}
for (const id of ['ja.register.desu-masu-plain', 'ja.conjugation.verb-groups', 'ja.conjugation.masu-form', 'ja.conjugation.te-form', 'ja.conjugation.ta-form', 'ja.conjugation.nai-form', 'ja.conjugation.dictionary-form',
  'ja.conjugation.i-adjectives', 'ja.conjugation.na-adjectives', 'ja.measure-word.counters-general', 'ja.word-order.sov', 'ja.suffix.tai-form', 'ja.conjugation.te-iru', 'ja.conjugation.te-kudasai', 'ja.other.kara-reason']) {
  assert(jaIds.includes(id), 'rule ' + id);
}
const KANJI = /[一-鿿]/, KANA = /[぀-ヿ]/, CYR = /[Ѐ-ӿ]/;
for (const ui of G.UI_LANGS) {
  const rules = G.builtinRules('ja', ui);
  assert.equal(rules.length, jaIds.length);
  for (const r of rules) {
    assert(G.LEVELS.indexOf(r.level) >= 0 && ['A1', 'A2', 'B1'].includes(r.level), r.ruleId + ' is A1–B1');
    assert(G.ID.test(r.ruleId) && r.ruleId.split('.')[1] === r.category, r.ruleId + ' id matches its category');
    assert(r.builtin && r.lang === 'ja');
    assert(r.patterns.length >= 1 && r.patterns.length <= G.LIMITS.patterns, r.ruleId + ' patterns');
    for (const p of r.patterns) {
      assert(p.example && KANA.test(p.example + p.reading), r.ruleId + ': Japanese example');
      assert(p.reading && !KANJI.test(p.reading), r.ruleId + ': the reading is kana only (' + p.reading + ')');
      assert(p.translation, r.ruleId + ': translated example');
    }
    if (r.pitfall) {
      assert.notEqual(r.pitfall.mistake, r.pitfall.correction, r.ruleId + ': pitfall differs');
      assert(r.pitfall.note, r.ruleId + ': pitfall note');
    }
    const text = JSON.stringify([r.concept, r.explanation, r.patterns.map(p => [p.pattern, p.translation]), r.pitfall && r.pitfall.note]);
    if (ui === 'ru') assert(CYR.test(r.concept + r.explanation), r.ruleId + ': Russian text is Russian');
    else assert(!CYR.test(text), r.ruleId + ' (' + ui + '): no Cyrillic leaks into this language');
    if (ui === 'uz') {
      assert(!/[A-Za-z]['‘’`][A-Za-z]/.test(text), r.ruleId + ': Uzbek uses canonical oʻ / gʻ / ʼ, not plain apostrophes');
      assert(!/[og]'/i.test(text), r.ruleId + ': no oʻ / gʻ written with a plain apostrophe');
    }
  }
}
assert.equal(G.builtinRule('ja.particle.wa-topic', 'uz').concept, 'は yuklamasi: gapning mavzusi');
assert.equal(G.builtinRule('ja.particle.wa-topic', 'xx').concept, 'The particle は: the topic', 'unknown interface languages fall back to English');
assert.equal(G.builtinRule('fr.case.x', 'ru'), null);
console.log('✓ built-in Japanese course: schema, A1–B1 levels, kana readings, ru/en/uz texts, canonical Uzbek');

// shown for the languages the learner studies, or when picked in the filter
const jaLib = { decks: { 'ja-ru': { source: 'ja', target: 'ru', cards: [{ original: '食べる', translation: 'есть', grammarIds: ['ja.conjugation.verb-groups', 'ja.conjugation.te-form'] }, { original: '水', translation: 'вода' }] } }, grammar: {} };
const enOnly = { decks: { 'en-ru': { source: 'en', target: 'ru', cards: [{ original: 'apple', translation: 'яблоко' }] } }, grammar: {} };
assert.equal(G.aggregate(jaLib, { ui: 'ru' }).length, jaIds.length, 'a Japanese learner sees the whole course');
assert.equal(G.aggregate(enOnly, { ui: 'ru' }).length, 0, 'an English learner does not');
assert.equal(G.aggregate(enOnly, { ui: 'ru', lang: 'ja' }).length, jaIds.length, 'but can pick Japanese in the filter');
assert.equal(G.aggregate({ decks: {}, grammar: {} }, { lang: 'fr' }).length, 0);
assert.equal(G.aggregate(jaLib, { ui: 'ru', lang: 'fr' }).length, 0);
const linked = G.aggregate(jaLib, { ui: 'ru', category: 'conjugation', q: 'て-форма' });
assert(linked.length >= 1 && linked.every(r => r.rule.builtin), 'built-in rules are searchable in the interface language');
const te = G.aggregate(jaLib, { ui: 'ru' }).find(r => r.rule.ruleId === 'ja.conjugation.te-form');
assert.equal(te.words.length, 1, 'the learner’s word is linked to the built-in rule');
assert.equal(te.words[0].card.original, '食べる');
const byWord = G.aggregate(jaLib, { ui: 'ru', q: '食べる' }).map(r => r.rule.ruleId);
assert(byWord.includes('ja.conjugation.verb-groups') && byWord.includes('ja.conjugation.te-form'), 'search also reaches the learner’s words');
assert.equal(G.aggregate(jaLib, { ui: 'ru', q: 'вода' }).length, 0, 'a word that no rule mentions matches nothing here');
const order = G.aggregate(jaLib, { ui: 'en', sort: 'category' });
assert(G.CATEGORIES.indexOf(order[0].rule.category) <= G.CATEGORIES.indexOf(order[order.length - 1].rule.category), 'sorted by topic');
const b1 = G.aggregate(jaLib, { ui: 'en', level: 'B1' });
assert(b1.length >= 1 && b1.every(r => r.rule.level === 'B1'), 'level filter');
assert.equal(G.aggregate(jaLib, { ui: 'en', deck: 'ja-ru' }).length, jaIds.length);
// an AI rule with a built-in id is only linked, never stored; the built-in text wins over an old stored copy
const aiLib = { decks: { 'ja-ru': { source: 'ja', target: 'ru', created: 1, cards: [{ original: '行く', translation: 'идти' }] } }, grammar: {}, history: {}, goal: 10, streak: { count: 0, last: null, freezes: 2 } };
const added = G.applyResults(aiLib, aiLib.decks['ja-ru'], [{ original: '行く', rules: [
  G.validateRule({ ruleId: 'ja.conjugation.te-form', category: 'conjugation', concept: 'AI version', explanation: 'AI text' }, 'ja', 'ru'),
  G.validateRule({ ruleId: 'ja.other.new-idea', category: 'other', concept: 'New', explanation: 'new rule' }, 'ja', 'ru')] }]);
assert.equal(added, 1, 'only the genuinely new rule is stored');
assert.deepEqual(Object.keys(aiLib.grammar), ['ja.other.new-idea']);
assert.deepEqual(aiLib.decks['ja-ru'].cards[0].grammarIds, ['ja.conjugation.te-form', 'ja.other.new-idea'], 'both are linked from the word');
aiLib.grammar['ja.conjugation.te-form'] = { ruleId: 'ja.conjugation.te-form', lang: 'ja', category: 'conjugation', concept: 'OLD STORED', explanation: 'old', patterns: [], level: null };
const shown = G.aggregate(aiLib, { ui: 'ru' }).filter(r => r.rule.ruleId === 'ja.conjugation.te-form');
assert.equal(shown.length, 1, 'shown once');
assert.equal(shown[0].rule.concept, 'て-форма', 'with the built-in definition');
assert.equal(shown[0].words.length, 1);
// backups of such a library still load
const aiBackup = L.restoreBackup(L.backupFile(aiLib), Lg.KNOWN_CODES, G.cleanStore);
assert.deepEqual(aiBackup.decks['ja-ru'].cards[0].grammarIds, ['ja.conjugation.te-form', 'ja.other.new-idea']);
// the AI is told which ids already exist, only for languages that have a built-in course
const jaPrompt = G.buildMessages({ mode: 'grammar', words: ['行く'], source: 'ja', target: 'uz' })[0].content;
assert(/Known ruleIds for Japanese/.test(jaPrompt) && jaPrompt.includes('ja.particle.wa-topic'));
assert(!/Known ruleIds/.test(G.buildMessages({ mode: 'grammar', words: ['apple'], source: 'en', target: 'ru' })[0].content));
// the "find the mistake" game works on the built-in rules
const jaDrill = G.pitfallDrill(G.builtinRules('ja', 'uz'), () => 0.9);
assert(jaDrill.length >= 25, 'most built-in rules carry a typical mistake: ' + jaDrill.length);
// registering rules is checked: wrong language, bad ids and incomplete texts are rejected
const probe = { ruleId: 'ja.other.probe', category: 'other', level: 'A1', concept: ['a', 'b', 'c'], explanation: ['a', 'b', 'c'], patterns: [{ pattern: 'x', example: 'あ', reading: 'あ', translation: ['a', 'b', 'c'] }] };
assert.deepEqual(G.checkBuiltin('ja', probe), []);
assert(G.checkBuiltin('de', probe).length, 'id must start with the language');
assert(G.checkBuiltin('ja', Object.assign({}, probe, { category: 'case' })).length, 'id category must match');
assert(G.checkBuiltin('ja', Object.assign({}, probe, { concept: ['a', 'b'] })).length, 'all three languages are required');
assert(G.checkBuiltin('ja', Object.assign({}, probe, { patterns: [{ pattern: 'x', example: 'あ', translation: ['a', 'b', 'c'] }] })).length, 'every example needs a reading');
assert(G.registerBuiltin('tr', [probe]).length, 'archived languages have no courses');
assert(G.registerBuiltin('ja', [JA.RULES[0]]).some(m => /duplicate/.test(m)), 'a rule id can only be registered once');
console.log('✓ built-in rules: shown per language, linked with the learner’s words, never duplicated by the AI, backups intact');
