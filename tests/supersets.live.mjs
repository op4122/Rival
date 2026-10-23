// Live check that supersets reach the database and come back on another phone (not run in CI, not part of npm test).
// Uses the test user rival-test-c@example.com. Run with the dev server on :8765:   RIVAL_TEST_PW=... node tests/supersets.live.mjs
// Behind an HTTP proxy (e.g. a cloud sandbox), HTTPS_PROXY is used for the browser.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/', PW = process.env.RIVAL_TEST_PW, EMAIL = 'rival-test-c@example.com';
if (!PW) { console.error('Set RIVAL_TEST_PW'); process.exit(2); }
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const launch = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}, px = {};
if (process.env.HTTPS_PROXY) { const u = new globalThis.URL(process.env.HTTPS_PROXY); launch.proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: 'localhost,127.0.0.1' }; px.ignoreHTTPSErrors = true; }
const browser = await chromium.launch(launch);
async function phone(seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...px }), p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  if (seed) await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
  await p.goto(URL); await p.waitForTimeout(1000);
  const r = await p.evaluate(([e, pw]) => window.rivalDb.auth.signInWithPassword({ email: e, password: pw }).then(x => x.error ? x.error.message : 'ok'), [EMAIL, PW]);
  await p.waitForTimeout(2500);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  ok(r === 'ok', 'signed in');
  return p;
}
const until = async (p, fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.waitForTimeout(400); } return false; };

console.log('Phone 1: a superset workout');
const plan = { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: false, sampleCleared: true,
  days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 1, lo: 6, hi: 8, ln: 1 }, { id: 'bbrow', sets: 1, lo: 8, hi: 12 }, { id: 'squat', sets: 1, lo: 5, hi: 8 }] }] };
const p = await phone({ profile: plan, sessions: [], active: null });
await p.evaluate(() => window.rivalDb.from('workouts').delete().neq('day_name', '\u0000'));
await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
for (const [e, w, r] of [[0, 80, 6], [1, 60, 10], [2, 100, 5]]) { await p.fill(`#w-${e}-0`, String(w)); await p.fill(`#r-${e}-0`, String(r)); await p.locator(`.set[data-e="${e}"][data-s="0"] [data-act=log]`).click(); await p.waitForTimeout(400); await p.locator('[data-act=restskip]').click().catch(() => {}); }
await p.locator('[data-act=finish]').click(); await p.waitForTimeout(400); await p.locator('[data-act=save]').click(); await p.waitForTimeout(800);
const rows = async () => p.evaluate(() => window.rivalDb.from('workout_sets').select('superset_group, exercises(slug)').then(r => r.data || []));
ok(await until(p, async () => (await rows()).length === 3), 'three sets synced');
const got = Object.fromEntries((await rows()).map(r => [r.exercises.slug, r.superset_group]));
ok(got.bench === 'A' && got.bbrow === 'A' && got.squat === null, 'superset_group: bench A, row A, squat null: ' + JSON.stringify(got));

console.log('Phone 2: fresh install pulls it back');
const q = await phone(null);
ok(await until(q, async () => { const s = JSON.parse(await q.evaluate(() => localStorage.getItem('rival.v1'))); return s && s.sessions.some(x => x.dayName === 'Upper' && !x.sample); }), 'workout pulled');
const ses = JSON.parse(await q.evaluate(() => localStorage.getItem('rival.v1'))).sessions.find(x => x.dayName === 'Upper' && !x.sample);
ok(ses.entries.find(e => e.exId === 'bench').ss === 'A' && ses.entries.find(e => e.exId === 'bbrow').ss === 'A' && !ses.entries.find(e => e.exId === 'squat').ss, 'pulled workout keeps superset A on bench and row');
await p.evaluate(() => window.rivalDb.from('workouts').delete().neq('day_name', '\u0000'));
for (const x of [p, q]) ok(x.errors.length === 0, 'no page errors ' + x.errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed'); process.exit(failed ? 1 : 0);
