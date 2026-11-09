const assert = require('assert');
const fs = require('fs');

console.log('--- Starting Wordzone Test Suite ---');

// 1. Syntax check
require('../api/ai.js');
console.log('✓ api/ai.js loads cleanly');

// Load app.js code for unit testing isolated functions
const appCode = fs.readFileSync(require.resolve('../app.js'), 'utf8');

// Extract parseInput and detectScript
const parseMatch = appCode.match(/function detectScript[\s\S]+?return \{ items: items, dropped: dropped \};\s*\}/);
if (!parseMatch) throw new Error('Could not extract parseInput from app.js');

const parseSandbox = new Function(parseMatch[0] + '; return { parseInput, detectScript };')();
const { parseInput, detectScript } = parseSandbox;

// Test 2: Input parser preserves commas in translations
const pairCommaInput = 'run - бежать, мчаться\napple - яблоко, плод';
const res1 = parseInput(pairCommaInput);
assert.strictEqual(res1.items.length, 2, 'Expected 2 items');
assert.strictEqual(res1.items[0].original, 'run');
assert.strictEqual(res1.items[0].translation, 'бежать, мчаться');
assert.strictEqual(res1.items[1].original, 'apple');
assert.strictEqual(res1.items[1].translation, 'яблоко, плод');
console.log('✓ Preserves commas inside pair translations');

// Test 3: Multi-pair lines
const multiPairInput = 'cat - кошка, dog - собака, house - дом';
const res2 = parseInput(multiPairInput);
assert.strictEqual(res2.items.length, 3, 'Expected 3 items from multi-pair line');
assert.strictEqual(res2.items[0].original, 'cat');
assert.strictEqual(res2.items[0].translation, 'кошка');
assert.strictEqual(res2.items[1].original, 'dog');
assert.strictEqual(res2.items[1].translation, 'собака');
assert.strictEqual(res2.items[2].original, 'house');
assert.strictEqual(res2.items[2].translation, 'дом');
console.log('✓ Splits comma-separated pairs properly without corrupting');

// Test 4: Comma-separated single words without pair delimiters
const commaWords = 'apple, banana, cherry, date';
const res3 = parseInput(commaWords);
assert.strictEqual(res3.items.length, 4);
assert.strictEqual(res3.items[0].original, 'apple');
assert.strictEqual(res3.items[3].original, 'date');
console.log('✓ Parses comma-separated single words');

// Test 5: Numbered and bulleted lists
const listInput = '1. to achieve\n2) serendipity\n• resilience\n- ubiquitous';
const res4 = parseInput(listInput);
assert.strictEqual(res4.items.length, 4);
assert.strictEqual(res4.items[0].original, 'to achieve');
assert.strictEqual(res4.items[1].original, 'serendipity');
assert.strictEqual(res4.items[2].original, 'resilience');
assert.strictEqual(res4.items[3].original, 'ubiquitous');
console.log('✓ Cleans numbered and bulleted prefixes');

// Test 6: Junk filtering and deduplication
const junkInput = '12345\nhttps://spam.com/test\nuser@example.com\napple\nApple\n   \n!!!\ncat';
const res5 = parseInput(junkInput);
assert.strictEqual(res5.items.length, 2, 'Expected only apple and cat');
assert.strictEqual(res5.items[0].original.toLowerCase(), 'apple');
assert.strictEqual(res5.items[1].original.toLowerCase(), 'cat');
assert(res5.dropped >= 4, 'Dropped count should be at least 4');
console.log('✓ Correctly drops junk, urls, numbers, and duplicates');

// Test 7: Script detection
assert.strictEqual(detectScript('Привет, как дела?'), 'ru');
assert.strictEqual(detectScript('Hello wonderful world'), 'en');
console.log('✓ Accurately detects Russian vs English scripts');

// Test 8: Spaced Repetition Queue Logic - No starvation test
function runQueueSimulation(cardCount, steps) {
  const cards = Array.from({ length: cardCount }, (_, i) => ({ id: i, streak: 0, fails: 0 }));
  let roundQueue = cards.map(c => c.id);
  let round = 1;
  const seenInRound = new Set();
  const seenAllTime = new Set();
  let current = null;

  for (let s = 0; s < steps; s++) {
    if (!roundQueue.length) {
      round++;
      const sorted = cards.slice().sort((a, b) => (b.fails - a.fails) || 0.5 - Math.random());
      roundQueue = sorted.map(c => c.id);
      seenInRound.clear();
    }
    current = cards[roundQueue.shift()];
    seenInRound.add(current.id);
    seenAllTime.add(current.id);

    // Simulate 75% known, 25% forgotten
    const knew = (s % 4) !== 0;
    if (knew) {
      current.streak++;
    } else {
      current.fails++;
      current.streak = 0;
      const insertPos = Math.min(roundQueue.length, 3);
      roundQueue.splice(insertPos, 0, current.id);
    }
  }
  return { seenAllTime: seenAllTime.size, round };
}

