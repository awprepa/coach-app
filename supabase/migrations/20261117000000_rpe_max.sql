-- RPE de la rep réussie lors d'un test max (côté joueur), visible dans l'onglet Tests
alter table public.serie_tracking add column if not exists rpe numeric;
alter table public.tests_resultats add column if not exists rpe numeric;
