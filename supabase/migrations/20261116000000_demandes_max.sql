-- Demande de test max (1RM) par le coach sur un exercice, comme demandes_video.
-- Le joueur valide une série de 1 rep ; la charge part dans tests_resultats.
create table if not exists public.demandes_max (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid not null references public.exercices(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  statut text not null default 'en_attente',
  valeur numeric,
  demandee_le timestamptz not null default now(),
  fait_le timestamptz,
  created_at timestamptz not null default now()
);

alter table public.demandes_max enable row level security;

create policy dm_coach_all on public.demandes_max for all using (is_coach()) with check (is_coach());
create policy dm_client_select on public.demandes_max for select using (client_id = current_client_id());
create policy dm_client_update on public.demandes_max for update using (client_id = current_client_id()) with check (client_id = current_client_id());
