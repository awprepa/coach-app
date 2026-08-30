-- Les blocs cardio (avant séance / après séance / libres) existent sur `seances`
-- depuis 20260707000000_seances_cardio_blocs.sql mais n'ont jamais été ajoutés à
-- programme_template_seances : en enregistrant un cycle dans la bibliothèque puis
-- en l'envoyant à un client, les cardio étaient donc silencieusement perdus.
ALTER TABLE public.programme_template_seances
  ADD COLUMN IF NOT EXISTS cardio_debut jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cardio_fin   jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cardio_blocs jsonb NOT NULL DEFAULT '[]'::jsonb;
