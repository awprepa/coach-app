-- Resserre l'accès aux tables de référence : un compte connecté mais SANS
-- ligne clients (ex. inscription pirate) ne doit rien lire non plus.
-- Condition : être un vrai client (current_client_id() non nul) ou le coach.

-- bibliotheque_exercices
drop policy if exists biblio_read on public.bibliotheque_exercices;
create policy biblio_read on public.bibliotheque_exercices for select
  using (public.current_client_id() is not null or public.is_coach());

-- gps_rapports
drop policy if exists gps_read on public.gps_rapports;
create policy gps_read on public.gps_rapports for select
  using (public.current_client_id() is not null or public.is_coach());

-- tests_types (lecture + création par un vrai client lors d'un test)
drop policy if exists tests_types_read   on public.tests_types;
drop policy if exists tests_types_insert on public.tests_types;
create policy tests_types_read on public.tests_types for select
  using (public.current_client_id() is not null or public.is_coach());
create policy tests_types_insert on public.tests_types for insert
  with check (public.current_client_id() is not null or public.is_coach());
