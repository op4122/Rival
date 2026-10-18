// Browser checks for the app. Run from the repo root:
//   python3 -m http.server 8765 &   then   node tests/app.test.mjs
// Needs Playwright (npm i -g playwright, or set NODE_PATH to where it lives).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL = process.env.RIVAL_URL || 'http://localhost:8765/app/';
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
async function page(opts = {}, seed) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: 844 }, colorScheme: opts.dark ? 'dark' : 'light', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  if (seed) await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
  await p.goto(URL);
  await p.waitForTimeout(500);
  return p;
}
const state = p => p.evaluate(() => JSON.parse(localStorage.getItem('rival.v1')));
// Skip the tour (which also saves the fresh state), change the saved data, then reload.
async function edit(p, fn) {
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('rival.v1')); (${fn})(s); localStorage.setItem('rival.v1', JSON.stringify(s)); })()`);
  await p.reload(); await p.waitForTimeout(500);
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// ---------- fresh install: tour, starter card, tiles ----------
console.log('Fresh install');
{
  const p = await page();
  ok(await p.locator('.coach').count() === 1, 'tour starts');
  for (let i = 0; i < 20 && await p.locator('.coach').count(); i++) {
    const h = await p.locator('#coach-h').textContent();
    if (/Your plan bends/.test(h)) ok(true, 'tour covers "Train something else"');
    if (/starting point/.test(h)) ok(true, 'tour says the plan can be changed');
    const next = p.locator('[data-act=coachnext]');
    if (await next.count()) await next.click(); else await p.locator('[data-act=coachskip]').first().click();
    await p.waitForTimeout(250);
  }
  ok(await p.locator('.starter').count() === 1, 'starter plan card on Today');
  ok(await p.locator('.tiles .tile').count() === 2, 'two plan tiles on Today');
  ok(await noHScroll(p), 'no sideways scroll at 390 px');
  await p.locator('[data-act=starterok]').click();
  ok(await p.locator('.starter').count() === 0 && (await state(p)).profile.starterSeen === true, 'starter card can be hidden, and stays hidden');
  await p.locator('.tile[data-act=other]').click(); await p.waitForTimeout(450);
  ok(/Train something else/.test(await p.locator('.sheet .h2').first().textContent()), 'tile opens "Train something else"');
  ok((await state(p)).profile.tour.n >= 1, 'new users do not get the "What\'s new" note');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}

// ---------- import a plan ----------
console.log('Import');
{
  const p = await page({}, null);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; });
  await p.locator('[data-act=tab][data-tab=plan]').click();
  await p.locator('.prog-card [data-act=importplan]').click(); await p.waitForTimeout(450);
  const text = [
    'My PPL',
    'Day 1 - Push',
    '1. Bench press 3x6-8',
    '- Incline DB press 3 x 8-10',
    'Lateral raises: 3 sets of 15',
    'Rope tricep pushdowns 3x12 (60s rest)',
    'Overhead cable extension, 2, 10-12',
    '',
    'Pull:',
    'Lat pulldown 3x10',
    'Straight bar pushdown 2x15',
    'Zottman flamingo curl 3x10',
    'Face pulls',
    '',
    'Legs',
    'Squat 4x5',
    'RDL 3x8-10',
    'Leg extension\t3\t12-15',
  ].join('\n');
  await p.fill('#impq', text);
  await p.locator('[data-act=impparse]').click(); await p.waitForTimeout(250);
  const days = await p.locator('.imp-day > b').allTextContents();
  ok(JSON.stringify(days) === JSON.stringify(['Push', 'Pull', 'Legs']), 'days found: ' + days.join(', '));
  const names = await p.locator('.imp-row b').allTextContents();
  const want = ['Barbell Bench Press', 'Incline Dumbbell Press', 'Dumbbell Lateral Raise', 'Cable Triceps Pushdown (Rope)', 'Overhead Cable Extension',
    'Lat Pulldown', 'Cable Triceps Pushdown (Straight bar)', 'Not found: Zottman flamingo curl', 'Cable Face Pull', 'Barbell Back Squat', 'Barbell Romanian Deadlift', 'Leg Extension Machine'];
  want.forEach((w, i) => ok(names[i] === w, `match ${i + 1}: ${names[i]}${names[i] === w ? '' : ' (wanted ' + w + ')'}`));
  const sr = await p.locator('.imp-row .sr').allTextContents();
  ok(sr[0] === '3 × 6–8' && sr[2] === '3 × 15' && sr[4] === '2 × 10–12' && sr[11] === '3 × 12–15', 'sets and reps read: ' + sr.join(' / '));
  // fix the unmatched one by picking from the library
  await p.locator('.imp-row.miss').click(); await p.waitForTimeout(450);
  ok(/Pick Zottman/.test(await p.locator('.sheet .h2').first().textContent()), 'library opens for the unmatched line');
  await p.fill('#libq', 'hammer'); await p.waitForTimeout(100);
  await p.locator('#liblist [data-act=pick]').first().click(); await p.waitForTimeout(450);
  ok(await p.locator('.imp-row.miss').count() === 0, 'unmatched line fixed from the library');
  await p.locator('[data-act=impapply]').click(); await p.waitForTimeout(450);
  const st = await state(p);
  ok(st.profile.days.length === 3 && st.profile.program.name === 'Imported plan', 'plan replaced with 3 imported days');
  ok(st.profile.days[0].ex[3].id === 'pushdown__rope' && st.profile.days[0].ex[3].rest === 60, 'rope pushdown kept with its 60 s rest');
  ok(await p.locator('.card.day').count() === 3, 'Plan tab shows the imported days');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}

// ---------- attachments keep their own weights ----------
console.log('Attachments');
{
  const p = await page({ w: 320, dark: true });
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.sessions = []; s.profile.nextDay = 0; });
  await p.locator('.card.session [data-act=start]').click(); await p.waitForTimeout(700);
  const card = p.locator('.ex').filter({ has: p.locator('h3', { hasText: 'Cable Triceps Pushdown' }) }).first();
  ok(await card.locator('[data-act=att]').count() === 4, 'pushdown card shows 4 attachment chips');
  ok(await noHScroll(p), 'no sideways scroll at 320 px with chips');
  const ei = await card.getAttribute('data-e');
  await p.locator(`.ex[data-e="${ei}"] [data-act=att]`, { hasText: 'Rope' }).click(); await p.waitForTimeout(250);
  ok(await p.locator(`.ex[data-e="${ei}"] [data-act=att][aria-pressed=true]`).textContent() === 'Rope', 'Rope selected');
  await p.fill(`#w-${ei}-0`, '35'); await p.fill(`#r-${ei}-0`, '12');
  await p.locator(`.set[data-e="${ei}"][data-s="0"] [data-act=log]`).click(); await p.waitForTimeout(200);
  let st = await state(p);
  ok(st.profile.days[0].ex.some(x => x.id === 'pushdown__rope'), 'plan remembers Rope for this day');
  await p.locator('[data-act=finish]').click(); await p.waitForTimeout(450);
  await p.locator('[data-act=save]').click(); await p.waitForTimeout(700);
  st = await state(p);
  ok(st.sessions[0].entries.some(e => e.exId === 'pushdown__rope' && e.sets[0].w === 35), 'saved under the rope variant');
  // next time: rope ghost is there, straight bar is new
  await p.locator('[data-act=day][data-i="0"]').click(); await p.waitForTimeout(150);
  ok(/Cable Triceps Pushdown \(Rope\)/.test(await p.locator('.card.session').textContent()), 'Today preview names the attachment');
  await p.locator('.card.session [data-act=start]').click(); await p.waitForTimeout(700);
  const e2 = await p.locator('.ex').filter({ has: p.locator('h3', { hasText: 'Cable Triceps Pushdown' }) }).first().getAttribute('data-e');
  ok(/35/.test(await p.locator(`.set[data-e="${e2}"][data-s="0"] .ghost`).textContent()), 'rope ghost shows 35');
  await p.locator(`.ex[data-e="${e2}"] [data-act=att]`, { hasText: 'Straight bar' }).click(); await p.waitForTimeout(250);
  ok(/New/.test(await p.locator(`.set[data-e="${e2}"][data-s="0"] .ghost`).textContent()), 'straight bar has no ghost of its own yet');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}

