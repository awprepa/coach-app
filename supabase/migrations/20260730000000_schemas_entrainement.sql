-- Bibliothèque de schémas graphiques d'exercices (section 3 du cahier des
-- charges "Schémas d'entraînement") : plots + segments dessinés par le
-- coach, réutilisables et duplicables d'une séance à l'autre.
create table if not exists public.schemas_entrainement (
  id             uuid        primary key default gen_random_uuid(),
  nom            text        not null,
  type_exercice  text        not null default 'autre' check (type_exercice in ('intermittent_long', 'intermittent_court', 'agilite', 'autre')),
  description    text,
  donnees        jsonb       not null default '{"plots":[],"segments":[]}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists schemas_entrainement_type_idx on public.schemas_entrainement (type_exercice);

alter table public.schemas_entrainement enable row level security;

create policy se_coach_all on public.schemas_entrainement
  for all using (public.is_coach()) with check (public.is_coach());
