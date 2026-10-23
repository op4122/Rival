-- Rivals security check: proves a non-rival gets nothing, and rivals get only what get_rival_ghost allows.
-- Run the whole file in the Supabase SQL editor (or via the Supabase MCP execute_sql).
-- It makes 3 throwaway users inside one DO block and always ends by raising an exception, so EVERYTHING it did is
-- rolled back. The message tells you the result:
--   "RLS TEST PASSED: n checks"   or   "RLS TEST FAILED: <which check>"
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  bench uuid; w_done uuid := gen_random_uuid(); w_live uuid := gen_random_uuid();
  code text; n int; r record; ok_count int := 0; v uuid;
begin
  select id into bench from public.exercises where slug = 'bench' and user_id is null;
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'rls-a@example.invalid', '{"full_name":"Sara Test"}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'rls-b@example.invalid', '{"full_name":"Omar Test"}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', c, 'authenticated', 'authenticated', 'rls-c@example.invalid', '{"full_name":"Eve Stranger"}', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);

  -- act as A
  -- A: makes an invite, a finished workout (bench 85 x 6, 85 x 5) and a newer one still in progress (100 x 5)
  execute 'insert into public.invite_codes default values returning code' into code;
  execute 'insert into public.workouts (id, day_name, started_at, ended_at) values ($1, ''Push'', now() - interval ''2 days'', now() - interval ''2 days'' + interval ''1 hour'')' using w_done;
  execute 'insert into public.workout_sets (workout_id, exercise_id, set_index, weight, reps, client_id) values ($1, $2, 0, 85, 6, gen_random_uuid()), ($1, $2, 1, 85, 5, gen_random_uuid())' using w_done, bench;
  execute 'insert into public.workouts (id, day_name, started_at) values ($1, ''Push'', now())' using w_live;
  execute 'insert into public.workout_sets (workout_id, exercise_id, set_index, weight, reps, client_id) values ($1, $2, 0, 100, 5, gen_random_uuid())' using w_live, bench;
  execute 'update public.profiles set share_lifts = true where id = $1' using a;

  -- C (not a rival yet): sees nothing of A
  perform set_config('request.jwt.claims', json_build_object('sub', c::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'select count(*) from public.invite_codes' into n;            if n <> 0 then raise exception 'RLS TEST FAILED: stranger can read invite codes'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.get_rival_ghost($1, $2)' into n using a, bench; if n <> 0 then raise exception 'RLS TEST FAILED: stranger got rows from get_rival_ghost'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.get_rival_ghost($1, null)' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: stranger got the name from get_rival_ghost'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.workout_sets where user_id = $1' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: stranger can read sets'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.workouts where user_id = $1' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: stranger can read workouts'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.profiles where id = $1' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: stranger can read the profile'; end if; ok_count := ok_count + 1;
  begin
    execute 'insert into public.rivals (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))' using a, c;
    raise exception 'RLS TEST FAILED: a user could insert a rivals row directly';
  exception when insufficient_privilege then ok_count := ok_count + 1; end;

  -- B accepts A's invite
  perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'select public.accept_rival_invite($1)' into v using code; if v <> a then raise exception 'RLS TEST FAILED: accept returned the wrong user'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.rivals' into n; if n <> 1 then raise exception 'RLS TEST FAILED: rival can not see the link'; end if; ok_count := ok_count + 1;
  execute 'select count(*) as n, min(display_name) as nm, max(weight) as mw from public.get_rival_ghost($1, $2)' into r using a, bench;
  if r.n <> 2 or r.nm <> 'Sara' or r.mw <> 85 then raise exception 'RLS TEST FAILED: rival ghost wrong (want 2 sets at 85 from the finished workout, first name only): % % %', r.n, r.nm, r.mw; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.workout_sets where user_id = $1' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: a rival can read sets directly'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.profiles where id = $1' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: a rival can read the profile directly'; end if; ok_count := ok_count + 1;
  execute 'select count(*) as n, min(display_name) as nm, max(weight) as mw from public.get_rival_ghost($1, $2)' into r using a, gen_random_uuid();
  if r.n <> 1 or r.mw is not null then raise exception 'RLS TEST FAILED: unknown exercise should give the name only'; end if; ok_count := ok_count + 1;

  -- C still gets nothing, and can not remove A and B's link
  perform set_config('request.jwt.claims', json_build_object('sub', c::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'select count(*) from public.rivals' into n; if n <> 0 then raise exception 'RLS TEST FAILED: stranger sees the rivals link'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.get_rival_ghost($1, $2)' into n using a, bench; if n <> 0 then raise exception 'RLS TEST FAILED: stranger got the ghost after the link was made'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.get_rival_ghost($1, $2)' into n using b, bench; if n <> 0 then raise exception 'RLS TEST FAILED: stranger got B'; end if; ok_count := ok_count + 1;
  execute 'with d as (delete from public.rivals returning 1) select count(*) from d' into n; if n <> 0 then raise exception 'RLS TEST FAILED: stranger deleted a link'; end if; ok_count := ok_count + 1;

  -- A switches sharing off: B gets the name only
  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'update public.profiles set share_lifts = false where id = $1' using a;
  begin execute 'select public.accept_rival_invite($1)' using code; raise exception 'RLS TEST FAILED: accepted own invite';
  exception when invalid_parameter_value then ok_count := ok_count + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'select count(*) as n, min(display_name) as nm, max(weight) as mw from public.get_rival_ghost($1, $2)' into r using a, bench;
  if r.n <> 1 or r.nm <> 'Sara' or r.mw is not null then raise exception 'RLS TEST FAILED: sharing off should give the name only'; end if; ok_count := ok_count + 1;

  -- B removes the link: nothing any more
  execute 'with d as (delete from public.rivals returning 1) select count(*) from d' into n; if n <> 1 then raise exception 'RLS TEST FAILED: rival could not remove the link'; end if; ok_count := ok_count + 1;
  execute 'select count(*) from public.get_rival_ghost($1, null)' into n using a; if n <> 0 then raise exception 'RLS TEST FAILED: removed rival still gets the name'; end if; ok_count := ok_count + 1;

  -- A revokes the invite: the code stops working
  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'delete from public.invite_codes';
  perform set_config('request.jwt.claims', json_build_object('sub', c::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  begin execute 'select public.accept_rival_invite($1)' using code; raise exception 'RLS TEST FAILED: revoked invite still works';
  exception when no_data_found then ok_count := ok_count + 1; end;

  -- Signed out (anon): can not call either function or read either table
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin execute 'select count(*) from public.get_rival_ghost($1, $2)' using a, bench; raise exception 'RLS TEST FAILED: anon can call get_rival_ghost';
  exception when insufficient_privilege then ok_count := ok_count + 1; end;
  begin execute 'select count(*) from public.rivals'; raise exception 'RLS TEST FAILED: anon can read rivals';
  exception when insufficient_privilege then ok_count := ok_count + 1; end;
  begin execute 'select public.accept_rival_invite($1)' using code; raise exception 'RLS TEST FAILED: anon can accept invites';
  exception when insufficient_privilege then ok_count := ok_count + 1; end;

  perform set_config('role', 'postgres', true);
  raise exception 'RLS TEST PASSED: % checks', ok_count;
end;
$$;
