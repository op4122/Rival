// Live end-to-end check of Rivals against the real Supabase project (not run in CI, not part of npm test).
// Needs three test users with password sign-in (rival-test-a/b/c@example.com, all with the same password).
// Run with the dev server on :8765 (app/config.js present):   RIVAL_TEST_PW=... node tests/rivals.live.mjs
// Behind an HTTP proxy (e.g. a cloud sandbox), HTTPS_PROXY is used for the browser.
// A (Sara) invites, B (Omar) accepts and races Sara's bench ghost, C (Eve) is a stranger who must see nothing.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/', PW = process.env.RIVAL_TEST_PW;
const EM = { a: 'rival-test-a@example.com', b: 'rival-test-b@example.com', c: 'rival-test-c@example.com' };
if (!PW) { console.error('Set RIVAL_TEST_PW'); process.exit(2); }
let failed = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failed++; };
let launch = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}, ctxOpts = {};
if (process.env.HTTPS_PROXY) {
  const u = new globalThis.URL(process.env.HTTPS_PROXY);
  launch.proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: 'localhost,127.0.0.1' };
  ctxOpts.ignoreHTTPSErrors = true; // the sandbox proxy re-signs HTTPS
}
const browser = await chromium.launch(launch);
const spy = () => { window.__ev = []; let real; Object.defineProperty(window, 'RivalAnalytics', { configurable: true, get: () => real,
  set: v => { real = Object.assign({}, v, { track: (n, p) => { window.__ev.push([n, p]); } }); } }); };
const ev = (p, n) => p.evaluate(n => window.__ev.filter(x => x[0] === n).map(x => x[1]), n);
const plan = { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: false, sampleCleared: true,
  days: [{ name: 'Push', ex: [{ id: 'bench', sets: 2, lo: 5, hi: 8 }] }] };
async function phone(who, { hash = '', seed = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...ctxOpts }), p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  p.toasts = []; await p.exposeFunction('__toast', t => p.toasts.push(t));
  await p.addInitScript(spy);
  await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && t.dataset.seen !== t.textContent) { t.dataset.seen = t.textContent; window.__toast(t.textContent); } }).observe(document.body, { subtree: true, childList: true, characterData: true })));
  if (seed) await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify({ profile: plan, sessions: [], active: null }));
  await p.goto(URL + hash); await p.waitForTimeout(1200);
  const r = await p.evaluate(([e, pw]) => window.rivalDb.auth.signInWithPassword({ email: e, password: pw }).then(x => x.error ? x.error.message : 'ok'), [EM[who], PW]);
  await p.waitForTimeout(2500);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  p.uid = await p.evaluate(() => window.rivalDb.auth.getUser().then(x => x.data.user && x.data.user.id));
  ok(r === 'ok' && p.uid, `${who.toUpperCase()} signed in`);
  return p;
}
const rpc = (p, fn, args) => p.evaluate(([f, a]) => window.rivalDb.rpc(f, a).then(r => r.error ? { error: r.error.message } : r.data), [fn, args]);
const q = (p, t, sel = '*') => p.evaluate(([t, s]) => window.rivalDb.from(t).select(s).then(r => r.error ? { error: r.error.message } : r.data), [t, sel]);
const shot = (p, n) => process.env.SHOT_DIR ? p.screenshot({ path: `${process.env.SHOT_DIR}/${n}.png` }) : null;
const settings = async p => { await p.locator('[data-act=tab][data-tab=settings]').click(); await p.waitForTimeout(1800); };
const waitFor = async (p, fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.waitForTimeout(300); } return false; };

