-- Durcissement RLS : plusieurs politiques "using (true)" donnaient à N'IMPORTE
-- QUEL utilisateur connecté (donc à tout athlète) la lecture ET l'écriture de
-- toutes les fiches clients (dont notes_coach), des exercices, des charges, des
-- événements de tous, et même de app_settings (qui désigne le coach : élévation
-- de privilèges possible). On remplace par : coach = tout, athlète = ses lignes.

-- ── app_settings : lecture pour tous les connectés (coach_user_id), écriture coach ──
drop policy if exists "app_settings_write" on public.app_settings;
create policy "app_settings_write_coach" on public.app_settings
  for all using (public.is_coach()) with check (public.is_coach());

-- ── clients ──
drop policy if exists "clients_authenticated" on public.clients;
create policy "clients_coach_all" on public.clients
  for all using (public.is_coach()) with check (public.is_coach());
-- l'athlète lit sa fiche ; rattachement par e-mail tant que user_id est vide
create policy "clients_select_own" on public.clients
  for select using (
    user_id = auth.uid()
    or (user_id is null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
create policy "clients_link_by_email" on public.clients
  for update using (user_id is null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (user_id = auth.uid());
-- (la politique existante "clients can update own profile" reste en place)

-- ── exercices : coach, ou athlète propriétaire du programme ──
drop policy if exists "exercices_authenticated" on public.exercices;
create policy "exercices_coach_all" on public.exercices
  for all using (public.is_coach()) with check (public.is_coach());
create policy "exercices_own_all" on public.exercices
  for all using (exists (
    select 1 from public.seances s join public.programmes p on p.id = s.programme_id
    where s.id = exercices.seance_id and p.client_id = public.current_client_id()))
  with check (exists (
    select 1 from public.seances s join public.programmes p on p.id = s.programme_id
    where s.id = exercices.seance_id and p.client_id = public.current_client_id()));

-- ── charges : idem, via l'exercice ──
drop policy if exists "charges_authenticated" on public.charges;
create policy "charges_coach_all" on public.charges
  for all using (public.is_coach()) with check (public.is_coach());
create policy "charges_own_all" on public.charges
  for all using (exists (
    select 1 from public.exercices e join public.seances s on s.id = e.seance_id
      join public.programmes p on p.id = s.programme_id
    where e.id = charges.exercice_id and p.client_id = public.current_client_id()))
  with check (exists (
    select 1 from public.exercices e join public.seances s on s.id = e.seance_id
      join public.programmes p on p.id = s.programme_id
    where e.id = charges.exercice_id and p.client_id = public.current_client_id()));

-- ── evenements : plus d'accès global ; les politiques "own" existent déjà ──
drop policy if exists "select_own_events" on public.evenements;
drop policy if exists "insert_events"     on public.evenements;
drop policy if exists "delete_events"     on public.evenements;
create policy "evenements_coach_all" on public.evenements
  for all using (public.is_coach()) with check (public.is_coach());
