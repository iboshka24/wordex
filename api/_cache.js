/* Shared translation cache (v2.26).
 *
 * A word that anyone has already translated for a language pair is served from Supabase instantly,
 * without spending the AI quota. Only the server reads and writes it: the table has row-level security
 * and no policies, so the public key cannot touch it (see supabase/schema.sql).
 *
 * Needs SUPABASE_URL and a server-only key in SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * Without them the cache is off and everything works as before. Any cache error is ignored:
 * the cache may make a request faster, never make it fail.
 */
'use strict';

// Bump when the translation prompt changes, so older answers are not reused.
const VERSION = 2;
const TIMEOUT_MS = 2500;
const TABLE = 'translation_cache';

function config() {
  const env = process.env;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return /^https:\/\//.test(url) && key ? { url, key } : null;
}
const enabled = () => Boolean(config());

// One spelling per word: case, spacing and Unicode form do not create separate entries.
const norm = w => String(w).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function headers(key, extra) {
  const h = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, extra);
  // Legacy service-role keys are JWTs and also go in Authorization; new sb_secret_ keys must not.
  if (/^eyJ/.test(key)) h.Authorization = 'Bearer ' + key;
  return h;
}

// PostgREST list for in.(…): every value double-quoted, quotes and backslashes escaped.
const inList = words => '(' + words.map(w => '"' + w.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + ')';

// → { normalizedWord: item } for the words found; {} on any problem.
async function lookup(request) {
  const c = config();
  if (!c || !request.words.length) return {};
  const words = Array.from(new Set(request.words.map(norm)));
  const q = 'select=word,item&source=eq.' + encodeURIComponent(request.source) + '&target=eq.' + encodeURIComponent(request.target) +
    '&v=eq.' + VERSION + '&word=in.' + encodeURIComponent(inList(words));
  try {
    const r = await fetch(c.url + '/rest/v1/' + TABLE + '?' + q, { headers: headers(c.key), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    if (!r.ok) { console.warn('[api/ai] cache lookup HTTP', r.status); return {}; }
    const rows = JSON.parse(await r.text());
    const out = {};
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const it = row && row.item;
      if (it && typeof it === 'object' && typeof it.translation === 'string' && it.translation && it.translation !== '—') out[row.word] = it;
    });
    return out;
  } catch (e) {
    console.warn('[api/ai] cache lookup failed:', (e && e.name) || 'error');
    return {};
  }
}

// Saves fresh AI answers; resolves to the number of rows sent (0 when off or on error).
async function store(request, items) {
  const c = config();
  const rows = (items || []).filter(it => it && it.translation && it.translation !== '—').map(it => ({
    source: request.source, target: request.target, v: VERSION, word: norm(it.original), item: it
  }));
  if (!c || !rows.length) return 0;
  try {
    const r = await fetch(c.url + '/rest/v1/' + TABLE + '?on_conflict=source,target,v,word', {
      method: 'POST',
      headers: headers(c.key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error'
    });
    if (!r.ok) { console.warn('[api/ai] cache store HTTP', r.status); return 0; }
    return rows.length;
  } catch (e) {
    console.warn('[api/ai] cache store failed:', (e && e.name) || 'error');
    return 0;
  }
}

module.exports = { VERSION, enabled, norm, lookup, store, inList };
