-- Colonne terminee sur evenements
-- Permet de masquer les séances complétées du widget "prochain événement"

ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS terminee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_evenements_terminee
  ON public.evenements (client_id, date, terminee);
