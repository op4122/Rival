// Live end-to-end check against the real Supabase project (not run in CI).
// Needs two test users with password sign-in. Run with:
//   RIVAL_TEST_PW=... node tests/sync.live.mjs     (server on :8765, app/config.js present)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/', PW = process.env.RIVAL_TEST_PW;
const A = 'rival-test-a@example.com', B = 'rival-test-b@example.com';
if (!PW) { console.error('Set RIVAL_TEST_PW'); process.exit(2); }
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const wait = ms => new Promise(r => setTimeout(r, ms));
async function phone(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForTimeout(800);
  const r = await p.evaluate(([e, pw]) => window.rivalDb.auth.signInWithPassword({ email: e, password: pw }).then(x => x.error ? x.error.message : 'ok'), [email, PW]);
  await p.waitForTimeout(1500);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  return { ctx, p, signedIn: r === 'ok' };
}
const status = p => p.evaluate(() => window.RivalSync.status);
async function until(p, fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.waitForTimeout(300); } return false; }
const q = (p, table, sel = '*') => p.evaluate(([t, s]) => window.rivalDb.from(t).select(s).then(r => r.error ? { error: r.error.message } : r.data), [table, sel]);

// ---------- phone 1: user A logs offline ----------
console.log('Phone 1 (user A)');
// start clean: as user A (RLS allows deleting your own rows), remove anything an earlier run left
{
  const c = await browser.newContext({ serviceWorkers: 'block' }), x = await c.newPage();
  await x.goto(URL); await x.waitForTimeout(600);
  await x.evaluate(async ([e, pw]) => {
    const db = window.rivalDb; await db.auth.signInWithPassword({ email: e, password: pw });
    const me = (await db.auth.getUser()).data.user.id;
    await db.from('workouts').delete().eq('user_id', me); await db.from('readiness_checkins').delete().eq('user_id', me);
    await db.from('profiles').update({ settings: {} }).eq('id', me); await db.auth.signOut();
  }, [A, PW]);
  await c.close();
}
const one = await phone(A);
let p = one.p;
ok(one.signedIn && await p.locator('.gate').count() === 0, 'signed in, sign-in screen gone');
ok(await until(p, async () => (await status(p)).phase === 'synced'), 'first sync done (samples not uploaded)');
ok((await q(p, 'workouts')).length === 0, 'sample workouts were not uploaded');
for (const [k, v] of [['sleep', 2], ['sore', 3], ['energy', 2]]) await p.locator(`[data-act=rq][data-k=${k}][data-v="${v}"]`).click();
await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
await one.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
for (const [si, w, r] of [[0, 82.5, 8], [1, 82.5, 7]]) { await p.fill(`#w-0-${si}`, String(w)); await p.fill(`#r-0-${si}`, String(r)); await p.locator(`.set[data-e="0"][data-s="${si}"] [data-act=log]`).click(); }
await p.waitForTimeout(1500);
const box = await p.evaluate(async () => { const s = window.RivalSync.status; const rows = await window.RivalSync._store.all('outbox', s.uid); return rows.map(r => r.key.split(':')[0]); });
ok(box.filter(t => t === 's').length === 2 && box.includes('w') && box.includes('rq'), `offline: 2 sets, the workout and the check-in are in the IndexedDB outbox (${box.join(',')})`);
ok(/waiting/.test(await p.locator('.wo-s .syncpill').textContent()), 'offline: indicator says waiting');
await one.ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online')));
ok(await until(p, async () => (await status(p)).phase === 'synced'), 'back online: synced');
let sets = await q(p, 'workout_sets', 'client_id,weight,reps,set_index');
ok(sets.length === 2 && sets.every(s => +s.weight === 82.5), 'Supabase has exactly the 2 sets');
ok((await q(p, 'readiness_checkins', 'sleep_quality,soreness,energy,score')).length === 1, 'check-in stored');
await p.evaluate(async () => { await window.RivalSync.push(); await window.RivalSync.push(); });
ok((await q(p, 'workout_sets', 'id')).length === 2, 'sending again creates no duplicates');
await p.fill('#w-0-2', '85'); await p.fill('#r-0-2', '6'); await p.locator('.set[data-e="0"][data-s="2"] [data-act=log]').click();
ok(await until(p, async () => (await q(p, 'workout_sets', 'id')).length === 3), 'third set synced while online');
await p.locator('.set[data-e="0"][data-s="2"] [data-act=log]').click(); // untick it
ok(await until(p, async () => (await q(p, 'workout_sets', 'id')).length === 2), 'unticked set removed online');
await p.locator('[data-act=finish]').click(); await p.waitForTimeout(400); await p.locator('[data-act=save]').click();
ok(await until(p, async () => { const w = await q(p, 'workouts', 'ended_at'); return w.length === 1 && !!w[0].ended_at; }), 'finished workout has an end time online');
const volA = await p.evaluate(() => window.rivalDb.rpc('get_weekly_muscle_volume', { p_weeks: 1 }).then(r => r.data));
const chest = (volA || []).find(r => r.muscle === 'chest');
ok(chest && +chest.volume === 82.5 * 8 + 82.5 * 7 && +chest.sets === 2, `heat-map function: chest ${chest && chest.volume} kg, ${chest && chest.sets} sets`);
ok(p.errors.length === 0, 'no errors on phone 1 ' + p.errors.join(' | '));

