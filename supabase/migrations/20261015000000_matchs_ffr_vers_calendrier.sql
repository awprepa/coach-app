-- Les matchs FFR importés (matchs_ffr) deviennent aussi des événements « match »
-- du calendrier du groupe (groupe_evenements) : ils apparaissent dans le
-- mini-calendrier du groupe et ouvrent le questionnaire RPE de match aux joueurs
-- (RpeGate, rpe-window-notify et la courbe d'intensité lisent groupe_evenements).
-- Un seul événement match par groupe et par jour : s'il existe déjà, on ne fait
-- que compléter ses champs vides (adversaire, heure, lieu, journée).

create or replace function public.ffr_match_vers_evenement(m public.matchs_ffr)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  adv text := case
    when m.est_domicile is true  then m.equipe_ext
    when m.est_domicile is false then m.equipe_dom
    else coalesce(m.equipe_ext, m.equipe_dom) end;
  h time := case
    when m.heure ~ '^\d{1,2}[:hH]\d{2}' then replace(replace(substring(m.heure from '^\d{1,2}[:hH]\d{2}'), 'h', ':'), 'H', ':')::time
    else null end;
begin
  if m.groupe_id is null or m.date_match is null then return; end if;
  if exists (select 1 from groupe_evenements where groupe_id = m.groupe_id and date = m.date_match and type = 'match') then
    update groupe_evenements
       set adversaire = coalesce(adversaire, adv),
           heure      = coalesce(heure, h),
           domicile   = coalesce(domicile, m.est_domicile),
           journee    = coalesce(journee, m.journee)
     where groupe_id = m.groupe_id and date = m.date_match and type = 'match';
  else
    insert into groupe_evenements (groupe_id, date, heure, type, adversaire, domicile, journee, duree_min)
    values (m.groupe_id, m.date_match, h, 'match', adv, m.est_domicile, m.journee, 80);
  end if;
end;
$$;

create or replace function public.trg_ffr_match_vers_evenement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ffr_match_vers_evenement(new);
  return new;
end;
$$;

drop trigger if exists ffr_match_vers_evenement on public.matchs_ffr;
create trigger ffr_match_vers_evenement
  after insert or update on public.matchs_ffr
  for each row execute function public.trg_ffr_match_vers_evenement();

-- Rattrapage des matchs déjà importés
select public.ffr_match_vers_evenement(m) from public.matchs_ffr m;

revoke all on function public.ffr_match_vers_evenement(public.matchs_ffr) from public, anon, authenticated;
