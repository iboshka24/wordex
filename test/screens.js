/* Visual snapshots of the key screens: npm run screens
   RU/EN/UZ × light/dark × 375/1280 px → test/screens/*.png (git-ignored), plus automatic layout checks:
   horizontal page overflow and text that does not fit its box (clipped or spilling over neighbours).
   Exits with code 1 if a layout problem is found. */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vercelHeaders = require('../tools/vercel-headers.js');
const run = require('./harness.js')('test/screens.js', { deadlineMs: 360000 });

const root = path.resolve(__dirname, '..');
const outDir = path.join(__dirname, 'screens');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
// Finds the right option of the current arcade question from the library (so tests never guess), clicks it — or a wrong one.
const ARC_PICK = `window.arcPick = function (wrong) {
  const lib = JSON.parse(localStorage.getItem('vocabulary-master.library.v2'));
  const cards = Object.values(lib.decks).flatMap(d => d.cards);
  const opts = [...document.querySelectorAll('#arcOptions .quiz-option')];
  const p = document.querySelector('.arc-question .context-sentence'), gap = document.getElementById('arcGap');
  let answer = null;
  if (gap) {
    const before = gap.previousSibling ? gap.previousSibling.textContent : '', after = gap.nextSibling ? gap.nextSibling.textContent : '';
    for (const c of cards) for (const ex of (c.examples || [])) if (ex.startsWith(before) && ex.endsWith(after)) answer = c.original.replace(/^to /, '');
  } else { const c = cards.find(c => c.translation === p.textContent); answer = c && c.original.replace(/^to /, ''); }
  const b = opts.find(o => wrong ? o.dataset.value !== answer : o.dataset.value === answer);
  if (!b) throw new Error('no option for ' + answer);
  b.click();
  return answer;
};`;
const LANGS = (process.env.SCREENS_LANGS || 'ru,en,uz').split(',');
const THEMES = ['light', 'dark'];
const WIDTHS = [375, 1280];

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  vercelHeaders.apply(res, url);
  if (url.startsWith('/api/ai')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', serverKeyConfigured: false, account: { url: 'http://' + req.headers.host, key: 'anon' } })); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url === '/' ? '/index.html' : url));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(data); });
});