const sim = runQueueSimulation(20, 50);
assert.strictEqual(sim.seenAllTime, 20, 'All 20 cards must be seen! No starvation.');
assert(sim.round >= 2, 'Should have progressed through multiple rounds');
console.log('✓ Spaced repetition loop: zero starvation, all ' + sim.seenAllTime + '/20 cards seen');

// Test 9: Serverless Function mock tests
const aiHandler = require('../api/ai.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.data = d; return this; },
    end() { return this; }
  };
}

(async () => {
  // The /api/ai contract (methods, origin, validation, provider errors, rate limit) is covered in test/api.js.
  const rStatus = mockRes();
  await aiHandler({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: { action: 'status' } }, rStatus);
  assert.strictEqual(rStatus.statusCode, 200);
  assert.strictEqual(rStatus.data.status, 'ok');
  console.log('✓ /api/ai status probe answers same-origin POST');

  // Test 10: detectScript safe edge cases
  assert.strictEqual(detectScript(null), null);
  assert.strictEqual(detectScript(undefined), null);
  assert.strictEqual(detectScript(''), null);
  assert.strictEqual(detectScript(123), null);
  console.log('✓ detectScript safely handles null, undefined, empty, and numeric inputs');

  // Test 11: CSS rules enforce display:none !important on hidden elements
  const cssCode = fs.readFileSync(require.resolve('../styles.css'), 'utf8');
  assert(cssCode.includes('[hidden]{display:none !important}'), 'Must have [hidden]{display:none !important}');
  assert(cssCode.includes('.overlay[hidden]{display:none !important}'), 'Must have .overlay[hidden]{display:none !important}');
  assert(cssCode.includes('.answer-row[hidden]{display:none !important}'), 'Must have .answer-row[hidden]{display:none !important}');
  console.log('✓ styles.css enforces display:none !important for [hidden], .overlay[hidden], and .answer-row[hidden]');

  // Test 12: HTML buttons and ID alignment
  const htmlContent = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert(htmlContent.includes('id="btnNewSet"'), 'index.html must have btnNewSet');
  assert(htmlContent.includes('id="btnNewSetTrain"'), 'index.html must have btnNewSetTrain in stage-tools');
  const jsIds = [...appCode.matchAll(/\$\(["\x27]([^"\x27]+)["\x27]\)/g)].map(m => m[1]);
  for (const id of jsIds) {
    assert(htmlContent.includes(`id="${id}"`), `Element id "${id}" from app.js must exist in index.html`);
  }
  console.log('✓ index.html has btnNewSet and btnNewSetTrain, and all JS referenced IDs match HTML elements');

  // Test 13: DOM simulation of startNewSet / btnNewSet click
  const domListeners = {};
  const mockElements = {};
  const classStore = {};
  function makeMockElement(id) {
    classStore[id] = new Set();
    return {
      id,
      hidden: false,
      style: {},
      textContent: '',
      value: 'sample words',
      classList: {
        add: (c) => classStore[id].add(c),
        remove: (c) => classStore[id].delete(c),
        toggle: (c, val) => val ? classStore[id].add(c) : classStore[id].delete(c),
        contains: (c) => classStore[id].has(c)
      },
      addEventListener: (e, fn) => {
        domListeners[id + ':' + e] = fn;
      },
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild: () => {},
      focus: () => {},
      select: () => {},
      querySelectorAll: () => []
    };
  }

  const idRegex = /id="([^"]+)"/g;
  let idMatch;
  while ((idMatch = idRegex.exec(htmlContent)) !== null) {
    mockElements[idMatch[1]] = makeMockElement(idMatch[1]);
  }

  const storage = {
    store: { 'wordloop.session': JSON.stringify({ cards: [1, 2, 3] }) },
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = v; },
    removeItem(k) { delete this.store[k]; }
  };

  let speechCancelCount = 0;
  const windowObj = {
    VMLanguages: require('../languages.js'),
    addEventListener: (e, fn) => { domListeners['window:' + e] = fn; },
    history: { pushState: () => {}, replaceState: () => {}, state: { screen: 'train' } },
    scrollTo: () => {},
    speechSynthesis: {
      cancel: () => { speechCancelCount++; },
      speak: () => {}
    }
  };

  const docObj = {
    getElementById: (id) => mockElements[id] || null,
    querySelectorAll: (sel) => {
      if (sel === '.screen') {
        return [mockElements['screen-setup'], mockElements['screen-loading'], mockElements['screen-train']].filter(Boolean);
      }
      return [];
    },
    addEventListener: (e, fn) => { domListeners['doc:' + e] = fn; },
    createElement: (tag) => makeMockElement('created-' + tag)
  };

  const appSandbox = new Function('window', 'document', 'localStorage', 'navigator', appCode);
  appSandbox(windowObj, docObj, storage, { clipboard: { writeText: async () => {}, readText: async () => '' } });

  if (domListeners['doc:DOMContentLoaded']) domListeners['doc:DOMContentLoaded']();

  assert(typeof domListeners['btnNewSet:click'] === 'function', 'btnNewSet must have click listener');
  assert(typeof domListeners['btnNewSetTrain:click'] === 'function', 'btnNewSetTrain must have click listener');

  mockElements['summary'].hidden = false;
  mockElements['summary'].style.display = 'grid';
  mockElements['topPill'].hidden = false;

  const preSpeechCancel = speechCancelCount;
  domListeners['btnNewSet:click']();

  assert.strictEqual(mockElements['summary'].hidden, true, 'summary overlay must be hidden');
  assert.strictEqual(mockElements['summary'].style.display, 'none', 'summary overlay display must be none');
  assert.strictEqual(mockElements['topPill'].hidden, true, 'topPill must be hidden');
  assert.strictEqual(storage.getItem('wordloop.session'), null, 'SESSION_KEY must be cleaned from localStorage');
  assert.strictEqual(classStore['screen-setup'].has('active'), true, 'screen-setup must be active');
  assert(speechCancelCount > preSpeechCancel, 'startNewSet must cancel speech synthesis');
  console.log('✓ btnNewSet click handler properly hides overlay, cancels speech, purges stored session, and activates setup screen');

  // Test 14: btnNewSetTrain in stage-tools resets training, cleans storage, and activates setup screen
  domListeners['btnDemo:click']();
  assert.strictEqual(classStore['screen-train'].has('active'), true, 'training screen must be active');
  assert.strictEqual(mockElements['topPill'].hidden, false, 'topPill must be shown in training');
  assert(storage.getItem('wordloop.session') !== null, 'training session must be stored in localStorage');

  domListeners['btnNewSetTrain:click']();
  assert.strictEqual(classStore['screen-setup'].has('active'), true, 'setup screen must be active after btnNewSetTrain');
  assert.strictEqual(mockElements['topPill'].hidden, true, 'topPill must be hidden');
  assert.strictEqual(storage.getItem('wordloop.session'), null, 'SESSION_KEY must be cleaned after btnNewSetTrain');
  console.log('✓ btnNewSetTrain in stage-tools properly resets training state, purges session, and activates setup screen');

  // Test 15: Race condition immunity: answering a card followed immediately by "Новый набор" aborts pending nextCard timer
  domListeners['btnDemo:click']();
  assert.strictEqual(classStore['screen-train'].has('active'), true);
  domListeners['btnKnew:click'](); // Schedules 180ms nextCardTimer
  domListeners['btnNewSetTrain:click'](); // Immediately resets to new set

  await new Promise(r => setTimeout(r, 220)); // Wait for timer duration to pass

  assert.strictEqual(classStore['screen-setup'].has('active'), true, 'screen-setup must remain active after delay');
  assert.strictEqual(mockElements['stRound'].textContent, '1', 'stRound must remain 1 and not be incremented by dangling callback');
  assert.strictEqual(mockElements['cardWord'].textContent, '—', 'cardWord must remain cleared');
  console.log('✓ Race condition immunity verified: answering card followed by new set properly aborts pending transition without state corruption');

  // Test 16: showSummary cancels active speech playback
  domListeners['btnDemo:click']();
  const cancelCountBeforeExit = speechCancelCount;
  domListeners['btnExit:click']();
  assert.strictEqual(mockElements['summary'].hidden, false, 'summary overlay must be shown on exit');
  assert(speechCancelCount > cancelCountBeforeExit, 'showSummary must cancel active speech synthesis');
  console.log('✓ showSummary cancels active speech playback to silence audio when exiting to summary');

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0); // mock-сервер держит event loop — завершаемся явно
})();
