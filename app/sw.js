// Rival service worker: keeps a copy of the app on the phone so it opens instantly, even with weak or no signal.
// - The page (index.html): stale-while-revalidate. The saved copy is shown at once; a fresh copy is fetched in the
//   background and saved for next time. If it changed, open pages are told so they can offer "Update ready".
// - config.js: network first, but only waits 3 seconds before using the saved copy.
// - Everything else (scripts, fonts, icons): saved copy first.
// Only files from Rival's own site are handled, so Supabase and PostHog requests are never cached.
const CACHE = 'rival-v33';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './config.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './vendor/supabase.js', './vendor/dexie.js', './vendor/posthog.js', './supabase.js', './analytics.js',
  '../assets/icon.svg', '../assets/fonts/archivo.woff2', '../assets/fonts/instrument-sans.woff2'
];
const CONFIG_TIMEOUT_MS = 3000;
let updateReady = false; // a newer index.html is saved but this page is still the old one

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('rival-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The app asks on start whether an update is waiting (it may have loaded before the background fetch finished).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'rival-hello' && updateReady && e.source) e.source.postMessage({type:'rival-update'});
});

async function tellPages() {
  updateReady = true;
  const pages = await self.clients.matchAll({type:'window', includeUncontrolled:false});
  pages.forEach(c => c.postMessage({type:'rival-update'}));
}

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

async function page(e) {
  const cache = await caches.open(CACHE), cached = await cache.match('./index.html');
  const prevText = cached ? cached.clone().text() : Promise.resolve(null); // read now: the original goes to the page
  updateReady = false; // whatever is served now is the newest copy we have
  // By URL: a navigation request can't be re-sent with options. no-cache skips the browser's own 10-minute HTTP cache.
  const fresh = fetch(e.request.url, {cache:'no-cache', credentials:'same-origin'}).then(async res => {
    if (res.ok && res.type === 'basic') {
      const [next, prev] = await Promise.all([res.clone().text(), prevText]);
      await cache.put('./index.html', res.clone());
      if (prev != null && prev !== next) await tellPages();
    }
    return res;
  });
  if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; } // instant, whatever the signal
  return fresh.catch(() => cache.match('./') || Response.error());   // first visit: the network is all we have
}

async function config(e) {
  const cache = await caches.open(CACHE);
  const net = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; });
  e.waitUntil(net.catch(() => {}));
  try { return await Promise.race([net, timeout(CONFIG_TIMEOUT_MS)]); }
  catch (err) { return (await cache.match(e.request, {ignoreSearch:true})) || net; } // slow or offline: saved copy
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
  if (new URL(req.url).pathname.endsWith('/config.js')) { e.respondWith(config(e)); return; }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
