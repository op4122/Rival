-- Rival core schema: profiles, exercises, readiness check-ins, workouts, workout sets.
-- Row Level Security is switched on here, at creation, so no table is ever readable without a policy.
-- The policies themselves are in the security migration.

-- The 13 muscle groups the app's heat map uses (also in supabase/muscles.json).
create or replace function public.is_valid_muscle_list(m text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select m <@ array['chest','shoulders','triceps','biceps','forearms','abs','lats','traps','lowerback','glutes','quads','hamstrings','calves']::text[]
$$;

-- profiles: one row per signed-in user, created automatically on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  units text not null default 'kg' check (units in ('kg', 'lb')),
  settings jsonb not null default '{}'::jsonb,  -- plan, per-exercise units, rest times, theme: what follows you to a new phone
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_settings_is_object check (jsonb_typeof(settings) = 'object'),
  constraint profiles_settings_size check (pg_column_size(settings) <= 262144)
);
comment on column public.profiles.settings is 'App settings and training plan as JSON. Never holds email or other personal data.';

-- exercises: built-in library (user_id null) plus each user's custom exercises.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[A-Za-z0-9_-]{1,64}$'),  -- the app's own exercise id, e.g. 'bench' or 'pushdown__rope'
  name text not null check (char_length(name) between 1 and 80),
  primary_muscles text[] not null default '{}' check (public.is_valid_muscle_list(primary_muscles)),
  secondary_muscles text[] not null default '{}' check (public.is_valid_muscle_list(secondary_muscles)),
  equipment text not null default 'free_weight' check (equipment in ('free_weight', 'machine', 'bodyweight')),
  increment_kg numeric(5, 2) not null default 2.5 check (increment_kg > 0 and increment_kg <= 25),
  is_compound boolean not null default false,
  per_side boolean not null default false,     -- weight entered is for one dumbbell / one side
  attachment text check (char_length(attachment) <= 20),  -- e.g. 'Rope' for a cable attachment variant
  base_slug text,                               -- the lift a variant belongs to, e.g. 'pushdown'
  is_custom boolean not null default false,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exercises_owner_matches_kind check ((is_custom and user_id is not null) or (not is_custom and user_id is null))
);
create unique index exercises_builtin_slug_key on public.exercises (slug) where user_id is null;
create unique index exercises_custom_slug_key on public.exercises (user_id, slug) where user_id is not null;
create index exercises_user_id_idx on public.exercises (user_id);

-- readiness_checkins: the pre-workout check-in. The app asks sleep, soreness and energy;
-- its 4-step answers are stored as 1-4 (higher is better: 4 = slept great / fresh / charged). stress is optional.
create table public.readiness_checkins (
  id uuid primary key default gen_random_uuid(),  -- may be generated on the phone so offline check-ins sync without duplicates
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  stress smallint check (stress between 1 and 5),
  score smallint not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);
create index readiness_checkins_user_created_idx on public.readiness_checkins (user_id, created_at desc);

-- workouts: one row per session. The phone may supply the id so an offline workout syncs exactly once.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_name text check (char_length(day_name) <= 40),
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text check (char_length(notes) <= 2000),
  readiness_id uuid references public.readiness_checkins (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workouts_end_after_start check (ended_at is null or ended_at >= started_at)
);
create index workouts_user_created_idx on public.workouts (user_id, created_at desc);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_readiness_id_idx on public.workouts (readiness_id);

-- workout_sets: every logged set. client_id is made on the phone and is what offline sync upserts on.
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  set_index smallint not null check (set_index between 0 and 99),
  weight numeric(7, 2) not null default 0 check (weight between 0 and 2500),  -- always kg
  reps integer not null check (reps between 1 and 999),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  completed_at timestamptz not null default now(),
  client_id uuid not null unique,
  created_at timestamptz not null default now()
);
create index workout_sets_ghost_idx on public.workout_sets (user_id, exercise_id, completed_at desc);
create index workout_sets_user_created_idx on public.workout_sets (user_id, created_at desc);
create index workout_sets_workout_id_idx on public.workout_sets (workout_id);
create index workout_sets_exercise_id_idx on public.workout_sets (exercise_id);

-- Keep updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger workouts_touch before update on public.workouts for each row execute function public.touch_updated_at();

-- A profile row for every new signup. Runs as its owner because it writes to public.profiles from auth;
-- it copies only the user id, never the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Row Level Security on from the start: with no policies yet, nobody can read or write through the API.
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.readiness_checkins enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

-- Signed-out visitors never touch these tables; signed-in users go through the policies.
revoke all on public.profiles, public.exercises, public.readiness_checkins, public.workouts, public.workout_sets from anon;
