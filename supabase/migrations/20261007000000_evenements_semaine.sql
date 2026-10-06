-- Identifie à quelle semaine du programme correspond un événement de type
-- séance, pour pouvoir détecter si la séance a déjà été placée sur le
-- calendrier du client avant de l'y placer automatiquement (voir
-- src/utils/autoPlacerSeance.js) quand il la remplit sans l'avoir fait
-- lui-même. Distinct de `semaine_override` (qui sert au rattrapage de charge,
-- pas à la détection de doublon).
alter table evenements
  add column if not exists semaine integer;

create index if not exists idx_evenements_seance_semaine
  on evenements(client_id, seance_id, semaine);

-- ── Rattrapage historique ────────────────────────────────────────────────────
-- Pour chaque séance déjà remplie (au moins une série validée dans
-- serie_tracking) sans événement calendrier correspondant, crée un événement
-- daté de la première saisie disponible pour cette séance+semaine (le plus
-- tôt parmi tous ses exercices). Les lignes sans `created_at` (antérieures à
-- l'ajout de la colonne) sont ignorées : pas de date fiable à leur attribuer,
-- et ce n'est pas grave si certaines vieilles séances restent absentes.
with premiere_saisie as (
  select exo.seance_id, st.semaine, min(st.created_at)::date as jour
  from serie_tracking st
  join exercices exo on exo.id = st.exercice_id
  where st.is_done = true and st.created_at is not null
  group by exo.seance_id, st.semaine
)
insert into evenements (client_id, date, type, titre, seance_id, source, semaine, semaine_override)
select prog.client_id, ps.jour, 'seance', sea.nom, ps.seance_id, 'client', ps.semaine, ps.semaine
from premiere_saisie ps
join seances sea on sea.id = ps.seance_id
join programmes prog on prog.id = sea.programme_id
where not exists (
  select 1 from evenements e
  where e.client_id = prog.client_id and e.seance_id = ps.seance_id and e.semaine = ps.semaine
)
and not exists (
  select 1 from evenements e2
  where e2.client_id = prog.client_id and e2.seance_id = ps.seance_id and e2.date = ps.jour
);
