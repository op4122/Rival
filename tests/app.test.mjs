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
  await p.locator('.card.session [data-act=start]').click(); await p.clock.runFor(900);
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

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
