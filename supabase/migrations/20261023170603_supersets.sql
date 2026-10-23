-- Supersets: which superset group a logged set belonged to ('A', 'B', ...), or null for a straight set.
-- workout_sets already has Row Level Security (own rows only), and the new column is covered by the same policies.
alter table public.workout_sets
  add column superset_group text check (superset_group ~ '^[A-Z]$');
comment on column public.workout_sets.superset_group is 'Superset letter within the workout (A, B, ...); null when the exercise was not in a superset. Ghosts stay per exercise.';
