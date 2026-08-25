-- Rangs personnalisés par client : le coach choisit un exercice (celui de son
-- choix, pas forcément un des 9 exercices standards) et fixe lui-même les
-- seuils en kg pour chaque palier (Bronze → Champion). Le client voit son rang
-- comme pour les exercices standards, mais sans ratio poids de corps ni
-- pourcentage de population — juste le poids réel comparé aux seuils fixés.

create table public.custom_rank_exercises (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  exercice_nom text not null,
  seuil_bronze_kg numeric not null,
  seuil_argent_kg numeric not null,
  seuil_or_kg numeric not null,
  seuil_platine_kg numeric not null,
  seuil_diamant_kg numeric not null,
  seuil_champion_kg numeric not null,
  created_at timestamptz default now(),
  unique(client_id, exercice_nom)
);

alter table public.custom_rank_exercises enable row level security;

create policy coach_all_custom_ranks on public.custom_rank_exercises
  for all using (is_coach());

create policy client_read_own_custom_ranks on public.custom_rank_exercises
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );
