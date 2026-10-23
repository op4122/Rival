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
