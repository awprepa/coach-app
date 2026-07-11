-- Notation d'intensité (session-RPE différencié) des séances terrain de groupe.
-- 3 dimensions rugby, chacune 0-10 : cardio, jambes (musculaire), contact.
-- Commentaire optionnel. Une note par joueur et par séance.
create table if not exists public.groupe_seance_rpe (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references public.groupe_evenements(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  rpe_cardio    smallint check (rpe_cardio  between 0 and 10),
  rpe_jambes    smallint check (rpe_jambes  between 0 and 10),
  rpe_contact   smallint check (rpe_contact between 0 and 10),
  commentaire   text,
  created_at    timestamptz not null default now(),
  unique (evenement_id, client_id)
);

alter table public.groupe_seance_rpe enable row level security;

-- Le joueur gère uniquement sa propre note
drop policy if exists rpe_client_all on public.groupe_seance_rpe;
create policy rpe_client_all on public.groupe_seance_rpe
  for all
  using      (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- Le coach lit toutes les notes
drop policy if exists rpe_coach_read on public.groupe_seance_rpe;
create policy rpe_coach_read on public.groupe_seance_rpe
  for select using (public.is_coach());