// ---------- phone 2: same user on a fresh phone ----------
console.log('Phone 2 (user A, fresh install)');
const two = await phone(A); p = two.p;
ok(await until(p, async () => p.evaluate(() => JSON.parse(localStorage.getItem('rival.v1')).sessions.some(s => s.rid && !s.sample))), 'workout from phone 1 pulled down');
await p.locator('[data-tab=today]').click(); await p.locator('.sample-note [data-act=clearsample]').click(); await p.waitForTimeout(300);
await p.locator('[data-act=day][data-i="0"]').click(); await p.waitForTimeout(300);
const preview = await p.locator('.card.session .pv').first().textContent();
ok(/Ghost 82\.5 × 8, 7/.test(preview), 'ghost sets from phone 1 shown: ' + preview.replace(/\s+/g, ' ').trim().slice(0, 90));
await two.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
await p.locator('[data-tab=progress]').click(); await p.waitForTimeout(300);
ok(await p.locator('.hist').count() === 1 && /Upper/.test(await p.locator('.hist').first().textContent()), 'offline: History shows the workout from phone 1');
await p.locator('.mrow', { hasText: 'Chest' }).first().click(); await p.waitForTimeout(200);
ok(/Barbell Bench Press \(2\)/.test(await p.locator('.mdetail').textContent()), 'offline: heat map counts the pulled bench sets');
ok(p.errors.length === 0, 'no errors on phone 2 ' + p.errors.join(' | '));
await two.ctx.close();

// ---------- user B cannot see user A ----------
console.log('Phone 3 (user B)');
const three = await phone(B); p = three.p;
ok(three.signedIn, 'user B signed in');
await p.waitForTimeout(2500);
ok((await q(p, 'workouts')).length === 0 && (await q(p, 'workout_sets')).length === 0 && (await q(p, 'readiness_checkins')).length === 0, 'user B reads none of user A\'s rows');
ok((await q(p, 'profiles', 'id')).length === 1, 'user B sees only their own profile');
ok((await p.evaluate(() => window.rivalDb.rpc('get_weekly_muscle_volume', { p_weeks: 4 }).then(r => r.data))).length === 0, 'user B heat map is empty');
const sid = sets[0] && sets[0].client_id;
const hijack = await p.evaluate(cid => window.rivalDb.from('workout_sets').update({ reps: 99 }).eq('client_id', cid).select().then(r => r.data ? r.data.length : r.error.message), sid);
ok(hijack === 0, 'user B cannot change user A\'s set');
ok(!JSON.parse(await p.evaluate(() => localStorage.getItem('rival.v1'))).sessions.some(s => s.rid && !s.sample), 'user B phone pulled nothing of A');
await three.ctx.close(); await one.ctx.close(); await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed'); process.exit(failed ? 1 : 0);
