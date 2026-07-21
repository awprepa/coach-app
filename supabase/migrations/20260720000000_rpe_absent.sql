-- Absence à un entraînement : le joueur peut signaler qu'il n'était pas là,
-- au lieu de noter une intensité. Les RPE restent alors nuls.
ALTER TABLE public.groupe_seance_rpe
  ADD COLUMN IF NOT EXISTS absent boolean NOT NULL DEFAULT false;
