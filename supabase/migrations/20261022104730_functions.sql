-- Read functions for ghost sets and the heat map.
-- Both are SECURITY INVOKER: they run with the caller's permissions, so Row Level Security still applies,
-- and they also filter on auth.uid() so the intent is explicit.

-- Sets from the caller's most recent previous workout containing this exercise (warm-ups excluded).
-- p_exclude_workout_id lets the app leave out the workout in progress.
create or replace function public.get_ghost_sets(p_exercise_id uuid, p_exclude_workout_id uuid default null)
returns table (workout_id uuid, set_index smallint, weight numeric, reps integer, rpe numeric, completed_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_workout as (
    select ws.workout_id
    from public.workout_sets ws
    join public.workouts w on w.id = ws.workout_id
    where ws.user_id = (select auth.uid())
      and ws.exercise_id = p_exercise_id
      and not ws.is_warmup
      and (p_exclude_workout_id is null or ws.workout_id <> p_exclude_workout_id)
    order by w.started_at desc, ws.completed_at desc
    limit 1
  )
  select ws.workout_id, ws.set_index, ws.weight, ws.reps, ws.rpe, ws.completed_at
  from public.workout_sets ws
  where ws.workout_id = (select lw.workout_id from last_workout lw)
    and ws.exercise_id = p_exercise_id
    and ws.user_id = (select auth.uid())
    and not ws.is_warmup
  order by ws.set_index, ws.completed_at;
$$;

-- Weekly training per muscle for the heat map, newest weeks last.
-- volume = weight x reps (kg), sets = hard sets. Primary muscles count in full, secondary muscles at half,
-- matching the app. Warm-ups are excluded. Weeks start on Monday in p_tz (default Asia/Muscat).
create or replace function public.get_weekly_muscle_volume(p_weeks integer default 4, p_tz text default 'Asia/Muscat')
returns table (week_start date, muscle text, volume numeric, sets numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select ((date_trunc('week', now() at time zone p_tz) - make_interval(weeks => least(greatest(coalesce(p_weeks, 4), 1), 52) - 1)) at time zone p_tz) as since
  ),
  tagged as (
    select ws.completed_at, ws.weight * ws.reps as vol, m.muscle, m.factor
    from public.workout_sets ws
    join public.exercises e on e.id = ws.exercise_id
    cross join lateral (
      select unnest(e.primary_muscles) as muscle, 1.0::numeric as factor
      union all
      select unnest(e.secondary_muscles), 0.5::numeric
    ) m
    where ws.user_id = (select auth.uid())
      and not ws.is_warmup
      and ws.completed_at >= (select since from bounds)
  )
  select (date_trunc('week', completed_at at time zone p_tz))::date as week_start,
         muscle,
         round(sum(vol * factor), 1) as volume,
         sum(factor) as sets
  from tagged
  group by 1, 2
  order by 1, 2;
$$;

revoke execute on function public.get_ghost_sets(uuid, uuid) from public, anon;
revoke execute on function public.get_weekly_muscle_volume(integer, text) from public, anon;
grant execute on function public.get_ghost_sets(uuid, uuid) to authenticated;
grant execute on function public.get_weekly_muscle_volume(integer, text) to authenticated;
