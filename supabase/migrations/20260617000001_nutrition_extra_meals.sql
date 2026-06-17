-- Migration : repas libres ajoutés par le client + ajustement contraintes
-- Permet au client d'ajouter un repas non prescrit à la journée (statut 'extra')

-- 1. Étendre le CHECK statut pour inclure 'extra'
alter table public.nutrition_plan_logs
  drop constraint if exists nutrition_plan_logs_statut_check;

alter table public.nutrition_plan_logs
  add constraint nutrition_plan_logs_statut_check
    check (statut in ('fait', 'hors_plan', 'saute', 'extra'));

-- 2. Remplacer le UNIQUE (client_id, date, meal_id) par un index partiel
--    (les extras ont meal_id = NULL, PostgreSQL autorise plusieurs NULL dans un UNIQUE,
--     mais on utilise un index partiel pour plus de clarté)
alter table public.nutrition_plan_logs
  drop constraint if exists nutrition_plan_logs_client_id_date_meal_id_key;

create unique index if not exists nutrition_plan_logs_unique_plan_meal
  on public.nutrition_plan_logs (client_id, date, meal_id)
  where meal_id is not null;
