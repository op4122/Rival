-- 1. Fill profiles.display_name from the Google name on signup (Google sends full_name / name in the user metadata).
--    Email sign-ups have no name, so it stays empty. Still never copies the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 60), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Keep-alive: a tiny function the scheduled GitHub Action can call with the publishable key.
--    It reads no table and returns no data, so signed-out callers learn nothing.
create or replace function public.ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
