/* Wordzone (formerly Wordex, Vocabulary Master AI, originally WordLoop). No build step. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var L = window.VMLearning;
  var I18N = window.VMI18n;
  function tr(key, vars) { return I18N ? I18N.t(key, vars) : key; }
  function trn(key, n, vars) { return I18N ? I18N.tn(key, n, vars) : String(n); }

  // Languages come from languages.js (one list for the app, the AI contract, the server and the tests).
  var LANGUAGES = window.VMLanguages;
  var LANGS = LANGUAGES.LIST;

  var PRESETS = {
    verbs: [
      'to achieve', 'to explore', 'to overcome', 'to notice', 'to hesitate',
      'to encourage', 'to maintain', 'to struggle', 'to appreciate', 'to distinguish'
    ],
    travel: [
      'boarding pass', 'flight delay', 'customs declaration', 'luggage claim',
      'round-trip ticket', 'layover', 'seatbelt', 'emergency exit', 'currency exchange', 'shuttle bus'
    ],
    it: [
      'refactoring', 'pipeline', 'deployment', 'latency', 'concurrency',
      'deadlock', 'payload', 'dependency', 'throughput', 'endpoint'
    ],
    advanced: [
      'serendipity', 'ephemeral', 'ubiquitous', 'resilience', 'eloquent',
      'ambiguity', 'tenacious', 'profound', 'meticulous', 'pragmatic'
    ]
  };

  var BUILTIN_DICT = {
    // Presets - Verbs
    'to achieve': 'достигать', 'to explore': 'исследовать', 'to overcome': 'преодолевать',
    'to notice': 'замечать', 'to hesitate': 'колебаться', 'to encourage': 'поощрять',
    'to maintain': 'поддерживать', 'to struggle': 'бороться', 'to appreciate': 'ценить',
    'to distinguish': 'различать', 'to remember': 'помнить', 'to borrow': 'одалживать',
    'to explain': 'объяснять', 'to waste': 'тратить впустую', 'to discover': 'открывать для себя',
    'to improve': 'улучшать', 'to create': 'создавать', 'to develop': 'развивать',
    // Presets - Travel
    'boarding pass': 'посадочный талон', 'flight delay': 'задержка рейса',
    'customs declaration': 'таможенная декларация', 'luggage claim': 'выдача багажа',
    'round-trip ticket': 'билет туда и обратно', 'layover': 'пересадка',
    'seatbelt': 'ремень безопасности', 'emergency exit': 'аварийный выход',
    'currency exchange': 'обмен валюты', 'shuttle bus': 'трансферный автобус',
    // Presets - IT
    'refactoring': 'рефакторинг', 'pipeline': 'пайплайн / конвейер', 'deployment': 'развёртывание',
    'latency': 'задержка отклика', 'concurrency': 'параллелизм', 'deadlock': 'взаимная блокировка',
    'payload': 'полезная нагрузка', 'dependency': 'зависимость', 'throughput': 'пропускная способность',
    'endpoint': 'конечная точка API', 'cache': 'кэш', 'database': 'база данных',
    // Presets - Advanced
    'serendipity': 'счастливая случайность', 'ephemeral': 'мимолётный', 'ubiquitous': 'вездесущий',
    'resilience': 'стрессоустойчивость', 'eloquent': 'красноречивый', 'ambiguity': 'неоднозначность',
    'tenacious': 'упорный / цепкий', 'profound': 'глубокий / фундаментальный',
    'meticulous': 'скрупулёзный', 'pragmatic': 'прагматичный',
    // Everyday words & bidirectional
    'hello': 'привет', 'world': 'мир', 'sunshine': 'солнечный свет', 'weather': 'погода',
    'journey': 'путешествие', 'brave': 'храбрый', 'quiet': 'тихий', 'narrow': 'узкий',
    'advice': 'совет', 'deep': 'глубокий', 'apple': 'яблоко', 'house': 'дом',
    'cat': 'кошка', 'dog': 'собака', 'car': 'машина', 'book': 'книга', 'friend': 'друг',
    'water': 'вода', 'city': 'город', 'street': 'улица', 'time': 'время', 'life': 'жизнь',
    'work': 'работа', 'study': 'учёба', 'success': 'успех', 'dream': 'мечта', 'freedom': 'свобода',
    // Russian to English
    'привет': 'hello', 'мир': 'world', 'погода': 'weather', 'путешествие': 'journey',
    'храбрый': 'brave', 'тихий': 'quiet', 'достигать': 'to achieve', 'совет': 'advice',
    'яблоко': 'apple', 'дом': 'house', 'кошка': 'cat', 'собака': 'dog', 'машина': 'car',
    'книга': 'book', 'друг': 'friend', 'вода': 'water', 'город': 'city', 'успех': 'success'
  };

  var CFG_KEY = 'wordloop.cfg';
  var SESSION_KEY = 'wordloop.session';
  var SOUND_KEY = 'wordloop.sound';
  var CHUNK = 35;

  var state = {
    cfg: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', target: 'ru', source: 'en', dir: 'mixed', mode: 'flashcard', simple: false, deck: '' },
    serverAvailable: true,
    serverHasKey: false,
    soundEnabled: true,
    cancelled: false,
    cards: [],
    roundQueue: [],
    roundTotal: 0,
    current: null,
    curSide: 'fwd',
    revealed: false,
    round: 1,
    known: 0,
    forgot: 0,
    answers: 0,
    startedAt: 0,
    elapsed: 0,
    timer: null
  };

  /* ---------------- Sound & Speech Synthesis ---------------- */

  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainVal) {
    if (!state.soundEnabled) return;
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal || 0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playFlipSound() { playTone(340, 'sine', 0.1, 0.08); }
  function playSuccessSound() {
    playTone(523, 'triangle', 0.12, 0.12);
    setTimeout(function () { playTone(659, 'triangle', 0.2, 0.12); }, 80);
  }
  function playForgotSound() {
    playTone(240, 'sine', 0.14, 0.1);
    setTimeout(function () { playTone(180, 'sine', 0.22, 0.1); }, 70);
  }

  // Short arcade cues: the mini-games call these through VMGames.
  function playArcadeFx(kind) {
    if (kind === 'ok') return playSuccessSound();
    if (kind === 'bad') return playForgotSound();
    if (kind === 'tick') return playTone(880, 'square', 0.06, 0.05);
    if (kind === 'hit') return playTone(160, 'sawtooth', 0.12, 0.12);
    if (kind === 'crit') { [660, 880, 1320].forEach(function (f, i) { setTimeout(function () { playTone(f, 'square', 0.09, 0.1); }, i * 55); }); return; }
    if (kind === 'chest') { [523, 784, 1047, 1568].forEach(function (f, i) { setTimeout(function () { playTone(f, 'triangle', 0.14, 0.1); }, i * 70); }); return; }
    if (kind === 'win') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { setTimeout(function () { playTone(f, 'triangle', 0.22, 0.12); }, i * 110); }); return; }
    if (kind === 'lose') { [330, 262, 196].forEach(function (f, i) { setTimeout(function () { playTone(f, 'sine', 0.3, 0.12); }, i * 160); }); }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    try { localStorage.setItem(SOUND_KEY, state.soundEnabled ? '1' : '0'); } catch (e) {}
    updateSoundUI();
    toast(tr(state.soundEnabled ? 'toast.soundOn' : 'toast.soundOff'), 'ok', 1400);
    if (state.soundEnabled) playSuccessSound();
  }

  var ICON_SOUND_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 5.2a9 9 0 0 1 0 13.6"/></svg>';
  var ICON_SOUND_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

  function updateSoundUI() {
    var b = $('btnSound');
    if (b) {
      b.innerHTML = state.soundEnabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
      b.classList.toggle('active', state.soundEnabled);
      if (typeof b.setAttribute === 'function') {
        b.setAttribute('aria-label', tr(state.soundEnabled ? 'top.soundOff' : 'top.soundOn'));
      }
    }
  }

  /* ---------------- speech: one voice picker for the card buttons, S, listening mode and examples ---------------- */
  var voiceList = [], voicesKnown = false;
  function hasSpeech() { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; }
  function loadVoices() {
    if (!hasSpeech() || typeof window.speechSynthesis.getVoices !== 'function') return;
    try { voiceList = window.speechSynthesis.getVoices() || []; } catch (e) { voiceList = []; }
    voicesKnown = voiceList.length > 0; // an empty list may only mean "not loaded yet"
    updateSpeakButtons();
  }
  function voiceTag(langCode) { var l = LANGUAGES.get(langCode); return (l && l.voice) || 'en-US'; }
  // false = this device certainly has no voice for the language (unknown counts as available).
  function canSpeak(langCode) {
    if (!hasSpeech()) return false;
    return !voicesKnown || Boolean(LANGUAGES.pickVoice(voiceList, voiceTag(langCode)));
  }
  function speakUnavailableText(langCode) {
    return hasSpeech() ? tr('speak.noVoice', { l: langByCode(langCode).label }) : tr('speak.noSpeech');
  }
  var speakingBtn = null;
  function markSpeaking(btn, on) {
    if (!btn || !btn.classList) return;
    btn.classList.toggle('is-speaking', on);
    if (btn.setAttribute) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // Speaks `text` in the language's voice. Returns false (and says why when `btn` was pressed) if it cannot.
  function speakText(text, langCode, btn) {
    if (!text) return false;
    if (!state.soundEnabled) { if (btn) toast(tr('speak.muted'), 'err', 2600); return false; }
    if (!canSpeak(langCode)) { if (btn) toast(speakUnavailableText(langCode), 'err', 4000); return false; }
    try {
      window.speechSynthesis.cancel();
      if (speakingBtn) { markSpeaking(speakingBtn, false); speakingBtn = null; }
      var ut = new SpeechSynthesisUtterance(text);
      ut.lang = voiceTag(langCode);
      var v = LANGUAGES.pickVoice(voiceList, ut.lang);
      if (v) ut.voice = v;
      ut.rate = 0.9;
      if (btn) {
        speakingBtn = btn; markSpeaking(btn, true);
        ut.onend = ut.onerror = function () { markSpeaking(btn, false); if (speakingBtn === btn) speakingBtn = null; };
      }
      window.speechSynthesis.speak(ut);
      return true;
    } catch (e) { if (btn) markSpeaking(btn, false); return false; }
  }
  // Language of what each card button would read right now.
  function frontLang() { return isListen() || state.curSide === 'fwd' ? state.cfg.source : state.cfg.target; }
  function backLang() { return isListen() || state.curSide !== 'fwd' ? state.cfg.source : state.cfg.target; }
  function setSpeakBtn(btn, langCode, titleKey) {
    if (!btn || !btn.setAttribute) return;
    var ok = canSpeak(langCode), label = ok ? tr(titleKey) : speakUnavailableText(langCode);
    btn.disabled = !ok;
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', ok ? tr('card.listen') : label);
  }
  function updateSpeakButtons() {
    if (!state.current) return;
    setSpeakBtn($('btnSpeakFront'), frontLang(), 'card.speakWord');
    setSpeakBtn($('btnSpeakBack'), backLang(), 'card.speakTrans');
    document.querySelectorAll('#cardContext .speak-btn').forEach(function (b) { setSpeakBtn(b, state.cfg.source, 'card.speakExample'); });
  }

  /* ---------------- utils ---------------- */

  var NAV_FOR = { 'screen-setup': 'navStudy', 'screen-library': 'navLibrary', 'screen-games': 'navGames', 'screen-test': 'navTest', 'screen-progress': 'navProgress', 'screen-grammar': 'navGrammar' };
  var CRUMB_FOR = { 'screen-setup': 'nav.study', 'screen-library': 'nav.library', 'screen-games': 'nav.games', 'screen-test': 'nav.test', 'screen-progress': 'nav.progress', 'screen-grammar': 'nav.grammar', 'screen-train': 'crumb.train', 'screen-loading': 'crumb.loading' };
  function updateShell(id) {
    document.querySelectorAll('.nav-link').forEach(function (b) {
      var on = b.id === NAV_FOR[id];
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var crumb = $('crumbHere');
    if (crumb && CRUMB_FOR[id]) crumb.textContent = tr(CRUMB_FOR[id]);
  }
  function setSidebar(open) {
    document.body.classList.toggle('side-open', open);
    $('sideBackdrop').hidden = !open;
    $('btnMenu').setAttribute('aria-expanded', String(open));
    if (open) { var first = document.querySelector('#sidebar .nav-link'); if (first) first.focus(); }
  }
  function show(id) {
    updateShell(id);
    if (document.body && document.body.classList.contains('side-open')) setSidebar(false);
    var apply = function () {
      document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.VMMotion) window.VMMotion.screen(id);
    };
    /* Прогрессивное улучшение: нативный cross-fade между экранами, где поддерживается */
    try {
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!window.VMMotion && !reduced && typeof document.startViewTransition === 'function') {
        document.startViewTransition(apply);
        return;
      }
    } catch (e) {}
    apply();
  }

  var toastTimer = null;
  var toastHideTimer = null;
  var importantUntil = 0;
  function toast(msg, type, ms, action) {
    var t = $('toast');
    if (!t) return;
    // A long error message (storage full, offline...) is not replaced by routine confirmations.
    if (type !== 'err' && Date.now() < importantUntil) return;
    importantUntil = type === 'err' && (ms || 0) >= 6000 ? Date.now() + ms : 0;
    t.textContent = msg;
    if (action) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = action.label;
      btn.onclick = function () { clearTimeout(toastTimer); t.hidden = true; action.run(); };
      t.appendChild(btn);
    }
    t.className = 'toast ' + (type || '') + (action ? ' has-action' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastTimer = setTimeout(function () {
      try { t.classList.add('out'); } catch (e) {}
      toastHideTimer = setTimeout(function () {
        t.hidden = true;
        try { t.classList.remove('out'); } catch (e) {}
      }, 280);
    }, ms || 3200);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  function langByCode(code) { return LANGUAGES.get(code) || LANGS[0]; }
  // A learnable language other than `code`, for "the two sides must differ" fixes.
  function otherLearnable(code) { return code === 'en' ? 'es' : 'en'; }
  // Fills a language <select> with the allowed codes; a current value outside them (a legacy deck,
  // learning Russian) stays visible as one extra "archived" option so an existing deck keeps working.
  function fillLangSelect(sel, codes, current) {
    if (!sel) return;
    sel.innerHTML = '';
    codes.forEach(function (code) { var o = document.createElement('option'); o.value = code; o.textContent = langByCode(code).label; sel.appendChild(o); });
    if (current && codes.indexOf(current) < 0 && LANGUAGES.isKnown(current)) {
      var o = document.createElement('option'); o.value = current; o.textContent = langByCode(current).label + ' · ' + tr('lang.archived'); sel.appendChild(o);
    }
    if (current) sel.value = current;
  }
  function canSwapPair(source, target) { return LANGUAGES.canLearn(target) && LANGUAGES.canBeNative(source); }
  function syncLangSelects() {
    fillLangSelect($('sourceLang'), LANGUAGES.LEARN_CODES, state.cfg.source);
    fillLangSelect($('targetLang'), LANGUAGES.NATIVE_CODES, state.cfg.target);
    var b = $('btnSwapLang');
    if (b && b.setAttribute) {
      var ok = canSwapPair(state.cfg.source, state.cfg.target);
      b.disabled = !ok;
      b.setAttribute('title', ok ? tr('lang.swap') : tr('lang.swapOff', { l: langByCode(state.cfg.target).label }));
    }
  }

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(state.cfg)); } catch (e) {}
    if (account) account.changed();
    updateApiStatus();
  }

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        Object.keys(o || {}).forEach(function (k) { if (state.cfg[k] !== undefined) state.cfg[k] = o[k]; });
      }
      var s = localStorage.getItem(SOUND_KEY);
      if (s !== null) state.soundEnabled = s === '1';
    } catch (e) {}
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        cards: state.cards, dir: state.cfg.dir, source: state.cfg.source, target: state.cfg.target, round: state.round, at: Date.now()
      }));
      $('resumeBox').hidden = false;
    } catch (e) {}
  }

  /* ---------------- pre-filter & pair parser ---------------- */

  function detectScript(text) {
    if (!text) return null;
    var str = String(text);
    var cyr = (str.match(/[\u0400-\u04FF]/g) || []).length;
    var lat = (str.match(/[a-zA-Z]/g) || []).length;
    if (cyr > lat && cyr >= 2) return 'ru';
    if (lat > cyr && lat >= 2) return 'en';
    return null;
  }

  function parseInput(text) {
    var rawLines = String(text || '').split(/\r?\n/);
    var seen = Object.create(null);
    var items = [];
    var dropped = 0;

    for (var i = 0; i < rawLines.length; i++) {
      var raw = rawLines[i].replace(/^\s*(?:[-*•–—]|\d+[.)])+\s*/, '').trim();
      if (!raw) continue;
      if (/^https?:\/\//i.test(raw) || /[\w.]+@[\w.]+/.test(raw) || /^\d+$/.test(raw)) {
        dropped++;
        continue;
      }

      // Check if line contains multiple pairs separated by commas: e.g. "apple - яблоко, cat - кошка"
      var subPairs = raw.split(/,\s*(?=[^\s,]+(?:\s+[^\s,]+)*\s*(?:[:=]|\s+[-—–]\s+|\t+)\s*)/);

      for (var p = 0; p < subPairs.length; p++) {
        var chunk = subPairs[p].trim();
        if (!chunk) continue;

        // Check for single pair delimiter: - — – : = \t
        var pairMatch = chunk.match(/^([^\s:=].*?)\s*(?:[:=]|\s+[-—–]\s+|\t+)\s*(.+)$/);
        if (pairMatch && pairMatch[1].trim() && pairMatch[2].trim()) {
          var orig = pairMatch[1].trim();
          var trans = pairMatch[2].trim();
          if (!/[\p{L}]/u.test(orig) || /^https?:\/\//i.test(orig) || orig.length > 180) {
            dropped++;
            continue;
          }
          var k = orig.toLowerCase();
          if (seen[k]) { dropped++; continue; }
          seen[k] = 1;
          items.push({ original: orig, translation: trans, hint: '', pretranslated: true });
        } else {
          // Line without pair delimiter: split by commas / semicolons / bullets
          var parts = chunk.split(/[,;•]+/);
          for (var j = 0; j < parts.length; j++) {
            var single = parts[j].trim();
            if (!single) continue;
            if (!/[\p{L}]/u.test(single) || /^https?:\/\//i.test(single) || /[\w.]+@[\w.]+/.test(single) || single.length > 180) {
              dropped++;
              continue;
            }
            var k2 = single.toLowerCase();
            if (seen[k2]) { dropped++; continue; }
            seen[k2] = 1;
            items.push({ original: single, translation: '', hint: '', pretranslated: false });
          }
        }
      }
    }
    return { items: items, dropped: dropped };
  }

  /* ---------------- AI & Translation ---------------- */

  async function checkServerStatus() {
    try {
      var r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"status"}', signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        var d = await r.json();
        state.serverHasKey = Boolean(d.serverKeyConfigured);
        state.serverProvider = d.provider || '';
        if (d.account && window.VMAccount && L && !account) mountAccount(d.account);
        if (document.body) document.body.classList.toggle('server-ai', state.serverHasKey); // the site's own key: nothing to connect
        state.serverAvailable = true;
      } else {
        state.serverAvailable = false;
      }
    } catch (e) {
      state.serverAvailable = false;
    }
    updateApiStatus();
  }

  var ownKeyOpen = false;
  function updateApiStatus() {
    var ind = $('statusIndicator');
    var summ = $('apiSummaryStatus');
    // With the site's own key there is nothing to set up; manual settings stay one click away.
    var siteAI = state.serverHasKey && !state.cfg.apiKey;
    var note = $('serverAiNote'), own = $('apiOwn');
    if (note && own) {
      note.hidden = !siteAI;
      $('serverAiText').textContent = tr('api.serverP', { p: state.serverProvider === 'gemini' ? 'Google Gemini' : tr('api.someAI') });
      own.hidden = siteAI && !ownKeyOpen;
      $('btnOwnKey').setAttribute('aria-expanded', String(!own.hidden));
      $('btnOwnKey').textContent = tr(own.hidden ? 'api.ownKey' : 'api.ownKeyHide');
    }
    if (state.serverHasKey) {
      if (ind) { ind.textContent = tr('status.server'); ind.className = 'status-indicator'; }
      if (summ) { summ.textContent = tr('summ.server'); summ.className = 'api-summary-status'; }
    } else if (state.cfg.apiKey) {
      if (ind) { ind.textContent = tr('status.browserKey'); ind.className = 'status-indicator'; }
      if (summ) { summ.textContent = tr('summ.browserKey'); summ.className = 'api-summary-status'; }
    } else {
      if (ind) { ind.textContent = tr('status.free'); ind.className = 'status-indicator warn'; }
      if (summ) { summ.textContent = tr('summ.free'); summ.className = 'api-summary-status'; }
    }
  }

  function syncProviderChip() {
    var base = String(state.cfg.baseUrl || ''), prov = !state.cfg.apiKey ? 'free'
      : window.VMAICore && window.VMAICore.isGemini(base) ? 'gemini' : /groq\.com/.test(base) ? 'groq' : /openrouter\.ai/.test(base) ? 'openrouter' : /api\.openai\.com/.test(base) ? 'openai' : '';
    document.querySelectorAll('.prov-chip').forEach(function (c) { c.classList.toggle('active', c.dataset.prov === prov); });
    var gem = Boolean(state.cfg.apiKey) && prov === 'gemini';
    if (document.body) document.body.classList.toggle('gemini-on', gem);
    var btn = $('btnSideGemini'); if (btn) btn.textContent = tr(gem ? 'side.cardOn' : 'side.cardBtn');
  }

  function aiError(code, message) { var e = new Error(message || code); e.code = code; return e; }

  // Translates up to 40 words through /api/ai (server key or the user's key) or,
  // without a server, directly with the user's key. Returns validated items.
  // opts (optional): { mode: 'grammar', source, target } — the Grammar Lab uses the same route and key handling.
  async function callAI(words, opts) {
    var AI = window.VMAICore, o = opts || {};
    var request = AI.validateRequest({ words: words, source: o.source || state.cfg.source, target: o.target || state.cfg.target, mode: o.mode });

    if (state.serverAvailable) {
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (state.cfg.apiKey) headers['Authorization'] = 'Bearer ' + state.cfg.apiKey;
        var r = await fetch('/api/ai', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(Object.assign({ words: request.words, source: request.source, target: request.target, model: state.cfg.model, baseUrl: state.cfg.baseUrl }, request.mode === 'grammar' ? { mode: 'grammar' } : {})),
          signal: AbortSignal.timeout(45000)
        });
        var j = {};
        try { j = await r.json(); } catch (e) {}
        if (r.ok && Array.isArray(j.items)) return j.items;
        if (r.status === 404 || r.status === 405 || r.status === 501 || j.code === 'no-key') state.serverAvailable = false;
        else throw aiError(j.code || 'provider-unavailable', j.error);
      } catch (e) {
        if (e instanceof TypeError) state.serverAvailable = false;
        else throw e;
      }
    }

    var cfg = state.cfg;
    if (cfg.apiKey) {
      var url = String(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      var res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
          body: JSON.stringify(AI.buildPayload(request, cfg.model || 'gpt-4o-mini', url)),
          signal: AbortSignal.timeout(45000)
        });
      } catch (e) { throw aiError(e && e.name === 'TimeoutError' ? 'provider-timeout' : 'provider-unavailable'); }
      if (!res.ok) throw aiError(res.status === 401 || res.status === 403 ? 'provider-auth' : res.status === 429 ? 'provider-rate-limit' : 'provider-unavailable');
      var data = {};
      try { data = await res.json(); } catch (e) {}
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return AI.parseResponse(content, request); // throws code 'bad-model-response'
    }

    throw aiError('no-key');
  }

  // Chunks that respect the /api/ai limits; over-long phrases go to the free translator.
  function aiChunks(items) {
    var LIM = window.VMAICore.LIMITS, out = [], cur = [], chars = 0;
    items.forEach(function (it) {
      var n = it.original.length;
      if (n > LIM.wordLength) return;
      if (cur.length >= Math.min(CHUNK, LIM.words) || chars + n > LIM.totalChars - 200) { out.push(cur); cur = []; chars = 0; }
      cur.push(it); chars += n;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /* Free translation fallback engine (MyMemory API + Local dictionary) */
  // After two failed requests in a row the free API is treated as down for the
  // rest of the batch, so an outage costs seconds, not a timeout per word.
  var apiFailures = 0;
  async function translateSingleFree(word, targetCode, sourceCode) {
    var source = sourceCode || state.cfg.source;
    var lower = word.toLowerCase().trim();
    var cached = readTranslationCache(lower, source, targetCode);
    if (cached) return cached;
    if (targetCode === 'ru' && source === 'en' && BUILTIN_DICT[lower]) {
      return BUILTIN_DICT[lower];
    }
    if (targetCode === 'en' && source === 'ru' && BUILTIN_DICT[lower]) {
      return BUILTIN_DICT[lower];
    }

    var isCyrillic = /[а-яё]/i.test(word);
    var srcCode = source || (isCyrillic ? 'ru' : 'en');
    var tgtCode = targetCode || (isCyrillic ? 'en' : 'ru');
    if (srcCode === tgtCode) {
      tgtCode = isCyrillic ? 'en' : 'ru';
    }

    var pairsToTry = [srcCode + '|' + tgtCode, 'autodetect|' + tgtCode];

    for (var i = 0; i < pairsToTry.length; i++) {
      if (apiFailures >= 2) break;
      try {
        var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=' + pairsToTry[i];
        var res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        apiFailures = res.ok ? 0 : apiFailures + 1;
        if (res.ok) {
          var json = await res.json();
          if (json) {
            var candidates = [];
            if (json.responseData && json.responseData.translatedText) {
              candidates.push({ text: json.responseData.translatedText.trim(), quality: Number(json.responseData.match || 0) * 100 });
            }
            if (Array.isArray(json.matches)) {
              json.matches.forEach(function (m) {
                if (m && m.translation) candidates.push({ text: m.translation.trim(), quality: Number(m.quality || 0) });
              });
            }
            candidates.sort(function (a, b) { return b.quality - a.quality; });

            for (var c = 0; c < candidates.length; c++) {
              var t = candidates[c].text;
              if (!t) continue;
              if (t.toLowerCase() === lower) continue;
              if (/PLEASE SELECT TWO|MYMEMORY WARNING|NO QUERY SPECIFIED|HTML tags/i.test(t)) continue;
              writeTranslationCache(lower, srcCode, tgtCode, t);
              return t;
            }
          }
        }
      } catch (e) { apiFailures++; }
    }
    return '—';
  }

  async function translateBatchFree(items, targetCode) {
    var out = [];
    var total = items.length;
    for (var i = 0; i < total; i++) {
      if (state.cancelled) return null;
      var item = items[i];
      setLoad(
        Math.round(((i + 1) / total) * 100),
        tr('load.free', { i: i + 1, n: total }),
        tr('load.card', { w: item.original })
      );
      var translated = await translateSingleFree(item.original, targetCode);
      out.push({
        original: item.original,
        translation: translated,
        hint: tr('hint.assoc', { w: item.original })
      });
      // Small pause to be gentle on free API
      if (i < total - 1) await new Promise(function (r) { setTimeout(r, 70); });
    }
    return out;
  }

  function setLoad(pct, step, count) {
    $('loadBar').style.width = Math.max(4, Math.min(100, pct)) + '%';
    if (step) $('loadStep').textContent = step;
    $('loadCount').textContent = count || '';
  }

  // Uzbek side only: Cyrillic → Latin and canonical oʻ / gʻ. The other side (e.g. Russian) is never touched.
  function normalizeUzCards(cards, source, target) {
    (cards || []).forEach(function (c) {
      if (source === 'uz' && c.original) c.original = LANGUAGES.normalizeUz(c.original);
      if (target === 'uz' && c.translation && c.translation !== '—') c.translation = LANGUAGES.normalizeUz(c.translation);
    });
    return cards;
  }

  async function buildCards(parsedItems) {
    var readyCards = [];
    var needTranslation = [];

    parsedItems.forEach(function (it) {
      if (it.pretranslated) readyCards.push(it);
      else needTranslation.push(it);
    });

    if (!needTranslation.length) {
      setLoad(100, tr('load.allPaired'), tr('load.ready', { n: readyCards.length }));
      await new Promise(function (r) { setTimeout(r, 200); });
      return readyCards;
    }

    // Try AI first if key exists
    var aiFailed = false;
    var canTryAI = state.serverHasKey || Boolean(state.cfg.apiKey);
    if (canTryAI) {
      try {
        var parts = aiChunks(needTranslation);
        var aiCards = [];
        var aiWords = Object.create(null);
        parts.forEach(function (part) { part.forEach(function (it) { aiWords[it.original] = true; }); });
        for (var i = 0; i < parts.length; i++) {
          if (state.cancelled) return null;
          setLoad(
            Math.round((i / parts.length) * 90) + 5,
            parts.length > 1 ? tr('load.aiPart', { i: i + 1, n: parts.length }) : tr('load.aiOne'),
            tr('load.processed', { a: aiCards.length, b: needTranslation.length })
          );

          var parsed = await callAI(parts[i].map(function (it) { return it.original; }));
          if (parsed && parsed.length > 0) {
            // Use AI filtered and translated items directly
            for (var pIdx = 0; pIdx < parsed.length; pIdx++) {
              var pItem = parsed[pIdx];
              var translated = pItem.translation;
              if (!translated || translated === '—') {
                translated = await translateSingleFree(pItem.original, state.cfg.target);
              }
              aiCards.push({
                original: pItem.original,
                translation: translated || '—',
                hint: pItem.hint || '', definition: pItem.definition || '', examples: pItem.examples || []
              });
              if (pItem.reading) aiCards[aiCards.length - 1].reading = pItem.reading;
            }
          } else {
            // Fallback for this chunk if AI returned empty
            for (var sIdx = 0; sIdx < parts[i].length; sIdx++) {
              var src = parts[i][sIdx];
              var freeTr = await translateSingleFree(src.original, state.cfg.target);
              aiCards.push({ original: src.original, translation: freeTr, hint: '' });
            }
          }
        }
        // Phrases too long for the AI request still get a free translation.
        for (var lIdx = 0; lIdx < needTranslation.length; lIdx++) {
          if (aiWords[needTranslation[lIdx].original]) continue;
          aiCards.push({ original: needTranslation[lIdx].original, translation: await translateSingleFree(needTranslation[lIdx].original, state.cfg.target), hint: '' });
        }
        return readyCards.concat(aiCards);
      } catch (err) {
        if (err.message !== 'no-key' && err.code !== 'no-key') {
          aiFailed = err.code || true;
          console.warn('AI call failed, falling back to free translator:', err);
        }
      }
    }

    // Fallback: Free translation
    var reason = typeof aiFailed === 'string' ? tr('aiErr.' + aiFailed) : '';
    if (reason === 'aiErr.' + aiFailed) reason = '';
    toast(aiFailed ? tr('toast.aiFailed') + (reason ? ' ' + reason : '') : tr('toast.freeTr'), aiFailed ? 'err' : 'ok', aiFailed ? 6000 : 4000);
    var freeCards = await translateBatchFree(needTranslation, state.cfg.target);
    if (!freeCards) return null;
    return readyCards.concat(freeCards);
  }

  /* ---------------- demo ---------------- */

  var DEMO = [
    ['serendipity', 'счастливая случайность', 'нежданная удачная находка'],
    ['to remember', 'помнить', 're + member — «собрать в памяти»'],
    ['journey', 'путешествие', 'long trip, путь вперёд'],
    ['brave', 'храбрый', 'смелый перед опасностью'],
    ['quiet', 'тихий', 'полная тишина'],
    ['to achieve', 'достигать', 'цель + усилие = результат'],
    ['weather', 'погода', 'солнце, дождь, ветер'],
    ['to borrow', 'одалживать', 'взять взаймы и вернуть'],
    ['narrow', 'узкий', 'мало места по бокам'],
    ['to explain', 'объяснять', 'сделать кристально понятным'],
    ['resilience', 'стрессоустойчивость', 'умение держать удар и восстанавливаться'],
    ['to waste', 'тратить впустую', 'время или деньги на ветер'],
    ['deep', 'глубокий', 'дно океана или глубокая мысль'],
    ['to notice', 'замечать', 'взгляд зацепился за деталь']
  ];

  function demoCards() {
    return DEMO.map(function (d) { return { original: d[0], translation: d[1], hint: d[2] }; });
  }

  /* ---------------- training ---------------- */

  var nextCardTimer = null;

  function startTraining(cards, resume) {
    if (!cards || !cards.length) { toast(tr('toast.noWords'), 'err'); return; }

    state.cancelled = false;
    clearTimeout(nextCardTimer);
    nextCardTimer = null;

    state.cards = cards.map(function (c, i) {
      return Object.assign({}, c, { id: i, hint: c.hint || '', streak: c.streak || 0, fails: c.fails || 0 });
    });
    state.roundQueue = shuffle(state.cards.map(function (c) { return c.id; }));
    state.roundTotal = state.cards.length;
    state.current = null;
    state.previewId = null; state.previewSide = null; state.nextRoundQueue = null;
    state.revealed = false;
    state.round = resume ? (resume.round || 1) : 1;
    state.known = 0; state.forgot = 0; state.answers = 0;
    state.startedAt = Date.now(); state.elapsed = 0;
    combo = 0; undoSnap = null;
    answerLocked = false; summaryRecorded = false;
    if (L) { enrichLocalContext(state.cards); archiveCards(); }

    try {
      window.history.pushState({ screen: 'train' }, '');
    } catch (e) {}

    show('screen-train');
    $('topPill').hidden = false;
    $('topPill').textContent = trn('pill.cards', state.cards.length);
    nextCard(true);
    startTimer();
    saveSession();
    updateUndo();
    if (isListen() && (!state.soundEnabled || !('speechSynthesis' in window))) toast(tr('listen.noSound'), 'err', 4000);
    else if (isListen() && !canSpeak(state.cfg.source)) toast(speakUnavailableText(state.cfg.source), 'err', 5000);
    else if (!resume) toast(trn('toast.deckReady', state.cards.length), 'ok');
  }

  function nextCard(first) {
    if (state.cancelled || !state.cards || !state.cards.length) return;
    var trainScreen = $('screen-train');
    if (trainScreen && !trainScreen.classList.contains('active')) return;

    if (!state.roundQueue.length) {
      state.round++;
      // В новом раунде забытые/сложные слова идут первыми
      var sorted = state.cards.slice().sort(function (a, b) {
        return (b.fails - a.fails) || (Math.random() - 0.5);
      });
      state.roundQueue = state.nextRoundQueue || sorted.map(function (c) { return c.id; });
      state.nextRoundQueue = null;
      state.roundTotal = state.cards.length;
      toast(tr('toast.round', { n: state.round }), 'ok', 2600);
      playSuccessSound();
    }

    state.current = state.cards[state.roundQueue.shift()];
    state.revealed = false;
    answerLocked = false;

    if (isListen()) state.curSide = 'fwd';
    else if (state.cfg.dir === 'mixed') state.curSide = state.previewId === state.current.id && state.previewSide ? state.previewSide : (Math.random() < 0.5 ? 'fwd' : 'rev');
    else state.curSide = state.cfg.dir;

    renderCard();
    if (!first && !window.VMMotion) {
      var card = $('card');
      card.classList.remove('pop');
      void card.offsetWidth;
      card.classList.add('pop');
    }
    renderStats();
  }

  function renderCard() {
    var c = state.current;
    if (!c) return;
    var fwd = state.curSide === 'fwd';
    if (L) pendingTypedAnswer = null;
    state.hintLevel = 0;
    var target = langByCode(state.cfg.target);

    $('cardWord').textContent = fwd ? c.original : c.translation;
    $('cardTrans').textContent = fwd ? c.translation : c.original;
    // Pinyin (or another reading) sits under the word in the learning language, only when the card has one.
    setReading('cardReading', fwd && !isListen() ? c.reading : '');
    setReading('cardReadingBack', !fwd || isListen() ? c.reading : '');
    $('cardSub').textContent = tr(fwd ? 'card.subFwd' : 'card.subRev');
    $('cardHint').textContent = state.cfg.simple ? '' : (c.hint || '');
    if (L) {
      renderCardContext(c);
      $('sessionLanguage').textContent = langByCode(state.cfg.source).label + ' → ' + target.label;
      $('typedAnswer').value = '';
      $('answerFeedback').hidden = true;
    }
    $('cardBadge').textContent = fwd ? tr('card.original') : target.label;
    $('cardBadgeBack').textContent = fwd ? target.label : tr('card.original');
    if (isListen()) {
      $('cardWord').textContent = '🎧';
      $('cardTrans').textContent = c.original;
      $('cardSub').textContent = tr('listen.sub');
      $('cardHint').textContent = c.translation;
      $('cardBadge').textContent = tr('listen.badge');
      $('cardBadgeBack').textContent = tr('card.original');
      setTimeout(function () { if (state.current === c && !state.revealed) speakText(c.original, state.cfg.source); }, 380);
    }
    if (L) $('typedAnswer').placeholder = tr(isListen() ? 'listen.ph' : 'typing.ph');
    // Each face declares its language so long words hyphenate correctly instead of breaking anywhere.
    $('cardWord').lang = isListen() ? '' : (fwd ? state.cfg.source : state.cfg.target);
    $('cardTrans').lang = isListen() || !fwd ? state.cfg.source : state.cfg.target;
    if (L) { cardElLabel(); announce(''); }
    updateSpeakButtons();

    var cardEl = $('card');
    cardEl.classList.remove('flipped');
    cardEl.classList.remove('exit-ok', 'exit-no', 'pop');
    if (cardEl.style) cardEl.style.transform = ''; /* сброс наклона за курсором */
    updateRows();
    if (window.VMMotion) { cardEl.dataset.revealed = 'false'; cardEl.dataset.swipe = String(state.cfg.mode === 'flashcard'); updateNextPreview(); window.VMMotion.card(); }
  }

  // Definition, then each example with its own speaker button (examples are in the learning language).
  var SPEAK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  function renderCardContext(c) {
    var box = $('cardContext');
    if (!box) return;
    box.textContent = '';
    if (state.cfg.simple) return;
    if (c.definition) box.appendChild(h('span', { className: 'context-def', text: c.definition }));
    (c.examples || []).filter(Boolean).forEach(function (ex) {
      var line = h('span', { className: 'context-example' });
      line.lang = state.cfg.source;
      var b = h('button', { className: 'speak-btn speak-mini', type: 'button' });
      b.innerHTML = SPEAK_ICON;
      b.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); speakText(ex, state.cfg.source, b); });
      line.appendChild(h('span', { text: ex }));
      line.appendChild(b);
      box.appendChild(line);
    });
  }

  function setReading(id, text) {
    var el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    if (text) el.lang = state.cfg.source;
  }

  function updateNextPreview() {
    if (!window.VMMotion || !state.cards.length) return;
    var queue = state.roundQueue;
    if (!queue.length) {
      if (!state.nextRoundQueue) state.nextRoundQueue = state.cards.slice().sort(function (a,b) { return (b.fails-a.fails) || (Math.random()-.5); }).map(function (c) { return c.id; });
      queue = state.nextRoundQueue;
    } else state.nextRoundQueue = null;
    var id = queue[0], c = state.cards[id];
    if (!c) return;
    if (id !== state.previewId || !state.previewSide || state.cfg.dir !== 'mixed') state.previewSide = state.cfg.dir === 'mixed' ? (Math.random()<.5 ? 'fwd':'rev') : state.cfg.dir;
    state.previewId = id;
    var fwd = state.previewSide === 'fwd';
    $('nextCardWord').textContent = fwd ? c.original : c.translation;
    $('nextCardBadge').textContent = fwd ? tr('card.original') : langByCode(state.cfg.target).label;
    $('nextCardSub').textContent = tr(fwd ? 'card.subFwd' : 'card.subRev');
    if (isListen()) { $('nextCardWord').textContent = '🎧'; $('nextCardBadge').textContent = tr('listen.badge'); $('nextCardSub').textContent = tr('listen.sub'); }
  }

  function announce(text) { var el = $('srStatus'); if (el) el.textContent = text; }
  function cardElLabel() {
    var c = state.current, card = $('card');
    if (!c || !card.setAttribute) return;
    card.setAttribute('aria-label', state.revealed ? tr('a11y.cardBack', { w: $('cardWord').textContent, a: $('cardTrans').textContent }) : isListen() ? tr('a11y.cardListen') : tr('a11y.cardFront', { w: $('cardWord').textContent }));
  }
  function isListen() { return !!L && state.cfg.mode === 'listen'; }
  function isTyping() { return !!L && (state.cfg.mode === 'typing' || state.cfg.mode === 'listen'); }
  function expectedAnswer() {
    var c = state.current;
    return isListen() || state.curSide !== 'fwd' ? c.original : c.translation;
  }

  function updateRows() {
    var rowH = $('rowHidden');
    var rowS = $('rowShown');
    if (rowH) {
      rowH.hidden = state.revealed;
      rowH.style.display = state.revealed ? 'none' : '';
    }
    if (rowS) {
      rowS.hidden = !state.revealed;
      rowS.style.display = !state.revealed ? 'none' : '';
    }
    if (isTyping()) {
      rowH.hidden = true; rowS.hidden = true;
      $('typingForm').hidden = state.revealed;
      if (!state.revealed) setTimeout(function () { if ($('screen-train').classList.contains('active')) $('typedAnswer').focus(); }, 200);
    } else if (L) $('typingForm').hidden = true;
  }

  function reveal() {
    if (state.revealed || !state.current || answerLocked) return;
    state.revealed = true;
    $('card').classList.add('flipped');
    if (window.VMMotion) $('card').dataset.revealed = 'true';
    if (window.VMMotion) window.VMMotion.flip();
    playFlipSound();
    updateRows();
    if (L) { cardElLabel(); announce(tr('a11y.revealed', { a: $('cardTrans').textContent })); }
    if (isTyping()) {
      pendingTypedAnswer = false;
      showAnswerFeedback(tr('feedback.answer', { a: $('cardTrans').textContent }), true);
    }
  }

  // S and the toolbar button: read whichever side is showing, with the same feedback as the card buttons.
  function speakCurrent() {
    if (!state.current) return;
    if (isListen()) { speakText(state.current.original, state.cfg.source, $('btnSpeakFront')); return; }
    var fwd = state.curSide === 'fwd';
    if (!state.revealed) {
      speakText(fwd ? state.current.original : state.current.translation, fwd ? state.cfg.source : state.cfg.target, $('btnSpeakFront'));
    } else {
      speakText(fwd ? state.current.translation : state.current.original, fwd ? state.cfg.target : state.cfg.source, $('btnSpeakBack'));
    }
  }

  /* Искры при верном ответе — лёгкий акцент без оверкилла */
  function burstSparkles() {
    try {
      var card = $('card');
      if (!card || typeof document.createElement !== 'function') return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var count = 10;
      for (var i = 0; i < count; i++) {
        var s = document.createElement('span');
        s.className = 'sparkle';
        if (s.style && typeof s.style.setProperty === 'function') {
          var a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
          var dist = 70 + Math.random() * 70;
          s.style.setProperty('--tx', (Math.cos(a) * dist).toFixed(1) + 'px');
          s.style.setProperty('--ty', (Math.sin(a) * dist * 0.8).toFixed(1) + 'px');
        }
        card.appendChild(s);
        (function (el) {
          setTimeout(function () { if (el && typeof el.remove === 'function') el.remove(); }, 820);
        })(s);
      }
    } catch (e) {}
  }

  /* Короткая вспышка на карточке: бирюзовая при «знал», розовая при «забыл» */
  function flashCard(cls) {
    try {
      var card = $('card');
      if (!card || !card.classList) return;
      card.classList.remove('flash-ok', 'flash-no');
      if (card.offsetWidth !== undefined) void card.offsetWidth; /* перезапуск анимации */
      card.classList.add(cls);
      setTimeout(function () {
        try { card.classList.remove(cls); } catch (e) {}
      }, 640);
    } catch (e) {}
  }

  /* Плашка, парящая над карточкой: «+1», «🔥 серия ×N» или «вернётся в цикл» */
  var combo = 0;

  function floatLabel(text, kind) {
    try {
      var card = $('card');
      if (!card || typeof document.createElement !== 'function') return;
      var el = document.createElement('span');
      el.className = 'float-label ' + kind;
      el.textContent = text;
      card.appendChild(el);
      setTimeout(function () { if (el && typeof el.remove === 'function') el.remove(); }, 960);
    } catch (e) {}
  }

  /* Кинематографичный выход карточки перед появлением следующей */
  function exitCard(cls) {
    try {
      var card = $('card');
      if (!card || !card.classList) return;
      card.classList.remove('exit-ok', 'exit-no');
      if (card.offsetWidth !== undefined) void card.offsetWidth; /* перезапуск анимации */
      card.classList.add(cls);
    } catch (e) {}
  }

  /* Confetti-финал для сильной сессии */
  function burstConfetti(n) {
    try {
      var summ = $('summary');
      if (!summ || typeof document.createElement !== 'function') return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var colors = ['#ffc46b', '#ff8a72', '#a78bfa', '#5ee6a8', '#7dd3fc', '#f4f1ea'];
      var count = n || 46;
      for (var i = 0; i < count; i++) {
        var s = document.createElement('span');
        s.className = 'confetti';
        if (s.style && typeof s.style.setProperty === 'function') {
          s.style.setProperty('--l', (3 + Math.random() * 94).toFixed(1) + '%');
          s.style.setProperty('--cx', ((Math.random() - 0.5) * 280).toFixed(0) + 'px');
          s.style.setProperty('--cr', (360 + Math.random() * 720).toFixed(0) + 'deg');
          s.style.setProperty('--dl', (Math.random() * 0.75).toFixed(2) + 's');
          s.style.setProperty('--c', colors[i % colors.length]);
        }
        summ.appendChild(s);
        (function (el) {
          setTimeout(function () { if (el && typeof el.remove === 'function') el.remove(); }, 3800);
        })(s);
      }
    } catch (e) {}
  }

  /* Числа в сводке «набегают» счётчиком */
  function countUpGrid() {
    try {
      var grid = $('summaryGrid');
      if (!grid || typeof grid.querySelectorAll !== 'function') return;
      var cells = grid.querySelectorAll('b');
      if (!cells || !cells.length) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      Array.prototype.forEach.call(cells, function (b) {
        var target = parseInt(b.textContent, 10);
        if (isNaN(target) || target <= 0) return; /* время («0:45») не трогаем */
        b.textContent = '0';
        var start = Date.now(), dur = 780;
        var step = function () {
          var p = Math.min(1, (Date.now() - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          b.textContent = String(Math.round(target * eased));
          if (p < 1) setTimeout(step, 16);
        };
        step();
      });
    } catch (e) {}
  }

  /* Короткая подсветка клавиши в подсказках при нажатии */
  function pulseHint(idx) {
    try {
      var keys = document.querySelectorAll('.hint-keys kbd');
      if (!keys || !keys[idx]) return;
      var kb = keys[idx];
      kb.classList.remove('pulse');
      if (kb.offsetWidth !== undefined) void kb.offsetWidth;
      kb.classList.add('pulse');
      setTimeout(function () { try { kb.classList.remove('pulse'); } catch (e) {} }, 460);
    } catch (e) {}
  }

  var answerLocked = false, summaryRecorded = false;
  // rating: 'again' | 'hard' | 'good' | 'easy' (SM-2); defaults from knew.
  function answer(knew, rating) {
    var c = state.current;
    if (!c || answerLocked) return;
    // Even self-assessment must show the correct answer before advancing.
    if (L && !state.revealed) {
      reveal();
      showAnswerFeedback(tr('feedback.answer', { a: $('cardTrans').textContent }), false);
      return;
    }
    answerLocked = true;
    undoSnap = { card: c, fields: { streak: c.streak, fails: c.fails, box: c.box, due: c.due, ease: c.ease, interval: c.interval, reps: c.reps, lapses: c.lapses }, queue: state.roundQueue.slice(), side: state.curSide,
      known: state.known, forgot: state.forgot, answers: state.answers, combo: combo, round: state.round, roundTotal: state.roundTotal,
      nextRoundQueue: state.nextRoundQueue ? state.nextRoundQueue.slice() : null, day: L ? L.day() : null, knew: knew };

    state.answers++;
    if (knew) {
      combo++;
      state.known++;
      c.streak++;
      playSuccessSound();
      if (!window.VMMotion) {
        burstSparkles(); flashCard('flash-ok'); exitCard('exit-ok');
        floatLabel(combo >= 3 ? tr('float.combo', { n: combo }) : '+1', 'ok');
      }
      // Карточка успешно закреплена в этом раунде
    } else {
      combo = 0;
      state.forgot++;
      c.streak = 0;
      c.fails++;
      playForgotSound();
      if (!window.VMMotion) { flashCard('flash-no'); exitCard('exit-no'); floatLabel(tr('float.back'), 'no'); }
      // Повторяем забытое слово через 2-3 карточки в текущем раунде
      var insertPos = Math.min(state.roundQueue.length, 3);
      state.roundQueue.splice(insertPos, 0, c.id);
    }

    if (L) {
      L.schedule(c, knew ? (rating === 'hard' || rating === 'easy' ? rating : 'good') : 'again');
      recordAnswer(knew); archiveCards(); saveSession();
    }
    state.revealed = false;
    // Keep the answer side visible throughout the departure. Reset only after
    // the card has left; otherwise the flip is cut off by the old 180ms timer.
    if (!window.VMMotion) $('card').classList.remove('flipped');
    if (window.VMMotion) updateNextPreview();
    var departureMs = window.VMMotion ? window.VMMotion.depart(knew) : 180;
    clearTimeout(nextCardTimer);
    nextCardTimer = setTimeout(function () {
      nextCardTimer = null;
      nextCard(false);
    }, departureMs);
    renderStats();
    updateUndo();
  }

  var undoSnap = null;
  function updateUndo() { var b = $('btnUndo'); if (b) b.disabled = !undoSnap; }
  function undoAnswer() {
    var s = undoSnap;
    if (!s || !L || !$('screen-train').classList.contains('active')) return;
    clearTimeout(nextCardTimer); nextCardTimer = null;
    Object.assign(s.card, s.fields);
    state.roundQueue = s.queue; state.nextRoundQueue = s.nextRoundQueue; state.round = s.round; state.roundTotal = s.roundTotal;
    state.known = s.known; state.forgot = s.forgot; state.answers = s.answers; combo = s.combo;
    state.current = s.card; state.curSide = s.side; state.revealed = false; answerLocked = false;
    var h = library.history[s.day];
    if (h) { h.answers = Math.max(0, h.answers - 1); if (s.knew) h.correct = Math.max(0, h.correct - 1); }
    undoSnap = null;
    archiveCards(); saveSession(); persistLibrary(); renderDaily();
    renderCard(); renderStats(); updateUndo();
    toast(tr('toast.undone'), 'ok', 1400);
  }

  var lastStats = {};

  /* Обновление ячейки статистики: значение меняется, ячейка коротко «подскакивает» */
  function setStat(id, val) {
    var el = $(id);
    if (!el) return;
    var s = String(val);
    if (el.textContent !== s) el.textContent = s;
    if (lastStats[id] !== undefined && lastStats[id] !== s && el.classList) {
      var host = el.parentNode || el;
      if (host.classList) {
        host.classList.remove('bump');
        if (host.offsetWidth !== undefined) void host.offsetWidth; /* перезапуск анимации */
        host.classList.add('bump');
      }
    }
    lastStats[id] = s;
  }

  function renderStats() {
    setStat('stRound', state.round);
    setStat('stKnown', state.known);
    setStat('stForgot', state.forgot);
    setStat('stAcc', state.answers ? Math.round((state.known / state.answers) * 100) + '%' : '—');
    setStat('stLeft', state.roundQueue.length + (state.current ? 1 : 0));

    /* Прогресс-бар раунда: сколько карточек уже закрыто в этом круге */
    var rb = $('roundBar');
    if (rb && rb.style) {
      var left = state.roundQueue.length + (state.current ? 1 : 0);
      var done = Math.max(0, state.roundTotal - left);
      rb.style.width = (state.roundTotal ? Math.round((done / state.roundTotal) * 100) : 0) + '%';
    }
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startTimer() {
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      if ($('summary').hidden === false) return;
      if (!$('screen-train').classList.contains('active')) return;
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      $('stTime').textContent = fmtTime(state.elapsed);
    }, 1000);
  }

  /* ---------------- summary ---------------- */

  /* Плавная заливка кольца точности: --acc от 0 до итогового значения */
  function animateAccuracy(to) {
    var ring = $('sumRing');
    var accEl = $('sumAcc');
    var canSet = ring && ring.style && typeof ring.style.setProperty === 'function';
    if (!canSet && !accEl) return;

    var reduced = false;
    try { reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    var dur = reduced ? 0 : 850;
    var start = Date.now();

    var step = function () {
      var p = dur ? Math.min(1, (Date.now() - start) / dur) : 1;
      var eased = 1 - Math.pow(1 - p, 3);
      var v = Math.round(to * eased);
      if (canSet) ring.style.setProperty('--acc', v + '%');
      if (accEl) accEl.textContent = v + '%';
      if (p < 1) { setTimeout(step, 16); return; }
      /* кольцо «довольно» — короткий пульс по завершении заливки */
      try {
        if (ring && ring.classList) {
          ring.classList.add('done');
          setTimeout(function () { try { ring.classList.remove('done'); } catch (e) {} }, 950);
        }
      } catch (e) {}
    };
    step();
  }

  function showSummary() {
    if (nextCardTimer) {
      clearTimeout(nextCardTimer);
      nextCardTimer = null;
      nextCard(false);
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    if (L && state.answers > 0 && !summaryRecorded) { L.complete(library.streak, L.day()); summaryRecorded = true; persistLibrary(); renderDaily(); }
    var acc = state.answers ? Math.round((state.known / state.answers) * 100) : 0;
    var mastered = state.cards.filter(function (c) { return c.streak >= 2 && c.fails === 0; }).length;

    /* Кольцо точности заливается счётчиком */
    animateAccuracy(acc);

    $('summaryGrid').innerHTML =
      '<div><b>' + state.cards.length + '</b><span data-i18n="st.cards">' + tr('st.cards') + '</span></div>' +
      '<div><b>' + state.answers + '</b><span data-i18n="st.answers">' + tr('st.answers') + '</span></div>' +
      '<div><b>' + state.known + '</b><span data-i18n="st.known">' + tr('st.known') + '</span></div>' +
      '<div><b>' + state.forgot + '</b><span data-i18n="st.forgot">' + tr('st.forgot') + '</span></div>' +
      '<div><b>' + state.round + '</b><span data-i18n="st.round">' + tr('st.round') + '</span></div>' +
      '<div><b>' + fmtTime(state.elapsed) + '</b><span data-i18n="st.time">' + tr('st.time') + '</span></div>';

    var msg;
    state.summaryMsg = !state.answers ? ['sum.msg0'] : acc >= 90 && mastered ? ['sum.msg90', mastered] : acc >= 90 ? ['sum.msgClean'] : acc >= 65 ? ['sum.msg65'] : ['sum.msgLow'];
    msg = summaryMessage();
    $('summaryMsg').textContent = msg;

    /* Кинематографичный финал: confetti для уверенной сессии */
    if (!window.VMMotion && state.answers >= 5 && acc >= 60) burstConfetti(acc >= 85 ? 70 : 46);
    countUpGrid();

    var summ = $('summary');
    if (summ) {
      summ.hidden = false;
      summ.style.display = '';
      if (window.VMMotion) window.VMMotion.summary(state.answers > 0);
    }
  }

  function summaryMessage() {
    var m = state.summaryMsg || ['sum.msg0'];
    return m.length > 1 ? trn(m[0], m[1]) : tr(m[0]);
  }

  function hideSummary() {
    if (window.VMMotion) window.VMMotion.stop('summaryMotion');
    var summ = $('summary');
    if (summ) {
      summ.hidden = true;
      summ.style.display = 'none';
    }
    state.startedAt = Date.now() - state.elapsed * 1000;
  }

  function startNewSet() {
    // 1. Остановка таймеров тренировки и перехода к следующей карточке
    clearInterval(state.timer);
    state.timer = null;
    clearTimeout(nextCardTimer);
    nextCardTimer = null;

    // 2. Закрытие оверлея сводки
    var summ = $('summary');
    if (summ) {
      summ.hidden = true;
      summ.style.display = 'none';
    }

    // 3. Сброс runtime состояния тренировки
    state.cards = [];
    state.roundQueue = [];
    state.roundTotal = 0;
    state.current = null;
    state.revealed = false;
    state.round = 1;
    state.known = 0;
    state.forgot = 0;
    state.answers = 0;
    state.startedAt = 0;
    state.elapsed = 0;
    state.cancelled = true;
    undoSnap = null;

    // 4. Остановка озвучки речи при смене набора
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    // 5. Сброс UI индикаторов и карточек тренировки
    var topPill = $('topPill');
    if (topPill) {
      topPill.hidden = true;
      topPill.textContent = '';
    }
    var card = $('card');
    if (card) {
      card.classList.remove('flipped', 'pop');
    }
    updateRows();
    if ($('cardWord')) $('cardWord').textContent = '—';
    if ($('cardTrans')) $('cardTrans').textContent = '—';
    if ($('cardHint')) $('cardHint').textContent = '';
    if ($('stRound')) $('stRound').textContent = '1';
    if ($('stKnown')) $('stKnown').textContent = '0';
    if ($('stForgot')) $('stForgot').textContent = '0';
    if ($('stAcc')) $('stAcc').textContent = '—';
    if ($('stTime')) $('stTime').textContent = '0:00';
    if ($('stLeft')) $('stLeft').textContent = '0';

    // 6. Очистка сохранённой сессии (так как пользователь начал новый набор)
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    if ($('resumeBox')) $('resumeBox').hidden = true;

    // 7. Переход на экран настройки
    show('screen-setup');

    // 8. Сброс истории браузера при необходимости
    try {
      if (window.history.state && window.history.state.screen === 'train') {
        window.history.replaceState({ screen: 'setup' }, '');
      }
    } catch (e) {}

    // 9. Фокус и выделение поля ввода для удобного ввода новых слов (кросс-браузерно для десктопа и мобильных)
    var input = $('input');
    if (input) {
      input.focus();
      try {
        if (typeof input.setSelectionRange === 'function') {
          input.setSelectionRange(0, input.value.length);
        } else {
          input.select();
        }
      } catch (e) {
        try { input.select(); } catch (e2) {}
      }
    }
    updateInputStat(true);

    toast(tr('toast.newSet'), 'ok', 2200);
  }

  function statsText() {
    var acc = state.answers ? Math.round((state.known / state.answers) * 100) : 0;
    return tr('sum.stats', { c: state.cards.length, a: state.answers, p: acc, r: state.round, t: fmtTime(state.elapsed) });
  }

  /* ---------------- pipeline ---------------- */

  async function start() {
    if (L && state.cfg.source === state.cfg.target) { toast(tr('toast.diffLangs'), 'err'); return; }
    // An archived pair can still grow an existing deck, but never start a new one.
    if (L && LANGUAGES.isArchivedPair(state.cfg.source, state.cfg.target) && !library.decks[activeDeckKey()]) { toast(tr('lang.archivedNew'), 'err', 5000); return; }
    var raw = $('input').value;
    var parsed = parseInput(raw);
    if (!parsed.items.length) {
      toast(tr('toast.pasteWords'), 'err');
      $('input').focus();
      return;
    }

    state.cancelled = false;
    apiFailures = 0;
    show('screen-loading');
    $('loadTitle').textContent = tr('load.processing');
    setLoad(8, tr('load.analyzing'), tr('load.selected', { n: parsed.items.length }) + (parsed.dropped ? tr('load.droppedN', { n: parsed.dropped }) : ''));

    try {
      var cards = await buildCards(parsed.items);
      if (state.cancelled) { show('screen-setup'); return; }
      if (!cards || !cards.length) throw new Error(tr('err.noCards'));
      normalizeUzCards(cards, state.cfg.source, state.cfg.target);
      var ready = cards.filter(function (c) { return c.translation && c.translation !== '—'; });
      var missing = cards.filter(function (c) { return ready.indexOf(c) < 0; });
      // Untranslated words go to the library and are retried when the network is back.
      if (L && missing.length) saveUntranslated(missing);
      if (L) clearDraft();
      if (L && !ready.length) {
        show('screen-setup');
        toast(tr(navigator.onLine === false ? 'toast.allOffline' : 'toast.allFailed'), 'err', 8000);
        return;
      }
      setLoad(100, tr('load.done'), tr('load.cards', { n: ready.length }));
      await new Promise(function (r) { setTimeout(r, 350); });
      startTraining(L ? ready : cards);
      if (L && missing.length) toast(trn('toast.someMissing', missing.length), 'err', 6000);
      if (L) autoGrammar();
    } catch (e) {
      show('screen-setup');
      toast(e.message || tr('err.generic'), 'err', 5000);
      $('apiBox').open = true;
    }
  }

  /* ---------------- Library, daily practice and lexical resource ---------------- */
  var LIBRARY_KEY = 'vocabulary-master.library.v2';
  var library = { decks: {}, history: {}, goal: 10, streak: { count: 0, last: null, freezes: 2, enabled: true } };
  var pendingTypedAnswer = null, lexical = null, games = null, account = null;
  var CONTEXT = {
    serendipity: ['The chance occurrence of a happy discovery.', 'Finding this little bookshop was pure serendipity.'],
    'to remember': ['To keep something in your memory.', 'I try to remember one new word every day.'],
    journey: ['An act of travelling from one place to another.', 'Our journey across the country took three days.'],
    brave: ['Ready to face danger or difficulty.', 'It was brave of her to speak honestly.'],
    quiet: ['Making little or no noise.', 'We found a quiet place to read.'],
    'to achieve': ['To succeed in reaching a goal through effort.', 'Practice helps us achieve our goals.'],
    weather: ['The conditions of the atmosphere at a given time.', 'The weather changed during the afternoon.'],
    'to borrow': ['To take something with permission and return it later.', 'May I borrow your dictionary?'],
    narrow: ['Having a small distance between two sides.', 'A narrow path leads to the garden.'],
    'to explain': ['To make something clear or easy to understand.', 'Can you explain the rule again?'],
    resilience: ['The ability to recover after difficulties.', 'Her resilience helped her overcome the setback.'],
    'to waste': ['To use something carelessly or without purpose.', 'We should not waste clean water.'],
    deep: ['Extending a long way down from the surface.', 'The lake is surprisingly deep.'],
    'to notice': ['To become aware of something.', 'Did you notice the change in her voice?'],
    apple: ['A round fruit with crisp flesh.', 'She put an apple in her bag.'],
    house: ['A building in which people live.', 'Their house stands beside the river.'],
    water: ['A clear liquid essential for life.', 'Please bring a glass of water.'],
    book: ['Written pages bound together.', 'This book changed my perspective.'],
    cat: ['A small domesticated feline.', 'The cat slept beside the window.'],
    dog: ['A domesticated animal often kept as a companion.', 'The dog waited patiently by the door.']
  };
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; });
  }

  // Destructive library actions (replace by import, delete deck, remove word, clear list)
  // are undoable for a few seconds: toast button or U.
  var libraryUndo = null, libraryUndoTimer = null;
  function offerUndo(message, restore) {
    libraryUndo = restore;
    clearTimeout(libraryUndoTimer);
    libraryUndoTimer = setTimeout(function () { libraryUndo = null; }, 10000);
    toast(message, 'ok', 8000, { label: tr('undo.action'), run: runLibraryUndo });
  }
  function runLibraryUndo() {
    var restore = libraryUndo;
    if (!restore) return false;
    libraryUndo = null; clearTimeout(libraryUndoTimer);
    restore();
    toast(tr('undo.done'), 'ok', 2200);
    return true;
  }
  function snapshotLibrary() { return JSON.parse(JSON.stringify(library)); }
  function restoreLibrary(previous) {
    return function () { library = previous; persistLibrary(); renderLibrary(); renderDaily(); };
  }

  function swapLanguages() {
    if (!canSwapPair(state.cfg.source, state.cfg.target)) { toast(tr('lang.swapOff', { l: langByCode(state.cfg.target).label }), 'err'); return; }
    releaseDeck();
    var s = state.cfg.source; state.cfg.source = state.cfg.target; state.cfg.target = s;
    syncLangSelects(); saveCfg();
    var input = $('input'), before = input.value, after = L.swapPairs(before);
    if (after !== before) { input.value = after; updateInputStat(true); }
    var b = $('btnSwapLang'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    toast(langByCode(state.cfg.source).label + ' → ' + langByCode(state.cfg.target).label + (after !== before ? tr('toast.swapPairs') : ''), 'ok', 1800);
  }
  function showHint() {
    var c = state.current;
    if (!c || state.revealed || answerLocked) return;
    state.hintLevel = (state.hintLevel || 0) + 1;
    $('cardSub').textContent = '💡 ' + L.hint(expectedAnswer(), state.hintLevel);
    if (isTyping()) $('typedAnswer').focus();
  }
  function practiceDeck(d, mode) {
    setActiveDeck(keyOf(d));
    var cards = L.pick(d.cards, mode), all = mode === 'all';
    if (mode === 'due' && !cards.length) { cards = L.pick(d.cards, 'all'); all = true; }
    // A capped session takes the most overdue / hardest words, or a random slice of the whole deck.
    if (library.batch && cards.length > library.batch) cards = (all ? shuffle(cards.slice()) : cards).slice(0, library.batch);
    if (!cards.length) { toast(tr(mode === 'hard' ? 'toast.noHard' : 'toast.needTr'), mode === 'hard' ? 'ok' : 'err'); return; }
    startTraining(cards);
  }
  function reverseDeck(d) {
    if (!canSwapPair(d.source, d.target)) { toast(tr('lang.swapOff', { l: langByCode(d.target).label }), 'err'); return; }
    var key = d.name ? Object.keys(library.decks).find(function (k) { var x = library.decks[k]; return x.source === d.target && x.target === d.source && x.name === d.name + ' ⇄'; }) || L.deckKey(d.target, d.source, L.deckId()) : L.deckKey(d.target, d.source);
    var rev = library.decks[key] || { source: d.target, target: d.source, cards: [], created: Date.now() };
    if (d.name) rev.name = d.name + ' ⇄';
    var added = 0;
    L.reverseCards(d.cards).forEach(function (c) {
      if (rev.cards.some(function (x) { return x.original.toLowerCase() === c.original.toLowerCase(); })) return;
      c.added = Date.now(); rev.cards.push(c); added++;
    });
    library.decks[key] = rev; persistLibrary(); renderLibrary();
    toast(added ? tr('toast.reversed', { p: langByCode(rev.source).label + ' → ' + langByCode(rev.target).label, n: trn('words.count', added) }) : tr('toast.reverseSame'), 'ok');
  }
  async function copyDeck(d) {
    var text = d.cards.map(function (c) { return c.original + ' - ' + c.translation; }).join('\n');
    try { await navigator.clipboard.writeText(text); toast(tr('toast.copied'), 'ok'); }
    catch (e) {
      var link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      link.download = d.source + '-' + d.target + '.txt'; link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }
  }
  // Builds DOM nodes; user text always goes through textContent and is never parsed as HTML.
  function h(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = props[k];
      else if (k === 'className') node.className = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function highlighted(tag, text, q) {
    var s = String(text || ''), i = s.toLocaleLowerCase().indexOf(q);
    if (i < 0) return h(tag, { text: s });
    return h(tag, {}, [s.slice(0, i), h('mark', { text: s.slice(i, i + q.length) }), s.slice(i + q.length)]);
  }
  function renderSearch() {
    var box = $('searchResults'), q = $('librarySearch').value.toLocaleLowerCase().trim();
    $('libraryGrid').hidden = !!q; box.hidden = !q;
    box.textContent = '';
    if (!q) return;
    var hits = [];
    Object.keys(library.decks).forEach(function (key) {
      var d = library.decks[key];
      d.cards.forEach(function (c) { if ((c.original + '\n' + c.translation).toLocaleLowerCase().indexOf(q) >= 0) hits.push({ d: d, c: c }); });
    });
    box.appendChild(h('p', { className: 'search-head', text: hits.length ? tr('search.found', { n: hits.length }) : tr('search.none', { q: q }) }));
    hits.slice(0, 100).forEach(function (hit) {
      box.appendChild(h('div', { className: 'saved-word' }, [
        highlighted('strong', hit.c.original, q),
        highlighted('span', hit.c.translation, q),
        h('span', { className: 'deck-kicker', text: langByCode(hit.d.source).label + ' → ' + langByCode(hit.d.target).label + (hit.c.fails ? tr('search.mistakes', { n: hit.c.fails }) : '') })
      ]));
    });
  }
  function renderActivity() {
    var days = L.activity(library.history, 84, L.day());
    var p = days[0].date.split('-').map(Number);
    var pad = (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7; // first column starts on Monday
    var cells = [];
    for (var i = 0; i < pad; i++) cells.push('<i class="pad"></i>');
    days.forEach(function (d) {
      var lvl = !d.answers ? 0 : d.answers >= library.goal ? 4 : Math.min(3, 1 + Math.floor(d.answers * 3 / library.goal));
      cells.push('<i class="l' + lvl + '" title="' + d.date + ': ' + trn('act.answers', d.answers) + '"></i>');
    });
    $('activityMap').innerHTML = cells.join('');
    var active = days.filter(function (d) { return d.answers; }).length;
    var answers = days.reduce(function (n, d) { return n + d.answers; }, 0);
    var words = 0, mastered = 0;
    Object.keys(library.decks).forEach(function (k) { library.decks[k].cards.forEach(function (c) { words++; if (c.streak >= 2) mastered++; }); });
    $('activityStats').textContent = trn('act.days', active) + ' · ' + trn('act.answers', answers) + ' · ' + trn('words.count', words) + ' · ' + tr('act.mastered', { n: mastered });
  }

  function saveUntranslated(cards) {
    var d = targetDeck();
    cards.forEach(function (card) {
      var known = d.cards.some(function (c) { return c.original.toLowerCase() === card.original.toLowerCase(); });
      if (!known) d.cards.push({ original: card.original, translation: '—', hint: '', definition: '', examples: [], streak: 0, fails: 0, added: Date.now() });
    });
    persistLibrary();
  }

  // Words added offline end up as "—"; translate them once the network is back.
  var retrying = false, retried = Object.create(null);
  async function retryMissingTranslations() {
    if (retrying || navigator.onLine === false) return;
    retrying = true; apiFailures = 0;
    var fixed = 0, budget = 30;
    try {
      for (var key in library.decks) {
        var d = library.decks[key];
        for (var i = 0; i < d.cards.length && budget > 0; i++) {
          var c = d.cards[i];
          if ((c.translation && c.translation !== '—') || retried[key + ':' + c.original]) continue;
          retried[key + ':' + c.original] = true; budget--;
          var text = await translateSingleFree(c.original, d.target, d.source);
          if (!text || text === '—') continue;
          c.translation = text; fixed++;
          state.cards.forEach(function (sc) { if (sc.original === c.original && (!sc.translation || sc.translation === '—')) sc.translation = text; });
        }
      }
    } finally { retrying = false; }
    if (!fixed) return;
    persistLibrary();
    if ($('screen-library').classList.contains('active')) renderLibrary();
    toast(trn('toast.retried', fixed), 'ok', 3000);
  }

  /* ---------------- Progress screen: SVG charts drawn from SM-2 data ---------------- */
  var progressDays = 7;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }
  // Day and month names come from the dictionary: Intl often has no Uzbek data and silently falls back to English.
  function parseDay(dateStr) { var p = dateStr.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function dayLabel(dateStr, offset, short) {
    var d = parseDay(dateStr);
    if (offset === 0) return tr('prog.today');
    return short ? String(d.getDate()) : tr('prog.weekdays').split(',')[d.getDay()];
  }
  function longDate(dateStr) {
    var d = parseDay(dateStr);
    return tr('prog.dateFormat', { d: d.getDate(), m: tr('prog.months').split(',')[d.getMonth()] });
  }
  function addDays(dateStr, n) { var p = dateStr.split('-').map(Number); return L.day(new Date(p[0], p[1] - 1, p[2] + n)); }
  // Bar chart (optionally stacked) + a screen-reader table with the same numbers. The SVG is decorative.
  function barChart(host, labels, series, opts) {
    host.textContent = '';
    // One SVG unit = one CSS pixel (viewBox follows the real width), so labels never stretch.
    var n = labels.length, W = Math.max(280, Math.round(host.clientWidth || 600)), H = 170, top = 18, bottom = 24, plotH = H - top - bottom;
    var totals = labels.map(function (_, i) { return series.reduce(function (s, se) { return s + se.values[i]; }, 0); });
    var max = Math.max(1, Math.max.apply(null, totals));
    var slot = W / n, bw = Math.max(3, Math.min(48, slot * 0.66));
    var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' });
    chart.appendChild(svg('line', { x1: 0, x2: W, y1: top + plotH, y2: top + plotH, class: 'chart-axis' }));
    labels.forEach(function (label, i) {
      var x = i * slot + (slot - bw) / 2, y = top + plotH;
      series.forEach(function (se) {
        var h = se.values[i] / max * plotH;
        if (h > 0) { y -= h; chart.appendChild(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: Math.max(1, h).toFixed(1), rx: 2, class: se.cls })); }
      });
      if (n <= 7 && totals[i]) { var v = svg('text', { x: (x + bw / 2).toFixed(1), y: (y - 5).toFixed(1), 'text-anchor': 'middle', class: 'chart-value' }); v.textContent = totals[i]; chart.appendChild(v); }
      if (n <= 7 || i % 5 === 0 || i === n - 1) { var t = svg('text', { x: (x + bw / 2).toFixed(1), y: H - 6, 'text-anchor': 'middle', class: 'chart-label' }); t.textContent = label; chart.appendChild(t); }
    });
    host.appendChild(chart);
    if (opts.caption) host.appendChild(h('figcaption', { className: 'chart-caption', text: opts.caption }));
    if (opts.legend) host.appendChild(h('div', { className: 'chart-legend', 'aria-hidden': 'true' }, series.map(function (se) { return h('span', { className: 'legend-item ' + se.cls, text: se.name }); })));
    host.appendChild(h('table', { className: 'sr-only' }, [
      h('caption', { text: opts.tableCaption }),
      h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: opts.columnLabel })].concat(series.map(function (se) { return h('th', { scope: 'col', text: se.name }); })))]),
      h('tbody', {}, labels.map(function (label, i) {
        return h('tr', {}, [h('th', { scope: 'row', text: opts.rowLabels ? opts.rowLabels[i] : label })].concat(series.map(function (se) { return h('td', { text: String(se.values[i]) }); })));
      }))
    ]));
  }
  function allCards() {
    var only = $('progDeck') && $('progDeck').value, out = [];
    Object.keys(library.decks).forEach(function (k) { if (!only || k === only) out = out.concat(library.decks[k].cards); });
    return out;
  }
  function tile(label, value, note) {
    return h('div', { className: 'prog-tile' }, [h('span', { className: 'prog-tile-label', text: label }), h('strong', { text: value }), note ? h('span', { className: 'prog-tile-note', text: note }) : null]);
  }
  function renderProgress() {
    fillDeckSelect($('progDeck'), tr('prog.allDecks'), $('progDeck').value);
    var cards = allCards(), today = L.day(), now = Date.now();
    var translated = cards.filter(function (c) { return c.translation && c.translation !== '—'; });
    $('progEmpty').hidden = translated.length > 0;
    $('progBody').hidden = !translated.length;
    if (!translated.length) return;
    var fc = L.forecast(cards, progressDays, now), mat = L.maturity(cards), acc = L.accuracy(library.history, 30, today);
    var best = Math.max(L.longestStreak(library.history), library.streak.count);

    $('progTiles').textContent = '';
    [tile(tr('prog.tileToday'), String(fc.days[0]), fc.fresh ? trn('prog.tileNew', fc.fresh) : ''),
     tile(tr('prog.tileStreak'), trn('streak.days', library.streak.count), tr('prog.tileBest', { n: trn('streak.days', best) })),
     tile(tr('prog.tileAccuracy'), acc.pct == null ? '—' : acc.pct + '%', trn('act.answers', acc.answers)),
     tile(tr('prog.tileWords'), String(translated.length), tr('prog.tileMature', { n: mat.mature }))
    ].forEach(function (t) { $('progTiles').appendChild(t); });

    var fcLabels = fc.days.map(function (_, i) { return dayLabel(addDays(today, i), i, progressDays > 7); });
    var fcRows = fc.days.map(function (_, i) { return i === 0 ? tr('prog.today') : longDate(addDays(today, i)); });
    var fcTotal = fc.days.reduce(function (a, b) { return a + b; }, 0);
    barChart($('forecastChart'), fcLabels, [{ name: tr('prog.reviews'), values: fc.days, cls: 'bar-due' }],
      { caption: tr('prog.forecastCaption', { today: fc.days[0], total: fcTotal, days: progressDays }), tableCaption: tr('prog.forecast'), columnLabel: tr('prog.day'), rowLabels: fcRows });

    var accRows = acc.days.map(function (d) { return longDate(d.date); });
    barChart($('accuracyChart'), acc.days.map(function (d, i) { return dayLabel(d.date, i === acc.days.length - 1 ? 0 : 1, true); }),
      [{ name: tr('prog.correct'), values: acc.days.map(function (d) { return d.correct; }), cls: 'bar-ok' },
       { name: tr('prog.wrong'), values: acc.days.map(function (d) { return d.answers - d.correct; }), cls: 'bar-no' }],
      { caption: acc.answers ? tr('prog.accuracyCaption', { pct: acc.pct, n: trn('act.answers', acc.answers), d: trn('act.days', acc.active) }) : tr('prog.noAnswers'),
        legend: true, tableCaption: tr('prog.accuracy'), columnLabel: tr('prog.day'), rowLabels: accRows });

    var host = $('maturityChart'); host.textContent = '';
    var parts = [{ key: 'fresh', cls: 'm-new', name: tr('prog.mNew') }, { key: 'learning', cls: 'm-learning', name: tr('prog.mLearning') }, { key: 'mature', cls: 'm-mature', name: tr('prog.mMature') }];
    var total = mat.fresh + mat.learning + mat.mature, x = 0;
    var bar = svg('svg', { viewBox: '0 0 600 28', class: 'maturity-svg', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    parts.forEach(function (p) { var w = mat[p.key] / total * 600; if (w > 0) bar.appendChild(svg('rect', { x: x.toFixed(1), y: 0, width: w.toFixed(1), height: 28, class: p.cls })); x += w; });
    host.appendChild(bar);
    host.appendChild(h('ul', { className: 'maturity-legend' }, parts.map(function (p) {
      return h('li', { className: p.cls }, [h('strong', { text: String(mat[p.key]) }), ' ' + p.name + ' · ' + Math.round(mat[p.key] / total * 100) + '%']);
    })));
    host.appendChild(h('figcaption', { className: 'chart-caption', text: (mat.avgEase == null ? '' : tr('prog.avgEase', { e: mat.avgEase.toFixed(2) }) + ' ') + tr('prog.matureHint') }));

    var list = $('weakList'); list.textContent = '';
    var any = false;
    Object.keys(library.decks).forEach(function (key) {
      var d = library.decks[key], weak = L.weakest(d.cards);
      if (!weak.length) return;
      any = true;
      var btn = h('button', { className: 'btn primary', type: 'button', text: tr('prog.practice', { n: weak.length }) });
      btn.onclick = function () { practiceDeck(d, 'weak'); };
      list.appendChild(h('div', { className: 'weak-deck' }, [
        h('div', { className: 'weak-head' }, [h('span', { className: 'deck-kicker', text: langByCode(d.source).label + ' → ' + langByCode(d.target).label }), btn]),
        h('ol', { className: 'weak-words' }, weak.slice(0, 5).map(function (c) {
          return h('li', {}, [h('strong', { text: c.original, lang: d.source }), h('span', { text: c.translation, lang: d.target }),
            h('span', { className: 'weak-meta', text: tr('prog.weakMeta', { f: c.fails || 0, e: (c.ease || 2.5).toFixed(2) }) })]);
        }))
      ]));
    });
    if (!any) list.appendChild(h('p', { className: 'mini', text: tr('prog.noWeak') }));
    if (window.VMMotion) window.VMMotion.library();
  }

  /* ---------------- Display settings (theme, text size, contrast, spacing) ---------------- */
  // The inline script in <head> has already applied the saved settings before the first paint.
  var display = null, displayOpener = null;
  function prefersDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function applyDisplay(settings, persist) {
    var D = window.VMDisplay;
    display = D.normalize(settings);
    D.apply(document.documentElement, D.resolve(display, prefersDark()));
    if (persist && !D.save(localStorage, display)) toast(tr('toast.saveFail'), 'err');
    syncDisplayForm();
    // Charts measure their container in CSS pixels, which change with the text size.
    if ($('screen-progress').classList.contains('active')) renderProgress();
  }
  function syncDisplayForm() {
    document.querySelectorAll('input[name="dispTheme"]').forEach(function (r) { r.checked = r.value === display.theme; });
    document.querySelectorAll('input[name="dispSize"]').forEach(function (r) { r.checked = r.value === display.size; });
    $('dispContrast').checked = display.contrast; $('dispSpacing').checked = display.spacing;
  }
  function readDisplayForm() {
    var pick = function (name) { var c = document.querySelector('input[name="' + name + '"]:checked'); return c ? c.value : null; };
    return { theme: pick('dispTheme'), size: pick('dispSize'), contrast: $('dispContrast').checked, spacing: $('dispSpacing').checked };
  }
  function openDisplay() {
    displayOpener = document.activeElement;
    syncDisplayForm();
    $('displayDialog').hidden = false;
    var current = document.querySelector('input[name="dispTheme"]:checked');
    if (current) current.focus();
  }
  function closeDisplay() {
    $('displayDialog').hidden = true;
    if (displayOpener && displayOpener.focus) displayOpener.focus();
  }
  function initDisplay() {
    if (!window.VMDisplay) return;
    display = window.VMDisplay.load(localStorage);
    applyDisplay(display, false);
    $('btnDisplay').onclick = openDisplay;
    $('btnDisplayClose').onclick = closeDisplay;
    $('btnDisplayReset').onclick = function () { applyDisplay(window.VMDisplay.DEFAULTS, true); };
    $('displayDialog').addEventListener('change', function () { applyDisplay(readDisplayForm(), true); });
    // ◐ stays a one-click switch between light and dark.
    $('btnTheme').onclick = function () {
      applyDisplay(Object.assign({}, display, { theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }), true);
    };
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var follow = function () { if (display.theme === 'system') applyDisplay(display, false); };
      if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
    }
  }

  /* ---------------- Sharing a deck by link (#deck=…, never sent to a server) ---------------- */
  var shareState = { deck: null, link: '', title: '', opener: null }, previewDeck = null, qrLoading = null;
  function langCodes() { return LANGUAGES.KNOWN_CODES; } // legacy codes too: old links keep opening
  function pairLabel(d) { return langByCode(d.source).label + ' → ' + langByCode(d.target).label; }
  /* ---------------- named decks: several per language pair, one of them "active" on the home screen ---------------- */
  function deckLabel(d) { return d.name || pairLabel(d); }
  function keyOf(d) { return Object.keys(library.decks).find(function (k) { return library.decks[k] === d; }) || null; }
  // The deck the home screen adds words to: the chosen named deck when it fits the language pair, else the pair's plain deck.
  function activeDeckKey() {
    var k = state.cfg.deck, d = k && library.decks[k];
    return d && d.source === state.cfg.source && d.target === state.cfg.target ? k : L.deckKey(state.cfg.source, state.cfg.target);
  }
  function targetDeck() {
    var key = activeDeckKey();
    var d = library.decks[key] || { source: state.cfg.source, target: state.cfg.target, cards: [], created: Date.now() };
    library.decks[key] = d;
    return d;
  }
  function setActiveDeck(key) {
    var d = key && library.decks[key];
    state.cfg.deck = d ? key : '';
    if (d) { state.cfg.source = d.source; state.cfg.target = d.target; syncLangSelects(); }
    saveCfg(); renderHomeDeck();
  }
  // Changing a language by hand means "not that deck any more": the pair's plain deck takes over.
  function releaseDeck() { if (state.cfg.deck) { state.cfg.deck = ''; saveCfg(); renderHomeDeck(); } }
  function createDeck(name, source, target) {
    var key = L.deckKey(source, target, L.deckId());
    library.decks[key] = { source: source, target: target, name: L.cleanName(name) || pairLabel({ source: source, target: target }), cards: [], created: Date.now() };
    persistLibrary();
    setActiveDeck(key);
    return key;
  }
  function fillDeckSelect(sel, firstLabel, keep) {
    sel.innerHTML = '';
    if (firstLabel !== null) sel.appendChild(h('option', { value: '', text: firstLabel }));
    Object.keys(library.decks).sort(function (a, b) { return (library.decks[b].created || 0) - (library.decks[a].created || 0); }).forEach(function (k) {
      var d = library.decks[k];
      sel.appendChild(h('option', { value: k, text: deckLabel(d) + ' · ' + trn('words.count', d.cards.length) }));
    });
    sel.value = keep && library.decks[keep] ? keep : '';
  }
  function renderHomeDeck() {
    var sel = $('homeDeck'); if (!sel) return;
    var has = Object.keys(library.decks).length > 0;
    var key = state.cfg.deck && library.decks[state.cfg.deck] ? state.cfg.deck : '';
    fillDeckSelect(sel, tr('deck.anyPair'), key);
    sel.disabled = !has;
    var d = key ? library.decks[key] : null;
    $('homeDeckNote').hidden = !d;
    if (d) $('homeDeckNote').textContent = tr('deck.homeNote', { n: deckLabel(d), p: pairLabel(d) });
    var due = d ? L.pick(d.cards, 'due').length : 0, ready = d ? L.pick(d.cards, 'all').length : 0;
    $('btnHomePractice').hidden = !ready;
    if (ready) $('btnHomePractice').textContent = due ? tr('deck.practiceDue', { n: due }) : tr('deck.practiceAll');
  }
  var deckOpener = null;
  function openDeckDialog() {
    deckOpener = document.activeElement;
    var src = $('deckSource'), tgt = $('deckTarget');
    // New decks: only learnable languages on the left, native languages on the right (never an archived pair).
    var s0 = LANGUAGES.canLearn(state.cfg.source) ? state.cfg.source : 'en';
    var t0 = LANGUAGES.canBeNative(state.cfg.target) && state.cfg.target !== s0 ? state.cfg.target : (s0 === 'ru' ? 'en' : 'ru');
    fillLangSelect(src, LANGUAGES.LEARN_CODES, s0); fillLangSelect(tgt, LANGUAGES.NATIVE_CODES, t0);
    $('deckName').value = ''; $('deckWords').value = ''; $('deckError').textContent = '';
    $('deckDialog').hidden = false;
    $('deckName').focus();
  }
  function closeDeckDialog() { $('deckDialog').hidden = true; if (deckOpener && deckOpener.focus && document.contains(deckOpener)) deckOpener.focus(); }
  function submitDeckDialog(e) {
    e.preventDefault();
    var source = $('deckSource').value, target = $('deckTarget').value, name = L.cleanName($('deckName').value), words = $('deckWords').value.trim();
    if (source === target) { $('deckError').textContent = tr('deck.sameLang'); $('deckSource').focus(); return; }
    if (LANGUAGES.isArchivedPair(source, target)) { $('deckError').textContent = tr('lang.archivedNew'); $('deckSource').focus(); return; }
    var key = createDeck(name, source, target);
    closeDeckDialog();
    navigateLearning('screen-setup');
    toast(tr('deck.created', { n: deckLabel(library.decks[key]) }), 'ok', 3000);
    if (words) { $('input').value = words; updateInputStat(true); start(); }
    else { $('input').value = ''; updateInputStat(true); $('input').focus(); }
  }

  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    if (!qrLoading) qrLoading = new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = 'vendor/qrcode/qrcode.js'; s.onload = ok; s.onerror = function () { qrLoading = null; fail(); };
      document.head.appendChild(s);
    });
    return qrLoading;
  }
  // QR as SVG: dark modules on a white plate (scanners need contrast in the dark theme too), one path, no style attributes.
  function qrSvg(text) {
    var qr = window.qrcode(0, 'L');
    qr.addData(text, 'Byte'); qr.make();
    var n = qr.getModuleCount(), q = 4, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return svg('svg', { viewBox: '0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q), class: 'qr-svg', role: 'img', 'aria-label': tr('share.qrLabel'), 'shape-rendering': 'crispEdges' },
      [svg('rect', { width: n + 2 * q, height: n + 2 * q, class: 'qr-plate' }), svg('path', { d: d, class: 'qr-dark' })]);
  }
  async function openShare(d, opener) {
    var code;
    try { code = await window.VMShare.encodeDeck(d); }
    catch (e) { toast(tr(e.code === 'empty' ? 'shareErr.empty' : 'shareErr.encode'), 'err', 5000); return; }
    var link = location.origin + location.pathname + '#deck=' + code;
    shareState = { deck: d, link: link, title: pairLabel(d), opener: opener || null };
    var words = window.VMShare.payloadOf(d).c.length, LIM = window.VMShare.LIMITS;
    $('shareDeckName').textContent = pairLabel(d);
    $('shareInfo').textContent = tr('share.info', { n: trn('words.count', words), k: Math.max(1, Math.round(link.length / 1024 * 10) / 10) });
    var tooBig = link.length > LIM.linkChars;
    $('shareReady').hidden = tooBig; $('shareTooBig').hidden = !tooBig;
    $('shareTooBigText').textContent = tr('share.tooBig', { k: Math.round(link.length / 1024), max: Math.round(LIM.linkChars / 1024) });
    $('shareLink').value = tooBig ? '' : link;
    $('btnShareNative').hidden = tooBig || typeof navigator.share !== 'function';
    var qrHost = $('shareQr'); qrHost.textContent = '';
    $('shareDialog').hidden = false;
    (tooBig ? $('btnShareFile') : $('btnShareCopy')).focus();
    if (tooBig) return;
    if (link.length > LIM.qrChars) { qrHost.appendChild(h('figcaption', { className: 'mini', text: tr('share.qrTooLong') })); return; }
    try { await loadQr(); qrHost.appendChild(qrSvg(link)); qrHost.appendChild(h('figcaption', { className: 'mini', text: tr('share.qrHint') })); }
    catch (e) { qrHost.appendChild(h('figcaption', { className: 'mini', text: tr('share.qrFailed') })); }
  }
  function closeShare() {
    $('shareDialog').hidden = true;
    if (shareState.opener && shareState.opener.focus) shareState.opener.focus();
  }
  async function copyShareLink() {
    try { await navigator.clipboard.writeText(shareState.link); toast(tr('share.copied'), 'ok', 2500); }
    catch (e) { $('shareLink').select(); toast(tr('share.copyManual'), 'err', 4000); }
  }
  function downloadShareFile() {
    var data = { vmShare: 1, deck: window.VMShare.payloadOf(shareState.deck) };
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    link.download = 'vocabulary-deck-' + shareState.deck.source + '-' + shareState.deck.target + '.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  // Reads #deck=…, removes it from the address bar right away (it is not kept in history), then previews.
  async function openSharedLink() {
    var code = window.VMShare && window.VMShare.codeFromHash(location.hash);
    if (code == null) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    var deck;
    try { deck = await window.VMShare.decodeDeck(code, langCodes()); }
    catch (e) { toast(tr('shareErr.' + (e.code || 'bad-link')), 'err', 7000); return; }
    showPreview(deck);
  }
  function showPreview(deck) {
    previewDeck = deck;
    $('previewTitle').textContent = deck.name ? deck.name + ' · ' + pairLabel(deck) : pairLabel(deck);
    var key = previewTargetKey(deck), known = Object.create(null);
    ((library.decks[key] || {}).cards || []).forEach(function (c) { known[c.original.toLowerCase()] = true; });
    var fresh = deck.cards.filter(function (c) { return !known[c.original.toLowerCase()]; }).length;
    $('previewCount').textContent = trn('words.count', deck.cards.length) + (fresh < deck.cards.length ? ' · ' + tr('share.alreadyHave', { n: deck.cards.length - fresh }) : '');
    var list = $('previewList'); list.textContent = '';
    deck.cards.slice(0, 5).forEach(function (c) {
      list.appendChild(h('li', {}, [h('strong', { text: c.original, lang: deck.source }), h('span', { text: c.translation, lang: deck.target })]));
    });
    $('previewMore').textContent = deck.cards.length > 5 ? tr('share.more', { n: deck.cards.length - 5 }) : '';
    $('btnPreviewAdd').disabled = !fresh;
    $('btnPreviewAdd').textContent = fresh ? tr('share.addN', { n: trn('words.count', fresh) }) : tr('share.nothingNew');
    $('sharePreview').hidden = false;
    (fresh ? $('btnPreviewAdd') : $('btnPreviewCancel')).focus();
  }
  function closePreview() { $('sharePreview').hidden = true; previewDeck = null; }
  // A named shared deck lands in a deck of the same name (or a new one); an unnamed one in the pair's plain deck.
  function previewTargetKey(deck) {
    if (!deck.name) return L.deckKey(deck.source, deck.target);
    return Object.keys(library.decks).find(function (k) { var d = library.decks[k]; return d.source === deck.source && d.target === deck.target && d.name === deck.name; }) || L.deckKey(deck.source, deck.target, L.deckId());
  }
  function addPreviewDeck() {
    var deck = previewDeck;
    if (!deck) return;
    var previous = snapshotLibrary(), key = previewTargetKey(deck);
    var d = library.decks[key] || { source: deck.source, target: deck.target, cards: [], created: Date.now() };
    if (deck.name && !d.name) d.name = deck.name;
    var known = Object.create(null), added = 0;
    d.cards.forEach(function (c) { known[c.original.toLowerCase()] = true; });
    deck.cards.forEach(function (c) {
      if (known[c.original.toLowerCase()]) return;
      known[c.original.toLowerCase()] = true; added++;
      d.cards.push(Object.assign({ original: c.original, translation: c.translation, hint: '', definition: '', examples: c.examples.slice(), streak: 0, fails: 0, added: Date.now() }, c.reading ? { reading: c.reading } : {}));
    });
    library.decks[key] = d;
    persistLibrary();
    closePreview();
    navigateLearning('screen-library');
    offerUndo(trn('share.added', added), restoreLibrary(previous));
  }

  var match = null;
  function stopMatch() { if (match && match.timer) { clearInterval(match.timer); match.timer = null; } }
  function matchBest() { try { return JSON.parse(localStorage.getItem('vm.match-best') || '{}'); } catch (e) { return {}; } }
  function renderMatchStats() {
    if (!match) return;
    $('matchTime').textContent = '⏱ ' + fmtTime(Math.floor(((match.end || Date.now()) - match.start) / 1000));
    $('matchMistakes').textContent = trn('match.mistakes', match.mistakes);
    var best = matchBest()[match.key];
    $('matchBest').textContent = best ? tr('match.best', { t: fmtTime(Math.round(best / 1000)) }) : '';
  }
  function startMatch() {
    var key = $('quizDeck').value, d = library.decks[key];
    if (!d) { toast(tr('toast.createDeck'), 'err'); return; }
    var picked = L.pairs(d.cards, 6);
    if (picked.length < 3) { toast(tr('toast.needMatch'), 'err'); return; }
    stopMatch();
    var tiles = [];
    picked.forEach(function (c, i) { tiles.push({ i: i, side: 'a', text: c.original }, { i: i, side: 'b', text: c.translation }); });
    shuffle(tiles);
    match = { key: key, left: picked.length, mistakes: 0, start: Date.now(), end: 0, pick: null };
    var grid = $('matchGrid'); grid.innerHTML = '';
    tiles.forEach(function (tile) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.className = 'match-tile ' + tile.side; b.textContent = tile.text; b.lang = tile.side === 'a' ? d.source : d.target;
      b.onclick = function () { pickTile(tile, b); };
      grid.appendChild(b);
    });
    $('matchStats').hidden = false; $('btnMatchStart').textContent = tr('match.restart');
    match.timer = setInterval(renderMatchStats, 500); renderMatchStats();
  }
  function pickTile(tile, b) {
    if (!match || match.end || b.disabled) return;
    var p = match.pick;
    if (p) { p.b.classList.remove('sel'); p.b.setAttribute('aria-pressed', 'false'); }
    if (!p || p.tile.side === tile.side) { if (!p || p.b !== b) { match.pick = { tile: tile, b: b }; b.classList.add('sel'); b.setAttribute('aria-pressed', 'true'); } else match.pick = null; return; }
    match.pick = null;
    if (p.tile.i === tile.i) {
      p.b.classList.add('done'); b.classList.add('done'); p.b.disabled = b.disabled = true; playSuccessSound();
      if (--match.left === 0) finishMatch();
      return;
    }
    match.mistakes++; playForgotSound(); renderMatchStats();
    [p.b, b].forEach(function (el) { el.classList.remove('wrong'); void el.offsetWidth; el.classList.add('wrong'); setTimeout(function () { el.classList.remove('wrong'); }, 450); });
  }
  function finishMatch() {
    match.end = Date.now(); stopMatch();
    var ms = match.end - match.start, best = matchBest(), record = !best[match.key] || ms < best[match.key];
    if (record) { best[match.key] = ms; try { localStorage.setItem('vm.match-best', JSON.stringify(best)); } catch (e) {} }
    renderMatchStats();
    toast(tr(record ? 'match.record' : 'match.done', { t: fmtTime(Math.round(ms / 1000)) }), 'ok', 3200);
    L.complete(library.streak, L.day()); persistLibrary(); renderDaily();
  }

  function toggleCard() {
    if (answerLocked || !state.current) return;
    if (!state.revealed || isTyping()) { reveal(); return; }
    state.revealed = false;
    $('card').classList.remove('flipped');
    if (window.VMMotion) { $('card').dataset.revealed = 'false'; window.VMMotion.flip(false); }
    playFlipSound(); updateRows();
  }
  function readTranslationCache(word, source, target) {
    try { return JSON.parse(localStorage.getItem('vm.translation-cache') || '{}')[source + ':' + target + ':' + word] || null; } catch(e) { return null; }
  }
  function writeTranslationCache(word, source, target, text) {
    try {
      var cache = JSON.parse(localStorage.getItem('vm.translation-cache') || '{}');
      if (Object.keys(cache).length > 1000) cache = {};
      cache[source + ':' + target + ':' + word] = text;
      localStorage.setItem('vm.translation-cache', JSON.stringify(cache));
    } catch(e) {}
  }
  // The library always stays in memory; if storage is full we free the disposable
  // translation cache, retry once, and otherwise warn once (backup export still works).
  var storageWarned = false;
  function isQuotaError(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }
  function persistLibrary() {
    var json = JSON.stringify(library);
    try { localStorage.setItem(LIBRARY_KEY, json); storageWarned = false; if (account) account.changed(); return true; }
    catch (e) {
      try {
        if (localStorage.getItem('vm.translation-cache') === null) throw e;
        localStorage.removeItem('vm.translation-cache');
        localStorage.setItem(LIBRARY_KEY, json);
        toast(tr('toast.cacheFreed'), 'ok', 3500);
        return true;
      } catch (e2) {}
      if (!storageWarned) { storageWarned = true; toast(tr(isQuotaError(e) ? 'toast.quota' : 'toast.saveFail'), 'err', 8000); }
      return false;
    }
  }
  function enrichLocalContext(cards) {
    if (state.cfg.source !== 'en') return;
    cards.forEach(function (c) {
      var ctx = CONTEXT[c.original.toLowerCase()];
      if (ctx) { if (!c.definition) c.definition = ctx[0]; if (!(c.examples || []).length) c.examples = [ctx[1]]; }
    });
  }
  function pickKeys(o, keys) { var out = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; }
  function archiveCards() {
    var d = targetDeck();
    state.cards.forEach(function (card) {
      var idx = d.cards.findIndex(function (c) { return L.validate(c.original, card.original) && c.original.toLowerCase() === card.original.toLowerCase(); });
      if (idx < 0) d.cards.push(Object.assign({ added: Date.now() }, card));
      else d.cards[idx] = Object.assign({ added: d.cards[idx].added }, pickKeys(d.cards[idx], ['reading', 'grammarIds']), card); // grammar and reading survive a re-add
    });
    persistLibrary();
  }
  function recordAnswer(ok) {
    var key = L.day();
    var h = library.history[key] || { answers: 0, correct: 0 };
    h.answers++; if (ok) h.correct++;
    library.history[key] = h;
    if (h.answers >= library.goal && !h.celebrated) {
      h.celebrated = true;
      if (window.VMMotion) window.VMMotion.goal();
      else { burstConfetti(35); toast(tr('goal.text'), 'ok'); }
    }
    persistLibrary(); renderDaily();
  }
  function renderDaily() {
    var h = library.history[L.day()] || { answers: 0 };
    $('streakCount').textContent = trn('streak.days', library.streak.count);
    $('dailyTitle').textContent = tr(h.answers >= library.goal ? 'daily.done' : 'daily.almost');
    $('dailyText').textContent = tr('daily.text', { a: h.answers, g: library.goal });
    $('dailyBar').style.width = Math.min(100, h.answers / library.goal * 100) + '%';
    $('freezeEnabled').checked = library.streak.enabled;
    $('freezeBalance').textContent = tr('freeze.left', { n: library.streak.freezes });
    $('dailyGoal').value = library.goal;
    $('batchSize').value = String(library.batch || 0);
    renderHomeDeck();
  }
  function navigateLearning(id) {
    stopMatch();
    clearTimeout(nextCardTimer); nextCardTimer = null;
    clearInterval(state.timer);
    if (state.answers && !summaryRecorded) { L.complete(library.streak, L.day()); summaryRecorded = true; persistLibrary(); }
    hideSummary();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (games && id !== 'screen-games') games.leave();
    show(id); renderDaily();
    if (id === 'screen-games' && games) games.refresh();
    if (id === 'screen-library') renderLibrary();
    if (id === 'screen-test') fillQuizDecks();
    if (id === 'screen-progress') renderProgress();
    if (id === 'screen-grammar') renderGrammar();
  }
  function deckMatches(d, lang, status) {
    if (lang && d.source !== lang && d.target !== lang) return false;
    if (status === 'due') return L.pick(d.cards, 'due').length > 0;
    if (status === 'hard') return L.pick(d.cards, 'hard').length > 0;
    if (status === 'mastered') return d.cards.length > 0 && d.cards.filter(function (c) { return c.streak >= 2; }).length / d.cards.length >= 0.7;
    return true;
  }
  function fillLangFilter(keys) {
    var sel = $('filterLang'), keep = sel.value, seen = Object.create(null);
    keys.forEach(function (k) { seen[library.decks[k].source] = true; seen[library.decks[k].target] = true; });
    while (sel.options.length > 1) sel.remove(1);
    Object.keys(seen).forEach(function (code) { sel.appendChild(h('option', { value: code, text: langByCode(code).label })); });
    sel.value = seen[keep] ? keep : '';
  }
  /* ---------------- word vault: every saved word in one table ---------------- */
  var VAULT_PAGE = 200, vaultShown = VAULT_PAGE;
  var STATUS_ORDER = { due: 0, pending: 1, new: 2, learning: 3, mastered: 4 };
  function vaultRows() {
    var rows = [], now = Date.now();
    Object.keys(library.decks).forEach(function (key) {
      var d = library.decks[key];
      d.cards.forEach(function (c) { rows.push({ c: c, d: d, status: L.status(c, now), added: c.added || 0 }); });
    });
    var sort = $('vaultSort').value;
    rows.sort(function (a, b) {
      if (sort === 'az') return a.c.original.localeCompare(b.c.original);
      if (sort === 'old') return a.added - b.added;
      if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.added - a.added;
      return b.added - a.added;
    });
    return rows;
  }
  function renderVault() {
    var rows = vaultRows(), body = $('vaultBody'), fmt;
    try { fmt = new Intl.DateTimeFormat(I18N ? I18N.lang() : 'ru', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { fmt = null; }
    body.innerHTML = '';
    $('vaultCount').textContent = trn('words.count', rows.length);
    rows.slice(0, vaultShown).forEach(function (r) {
      body.appendChild(h('tr', {}, [
        h('th', { scope: 'row', lang: r.d.source, text: r.c.original }),
        h('td', { lang: r.d.target, text: r.c.translation }),
        h('td', { className: 'vault-deck', text: r.d.name ? r.d.name : r.d.source.toUpperCase() + ' → ' + r.d.target.toUpperCase() }),
        h('td', { className: 'vault-date', text: r.added && fmt ? fmt.format(new Date(r.added)) : '—' }),
        h('td', {}, [h('span', { className: 'status-pill st-' + r.status, text: tr('vault.st.' + r.status) })])
      ]));
    });
    if (!rows.length) body.appendChild(h('tr', {}, [h('td', { colspan: '5', className: 'vault-empty', text: tr('vault.empty') })]));
    $('btnVaultMore').hidden = rows.length <= vaultShown;
  }
  function showLibraryTab(vault) {
    $('tabDecks').setAttribute('aria-selected', String(!vault)); $('tabVault').setAttribute('aria-selected', String(vault));
    $('tabDecks').tabIndex = vault ? -1 : 0; $('tabVault').tabIndex = vault ? 0 : -1;
    $('decksPanel').hidden = vault; $('vaultPanel').hidden = !vault;
    $('libraryFilters').classList.toggle('is-off', vault);
    if (vault) renderVault();
  }

  function renderLibrary() {
    var host = $('libraryGrid'); host.innerHTML = '';
    renderActivity(); renderSearch();
    var allKeys = Object.keys(library.decks);
    fillLangFilter(allKeys);
    // A quiet, one-time note when some decks use a language that is no longer offered.
    var noteSeen = false;
    try { noteSeen = localStorage.getItem('vm.legacy-notice') === '1'; } catch (e) {}
    $('archivedNote').hidden = noteSeen || !allKeys.some(function (k) { return LANGUAGES.isArchivedPair(library.decks[k].source, library.decks[k].target); });
    $('btnArchivedOk').onclick = function () { try { localStorage.setItem('vm.legacy-notice', '1'); } catch (e) {} $('archivedNote').hidden = true; };
    var lang = $('filterLang').value, status = $('filterStatus').value;
    var keys = allKeys.filter(function (k) { return deckMatches(library.decks[k], lang, status); });
    $('libraryFilters').hidden = !allKeys.length;
    $('btnClearFilters').hidden = !lang && !status;
    $('filterEmpty').hidden = !allKeys.length || keys.length > 0;
    $('deckCount').textContent = allKeys.length ? trn('lib.decks', keys.length) : '';
    if (!allKeys.length) {
      host.innerHTML = '<div class="empty-library"><h2>' + tr('lib.emptyH') + '</h2><p>' + tr('lib.emptyP') + '</p>' +
        '<ol class="empty-steps"><li>' + tr('lib.empty1') + '</li><li>' + tr('lib.empty2') + '</li><li>' + tr('lib.empty3') + '</li></ol>' +
        '<div class="actions"><button class="btn primary" type="button" data-action="new">' + tr('lib.emptyBtn') + '</button>' +
        '<button class="btn" type="button" data-action="demo">' + tr('setup.demo') + '</button>' +
        '<label class="btn" for="importLibrary">' + tr('lib.import') + '</label></div></div>';
      host.querySelector('[data-action="demo"]').onclick = function () { $('btnDemo').click(); };
      host.querySelector('button').onclick = function () { navigateLearning('screen-setup'); };
      return;
    }
    keys.forEach(function (key) {
      var d = library.decks[key];
      var mastered = d.cards.filter(function (c) { return c.streak >= 2; }).length;
      var due = L.pick(d.cards, 'due').length, hard = L.pick(d.cards, 'hard').length;
      var panel = document.createElement('article'); panel.className = 'deck-item';
      var cover = h('div', { className: 'deck-cover cover-' + ((d.source.charCodeAt(0) + d.target.charCodeAt(1)) % 4) }, [
        h('span', { className: 'cover-langs', text: d.source.toUpperCase() + ' → ' + d.target.toUpperCase() }),
        h('button', { className: 'cover-play', type: 'button', 'aria-label': tr('deck.play') + ': ' + deckLabel(d) }),
        h('span', { className: 'cover-badge', text: tr('deck.minutes', { n: Math.max(1, Math.round(Math.max(due, Math.min(d.cards.length, 20)) * 0.25)) }) })
      ]);
      panel.innerHTML = '<span class="deck-kicker">' + escapeHTML(d.name ? pairLabel(d) : '→ ' + langByCode(d.target).label) + ' / ' + trn('words.count', d.cards.length) + (LANGUAGES.isArchivedPair(d.source, d.target) ? ' <span class="archived-badge" title="' + escapeHTML(tr('lang.archivedTitle')) + '">' + tr('lang.archived') + '</span>' : '') + '</span><h2 class="deck-name">' + escapeHTML(d.name || langByCode(d.source).label) + '</h2><p>' + tr('deck.stats', { m: mastered, d: due, h: trn('deck.hard', hard) }) + '</p><div class="daily-track deck-progress"><i></i></div>' +
        '<div class="actions"><button class="btn primary" type="button" data-act="practice" title="' + tr('deck.practiceTitle') + '">' + (due ? tr('deck.practiceDue', { n: due }) : tr('deck.practiceAll')) + '</button><button class="btn" type="button" data-act="hard"' + (hard ? '' : ' disabled') + ' title="' + tr('deck.hardTitle') + '">' + tr('deck.hardBtn', { n: hard }) + '</button><button class="btn" type="button" data-act="add">' + tr('deck.add') + '</button></div>' +
        '<div class="deck-tools"><button class="link" type="button" data-act="reverse"' + (canSwapPair(d.source, d.target) ? '' : ' disabled') + ' title="' + escapeHTML(canSwapPair(d.source, d.target) ? tr('deck.reverseTitle', { p: langByCode(d.target).label + ' → ' + langByCode(d.source).label }) : tr('lang.swapOff', { l: langByCode(d.target).label })) + '">' + tr('deck.reverse') + '</button><button class="link" type="button" data-act="rename">' + tr('deck.rename') + '</button><button class="link" type="button" data-act="copy">' + tr('deck.copy') + '</button><button class="link" type="button" data-act="share">' + tr('share.button') + '</button></div>' +
        '<details><summary>' + tr('deck.all') + '</summary><div class="word-list"></div><button class="link link-danger" type="button" data-act="delete">' + tr('deck.delete') + '</button></details>';
      panel.insertBefore(cover, panel.firstChild);
      cover.querySelector('.cover-play').onclick = function () {
        if (!d.cards.length) { toast(tr('toast.addWords'), 'err'); return; }
        practiceDeck(d, 'due');
      };
      panel.querySelector('.deck-progress i').style.width = Math.round(mastered / Math.max(1, d.cards.length) * 100) + '%';
      var list = panel.querySelector('.word-list');
      d.cards.forEach(function (c, i) {
        var row = h('div', { className: 'saved-word' }, [
          h('strong', { text: c.original, lang: d.source }),
          h('span', { text: c.translation, lang: d.target }),
          h('div', { className: 'word-actions' }, [
            h('button', { className: 'link', type: 'button', 'data-act': 'edit', text: tr('word.edit') }),
            h('button', { className: 'link', type: 'button', 'data-act': 'remove', text: tr('word.remove') })
          ])
        ]);
        row.querySelector('[data-act="edit"]').onclick = function () {
          var value = window.prompt(tr('word.prompt', { w: c.original }), c.translation);
          if (value === null || !value.trim()) return;
          c.translation = value.trim(); persistLibrary(); renderLibrary();
        };
        row.querySelector('[data-act="remove"]').onclick = function () {
          var previous = snapshotLibrary();
          d.cards.splice(i, 1); persistLibrary(); renderLibrary();
          offerUndo(tr('undo.wordRemoved', { w: c.original }), restoreLibrary(previous));
        };
        list.appendChild(row);
      });
      panel.querySelector('[data-act="practice"]').onclick = function () {
        if (!d.cards.length) { toast(tr('toast.addWords'), 'err'); return; }
        practiceDeck(d, 'due');
      };
      panel.querySelector('[data-act="hard"]').onclick = function () { practiceDeck(d, 'hard'); };
      panel.querySelector('[data-act="reverse"]').onclick = function () { reverseDeck(d); };
      panel.querySelector('[data-act="copy"]').onclick = function () { copyDeck(d); };
      panel.querySelector('[data-act="rename"]').onclick = function () {
        var value = window.prompt(tr('deck.renamePrompt'), d.name || '');
        if (value === null) return;
        var name = L.cleanName(value);
        if (name) d.name = name; else delete d.name;
        persistLibrary(); renderLibrary(); renderHomeDeck();
      };
      panel.querySelector('[data-act="share"]').onclick = function () { openShare(d, this); };
      panel.querySelector('[data-act="add"]').onclick = function () {
        setActiveDeck(keyOf(d)); $('input').value = '';
        navigateLearning('screen-setup'); $('input').focus(); updateInputStat(true);
      };
      panel.querySelector('[data-act="delete"]').onclick = function () {
        var name = deckLabel(d);
        if (!window.confirm(tr('confirm.deleteDeckDetail', { name: name, w: d.cards.length }))) return;
        var previous = snapshotLibrary();
        delete library.decks[key]; persistLibrary(); renderLibrary();
        offerUndo(tr('undo.deckDeleted', { name: name }), restoreLibrary(previous));
      };
      host.appendChild(panel);
    });
    if (!$('vaultPanel').hidden) renderVault();
    if (window.VMMotion) window.VMMotion.library();
  }
  function showAnswerFeedback(text, wrong) {
    $('answerFeedbackText').textContent = text;
    $('answerFeedback').classList.toggle('wrong', !!wrong);
    $('answerFeedback').hidden = false;
    $('rowHidden').hidden = true; $('rowShown').hidden = true;
    if (window.VMMotion) window.VMMotion.feedback(!wrong);
  }
  function checkTypedAnswer(e) {
    e.preventDefault();
    if (!state.current || state.revealed || answerLocked) return;
    var text = $('typedAnswer').value.trim();
    if (!text) { $('typedAnswer').focus(); return; }
    var expected = expectedAnswer();
    var ok = L.validate(text, expected);
    reveal(); pendingTypedAnswer = ok;
    showAnswerFeedback(tr(ok ? 'feedback.right' : 'feedback.almost', { a: expected }), !ok);
    $('btnNextAnswer').focus();
  }
  function fillQuizDecks() {
    lexical = null; $('quizBody').hidden = true; $('btnQuizStart').hidden = false;
    var sel = $('quizDeck'); sel.innerHTML = '';
    var empty = !Object.keys(library.decks).length;
    $('quizEmpty').hidden = !empty;
    sel.disabled = $('btnQuizStart').disabled = $('btnMatchStart').disabled = empty;
    Object.keys(library.decks).forEach(function (key) {
      var d = library.decks[key]; var opt = document.createElement('option');
      opt.value = key; opt.textContent = deckLabel(d) + ' · ' + d.cards.length;
      sel.appendChild(opt);
    });
  }
  function renderQuiz() {
    var q = lexical.questions[lexical.index];
    $('quizProgress').textContent = tr('quiz.progress', { i: lexical.index + 1, n: lexical.questions.length });
    $('quizQuestion').textContent = q.sentence || tr('quiz.meaning', { w: q.card.translation });
    $('quizAnswer').textContent = ''; $('btnQuizNext').hidden = true;
    var host = $('quizOptions'); host.innerHTML = '';
    q.options.forEach(function (opt, i) {
      var button = document.createElement('button'); button.className = 'quiz-option';
      button.textContent = 'ABCD'[i] + '.  ' + opt;
      button.onclick = function () {
        if (lexical.answered) return;
        lexical.answered = true;
        var ok = opt === q.card.original;
        if (ok) lexical.correct++;
        host.querySelectorAll('button').forEach(function (b, idx) { b.disabled = true; if (q.options[idx] === q.card.original) b.classList.add('correct'); });
        if (!ok) button.classList.add('wrong');
        L.grade(q.card, ok); recordAnswer(ok);
        $('quizAnswer').textContent = tr(ok ? 'quiz.correct' : 'quiz.answerWas') + q.card.original + ' — ' + q.card.translation + (q.card.definition ? '. ' + q.card.definition : '');
        $('btnQuizNext').hidden = false; persistLibrary();
      };
      host.appendChild(button);
    });
    if (window.VMMotion) window.VMMotion.quiz();
  }
  function initLearningUI() {
    try {
      var raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null');
      if (raw && raw.decks && raw.streak && raw.history) library = raw;
    } catch(e) {}
    // The daily aggregate stays compact: two years are plenty for the progress screen.
    library.history = L.trimHistory(library.history, 730, L.day());
    L.reconcile(library.streak, L.day()); persistLibrary(); renderDaily();
    syncLangSelects();
    $('sourceLang').onchange = function () {
      releaseDeck();
      var prev = state.cfg.source; state.cfg.source = this.value;
      // Picking the same language on both sides means "swap them" (when the old one can be a native language).
      if (state.cfg.target === this.value) state.cfg.target = LANGUAGES.canBeNative(prev) ? prev : (this.value === 'ru' ? 'en' : 'ru');
      syncLangSelects(); saveCfg();
    };
    $('btnSwapLang').onclick = swapLanguages;
    $('simpleMode').checked = state.cfg.simple;
    $('simpleMode').onchange = function () { state.cfg.simple = this.checked; saveCfg(); };
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === state.cfg.mode); b.onclick = function () {
      state.cfg.mode = b.dataset.mode; saveCfg(); document.querySelectorAll('#modeSeg button').forEach(function (btn) { btn.classList.toggle('on', btn === b); });
    }; });
    initDisplay();
    $('navStudy').onclick = function () { navigateLearning('screen-setup'); };
    $('navLibrary').onclick = function () { navigateLearning('screen-library'); };
    $('navTest').onclick = function () { navigateLearning('screen-test'); };
    $('navProgress').onclick = function () { navigateLearning('screen-progress'); };
    $('navGrammar').onclick = function () { navigateLearning('screen-grammar'); };
    initGrammar();
    $('navGames').onclick = function () { navigateLearning('screen-games'); };
    $('homeDeck').onchange = function () { setActiveDeck(this.value); if (this.value) toast(tr('deck.chosen', { n: deckLabel(library.decks[this.value]) }), 'ok', 1800); };
    $('btnHomePractice').onclick = function () { var d = library.decks[state.cfg.deck]; if (d) practiceDeck(d, 'due'); };
    $('btnNewDeck').onclick = openDeckDialog;
    $('btnHomeNewDeck').onclick = openDeckDialog;
    $('deckCancel').onclick = closeDeckDialog;
    $('deckForm').onsubmit = submitDeckDialog;
    $('deckDialog').addEventListener('click', function (e) { if (e.target === this) closeDeckDialog(); });
    $('progDeck').onchange = renderProgress;
    $('tabDecks').onclick = function () { showLibraryTab(false); };
    $('tabVault').onclick = function () { vaultShown = VAULT_PAGE; showLibraryTab(true); };
    [$('tabDecks'), $('tabVault')].forEach(function (t) {
      t.onkeydown = function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); var other = t.id === 'tabDecks' ? $('tabVault') : $('tabDecks'); other.click(); other.focus();
      };
    });
    $('vaultSort').onchange = renderVault;
    $('btnVaultMore').onclick = function () { vaultShown += VAULT_PAGE; renderVault(); };
    $('btnGamesDemo').onclick = function () { $('gameDeck').value = addDemoDeck(); if (games) games.refresh(); $('gameDeck').value = 'en-ru'; toast(tr('toast.demoAdded'), 'ok'); };
    if (window.VMGames) games = window.VMGames.mount({
      decks: function () { return library.decks; },
      langLabel: function (code) { return langByCode(code).label; }, deckLabel: deckLabel,
      tr: tr, trn: trn, toast: toast,
      answer: function (card, ok, grade) { if (grade) L.grade(card, ok); recordAnswer(ok); },
      sound: function (ok) { if (ok) playSuccessSound(); else playForgotSound(); }, fx: playArcadeFx,
      complete: function () { L.complete(library.streak, L.day()); persistLibrary(); renderDaily(); },
      moreSentences: function (d) { return function (c) { var ctx = d.source === 'en' && CONTEXT[c.original.toLowerCase()]; return ctx ? [ctx[1]] : []; }; },
      openMatch: function (key) { navigateLearning('screen-test'); if (library.decks[key]) $('quizDeck').value = key; $('btnMatchStart').click(); }
    });
    $('btnProgEmpty').onclick = function () { navigateLearning('screen-setup'); $('input').focus(); };
    var progressResize = null;
    window.addEventListener('resize', function () { clearTimeout(progressResize); progressResize = setTimeout(function () { if ($('screen-progress').classList.contains('active')) renderProgress(); }, 150); });
    $('progRange').onclick = function (e) {
      var b = e.target.closest('button[data-days]'); if (!b) return;
      progressDays = Number(b.dataset.days);
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderProgress();
    };
    $('btnAddDeck').onclick = function () { navigateLearning('screen-setup'); $('input').focus(); };
    $('filterLang').onchange = renderLibrary;
    $('filterStatus').onchange = renderLibrary;
    $('btnClearFilters').onclick = function () { $('filterLang').value = ''; $('filterStatus').value = ''; renderLibrary(); $('filterLang').focus(); };
    $('librarySearch').oninput = renderSearch;
    $('batchSize').onchange = function () { library.batch = Number(this.value) || 0; persistLibrary(); };
    $('btnUndo').onclick = undoAnswer;
    $('btnShareClose').onclick = closeShare;
    $('btnShareCopy').onclick = copyShareLink;
    $('btnShareNative').onclick = function () { navigator.share({ title: 'Wordzone', text: shareState.title, url: shareState.link }).catch(function () {}); };
    $('btnShareFile').onclick = downloadShareFile;
    $('btnPreviewAdd').onclick = addPreviewDeck;
    $('btnPreviewCancel').onclick = closePreview;
    window.addEventListener('hashchange', openSharedLink);
    setTimeout(openSharedLink, 0);
    $('btnMatchStart').onclick = startMatch;
    $('btnQuizEmpty').onclick = function () { navigateLearning('screen-setup'); $('input').focus(); };
    $('btnHint').onclick = showHint;
    $('btnHintTyping').onclick = showHint;
    $('freezeEnabled').onchange =function () { library.streak.enabled = this.checked; persistLibrary(); renderDaily(); };
    $('dailyGoal').onchange = function () { library.goal = Math.max(1, Math.min(200, Number(this.value) || 10)); persistLibrary(); renderDaily(); };
    $('btnExportLibrary').onclick = function () {
      // Library exports never include API keys or provider configuration.
      var blob = new Blob([JSON.stringify(L.backupFile(library), null, 2)], { type: 'application/json' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'wordzone-' + L.day() + '.json'; // the name is cosmetic: restore reads the content link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    };
    $('importLibrary').onchange = async function () {
      // Reset the picker first, so choosing the same file again (e.g. after Cancel) still fires.
      var file = this.files[0]; this.value = '';
      if (!file) return;
      try {
        if (file.size > 5000000) throw new Error(tr('err.fileBig'));
        var data;
        try { data = JSON.parse(await file.text()); } catch (parseErr) { throw new Error(tr('err.badJson')); }
        if (data && data.vmShare === 1) {
          var shared;
          try { shared = window.VMShare.validatePayload(data.deck, langCodes()); } catch (e) { throw new Error(tr('shareErr.' + (e.code || 'bad-deck'))); }
          showPreview(shared);
          return;
        }
        var restored;
        try { restored = L.restoreBackup(data, LANGUAGES.KNOWN_CODES, grammarCleaner()); }
        catch (e) { throw new Error(tr({ 'not-backup': 'err.notBackup', 'bad-deck': 'err.badDeck', 'bad-word': 'err.badWord' }[e.code] || 'err.readFile')); }
        var now = L.librarySize(library), next = L.librarySize(restored);
        // Nothing to lose in an empty library; otherwise say exactly what is replaced.
        if (now.words && !window.confirm(tr('confirm.replaceDetail', { d: now.decks, w: now.words, d2: next.decks, w2: next.words }))) return;
        var previous = snapshotLibrary();
        library = restored;
        L.reconcile(library.streak, L.day()); persistLibrary(); renderLibrary(); renderDaily();
        offerUndo(tr('toast.restored'), restoreLibrary(previous));
      } catch(err) { toast(err.message || tr('err.readFile'), 'err'); }
    };
    $('typingForm').onsubmit = checkTypedAnswer;
    $('btnNextAnswer').onclick = function () {
      $('answerFeedback').hidden = true;
      // A correct typed answer after a hint is scheduled as "hard".
      if (pendingTypedAnswer !== null) { var ok = pendingTypedAnswer; pendingTypedAnswer = null; answer(ok, ok && state.hintLevel ? 'hard' : null); }
      else { updateRows(); }
    };
    $('btnQuizStart').onclick = function () {
      var d = library.decks[$('quizDeck').value];
      if (!d) { toast(tr('toast.createDeck'), 'err'); return; }
      var questions = L.quiz(d.cards, 5);
      if (!questions.length) { toast(tr('toast.need4'), 'err'); return; }
      lexical = { questions: questions, index: 0, correct: 0, answered: false };
      $('quizBody').hidden = false; $('btnQuizStart').hidden = true; renderQuiz();
    };
    $('btnQuizNext').onclick = function () {
      if (!lexical || !lexical.answered) return;
      lexical.index++; lexical.answered = false;
      if (lexical.index < lexical.questions.length) { renderQuiz(); return; }
      L.complete(library.streak, L.day()); persistLibrary(); renderDaily();
      $('quizProgress').textContent = tr('quiz.done');
      $('quizQuestion').textContent = tr('quiz.score', { c: lexical.correct, n: lexical.questions.length });
      $('quizOptions').innerHTML = ''; $('quizAnswer').textContent = tr('quiz.saved');
      $('btnQuizNext').hidden = true; $('btnQuizStart').hidden = false;
    };
  }

  /* ---------------- init ---------------- */

  var DRAFT_KEY = 'vm.draft';
  function saveDraft() { try { if ($('input').value.trim()) localStorage.setItem(DRAFT_KEY, $('input').value); else localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function restoreDraft() {
    try { var v = localStorage.getItem(DRAFT_KEY); if (v && !$('input').value.trim()) { $('input').value = v; updateInputStat(true); } } catch (e) {}
  }

  // The demo words go straight into the library so games and tests can be tried at once.
  function addDemoDeck() {
    var cards = demoCards();
    var src = state.cfg.source, tgt = state.cfg.target;
    state.cfg.source = 'en'; state.cfg.target = 'ru';
    enrichLocalContext(cards);
    state.cfg.source = src; state.cfg.target = tgt;
    var d = library.decks['en-ru'] || { source: 'en', target: 'ru', cards: [], created: Date.now() };
    cards.forEach(function (c) {
      if (d.cards.some(function (x) { return x.original.toLowerCase() === c.original.toLowerCase(); })) return;
      d.cards.push({ original: c.original, translation: c.translation, hint: c.hint || '', definition: c.definition || '', examples: c.examples || [], streak: 0, fails: 0, added: Date.now() });
    });
    library.decks['en-ru'] = d; persistLibrary();
    return 'en-ru';
  }

  var sessionOpener = null;
  function openSessionSettings(api) {
    sessionOpener = document.activeElement;
    $('sessionDialog').hidden = false;
    if (api) { $('apiBox').open = true; }
    var focus = api ? $('apiBox').querySelector('summary') : $('dirSeg').querySelector('button.on') || $('btnSessionClose');
    if (focus) focus.focus();
  }
  function closeSessionSettings() {
    $('sessionDialog').hidden = true;
    if (sessionOpener && sessionOpener.focus && document.contains(sessionOpener)) sessionOpener.focus();
  }

  // First visit: ask which language the learner speaks and which one they learn. Asked once.
  var ONBOARD_KEY = 'vm.onboarded';
  function onboardingDone() { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {} }
  function maybeOnboard() {
    var seen = null;
    try { seen = localStorage.getItem(ONBOARD_KEY); } catch (e) { return; }
    if (seen) return;
    if (Object.keys(library.decks).length || localStorage.getItem(SESSION_KEY)) { onboardingDone(); return; } // existing learners
    var nat = $('onbNative'), learn = $('onbLearn');
    var ui = I18N ? I18N.lang() : 'ru';
    fillLangSelect(nat, LANGUAGES.NATIVE_CODES, ui);
    fillLangSelect(learn, LANGUAGES.LEARN_CODES, otherLearnable(ui));
    var note = function () {
      var supported = ['ru', 'en', 'uz'].indexOf(nat.value) >= 0;
      $('onbUiNote').hidden = supported;
      if (!supported) $('onbUiNote').textContent = tr('onb.uiNote');
    };
    nat.onchange = function () {
      if (learn.value === nat.value) learn.value = otherLearnable(nat.value);
      if (I18N && ['ru', 'en', 'uz'].indexOf(nat.value) >= 0) I18N.set(nat.value);
      note();
    };
    learn.onchange = function () { if (learn.value === nat.value) nat.value = learn.value === 'en' ? 'ru' : 'en'; note(); };
    note();
    $('onboardForm').onsubmit = function (e) {
      e.preventDefault();
      state.cfg.target = nat.value; state.cfg.source = learn.value; saveCfg();
      syncLangSelects();
      onboardingDone();
      $('onboarding').hidden = true;
      toast(tr('onb.done', { l: langByCode(learn.value).label }), 'ok', 3000);
      $('input').focus({ preventScroll: true });
    };
    $('onboarding').hidden = false;
    nat.focus();
  }


  /* ---------------- Grammar Lab: rules extracted from the learner's own words (grammar.js) ---------------- */
  var GR = window.VMGrammar, grammarBusy = false, GRAM_AUTO_KEY = 'vm.grammar-auto';
  function aiAvailable() { return Boolean(state.serverHasKey || state.cfg.apiKey); }
  function gramAutoOn() { try { return localStorage.getItem(GRAM_AUTO_KEY) !== '0'; } catch (e) { return true; } }
  function catLabel(c) { return tr('gcat.' + String(c).replace(/-(\w)/g, function (m, x) { return x.toUpperCase(); })); }
  function gramStatus(text, retryKey) {
    var el = $('gramStatus');
    if (!el) return;
    el.textContent = text || '';
    if (retryKey) {
      var b = h('button', { className: 'link', type: 'button', text: tr('gram.retry') });
      b.onclick = function () { buildGrammarFor(retryKey); };
      el.appendChild(document.createTextNode(' ')); el.appendChild(b);
    }
  }
  // Sends the deck's not-yet-analysed words in batches of 12; every word is sent once.
  async function buildGrammarFor(key, quiet) {
    var d = library.decks[key];
    if (!d || grammarBusy || !GR) return;
    if (!LANGUAGES.canLearn(d.source)) { if (!quiet) gramStatus(tr('gram.unsupported', { l: langByCode(d.source).label })); return; }
    if (!aiAvailable()) { if (!quiet) renderGrammar(); return; }
    var todo = GR.pending(d);
    if (!todo.length) { if (!quiet) gramStatus(tr('gram.allDone')); return; }
    grammarBusy = true;
    var btn = $('btnGramBuild'); if (btn) btn.disabled = true;
    var size = GR.LIMITS.words, done = 0, added = 0;
    try {
      for (var i = 0; i < todo.length; i += size) {
        var batch = todo.slice(i, i + size);
        gramStatus(tr('gram.progress', { a: done, b: todo.length }));
        var items = await callAI(batch.map(function (c) { return c.original; }), { mode: 'grammar', source: d.source, target: d.target });
        if (!library.decks[key]) break; // the deck was deleted meanwhile
        added += GR.applyResults(library, d, items, Date.now());
        // Words the model skipped count as analysed: a word is never sent twice.
        batch.forEach(function (c) { if (!GR.isAnalysed(c)) c.grammarIds = []; });
        done += batch.length;
        persistLibrary();
        if ($('screen-grammar').classList.contains('active')) renderGrammarList();
      }
      gramStatus(tr('gram.done', { n: added }));
    } catch (e) {
      var reason = e && e.code ? tr('aiErr.' + e.code) : '';
      if (reason === 'aiErr.' + (e && e.code)) reason = '';
      gramStatus(tr('gram.error', { e: reason }), key);
    } finally {
      grammarBusy = false;
      if (btn) btn.disabled = false;
      if ($('screen-grammar').classList.contains('active')) renderGrammarList();
    }
  }
  // After a new session: analyse the active deck quietly in the background (setting, on by default).
  function autoGrammar() {
    if (!GR || !gramAutoOn() || !aiAvailable() || !LANGUAGES.canLearn(state.cfg.source)) return;
    var key = activeDeckKey();
    setTimeout(function () { buildGrammarFor(key, true); }, 1500);
  }
  function grammarFilters() {
    return { lang: $('gramLang').value, deck: $('gramDeck').value, category: $('gramCategory').value, level: $('gramLevel').value, q: $('gramSearch').value, sort: $('gramSort').value };
  }
  function renderGrammar() {
    if (!GR || !$('screen-grammar')) return;
    var keys = Object.keys(library.decks);
    // Build controls: decks in a learnable language.
    var bsel = $('gramBuildDeck'), keepB = bsel.value || (library.decks[state.cfg.deck] ? state.cfg.deck : activeDeckKey());
    fillDeckSelect(bsel, null, keepB);
    if (!bsel.value && bsel.options.length) bsel.value = bsel.options[0].value;
    $('gramAuto').checked = gramAutoOn();
    $('btnGramBuild').disabled = grammarBusy || !keys.length || !aiAvailable();
    // Empty / unavailable states.
    var empty = $('gramEmpty'), btn = $('btnGramEmpty');
    if (!keys.length) { empty.hidden = false; $('gramEmptyText').textContent = tr('gram.noDecks'); btn.textContent = tr('gram.addWords'); btn.onclick = function () { navigateLearning('screen-setup'); }; }
    else if (!aiAvailable()) { empty.hidden = false; $('gramEmptyText').textContent = tr('gram.noAi'); btn.textContent = tr('gram.connect'); btn.onclick = function () { $('btnSideGemini').click(); }; }
    else empty.hidden = true;
    // Filters: languages that have rules, every deck, categories and levels.
    var langSel = $('gramLang'), keepL = langSel.value, seen = Object.create(null);
    Object.keys(library.grammar || {}).forEach(function (id) { seen[library.grammar[id].lang] = true; });
    while (langSel.options.length > 1) langSel.remove(1);
    LANGUAGES.LEARN_CODES.filter(function (c) { return seen[c]; }).forEach(function (c) { langSel.appendChild(h('option', { value: c, text: langByCode(c).flag + ' ' + langByCode(c).label })); });
    var libLang = $('filterLang') && $('filterLang').value; // the library's language filter carries over
    langSel.value = seen[keepL] ? keepL : (seen[libLang] ? libLang : '');
    fillDeckSelect($('gramDeck'), tr('filter.any'), $('gramDeck').value);
    var cat = $('gramCategory'), keepC = cat.value;
    while (cat.options.length > 1) cat.remove(1);
    GR.CATEGORIES.forEach(function (c) { cat.appendChild(h('option', { value: c, text: catLabel(c) })); });
    cat.value = keepC;
    var lvl = $('gramLevel'), keepV = lvl.value;
    while (lvl.options.length > 1) lvl.remove(1);
    GR.LEVELS.forEach(function (v) { lvl.appendChild(h('option', { value: v, text: v })); });
    lvl.value = keepV;
    renderGrammarList();
  }
  function renderGrammarList() {
    var host = $('gramList');
    if (!host || !GR) return;
    var total = GR.aggregate(library, {}).length, rows = GR.aggregate(library, grammarFilters());
    host.textContent = '';
    $('gramFilters').hidden = !total;
    $('gramCount').textContent = total ? tr('gram.count', { n: rows.length }) : '';
    $('gramNone').hidden = !total || rows.length > 0;
    if (!total) {
      if (Object.keys(library.decks).length && aiAvailable()) host.appendChild(h('p', { className: 'quiz-empty', text: tr('gram.empty') }));
      return;
    }
    rows.forEach(function (row) { host.appendChild(ruleCard(row)); });
  }
  function ruleCard(row) {
    var r = row.rule, lang = langByCode(r.lang);
    var card = h('article', { className: 'panel gram-card' });
    var head = h('div', { className: 'gram-head' }, [
      h('span', { className: 'gram-lang', text: lang.flag + ' ' + lang.label }),
      h('span', { className: 'gram-badge', text: catLabel(r.category) }),
      r.level ? h('span', { className: 'gram-badge gram-level', text: r.level }) : null
    ]);
    card.appendChild(head);
    card.appendChild(h('h3', { className: 'gram-title', text: r.concept }));
    card.appendChild(h('p', { className: 'gram-expl', text: r.explanation }));
    if (r.patterns.length) {
      card.appendChild(h('p', { className: 'gram-label', text: tr('gram.patterns') }));
      var ul = h('ul', { className: 'gram-patterns' });
      r.patterns.forEach(function (p) {
        var li = h('li');
        var code = h('code', { className: 'gram-pattern', text: p.pattern }); code.lang = r.lang;
        li.appendChild(code);
        if (p.example) {
          var ex = h('span', { className: 'gram-example' });
          var t = h('span', { text: p.example }); t.lang = r.lang;
          var b = h('button', { className: 'speak-btn speak-mini', type: 'button' });
          b.innerHTML = SPEAK_ICON;
          setSpeakBtn(b, r.lang, 'card.speakExample');
          b.onclick = function () { speakText(p.example, r.lang, b); };
          ex.appendChild(t); ex.appendChild(b);
          li.appendChild(ex);
        }
        if (p.translation) li.appendChild(h('span', { className: 'gram-trans', text: p.translation }));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    if (r.pitfall) {
      var pf = h('div', { className: 'gram-pitfall' });
      pf.appendChild(h('p', { className: 'gram-label', text: tr('gram.pitfall') }));
      var wrong = h('s', { className: 'gram-wrong', text: r.pitfall.mistake }); wrong.lang = r.lang;
      var right = h('mark', { className: 'gram-right', text: r.pitfall.correction }); right.lang = r.lang;
      pf.appendChild(h('p', { className: 'gram-fix' }, [wrong, h('span', { className: 'gram-arrow', 'aria-hidden': 'true', text: '→' }), right]));
      if (r.pitfall.note) pf.appendChild(h('p', { className: 'gram-note', text: r.pitfall.note }));
      card.appendChild(pf);
    }
    var words = h('div', { className: 'gram-words' }, [h('span', { className: 'gram-label', text: tr('gram.words') })]);
    row.words.slice(0, 12).forEach(function (w) {
      var chip = h('button', { className: 'chip-btn gram-word', type: 'button', title: tr('gram.wordOpen', { w: w.card.original }), text: w.card.original });
      chip.onclick = function () { openWordInLibrary(w.card.original); };
      words.appendChild(chip);
    });
    card.appendChild(words);
    var practice = h('button', { className: 'btn gram-practice', type: 'button', text: tr('gram.practice') });
    practice.onclick = function () { practiceRule(row); };
    card.appendChild(h('div', { className: 'actions' }, [practice]));
    return card;
  }
  function openWordInLibrary(word) {
    navigateLearning('screen-library');
    var s = $('librarySearch');
    s.value = word; renderSearch();
    var res = $('searchResults'); if (res && res.scrollIntoView) res.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // A short session from the rule's words, in the deck that holds most of them.
  function practiceRule(row) {
    var by = Object.create(null);
    row.words.forEach(function (w) { (by[w.deckKey] = by[w.deckKey] || []).push(w.card); });
    var key = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; })[0];
    if (!key) return;
    setActiveDeck(key);
    startTraining(by[key].filter(function (c) { return c.translation && c.translation !== '—'; }));
  }
  function initGrammar() {
    if (!GR || !$('screen-grammar')) return;
    $('btnGramBuild').onclick = function () { buildGrammarFor($('gramBuildDeck').value); };
    $('gramAuto').onchange = function () { try { localStorage.setItem(GRAM_AUTO_KEY, this.checked ? '1' : '0'); } catch (e) {} };
    ['gramDeck', 'gramCategory', 'gramLevel', 'gramSort'].forEach(function (id) { $(id).onchange = renderGrammarList; });
    $('gramLang').onchange = function () {
      // Keep the library's language filter in step.
      var f = $('filterLang');
      if (f && Array.prototype.some.call(f.options, function (o) { return o.value === $('gramLang').value; })) f.value = $('gramLang').value;
      renderGrammarList();
    };
    $('gramSearch').oninput = renderGrammarList;
  }

  /* ---------------- account: the library and language choice follow the learner across devices ---------------- */
  var CODES = LANGUAGES.KNOWN_CODES; // every known code, so archived decks survive cloud sync
  function syncData() {
    var c = state.cfg;
    return { v: 1, library: library, cfg: { source: c.source, target: c.target, dir: c.dir, mode: c.mode, simple: c.simple, deck: c.deck } }; // never the API key
  }
  function cleanLibrary(lib) { try { return L.restoreBackup(L.backupFile(lib), CODES, grammarCleaner()); } catch (e) { return null; } }
  function grammarCleaner() { return window.VMGrammar ? window.VMGrammar.cleanStore : null; }
  function applySyncData(data) {
    var lib = data && cleanLibrary(data.library);
    if (!lib) return false;
    library = lib;
    L.reconcile(library.streak, L.day()); persistLibrary();
    var c = data.cfg || {};
    if (CODES.indexOf(c.source) >= 0 && CODES.indexOf(c.target) >= 0 && c.source !== c.target) {
      state.cfg.source = c.source; state.cfg.target = c.target;
      syncLangSelects();
    }
    if (typeof c.deck === 'string') state.cfg.deck = library.decks[c.deck] ? c.deck : '';
    if (/^(mixed|fwd|rev)$/.test(c.dir)) setDir(c.dir);
    if (/^(flashcard|typing|listen)$/.test(c.mode)) { state.cfg.mode = c.mode; document.querySelectorAll('#modeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === c.mode); }); }
    if (typeof c.simple === 'boolean') { state.cfg.simple = c.simple; $('simpleMode').checked = c.simple; }
    saveCfg();
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {}
    renderDaily();
    if ($('screen-library').classList.contains('active')) renderLibrary();
    if ($('screen-progress').classList.contains('active')) renderProgress();
    if ($('screen-test').classList.contains('active') && !lexical) fillQuizDecks();
    if (games) games.refresh();
    return true;
  }
  function mountAccount(cfg) {
    account = window.VMAccount.mount(cfg, {
      tr: tr, toast: toast, lang: function () { return I18N ? I18N.lang() : 'ru'; },
      getData: syncData, setData: applySyncData,
      merge: function (local, remote) {
        var other = remote && cleanLibrary(remote.library);
        return other ? { v: 1, library: L.mergeLibrary(local.library, other), cfg: local.cfg } : local;
      }
    });
  }

  function refreshLanguage() {
    updateSoundUI(); updateApiStatus(); updateInputStat(true); syncLangSelects(); updateSpeakButtons();
    var active = document.querySelector('.screen.active');
    if (active) updateShell(active.id);
    if (!L) return;
    renderDaily();
    if ($('screen-library').classList.contains('active')) renderLibrary();
    if ($('screen-test').classList.contains('active') && !lexical) fillQuizDecks();
    if ($('screen-progress').classList.contains('active')) renderProgress();
    if ($('screen-grammar').classList.contains('active')) renderGrammar();
    if (games) games.refresh();
    if (account) account.refresh();
    if (state.cards.length) $('topPill').textContent = trn('pill.cards', state.cards.length);
    if (state.summaryMsg) $('summaryMsg').textContent = summaryMessage();
    if (state.current && $('screen-train').classList.contains('active') && !state.revealed && !answerLocked) renderCard();
    toast(tr('toast.uiLang'), 'ok', 1400);
  }

  function init() {
    loadCfg();
    if (L) {
      // Offline support and "install app"; plain http (except localhost) cannot register workers.
      if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(function () {});
      var installEvt = null;
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('btnInstall').hidden = false; });
      window.addEventListener('appinstalled', function () { $('btnInstall').hidden = true; });
      window.addEventListener('offline', function () { toast(tr('toast.offline'), 'err', 4000); });
      window.addEventListener('online', function () { importantUntil = 0; toast(tr('toast.online'), 'ok', 2000); retryMissingTranslations(); });
      setTimeout(retryMissingTranslations, 4000);
      $('btnInstall').addEventListener('click', async function () {
        if (!installEvt) return;
        installEvt.prompt();
        try { await installEvt.userChoice; } catch (e) {}
        installEvt = null; $('btnInstall').hidden = true;
      });
    }
    if (I18N) {
      I18N.apply();
      var pills = function () {
        document.querySelectorAll('#uiLang [data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === I18N.lang())); });
      };
      pills();
      var current = document.querySelector('.screen.active'); if (current) updateShell(current.id);
      $('uiLang').addEventListener('click', function (e) {
        var b = e.target.closest('[data-lang]');
        if (b && b.dataset.lang !== I18N.lang()) I18N.set(b.dataset.lang);
      });
      I18N.onChange(function () { pills(); refreshLanguage(); });
    }
    updateSoundUI();
    checkServerStatus();
    if (L) initLearningUI();
    if (L) maybeOnboard();

    var sel = $('targetLang');
    syncLangSelects();
    $('cfgBaseUrl').value = state.cfg.baseUrl;
    $('cfgModel').value = state.cfg.model;
    $('cfgKey').value = state.cfg.apiKey;
    syncProviderChip();
    setDir(state.cfg.dir);

    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.cards && s.cards.length) $('resumeBox').hidden = false;
    } catch (e) {}

    updateInputStat(true);

    /* setup events */
    $('input').addEventListener('input', updateInputStat);
    $('input').addEventListener('input', saveDraft);
    if (L) restoreDraft();
    $('btnClear').addEventListener('click', function () {
      var previous = $('input').value;
      $('input').value = '';
      updateInputStat();
      $('input').focus();
      if (L && previous.trim()) offerUndo(tr('undo.cleared'), function () { $('input').value = previous; updateInputStat(true); $('input').focus(); });
    });

    $('btnPaste').addEventListener('click', async function () {
      try {
        var clip = await navigator.clipboard.readText();
        if (!clip) return toast(tr('toast.clipEmpty'), 'err');
        $('input').value = ($('input').value ? $('input').value.replace(/\s*$/, '\n') : '') + clip;
        updateInputStat();
        toast(tr('toast.pasted'), 'ok', 1400);
      } catch (e) {
        toast(tr('toast.clipBlocked'), 'err', 4000);
      }
    });

    /* Preset chips */
    document.querySelectorAll('.preset-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.preset;
        if (PRESETS[key]) {
          $('input').value = PRESETS[key].join('\n');
          updateInputStat(true);
          toast(tr('toast.preset', { n: btn.textContent }), 'ok', 1800);
        }
      });
    });

    /* Provider chips */
    document.querySelectorAll('.prov-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.prov-chip').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        var p = btn.dataset.prov;
        if (p === 'free') {
          $('cfgKey').value = '';
          state.cfg.apiKey = '';
          toast(tr('toast.provFree'), 'ok');
        } else if (p === 'openai') {
          $('cfgBaseUrl').value = 'https://api.openai.com/v1';
          $('cfgModel').value = 'gpt-4o-mini';
          $('cfgKey').focus();
          toast(tr('toast.provOpenai'), 'ok');
        } else if (p === 'gemini') {
          $('cfgBaseUrl').value = window.VMAICore.GEMINI.baseUrl;
          $('cfgModel').value = window.VMAICore.GEMINI.model;
          $('cfgKey').focus();
          toast(tr('toast.provGemini'), 'ok', 4000);
        } else if (p === 'groq') {
          $('cfgBaseUrl').value = 'https://api.groq.com/openai/v1';
          $('cfgModel').value = 'llama-3.3-70b-versatile';
          $('cfgKey').focus();
          toast(tr('toast.provGroq'), 'ok');
        } else if (p === 'openrouter') {
          $('cfgBaseUrl').value = 'https://openrouter.ai/api/v1';
          $('cfgModel').value = 'google/gemini-2.5-flash';
          $('cfgKey').focus();
          toast(tr('toast.provOpenrouter'), 'ok');
        }
      });
    });

    sel.addEventListener('change', function () {
      if (L) releaseDeck();
      var prev = state.cfg.target; state.cfg.target = sel.value;
      if (L && state.cfg.source === sel.value) state.cfg.source = LANGUAGES.canLearn(prev) ? prev : otherLearnable(sel.value);
      syncLangSelects(); saveCfg();
    });
    $('dirSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-dir]');
      if (b) setDir(b.dataset.dir);
    });

    $('btnSaveCfg').addEventListener('click', function () {
      state.cfg.baseUrl = $('cfgBaseUrl').value.trim() || 'https://api.openai.com/v1';
      state.cfg.model = $('cfgModel').value.trim() || 'gpt-4o-mini';
      state.cfg.apiKey = $('cfgKey').value.trim();
      saveCfg(); syncProviderChip();
      toast(tr('toast.cfgSaved'), 'ok');
    });

    $('btnResetCfg').addEventListener('click', function () {
      state.cfg.baseUrl = 'https://api.openai.com/v1';
      state.cfg.model = 'gpt-4o-mini';
      state.cfg.apiKey = '';
      $('cfgBaseUrl').value = state.cfg.baseUrl;
      $('cfgModel').value = state.cfg.model;
      $('cfgKey').value = '';
      saveCfg(); syncProviderChip();
      toast(tr('toast.cfgReset'), 'ok');
    });

    $('btnStart').addEventListener('click', start);
    $('btnDemo').addEventListener('click', function () {
      state.cfg.target = 'ru'; state.cfg.source = 'en'; syncLangSelects(); saveCfg();
      toast(tr('toast.demo'), 'ok');
      startTraining(demoCards());
    });

    $('btnResume').addEventListener('click', function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (s && s.cards && s.cards.length) {
          if (s.source) state.cfg.source = s.source;
          if (s.target) state.cfg.target = s.target;
          syncLangSelects();
          if (s.dir) setDir(s.dir);
          startTraining(s.cards, s);
        }
      } catch (e) { toast(tr('toast.resumeFail'), 'err'); }
    });

    $('btnCancel').addEventListener('click', function () {
      state.cancelled = true;
      show('screen-setup');
    });

    $('btnSound').addEventListener('click', toggleSound);

    $('btnSettings').addEventListener('click', function () { openSessionSettings(true); });
    $('btnSessionSettings').addEventListener('click', function () { openSessionSettings(false); });
    $('btnSessionClose').addEventListener('click', closeSessionSettings);
    $('sessionDialog').addEventListener('click', function (e) { if (e.target === this) closeSessionSettings(); });
    $('btnHeroDemo').addEventListener('click', function () { $('btnDemo').click(); });
    $('btnHeroOwn').addEventListener('click', function () { $('input').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('input').focus({ preventScroll: true }); });

    $('btnOwnKey').addEventListener('click', function () { ownKeyOpen = !ownKeyOpen; updateApiStatus(); if (ownKeyOpen) $('cfgKey').focus(); });
    $('btnMenu').addEventListener('click', function () { setSidebar(!document.body.classList.contains('side-open')); });
    $('sideBackdrop').addEventListener('click', function () { setSidebar(false); $('btnMenu').focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('side-open')) { setSidebar(false); $('btnMenu').focus(); }
    });
    $('btnSideGemini').addEventListener('click', function () {
      $('btnSettings').click();
      var chip = document.querySelector('.prov-chip[data-prov="gemini"]');
      if (chip && !window.VMAICore.isGemini(state.cfg.baseUrl)) chip.click();
      setTimeout(function () { $('cfgKey').focus({ preventScroll: true }); }, 400);
    });

    $('logoHome').addEventListener('click', function (e) {
      e.preventDefault();
      if ($('screen-train').classList.contains('active')) {
        showSummary();
      } else {
        state.cancelled = true;
        show('screen-setup');
      }
    });

    /* Card face speak buttons */
    // The speaker buttons sit on the card: they must never flip it.
    $('btnSpeakFront').addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (!state.current) return;
      if (isListen()) speakText(state.current.original, state.cfg.source, this);
      else speakText($('cardWord').textContent, frontLang(), this);
    });
    $('btnSpeakBack').addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (state.current) speakText($('cardTrans').textContent, backLang(), this);
    });
    if (hasSpeech()) {
      loadVoices();
      var synth = window.speechSynthesis;
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
      else if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;
    }
    $('btnSpeakCur').addEventListener('click', speakCurrent);

    /* Training buttons */
    $('btnReveal').addEventListener('click', reveal);
    $('btnKnew').addEventListener('click', function () { answer(true); });
    $('btnForgot').addEventListener('click', function () { answer(false); });
    $('btnKnew2').addEventListener('click', function () { answer(true); });
    $('btnHard').addEventListener('click', function () { answer(true, 'hard'); });
    $('btnEasy').addEventListener('click', function () { answer(true, 'easy'); });
    $('card').addEventListener('click', toggleCard);
    $('card').addEventListener('vm-swipe', function (e) { if (state.cfg.mode === 'flashcard' && state.revealed && !answerLocked) answer(e.detail.known); });

    /* Мягкий 3D-наклон карточки за курсором (только мышь + если нет reduced-motion) */
    try {
      var canTilt = !L && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
        !(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (canTilt) {
        var cardEl = $('card');
        cardEl.addEventListener('pointermove', function (e) {
          var r = cardEl.getBoundingClientRect();
          if (!r.width || !r.height) return;
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          cardEl.style.transform = 'perspective(1200px) rotateX(' + (-py * 6).toFixed(2) +
            'deg) rotateY(' + (px * 7).toFixed(2) + 'deg)';
        });
        cardEl.addEventListener('pointerleave', function () { cardEl.style.transform = ''; });
      }
    } catch (e) {}
    $('btnExit').addEventListener('click', showSummary);

    $('btnShuffle').addEventListener('click', function () {
      shuffle(state.roundQueue);
      if (window.VMMotion) updateNextPreview();
      toast(tr('toast.shuffled'), 'ok', 1400);
      renderStats();
    });

    $('btnDirCycle').addEventListener('click', function () {
      var order = ['mixed', 'fwd', 'rev'];
      var next = order[(order.indexOf(state.cfg.dir) + 1) % order.length];
      setDir(next); saveCfg();
      if (window.VMMotion) { state.previewId = null; updateNextPreview(); }
      toast(tr('toast.dir', { d: tr('dir.' + next) }), 'ok', 1800);
    });

    /* Summary and tools buttons */
    $('btnContinue').addEventListener('click', hideSummary);
    $('btnNewSet').addEventListener('click', startNewSet);
    var btnNewSetTrain = $('btnNewSetTrain');
    if (btnNewSetTrain) {
      btnNewSetTrain.addEventListener('click', startNewSet);
    }
    $('btnCopyStats').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(statsText());
        toast(tr('toast.statsCopied'), 'ok');
      } catch (e) { toast(tr('toast.copyFail'), 'err'); }
    });

    /* Global keyboard shortcuts */
    document.addEventListener('keydown', function (e) {
      // Alt+X swaps languages on the setup screen, even while typing the word list.
      if (L && e.altKey && e.code === 'KeyX' && $('screen-setup').classList.contains('active')) { e.preventDefault(); swapLanguages(); return; }
      if (!$('onboarding').hidden || !$('accountDialog').hidden) return;
      if (!$('deckDialog').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeDeckDialog(); } return; }
      if (!$('sessionDialog').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeSessionSettings(); } return; }
      if (!$('shareDialog').hidden || !$('sharePreview').hidden || !$('displayDialog').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); if (!$('displayDialog').hidden) closeDisplay(); else if (!$('shareDialog').hidden) closeShare(); else closePreview(); }
        return;
      }
      if (games && games.active()) return;
      if (e.target.matches('input,textarea,select')) return;
      var k = e.key;
      // Space / Enter on a focused speaker button presses that button, not the card.
      if ((k === ' ' || k === 'Enter') && e.target.closest && e.target.closest('.speak-btn')) return;
      if (L && answerLocked) return;
      if (L && !$('answerFeedback').hidden && k === 'Enter') { e.preventDefault(); $('btnNextAnswer').click(); return; }
      if (isTyping() && $('screen-train').classList.contains('active') && $('summary').hidden) {
        if (k === 'Escape') showSummary();
        else if (k === 'u' || k === 'U' || k === 'г' || k === 'Г') undoAnswer();
        return;
      }

      if ($('screen-train').classList.contains('active') && $('summary').hidden) {
        if (k === ' ' || k === 'Enter' || k === 'ArrowDown') {
          e.preventDefault();
          pulseHint(0);
          if (k === ' ') toggleCard();
          else state.revealed ? answer(true) : reveal();
        } else if (k === '1' || k === 'ArrowLeft') {
          e.preventDefault();
          pulseHint(1);
          state.revealed ? answer(false) : reveal();
        } else if (k === '2' || k === 'ArrowRight') {
          e.preventDefault();
          pulseHint(2);
          answer(true);
        } else if (L && (k === '3' || k === '4')) {
          e.preventDefault();
          if (state.revealed) answer(true, k === '3' ? 'hard' : 'easy'); else reveal();
        } else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') {
          e.preventDefault();
          pulseHint(3);
          speakCurrent();
        } else if (L && (k === 'h' || k === 'H' || k === 'р' || k === 'Р')) {
          e.preventDefault();
          pulseHint(5);
          showHint();
        } else if (L && (k === 'u' || k === 'U' || k === 'г' || k === 'Г' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ'))) {
          e.preventDefault();
          pulseHint(6);
          undoAnswer();
        } else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') {
          e.preventDefault();
          toggleSound();
        } else if (k === 'Escape') {
          e.preventDefault();
          pulseHint(4);
          showSummary();
        }
      } else if (!$('summary').hidden && k === 'Escape') {
        hideSummary();
      } else if (L && (k === 'u' || k === 'U' || k === 'г' || k === 'Г') && runLibraryUndo()) {
        e.preventDefault();
      }
    });

    window.addEventListener('popstate', function () {
      if ($('screen-train').classList.contains('active')) {
        showSummary();
      }
    });
  }

  function setDir(dir) {
    state.cfg.dir = dir;
    document.querySelectorAll('#dirSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.dir === dir);
    });
    saveCfg();
  }

  var statTimer = null;
  function updateInputStat(silent) {
    clearTimeout(statTimer);
    var applyStats = function () {
      var val = $('input').value;
      var p = parseInput(val);
      $('inputStat').textContent = trn('words.count', p.items.length) + (p.dropped ? tr('words.dropped', { n: p.dropped }) : '');

      // Legacy auto-detection is retained for old embeds, not explicit language selectors.
      if (L) return;
      // Smart target language switch on Cyrillic/Latin script detection
      var scr = detectScript(val);
      var sel = $('targetLang');
      if (scr === 'ru' && state.cfg.target === 'ru') {
        state.cfg.target = 'en';
        if (sel) sel.value = 'en';
        saveCfg();
        if (!silent) toast('Обнаружен русский текст → переводим на English', 'ok', 1800);
      } else if (scr === 'en' && state.cfg.target === 'en') {
        state.cfg.target = 'ru';
        if (sel) sel.value = 'ru';
        saveCfg();
        if (!silent) toast('Обнаружен английский текст → переводим на Русский', 'ok', 1800);
      }
    };
    if (silent) {
      applyStats();
    } else {
      statTimer = setTimeout(applyStats, 180);
    }
  }


  document.addEventListener('DOMContentLoaded', init);
})();
