-- app_settings contient aussi les coordonnées de facturation (IBAN, adresse,
-- e-mail, SIRET). Les athlètes n'ont besoin que de coach_user_id.
drop policy if exists "app_settings_read" on public.app_settings;
drop policy if exists "read app_settings" on public.app_settings;
create policy "app_settings_read_limite" on public.app_settings
  for select to authenticated
  using (key = 'coach_user_id' or public.is_coach());
