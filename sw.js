/* Offline support: network first (so updates arrive immediately), cache as fallback. */
const CACHE = 'vm-v2.23';
const SHELL = ['./', 'index.html', 'styles.css', 'editorial.css', 'shell.css', 'motion.css', 'display.js', 'i18n.js', 'languages.js', 'grammar.js', 'learning.js', 'ai-core.js', 'share.js', 'games.js', 'course.js', 'course/catalog.json', 'course/en.json', 'account.js', 'vendor/qrcode/qrcode.js', 'motion.js', 'app.js',
  'vendor/lottie_light.min.js', 'motion/editorial-achievement.js', 'manifest.webmanifest', 'vendor/fonts/fonts.css', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Translation APIs and the AI proxy must never be served from cache.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
