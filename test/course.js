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

// Every course language is learnable; ready ones have a valid lesson file, the rest list their topics.
// Japanese and Chinese are learnable for words but have no grammar course planned (v2.26).
const codes = catalog.languages.map(l => l.code);
assert(codes.every(c => Langs.LEARN_CODES.includes(c)), 'only learnable languages have a course');
assert.deepEqual(Langs.LEARN_CODES.filter(c => !codes.includes(c)).sort(), ['ja', 'zh'], 'every other learnable language is planned');
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

// v2.24: teaching steps, stars, spaced reviews, checkpoints, the AI writing check.
assert.deepEqual(C.marked('I *am* tired.'), [{ t: 'I ', hi: false }, { t: 'am', hi: true }, { t: ' tired.', hi: false }]);
const en = JSON.parse(fs.readFileSync(path.join(root, 'course/en.json'), 'utf8'));
assert.deepEqual(C.lessonSteps(en.topics[0]).map(s => s.kind), ['discover', 'point', 'point', 'point', 'build', 'fix', 'write']);
assert(C.checkFix(en.topics[0].mistake, 'my brother is tired'), 'a fixed sentence is accepted without the final dot');
assert(!C.checkFix(en.topics[0].mistake, en.topics[0].mistake.wrong), 'the unchanged mistake is not');
assert.deepEqual([C.stars(5, 8), C.stars(6, 8), C.stars(7, 8), C.stars(8, 8)], [0, 1, 2, 3]);
const t0 = Date.UTC(2026, 0, 1), DAY = 86400000;
let r = Object.assign({ best: 8, total: 8 }, C.scheduleReview({ rev: -1 }, true, t0));
assert.equal(r.due, t0 + DAY, 'the first review is the next day');
assert(!C.isDue(r, t0) && C.isDue(r, t0 + DAY));
r = Object.assign(r, C.scheduleReview(r, true, t0 + DAY));
assert.equal(r.due, t0 + DAY + 3 * DAY, 'a good review pushes the next one further (3 days)');
assert.equal(C.scheduleReview(r, false, t0).due, t0 + DAY, 'a weak review brings it back tomorrow');
assert(!C.isDue({ seen: 1, due: 1 }, t0), 'a topic that is not done is never "due"');
const cp = C.checkpoint(en, 'A1', rand);
assert.equal(cp.grammar.length, Math.min(8, en.topics.filter(t => t.level === 'A1').length));
cp.grammar.forEach(it => assert.equal(it.options[it.answer], it.src.o[it.src.a]));
cp.listening.forEach(it => assert.equal(it.options[it.answer], it.say));
assert.equal(cp.reading.length, en.levels.A1.reading.qs.length);
cp.reading.forEach((it, i) => assert.equal(it.options[it.answer], en.levels.A1.reading.qs[i].o[en.levels.A1.reading.qs[i].a]));
assert(cp.write && cp.write.ru, 'the checkpoint ends with writing');
console.log('✓ Course teaching: notice → rule in parts → build → fix → write; stars; spaced reviews; level checkpoints');

const W = require('../writing.js');
const AI = require('../ai-core.js');
const req = AI.validateRequest({ mode: 'check', lang: 'en', ui: 'ru', topic: 'to be', task: 'Write 2 sentences', text: '  I is happy.  ' });
assert.deepEqual(req, { mode: 'check', lang: 'en', ui: 'ru', topic: 'to be', task: 'Write 2 sentences', text: 'I is happy.' });
assert.throws(() => AI.validateRequest({ mode: 'check', lang: 'ru', ui: 'en', text: 'x' }), /Writing checks/, 'only learnable languages');
assert.throws(() => AI.validateRequest({ mode: 'check', lang: 'en', ui: 'ru', text: 'x'.repeat(501) }), /500/);
const msgs = AI.buildMessages(req);
assert(/DATA written by the learner/.test(msgs[0].content) && JSON.parse(msgs[1].content).text === 'I is happy.', 'the learner text is passed as data');
const parsed = AI.parseResponse('```json\n{"verdict":"good","corrected":"I am happy.","notes":[{"wrong":"is","right":"am","why":"с I — am"}],"praise":"Молодец"}\n```', req);
assert.equal(parsed.verdict, 'almost', 'a "good" that lists errors is not good');
assert.deepEqual(parsed.notes, [{ wrong: 'is', right: 'am', why: 'с I — am' }]);
assert.throws(() => AI.parseResponse('{"verdict":"great"}', req), e => e.code === 'bad-model-response');
assert.equal(W.parseResponse('{"verdict":"wrong","notes":[{"wrong":"a","right":"a"}]}', req).notes.length, 0, 'a "fix" that changes nothing is dropped');
console.log('✓ Writing check: strict request, learner text as data, careful parsing');
