/* The one list of languages. Every other module (app, AI contract, server, backup, share links, tests) reads it.
   role: 'learn'  — can be learned and can be the native (translation) language;
         'native' — native / interface language only (Russian); switch to 'learn' to make it learnable;
         'legacy' — no longer offered for new decks, but every validator still accepts it so old data keeps loading.
   Also holds the Uzbek text helpers (apostrophes, Cyrillic → Latin). Shared by the browser and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMLanguages = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var LIST = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', voice: 'en-US', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['prepositions', 'phrasal verbs', 'irregular verbs', 'irregular plurals', 'articles'] },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', voice: 'es-ES', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['conjugation', 'gender and articles', 'prepositions after verbs', 'ser / estar'] },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', voice: 'fr-FR', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['conjugation', 'gender and articles', 'prepositions after verbs', 'irregular plurals'] },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', voice: 'de-DE', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['cases and case government', 'gender and articles', 'separable verbs', 'verb-second word order', 'plural forms'] },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', voice: 'ja-JP', script: 'kana-kanji', role: 'learn', reading: null,
      grammarFeatures: ['particles', 'politeness levels', 'verb groups', 'counters'] },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', voice: 'ko-KR', script: 'hangul', role: 'learn', reading: null,
      grammarFeatures: ['particles', 'speech levels', 'verb endings'] },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', voice: 'zh-CN', script: 'hanzi', role: 'learn', reading: 'pinyin',
      grammarFeatures: ['measure words', 'aspect particles', 'tones'] },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', voice: 'it-IT', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['conjugation', 'gender and articles', 'prepositions after verbs', 'essere / avere'] },
    { code: 'uz', name: 'Uzbek', nativeName: "O'zbekcha", flag: '🇺🇿', voice: 'uz-UZ', script: 'latin', role: 'learn', reading: null,
      grammarFeatures: ['agglutinative suffix order', 'case suffixes', 'possessive suffixes', 'tense and aspect suffixes', 'postpositions', 'no grammatical gender'] },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', voice: 'ru-RU', script: 'cyrillic', role: 'native', reading: null, grammarFeatures: [] },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', voice: 'tr-TR', script: 'latin', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', voice: 'pt-BR', script: 'latin', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', flag: '🇰🇿', voice: 'kk-KZ', script: 'cyrillic', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca', flag: '🇦🇿', voice: 'az-AZ', script: 'latin', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'ka', name: 'Georgian', nativeName: 'ქართული', flag: '🇬🇪', voice: 'ka-GE', script: 'georgian', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', voice: 'uk-UA', script: 'cyrillic', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', voice: 'pl-PL', script: 'latin', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', voice: 'ar-SA', script: 'arabic', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷', voice: 'fa-IR', script: 'arabic', role: 'legacy', reading: null, grammarFeatures: [] },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', voice: 'hi-IN', script: 'devanagari', role: 'legacy', reading: null, grammarFeatures: [] }
  ];
  // `label` is the name the UI has always shown (the language's own name).
  LIST.forEach(function (l) { l.label = l.nativeName; Object.freeze(l.grammarFeatures); Object.freeze(l); });
  Object.freeze(LIST);

  var BY = Object.create(null);
  LIST.forEach(function (l) { BY[l.code] = l; });
  function get(code) { return BY[code] || null; }
  function isKnown(code) { return Boolean(BY[code]); }
  function canLearn(code) { var l = BY[code]; return Boolean(l && l.role === 'learn'); }
  function canBeNative(code) { var l = BY[code]; return Boolean(l && (l.role === 'learn' || l.role === 'native')); }
  function isLegacy(code) { var l = BY[code]; return Boolean(l && l.role === 'legacy'); }
  // A deck that could not be created today (learning Russian, or a legacy language on either side).
  function isArchivedPair(source, target) { return !(canLearn(source) && canBeNative(target)); }

  var KNOWN_CODES = LIST.map(function (l) { return l.code; });
  var LEARN_CODES = KNOWN_CODES.filter(canLearn);
  var NATIVE_CODES = KNOWN_CODES.filter(canBeNative);

  /* ---------- Uzbek ---------- */
  // Canonical Uzbek Latin: oʻ / gʻ with U+02BB, the tutuq belgisi (ma'no) with U+02BC.
  var OKINA = 'ʻ', TUTUQ = 'ʼ';
  var APOS = "'‘’`ʻʼ";
  var APOS_RE = new RegExp('[' + APOS + ']', 'g');
  function normalizeUzApostrophes(s) {
    var str = String(s == null ? '' : s);
    return str.replace(APOS_RE, function (ch, i) {
      var prev = i > 0 ? str.charAt(i - 1) : '';
      if (/[oOgG]/.test(prev)) return OKINA;
      if (prev && /\p{L}/u.test(prev)) return TUTUQ;
      return ch; // an opening quote or a stray mark: left alone
    });
  }
  // Every apostrophe-like character as one, for comparing answers and spotting duplicates (all languages).
  function foldApostrophes(s) { return String(s == null ? '' : s).replace(APOS_RE, "'"); }

  var CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ч': 'ch', 'ш': 'sh',
    'қ': 'q', 'ғ': 'g' + OKINA, 'ў': 'o' + OKINA, 'ҳ': 'h', 'ё': 'yo', 'ю': 'yu', 'я': 'ya', 'ъ': TUTUQ, 'ь': '', 'э': 'e',
    'щ': 'sh', 'ы': 'i'
  };
  var CYR_VOWEL = /[аеёиоуэюяўАЕЁИОУЭЮЯЎ]/;
  var IS_CYR = /[Ѐ-ӿ]/;
  function isUpper(ch) { return ch !== ch.toLowerCase() && ch === ch.toUpperCase(); }
  // Official Uzbek Cyrillic → Latin. Text without Cyrillic comes back unchanged.
  function uzCyrToLat(s) {
    var str = String(s == null ? '' : s);
    if (!IS_CYR.test(str)) return str;
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i), low = ch.toLowerCase(), prev = i > 0 ? str.charAt(i - 1) : '', next = str.charAt(i + 1);
      var lat;
      if (low === 'е') {
        var wordStart = !prev || !/[\p{L}]/u.test(prev);
        lat = wordStart || CYR_VOWEL.test(prev) || /[ъьЪЬ]/.test(prev) ? 'ye' : 'e';
      } else if (low === 'ц') {
        lat = CYR_VOWEL.test(prev) && CYR_VOWEL.test(next) ? 'ts' : 's';
      } else if (Object.prototype.hasOwnProperty.call(CYR, low)) {
        lat = CYR[low];
      } else { out += ch; continue; }
      if (lat && isUpper(ch)) {
        // ШАХАР → SHAHAR, Шахар → Shahar: a whole upper-case word stays upper case.
        var neighbour = (next && /\p{L}/u.test(next)) ? next : prev;
        var allCaps = neighbour && /\p{L}/u.test(neighbour) && isUpper(neighbour);
        lat = allCaps ? lat.toUpperCase() : lat.charAt(0).toUpperCase() + lat.slice(1);
      }
      out += lat;
    }
    return out;
  }
  function normalizeUz(s) { return normalizeUzApostrophes(uzCyrToLat(s)); }

  /* ---------- speech ---------- */
  // Best installed voice for a BCP-47 tag: the exact tag first (uz-UZ), then any voice of the language (uz-*).
  // Returns null when the device has none, so the UI can say so instead of speaking with a wrong-language voice.
  function pickVoice(voices, tag) {
    var want = String(tag || '').toLowerCase().replace(/_/g, '-'), base = want.split('-')[0];
    if (!base || !voices || !voices.length) return null;
    var list = Array.prototype.slice.call(voices).filter(function (v) { return v && v.lang; });
    function lang(v) { return String(v.lang).toLowerCase().replace(/_/g, '-'); }
    var exact = list.filter(function (v) { return lang(v) === want; });
    var near = exact.length ? exact : list.filter(function (v) { return lang(v).split('-')[0] === base; });
    if (!near.length) return null;
    // Prefer a local voice (works offline), then the browser's default for that language.
    return near.find(function (v) { return v.localService && v.default; }) || near.find(function (v) { return v.localService; }) || near[0];
  }

  return {
    LIST: LIST, KNOWN_CODES: KNOWN_CODES, LEARN_CODES: LEARN_CODES, NATIVE_CODES: NATIVE_CODES,
    get: get, isKnown: isKnown, canLearn: canLearn, canBeNative: canBeNative, isLegacy: isLegacy, isArchivedPair: isArchivedPair,
    normalizeUzApostrophes: normalizeUzApostrophes, foldApostrophes: foldApostrophes, uzCyrToLat: uzCyrToLat, normalizeUz: normalizeUz,
    pickVoice: pickVoice, OKINA: OKINA, TUTUQ: TUTUQ
  };
});