// ---------- existing user sees "What's new" once; old saved data still loads ----------
console.log('Existing user');
{
  const seed = { profile: { units: 'kg', days: [{ name: 'Arms', ex: [{ id: 'pushdown', sets: 3, lo: 10, hi: 12 }, { id: 'ohext__gone-handle', sets: 2, lo: 10, hi: 12 }] }], tour: { done: true, wo: true } },
    sessions: [{ id: 'a1', dayIdx: 0, dayName: 'Arms', date: Date.now() - 86400000, dur: 40, entries: [{ exId: 'pushdown', sets: [{ w: 30, r: 12 }] }] }], active: null };
  const p = await page({}, seed);
  ok(/New in Rival/.test(await p.locator('.sheet .h2').first().textContent().catch(() => '')), '"What\'s new" shown');
  await p.locator('[data-act=newsok]').click(); await p.waitForTimeout(400);
  const st = await state(p);
  ok(st.profile.tour.n >= 1, 'marked as seen');
  ok(st.profile.days[0].ex.length === 2, 'unknown attachment id kept, not dropped');
  ok(st.sessions.length === 1 && st.sessions[0].entries[0].exId === 'pushdown', 'old history untouched');
  await p.reload(); await p.waitForTimeout(600);
  ok(await p.locator('.sheet').count() === 0, '"What\'s new" not shown again');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
