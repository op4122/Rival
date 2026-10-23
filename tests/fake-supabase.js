// A tiny in-memory stand-in for the Supabase client, for offline browser tests (npm test).
// Load it with page.addInitScript({ path }) BEFORE the page loads, after setting window.__fakeSeed:
//   { me: {id, display_name, share_lifts}, users: [{id, display_name, share_lifts}], rivals: [[a, b]], codes: [{code, user_id}],
//     ghosts: {<user id>: [{set_index, weight, reps, started_at}]}, exercises: [{id, slug, user_id}] (default: bench and row) }
// It pins window.rivalDb to the fake (app/supabase.js can't replace it) and keeps everything in window.__fake for checks:
//   __fake.tables (profiles, rivals, invite_codes, exercises), __fake.log (every call), __fake.me, and __fake.failRpc (true: get_rival_ghost
//   answers with an error). signOut() tells the app's onAuthStateChange listener, as the real client does. It mirrors the real Row Level
// Security only as far as these tests need: you see your own invite code, rivals rows you're part of, and your own profile.
(function () {
  const seed = window.__fakeSeed || {};
  const me = seed.me || { id: '00000000-0000-4000-8000-000000000001', display_name: 'Test Me', share_lifts: false };
  const users = [me].concat(seed.users || []);
  const T = {
    profiles: users.map(u => ({ id: u.id, display_name: u.display_name || null, share_lifts: !!u.share_lifts, settings: {} })),
    rivals: (seed.rivals || []).map(([a, b]) => (a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a })),
    invite_codes: (seed.codes || []).slice(),
    exercises: (seed.exercises || [{ id: '10000000-0000-4000-8000-000000000001', slug: 'bench', user_id: null }, { id: '10000000-0000-4000-8000-000000000002', slug: 'bbrow', user_id: null }]).map(e => ({ user_id: null, ...e })),
  };
  let authCb = null, signedIn = true;
  const log = [];
  const trip = () => new Promise(r => setTimeout(r, 30)); // a real round trip takes time; instant answers would finish before the screen's own animations
  const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const visible = (t, r) => t === 'invite_codes' ? r.user_id === me.id : t === 'rivals' ? (r.user_a === me.id || r.user_b === me.id) : t === 'profiles' ? r.id === me.id : true;
  function query(t) {
    const q = { t, op: 'select', filters: [], one: null, values: null, wantRows: false };
    const run = () => {
      log.push({ t, op: q.op, filters: q.filters.slice(), values: q.values });
      if (!T[t]) return { data: q.one ? null : [], error: null }; // tables the tests don't care about (sync)
      const match = r => visible(t, r) && q.filters.every(([c, v]) => r[c] === v);
      let rows;
      if (q.op === 'insert') {
        const vals = (Array.isArray(q.values) ? q.values : [q.values]).map(v => ({ ...(t === 'invite_codes' ? { code: hex(), user_id: me.id } : {}), ...v }));
        if (t === 'invite_codes' && T.invite_codes.some(c => c.user_id === me.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        if (t === 'rivals') return { data: null, error: { code: '42501', message: 'permission denied' } };
        T[t].push(...vals); rows = vals;
      } else if (q.op === 'delete') {
        rows = T[t].filter(match); T[t] = T[t].filter(r => !rows.includes(r));
      } else if (q.op === 'update') {
        rows = T[t].filter(match); rows.forEach(r => Object.assign(r, q.values));
      } else rows = T[t].filter(match);
      rows = rows.map(r => ({ ...r }));
      if (q.one) return rows.length === 1 ? { data: rows[0], error: null } : q.one === 'maybe' && !rows.length ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: rows, error: null };
    };
    const b = {
      select() { q.wantRows = true; return b; }, insert(v) { q.op = 'insert'; q.values = v; return b; }, upsert(v) { q.op = 'upsert'; q.values = v; return b; },
      update(v) { q.op = 'update'; q.values = v; return b; }, delete() { q.op = 'delete'; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; }, neq() { return b; }, in() { return b; }, is() { return b; }, order() { return b; }, limit() { return b; },
      maybeSingle() { q.one = 'maybe'; return b; }, single() { q.one = 'single'; return b; },
      then(res, rej) { return trip().then(run).then(res, rej); },
    };
    return b;
  }
  const linked = id => T.rivals.some(r => (r.user_a === me.id && r.user_b === id) || (r.user_b === me.id && r.user_a === id));
  const fake = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: signedIn ? { user: { id: me.id, email: 'me@example.test', created_at: '2026-01-01T00:00:00Z' } } : null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: signedIn ? { id: me.id } : null } }),
      onAuthStateChange: cb => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: () => { signedIn = false; if (authCb) authCb('SIGNED_OUT', null); return Promise.resolve({ error: null }); }, signInWithOAuth: () => Promise.resolve({ error: null }), signInWithOtp: () => Promise.resolve({ error: null }),
    },
    from: query,
    rpc(fn, a) { return trip().then(() => fake.rpc0(fn, a)); },
    rpc0(fn, a) {
      log.push({ rpc: fn, args: a });
      if (fn === 'get_rival_ghost') {
        if (window.__fake.failRpc) return Promise.resolve({ data: null, error: { message: 'boom' } });
        if (!linked(a.p_rival_id)) return Promise.resolve({ data: [], error: null });
        const u = T.profiles.find(p => p.id === a.p_rival_id) || {}, name = (u.display_name || '').split(' ')[0] || null, sets = (seed.ghosts || {})[a.p_rival_id];
        return Promise.resolve({ data: a.p_exercise_id && u.share_lifts && sets ? sets.map(s => ({ display_name: name, ...s })) : [{ display_name: name, started_at: null, set_index: null, weight: null, reps: null }], error: null });
      }
      if (fn === 'accept_rival_invite') {
        const c = T.invite_codes.find(x => x.code === a.p_code);
        if (!c) return Promise.resolve({ data: null, error: { code: 'P0002', message: 'Invite not found' } });
        if (c.user_id === me.id) return Promise.resolve({ data: null, error: { code: '22023', message: 'This is your own invite' } });
        if (!linked(c.user_id)) T.rivals.push(me.id < c.user_id ? { user_a: me.id, user_b: c.user_id } : { user_a: c.user_id, user_b: me.id });
        return Promise.resolve({ data: c.user_id, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
  window.__fake = { tables: T, log, me };
  Object.defineProperty(window, 'rivalDb', { configurable: true, get: () => fake, set() {} });
})();
