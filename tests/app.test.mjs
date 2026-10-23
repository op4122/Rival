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
  if (await p.locator('[data-act=gateskip]').count()) { await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(400); }
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('rival.v1')); (${fn})(s); localStorage.setItem('rival.v1', JSON.stringify(s)); })()`);
  await p.reload(); await p.waitForTimeout(500);
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// ---------- fresh install: tour, starter card, tiles ----------
console.log('Fresh install');
{
  const p = await page();
  ok(await p.locator('.gate [data-act=authgoogle]').count() === 1, 'sign-in screen comes first, Google button on it');
  ok(await p.locator('.gate a[href="../privacy.html"]').count() === 1 && await p.locator('.gate a[href="../terms.html"]').count() === 1, 'sign-in screen links Privacy and Terms');
  ok(await noHScroll(p), 'sign-in screen: no sideways scroll');
  await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(900);
  ok(await p.locator('.gate').count() === 0, 'Continue without an account closes it');
  ok(await p.locator('.coach').count() === 1, 'tour starts');
  for (let i = 0; i < 20 && await p.locator('.coach').count(); i++) {
    const h = await p.locator('#coach-h').textContent();
    if (/Your plan bends/.test(h)) ok(true, 'tour covers "Train something else"');
    if (/starting point/.test(h)) ok(true, 'tour says the plan can be changed');
    if (/Start when you/.test(h)) ok(await p.evaluate(() => { const hole = document.querySelector('.coach-hole').getBoundingClientRect(), b = document.querySelector('#startbar .btn').getBoundingClientRect(); return Math.abs(hole.top - b.top) < 12 && hole.height > 30; }), 'tour spotlights the pinned Start button');
    const next = p.locator('[data-act=coachnext]');
    if (await next.count()) await next.click(); else await p.locator('[data-act=coachskip]').first().click();
    await p.waitForTimeout(250);
  }
  // Fix 1: Start pinned above the tab bar, visible without scrolling
  const sb = await p.evaluate(() => { const b = document.querySelector('#startbar .btn'), t = document.querySelector('.tabs'); if (!b) return null; const r = b.getBoundingClientRect(), tr = t.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, tabsTop: tr.top, vh: innerHeight, inCard: !!b.closest('.card') }; });
  ok(sb && sb.bottom <= sb.tabsTop && sb.top > 0 && sb.bottom < sb.vh, 'Start button is on screen, just above the tab bar');
  ok(sb && !sb.inCard, 'Start is no longer inside the targets card');
  ok(await p.evaluate(() => { const t = document.querySelector('.tiles'), c = document.querySelector('.card.session'); return !!t && !!c && (c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; }), 'Train something else / Edit your plan sit below the targets');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const last = [...document.querySelectorAll('#view .tile')].pop().getBoundingClientRect(), b = document.querySelector('#startbar .btn').getBoundingClientRect(); return last.bottom <= b.top; }), 'content scrolls fully clear of the pinned button');
  await p.evaluate(() => window.scrollTo(0, 0));
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
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(700);
  ok(await p.locator('#startbar').isHidden() || await p.locator('#startbar').count() === 0, 'pinned Start hidden while the logger is open');
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
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(700);
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
  ok(await p.locator('.gate').count() === 1, 'existing user also sees the sign-in screen once');
  await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(900);
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

// ---------- rest timer sound ----------
console.log('Rest sound');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  await p.addInitScript(() => {
    window.__beeps = 0;
    window.AudioContext = class { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createOscillator() { window.__beeps++; return { frequency: {}, connect() {}, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } };
  });
  await p.clock.install();
  await p.goto(URL); await p.clock.runFor(600);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.sessions = []; });
  await p.clock.runFor(600);
  await p.locator('#startbar [data-act=start]').click(); await p.clock.runFor(900);
  const logFirst = async () => { await p.fill('#w-0-0', '60'); await p.fill('#r-0-0', '8'); await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); };
  await logFirst();
  const rest = await p.evaluate(() => document.querySelector('#rest .rt').textContent);
  ok(/\d:\d\d/.test(rest), 'rest timer started: ' + rest);
  await p.clock.runFor(60000);
  ok(await p.evaluate(() => window.__beeps) === 0, 'quiet while resting');
  await p.clock.runFor(100000);
  ok(await p.evaluate(() => window.__beeps) === 3, 'three-tone chime when rest ends (' + await p.evaluate(() => window.__beeps) + ')');
  ok(/Rest is up/.test(await p.locator('#rest').textContent()), 'banner says rest is up');
  // sound off
  await p.locator('[data-tab=progress]').count(); await p.locator('[data-act=min]').click(); await p.clock.runFor(700);
  await p.locator('[data-tab=settings]').click();
  await p.locator('[data-act=restsnd][data-v="0"]').click();
  ok((await state(p)).profile.restSound === false, 'sound can be turned off');
  await p.locator('.resume').click(); await p.clock.runFor(700);
  await p.fill('#w-0-1', '60'); await p.fill('#r-0-1', '8'); await p.locator('.set[data-e="0"][data-s="1"] [data-act=log]').click();
  await p.clock.runFor(200000);
  ok(await p.evaluate(() => window.__beeps) === 3, 'no chime with sound off');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}

console.log('Rest when the phone locks');
{
  const p = await page();
  await p.clock.install();
  await p.reload(); await p.clock.runFor(600);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.sessions = []; });
  await p.clock.runFor(600);
  await p.locator('#startbar [data-act=start]').click(); await p.clock.runFor(900);
  await p.fill('#w-0-0', '60'); await p.fill('#r-0-0', '8'); await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click();
  await p.clock.runFor(300);
  const r = (await state(p)).active.rest;
  ok(r && r.end > Date.now() - 1e12 && r.total > 0, 'rest end time saved with the workout');
  ok(parseFloat(await p.evaluate(() => getComputedStyle(document.querySelector('#rt')).fontSize)) >= 40, 'remaining time is large');
  ok(await p.locator('#resttip').count() === 1 && /Keep Rival open on screen for the rest alert/.test(await p.locator('#resttip').textContent()), 'one-time tip above the rest bar');
  await p.locator('[data-act=resttipok]').click(); await p.clock.runFor(200);
  ok(await p.locator('#resttip').count() === 0 && (await state(p)).profile.restTip === true, '"Got it" hides the tip for good');
  // The app is closed in the background for 50 s, then opened again
  await p.reload(); await p.clock.runFor(50000);
  await p.locator('#resume').click(); await p.clock.runFor(700);
  const left = await p.locator('#rt').textContent();
  const [m, sec] = left.split(':').map(Number);
  ok(Math.abs((m * 60 + sec) - (r.total - 51)) <= 2, `after reopening, the timer shows the real time left (${left})`);
  ok(await p.locator('#resttip').count() === 0, 'tip not shown again');
  await p.locator('[data-act=rest15]').click(); await p.clock.runFor(100);
  ok(Math.abs((await state(p)).active.rest.end - r.end - 15000) < 50, '+15s moves the saved end time');
  // Back long after the rest ended: nothing stale is shown
  await p.reload(); await p.clock.runFor(300000);
  await p.locator('#resume').click(); await p.clock.runFor(700);
  ok(!(await p.locator('#rest').getAttribute('class')).includes('show') && !(await state(p)).active.rest, 'a rest that ended minutes ago is cleared, not shown');
  ok(await noHScroll(p), 'no sideways scroll');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await p.context().close();
}

console.log('Gym-readable logger');
for (const [w, dark] of [[360, false], [390, true]]) {
  const p = await page({ w, dark });
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.profile.restTip = true; });
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900);
  await p.fill('#w-0-0', '102.5'); await p.fill('#r-0-0', '10');
  const m = await p.evaluate(() => {
    const vw = innerWidth, cs = (e, ps) => getComputedStyle(e, ps);
    const wide = [...document.querySelectorAll('.wo .ex')].filter(e => e.getBoundingClientRect().right > vw).length;
    const inp = cs(document.querySelector('#w-0-0'));
    const g = document.querySelector('.g-txt:not(.none)'), gs = cs(g);
    const small = [...document.querySelectorAll('.wo button')].filter(e => { const r = e.getBoundingClientRect(); if (!r.width || e.closest('.useg')) return false; const a = cs(e, '::after'); const h = a.content !== 'none' ? Math.max(r.height, parseFloat(a.height)) : r.height; return h < 44 || r.width < 44; }).map(e => e.dataset.act);
    const tiny = [...document.querySelectorAll('.wo *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs(e).fontSize) < 12.5).map(e => e.className);
    const clipped = [...document.querySelectorAll('.set input, .g-txt')].filter(e => e.scrollWidth > e.clientWidth + 1).length;
    return { wide, f: parseFloat(inp.fontSize), wgt: +inp.fontWeight, tab: inp.fontVariantNumeric.includes('tabular'), gf: parseFloat(gs.fontSize), gbg: gs.backgroundColor, gc: gs.color, ink: cs(document.body).color, small, tiny, clipped, gsp: g.querySelector('i') ? cs(g.querySelector('i')).display !== 'none' : null, gtxt: g.textContent };
  });
  const tag = `${w}px${dark ? ' dark' : ''}`;
  ok(m.wide === 0 && await noHScroll(p), `${tag}: cards fit the screen`);
  ok(m.f >= 20 && m.wgt >= 700 && m.tab, `${tag}: weight and reps ${m.f}px bold tabular`);
  ok(m.gf >= 14 && m.gbg !== 'rgba(0, 0, 0, 0)' && m.gc === m.ink, `${tag}: ghost ${m.gf}px, full contrast on a solid chip`);
  ok(m.small.length === 0, `${tag}: every tap target at least 44×44 ` + m.small.join(','));
  ok(m.tiny.length === 0, `${tag}: no text under 12.5px ` + m.tiny.join(','));
  ok(m.clipped === 0, `${tag}: "102.5" and the ghost are not cut off`);
  ok(w > 380 ? m.gsp === true : m.gsp === false, `${tag}: ghost "${m.gtxt}" ${w > 380 ? 'with spaces' : 'shown without spaces'}`);
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await p.context().close();
}

console.log('Safer set removal');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForTimeout(500);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.profile.restTip = true; });
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900);
  const sets = () => p.locator('.ex[data-e="0"] .set').count();
  ok(await p.locator('.ex-act [data-act=delset], .ex-act [data-act=rmex]').count() === 0 && await p.locator('.ex-act button').count() === await p.locator('.ex').count(), 'only "Add set" left under each exercise');
  ok(await p.locator('.ex[data-e="0"] .ex-tools [data-act=exmenu]').count() === 1, '⋯ button after Swap');
  const swipe = async (si, dist = 140) => {
    const b = await p.locator(`.set[data-e="0"][data-s="${si}"] .ghost`).boundingBox(), y = b.y + b.height / 2; let x = b.x + 220;
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 0; i < 10; i++) { x -= dist / 10; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(350);
  };
  await p.fill('#w-0-1', '80'); await p.fill('#r-0-1', '8'); await p.locator('.set[data-e="0"][data-s="1"] [data-act=log]').click(); await p.waitForTimeout(300);
  await swipe(1, 40);
  ok(!(await p.locator('.set[data-e="0"][data-s="1"]').evaluate(e => e.style.transform)), 'a short swipe springs back');
  await swipe(1);
  ok(/-9\d/.test(await p.locator('.set[data-e="0"][data-s="1"]').evaluate(e => e.style.transform)) && await p.locator('.set-wrap.sw .set-del').isVisible(), 'swipe left shows Delete');
  ok(await p.locator('.set[data-e="0"][data-s="1"]').evaluate(e => e.classList.contains('done')), 'swiping does not toggle the logged set');
  await p.locator('.set-del[data-e="0"][data-s="1"]').tap(); await p.waitForTimeout(300);
  ok(await sets() === 2 && /Set 2 deleted/.test(await p.locator('.toast').textContent()), 'Delete removes the set, with an Undo toast');
  await p.locator('.toast button').tap(); await p.waitForTimeout(300);
  ok(await sets() === 3 && await p.locator('.set[data-e="0"][data-s="1"]').evaluate(e => e.classList.contains('done')) && (await state(p)).active.entries[0].sets[1].w === 80, 'Undo puts the logged set back where it was');
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').tap(); await p.waitForTimeout(450);
  ok(await p.locator('.sheet [data-act=menudelset]').count() === 3 && /80 kg × 8, logged/.test(await p.locator('.sheet').textContent()), '⋯ menu lists each set with its weight');
  await p.locator('.sheet [data-act=menudelset][data-s="0"]').tap(); await p.waitForTimeout(500);
  ok(await sets() === 2 && (await state(p)).active.entries[0].sets[0].w === 80, '"Delete set 1" from the menu');
  const toastMs = await p.evaluate(() => new Promise(r => { const t0 = Date.now(); const iv = setInterval(() => { if (!document.querySelector('.toast.show')) { clearInterval(iv); r(Date.now() - t0); } }, 100); }));
  ok(toastMs > 4000 && toastMs < 6000, `Undo stays for about 5 s (${toastMs} ms)`);
  const name = await p.locator('.ex .h3').first().textContent();
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').tap(); await p.waitForTimeout(450);
  await p.locator('.sheet [data-act=rmex]').tap(); await p.waitForTimeout(450);
  ok(await p.locator('.ex .h3').first().textContent() !== name && /Removed/.test(await p.locator('.toast').textContent()), '"Remove exercise" lives in the ⋯ menu');
  await p.locator('.toast button').tap(); await p.waitForTimeout(300);
  ok(await p.locator('.ex .h3').first().textContent() === name, 'and can be undone');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(500);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.profile.restTip = true; });
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900);
  ok(await p.locator('.set').first().evaluate(e => !/transform/.test(getComputedStyle(e).transitionProperty)), 'reduced motion: rows snap instead of sliding');
  await ctx.close();
}

console.log('Units per exercise');
{
  const p = await page({ w: 360 });
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; s.profile.restTip = true; });
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(900);
  ok(await p.locator('.wo .useg').count() === 0, 'no kg/lb switch on the cards');
  ok(await p.locator('.wo .u-tag').count() === 0, 'no unit tag while every exercise uses the default');
  await p.fill('#w-0-0', '100'); await p.fill('#r-0-0', '5'); await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); await p.waitForTimeout(300);
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').click(); await p.waitForTimeout(450);
  ok(await p.locator('.sheet [data-act=exunit][data-u=def][aria-pressed=true]').count() === 1 && /Use default \(kg\)/.test(await p.locator('.sheet').textContent()), '⋯ menu: "Units for this exercise", Use default selected');
  ok(await p.locator('.sheet [data-act=exunit]').evaluateAll(b => b.every(x => x.getBoundingClientRect().height >= 44 && x.scrollWidth <= x.clientWidth + 1)), 'unit buttons are 44px tall and fit at 360px');
  await p.locator('.sheet [data-act=exunit][data-u=lb]').click(); await p.waitForTimeout(500);
  let st = await state(p);
  ok(st.profile.exUnit[st.active.entries[0].exId] === 'lb' && /in lb/.test(await p.locator('.ex[data-e="0"] .u-tag').textContent()), 'lb for this exercise: tag "in lb" on its card');
  ok(await p.locator('.ex[data-e="1"] .u-tag').count() === 0 && /^kg/.test(await p.locator('.ex[data-e="1"] .cols span').nth(2).textContent()), 'other exercises stay in kg');
  ok(st.active.entries[0].sets[0].w === 100 && await p.inputValue('#w-0-0') === '220.5', 'logged set keeps the weight lifted: 100 kg shown as 220.5 lb');
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').click(); await p.waitForTimeout(450);
  await p.locator('.sheet [data-act=exunit][data-u=def]').click(); await p.waitForTimeout(500);
  st = await state(p);
  ok(!st.profile.exUnit[st.active.entries[0].exId] && await p.locator('.wo .u-tag').count() === 0 && await p.inputValue('#w-0-0') === '100', '"Use default" goes back to kg, tag gone, 100 kg unchanged');
  ok(await noHScroll(p), 'no sideways scroll');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await p.context().close();
}

// ---------- suggested progression (double progression) ----------
console.log('Suggested progression');
{
  const day = Date.now() - 2 * 86400000, today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const progSeed = (extra = {}) => ({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null,
      days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 3, lo: 6, hi: 8 }, { id: 'squat', sets: 3, lo: 6, hi: 8 }, { id: 'pullup', sets: 3, lo: 6, hi: 10 }] }], ...(extra.profile || {}) },
    sessions: [{ id: 's1', dayIdx: 0, dayName: 'Upper', date: day, dur: 50, entries: [
      { exId: 'bench', sets: [{ w: 80, r: 8 }, { w: 80, r: 8 }, { w: 80, r: 8 }] },
      { exId: 'squat', sets: [{ w: 100, r: 8 }, { w: 100, r: 7 }, { w: 100, r: 6 }] },
      { exId: 'pullup', sets: [{ w: 0, r: 10 }, { w: 0, r: 10 }, { w: 0, r: 10 }] }] }], active: null });
  // Record what the app sends to analytics, without PostHog.
  const spy = () => { window.__ev = []; let real; Object.defineProperty(window, 'RivalAnalytics', { configurable: true, get: () => real,
    set: v => { real = Object.assign({}, v, { track: (n, p) => { window.__ev.push([n, p]); } }); } }); };
  async function start(seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
    p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    await p.addInitScript(spy);
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
    await p.goto(URL); await p.waitForTimeout(600);
    await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
    return p;
  }
  // Per set row: the visible badges ("+1", "+2.5", "Eased"), plus "↺" when the put-back button shows.
  const hints = (p, e) => p.locator(`.set[data-e="${e}"]`).evaluateAll(rows => rows.map(r => [...r.querySelectorAll('.sug-b:not([hidden])')].map(x => x.textContent).concat(r.querySelector('.sug-r:not([hidden])') ? ['Reset'] : []).join(' ')));
  const ev = (p, n) => p.evaluate(n => window.__ev.filter(x => x[0] === n).map(x => x[1]), n);

  // The rule itself
  const p = await start(progSeed());
  const P = (g, sets, lo, hi, step, bw) => p.evaluate(a => window.RivalProgression.progression(...a), [g, sets, lo, hi, step, bw]);
  const s3 = (w, ...r) => r.map(x => ({ w, r: x }));
  let r = await P(s3(80, 8, 8, 8), 3, 6, 8, 2.5);
  ok(r.type === 'weight' && r.sets.every(x => x.w === 82.5 && x.r === 6), 'all sets at the top: next weight up, reps back to the bottom');
  r = await P(s3(30, 12, 12), 2, 8, 12, 2);
  ok(r.type === 'weight' && r.sets.every(x => x.w === 32 && x.r === 8), 'dumbbell jumps 2 kg');
  r = await P(s3(100, 8, 7, 6), 3, 6, 8, 2.5);
  ok(r.type === 'reps' && JSON.stringify(r.sets.map(x => [x.w, x.r])) === '[[100,8],[100,8],[100,6]]', '+1 rep only on the first set that missed the top: ' + JSON.stringify(r.sets));
  r = await P(s3(100, 6, 6, 6), 3, 6, 8, 2.5);
  ok(r.type === 'reps' && r.sets[0].r === 7 && r.sets[1].r === 6 && r.sets.every(x => x.w === 100), 'first set gets the extra rep when all missed');
  r = await P(s3(100, 4, 5, 8), 3, 6, 8, 2.5);
  ok(r.sets[0].r === 6 && r.sets[1].r === 6 && r.sets[2].r === 8, 'reps never fall below the bottom of the range');
  r = await P(s3(80, 8, 8), 3, 6, 8, 2.5);
  ok(r.type === 'reps' && r.sets.length === 3 && r.sets[2].w === 80, 'fewer sets last time than planned: no weight jump yet');
  r = await P(s3(0, 10, 10, 10), 3, 6, 10, 2.5, true);
  ok(r.type === 'reps' && r.sets[0].r === 11 && r.sets[1].r === 10 && r.sets.every(x => x.w === 0), 'bodyweight at the top: one more rep, no weight');
  r = await P(s3(10, 10, 10, 10), 3, 6, 10, 2.5, true);
  ok(r.type === 'weight' && r.sets[0].w === 12.5, 'weighted bodyweight lift adds weight');
  ok(await P([], 3, 6, 8, 2.5) === null, 'no ghost, no suggestion');

  // In the workout
  ok(JSON.stringify(await hints(p, 0)) === JSON.stringify(['+2.5', '', '']), 'bench: one "+2.5" badge on the weight, not repeated on every set');
  ok(await p.locator('.set[data-e="0"][data-s="0"] .sug-b').evaluate(b => b.getBoundingClientRect().top < b.parentElement.querySelector('.in-w').getBoundingClientRect().top + 4), 'badge sits on the corner of the weight box');
  ok(await p.inputValue('#w-0-0') === '82.5' && await p.inputValue('#r-0-0') === '6', 'inputs pre-filled with the suggestion');
  ok(JSON.stringify(await hints(p, 1)) === JSON.stringify(['', '+1', '']), 'squat: "+1" only on the set that moves on (set 2)');
  ok(JSON.stringify(await hints(p, 2)) === JSON.stringify(['+1', '', '']) && await p.inputValue('#r-2-0') === '11', 'pull-up: bodyweight gets one more rep (11)');
  const sug = await ev(p, 'progression_suggested');
  ok(sug.length === 3 && sug.find(x => x.exercise_id === 'bench').type === 'weight' && sug.find(x => x.exercise_id === 'squat').type === 'reps' && sug.every(x => x.eased === false),
    'progression_suggested once per exercise, with exercise_id and type: ' + JSON.stringify(sug));
  // Override, then tap the hint to restore
  await p.fill('#w-1-0', '95'); await p.fill('#r-1-0', '5');
  ok((await hints(p, 1))[0] === 'Reset', 'changing the numbers shows Reset on that set');
  await p.locator('.set[data-e="1"][data-s="0"] .sug-r').click();
  ok(await p.inputValue('#w-1-0') === '100' && await p.inputValue('#r-1-0') === '8', 'tapping the hint fills the inputs');
  ok((await hints(p, 1))[0] === '', 'Reset hides again once the numbers match');
  // Accepted: logging a set that moves on, as suggested
  await p.locator('.set[data-e="1"][data-s="0"] [data-act=log]').click(); await p.waitForTimeout(200);
  ok((await ev(p, 'progression_accepted')).length === 0, 'logging a set that only repeats the ghost is not "accepted"');
  await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); await p.waitForTimeout(200);
  await p.locator('.set[data-e="0"][data-s="1"] [data-act=log]').click(); await p.waitForTimeout(200);
  let acc = await ev(p, 'progression_accepted');
  ok(acc.length === 1 && acc[0].exercise_id === 'bench' && acc[0].type === 'weight' && acc[0].via === 'prefill', 'progression_accepted once for bench (prefill): ' + JSON.stringify(acc));
  ok(await p.locator('.set[data-e="0"][data-s="0"] .sug-b, .set[data-e="0"][data-s="0"] .sug-r').count() === 0, 'badges gone once the set is logged');
  await p.fill('#r-1-1', '7'); ok((await hints(p, 1))[1] === 'Reset', 'editing the +1 set swaps the badge for Reset'); await p.locator('.set[data-e="1"][data-s="1"] .sug-r').click();
  await p.locator('.set[data-e="1"][data-s="1"] [data-act=log]').click(); await p.waitForTimeout(200);
  acc = await ev(p, 'progression_accepted');
  ok(acc.length === 2 && acc[1].exercise_id === 'squat' && acc[1].type === 'reps' && acc[1].via === 'tap', 'progression_accepted for squat via tap, type reps');
  // Weight jump per exercise (⋯ menu)
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').click(); await p.waitForTimeout(400);
  ok(/2\.5 kg/.test(await p.locator('.sheet [data-act=exinc]').first().locator('xpath=..').textContent()), 'menu shows the bench weight jump, 2.5 kg');
  await p.locator('.sheet [data-act=exinc][data-v="1"]').click(); await p.waitForTimeout(200);
  ok(/5 kg/.test(await p.locator('.sheet .stepper output').last().textContent()), 'jump goes up to 5 kg');
  ok((await state(p)).profile.exInc.bench === 5, 'saved per exercise in settings (syncs with the profile)');
  ok(await p.inputValue('#w-0-2') === '85' && JSON.stringify(await hints(p, 0)) === JSON.stringify(['', '', '+5']), 'unlogged bench set re-planned to 85 × 6 ("+5"); logged sets keep 82.5');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();

  // Readiness eases after the progression, and says so
  const q = await start(progSeed({ profile: { readiness: { date: today, score: 50, sleep: 1, sore: 1, energy: 2 } } }));
  ok(JSON.stringify(await hints(q, 0)) === JSON.stringify(['Eased', '', '']) && await q.inputValue('#w-0-0') === '77.5', 'eased day: 82.5 eased 5% to 77.5, labelled "Eased" once');
  ok(JSON.stringify(await hints(q, 1)) === JSON.stringify(['Eased', '+1', '']), 'eased squat still shows its +1 rep');
  ok((await ev(q, 'progression_suggested')).filter(x => x.exercise_id !== 'pullup').every(x => x.eased === true), 'progression_suggested has eased: true (bodyweight pull-up has nothing to ease)');
  ok(await noHScroll(q), 'no sideways scroll with badges');
  ok(await q.evaluate(() => { const a = document.querySelector('.set[data-e="0"][data-s="0"]').getBoundingClientRect().height, b = document.querySelector('.set[data-e="0"][data-s="1"]').getBoundingClientRect().height; return Math.abs(a - b) < 1; }), 'badges add no height to the row');
  await q.context().close();

  // lb: the next weight up is a plate you can load
  const l = await start(progSeed({ profile: { units: 'lb' } }));
  const lw = +(await l.inputValue('#w-0-0'));
  ok(lw % 5 === 0 && lw > 176 && lw <= 185 && /^\+\d+(\.5)?$/.test((await hints(l, 0))[0]), 'lb: 80 kg (176 lb) goes to a loadable ' + lw + ' lb, badge ' + (await hints(l, 0))[0]);
  await l.context().close();
}

// ---------- plateau and deload hints ----------
console.log('Plateau and deload hints');
{
  const D = 86400000, now = Date.now(), today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const s3 = (w, r) => [{ w, r }, { w, r }, { w, r }];
  // bench ties its ghost 3 times (stuck), squat goes up every time. rowW: the row's weights (stuck when all the same).
  const plSeed = ({ readiness = null, rq = null, rowW = [60, 62.5, 65, 67.5], profile = {} } = {}) => ({
    profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: rq,
      days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 3, lo: 6, hi: 8 }, { id: 'squat', sets: 3, lo: 6, hi: 8 }, { id: 'bbrow', sets: 4, lo: 8, hi: 12 }] }], ...profile },
    sessions: [10, 7, 4, 2].map((ago, i) => ({ id: 'p' + i, dayIdx: 0, dayName: 'Upper', date: now - ago * D, dur: 50, readiness, entries: [
      { exId: 'bench', sets: s3(80, 7) }, { exId: 'squat', sets: s3(100 + i * 5, 8) }, { exId: 'bbrow', sets: s3(rowW[i], 10) }] })), active: null });
  const spy = () => { window.__ev = []; let real; Object.defineProperty(window, 'RivalAnalytics', { configurable: true, get: () => real,
    set: v => { real = Object.assign({}, v, { track: (n, p) => { window.__ev.push([n, p]); } }); } }); };
  async function open(seed, w = 390) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
    p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    await p.addInitScript(spy);
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
    await p.goto(URL); await p.waitForTimeout(600);
    return p;
  }
  const startW = async p => { await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800); };
  const ev = (p, n) => p.evaluate(n => window.__ev.filter(x => x[0] === n).map(x => x[1]), n);

  // The four events are allowed by the analytics helper and documented
  { const fs = await import('node:fs'), js = fs.readFileSync('app/analytics.js', 'utf8'), md = fs.readFileSync('ANALYTICS.md', 'utf8');
    for (const n of ['plateau_detected', 'plateau_action', 'deload_suggested', 'deload_accepted'])
      ok(js.includes(`'${n}'`) && js.includes(`}} ${n}`) && md.includes('`' + n + '`'), n + ' is in analytics.js (list and types) and ANALYTICS.md'); }

  // The rule itself
  const p = await open(plSeed());
  const R = (fn, ...a) => p.evaluate(([fn, a]) => window.RivalPlateau[fn](...a), [fn, a]);
  const pts = (...b) => b.map((best, i) => ({ date: i + 1, best }));
  ok(await R('stuckRun', pts(100, 100, 100, 100)) === 3, 'three ties in a row: stuck for 3');
  ok(await R('stuckRun', pts(100, 99, 98, 97)) === 3, 'three losses in a row count too');
  ok(await R('stuckRun', pts(100, 100, 100.5, 100)) === 1, 'any gain breaks the run');
  ok(await R('stuckRun', pts(100, 100, 100)) === 2, 'needs 4 sessions (3 comparisons) to reach 3');
  ok(await R('stuckRun', pts(100, 100, 100, 100), 2) === 2, 'sessions before a card was acted on are not counted again');
  ok(await R('dlSets', 3) === 2 && await R('dlSets', 4) === 2 && await R('dlSets', 5) === 3 && await R('dlSets', 1) === 1, 'deload sets: about 60%, at least 1');
  ok(await R('deloadDue', 49, 2) && !(await R('deloadDue', 50, 2)) && !(await R('deloadDue', 40, 1)) && !(await R('deloadDue', null, 3)), 'deload due only under 50 readiness with 2+ stuck lifts');
  ok(await p.locator('.deload').count() === 0, 'no deload card without low readiness');

  // Plateau card in the workout
  await startW(p);
  ok(await p.locator('.ex[data-e="0"] .plat').count() === 1 && /Stuck for 3 sessions\. Try a swap \(same muscles\) or a lighter week\./.test(await p.locator('.ex[data-e="0"] .plat').textContent()), 'bench shows the plateau card');
  ok(await p.locator('.ex[data-e="1"] .plat').count() === 0, 'squat (still improving) has no card');
  let det = await ev(p, 'plateau_detected');
  ok(det.length === 1 && det[0].exercise_id === 'bench' && det[0].sessions === 3, 'plateau_detected once for bench: ' + JSON.stringify(det));
  ok(await noHScroll(p), 'no sideways scroll with the card');
  await p.locator('.ex[data-e="0"] [data-act=pllight]').click(); await p.waitForTimeout(300);
  ok(await p.inputValue('#w-0-0') === '72.5' && await p.inputValue('#w-0-2') === '72.5', 'lighter: 80 → 72.5 kg (−10%, rounded to a plate)');
  ok(await p.inputValue('#r-0-0') === '7' && await p.inputValue('#r-0-2') === '7', "BUG-8: lighter keeps the ghost's reps (7), not the progression's +1 (8)");
  ok((await p.locator('.set[data-e="0"][data-s="0"] .sug-b:not([hidden])').textContent()) === '−10%', 'labelled "−10%"');
  ok(await p.locator('.plat').count() === 0, 'card gone after acting');
  let act = await ev(p, 'plateau_action');
  ok(act.length === 1 && act[0].action === 'lighter' && act[0].exercise_id === 'bench', 'plateau_action lighter');
  let st = await state(p);
  ok(st.profile.plateau.bench.light === true && st.profile.plateau.bench.at === st.active.startedAt, 'saved in the profile (syncs with settings)');
  // Save the lighter session: it doesn't count, and the card waits for 3 new stuck sessions
  await p.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); await p.waitForTimeout(200);
  await p.locator('[data-act=finish]').click(); await p.waitForTimeout(400); await p.locator('[data-act=save]').click(); await p.waitForTimeout(800);
  await startW(p);
  ok(await p.locator('.plat').count() === 0, 'next workout: no card again right after acting');
  ok((await ev(p, 'plateau_detected')).length === 1, 'plateau_detected not sent again');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();

  // Dismiss and Swap
  const d = await open(plSeed()); await startW(d);
  await d.locator('.ex[data-e="0"] [data-act=plx]').click(); await d.waitForTimeout(200);
  ok(await d.locator('.plat').count() === 0 && (await ev(d, 'plateau_action'))[0].action === 'dismiss', 'dismiss hides the card, plateau_action dismiss');
  ok(await d.inputValue('#w-0-0') === '80' && await d.inputValue('#r-0-0') === '8', 'dismiss leaves the suggestion alone (80 × 8)');
  await d.context().close();
  const w = await open(plSeed()); await startW(w);
  await w.locator('.ex[data-e="0"] [data-act=plswap]').click(); await w.waitForTimeout(500);
  ok(/Swap Barbell Bench/.test(await w.locator('.sheet .h2').textContent()) && /Same muscles/.test(await w.locator('.sheet').textContent()), 'Swap opens the Swap sheet, same muscles first');
  ok((await ev(w, 'plateau_action'))[0].action === 'swap', 'plateau_action swap');
  await w.context().close();

  // Deload: low readiness and 2 stuck lifts (bench and row)
  const lowR = { readiness: 40, rq: { date: today, score: 40, sleep: 1, sore: 1, energy: 1 }, rowW: [60, 60, 60, 60] };
  const q = await open(plSeed(lowR), 320);
  ok(await q.locator('.deload [data-act=dlok]').count() === 1 && /averaged 40 over the last 7 days and 2 lifts are stuck/.test(await q.locator('.deload').textContent()), 'Today offers a deload week');
  ok(await noHScroll(q), 'deload card: no sideways scroll at 320 px');
  let sug = await ev(q, 'deload_suggested');
  ok(sug.length === 1 && sug[0].avg_readiness === 40 && sug[0].plateaued === 2, 'deload_suggested with avg and count: ' + JSON.stringify(sug));
  await q.reload(); await q.waitForTimeout(500);
  ok((await ev(q, 'deload_suggested')).length === 0, 'not sent again on the next render');
  await q.locator('[data-act=dlok]').click(); await q.waitForTimeout(300);
  ok((await ev(q, 'deload_accepted')).length === 1, 'deload_accepted');
  st = await state(q);
  ok(Math.abs(st.profile.deload.end - st.profile.deload.start - 7 * D) < 1000, 'deload saved in the profile, 7 days');
  ok(/Deload week/.test(await q.locator('.ovr.deload').textContent()) && await q.locator('[data-act=dlok]').count() === 0, 'banner replaces the offer');
  await startW(q);
  ok(await q.locator('.ex[data-e="0"] .set').count() === 2 && await q.locator('.ex[data-e="2"] .set').count() === 2, 'deload: bench 3 → 2 sets, row 4 → 2');
  ok(await q.inputValue('#w-0-0') === '80' && await q.inputValue('#r-0-0') === '7', 'same weights as last time, no progression, no easing (80 × 7)');
  ok(await q.locator('.plat').count() === 0 && await q.locator('.sug-b:not([hidden])').count() === 0, 'no plateau cards or badges during a deload');
  ok(/Deload week/.test(await q.locator('.adjust-note').textContent()), 'workout says it is a deload week');
  // Swapping inside a deload keeps the set count
  await q.locator('.ex[data-e="1"] [data-act=swap]').click(); await q.waitForTimeout(400);
  await q.locator('.sheet [data-act=swpick]').first().click(); await q.waitForTimeout(400);
  ok(await q.locator('.ex[data-e="1"] .set').count() === 2, 'a swap mid-deload keeps the sets it had (2)');
  await q.context().close();

  // Deload ends after 7 days and the plan is back to normal
  const e = await open(plSeed({ ...lowR, profile: { deload: { start: now - 8 * D, end: now - D } } }));
  ok(await e.locator('.deload').count() === 0, 'ended deload: no banner, and no new offer for 2 weeks');
  ok(/3 × 6–8/.test(await e.locator('.card.session .pv').first().textContent()), 'targets back to 3 sets');
  await e.context().close();
  // Not now
  const n = await open(plSeed(lowR));
  await n.locator('[data-act=dlno]').click(); await n.waitForTimeout(300);
  ok(await n.locator('.deload').count() === 0 && (await state(n)).profile.deload.off > 0, '"Not now" hides it and is saved');
  await n.reload(); await n.waitForTimeout(500);
  ok(await n.locator('.deload').count() === 0, 'still hidden after a reload');
  await n.context().close();
  // One stuck lift is not enough
  const one = await open(plSeed({ ...lowR, rowW: [60, 62.5, 65, 67.5] }));
  ok(await one.locator('.deload').count() === 0, 'one stuck lift: no deload offer');
  await one.context().close();
}

// ---------- supersets ----------
console.log('Supersets');
{
  const day = Date.now() - 2 * 86400000;
  const ssSeed = (ln) => ({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: false,
      days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 3, lo: 6, hi: 8, rest: 120, ...(ln ? { ln: 1 } : {}) }, { id: 'bbrow', sets: 2, lo: 8, hi: 12, rest: 90 }, { id: 'ezcurl', sets: 3, lo: 8, hi: 12 }, { id: 'squat', sets: 3, lo: 6, hi: 8 }] }] },
    sessions: [{ id: 's1', dayIdx: 0, dayName: 'Upper', date: day, dur: 50, entries: [
      { exId: 'bench', sets: [{ w: 80, r: 6 }, { w: 80, r: 6 }, { w: 80, r: 6 }] }, { exId: 'bbrow', sets: [{ w: 60, r: 9 }, { w: 60, r: 9 }] }] }], active: null });
  const spy = () => { window.__ev = []; let real; Object.defineProperty(window, 'RivalAnalytics', { configurable: true, get: () => real,
    set: v => { real = Object.assign({}, v, { track: (n, p) => { window.__ev.push([n, p]); } }); } }); };
  async function open(seed, w = 390) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
    p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    await p.addInitScript(spy);
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
    await p.goto(URL); await p.waitForTimeout(600);
    return p;
  }
  const ev = (p, n) => p.evaluate(n => window.__ev.filter(x => x[0] === n).map(x => x[1]), n);
  const labels = (p, root = '#view') => p.locator(root + ' .ss-l').allTextContents();

  // The rule
  const p = await open(ssSeed(false), 320);
  const G = list => p.evaluate(l => window.RivalSuperset.ssGroups(l).map(g => g ? g.g + g.n : '-').join(' '), list);
  ok(await G([{ ln: 1 }, {}, {}]) === 'A1 A2 -', 'a link joins an exercise to the next one');
  ok(await G([{ ln: 1 }, { ln: 1 }, { ln: 1 }, { ln: 1 }, {}]) === 'A1 A2 A3 B1 B2', 'groups stop at 3; the rest start a new group');
  ok(await G([{}, { ln: 1 }, {}, { ln: 1 }, {}]) === '- A1 A2 B1 B2', 'letters go in order');
  ok(await G([{}, {}, { ln: 1 }]) === '- - -', 'a link on the last exercise does nothing');
  ok(await p.evaluate(() => window.RivalSuperset.ssCanLink([{ ln: 1 }, { ln: 1 }, {}, {}], 2)) === 0, 'a 4th exercise cannot join');

  // Plan editor
  await p.locator('[data-act=tab][data-tab=plan]').click(); await p.waitForTimeout(300);
  await p.locator('.slot[data-d="0"][data-s="0"]').click(); await p.waitForTimeout(400);
  ok(/Alternate sets with Barbell Row/.test(await p.locator('.sheet').textContent()), 'exercise sheet offers a superset with the next exercise');
  await p.locator('.sheet [data-act=slotlink]').click(); await p.waitForTimeout(300);
  ok(/A1 Barbell Bench Press, A2 Barbell Row/.test(await p.locator('.sheet').textContent()), 'sheet shows the group, with Unlink');
  let ce = await ev(p, 'superset_created');
  ok(ce.length === 1 && ce[0].size === 2 && ce[0].where === 'plan', 'superset_created size 2: ' + JSON.stringify(ce));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.locator('.slot[data-d="0"][data-s="1"]').click(); await p.waitForTimeout(400);
  ok(await p.locator('.sheet [data-act=slotunlink]').count() === 1, 'A2 shows the group with Unlink');
  // BUG-1: A2 of a pair can still bring the next exercise in as A3
  ok(await p.locator('.sheet [data-act=slotlink]').count() === 1 && /Link with the next one\s*Adds EZ-Bar Curl as A3/.test(await p.locator('.sheet').textContent()), 'A2 of 2 also offers "Link with the next one" (adds EZ-Bar Curl as A3)');
  ok(await p.evaluate(() => window.RivalSuperset.ssCanLink([{ ln: 1 }, {}, {}], 0)) === 0, 'already linked to the next one: ssCanLink says no');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(JSON.stringify(await labels(p)) === JSON.stringify(['A1', 'A2']) && await p.locator('.day .ssg').count() === 1, 'plan shows A1 / A2 and one shared bar');
  ok(await p.locator('.day .ssg').evaluate(el => getComputedStyle(el, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)'), 'the bar is coloured');
  ok(await noHScroll(p), 'plan: no sideways scroll at 320 px');
  let st = await state(p);
  ok(st.profile.days[0].ex[0].ln === 1 && !st.profile.days[0].ex[1].ln, 'saved in the plan (ln on A1)');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();

  // Logger
  const q = await open(ssSeed(true));
  ok(JSON.stringify(await labels(q)) === JSON.stringify(['A1', 'A2']), 'Today targets show A1 / A2');
  await q.locator('#startbar [data-act=start]').click(); await q.waitForTimeout(800);
  ok(await q.locator('#wo-list > .ssg .ex').count() === 2 && JSON.stringify(await labels(q, '#wo')) === JSON.stringify(['A1', 'A2']), 'logger: bench and row share one bar, A1 / A2');
  ok(/then A2, no rest/.test(await q.locator('.ex[data-e="0"] .ex-meta').textContent()) && /rest 2:00 after the round/.test(await q.locator('.ex[data-e="1"] .ex-meta').textContent()), 'A1 says "then A2", A2 rests 2:00 (the longer of 2:00 and 1:30)');
  ok(await q.inputValue('#w-1-0') === '60', 'row keeps its own ghost (60)');
  const restOn = () => q.evaluate(() => document.querySelector('#rest').classList.contains('show'));
  await q.locator('.set[data-e="0"][data-s="0"] [data-act=log]').click(); await q.waitForTimeout(700);
  ok(!(await restOn()), 'after A1 set 1: no rest timer');
  ok(await q.evaluate(() => { const r = document.activeElement && document.activeElement.closest('.set'); return !!r && r.dataset.e === '1' && r.dataset.s === '0'; }), 'focus moves to A2 set 1');
  await q.locator('.set[data-e="1"][data-s="0"] [data-act=log]').click(); await q.waitForTimeout(700);
  st = await state(q);
  ok(await restOn() && st.active.rest.total === 120, 'after A2: rest starts, for the group rest (120 s)');
  ok(await q.evaluate(() => { const r = document.activeElement && document.activeElement.closest('.set'); return !!r && r.dataset.e === '0' && r.dataset.s === '1'; }), 'focus goes back to A1 set 2');
  await q.locator('[data-act=restskip]').click(); await q.waitForTimeout(300);
  await q.locator('.set[data-e="0"][data-s="1"] [data-act=log]').click(); await q.waitForTimeout(500);
  await q.locator('.set[data-e="1"][data-s="1"] [data-act=log]').click(); await q.waitForTimeout(500);
  await q.locator('[data-act=restskip]').click(); await q.waitForTimeout(300);
  await q.locator('.set[data-e="0"][data-s="2"] [data-act=log]').click(); await q.waitForTimeout(500);
  ok(await restOn(), 'A2 has no sets left: A1 set 3 starts the rest');
  // Link in the logger (⋯ menu): curl + squat
  await q.locator('.ex[data-e="2"] [data-act=exmenu]').click(); await q.waitForTimeout(400);
  await q.locator('.sheet [data-act=exlink]').click(); await q.waitForTimeout(300);
  ce = await ev(q, 'superset_created');
  ok(ce.length === 1 && ce[0].size === 2 && ce[0].where === 'workout', 'superset_created from the logger: ' + JSON.stringify(ce));
  await q.keyboard.press('Escape'); await q.waitForTimeout(300);
  ok(JSON.stringify(await labels(q, '#wo')) === JSON.stringify(['A1', 'A2', 'B1', 'B2']) && await q.locator('#wo-list > .ssg').count() === 2, 'curl + squat become B1 / B2, with their own bar');
  ok(await q.locator('#wo-list > .ssg').nth(1).evaluate(el => getComputedStyle(el).getPropertyValue('--ssc').trim()) !== await q.locator('#wo-list > .ssg').nth(0).evaluate(el => getComputedStyle(el).getPropertyValue('--ssc').trim()), 'B has a different colour from A');
  ok(await noHScroll(q), 'logger: no sideways scroll');
  // Save: the group is stored with the workout
  await q.locator('[data-act=finish]').click(); await q.waitForTimeout(400); await q.locator('[data-act=save]').click(); await q.waitForTimeout(800);
  st = await state(q);
  const last = st.sessions.find(x => x.id !== 's1');
  ok(last.entries.find(e => e.exId === 'bench').ss === 'A' && last.entries.find(e => e.exId === 'bbrow').ss === 'A', 'saved workout keeps superset A on bench and row');
  ok(st.profile.days[0].ex[2].ln === undefined, 'linking in the logger does not change the plan');
  // Ghosts still per exercise: next time, row's ghost is row's own sets
  await q.locator('#startbar [data-act=start]').click(); await q.waitForTimeout(800);
  const rs = last.entries.find(e => e.exId === 'bbrow').sets[0];
  ok((await q.locator('.set[data-e="1"][data-s="0"] .g-txt').textContent()).replace(/\s/g, '') === `${rs.w}×${rs.r}`, `next workout: row's ghost is row's own set from the superset (${rs.w} × ${rs.r})`);
  ok(q.errors.length === 0, 'no console errors ' + q.errors.join(' | '));
  await q.context().close();
}

// ---------- share card ----------
console.log('Share card');
{
  const day = Date.now() - 2 * 86400000;
  const seed = (extra = {}) => ({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: false, theme: extra.theme || 'light', ...(extra.profile || {}),
      days: [{ name: 'Push Day', ex: [{ id: 'bench', sets: 2, lo: 6, hi: 8 }, { id: 'ohp', sets: 2, lo: 6, hi: 8 }] }] },
    sessions: [{ id: 's1', dayIdx: 0, dayName: 'Push Day', date: day, dur: 50, entries: [
      { exId: 'bench', sets: [{ w: 80, r: 8 }, { w: 80, r: 8 }] }, { exId: 'ohp', sets: [{ w: 40, r: 6 }, { w: 40, r: 6 }] }] }], active: null });
  const spy = () => { window.__ev = []; let real; Object.defineProperty(window, 'RivalAnalytics', { configurable: true, get: () => real,
    set: v => { real = Object.assign({}, v, { track: (n, p) => { window.__ev.push([n, p]); } }); } }); };
  async function open(sd, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true }), p = await ctx.newPage();
    p.errors = []; p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    await p.addInitScript(spy);
    if (opts.share) await p.addInitScript(() => { window.__shared = []; navigator.canShare = () => true; navigator.share = d => { window.__shared.push(d.files.map(f => [f.name, f.type, f.size])); return Promise.resolve(); }; });
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(sd));
    await p.goto(URL); await p.waitForTimeout(600);
    await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
    for (const [e, sI] of [[0, 0], [0, 1], [1, 0]]) { await p.locator(`.set[data-e="${e}"][data-s="${sI}"] [data-act=log]`).click(); await p.waitForTimeout(250); await p.locator('[data-act=restskip]').click().catch(() => {}); }
    await p.locator('[data-act=finish]').click(); await p.waitForTimeout(500);
    return p;
  }
  const ev = (p, n) => p.evaluate(n => window.__ev.filter(x => x[0] === n).map(x => x[1]), n);
  // Pixel colour at (x, y) of the card image in the sheet
  const px = (p, x, y) => p.evaluate(([x, y]) => { const im = document.querySelector('.share-prev'), c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return [...g.getImageData(x, y, 1, 1).data].slice(0, 3); }, [x, y]);

  const p = await open(seed({ profile: { dname: 'Sara Ahmed' } }));
  ok(await p.locator('.sheet [data-act=share]').count() === 1, 'finish summary has a Share button');
  const d = await p.evaluate(() => window.RivalShare.cardData(JSON.parse(localStorage.getItem('rival.v1')).active));
  ok(d.day === 'Push Day' && d.sets === 3 && d.of === 3 && d.beat === 1 && d.prs.length === 1 && /Overhead Press/.test(d.prs[0].n) && Math.round(d.prs[0].d * 10) === 13 && d.muscles.chest > 0, 'card data: day, 1/3 ghosts beaten (the +1 rep), overhead press new best +1.3 kg, chest worked: ' + JSON.stringify({ ...d, muscles: undefined }));
  await p.locator('.sheet [data-act=share]').click(); await p.waitForTimeout(1500);
  ok(await p.locator('.share-prev').evaluate(im => im.complete && im.naturalWidth === 1080 && im.naturalHeight === 1920), 'card is a 1080 × 1920 image');
  let cr = await ev(p, 'share_card_created');
  ok(cr.length === 1 && cr[0].with_name === true, 'share_card_created (with_name: true)');
  ok(await p.evaluate(() => document.fonts.check('800 40px Archivo')), 'Archivo (the app font) is loaded for the card');
  const bgL = await px(p, 20, 20);
  ok(bgL.join() === '236,238,233', 'light theme background (#ECEEE9): ' + bgL);
  ok(/Sara, top right/.test(await p.locator('.sheet').textContent()), 'name toggle shows the first name only');
  const withName = await p.locator('.share-prev').evaluate(im => im.src);
  await p.locator('.sheet [data-act=sharename][data-v="0"]').click(); await p.waitForTimeout(1200);
  ok((await state(p)).profile.shareName === false && (await ev(p, 'share_card_created')).pop().with_name === false, 'name switched off: card redrawn without it, choice saved');
  ok(await p.evaluate(() => { const im = document.querySelector('.share-prev'), c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(700, 120, 284, 70).data; const bg = [d[0], d[1], d[2]]; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) return false; return true; }), 'no name drawn in the top right when off');
  // Download fallback (headless Chromium has no file sharing)
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('.sheet [data-act=sharego]').click()]);
  ok(dl && dl.suggestedFilename() === 'rival-workout.png', 'no Web Share: the PNG downloads');
  let sh = await ev(p, 'share_card_shared');
  ok(sh.length === 1 && sh[0].method === 'download', 'share_card_shared (download)');
  await p.locator('.sheet [data-act=shareback]').click(); await p.waitForTimeout(500);
  ok(await p.locator('.sheet [data-act=save]').count() === 1, 'Back returns to the summary');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();

  // Web Share with files, dark theme, no name known
  const q = await open(seed({ theme: 'dark' }), { share: true });
  await q.locator('.sheet [data-act=share]').click(); await q.waitForTimeout(1500);
  ok((await px(q, 20, 20)).join() === '13,15,19', 'dark theme background (#0D0F13)');
  ok(await q.locator('.sheet [data-act=sharename]').count() === 0 && (await ev(q, 'share_card_created'))[0].with_name === false, 'no display name: no name and no toggle');
  await q.locator('.sheet [data-act=sharego]').click(); await q.waitForTimeout(600);
  const files = await q.evaluate(() => window.__shared);
  ok(files.length === 1 && files[0][0][0] === 'rival-workout.png' && files[0][0][1] === 'image/png' && files[0][0][2] > 20000, 'navigator.share gets the PNG file: ' + JSON.stringify(files));
  ok((await ev(q, 'share_card_shared'))[0].method === 'share', 'share_card_shared (share)');
  await q.locator('.share-prev').screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/card-dark.png' : '/dev/null' }).catch(() => {});
  ok(q.errors.length === 0, 'no console errors ' + q.errors.join(' | '));
  await q.context().close();
}

// ---------- BUG-5: superset cards fit narrow phones ----------
console.log('Superset layout (BUG-5)');
{
  const seed = { profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: true,
    days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 3, lo: 6, hi: 8, ln: 1 }, { id: 'pushdown__rope', sets: 3, lo: 8, hi: 12, ln: 1 }, { id: 'bbrow', sets: 3, lo: 8, hi: 12 }] }] },
    sessions: [{ id: 's1', dayIdx: 0, dayName: 'Upper', date: Date.now() - 2 * 86400000, dur: 50, entries: [{ exId: 'bench', sets: [{ w: 100, r: 8 }, { w: 100, r: 8 }, { w: 100, r: 8 }] }] }], active: null };
  for (const w of [320, 360, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' }), p = await ctx.newPage();
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed));
    await p.goto(URL); await p.waitForTimeout(600);
    await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
    const m = await p.evaluate(() => ({ list: document.querySelector('#wo-list').getBoundingClientRect().right,
      right: Math.max(...[...document.querySelectorAll('#wo .ssg .ex, #wo .ssg .set')].map(e => e.getBoundingClientRect().right)),
      over: [...document.querySelectorAll('#wo .ssg')].some(g => g.scrollWidth > g.clientWidth + 1) }));
    ok(m.right <= m.list + 0.5 && m.right <= w && !m.over, `${w} px: superset cards (with an attachment row) stay inside the screen (right edge ${Math.round(m.right)} ≤ ${Math.round(m.list)})`);
    await ctx.close();
  }
}

// ---------- BUG-3/BUG-4: removing or moving a plan exercise keeps every other link ----------
console.log('Superset links on remove and move (BUG-3/4)');
{
  const seed = ex => ({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, days: [{ name: 'Upper', ex }] }, sessions: [], active: null });
  const sl = (id, ln) => ({ id, sets: 3, lo: 8, hi: 12, ...(ln ? { ln: 1 } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(seed([sl('bench', 1), sl('bbrow'), sl('ezcurl'), sl('squat')])));
  await p.goto(URL); await p.waitForTimeout(600);
  // The rule, on letters: names are the items, a "+" after one means it links to the next.
  const run = (list, op, i, d) => p.evaluate(([list, op, i, d]) => {
    const l = list.map(n => ({ n: n.replace('+', ''), ...(n.endsWith('+') ? { ln: 1 } : {}) })), S = window.RivalSuperset;
    if (op === 'rm') S.ssRemove(l, i); else S.ssMove(l, i, d);
    const g = S.ssGroups(l); return l.map((x, k) => x.n + (g[k] ? g[k].g + g[k].n : '')).join(' ');
  }, [list, op, i, d]);
  ok(await run(['a+', 'b', 'c'], 'rm', 1) === 'a c', 'remove the last member of a pair: the one before does not join the next exercise');
  ok(await run(['a+', 'b+', 'c', 'd'], 'rm', 2) === 'aA1 bA2 d', 'remove the last of three: A1 A2 stay, the next exercise does not join');
  ok(await run(['a+', 'b+', 'c', 'd'], 'rm', 1) === 'aA1 cA2 d', 'remove the middle of three: the other two stay a pair');
  ok(await run(['a+', 'b+', 'c', 'd'], 'rm', 0) === 'bA1 cA2 d', 'remove the first: the rest stay');
  ok(await run(['x', 'a+', 'b', 'c'], 'rm', 0) === 'aA1 bA2 c', 'remove an exercise outside the group: group unchanged');
  ok(await run(['a+', 'b', 'c'], 'mv', 1, 1) === 'a c b', 'move the last of a pair down: it leaves, and the one before does not link to the next');
  ok(await run(['a+', 'b+', 'c', 'd'], 'mv', 2, 1) === 'aA1 bA2 d c', 'move the last of three down: it leaves, A1 A2 stay');
  ok(await run(['a+', 'b+', 'c', 'd'], 'mv', 0, 1) === 'bA1 aA2 cA3 d', 'move within the group: order changes, group stays');
  ok(await run(['x', 'a+', 'b', 'c'], 'mv', 0, 1) === 'aA1 bA2 x c', 'move an outside exercise down: it jumps over the group, never lands inside it');
  ok(await run(['a+', 'b', 'x'], 'mv', 2, -1) === 'x aA1 bA2', 'and up: it jumps over the whole group');
  ok(await run(['a+', 'b', 'c+', 'd'], 'mv', 1, 1) === 'a cA1 dA2 b', 'move the last of A into B: it leaves A and jumps over B');

  // In the plan editor
  const links = async () => (await state(p)).profile.days[0].ex.map(x => x.id + (x.ln ? '+' : '')).join(' ');
  await p.locator('[data-act=tab][data-tab=plan]').click(); await p.waitForTimeout(300);
  await p.locator('.slot[data-d="0"][data-s="1"]').click(); await p.waitForTimeout(400);
  await p.locator('.sheet [data-act=rmslot]').click(); await p.waitForTimeout(400);
  ok(await links() === 'bench ezcurl squat' && await p.locator('#view .ss-l').count() === 0, 'remove A2 (row): bench is not linked to curl: ' + await links());
  await p.locator('#toasts button').click(); await p.waitForTimeout(400);
  ok(await links() === 'bench+ bbrow ezcurl squat' && await p.locator('#view .ss-l').count() === 2, 'Undo puts the exact links back');
  await p.locator('.slot[data-d="0"][data-s="1"]').click(); await p.waitForTimeout(400);
  await p.locator('.sheet [data-act=slotmove][data-v="1"]').click(); await p.waitForTimeout(400);
  ok(await links() === 'bench ezcurl bbrow squat', 'move A2 (row) down: it leaves, bench is not linked to curl: ' + await links());
  ok(/exercise 3 of 4/.test(await p.locator('.sheet .sub').first().textContent()), 'the sheet follows the moved exercise');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await ctx.close();

  // In the logger: removing A2 doesn't link A1 to the next exercise; Undo restores
  const q = await page({}, { ...seed([sl('bench', 1), sl('bbrow'), sl('ezcurl')]), profile: { ...seed([]).profile, days: [{ name: 'Upper', ex: [sl('bench', 1), sl('bbrow'), sl('ezcurl')] }] } });
  await q.locator('#startbar [data-act=start]').click(); await q.waitForTimeout(800);
  await q.locator('.ex[data-e="1"] [data-act=exmenu]').click(); await q.waitForTimeout(400);
  await q.locator('.sheet [data-act=rmex]').click(); await q.waitForTimeout(500);
  ok(await q.locator('#wo .ss-l').count() === 0 && !(await state(q)).active.entries[0].ln, 'logger: remove A2, bench stays on its own');
  await q.locator('#toasts button').click(); await q.waitForTimeout(400);
  ok(await q.locator('#wo .ss-l').count() === 2, 'logger Undo restores the pair');
  await q.context().close();
}

// ---------- BUG-1: an exercise in a group can link the next one ----------
console.log('Link a third (BUG-1)');
{
  const sl = (id, ln) => ({ id, sets: 3, lo: 8, hi: 12, ...(ln ? { ln: 1 } : {}) });
  const p = await page({}, { profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, days: [{ name: 'Upper', ex: [sl('bench', 1), sl('bbrow'), sl('ezcurl'), sl('squat')] }] }, sessions: [], active: null });
  await p.locator('[data-act=tab][data-tab=plan]').click(); await p.waitForTimeout(300);
  await p.locator('.slot[data-d="0"][data-s="1"]').click(); await p.waitForTimeout(400);
  ok(await p.locator('.sheet [data-act=slotunlink]').count() === 1 && await p.locator('.sheet [data-act=slotlink]').count() === 1, 'A2 of 2 shows Unlink and "Link with the next one"');
  await p.locator('.sheet [data-act=slotlink]').click(); await p.waitForTimeout(300);
  ok(/A1 Barbell Bench Press, A2 Barbell Row, A3 EZ-Bar Curl/.test(await p.locator('.sheet').textContent()), 'linked: bench, row and curl are A1 A2 A3');
  ok(await p.locator('.sheet [data-act=slotlink]').count() === 0, 'group of 3 is full: no more Link');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.locator('.slot[data-d="0"][data-s="0"]').click(); await p.waitForTimeout(400);
  ok(await p.locator('.sheet [data-act=slotlink]').count() === 0, 'A1 (already linked to A2) shows no Link');
  await p.context().close();
}

// ---------- BUG-2: "Remove from superset" takes out only the tapped exercise ----------
console.log('Remove from superset (BUG-2)');
{
  const sl = (id, ln) => ({ id, sets: 3, lo: 8, hi: 12, ...(ln ? { ln: 1 } : {}) });
  const p = await page({}, { profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, days: [{ name: 'Upper', ex: [sl('bench', 1), sl('bbrow', 1), sl('ezcurl'), sl('squat')] }] }, sessions: [], active: null });
  const U = (list, i) => p.evaluate(([list, i]) => { const l = list.map(n => ({ n: n.replace('+', ''), ...(n.endsWith('+') ? { ln: 1 } : {}) })), S = window.RivalSuperset;
    S.ssUnlink(l, i); const g = S.ssGroups(l); return l.map((x, k) => x.n + (g[k] ? g[k].g + g[k].n : '')).join(' '); }, [list, i]);
  ok(await U(['a+', 'b+', 'c'], 0) === 'a bA1 cA2', 'first of three: only it leaves, the other two stay a pair');
  ok(await U(['a+', 'b+', 'c'], 2) === 'aA1 bA2 c', 'last of three: only it leaves');
  ok(await U(['a+', 'b+', 'c'], 1) === 'a b c', 'middle of three: the group splits');
  ok(await U(['a+', 'b'], 1) === 'a b', 'last of a pair: both are on their own');
  await p.locator('[data-act=tab][data-tab=plan]').click(); await p.waitForTimeout(300);
  await p.locator('.slot[data-d="0"][data-s="2"]').click(); await p.waitForTimeout(400);
  ok((await p.locator('.sheet [data-act=slotunlink]').textContent()).trim() === 'Remove from superset', 'button says "Remove from superset"');
  await p.locator('.sheet [data-act=slotunlink]').click(); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(JSON.stringify(await p.locator('#view .ss-l').allTextContents()) === JSON.stringify(['A1', 'A2']), 'plan: A3 (curl) removed, bench and row are still A1 / A2');
  // In the logger: remove the first of a pair
  await p.locator('[data-act=tab][data-tab=today]').click(); await p.waitForTimeout(300);
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
  await p.locator('.ex[data-e="0"] [data-act=exmenu]').click(); await p.waitForTimeout(400);
  await p.locator('.sheet [data-act=exunlink]').click(); await p.waitForTimeout(300);
  ok(await p.locator('#wo .ss-l').count() === 0 && /Removed from superset/.test(await p.locator('#toasts').textContent()), 'logger: removing A1 of a pair leaves both on their own, toast "Removed from superset"');
  await p.context().close();
}

// ---------- BUG-7: removing a rival asks first, then resets the invite link ----------
// Uses tests/fake-supabase.js (an in-memory Supabase client), so it runs offline.
console.log('Remove a rival (BUG-7)');
{
  const ME = '00000000-0000-4000-8000-000000000001', SARA = '00000000-0000-4000-8000-0000000000aa', OLD = 'a'.repeat(32);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(String(e)));
  await p.addInitScript(sd => { window.__fakeSeed = sd; }, { me: { id: ME, display_name: 'Omar Test' }, users: [{ id: SARA, display_name: 'Sara Test' }], rivals: [[ME, SARA]], codes: [{ code: OLD, user_id: ME }] });
  await p.addInitScript({ path: new globalThis.URL('./fake-supabase.js', import.meta.url).pathname });
  await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rival.v1', s); sessionStorage.setItem('seeded', '1'); } },
    JSON.stringify({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, sampleCleared: true, days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 3, lo: 6, hi: 8 }] }] }, sessions: [], active: null }));
  await p.goto(URL); await p.waitForTimeout(800);
  await p.locator('[data-act=tab][data-tab=settings]').click(); await p.waitForTimeout(800);
  ok(/Sara/.test(await p.locator('#rivals').textContent()) && (await p.locator('.rv-link').textContent()).endsWith(OLD), 'Settings lists Sara and the current invite link');
  await p.locator('#rivals [data-act=rvremove]').click(); await p.waitForTimeout(400);
  ok(/Remove Sara\?/.test(await p.locator('.sheet .h2').textContent()) && /invite link is also reset/.test(await p.locator('.sheet').textContent()), 'a confirmation sheet comes first');
  ok((await p.evaluate(() => window.__fake.tables.rivals.length)) === 1, 'nothing removed before confirming');
  await p.locator('.sheet [data-act=closesheet]').click(); await p.waitForTimeout(400);
  ok((await p.evaluate(() => window.__fake.tables.rivals.length)) === 1 && /Sara/.test(await p.locator('#rivals').textContent()), 'Cancel keeps Sara');
  await p.locator('#rivals [data-act=rvremove]').click(); await p.waitForTimeout(400);
  await p.locator('.sheet [data-act=rvremoveok]').click(); await p.waitForTimeout(800);
  const t = await p.evaluate(() => ({ rivals: window.__fake.tables.rivals.length, codes: window.__fake.tables.invite_codes.map(c => c.code) }));
  ok(t.rivals === 0, 'rival removed');
  ok(t.codes.length === 1 && t.codes[0] !== OLD && /^[0-9a-f]{32}$/.test(t.codes[0]), 'old invite code deleted and a new one made');
  ok((await p.locator('.rv-link').textContent()).endsWith(t.codes[0]), 'Settings shows the new link');
  ok(/Rival removed\. Your old invite link no longer works\./.test(await p.locator('#toasts').textContent()), 'toast: "Rival removed. Your old invite link no longer works."');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await ctx.close();
}

// ---------- BUG-8: plateau cards only where they help ----------
console.log('Plateau rules (BUG-8)');
{
  const D = 86400000, now = Date.now(), s3 = (w, r) => [{ w, r }, { w, r }, { w, r }];
  const sd = (ex, sets) => ({ profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, warmups: false, days: [{ name: 'Upper', ex }] },
    sessions: [10, 7, 4, 2].map((ago, i) => ({ id: 'p' + i, dayIdx: 0, dayName: 'Upper', date: now - ago * D, dur: 50, entries: sets(i) })), active: null });
  // Bench ties at the top of its range (80 × 8, range 6–8): progression will add weight, so no plateau card.
  const p = await page({}, sd([{ id: 'bench', sets: 3, lo: 6, hi: 8 }], () => [{ exId: 'bench', sets: s3(80, 8) }]));
  await p.locator('#startbar [data-act=start]').click(); await p.waitForTimeout(800);
  ok(await p.locator('.plat').count() === 0 && await p.inputValue('#w-0-0') === '82.5', 'ties at the top of the rep range: no plateau card, progression suggests 82.5');
  await p.context().close();
  // Three stuck lifts in one workout: cards on the first two only.
  const q = await page({}, sd([{ id: 'bench', sets: 3, lo: 6, hi: 8 }, { id: 'bbrow', sets: 3, lo: 8, hi: 12 }, { id: 'ohp', sets: 3, lo: 6, hi: 8 }],
    () => [{ exId: 'bench', sets: s3(80, 7) }, { exId: 'bbrow', sets: s3(60, 10) }, { exId: 'ohp', sets: s3(40, 6) }]));
  await q.locator('#startbar [data-act=start]').click(); await q.waitForTimeout(800);
  ok(await q.locator('.ex[data-e="0"] .plat').count() === 1 && await q.locator('.ex[data-e="1"] .plat').count() === 1 && await q.locator('.ex[data-e="2"] .plat').count() === 0, '3 stuck lifts: cards on the first 2 exercises only');
  ok(!(await state(q)).profile.plateau.ohp, 'the third is not marked as seen, so it can show another day');
  await q.context().close();
}

// ---------- BUG-6: share card day name never runs past the margins ----------
console.log('Share card day name (BUG-6)');
{
  const p = await page({}, { profile: { units: 'kg', tour: { done: true, wo: true, n: 9 }, gateSkipped: true, readiness: null, theme: 'light', days: [{ name: 'Upper', ex: [{ id: 'bench', sets: 1, lo: 6, hi: 8 }] }] }, sessions: [], active: null });
  const lay = day => p.evaluate(async day => { const cv = await window.RivalShare.drawCard({ day, date: Date.now(), mins: 50, sets: 9, beat: 3, of: 9, prs: [], muscles: {} }, ''); return cv.layout; }, day);
  for (const day of ['Push', 'Upper Hypertrophy', 'Full Body Strength Day B', 'Upper Body Hypertrophy Push And Pull Day', 'Supercalifragilisticexpialidocious Legs']) {
    const l = await lay(day);
    ok(l.dayWidth <= l.maxW && l.dayLines.length <= 2 && l.dayLines.join(' ') === day, `"${day}": ${l.dayLines.length} line(s) at ${l.daySize} px, ${Math.round(l.dayWidth)} ≤ ${l.maxW}`);
  }
  ok((await lay('Push')).daySize === 168 && (await lay('Push')).dayLines.length === 1, 'a short name stays big on one line');
  await p.context().close();
}

// ---------- settings tab: appearance, help, feedback ----------
console.log('Settings');
for (const opt of [{ w: 390 }, { w: 320, dark: true }]) {
  const p = await page(opt);
  await edit(p, s => { s.profile.tour = { done: true, wo: true, n: 9 }; });
  ok(await p.locator('.tab').count() === 4, `four tabs (${opt.w} px)`);
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(200);
  ok(/Settings/.test(await p.locator('.title').textContent()), 'Settings page opens');
  ok(await noHScroll(p), `no sideways scroll at ${opt.w} px`);
  const tabsFit = await p.evaluate(() => { const r = [...document.querySelectorAll('.tab')].map(t => t.getBoundingClientRect()); return r.every(x => x.left >= 0 && x.right <= innerWidth) && r.every((x, i) => !i || x.left >= r[i - 1].right - 1); });
  ok(tabsFit, 'tab bar fits without overlap');
  await p.locator('[data-act=theme][data-v=dark]').click();
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark mode switch works from Settings');
  await p.locator('[data-act=theme][data-v=system]').click();
  const href = await p.locator('.fb a.btn').getAttribute('href');
  ok(href.startsWith('mailto:almahrouqiahmed6@gmail.com?subject=Rival%20feedback'), 'Email feedback opens a mail to the right address');
  ok(await p.locator('.help details').count() >= 6, 'help questions listed');
  await p.locator('.help summary').first().click();
  ok(await p.locator('.help details[open]').count() === 1, 'a help question opens');
  ok(await p.locator('[data-act=export]').count() === 1 && await p.locator('[data-act=units]').count() === 2, 'backup and units moved here');
  await p.locator('[data-tab=plan]').click(); await p.waitForTimeout(200);
  ok(await p.locator('[data-act=export]').count() === 0, 'Plan tab no longer holds settings');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await p.context().close();
}
{
  const p = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await p.goto(URL.replace(/app\/$/, ''));
  ok(await p.locator('footer a[href^="mailto:almahrouqiahmed6@gmail.com"]').count() === 1, 'marketing page footer shows the email');
  ok(await p.locator('.faq a[href^="mailto:almahrouqiahmed6@gmail.com"]').count() === 1, 'marketing FAQ shows the email');
  ok(await p.locator('footer a[href="privacy.html"]').count() === 1 && await p.locator('footer a[href="terms.html"]').count() === 1, 'site footer links Privacy and Terms');
  ok(!/nothing is uploaded|no server for your workouts/i.test(await p.content()), 'site no longer claims nothing is uploaded');
  for (const page of ['privacy.html', 'terms.html']) {
    const r = await p.goto(URL.replace(/app\/$/, '') + page);
    ok(r.status() === 200 && /almahrouqiahmed6@gmail\.com/.test(await p.content()), page + ' loads and gives the contact email');
  }
  await p.goto(URL.replace(/app\/$/, '') + 'privacy.html');
  const txt = await p.locator('main').textContent();
  ok(['Google', 'Supabase', 'PostHog', 'session replay', 'masked', 'sell', 'Delete my Rival account'].every(w => txt.toLowerCase().includes(w.toLowerCase())), 'privacy covers Google sign-in, Supabase, PostHog replay with masking, no selling, deletion');
  await p.context().close();
}

// ---------- account: sign-in screen, magic link return, Google, friendly errors, sign out ----------
console.log('Account');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  const calls = [];
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const uid = '0b9c2f2e-0000-4000-8000-00000000abcd', exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com' })}.sig`;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} };
  const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };
  await p.route('**/auth/v1/**', async route => {
    const u = new globalThis.URL(route.request().url()); calls.push(route.request().method() + ' ' + u.pathname + u.search);
    if (u.pathname.endsWith('/otp')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.pathname.endsWith('/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
    if (u.pathname.endsWith('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    if (u.pathname.endsWith('/authorize')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>google</p>' });
    return route.fulfill({ status: 404, body: '{}' });
  });
  await p.goto(URL); await p.waitForTimeout(700);
  ok(await p.locator('.gate').count() === 1, 'signed out: sign-in screen shown');
  ok(await p.locator('.gate .acct-google.primary').count() === 1, 'Google is the primary button');
  ok(await p.evaluate(() => typeof window.RivalSync === 'object'), 'sync engine present');
  await p.locator('.acct-mail summary').click();
  await p.locator('[data-act=authsend]').click(); await p.waitForTimeout(150);
  ok(/Enter your email/.test(await p.locator('.acct-err').textContent()), 'asks for an email first');
  await p.fill('#authemail', 'Tester@Example.com ');
  await p.locator('[data-act=authsend]').click(); await p.waitForTimeout(600);
  const otp = calls.find(c => c.includes('/otp'));
  ok(!!otp && otp.includes('redirect_to=' + encodeURIComponent(URL)), 'magic link asks Supabase to return to this page');
  const sent = await p.locator('.gate .acct').textContent();
  ok(/Check your email/.test(sent) && /same browser you installed Rival from/.test(sent), '"Check your email" with the iPhone note');
  ok(await p.locator('#authcode').count() === 0, 'no typed-code screen');
  // tapping the link: the page opens with ?code=, supabase-js swaps it for a session
  await p.goto(URL + '?code=link-code'); await p.waitForTimeout(1200);
  ok(calls.some(c => c.includes('/token') && c.includes('pkce')), 'link code exchanged for a session');
  ok(!/code=/.test(p.url()), 'code removed from the address bar');
  ok(await p.locator('.gate').count() === 0, 'signed in: sign-in screen gone');
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(300);
  ok(/Signed in as/.test(await p.locator('.acct').textContent()) && await p.locator('.acct b.ph-no-capture').count() === 1, 'Settings shows the account; email kept out of recordings');
  await p.reload(); await p.waitForTimeout(900);
  ok(await p.locator('.gate').count() === 0, 'still signed in after reload');
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(300);
  await p.locator('[data-act=authsignout]').click(); await p.waitForTimeout(800);
  ok(await p.locator('.acct [data-act=authgoogle]').count() === 1, 'signed out');
  ok(await p.locator('.gate').count() === 0, 'signing out does not throw the sign-in screen in your face');
  // Google comes back with "access blocked" while the app is in Testing
  await p.goto(URL + '?error=access_denied&error_code=403&error_description=Access+blocked%3A+Rival+has+not+completed+the+Google+verification+process'); await p.waitForTimeout(900);
  ok(await p.locator('.gate').count() === 1 && /waiting for Google's approval/.test(await p.locator('.gate .acct-err').textContent()), 'friendly message for Google testing mode');
  ok(!/error=/.test(p.url()), 'error removed from the address bar');
  // Google button goes to Supabase, which returns to this page
  await Promise.all([p.waitForURL(/authorize/), p.locator('.gate [data-act=authgoogle]').click()]);
  const g = new globalThis.URL(p.url());
  ok(g.searchParams.get('provider') === 'google' && g.searchParams.get('redirect_to') === URL, 'Google sign-in returns to this page');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}

// ---------- delete account: typed confirmation, offline guard, server first, then the phone is cleared ----------
console.log('Delete account');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const uid = '0b9c2f2e-0000-4000-8000-00000000dddd', exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, aud: 'authenticated', role: 'authenticated' })}.sig`;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'del@example.com', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
  const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };
  await p.route('**/auth/v1/**', route => {
    const u = new globalThis.URL(route.request().url());
    if (u.pathname.endsWith('/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
    if (u.pathname.endsWith('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, body: '{}' });
  });
  await p.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  let fnStatus = 500; const fnCalls = [];
  await p.route('**/functions/v1/delete-account', route => {
    fnCalls.push(route.request().headers()['authorization'] || '');
    route.fulfill({ status: fnStatus, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(fnStatus === 200 ? { deleted: true } : { error: 'delete_failed' }) });
  });
  const events = [];
  await p.addInitScript(() => { window.__ev = []; });
  await p.goto(URL); await p.waitForTimeout(600);
  await p.locator('[data-act=gateskip]').click(); await p.waitForTimeout(400);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(300);
  ok(await p.locator('[data-act=delacct]').count() === 0, 'no "Delete account" button without an account');
  await p.evaluate(s => localStorage.setItem('rival.auth', s), JSON.stringify(session)); // signed in, as supabase-js saves it
  await p.reload(); await p.waitForTimeout(1200);
  while (await p.locator('[data-act=coachskip]').count()) { await p.locator('[data-act=coachskip]').first().click(); await p.waitForTimeout(250); }
  await p.locator('[data-tab=settings]').click(); await p.waitForTimeout(300);
  const order = await p.evaluate(() => [...document.querySelectorAll('.sheet-actions .btn')].map(b => b.dataset.act));
  ok(order.indexOf('delacct') === order.indexOf('wipe') + 1, 'signed in: "Delete account" sits right below "Delete all workouts"');
  await p.locator('[data-act=delacct]').click(); await p.waitForTimeout(400);
  const go = p.locator('[data-act=delacctgo]');
  ok(/Delete your account\?/.test(await p.locator('.sheet').textContent()) && await go.isDisabled(), 'confirmation sheet opens, button off until DELETE is typed');
  await p.fill('#delconfirm', 'delete'); ok(await go.isDisabled(), 'lower-case "delete" does not count');
  await p.fill('#delconfirm', 'DELETE'); ok(!(await go.isDisabled()), 'typing DELETE turns the button on');
  await ctx.setOffline(true); await p.waitForTimeout(200);
  ok(await go.isDisabled() && /Needs a connection/.test(await p.locator('.sheet').textContent()), 'offline: button off with "Needs a connection"');
  await ctx.setOffline(false); await p.waitForTimeout(200);
  // Server says no: nothing on the phone is touched
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rival.v1')); s.sessions.push({ id: 'keep-me', dayIdx: 0, dayName: 'Upper', date: new Date().toISOString(), dur: 30, readiness: null, entries: [] }); localStorage.setItem('rival.v1', JSON.stringify(s)); });
  await go.click(); await p.waitForTimeout(800);
  ok(fnCalls.length === 1 && fnCalls[0] === 'Bearer ' + jwt, 'calls delete-account with the login token');
  ok(/Couldn't delete your account/.test(await p.locator('.sheet').textContent()) && await p.evaluate(() => localStorage.getItem('rival.v1').includes('keep-me')), 'server error: friendly message, phone data kept');
  // Server says yes: phone cleared, signed out, sign-in screen with the toast
  fnStatus = 200;
  await Promise.all([p.waitForEvent('load'), go.click()]); await p.waitForTimeout(1200);
  ok(await p.locator('.gate').count() === 1, 'back at the sign-in screen');
  ok(await p.locator('.toast', { hasText: 'Your account was deleted' }).count() === 1, '"Your account was deleted" toast');
  const left = await p.evaluate(async () => ({ keep: (localStorage.getItem('rival.v1') || '').includes('keep-me'), auth: !!localStorage.getItem('rival.auth'), dbs: indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [] }));
  ok(!left.keep && !left.auth, 'workouts and login removed from this phone');
  ok(!left.dbs.includes('rival-sync'), 'sync database deleted (' + left.dbs.join(',') + ')');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join(' | '));
  await ctx.close();
}
{
  const p = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await p.goto(URL.replace(/app\/$/, '') + 'privacy.html');
  ok(/Settings → Data → Delete account/.test(await p.locator('main').textContent()) && /Delete my Rival account/.test(await p.locator('main').textContent()), 'privacy: in-app deletion, email kept as a backup');
  await p.context().close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
