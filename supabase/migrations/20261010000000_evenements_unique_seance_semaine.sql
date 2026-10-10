-- Corrige les doublons créés par le placement automatique (autoPlacerSeance.js) :
-- chaque sauvegarde de série lançait un "vérifier puis insérer" en parallèle,
-- et plusieurs passaient avant qu'aucun n'ait fini d'insérer. 12 lignes
-- identiques ont ainsi été créées pour une même séance + semaine.

-- 1. Supprime les doublons, en gardant la plus ancienne ligne par
--    (client, séance, semaine) — celle-ci porte déjà les éventuels
--    marqueurs terminee / notif_incomplete_envoyee.
delete from evenements e
using (
  select id,
         row_number() over (
           partition by client_id, seance_id, semaine
           order by created_at, id
         ) as rn
  from evenements
  where semaine is not null and seance_id is not null
) d
where e.id = d.id and d.rn > 1;

-- 2. Verrou côté base : un seul événement par client + séance + semaine
--    quand la semaine est renseignée (les événements placés à la main, sans
--    semaine, ne sont pas concernés).
create unique index if not exists uq_evenements_client_seance_semaine
  on evenements (client_id, seance_id, semaine)
  where semaine is not null and seance_id is not null;
