-- Bilan client : journal automatique des modifications du suivi + notes de
-- semaine du coach. Tout est strictement réservé au coach (aucune politique
-- pour les athlètes : RLS activée sans accès = invisible pour eux).

create table public.client_modifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  categorie text not null check (categorie in ('programme','exercice','volume','charge','nutrition')),
  cible_id uuid,           -- objet modifié (exercice, programme…) pour fusionner les retouches
  libelle text not null,   -- nom affiché (ex. "A1 · Squat")
  champ text not null,     -- ce qui change (ex. "Intensité", "Ajouté")
  avant text,
  apres text,
  created_at timestamptz not null default now()
);
create index on public.client_modifications (client_id, created_at desc);

create table public.client_bilan_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  semaine date not null,   -- lundi de la semaine
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (client_id, semaine)
);

alter table public.client_modifications enable row level security;
alter table public.client_bilan_notes   enable row level security;
create policy "coach_all_client_modifications" on public.client_modifications
  for all using (public.is_coach()) with check (public.is_coach());
create policy "coach_all_client_bilan_notes" on public.client_bilan_notes
  for all using (public.is_coach()) with check (public.is_coach());

-- ── Écriture dans le journal ────────────────────────────────────────────────
-- Seules les modifications faites par le coach sont journalisées. Une même
-- valeur retouchée plusieurs fois en moins de 6 h est fusionnée en une ligne
-- (premier "avant" → dernier "après") ; si on revient à la valeur de départ,
-- la ligne disparaît.
create or replace function public.log_client_modif(
  p_client uuid, p_cat text, p_cible uuid, p_libelle text, p_champ text, p_avant text, p_apres text
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_client is null or not public.is_coach() then return; end if;
  if p_cible is not null and p_champ not in ('Ajouté','Retiré') then
    select id, avant into r from public.client_modifications
      where client_id = p_client and cible_id = p_cible and champ = p_champ
        and created_at > now() - interval '6 hours'
      order by created_at desc limit 1;
    if found then
      if r.avant is not distinct from p_apres then
        delete from public.client_modifications where id = r.id;
      else
        update public.client_modifications set apres = p_apres, libelle = p_libelle where id = r.id;
      end if;
      return;
    end if;
  end if;
  insert into public.client_modifications (client_id, categorie, cible_id, libelle, champ, avant, apres)
    values (p_client, p_cat, p_cible, p_libelle, p_champ, p_avant, p_apres);
end $$;

create or replace function public._v(t text) returns text language sql immutable as
  $$ select case when t is null or btrim(t) = '' then '—' else btrim(t) end $$;

-- ── Exercices (volume, charge, tempo, récup., ajout/retrait) ────────────────
create or replace function public.trg_log_exercice() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_lib text; o text; n text;
begin
  select p.client_id into v_client from public.seances s join public.programmes p on p.id = s.programme_id
    where s.id = coalesce(NEW.seance_id, OLD.seance_id);
  if v_client is null then return coalesce(NEW, OLD); end if;
  if TG_OP = 'DELETE' then
    perform public.log_client_modif(v_client, 'exercice', OLD.id, coalesce(OLD.code || ' · ', '') || OLD.nom, 'Retiré', null, null);
    return OLD;
  end if;
  v_lib := coalesce(NEW.code || ' · ', '') || NEW.nom;
  if TG_OP = 'INSERT' then
    perform public.log_client_modif(v_client, 'exercice', NEW.id, v_lib, 'Ajouté', null,
      coalesce(NEW.series::text, '?') || ' × ' || public._v(NEW.repetitions));
    return NEW;
  end if;
  if OLD.nom is distinct from NEW.nom then
    perform public.log_client_modif(v_client, 'exercice', NEW.id, v_lib, 'Exercice', OLD.nom, NEW.nom);
  end if;
  o := coalesce(OLD.series::text, '?') || ' × ' || public._v(OLD.repetitions);
  n := coalesce(NEW.series::text, '?') || ' × ' || public._v(NEW.repetitions);
  if o <> n then perform public.log_client_modif(v_client, 'volume', NEW.id, v_lib, 'Séries × reps', o, n); end if;
  o := public._v(coalesce(OLD.type_intensite, '') || ' ' || coalesce(OLD.valeur_intensite, ''));
  n := public._v(coalesce(NEW.type_intensite, '') || ' ' || coalesce(NEW.valeur_intensite, ''));
  if o <> n then perform public.log_client_modif(v_client, 'charge', NEW.id, v_lib, 'Intensité', o, n); end if;
  if public._v(OLD.tempo) <> public._v(NEW.tempo) then
    perform public.log_client_modif(v_client, 'volume', NEW.id, v_lib, 'Tempo', public._v(OLD.tempo), public._v(NEW.tempo)); end if;
  if public._v(OLD.recuperation) <> public._v(NEW.recuperation) then
    perform public.log_client_modif(v_client, 'volume', NEW.id, v_lib, 'Récup.', public._v(OLD.recuperation), public._v(NEW.recuperation)); end if;
  return NEW;
end $$;
create trigger trg_log_exercice after insert or update or delete on public.exercices
  for each row execute function public.trg_log_exercice();

-- ── Séances ─────────────────────────────────────────────────────────────────
create or replace function public.trg_log_seance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select client_id into v_client from public.programmes where id = coalesce(NEW.programme_id, OLD.programme_id);
  if v_client is null then return coalesce(NEW, OLD); end if;
  if TG_OP = 'INSERT' then
    perform public.log_client_modif(v_client, 'programme', NEW.id, NEW.nom, 'Séance ajoutée', null, null);
  elsif TG_OP = 'DELETE' then
    perform public.log_client_modif(v_client, 'programme', OLD.id, OLD.nom, 'Séance retirée', null, null);
  elsif OLD.nom is distinct from NEW.nom then
    perform public.log_client_modif(v_client, 'programme', NEW.id, NEW.nom, 'Nom de la séance', OLD.nom, NEW.nom);
  end if;
  return coalesce(NEW, OLD);
end $$;
create trigger trg_log_seance after insert or update or delete on public.seances
  for each row execute function public.trg_log_seance();

-- ── Programmes ──────────────────────────────────────────────────────────────
create or replace function public.trg_log_programme() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(NEW.client_id, OLD.client_id) is null then return coalesce(NEW, OLD); end if;
  if TG_OP = 'INSERT' then
    perform public.log_client_modif(NEW.client_id, 'programme', NEW.id, NEW.nom, 'Programme ajouté', null, null);
  elsif TG_OP = 'DELETE' then
    perform public.log_client_modif(OLD.client_id, 'programme', OLD.id, OLD.nom, 'Programme retiré', null, null);
  else
    if OLD.nom is distinct from NEW.nom then
      perform public.log_client_modif(NEW.client_id, 'programme', NEW.id, NEW.nom, 'Nom du programme', OLD.nom, NEW.nom); end if;
    if OLD.semaines is distinct from NEW.semaines then
      perform public.log_client_modif(NEW.client_id, 'programme', NEW.id, NEW.nom, 'Durée (semaines)', OLD.semaines::text, NEW.semaines::text); end if;
    if OLD.date_debut is distinct from NEW.date_debut then
      perform public.log_client_modif(NEW.client_id, 'programme', NEW.id, NEW.nom, 'Date de début', OLD.date_debut::text, NEW.date_debut::text); end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
create trigger trg_log_programme after insert or update or delete on public.programmes
  for each row execute function public.trg_log_programme();

-- ── Plans nutritionnels (niveau plan : statut, objectifs) ───────────────────
create or replace function public.trg_log_nutrition_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Plan ajouté', null, null);
  elsif TG_OP = 'DELETE' then
    perform public.log_client_modif(OLD.client_id, 'nutrition', OLD.id, OLD.nom, 'Plan retiré', null, null);
  else
    if OLD.statut is distinct from NEW.statut then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Statut', OLD.statut, NEW.statut); end if;
    if OLD.objectif_kcal is distinct from NEW.objectif_kcal then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Objectif kcal', OLD.objectif_kcal::text, NEW.objectif_kcal::text); end if;
    if OLD.objectif_prot is distinct from NEW.objectif_prot then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Objectif protéines (g)', OLD.objectif_prot::text, NEW.objectif_prot::text); end if;
    if OLD.objectif_carbs is distinct from NEW.objectif_carbs then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Objectif glucides (g)', OLD.objectif_carbs::text, NEW.objectif_carbs::text); end if;
    if OLD.objectif_fat is distinct from NEW.objectif_fat then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Objectif lipides (g)', OLD.objectif_fat::text, NEW.objectif_fat::text); end if;
    if OLD.nom is distinct from NEW.nom then
      perform public.log_client_modif(NEW.client_id, 'nutrition', NEW.id, NEW.nom, 'Nom du plan', OLD.nom, NEW.nom); end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
create trigger trg_log_nutrition_plan after insert or update or delete on public.nutrition_plans
  for each row execute function public.trg_log_nutrition_plan();
