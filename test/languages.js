// Language registry, Uzbek text helpers, and backward compatibility of data that uses archived languages.
const assert = require('node:assert/strict');
const Lg = require('../languages.js');
const L = require('../learning.js');
const AI = require('../ai-core.js');
const S = require('../share.js');
const G = require('../games.js');

// --- registry ---
assert.deepEqual(Lg.LEARN_CODES.slice().sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'uz', 'zh']);
assert.deepEqual(Lg.NATIVE_CODES.slice().sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'uz', 'zh']);
assert.equal(Lg.KNOWN_CODES.length, 20, 'all 20 historic codes stay known');
assert.equal(new Set(Lg.KNOWN_CODES).size, 20, 'no duplicate codes');
assert(Lg.canLearn('uz') && Lg.canBeNative('uz'), 'Uzbek is both');
assert(!Lg.canLearn('ru') && Lg.canBeNative('ru'), 'Russian is native-only');
assert(Lg.isLegacy('tr') && !Lg.canLearn('tr') && !Lg.canBeNative('tr') && Lg.isKnown('tr'));
assert(!Lg.isKnown('xx') && !Lg.isKnown('__proto__') && Lg.get('xx') === null);
assert(Lg.isArchivedPair('ru', 'en'), 'learning Russian is archived');
assert(Lg.isArchivedPair('en', 'tr') && Lg.isArchivedPair('tr', 'ru'));
assert(!Lg.isArchivedPair('en', 'ru') && !Lg.isArchivedPair('uz', 'ru') && !Lg.isArchivedPair('en', 'uz'));
assert.equal(Lg.get('zh').reading, 'pinyin');
Lg.LIST.forEach(l => {
  assert(/^[a-z]{2}-[A-Z]{2}$/.test(l.voice), l.code + ' has a BCP-47 voice');
  assert(l.label && l.name && l.flag, l.code + ' has labels and a flag');
  if (l.role === 'learn') assert(l.grammarFeatures.length > 0, l.code + ' lists grammar features');
});
assert.throws(() => { Lg.LIST.push({}); }, 'the list is frozen');
console.log('✓ registry: 9 learning languages, Russian native-only, 10 archived codes still known');

// --- Uzbek apostrophes ---
const OK = 'ʻ', TQ = 'ʼ';
assert.equal(Lg.normalizeUzApostrophes("o'zbek"), 'o' + OK + 'zbek');
assert.equal(Lg.normalizeUzApostrophes('o‘g’il'), 'o' + OK + 'g' + OK + 'il');
assert.equal(Lg.normalizeUzApostrophes('O`zbekiston'), 'O' + OK + 'zbekiston');
assert.equal(Lg.normalizeUzApostrophes("bog'"), 'bog' + OK, 'word-final gʻ');
assert.equal(Lg.normalizeUzApostrophes("ma'no"), 'ma' + TQ + 'no', 'tutuq belgisi');
assert.equal(Lg.normalizeUzApostrophes("san’at e'lon"), 'san' + TQ + 'at e' + TQ + 'lon');
assert.equal(Lg.normalizeUzApostrophes("'salom'"), "'salom" + TQ, 'an opening quote is left alone');
assert.equal(Lg.normalizeUzApostrophes('o' + OK + 'q'), 'o' + OK + 'q', 'idempotent');
assert.equal(Lg.foldApostrophes('o' + OK + 'q o‘q o’q'), "o'q o'q o'q");
console.log('✓ Uzbek apostrophes: oʻ / gʻ → U+02BB, tutuq → U+02BC, idempotent');

