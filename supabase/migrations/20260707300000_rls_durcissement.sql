-- ════════════════════════════════════════════════════════════════════════════
-- Durcissement RLS : 12 tables avaient une règle « USING(true) » pour le rôle
-- public → accessibles à n'importe qui avec la clé anon. On remplace par des
-- règles par-client + coach. Un compte non-coach sans ligne dans `clients`
-- (ex. inscription pirate) ne voit RIEN.
-- ════════════════════════════════════════════════════════════════════════════

-- ── factures : coach uniquement (données financières) ───────────────────────
drop policy if exists "coach_all"          on public.factures;
drop policy if exists "coach_all_factures" on public.factures;
create policy factures_coach on public.factures for all
  using (public.is_coach()) with check (public.is_coach());

-- ── seance_templates : coach uniquement ─────────────────────────────────────
drop policy if exists "coach can manage templates" on public.seance_templates;
create policy seance_templates_coach on public.seance_templates for all
  using (public.is_coach()) with check (public.is_coach());

-- ── wellness : le joueur gère le sien, le coach voit tout ───────────────────
drop policy if exists "allow_all" on public.wellness;
create policy wellness_coach on public.wellness for all
  using (public.is_coach()) with check (public.is_coach());
create policy wellness_client on public.wellness for all
  using      (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── tests_resultats : le joueur gère les siens, le coach voit tout ──────────
drop policy if exists "allow_all" on public.tests_resultats;
create policy tests_resultats_coach on public.tests_resultats for all
  using (public.is_coach()) with check (public.is_coach());
create policy tests_resultats_client on public.tests_resultats for all
  using      (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── programmes : le joueur lit le sien, le coach gère tout ──────────────────
drop policy if exists "Accès total" on public.programmes;
create policy programmes_coach on public.programmes for all
  using (public.is_coach()) with check (public.is_coach());
create policy programmes_client_read on public.programmes for select
  using (client_id = public.current_client_id());

-- ── acceptations_contrat : le joueur gère la sienne, le coach lit ───────────
drop policy if exists "Acces total" on public.acceptations_contrat;
create policy acceptations_coach on public.acceptations_contrat for all
  using (public.is_coach()) with check (public.is_coach());
create policy acceptations_client on public.acceptations_contrat for all
  using      (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ── bibliotheque_exercices : lecture pour tout connecté, écriture coach ─────
drop policy if exists "gestion"                     on public.bibliotheque_exercices;
drop policy if exists "lecture"                     on public.bibliotheque_exercices;
drop policy if exists "clients can read bibliotheque" on public.bibliotheque_exercices;
create policy biblio_coach on public.bibliotheque_exercices for all
  using (public.is_coach()) with check (public.is_coach());
create policy biblio_read on public.bibliotheque_exercices for select
  to authenticated using (true);

-- ── tests_types : données de référence (le joueur en crée lors d'un test) ───
drop policy if exists "allow_all" on public.tests_types;
create policy tests_types_coach on public.tests_types for all
  using (public.is_coach()) with check (public.is_coach());
create policy tests_types_read on public.tests_types for select
  to authenticated using (true);
create policy tests_types_insert on public.tests_types for insert
  to authenticated with check (true);

-- ── gps_rapports : lecture pour tout connecté, écriture coach ───────────────
drop policy if exists "coach only" on public.gps_rapports;
create policy gps_coach on public.gps_rapports for all
  using (public.is_coach()) with check (public.is_coach());
create policy gps_read on public.gps_rapports for select
  to authenticated using (true);

-- ── seances : le joueur lit les séances de SES programmes, coach = tout ─────
drop policy if exists "Accès total" on public.seances;
create policy seances_coach on public.seances for all
  using (public.is_coach()) with check (public.is_coach());
create policy seances_client_read on public.seances for select
  using (exists (
    select 1 from public.programmes p
    where p.id = seances.programme_id and p.client_id = public.current_client_id()
  ));

-- ── rpe_seances : le joueur gère celles de SES séances, coach = tout ────────
drop policy if exists "Accès total" on public.rpe_seances;
create policy rpe_seances_coach on public.rpe_seances for all
  using (public.is_coach()) with check (public.is_coach());
create policy rpe_seances_client on public.rpe_seances for all
  using (exists (
    select 1 from public.seances s join public.programmes p on p.id = s.programme_id
    where s.id = rpe_seances.seance_id and p.client_id = public.current_client_id()
  ))
  with check (exists (
    select 1 from public.seances s join public.programmes p on p.id = s.programme_id
    where s.id = rpe_seances.seance_id and p.client_id = public.current_client_id()
  ));

-- ── serie_tracking : le joueur gère le suivi de SES exercices, coach = tout ─
drop policy if exists "allow_all"                on public.serie_tracking;
drop policy if exists "coach read serie_tracking" on public.serie_tracking;
create policy serie_tracking_coach on public.serie_tracking for all
  using (public.is_coach()) with check (public.is_coach());
create policy serie_tracking_client on public.serie_tracking for all
  using (exists (
    select 1 from public.exercices e
      join public.seances s   on s.id = e.seance_id
      join public.programmes p on p.id = s.programme_id
    where e.id = serie_tracking.exercice_id and p.client_id = public.current_client_id()
  ))
  with check (exists (
    select 1 from public.exercices e
      join public.seances s   on s.id = e.seance_id
      join public.programmes p on p.id = s.programme_id
    where e.id = serie_tracking.exercice_id and p.client_id = public.current_client_id()
  ));
