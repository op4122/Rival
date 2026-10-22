// Service worker check: the app opens with no connection, and Supabase / PostHog requests are never cached.
// Run with the dev server on :8765:  node tests/offline.sw.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/';
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.goto(URL); await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
await p.reload(); await p.waitForTimeout(1500);
ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
await p.evaluate(() => fetch('https://rwlpwhwagcrzpusplvcz.supabase.co/auth/v1/health', { headers: { apikey: window.RIVAL_CONFIG.supabaseKey } }).catch(() => {}));
await p.waitForTimeout(800);
const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
ok(cached.some(u => u.endsWith('/app/vendor/dexie.js')) && cached.some(u => u.endsWith('/app/index.html')), `app shell cached (${cached.length} files)`);
ok(!cached.some(u => /supabase\.co|posthog\.com/.test(u)), 'no Supabase or PostHog request in the cache');
await ctx.setOffline(true);
await p.reload(); await p.waitForTimeout(1500);
ok(await p.locator('#view .title, .gate .title').count() > 0, 'app opens with no connection');
ok(await p.evaluate(() => !!window.rivalDb && !!window.Dexie), 'offline: Supabase client and Dexie loaded from the cache');
await b.close(); console.log(failed ? `\n${failed} failed` : '\nAll passed'); process.exit(failed ? 1 : 0);
