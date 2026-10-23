-- Rivals: race a friend's ghost.
-- 1. profiles.share_lifts: "Let rivals see my lifts". Off by default.
-- 2. invite_codes: one random, revocable invite code per user.
-- 3. rivals: a mutual connection between two users (stored once, user_a < user_b). Either can remove it.
-- 4. accept_rival_invite(code): the only way to create a rivals row.
-- 5. get_rival_ghost(rival_id, exercise_id): the only way to read anything about another user. It returns the rival's
--    first name and, if they share their lifts, the sets from their last finished workout with that built-in exercise.
-- Row Level Security is on for both new tables; nobody can read another user's rows directly.

-- 1. Sharing switch, read by get_rival_ghost on the server so the app can't get around it.
alter table public.profiles add column share_lifts boolean not null default false;
comment on column public.profiles.share_lifts is 'Let rivals see my lifts: when false, get_rival_ghost returns only the first name to rivals.';

-- 2. Invite codes: 128 random bits as 32 hex characters. One active code per user; deleting it revokes the link.
create table public.invite_codes (
  code text primary key default replace(gen_random_uuid()::text, '-', '') check (code ~ '^[0-9a-f]{32}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index invite_codes_one_per_user on public.invite_codes (user_id);
alter table public.invite_codes enable row level security;

-- 3. Rivals: one row per pair, ordered so a pair can only exist once.
create table public.rivals (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint rivals_ordered check (user_a < user_b)
);
create index rivals_user_b_idx on public.rivals (user_b);
alter table public.rivals enable row level security;

revoke all on public.invite_codes, public.rivals from anon;
revoke truncate, references, trigger, update on public.invite_codes, public.rivals from authenticated;
revoke insert on public.rivals from authenticated;

-- invite_codes: your own code only. No update: revoke (delete) and create a new one.
create policy "invites: read own" on public.invite_codes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "invites: create own" on public.invite_codes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "invites: delete own" on public.invite_codes for delete to authenticated
  using (user_id = (select auth.uid()));

-- rivals: you see and can remove only connections you are part of. Rows are created by accept_rival_invite only.
create policy "rivals: read own" on public.rivals for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "rivals: delete own" on public.rivals for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- 4. Accept an invite: links the caller and the code's owner. Returns the new rival's user id.
-- SECURITY DEFINER because the caller can't read someone else's invite code; it reveals nothing but the owner's id.
create or replace function public.accept_rival_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then
    raise exception 'Sign in to accept an invite' using errcode = '28000';
  end if;
  select ic.user_id into v_owner from public.invite_codes ic where ic.code = lower(trim(p_code));
  if v_owner is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_owner = v_me then
    raise exception 'This is your own invite' using errcode = '22023';
  end if;
  insert into public.rivals (user_a, user_b) values (least(v_me, v_owner), greatest(v_me, v_owner))
  on conflict do nothing;
  return v_owner;
end;
$$;

-- 5. A rival's ghost for one built-in exercise.
-- Returns no rows unless the caller and p_rival_id are rivals. Otherwise one or more rows:
--   display_name: the rival's first name (or null), always.
--   started_at, set_index, weight (kg), reps: their last finished workout's working sets for p_exercise_id,
--   only when they switched on share_lifts. With p_exercise_id null (used to show names) or nothing to share,
--   a single row with just the name.
create or replace function public.get_rival_ghost(p_rival_id uuid, p_exercise_id uuid)
returns table (display_name text, started_at timestamptz, set_index smallint, weight numeric, reps integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_shares boolean;
begin
  if v_me is null or p_rival_id is null or p_rival_id = v_me or not exists (
    select 1 from public.rivals r where r.user_a = least(v_me, p_rival_id) and r.user_b = greatest(v_me, p_rival_id)
  ) then
    return;
  end if;

  select nullif(left(split_part(trim(coalesce(p.display_name, '')), ' ', 1), 24), ''), p.share_lifts
    into v_name, v_shares
  from public.profiles p where p.id = p_rival_id;

  if coalesce(v_shares, false) and p_exercise_id is not null
     and exists (select 1 from public.exercises e where e.id = p_exercise_id and e.user_id is null) then
    return query
      with last_w as (
        select w.id, w.started_at
        from public.workouts w
        where w.user_id = p_rival_id
          and w.ended_at is not null
          and exists (select 1 from public.workout_sets ws
                      where ws.workout_id = w.id and ws.exercise_id = p_exercise_id and not ws.is_warmup)
        order by w.started_at desc
        limit 1
      )
      select v_name, lw.started_at, ws.set_index, ws.weight, ws.reps
      from last_w lw
      join public.workout_sets ws on ws.workout_id = lw.id
      where ws.exercise_id = p_exercise_id and ws.user_id = p_rival_id and not ws.is_warmup
      order by ws.set_index, ws.completed_at;
    if found then
      return;
    end if;
  end if;

  return query select v_name, null::timestamptz, null::smallint, null::numeric, null::integer;
end;
$$;

revoke execute on function public.accept_rival_invite(text) from public, anon;
revoke execute on function public.get_rival_ghost(uuid, uuid) from public, anon;
grant execute on function public.accept_rival_invite(text) to authenticated;
grant execute on function public.get_rival_ghost(uuid, uuid) to authenticated;
