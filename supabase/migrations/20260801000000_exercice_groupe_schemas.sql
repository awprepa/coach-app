-- Phase 6 du module "Schémas d'entraînement" : lie un exercice de séance
-- (groupe_seance_exercices) à un schéma graphique et/ou un calcul d'intensité,
-- par groupe de niveau. niveau_id nullable = même schéma/calcul pour tous les
-- niveaux. Les valeurs sont figées au moment de l'enregistrement (jsonb), pas
-- recalculées automatiquement si le schéma ou le groupe de niveau change ensuite.
create table if not exists public.exercice_groupe_schemas (
  id                uuid        primary key default gen_random_uuid(),
  exercice_id       uuid        not null references public.groupe_seance_exercices(id) on delete cascade,
  niveau_id         uuid        references public.groupes_niveau(id) on delete set null,
  schema_id         uuid        references public.schemas_entrainement(id) on delete set null,
  parametres_calcul jsonb,
  resultat          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exercice_groupe_schemas_exercice
  on public.exercice_groupe_schemas (exercice_id);

alter table public.exercice_groupe_schemas enable row level security;
create policy egs_coach_all on public.exercice_groupe_schemas
  for all using (public.is_coach()) with check (public.is_coach());