// ---------- clean slate: earlier runs ----------
console.log('Setup');
const A = await phone('a');
const B0 = await phone('b'), C = await phone('c');
for (const p of [A, B0, C]) await p.evaluate(async () => { const db = window.rivalDb; await db.from('rivals').delete().neq('created_at', '1900-01-01'); await db.from('invite_codes').delete().neq('code', ''); await db.from('workouts').delete().neq('day_name', '\u0000'); await db.from('profiles').update({ share_lifts: false }).neq('units', 'x'); });
await B0.context().close();
// A's finished bench workout: 85 × 6, 85 × 5 (and a heavier one still in progress, which must not show)
const bench = await A.evaluate(() => window.rivalDb.from('exercises').select('id').eq('slug', 'bench').is('user_id', null).single().then(r => r.data.id));
await A.evaluate(async ([bench]) => {
  const db = window.rivalDb, w1 = crypto.randomUUID(), w2 = crypto.randomUUID(), t = Date.now() - 2 * 86400000;
  await db.from('workouts').insert([{ id: w1, day_name: 'Push', started_at: new Date(t).toISOString(), ended_at: new Date(t + 3600000).toISOString() }, { id: w2, day_name: 'Push', started_at: new Date().toISOString() }]);
  await db.from('workout_sets').insert([{ workout_id: w1, exercise_id: bench, set_index: 0, weight: 85, reps: 6, client_id: crypto.randomUUID() }, { workout_id: w1, exercise_id: bench, set_index: 1, weight: 85, reps: 5, client_id: crypto.randomUUID() },
    { workout_id: w2, exercise_id: bench, set_index: 0, weight: 120, reps: 5, client_id: crypto.randomUUID() }]);
}, [bench]);

// ---------- A: invite link, sharing on ----------
console.log('A invites');
await settings(A);
ok(/Let rivals see my lifts/.test(await A.locator('#rivals').textContent()) && await A.locator('#rivals [data-act=sharelifts][data-v="0"]').getAttribute('aria-pressed') === 'true', 'Settings → Rivals, sharing off by default');
ok(/Sara/.test(await A.locator('#rivals').textContent()), 'name rivals see: Sara (first name from the account)');
await A.locator('[data-act=rvinvite]').click(); await A.waitForTimeout(1500);
const link = (await A.locator('.rv-link').textContent()).trim(), code = link.split('#rival=')[1];
ok(/^[0-9a-f]{32}$/.test(code || ''), 'invite link with a random 32-character code: ' + link);
ok((await ev(A, 'rival_invite_created')).length === 1, 'rival_invite_created');
await A.locator('#rivals [data-act=sharelifts][data-v="1"]').click(); await A.waitForTimeout(1500);
ok((await q(A, 'profiles', 'share_lifts'))[0].share_lifts === true, '"Let rivals see my lifts" saved on the server');
await A.locator('#rivals').scrollIntoViewIfNeeded(); await shot(A, 'rivals-settings');

// ---------- C: stranger ----------
console.log('Stranger');
ok(JSON.stringify(await rpc(C, 'get_rival_ghost', { p_rival_id: A.uid, p_exercise_id: bench })) === '[]', 'non-rival: get_rival_ghost returns nothing');
ok(JSON.stringify(await q(C, 'invite_codes')) === '[]', "non-rival can't read A's invite code");
ok(JSON.stringify(await q(C, 'workout_sets', 'id')) === '[]', "non-rival can't read A's sets");

// ---------- B opens the link signed out, then signs in ----------
console.log('B accepts');
const B = await phone('b', { hash: '#rival=' + code });
ok(await waitFor(B, async () => B.toasts.some(t => /You and Sara are now rivals/.test(t))), 'B: "You and Sara are now rivals" ' + JSON.stringify(B.toasts));
ok((await ev(B, 'rival_invite_accepted')).length === 1, 'rival_invite_accepted once: ' + JSON.stringify(await B.evaluate(() => window.__ev.map(x => x[0]))));
ok(!(await B.evaluate(() => location.hash.includes('rival='))), 'code removed from the address bar');
await settings(B);
ok(/Sara/.test(await B.locator('#rivals').textContent()) && await B.locator('#rivals [data-act=rvremove]').count() === 1, "B's Settings lists Sara");
const ghost = await rpc(B, 'get_rival_ghost', { p_rival_id: A.uid, p_exercise_id: bench });
ok(ghost.length === 2 && ghost.every(x => x.display_name === 'Sara' && +x.weight === 85) && Object.keys(ghost[0]).sort().join() === 'display_name,reps,set_index,started_at,weight', 'rival gets only first name + last finished sets (85 × 6, 85 × 5): ' + JSON.stringify(ghost));
ok(JSON.stringify(await q(B, 'workout_sets', 'id')) === '[]', "rival still can't read A's sets directly");