// Runs in the page: text that is wider/taller than its own box, and page-level horizontal scroll.
function layoutProblems() {
  const problems = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page scrolls horizontally: ' + document.documentElement.scrollWidth + 'px > ' + innerWidth + 'px');
  const sel = 'button, label, .nav-link, .chip-btn, .btn, .pill, .badge, .stat span, .stat b, .segmented button, .deck-kicker, h1, h2, .card-word, .match-tile, .quiz-option, .toast, .summary-grid span, .eyebrow, .streak-indicator, .ui-lang';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto') problems.push('text wider than its box: ' + (el.id ? '#' + el.id : el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 40) + '" (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
  }
  return problems;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  run.server(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = run.browser(await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined }));
  const report = [];
  // Every language/theme/width at normal size, plus extra-large text on a phone in each language.
  const combos = LANGS.flatMap(lang => THEMES.flatMap(theme => WIDTHS.map(width => ({ lang, theme, width, size: 'm' }))))
    .concat(LANGS.map(lang => ({ lang, theme: 'light', width: 375, size: 'xl' })));
  for (const { lang, theme, width, size } of combos) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: lang, hasTouch: width < 600, isMobile: width < 600 });
    await context.addInitScript(([l, t, z]) => { try { localStorage.setItem('vm.onboarded', '1'); sessionStorage.setItem('vm.deck-picked', '1'); localStorage.setItem('vm.ui-lang', l); localStorage.setItem('vm.display', JSON.stringify({ theme: t, size: z })); } catch (e) {} }, [lang, theme, size]);
    const page = await context.newPage();
    const shot = async scene => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const name = `${lang}-${theme}-${width}${size === 'm' ? '' : '-' + size}-${scene}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });
      for (const p of await page.evaluate(layoutProblems)) report.push(`${name}: ${p}`);
    };
    // On phones the sidebar is a drawer behind the menu button.
    const nav = async id => {
      if (await page.locator('#btnMenu').isVisible()) { await page.click('#btnMenu'); await page.locator('body.side-open').waitFor(); await page.waitForTimeout(300); }
      await page.click(id);
    };
    await page.goto(origin);
    await page.locator('#screen-setup.active').waitFor();
    await shot('1-setup');
    if (await page.locator('#btnMenu').isVisible()) {
      await page.click('#btnMenu'); await page.waitForTimeout(350);
      await shot('0-menu');
      await page.keyboard.press('Escape');
    }
    await page.click('#btnSessionSettings'); await shot('1b-settings'); await page.click('#btnSessionClose');
    await nav('#btnNewDeck'); await page.locator('#deckDialog:not([hidden])').waitFor(); await shot('1d-deck'); await page.keyboard.press('Escape');
    await page.locator('#btnAccount:not([hidden])').waitFor(); await page.click('#btnAccount'); await page.click('#accTabUp'); await shot('1c-account'); await page.keyboard.press('Escape');
    await page.click('#btnDemo');
    await page.locator('#screen-train.active').waitFor();
    await page.click('#btnReveal');
    await page.locator('#card.flipped').waitFor();
    await shot('2-training');
    await page.click('#btnKnew2');
    await page.waitForTimeout(400);
    await page.click('#btnExit');
    await page.locator('#summary:not([hidden])').waitFor();
    await shot('3-summary');
    await page.click('#btnNewSet');
    await nav('#navLibrary');
    await page.locator('.deck-item').first().waitFor();
    await page.locator('.deck-item summary').first().click();
    await shot('4-library');
    await page.click('#tabVault'); await shot('4b-vault'); await page.click('#tabDecks');
    await nav('#navTest');
    await page.click('#btnMatchStart');
    await page.locator('.match-tile').first().waitFor();
    await shot('5-test');
    await nav('#navGames'); await page.locator('#gamesHub:not([hidden])').waitFor(); await shot('5b-games');
    await page.click('[data-game="context"]'); await page.locator('.context-sentence').waitFor(); await page.keyboard.press('1'); await shot('5c-context');
    await page.keyboard.press('Escape');
    await page.click('[data-game="scramble"]'); await page.locator('.scramble-clue').waitFor(); await shot('5d-scramble'); await page.keyboard.press('Escape');
    await page.evaluate(ARC_PICK);
    await page.click('[data-game="heist"]'); await page.locator('#arcOptions').waitFor(); await page.evaluate(() => window.arcPick(false)); await page.locator('#arcChests').waitFor(); await shot('5e-heist'); await page.keyboard.press('Escape');
    await page.click('[data-game="boss"]'); await page.locator('.arc-bar.boss').waitFor(); await page.evaluate(() => window.arcPick(false)); await page.waitForTimeout(250); await shot('5f-boss'); await page.keyboard.press('Escape');
    await nav('#navProgress');
    await page.locator('#screen-progress.active').waitFor();
    await shot('6-progress');
    await nav('#navLibrary');
    await page.locator('.deck-item [data-act="share"]').first().click();
    await page.locator('#shareQr svg').waitFor();
    await shot('7-share');
    const link = await page.inputValue('#shareLink');
    await page.keyboard.press('Escape');
    await page.goto(link);
    await page.locator('#sharePreview:not([hidden])').waitFor();
    await shot('8-preview');
    await context.close();
  }
  console.log(`Screens: ${combos.length * 8} snapshots in ${path.relative(root, outDir)}`);
  if (report.length) { console.log('Layout problems:\n  ' + [...new Set(report)].join('\n  ')); process.exitCode = 1; }
  else console.log('✓ No horizontal overflow or clipped text found');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => run.finish());
