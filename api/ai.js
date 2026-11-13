/**
 * /api/ai — translation endpoint of Wordzone (Vercel Serverless Function).
 *
 * Contract: POST application/json
 *   { "action": "status" }                                  → { status, serverKeyConfigured, limits }
 *   { "words": [...], "source": "en", "target": "ru" }      → { items: [{ original, translation, hint, definition, examples }] }
 *   { "mode": "grammar", "words": [...≤12], "source": "de", "target": "ru" } → { items: [{ original, rules: [...] }] } (see grammar.js)
 * The server builds the prompt itself; callers can no longer send arbitrary chat messages.
 *
 * Environment:
 *   OPENAI_API_KEY        server key (optional; never echoed or logged)
 *   OPENAI_BASE_URL       https endpoint for the server key (default https://api.openai.com/v1)
 *   OPENAI_MODEL          model for the server key
 *   GEMINI_API_KEY        alternative server key for Google Gemini (free tier at aistudio.google.com); used when
 *                         OPENAI_API_KEY is not set. GEMINI_MODEL picks the model (default gemini-3.5-flash-lite)
 *   SUPABASE_URL / SUPABASE_ANON_KEY   accounts and cloud progress (public values; access is limited by RLS, see supabase/schema.sql)
 *   SUPABASE_SECRET_KEY                server-only key for the shared translation cache (api/_cache.js); optional, never sent to the browser
 *   ALLOWED_ORIGINS       extra comma-separated origins allowed to call (the deployment's own host always is)
 *   AI_ALLOWED_HOSTS      extra provider hosts for "bring your own key" requests
 *   AI_RATE_LIMIT / AI_RATE_LIMIT_BYOK / AI_RATE_WINDOW_MS   per-IP limits (default 30 / 120 per 10 min)
 *
 * Limits of this design: the rate limiter lives in the memory of one serverless instance, so it resets on cold
 * starts and is not shared between instances; for hard guarantees put Vercel KV / Upstash or the Vercel firewall
 * in front. Origin/Referer checks stop other websites from using the endpoint from a browser, but a script can fake
 * these headers — the rate limit and the fixed prompt are what bound the damage.
 */
const core = require('../ai-core.js');
const cache = require('./_cache.js');

const DEFAULT_BASE = 'https://api.openai.com/v1';
const PROVIDER_HOSTS = ['api.openai.com', 'api.groq.com', 'openrouter.ai', 'api.deepseek.com', 'api.mistral.ai', 'api.together.xyz', 'generativelanguage.googleapis.com'];
const MAX_BODY_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 50000; // small batches answer in 5-15 s; slow providers get headroom (maxDuration is 60 s in vercel.json)
const hits = new Map(); // ip -> request timestamps inside the current window (this instance only)

const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
const WINDOW_MS = () => num(process.env.AI_RATE_WINDOW_MS, 10 * 60 * 1000);

function send(res, status, body, headers) {
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}
const error = (res, status, code, message, headers) => send(res, status, { code, error: message }, headers);

function header(req, name) { const v = req.headers && req.headers[name]; return Array.isArray(v) ? v[0] : v || ''; }

function clientIp(req) {
  // On Vercel x-real-ip / x-forwarded-for are set by the edge, not by the caller.
  return header(req, 'x-real-ip') || header(req, 'x-forwarded-for').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function allowedOrigins(req) {
  const set = new Set();
  const add = h => { if (h) { set.add('https://' + h); set.add('http://' + h); } };
  add(header(req, 'host'));
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean).forEach(o => set.add(o));
  return set;
}

function callerOrigin(req) {
  const origin = header(req, 'origin');
  if (origin && origin !== 'null') return origin;
  try { return new URL(header(req, 'referer')).origin; } catch (e) { return ''; }
}

function rateLimit(ip, limit) {
  const now = Date.now(), windowMs = WINDOW_MS();
  const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return 0;
}

// Accounts are offered only when both values are set and the URL is plain HTTPS (or a local test server).
function accountConfig() {
  const env = process.env;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !key || key.length > 2000) return null;
  try {
    const u = new URL(url);
    const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    if ((u.protocol !== 'https:' && !local) || u.username || u.password || u.search || u.hash) return null;
  } catch (e) { return null; }
  return { url, key };
}