// --- Uzbek Cyrillic → Latin ---
const t = Lg.uzCyrToLat;
assert.equal(t('шаҳар'), 'shahar');
assert.equal(t('Шаҳар'), 'Shahar');
assert.equal(t('ШАҲАР'), 'SHAHAR');
assert.equal(t('ўзбек'), 'o' + OK + 'zbek');
assert.equal(t('Ўзбекистон'), 'O' + OK + 'zbekiston');
assert.equal(t('ғишт'), 'g' + OK + 'isht');
assert.equal(t('қизил'), 'qizil');
assert.equal(t('ер'), 'yer', 'е at word start → ye');
assert.equal(t('келди'), 'keldi', 'е after a consonant → e');
assert.equal(t('оила'), 'oila');
assert.equal(t('поезд'), 'poyezd', 'е after a vowel → ye');
assert.equal(t('съезд'), 'sʼyezd'.replace('ʼ', TQ), 'е after ъ → ye');
assert.equal(t('маъно'), 'ma' + TQ + 'no');
assert.equal(t('мактабда'), 'maktabda');
assert.equal(t('ёз юз я'), 'yoz yuz ya');
assert.equal(t('цирк'), 'sirk', 'ц → s');
assert.equal(t('акация'), 'akatsiya', 'ц between vowels → ts');
assert.equal(t('чой'), 'choy');
assert.equal(t('мактаб — school'), 'maktab — school', 'Latin text is kept');
assert.equal(t('salom'), 'salom', 'no Cyrillic: unchanged');
assert.equal(Lg.normalizeUz("o'g'il"), 'o' + OK + 'g' + OK + 'il');
console.log('✓ Uzbek Cyrillic → Latin: digraphs, ye/e, ts/s, case, ʼ');

// --- comparison and duplicates fold every apostrophe ---
assert(L.validate("o'q", 'o' + OK + 'q'), 'typed ASCII apostrophe matches canonical oʻ');
assert(L.validate('o‘q', 'o' + OK + 'q'));
assert(L.validate('ma' + TQ + 'no', "ma'no"));
console.log('✓ typing answers: o\'q = o‘q = oʻq');

// --- word-builder tiles ---
assert.deepEqual(G.tiles('o' + OK + 'g' + OK + 'il'), ['o' + OK, 'g' + OK, 'i', 'l']);
assert.deepEqual(G.tiles("o'g'il"), ["o'", "g'", 'i', 'l'], 'any apostrophe variant');
assert.deepEqual(G.tiles('shahar'), ['s', 'h', 'a', 'h', 'a', 'r'], 'sh stays two letters');
assert.deepEqual(G.tiles('café'), ['c', 'a', 'f', 'é']);
const uzCards = [{ original: 'o' + OK + 'g' + OK + 'il', translation: 'сын' }];
const sc = G.scramble(uzCards, 1, () => 0.3);
assert.equal(sc.length, 1);
assert.equal(sc[0].letters.length, 4, 'oʻgʻil builds from 4 tiles');
assert.equal(sc[0].letters.slice().sort().join(''), sc[0].word.length ? G.tiles(sc[0].word).sort().join('') : '');
console.log('✓ word-builder: oʻ and gʻ are one tile each');

// --- old backups with archived languages still restore ---
const backup = { version: 2, library: {
  decks: {
    'tr-ru': { source: 'tr', target: 'ru', created: 1, cards: [{ original: 'elma', translation: 'яблоко', reps: 3 }] },
    'en-ru': { source: 'en', target: 'ru', created: 2, cards: [{ original: 'apple', translation: 'яблоко' }] },
    'ru-en': { source: 'ru', target: 'en', created: 3, cards: [{ original: 'кот', translation: 'cat' }] },
    'zh-ru': { source: 'zh', target: 'ru', created: 4, cards: [{ original: '你好', translation: 'привет', reading: 'nǐ hǎo' }] }
  },
  history: {}, goal: 10, streak: { count: 0, last: null, freezes: 2 }
} };
const restored = L.restoreBackup(backup, Lg.KNOWN_CODES);
assert.deepEqual(Object.keys(restored.decks).sort(), ['en-ru', 'ru-en', 'tr-ru', 'zh-ru']);
assert.equal(restored.decks['tr-ru'].cards[0].reps, 3, 'progress kept');
assert.equal(restored.decks['zh-ru'].cards[0].reading, 'nǐ hǎo', 'reading kept');
assert.equal('reading' in restored.decks['en-ru'].cards[0], false, 'no reading → field absent');
assert.throws(() => L.restoreBackup({ version: 2, library: Object.assign({}, backup.library, { decks: { 'xx-ru': { source: 'xx', target: 'ru', cards: [] } } }) }, Lg.KNOWN_CODES), /bad-deck/);
const merged = L.mergeLibrary(restored, { decks: {}, history: {}, streak: {} });
assert.equal(merged.decks['zh-ru'].cards[0].reading, 'nǐ hǎo', 'cloud merge keeps reading');
console.log('✓ backups: archived languages (tr, ru as source) restore with progress; unknown codes rejected');

