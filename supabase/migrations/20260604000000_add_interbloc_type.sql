-- Ajoute 'inter_bloc' comme type valide pour les séquences
-- (séparateur entre séries dans un même bloc opposition)

ALTER TABLE public.groupe_seance_sequences
  DROP CONSTRAINT IF EXISTS groupe_seance_sequences_type_check;

ALTER TABLE public.groupe_seance_sequences
  ADD CONSTRAINT groupe_seance_sequences_type_check
  CHECK (type IN ('jeu', 'recup', 'inter_bloc'));
