// Analytics check: intercepts what posthog-js sends, decodes it, and checks events, identify, masking and no personal data.
// Run with the dev server on :8765 (app/config.js present):  RIVAL_TEST_PW=... node tests/analytics.test.mjs
import { createRequire } from 'module';
import zlib from 'node:zlib';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/', PW = process.env.RIVAL_TEST_PW, EMAIL = 'rival-test-a@example.com';
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
function decode(req) {
  const buf = req.postDataBuffer(); if (!buf) return [];
  let txt;
  try { txt = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString() : buf.toString(); } catch (e) { txt = buf.toString(); } // gzip magic bytes
  if (/^data=/.test(txt)) txt = Buffer.from(decodeURIComponent(txt.slice(5)), 'base64').toString();
  try { const j = JSON.parse(txt); return Array.isArray(j) ? j : j.batch || [j]; } catch (e) { return [{ raw: txt }]; }
}
async function app(surface) {
  // posthog-js ignores bots, and headless Chromium says so in its user agent; use an ordinary phone browser's.
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); // posthog-js also skips automated browsers
  const p = await ctx.newPage(), sent = [], raw = [];
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.route('**/*.posthog.com/**', async route => {
    const r = route.request(); raw.push(r.url());
    if (r.method() === 'POST') { const evs = decode(r); evs.forEach(e => sent.push(e)); }
    return route.continue(); // real PostHog: these test events show up in project 680729's live events
  });
  await p.goto(surface === 'site' ? URL.replace(/app\/$/, '') : URL); await p.waitForTimeout(2500);
  return { ctx, p, sent, raw };
}
const names = sent => sent.map(e => e.event).filter(Boolean);

console.log('App');
{
  const { ctx, p, sent, raw } = await app('app');
  ok(await p.evaluate(() => !!window.posthog && window.posthog.__loaded), 'posthog-js loaded once, from our own copy');
  ok(raw.length > 0 && raw.every(u => /^https:\/\/us(-assets)?\.i\.posthog\.com\//.test(u)), 'all requests go to PostHog US cloud');
  ok(await p.evaluate(() => window.posthog.config.session_recording.maskAllInputs === true), 'session replay masks all inputs');
  await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(1200);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  for (const [k, v] of [['sleep', 2], ['sore', 2], ['energy', 3]]) await p.locator(`[data-act=rq][data-k=${k}][data-v="${v}"]`).click();
  await p.locator('[data-tab=progress]').click(); await p.waitForTimeout(200);
  await p.locator('[data-tab=today]').click(); await p.waitForTimeout(200);
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.fill('#w-0-0', '90'); await p.fill('#r-0-0', '8'); await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); await p.waitForTimeout(300);
  await p.locator('[data-act=finish]').click(); await p.waitForTimeout(400); await p.locator('[data-act=save]').click(); await p.waitForTimeout(400);
  if (PW) { await p.evaluate(([e, pw]) => window.rivalDb.auth.signInWithPassword({ email: e, password: pw }), [EMAIL, PW]); await p.waitForTimeout(3500); }
  await p.evaluate(() => window.posthog.flush && window.posthog.flush()); await p.waitForTimeout(3500);
  const n = names(sent);
  for (const e of ['app_opened', 'readiness_checkin_completed', 'heatmap_viewed', 'workout_started', 'set_logged', 'ghost_set_beaten', 'workout_completed', '$pageview', '$autocapture'])
    ok(n.includes(e), `${e} sent`);
  const wc = sent.find(e => e.event === 'workout_completed');
  ok(wc && wc.properties.set_count === 1 && wc.properties.total_volume === 720 && Number.isFinite(wc.properties.duration_min), 'workout_completed has duration_min, set_count, total_volume');
  const gb = sent.find(e => e.event === 'ghost_set_beaten');
  ok(gb && gb.properties.exercise_id === 'bench' && gb.properties.margin > 0, `ghost_set_beaten has exercise_id and margin (${gb && gb.properties.margin})`);
  const rc = sent.find(e => e.event === 'readiness_checkin_completed');
  ok(rc && rc.properties.score === 78, 'readiness_checkin_completed has the score');
  const pv = sent.filter(e => e.event === '$pageview').map(e => e.properties.screen);
  ok(['today', 'progress', 'workout'].every(x => pv.includes(x)), 'a pageview for each screen: ' + pv.join(', '));
  if (PW) {
    const id = sent.find(e => e.event === '$identify');
    const uid = await p.evaluate(() => window.RivalSync.status.uid);
    ok(id && id.properties.distinct_id === uid, 'identify uses the user id');
    ok(!JSON.stringify(sent).includes(EMAIL) && !JSON.stringify(sent).toLowerCase().includes('example.com'), 'the email address never appears in anything sent');
    await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(200);
    const before = await p.evaluate(() => window.posthog.get_distinct_id());
    await p.locator('[data-act=authsignout]').click(); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => window.posthog.get_distinct_id()) !== before, 'sign-out resets the analytics id');
  }
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(200);
  await p.locator('[data-act=analytics][data-v="0"]').click(); await p.waitForTimeout(300);
  const count = sent.length;
  await p.locator('[data-tab=progress]').click(); await p.waitForTimeout(1500); await p.evaluate(() => window.posthog.flush && window.posthog.flush()); await p.waitForTimeout(1500);
  ok(!names(sent.slice(count)).includes('heatmap_viewed'), 'analytics off: nothing more is sent');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}
console.log('Marketing site');
{
  const { ctx, p, sent } = await app('site');
  for (let i = 0; i < 20 && !names(sent).includes('$pageview'); i++) await p.waitForTimeout(500);
  ok(names(sent).includes('$pageview'), 'site pageview sent');
  const cta = p.locator('a[href="app/"]').first();
  await p.waitForTimeout(1500);
  await Promise.all([p.waitForURL(/\/app\//), cta.click()]); await p.waitForTimeout(5000);
  await p.evaluate(() => window.posthog && window.posthog.flush && window.posthog.flush()); await p.waitForTimeout(2500);
  const c = sent.find(e => e.event === 'cta_clicked');
  ok(c && c.properties.location && c.properties.label, `cta_clicked sent before leaving (${c && c.properties.location}: ${c && c.properties.label})`);
  const siteId = c && c.properties.distinct_id, appEv = sent.filter(e => e.event === 'app_opened').pop();
  ok(appEv && appEv.properties.distinct_id === siteId, 'the app continues the same visitor id, so the visitor-to-user funnel joins up');
  await ctx.close();
}
await b.close(); console.log(failed ? `\n${failed} failed` : '\nAll passed'); process.exit(failed ? 1 : 0);
