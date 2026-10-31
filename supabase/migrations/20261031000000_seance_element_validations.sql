-- Validation par le joueur de l'échauffement et des cardios d'une séance de
-- musculation (éléments stockés en JSON dans `seances`, pas en lignes
-- `exercices`). element ∈ 'echauffement' | 'cardio_debut' | 'cardio_fin' | 'cardio_bloc_<index>'
create table if not exists public.seance_element_validations (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references public.seances(id) on delete cascade,
  semaine integer not null,
  element text not null,
  created_at timestamptz not null default now(),
  unique (seance_id, semaine, element)
);

alter table public.seance_element_validations enable row level security;

create policy client_select_own_element_validations on public.seance_element_validations
  for select using (seance_id in (
    select sea.id from public.seances sea join public.programmes prog on prog.id = sea.programme_id
    where prog.client_id = public.current_client_id()));

create policy client_insert_own_element_validations on public.seance_element_validations
  for insert with check (seance_id in (
    select sea.id from public.seances sea join public.programmes prog on prog.id = sea.programme_id
    where prog.client_id = public.current_client_id()));

create policy client_delete_own_element_validations on public.seance_element_validations
  for delete using (seance_id in (
    select sea.id from public.seances sea join public.programmes prog on prog.id = sea.programme_id
    where prog.client_id = public.current_client_id()));

create policy coach_all_element_validations on public.seance_element_validations
  for all using (public.is_coach()) with check (public.is_coach());
