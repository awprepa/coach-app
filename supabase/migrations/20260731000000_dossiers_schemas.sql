-- Dossiers pour ranger les schémas d'entraînement (remplace le classement
-- par type d'exercice, jugé peu utile en pratique).
create table if not exists public.dossiers_schemas (
  id         uuid        primary key default gen_random_uuid(),
  nom        text        not null,
  created_at timestamptz not null default now()
);

alter table public.dossiers_schemas enable row level security;

create policy ds_coach_all on public.dossiers_schemas
  for all using (public.is_coach()) with check (public.is_coach());

alter table public.schemas_entrainement
  add column if not exists dossier_id uuid references public.dossiers_schemas(id) on delete set null;

create index if not exists schemas_entrainement_dossier_idx on public.schemas_entrainement (dossier_id);
