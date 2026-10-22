-- Row Level Security policies. RLS is already enabled on every table (core_schema).
-- Rule: a signed-in user can only see and change their own rows. Built-in exercises are readable by every
-- signed-in user and changeable by nobody through the API. Signed-out visitors (anon) get nothing.
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query, not once per row.

-- TRUNCATE, REFERENCES and TRIGGER are not covered by RLS, so the API roles must not have them.
revoke truncate, references, trigger on public.profiles, public.exercises, public.readiness_checkins, public.workouts, public.workout_sets from anon, authenticated;
revoke execute on function public.is_valid_muscle_list(text[]) from public, anon;
grant execute on function public.is_valid_muscle_list(text[]) to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- profiles: your own row only.
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: create own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: delete own" on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

-- exercises: built-ins (user_id is null) are read-only for everyone signed in; custom exercises belong to their owner.
create policy "exercises: read built-in and own" on public.exercises for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "exercises: create own custom" on public.exercises for insert to authenticated
  with check (user_id = (select auth.uid()) and is_custom);
create policy "exercises: update own custom" on public.exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and is_custom);
create policy "exercises: delete own custom" on public.exercises for delete to authenticated
  using (user_id = (select auth.uid()));

-- readiness_checkins: your own check-ins only.
create policy "readiness: read own" on public.readiness_checkins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "readiness: create own" on public.readiness_checkins for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "readiness: update own" on public.readiness_checkins for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "readiness: delete own" on public.readiness_checkins for delete to authenticated
  using (user_id = (select auth.uid()));

-- workouts: your own workouts; a linked check-in must also be yours.
create policy "workouts: read own" on public.workouts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "workouts: create own" on public.workouts for insert to authenticated
  with check (user_id = (select auth.uid())
    and (readiness_id is null or exists (select 1 from public.readiness_checkins r where r.id = readiness_id and r.user_id = (select auth.uid()))));
create policy "workouts: update own" on public.workouts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (readiness_id is null or exists (select 1 from public.readiness_checkins r where r.id = readiness_id and r.user_id = (select auth.uid()))));
create policy "workouts: delete own" on public.workouts for delete to authenticated
  using (user_id = (select auth.uid()));

-- workout_sets: your own sets; the workout must be yours and the exercise built-in or yours.
create policy "sets: read own" on public.workout_sets for select to authenticated
  using (user_id = (select auth.uid()));
create policy "sets: create own" on public.workout_sets for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid()))));
create policy "sets: update own" on public.workout_sets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid()))));
create policy "sets: delete own" on public.workout_sets for delete to authenticated
  using (user_id = (select auth.uid()));
