-- Colonne notif_incomplete_envoyee sur evenements
-- Permet d'envoyer une seule notification au coach quand un client entre des
-- données dans une séance (poids/reps) sans jamais la terminer.

ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS notif_incomplete_envoyee boolean NOT NULL DEFAULT false;
