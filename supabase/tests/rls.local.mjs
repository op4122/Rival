// Two-user Row Level Security check against a local Postgres (PGlite) with a stubbed Supabase auth schema.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/rls.local.mjs .
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const repo = process.argv[2], db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;`);
for (const f of readdirSync(repo + '/supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(`${repo}/supabase/migrations/${f}`, 'utf8'));
const A = 'aaaaaaaa-1111-1111-1111-111111111111', B = 'bbbbbbbb-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}','a@t'),('${B}','b@t')`);
const bench = (await db.query(`select id from public.exercises where slug='bench'`)).rows[0].id;
let pass = 0, fail = 0;
const as = async (who, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who || ''}', false); set role ${who ? 'authenticated' : 'anon'};`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); }
};
const expect = (label, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + label); ok ? pass++ : fail++; };
// A writes data
const W = 'cccccccc-0000-0000-0000-000000000001', R = 'dddddddd-0000-0000-0000-000000000001';
let r = await as(A, `insert into public.readiness_checkins (id, sleep_quality, energy, soreness, score) values ('${R}', 3, 3, 3, 67) returning id`); expect('A creates a check-in', !r.err);
r = await as(A, `insert into public.workouts (id, started_at, readiness_id) values ('${W}', now(), '${R}') returning id`); expect('A creates a workout linked to own check-in', !r.err);
r = await as(A, `insert into public.workout_sets (workout_id, exercise_id, set_index, weight, reps, client_id) values ('${W}', '${bench}', 0, 80, 8, gen_random_uuid()) returning id`); expect('A logs a set on a built-in exercise', !r.err);
r = await as(A, `insert into public.exercises (slug, name, primary_muscles, is_custom, user_id) values ('cLand', 'Landmine press', array['shoulders'], true, '${A}') returning id`); expect('A creates a custom exercise', !r.err);
const custA = r.rows && r.rows[0].id;
// B tries to see or touch A's data
r = await as(B, `select count(*)::int n from public.workout_sets`); expect('B sees none of A\'s sets', r.rows[0].n === 0);
r = await as(B, `select count(*)::int n from public.workouts`); expect('B sees none of A\'s workouts', r.rows[0].n === 0);
r = await as(B, `select count(*)::int n from public.readiness_checkins`); expect('B sees none of A\'s check-ins', r.rows[0].n === 0);
r = await as(B, `select count(*)::int n from public.profiles`); expect('B sees only own profile', r.rows[0].n === 1);
r = await as(B, `select count(*)::int n from public.exercises where is_custom`); expect('B cannot see A\'s custom exercise', r.rows[0].n === 0);
r = await as(B, `select count(*)::int n from public.exercises`); expect('B sees the 141 built-ins', r.rows[0].n === 141);
r = await as(B, `select count(*)::int n from public.get_ghost_sets('${bench}')`); expect('B gets no ghost sets from A', r.rows[0].n === 0);
r = await as(B, `select count(*)::int n from public.get_weekly_muscle_volume(4)`); expect('B gets an empty heat map', r.rows[0].n === 0);
r = await as(B, `insert into public.workout_sets (workout_id, exercise_id, set_index, weight, reps, client_id) values ('${W}', '${bench}', 1, 1, 1, gen_random_uuid())`); expect('B cannot add a set to A\'s workout', !!r.err);
r = await as(B, `insert into public.workout_sets (user_id, workout_id, exercise_id, set_index, weight, reps, client_id) values ('${A}', '${W}', '${bench}', 1, 1, 1, gen_random_uuid())`); expect('B cannot write a row as A', !!r.err);
r = await as(B, `insert into public.workouts (started_at) values (now()) returning id`); const WB = r.rows && r.rows[0].id; expect('B creates own workout', !r.err);
r = await as(B, `insert into public.workout_sets (workout_id, exercise_id, set_index, weight, reps, client_id) values ('${WB}', '${custA}', 0, 1, 1, gen_random_uuid())`); expect('B cannot log a set on A\'s custom exercise', !!r.err);
r = await as(B, `insert into public.workouts (started_at, readiness_id) values (now(), '${R}')`); expect('B cannot link A\'s check-in', !!r.err);
r = await as(B, `update public.workout_sets set weight = 999 returning id`); expect('B updates none of A\'s sets', !r.err && r.rows.length === 0);
r = await as(B, `delete from public.workouts returning id`); expect('B deletes only own workout', !r.err && r.rows.length === 1);
r = await as(B, `update public.exercises set name = 'hacked' where slug = 'bench' returning id`); expect('B cannot edit a built-in', !r.err && r.rows.length === 0);
r = await as(B, `delete from public.exercises where slug = 'bench' returning id`); expect('B cannot delete a built-in', !r.err && r.rows.length === 0);
r = await as(B, `insert into public.exercises (slug, name, is_custom, user_id) values ('zz', 'Fake built-in', false, null)`); expect('B cannot add a built-in', !!r.err);
r = await as(B, `truncate public.workout_sets`); expect('B cannot truncate a table', !!r.err);
// A keeps full access to own data
r = await as(A, `select count(*)::int n from public.get_ghost_sets('${bench}')`); expect('A gets own ghost sets', r.rows[0].n === 1);
r = await as(A, `select muscle, volume::float v from public.get_weekly_muscle_volume(1) where muscle='chest'`); expect('A heat map: chest volume 640', r.rows[0] && r.rows[0].v === 640);
r = await as(A, `update public.workout_sets set reps = 9 returning id`); expect('A edits own set', r.rows && r.rows.length === 1);
r = await as(A, `update public.workout_sets set user_id = '${B}' returning id`); expect('A cannot hand a set to B', !!r.err);
// signed out
r = await as(null, `select count(*)::int n from public.exercises`); expect('Signed-out visitor cannot read exercises', !!r.err);
r = await as(null, `select * from public.get_ghost_sets('${bench}')`); expect('Signed-out visitor cannot call functions', !!r.err);
console.log(`\n${pass} passed, ${fail} failed`);
