-- Support de plusieurs équipes FFR par groupe (ex: seniors + espoirs) sur les
-- mêmes pages monclubhouse : chaque ligne de classement est taguée par sa
-- compétition, et le groupe peut préciser une compétition "espoirs" en plus
-- de sa compétition principale (monclubhouse_competition).

ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS monclubhouse_competition_espoirs text;

ALTER TABLE public.classements_ffr
  ADD COLUMN IF NOT EXISTS competition text,
  ADD COLUMN IF NOT EXISTS competition_label text;

-- L'ancienne contrainte (groupe_id, equipe) empêche d'avoir deux classements
-- (principale + espoirs) pour le même groupe dès qu'un même nom d'équipe
-- apparaît dans les deux poules — on l'élargit pour inclure la compétition.
ALTER TABLE public.classements_ffr
  DROP CONSTRAINT IF EXISTS classements_ffr_groupe_id_equipe_key;

ALTER TABLE public.classements_ffr
  ADD CONSTRAINT classements_ffr_groupe_id_competition_equipe_key
  UNIQUE (groupe_id, competition, equipe);
