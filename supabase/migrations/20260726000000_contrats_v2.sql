-- ============================================================================
-- Refonte "contrat" — deux signatures distinctes :
--   1) contrat_conditions_acceptees : conditions générales (CGU + consentement
--      santé + aptitude physique), une fois par version, pour TOUS les clients
--      utilisant l'app (y compris "club"). Remplace la partie CGV de
--      acceptations_contrat + la table consents (type='sante').
--   2) contrats : contrat commercial (formule/tarif/engagement), envoyé
--      explicitement par le coach à chaque nouvelle souscription — jamais
--      pour l'offre "club". Remplace ConfirmationOffre.
-- L'ancienne table acceptations_contrat n'est pas touchée (historique
-- conservé en lecture), mais n'est plus alimentée par le nouveau code.
-- ============================================================================

-- ── 1) Conditions générales (signature A) ───────────────────────────────────
create table if not exists public.contrat_conditions_acceptees (
  id                uuid        primary key default gen_random_uuid(),
  client_id         uuid        not null references public.clients(id) on delete cascade,
  version           text        not null,
  date_acceptation  timestamptz not null default now(),
  ip_address        text,
  mention           text,
  created_at        timestamptz not null default now(),
  unique (client_id, version)
);

alter table public.contrat_conditions_acceptees enable row level security;

create policy cca_client_select on public.contrat_conditions_acceptees
  for select using (client_id = public.current_client_id());
create policy cca_client_insert on public.contrat_conditions_acceptees
  for insert with check (client_id = public.current_client_id());
create policy cca_coach_select on public.contrat_conditions_acceptees
  for select using (public.is_coach());

-- ── 2) Contrats commerciaux (signature B) ───────────────────────────────────
create table if not exists public.contrats (
  id                uuid        primary key default gen_random_uuid(),
  client_id         uuid        not null references public.clients(id) on delete cascade,
  statut            text        not null default 'envoye' check (statut in ('envoye', 'signe', 'refuse')),
  formule           text        not null,
  formule_label     text        not null,
  engagement_mois   integer,
  prix_mensuel      numeric     not null,
  prix_total        numeric,
  date_debut        date,
  date_fin          date,
  texte_cgv         jsonb       not null,
  date_envoi        timestamptz not null default now(),
  date_signature    timestamptz,
  ip_address        text,
  mention           text,
  pdf_url           text,
  created_at        timestamptz not null default now()
);

alter table public.contrats enable row level security;

create policy contrats_client_select on public.contrats
  for select using (client_id = public.current_client_id());
create policy contrats_client_update on public.contrats
  for update using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());
create policy contrats_coach_all on public.contrats
  for all using (public.is_coach()) with check (public.is_coach());

-- ── Storage : bucket privé pour les PDF de contrats signés ──────────────────
-- Convention : {client_id}/{contrat_id}.pdf
insert into storage.buckets (id, name, public)
  values ('contrats-pdf', 'contrats-pdf', false)
  on conflict (id) do nothing;

drop policy if exists "contrats_pdf_select" on storage.objects;
drop policy if exists "contrats_pdf_insert" on storage.objects;

create policy "contrats_pdf_select"
  on storage.objects for select
  using (
    bucket_id = 'contrats-pdf'
    and (
      (storage.foldername(name))[1] = public.current_client_id()::text
      or public.is_coach()
    )
  );

create policy "contrats_pdf_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'contrats-pdf'
    and (
      (storage.foldername(name))[1] = public.current_client_id()::text
      or public.is_coach()
    )
  );
