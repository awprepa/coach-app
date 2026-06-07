-- Séries d'échauffement définies par le coach sur chaque exercice
-- Stockées comme JSONB : [{ reps: "10", pourcentage: 40 }, ...]
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS series_echauffement jsonb DEFAULT '[]'::jsonb;
