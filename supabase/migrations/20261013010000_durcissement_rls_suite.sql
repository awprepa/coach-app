-- Suite du durcissement RLS : catégories, notifications, modèles d'échauffement,
-- et colonnes sensibles de la fiche client que l'athlète ne doit pas modifier.

-- UUID du coach (lisible par les politiques)
create or replace function public.coach_uuid() returns uuid
language sql stable security definer set search_path = public as $$
  select nullif(trim(both '"' from value::text), '')::uuid from public.app_settings where key = 'coach_user_id'
$$;

-- ── categories : lecture pour tous les connectés, écriture coach ──
drop policy if exists "insert_categories" on public.categories;
drop policy if exists "update_categories" on public.categories;
drop policy if exists "delete_categories" on public.categories;
create policy "categories_write_coach" on public.categories
  for all using (public.is_coach()) with check (public.is_coach());

-- ── notifications : on ne peut notifier que le coach (ou soi-même) ; le coach, tout le monde ──
drop policy if exists "insert_notifs" on public.notifications;
create policy "notifications_insert_limite" on public.notifications
  for insert to authenticated
  with check (public.is_coach() or destinataire_id = public.coach_uuid() or destinataire_id = auth.uid());

-- ── modèles d'échauffement : écriture coach ──
drop policy if exists "coaches insert templates" on public.echauffements_templates;
drop policy if exists "coaches update templates" on public.echauffements_templates;
drop policy if exists "coaches delete templates" on public.echauffements_templates;
create policy "echauffements_write_coach" on public.echauffements_templates
  for all using (public.is_coach()) with check (public.is_coach());

-- ── clients : un athlète ne peut pas changer offre, notes du coach, dates, etc. ──
-- Retour silencieux à l'ancienne valeur (n'interrompt pas un enregistrement
-- de profil qui enverrait ces champs). Le service (edge functions) et le coach
-- ne sont pas concernés.
create or replace function public.trg_clients_champs_proteges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_coach() then return NEW; end if;
  NEW.offre := OLD.offre;
  NEW.notes := OLD.notes;
  NEW.notes_coach := OLD.notes_coach;
  NEW.actif := OLD.actif;
  NEW.date_debut := OLD.date_debut;
  NEW.date_fin := OLD.date_fin;
  NEW.engagement_mois := OLD.engagement_mois;
  NEW.offre_confirmee_at := OLD.offre_confirmee_at;
  NEW.categorie_id := OLD.categorie_id;
  NEW.peut_creer_seances := OLD.peut_creer_seances;
  NEW.coach_notifie := OLD.coach_notifie;
  NEW.email := OLD.email;
  -- user_id : on ne peut que le renseigner (rattachement), jamais le changer
  if OLD.user_id is not null then NEW.user_id := OLD.user_id; end if;
  return NEW;
end $$;
drop trigger if exists trg_clients_champs_proteges on public.clients;
create trigger trg_clients_champs_proteges before update on public.clients
  for each row execute function public.trg_clients_champs_proteges();
