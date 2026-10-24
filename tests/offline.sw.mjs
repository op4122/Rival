// Service worker checks. Run with the dev server on :8765:  node tests/offline.sw.mjs
// - the app opens with no connection, and instantly on a very slow one (stale-while-revalidate)
// - config.js gives up on a slow network after ~3 s and uses the saved copy
// - a changed index.html fetched in the background shows "Update ready", but not while a workout is open
// - Supabase / PostHog requests are never cached; old caches are cleaned up
import { createRequire } from 'module';
// Without this, Playwright can't see (or slow down) requests made by the service worker itself.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/';
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const wait = ms => new Promise(r => setTimeout(r, ms));
const isPage = u => /\/app\/(index\.html)?(\?.*)?$/.test(new globalThis.URL(u).pathname + new globalThis.URL(u).search);

async function fresh() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.goto(URL);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await p.reload(); await p.waitForTimeout(1200);
  return { ctx, p };
}
const skipGate = async p => { if (await p.locator('[data-act=gateskip]').count()) { await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(900); } for (let i = 0; i < 20 && await p.locator('[data-act=coachskip]').count(); i++) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); } };

console.log('Offline and caching');
{
  const { ctx, p } = await fresh();
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await p.evaluate(() => fetch('https://rwlpwhwagcrzpusplvcz.supabase.co/auth/v1/health', { headers: { apikey: window.RIVAL_CONFIG.supabaseKey } }).catch(() => {}));
  await p.waitForTimeout(800);
  const keys = await p.evaluate(() => caches.keys());
  const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
  const ver = (await (await fetch(URL + 'sw.js')).text()).match(/rival-v[\w.-]+/)[0];
  ok(keys.length === 1 && keys[0] === ver, `one cache, the current version (${ver}): ` + keys.join(', '));
  ok((await (await fetch(URL)).text()).includes(`APP_VERSION = '${ver.slice(7)}'`), 'APP_VERSION matches the cache version');
  ok(cached.some(u => u.endsWith('/app/vendor/dexie.js')) && cached.some(u => u.endsWith('/app/index.html')) && cached.some(u => u.endsWith('/app/config.js')), `app shell cached (${cached.length} files)`);
  ok(!cached.some(u => /supabase\.co|posthog\.com/.test(u)), 'no Supabase or PostHog request in the cache');
  await ctx.setOffline(true);
  const t0 = Date.now(); await p.reload(); await p.locator('#view .title, .gate .title').first().waitFor({ timeout: 5000 });
  ok(Date.now() - t0 < 2500, `opens with no connection (${Date.now() - t0} ms)`);
  ok(await p.evaluate(() => !!window.rivalDb && !!window.Dexie && !!window.RIVAL_CONFIG), 'offline: config, Supabase client and Dexie all from the cache');
  await ctx.close();
}

console.log('Weak signal');
{
  const { ctx, p } = await fresh();
  // The page and config both take 10 s to answer, like a gym basement.
  await ctx.route(u => isPage(u.href), async r => { await wait(10000); r.continue().catch(() => {}); });
  await ctx.route('**/config.js', async r => { await wait(10000); r.continue().catch(() => {}); });
  let t0 = Date.now(); await p.reload({ waitUntil: 'commit' }); await p.locator('#view .title, .gate .title').first().waitFor({ timeout: 8000 });
  const shown = Date.now() - t0;
  ok(shown < 4500, `on a 10 s network the app is on screen in ${shown} ms (page from the cache at once; config.js waits at most 3 s)`);
  t0 = Date.now(); await p.waitForFunction(() => !!window.RIVAL_CONFIG && !!window.RIVAL_CONFIG.supabaseUrl, null, { timeout: 8000 }).catch(() => {});
  const cfg = await p.evaluate(() => !!(window.RIVAL_CONFIG && window.RIVAL_CONFIG.supabaseUrl));
  ok(cfg && shown < 5000, `config.js fell back to the saved copy within the 3 s timeout (page shown in ${shown} ms)`);
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
}

console.log('Update ready');
{
  const { ctx, p } = await fresh();
  await skipGate(p);
  // From now on the server has a newer index.html (same page plus a marker).
  await ctx.route(u => isPage(u.href), async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n<!-- new version -->\n' }); });
  await p.reload(); await p.waitForTimeout(400); await skipGate(p);
  const toast = p.locator('.toast', { hasText: 'Update ready, tap to refresh' });
  await toast.waitFor({ timeout: 6000 }).catch(() => {});
  ok(await toast.count() === 1, '"Update ready, tap to refresh" shown after a newer page arrives in the background');
  ok(await p.evaluate(() => new XMLSerializer().serializeToString(document).includes('new version')) === false, 'the page did not reload by itself');
  await Promise.all([p.waitForEvent('load'), toast.click()]);
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => new XMLSerializer().serializeToString(document).includes('new version')), 'tapping the toast loads the new version');
  // During a workout the toast waits until the logger closes.
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.route(u => isPage(u.href), async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n<!-- newer still -->\n' }); });
  await skipGate(p);
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900); await skipGate(p);
  await p.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: 'rival-hello' }));
  await p.evaluate(() => { const f = document.createElement('iframe'); f.src = './'; f.style.display = 'none'; document.body.appendChild(f); });
  await p.waitForTimeout(3000);
  ok(await p.locator('.toast', { hasText: 'Update ready' }).count() === 0, 'no update toast while the workout logger is open');
  await p.locator('[data-act=min]').click(); await p.waitForTimeout(3800);
  ok(await p.locator('.toast', { hasText: 'Update ready' }).count() === 1, 'the toast appears once the logger is closed');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}
await b.close(); console.log(failed ? `\n${failed} failed` : '\nAll passed'); process.exit(failed ? 1 : 0);