function providerHosts() {
  return PROVIDER_HOSTS.concat(String(process.env.AI_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

// Upstream failures are reported as stable codes; the provider's own text (which can echo key fragments) never leaves.
function providerError(status) {
  if (status === 401 || status === 403) return [502, 'provider-auth', 'The AI provider rejected the API key.'];
  if (status === 429) return [503, 'provider-rate-limit', 'The AI provider is rate limiting requests. Try again later.'];
  if (status === 404 || status === 400 || status === 422) return [502, 'provider-bad-request', 'The AI provider did not accept the request (check the model name).'];
  return [502, 'provider-unavailable', 'The AI provider is unavailable.'];
}

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return { tooLarge: true };
    try { body = JSON.parse(body); } catch (e) { return { invalid: true }; }
  } else if (body && JSON.stringify(body).length > MAX_BODY_BYTES) return { tooLarge: true };
  return { body: body || {} };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const allowed = allowedOrigins(req);
  const origin = header(req, 'origin');
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return error(res, 405, 'method-not-allowed', 'Use POST.', { Allow: 'POST, OPTIONS' });
  if (!allowed.has(callerOrigin(req))) return error(res, 403, 'forbidden-origin', 'This origin is not allowed to use the API.');
  if (!/^application\/json\b/i.test(header(req, 'content-type'))) return error(res, 415, 'bad-request', 'Content-Type must be application/json.');

  const parsed = readBody(req);
  if (parsed.tooLarge) return error(res, 413, 'payload-too-large', 'Request body is too large.');
  if (parsed.invalid || !parsed.body || typeof parsed.body !== 'object' || Array.isArray(parsed.body)) return error(res, 400, 'bad-request', 'Body must be a JSON object.');
  const body = parsed.body;
  const geminiServer = !process.env.OPENAI_API_KEY && Boolean(process.env.GEMINI_API_KEY);
  const serverKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';

  if (body.action === 'status') {
    return send(res, 200, { status: 'ok', serverKeyConfigured: Boolean(serverKey), provider: geminiServer ? 'gemini' : serverKey ? 'openai-compatible' : null, account: accountConfig(), cache: cache.enabled(), limits: { words: core.LIMITS.words, wordLength: core.LIMITS.wordLength } });
  }

  let request;
  try { request = core.validateRequest(body); }
  catch (e) { return error(res, 400, 'bad-request', e.message); }

  // Shared cache (translate mode only): words someone already translated cost no AI request and no rate limit.
  const translate = !request.mode;
  let hits = [];
  if (translate && cache.enabled()) {
    const found = await cache.lookup(request);
    hits = request.words.filter(w => found[cache.norm(w)]).map(w => Object.assign({}, found[cache.norm(w)], { original: w }));
    if (hits.length === request.words.length) return send(res, 200, { items: hits, cached: hits.length });
    if (hits.length) {
      const have = new Set(hits.map(h => cache.norm(h.original)));
      request = Object.assign({}, request, { words: request.words.filter(w => !have.has(cache.norm(w))) });
    }
  }
  // When the AI fails but part of the list came from the cache, the client still gets that part.
  const fail = (status, code, message, extra) => hits.length ? send(res, 200, { items: hits, cached: hits.length, partial: code }) : error(res, status, code, message, extra);

  const bearer = header(req, 'authorization').replace(/^Bearer\s+/i, '').trim();
  const clientKey = bearer || (typeof body.apiKey === 'string' ? body.apiKey.trim() : '');
  if (!serverKey && !clientKey) return fail(501, 'no-key', 'No API key: the server has none configured and the request did not include one.');
  if (!serverKey && (clientKey.length > 400 || !/^[\x21-\x7e]+$/.test(clientKey))) return error(res, 400, 'bad-request', 'Malformed API key.');

  const retryAfter = rateLimit(clientIp(req), serverKey ? num(process.env.AI_RATE_LIMIT, 30) : num(process.env.AI_RATE_LIMIT_BYOK, 120));
  if (retryAfter) return fail(429, 'rate-limited', 'Too many requests. Try again in ' + retryAfter + ' s.', { 'Retry-After': String(retryAfter) });

  // A server key is pinned to the operator's endpoint and model; a caller's own key may pick a known provider.
  let base, model;
  if (serverKey) {
    if (geminiServer) {
      base = core.GEMINI.baseUrl;
      model = process.env.GEMINI_MODEL || core.GEMINI.model;
    } else {
      base = String(process.env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
      model = process.env.OPENAI_MODEL || (/tokenharbor/i.test(base) ? 'claude-sonnet-4.6' : 'gpt-4o-mini');
    }
  } else {
    base = String(body.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    let url;
    try { url = new URL(base); } catch (e) { return error(res, 400, 'bad-request', 'Invalid base URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return error(res, 400, 'bad-request', 'Base URL must be plain HTTPS without credentials or port.');
    if (!providerHosts().includes(url.hostname.toLowerCase())) return error(res, 400, 'bad-request', 'Unsupported AI provider host. Allowed: ' + providerHosts().join(', ') + '.');
    model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'gpt-4o-mini';
    if (!/^[\w.:/@-]{1,100}$/.test(model)) return error(res, 400, 'bad-request', 'Invalid model name.');
  }

  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (serverKey || clientKey) };
  if (/openrouter\.ai/i.test(base)) headers['X-Title'] = 'Wordzone';

  let upstream;
  try {
    upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(core.buildPayload(request, model, base)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error'
    });
  } catch (err) {
    const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.warn('[api/ai] provider request failed:', timeout ? 'timeout' : (err && err.name) || 'error');
    return timeout ? fail(504, 'provider-timeout', 'The AI provider did not answer in time.') : fail(502, 'provider-unavailable', 'The AI provider is unavailable.');
  }

  if (!upstream.ok) {
    console.warn('[api/ai] provider responded with HTTP', upstream.status);
    const [status, code, message] = providerError(upstream.status);
    return fail(status, code, message);
  }

  let content = '';
  try {
    const data = JSON.parse(await upstream.text());
    content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  } catch (e) { content = ''; }
  let items;
  try { items = core.parseResponse(content, request); }
  catch (e) {
    // A short, key-free sample of what the model said, so the cause shows up in the Vercel logs.
    console.warn('[api/ai] unusable model answer for', request.source + '→' + request.target + ':', String(content || '(empty)').replace(/\s+/g, ' ').slice(0, 300));
    return fail(502, 'bad-model-response', 'The AI returned an answer that could not be used.');
  }
  // Only answers from the operator's own key are shared with everyone.
  if (translate && serverKey) await cache.store(request, items);
  return send(res, 200, hits.length ? { items: hits.concat(items), cached: hits.length } : { items });
};

module.exports._resetRateLimit = () => hits.clear();
module.exports._rateLimitSize = () => hits.size;