// ---------- B races Sara ----------
console.log('Logger');
await B.locator('[data-act=tab][data-tab=today]').click(); await B.waitForTimeout(400);
await B.locator('#startbar [data-act=start]').click();
ok(await waitFor(B, async () => await B.locator('.set .rv-g').count() === 2), 'rival chips appear on both sets');
ok((await B.locator('.set[data-s="0"] .rv-g').textContent()).replace(/\s+/g, ' ') === 'Sara 85 × 6', 'chip reads "Sara 85 × 6"');
ok(await B.locator('.set .rv-g').first().evaluate(el => getComputedStyle(el).color !== getComputedStyle(document.querySelector('.set .g-txt') || el.parentElement).color), 'in a different colour from the own ghost');
ok(/Racing Sara/.test(await B.locator('#rv-bar').textContent()), 'logger says who you are racing');
await shot(B, 'rivals-logger');
await B.locator('[data-act=rvtoggle][data-v="0"]').click(); await B.waitForTimeout(300);
ok(await B.locator('.set .rv-g').count() === 0, 'toggle off: chips hidden for this workout');
await B.locator('[data-act=rvtoggle][data-v="1"]').click(); await B.waitForTimeout(300);
ok(await B.locator('.set .rv-g').count() === 2, 'toggle on: back');
await B.fill('#w-0-0', '90'); await B.fill('#r-0-0', '6');
await B.locator('.set[data-s="0"] [data-act=log]').click(); await B.waitForTimeout(1500);
ok((await ev(B, 'rival_ghost_beaten')).length === 1 && (await ev(B, 'rival_ghost_beaten'))[0].exercise_id === 'bench', 'rival_ghost_beaten (bench)');
ok(await B.locator('.set[data-s="0"] .rv-g.won').count() === 1, 'beaten set gets a tick on the chip');
await B.locator('[data-act=restskip]').click().catch(() => {});
await B.locator('[data-act=finish]').click(); await B.waitForTimeout(600);
ok(/Beat Sara on Barbell Bench Press/.test(await B.locator('.sheet').textContent()), 'finish summary: "Beat Sara on Barbell Bench Press"');
await shot(B, 'rivals-summary');
await B.locator('[data-act=discard]').click(); await B.waitForTimeout(300); await B.locator('[data-act=discard]').click(); await B.waitForTimeout(800);

// ---------- A turns sharing off: name only ----------
console.log('Sharing off');
await A.locator('#rivals [data-act=sharelifts][data-v="0"]').click(); await A.waitForTimeout(1500);
const off = await rpc(B, 'get_rival_ghost', { p_rival_id: A.uid, p_exercise_id: bench });
ok(off.length === 1 && off[0].display_name === 'Sara' && off[0].weight === null, 'sharing off: rival gets the name only');

// ---------- own link, removal, revoke ----------
console.log('Remove and revoke');
await A.goto(URL + '#rival=' + code); await A.waitForTimeout(3500);
ok(A.toasts.some(t => /your own invite/.test(t)), 'own link: "That\'s your own invite link"');
await settings(B);
await B.locator('#rivals [data-act=rvremove]').click(); await B.waitForTimeout(1500);
ok(JSON.stringify(await q(B, 'rivals')) === '[]' && JSON.stringify(await q(A, 'rivals')) === '[]', 'B removes Sara: gone for both');
ok(JSON.stringify(await rpc(B, 'get_rival_ghost', { p_rival_id: A.uid, p_exercise_id: null })) === '[]', 'after removal: nothing, not even the name');
await settings(A);
await A.locator('[data-act=rvrevoke]').click(); await A.waitForTimeout(1500);
ok(await A.locator('[data-act=rvinvite]').count() === 1, 'A revokes the link');
await C.goto(URL + '#rival=' + code); await C.waitForTimeout(3500);
ok(C.toasts.some(t => /revoked or is wrong/.test(t)), 'revoked link: "That invite link was revoked or is wrong"');
ok(JSON.stringify(await q(C, 'rivals')) === '[]', 'and no link was made');
for (const p of [A, B, C]) ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
