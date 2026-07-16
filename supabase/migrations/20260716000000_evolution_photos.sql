-- ════════════════════════════════════════════════════════════════════════════
-- Photos d'évolution — données TRÈS sensibles.
-- Règle absolue : SEUL LE COACH peut voir/télécharger. Le client peut déposer
-- (à l'aveugle) mais ne peut jamais relire ses photos.
-- ════════════════════════════════════════════════════════════════════════════

-- Bucket privé
insert into storage.buckets (id, name, public)
values ('evolution-photos', 'evolution-photos', false)
on conflict (id) do nothing;

-- Table des métadonnées
create table if not exists public.evolution_photos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  date          date not null default current_date,
  storage_path  text not null,
  uploaded_by   text not null default 'client',   -- 'client' | 'coach'
  note          text,
  created_at    timestamptz not null default now()
);
alter table public.evolution_photos enable row level security;

-- Client : peut DÉPOSER les siennes, mais PAS les relire.
drop policy if exists evphotos_client_insert on public.evolution_photos;
create policy evphotos_client_insert on public.evolution_photos
  for insert with check (client_id = public.current_client_id());

-- Coach : lecture + gestion complète.
drop policy if exists evphotos_coach_all on public.evolution_photos;
create policy evphotos_coach_all on public.evolution_photos
  for all using (public.is_coach()) with check (public.is_coach());

-- Jour de rappel photo (0=dimanche .. 6=samedi), null = pas de rappel.
alter table public.clients add column if not exists photo_reminder_dow smallint;

-- ── Politiques Storage (bucket evolution-photos) ────────────────────────────
-- Upload : le client uniquement dans SON dossier (<client_id>/...), coach partout.
drop policy if exists evphotos_upload on storage.objects;
create policy evphotos_upload on storage.objects
  for insert with check (
    bucket_id = 'evolution-photos'
    and (public.is_coach() or (storage.foldername(name))[1] = public.current_client_id()::text)
  );

-- Lecture/téléchargement : COACH UNIQUEMENT.
drop policy if exists evphotos_read on storage.objects;
create policy evphotos_read on storage.objects
  for select using (bucket_id = 'evolution-photos' and public.is_coach());

-- Suppression : coach uniquement.
drop policy if exists evphotos_delete on storage.objects;
create policy evphotos_delete on storage.objects
  for delete using (bucket_id = 'evolution-photos' and public.is_coach());
