/* Share a deck as a link: words, translations and examples (never SM-2 progress) are compressed with
   CompressionStream('deflate') and base64url-encoded into the URL fragment (#deck=1.…). A fragment is not sent
   to any server. Decoding is strict: size limits before and during inflation, schema and length checks, and
   everything comes back as plain strings for textContent. Shared by the browser and the Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMShare = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var VERSION = 1;
  var LIMITS = { linkChars: 8000, qrChars: 1200, cards: 1000, original: 200, translation: 300, example: 300, examples: 2, reading: 200, inflatedBytes: 512 * 1024 };
  var CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+', 'g');

  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function clean(s) { return String(s).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim(); }
  function cut(s, n) { s = clean(s); return s.length > n ? s.slice(0, n) : s; }

  function toBase64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(text) {
    var bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Pipes bytes through a (De)CompressionStream; stops as soon as the output passes `limit` bytes.
  async function transform(bytes, stream, limit) {
    var reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), chunks = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (limit && total > limit) { try { await reader.cancel(); } catch (e) {} throw fail('too-large'); }
      chunks.push(r.value);
    }
    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  // Compact wire format: { v, s, t, c: [[original, translation, example1?, example2?], …], r?: [reading, …] }
  // r (Pinyin and the like) is optional and aligned with c; links without it decode exactly as before.
  function payloadOf(deck) {
    var seen = Object.create(null), rows = [], readings = [];
    (deck.cards || []).forEach(function (c) {
      if (!c || !c.original || !c.translation || c.translation === '—') return;
      var original = cut(c.original, LIMITS.original), translation = cut(c.translation, LIMITS.translation);
      if (!original || !translation || seen[original.toLowerCase()] || rows.length >= LIMITS.cards) return;
      seen[original.toLowerCase()] = true;
      readings.push(typeof c.reading === 'string' ? cut(c.reading, LIMITS.reading) : '');
      rows.push([original, translation].concat((c.examples || []).filter(function (x) { return typeof x === 'string' && clean(x); }).slice(0, LIMITS.examples).map(function (x) { return cut(x, LIMITS.example); })));
    });
    var payload = { v: VERSION, s: deck.source, t: deck.target, c: rows };
    if (readings.some(Boolean)) payload.r = readings;
    var name = typeof deck.name === 'string' ? clean(deck.name).slice(0, 60) : '';
    if (name) payload.n = name;
    return payload;
  }
  async function encodeDeck(deck) {
    var payload = payloadOf(deck);
    if (!payload.c.length) throw fail('empty');
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    return VERSION + '.' + toBase64Url(await transform(bytes, new CompressionStream('deflate')));
  }

  // Validates a decoded payload (from a link or a shared file). Throws .code 'bad-deck' / 'too-large'.
  function validatePayload(data, langCodes) {
    var langs = Object.create(null); // a plain {} would accept "__proto__" as a language
    (langCodes || []).forEach(function (c) { langs[c] = true; });
    if (!data || typeof data !== 'object' || data.v !== VERSION) throw fail('bad-deck');
    if (!langs[data.s] || !langs[data.t] || data.s === data.t) throw fail('bad-deck');
    if (!Array.isArray(data.c) || !data.c.length) throw fail('bad-deck');
    if (data.c.length > LIMITS.cards) throw fail('too-large');
    if (data.r !== undefined && (!Array.isArray(data.r) || data.r.length !== data.c.length || !data.r.every(function (x) { return typeof x === 'string' && x.length <= LIMITS.reading; }))) throw fail('bad-deck');
    var seen = Object.create(null), cards = [];
    data.c.forEach(function (row, i) {
      if (!Array.isArray(row) || row.length < 2 || row.length > 2 + LIMITS.examples || !row.every(function (x) { return typeof x === 'string'; })) throw fail('bad-deck');
      var original = clean(row[0]), translation = clean(row[1]);
      if (!original || !translation || original.length > LIMITS.original || translation.length > LIMITS.translation) throw fail('bad-deck');
      var examples = row.slice(2).map(clean).filter(Boolean);
      if (examples.some(function (x) { return x.length > LIMITS.example; })) throw fail('bad-deck');
      if (seen[original.toLowerCase()]) return;
      seen[original.toLowerCase()] = true;
      var card = { original: original, translation: translation, examples: examples };
      var reading = data.r ? clean(data.r[i]) : '';
      if (reading) card.reading = reading;
      cards.push(card);
    });
    var out = { source: data.s, target: data.t, cards: cards };
    if (data.n !== undefined) {
      if (typeof data.n !== 'string' || data.n.length > 60) throw fail('bad-deck');
      var name = clean(data.n);
      if (name) out.name = name;
    }
    return out;
  }
  // Throws .code: 'bad-link' (not ours / damaged), 'unsupported-version', 'too-large', 'bad-deck'.
  async function decodeDeck(code, langCodes) {
    if (typeof code !== 'string' || !code) throw fail('bad-link');
    if (code.length > LIMITS.linkChars) throw fail('too-large');
    var m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!m) throw fail('bad-link');
    if (Number(m[1]) !== VERSION) throw fail('unsupported-version');
    var bytes, json;
    try { bytes = fromBase64Url(m[2]); } catch (e) { throw fail('bad-link'); }
    try { json = new TextDecoder('utf-8', { fatal: true }).decode(await transform(bytes, new DecompressionStream('deflate'), LIMITS.inflatedBytes)); }
    catch (e) { throw e.code === 'too-large' ? e : fail('bad-link'); }
    var data;
    try { data = JSON.parse(json); } catch (e) { throw fail('bad-link'); }
    return validatePayload(data, langCodes);
  }
  function codeFromHash(hash) {
    var m = /^#deck=(.*)$/.exec(String(hash || ''));
    return m ? m[1] : null;
  }
  return { VERSION: VERSION, LIMITS: LIMITS, payloadOf: payloadOf, encodeDeck: encodeDeck, decodeDeck: decodeDeck, validatePayload: validatePayload, codeFromHash: codeFromHash };
});
