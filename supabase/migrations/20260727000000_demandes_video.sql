-- Demande de vidéo de correction sur un exercice précis. Le client filme et
-- envoie la vidéo au coach par un canal externe (WhatsApp) — cette table ne
-- stocke aucun fichier, juste le signal "à filmer" / "envoyée".
create table if not exists public.demandes_video (
  id           uuid        primary key default gen_random_uuid(),
  exercice_id  uuid        not null references public.exercices(id) on delete cascade,
  client_id    uuid        not null references public.clients(id) on delete cascade,
  statut       text        not null default 'en_attente' check (statut in ('en_attente', 'faite')),
  demandee_le  timestamptz not null default now(),
  fait_le      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists demandes_video_exercice_idx on public.demandes_video (exercice_id);
create index if not exists demandes_video_client_idx on public.demandes_video (client_id);

alter table public.demandes_video enable row level security;

create policy dv_coach_all on public.demandes_video
  for all using (public.is_coach()) with check (public.is_coach());
create policy dv_client_select on public.demandes_video
  for select using (client_id = public.current_client_id());
create policy dv_client_update on public.demandes_video
  for update using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());
