-- Pose de la photo d'évolution : face / profil / dos.
-- Permet au coach de comparer ce qui est comparable (une face avec une face).
-- Nullable : les photos déjà envoyées n'ont pas de pose renseignée.
ALTER TABLE public.evolution_photos
  ADD COLUMN IF NOT EXISTS pose text
  CHECK (pose IN ('face','profil','dos'));

CREATE INDEX IF NOT EXISTS idx_evolution_photos_client_pose_date
  ON public.evolution_photos (client_id, pose, date DESC);
