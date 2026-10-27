-- Les schémas types de l'éditeur de terrain sont enregistrés avec
-- type_exercice = 'terrain' : la contrainte d'origine le refusait, si bien
-- qu'aucun schéma type (ni sa description) ne pouvait être enregistré.
alter table public.schemas_entrainement drop constraint if exists schemas_entrainement_type_exercice_check;
alter table public.schemas_entrainement add constraint schemas_entrainement_type_exercice_check
  check (type_exercice in ('intermittent_long', 'intermittent_court', 'agilite', 'autre', 'terrain'));
