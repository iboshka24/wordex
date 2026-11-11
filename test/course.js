/* Grammar course: the lesson files are valid and complete in ru/en/uz, every exercise is answerable,
   answer checking is forgiving in the right places, and progress survives backups and two devices. */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../course.js');
const L = require('../learning.js');
const Langs = require('../languages.js');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'course/catalog.json'), 'utf8'));

// Every learnable language has a plate; ready ones have a valid lesson file, the rest list their topics.
assert.deepEqual(catalog.languages.map(l => l.code).sort(), Langs.LEARN_CODES.slice().sort(), 'one plate per learnable language');
for (const l of catalog.languages) {
  assert(l.glyph && l.native, l.code + ': glyph and native name');
  if (l.ready) {
    const file = path.join(root, 'course', l.code + '.json');
    assert(fs.existsSync(file), l.code + ': lesson file');
    const lessons = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(lessons.lang, l.code);
    const errs = C.validateLessons(lessons);
    assert.deepEqual(errs, [], l.code + ' lessons:\n' + errs.join('\n'));
    assert(lessons.topics.length >= 12, l.code + ': a real course, not a sample');
    // Every exercise can actually be solved with its own answer.
    for (const t of lessons.topics) for (const ex of t.ex) {
      if (ex.k === 'type') ex.a.forEach(a => assert(C.checkType(ex, a), t.id + ': accepts ' + a));
      if (ex.k === 'order') assert(C.checkOrder(ex, ex.w), t.id + ': order answer');
    }
    // The service worker keeps ready lessons offline.
    assert(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes("'course/" + l.code + ".json'"), l.code + ': precached');
  } else {
    assert(Array.isArray(l.topics) && l.topics.length >= 6, l.code + ': upcoming topics are listed');
    l.topics.forEach(t => ['ru', 'en', 'uz'].forEach(u => assert(t.title[u], l.code + '.' + t.id + ' title ' + u)));
  }
}
console.log('✓ Course content: every plate, every lesson complete in ru/en/uz, every exercise answerable');

// Answer checking: case, curly apostrophes and end punctuation don't matter; the words do.
assert(C.checkType({ a: ["mustn't"] }, 'Mustn’t'));
assert(C.checkType({ a: ['is'] }, ' IS. '));
assert(!C.checkType({ a: ['is'] }, 'are'));
assert(!C.checkType({ a: ['is'] }, ''));
assert(C.checkOrder({ w: ['Is', 'your', 'sister', 'a', 'student?'] }, ['Is', 'your', 'sister', 'a', 'student?']));
assert(!C.checkOrder({ w: ['Is', 'your', 'sister', 'a', 'student?'] }, ['your', 'Is', 'sister', 'a', 'student?']));
assert(C.checkOrder({ w: ['I', 'often', 'read.'], alt: [['Often', 'I', 'read.']] }, ['Often', 'I', 'read.']), 'accepted alternative order');
// A practice set keeps every exercise once, the right option tracked after shuffling, tiles not already solved.
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const topic = JSON.parse(fs.readFileSync(path.join(root, 'course/en.json'), 'utf8')).topics[0];
const set = C.buildSession(topic, rand);
assert.equal(set.length, topic.ex.length);
set.forEach(it => {
  if (it.options) assert.equal(it.options[it.answer], it.src.o[it.src.a], 'the right answer follows the shuffle');
  if (it.tiles) { assert.deepEqual(it.tiles.slice().sort(), it.src.w.slice().sort()); assert.notEqual(it.tiles.join(' '), it.src.w.join(' ')); }
});
assert.equal(C.score([true, false, true]), 2);
assert.equal(C.passed(6, 8), true); assert.equal(C.passed(5, 8), false);
assert.equal(C.topicState(undefined), 'new');
assert.equal(C.topicState({ seen: 1 }), 'seen');
assert.equal(C.topicState({ seen: 1, best: 5, total: 8 }), 'seen');
assert.equal(C.topicState({ seen: 1, best: 6, total: 8 }), 'done');
assert.equal(C.langDone('en', [{ id: 'a' }, { id: 'b' }], { 'en.a': { best: 8, total: 8 }, 'en.b': { seen: 1 } }), 1);
console.log('✓ Course practice: forgiving answer checks, shuffled sets keep the right answer, 6 of 8 counts as done');

// Progress: cleaned on restore, merged between two devices.
const clean = L.cleanCourse({ 'en.to-be': { seen: 5, best: 99, total: 8, done: 6, junk: 1 }, 'bad key': { seen: 1 }, '__proto__': { seen: 1 }, 'en.x': 'no' });
assert.deepEqual(clean, { 'en.to-be': { seen: 5, best: 8, total: 8, done: 6 } }, 'scores clamped, junk and bad keys dropped');
const merged = L.mergeCourse({ 'en.a': { seen: 10, best: 5, total: 8, last: 20 } }, { 'en.a': { seen: 5, best: 7, total: 8, last: 15, done: 15 }, 'en.b': { seen: 3 } });
assert.deepEqual(merged, { 'en.a': { seen: 5, best: 7, total: 8, last: 20, done: 15 }, 'en.b': { seen: 3 } }, 'best score, first seen/done, latest visit');
const lib = { decks: {}, history: {}, streak: { count: 0, last: null, freezes: 2 }, course: { 'en.to-be': { seen: 1, best: 8, total: 8 } } };
assert.deepEqual(L.restoreBackup(L.backupFile(lib), Langs.KNOWN_CODES).course, lib.course, 'a backup keeps grammar progress');
assert.deepEqual(L.mergeLibrary(lib, { decks: {}, history: {}, streak: {} }).course, lib.course, 'cloud merge keeps grammar progress');
console.log('✓ Course progress: survives backups and merges across devices');
