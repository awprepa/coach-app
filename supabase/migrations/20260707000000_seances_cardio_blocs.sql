-- Blocs cardio en texte libre sur une séance
-- Une liste de { titre, texte } ; une séance sans exercice + avec des blocs
-- cardio = séance 100 % cardio.
ALTER TABLE public.seances
  ADD COLUMN IF NOT EXISTS cardio_blocs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Idem sur les modèles de séance, pour conserver les blocs lors d'un enregistrement
-- ou d'une assignation de modèle.
ALTER TABLE public.seance_templates
  ADD COLUMN IF NOT EXISTS cardio_blocs jsonb NOT NULL DEFAULT '[]'::jsonb;