// --- AI contract ---
assert.equal(AI.validateRequest({ words: ['elma'], source: 'tr', target: 'ru' }).source, 'tr', 'legacy decks can still be translated');
assert.equal(AI.validateRequest({ words: ['ship'], source: 'en', target: 'uz' }).target, 'uz');
assert.throws(() => AI.validateRequest({ words: ['x'], source: 'xx', target: 'ru' }), e => e.code === 'bad-request');
assert.deepEqual(Object.keys(AI.LANGS).sort(), Lg.KNOWN_CODES.slice().sort(), 'the AI contract reads the registry');
const zhReq = AI.validateRequest({ words: ['你好'], source: 'zh', target: 'ru' });
assert(/Pinyin/.test(AI.buildMessages(zhReq)[0].content), 'Pinyin is asked for Chinese');
assert(!/Pinyin/.test(AI.buildMessages(AI.validateRequest({ words: ['hi'], source: 'en', target: 'ru' }))[0].content), 'and only for Chinese');
const zhOut = AI.parseResponse(JSON.stringify({ items: [{ original: '你好', translation: 'привет', reading: 'nǐ hǎo' }] }), zhReq);
assert.equal(zhOut[0].reading, 'nǐ hǎo');
const enReq = AI.validateRequest({ words: ['hi'], source: 'en', target: 'ru' });
assert.equal('reading' in AI.parseResponse(JSON.stringify({ items: [{ original: 'hi', translation: 'привет', reading: 'x' }] }), enReq)[0], false, 'reading dropped for non-Chinese');
const uzReq = AI.validateRequest({ words: ['son'], source: 'en', target: 'uz' });
assert.equal(AI.parseResponse(JSON.stringify({ items: [{ original: 'son', translation: "o'g'il" }] }), uzReq)[0].translation, 'o' + OK + 'g' + OK + 'il', 'Uzbek answers get canonical apostrophes');
assert.equal(AI.parseResponse(JSON.stringify({ items: [{ original: 'son', translation: 'ўғил' }] }), uzReq)[0].translation, 'o' + OK + 'g' + OK + 'il', 'and Latin script');
console.log('✓ AI contract: legacy codes accepted, unknown rejected, Pinyin only for zh, Uzbek normalised');

// --- share links ---
(async () => {
  const kk = await S.encodeDeck({ source: 'kk', target: 'ru', cards: [{ original: 'алма', translation: 'яблоко' }] });
  const kkDeck = await S.decodeDeck(kk, Lg.KNOWN_CODES);
  assert.equal(kkDeck.source, 'kk', 'an old Kazakh link still opens');
  const zh = await S.encodeDeck({ source: 'zh', target: 'ru', cards: [{ original: '你好', translation: 'привет', reading: 'nǐ hǎo' }, { original: '谢谢', translation: 'спасибо' }] });
  const zhDeck = await S.decodeDeck(zh, Lg.KNOWN_CODES);
  assert.equal(zhDeck.cards[0].reading, 'nǐ hǎo');
  assert.equal('reading' in zhDeck.cards[1], false);
  const en = S.payloadOf({ source: 'en', target: 'ru', cards: [{ original: 'a', translation: 'б' }] });
  assert.equal('r' in en, false, 'links without readings keep the old shape');
  assert.throws(() => S.validatePayload({ v: 1, s: 'zh', t: 'ru', c: [['a', 'b']], r: ['x', 'y'] }, Lg.KNOWN_CODES), /bad-deck/);
  console.log('✓ share links: archived languages decode, readings travel, old shape unchanged');
})().catch(e => { console.error(e); process.exit(1); });
