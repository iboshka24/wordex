const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../i18n');

for (const [key, entry] of Object.entries(I.dict)) {
  assert.equal(entry.length, 3, key + ' must have ru, en and uz');
  entry.forEach((v, i) => assert(v && (typeof v === 'string' || Array.isArray(v)), key + ' is empty for ' + I.codes[i]));
  const vars = s => [...new Set([].concat(s).join(' ').match(/\{\w+\}/g) || [])].sort().join();
  assert.equal(vars(entry[1]), vars(entry[0]), key + ': en placeholders differ from ru');
  assert.equal(vars(entry[2]), vars(entry[0]), key + ': uz placeholders differ from ru');
}

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const used = [...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map(m => m[1])
  .concat([...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(',').map(p => p.split(':')[1])));
const code = ['app.js', 'motion.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
used.push(...[...code.matchAll(/\btrn?\('([a-zA-Z]+\.[a-zA-Z0-9]+)'/g)].map(m => m[1]));
for (const key of used) assert(I.dict[key], 'missing translation key: ' + key);

assert.equal(I.tn('words.count', 1), '1 слово');
assert.equal(I.tn('words.count', 3), '3 слова');
assert.equal(I.tn('words.count', 11), '11 слов');
assert.equal(I.t('load.free', { i: 2, n: 5 }), 'Перевод без API (2 из 5)…');
console.log('✓ i18n: ' + Object.keys(I.dict).length + ' keys × 3 languages, every key used in HTML/JS exists');

// --- DOM binding, language detection and switching (fake window) ---
function fakeWindow({ saved, languages } = {}) {
  const store = saved ? { 'vm.ui-lang': saved } : {};
  const writes = [];
  const el = (attrs, text = '', html = '') => {
    const node = { attrs: { ...attrs }, _text: text, _html: html,
      getAttribute: k => (k in node.attrs ? node.attrs[k] : null),
      setAttribute: (k, v) => { writes.push('attr:' + k); node.attrs[k] = v; } };
    Object.defineProperty(node, 'textContent', { get: () => node._text, set: v => { writes.push('text'); node._text = v; } });
    Object.defineProperty(node, 'innerHTML', { get: () => node._html, set: v => { writes.push('html'); node._html = v; } });
    return node;
  };
  const nav = el({ 'data-i18n': 'nav.study' }, 'Учить слова');
  const hero = el({ 'data-i18n-html': 'hero.h1' }, '', 'Не просто слова.<br><em>Твои новые мысли.</em>');
  const swap = el({ 'data-i18n-attr': 'title:lang.swap, aria-label:lang.swapAria', title: 'Поменять языки местами (Alt+X)', 'aria-label': 'Поменять языки местами' });
  const meta = el({ content: I.dict['meta.desc'][0] });
  const nodes = { '[data-i18n]': [nav], '[data-i18n-html]': [hero], '[data-i18n-attr]': [swap] };
  const document = { title: I.dict['meta.title'][0], documentElement: { lang: 'ru' }, querySelectorAll: sel => nodes[sel] || [], querySelector: () => meta };
  return { win: { document, navigator: { languages: languages || ['ru-RU'] }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } }, nav, hero, swap, meta, store, writes };
}

assert.equal(I.create(fakeWindow({ saved: 'uz' }).win).lang(), 'uz', 'saved choice wins');
assert.equal(I.create(fakeWindow({ languages: ['uz-UZ', 'ru'] }).win).lang(), 'uz');
assert.equal(I.create(fakeWindow({ languages: ['en-GB'] }).win).lang(), 'en');
assert.equal(I.create(fakeWindow({ languages: ['kk-KZ'] }).win).lang(), 'ru', 'Kazakh/Ukrainian/Belarusian browsers get Russian');
assert.equal(I.create(fakeWindow({ languages: ['de-DE'] }).win).lang(), 'ru', 'unknown languages fall back to Russian');
assert.equal(I.create(fakeWindow({ saved: 'xx', languages: ['en'] }).win).lang(), 'en', 'a corrupted saved value is ignored');

const f = fakeWindow();
const inst = I.create(f.win);
inst.apply();
assert.deepEqual(f.writes, [], 'markup that already matches is not rewritten (keeps LCP intact)');
assert.equal(f.win.document.documentElement.lang, 'ru');
const seen = [];
inst.onChange(code => seen.push(code));
inst.onChange(() => { throw new Error('a broken listener must not stop the others'); });
inst.onChange(code => seen.push('second:' + code));
inst.set('en');
assert.equal(inst.lang(), 'en'); assert.equal(f.store['vm.ui-lang'], 'en');
assert.deepEqual(seen, ['en', 'second:en']);
assert.equal(f.nav.textContent, 'Study words');
assert.equal(f.hero.innerHTML, 'Not just words.<br><em>Your new thoughts.</em>');
assert.equal(f.swap.getAttribute('title'), 'Swap languages (Alt+X)'); assert.equal(f.swap.getAttribute('aria-label'), 'Swap languages');
assert.equal(f.win.document.documentElement.lang, 'en');
assert.equal(f.win.document.title, 'Wordzone — words become knowledge');
assert.match(f.meta.getAttribute('content'), /Paste words/);
inst.set('en'); inst.set('xx');
assert.deepEqual(seen, ['en', 'second:en'], 'same or unknown language does nothing');
assert.equal(inst.tn('words.count', 1), '1 word'); assert.equal(inst.tn('words.count', 2), '2 words');
inst.set('uz');
assert.equal(inst.tn('words.count', 1), "1 ta so'z"); assert.equal(inst.tn('words.count', 7), "7 ta so'z");
assert.equal(inst.t('nope.missing'), 'nope.missing', 'a missing key shows the key, not "undefined"');
assert.equal(inst.t('load.free', { i: 1 }), 'API siz tarjima (1 / {n})…', 'a missing variable keeps its placeholder');
assert.equal(I.create(null).tn('nope.missing', 3), 'nope.missing');
console.log('✓ i18n: language detection, persisted switching, listeners, DOM binding without needless writes, EN/UZ plurals');
