-- Le rattachement schéma/intensité se fait finalement au niveau du bloc
-- "séquences" (jeu/récup, contenu terrain/intermittent) et non plus sur une
-- ligne d'exercice "standard" (style musculation : nom/charge). Un bloc
-- séquences représente un seul exercice avec sa structure jeu/récup, donc le
-- rattachement au bloc entier est le bon niveau.
alter table public.exercice_groupe_schemas
  alter column exercice_id drop not null,
  add column if not exists bloc_id uuid references public.groupe_seance_blocs(id) on delete cascade;

create index if not exists idx_exercice_groupe_schemas_bloc
  on public.exercice_groupe_schemas (bloc_id);
