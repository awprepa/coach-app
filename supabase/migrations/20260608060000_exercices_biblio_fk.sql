-- S'assurer que la colonne image_url existe dans bibliotheque_exercices
ALTER TABLE bibliotheque_exercices ADD COLUMN IF NOT EXISTS image_url text;

-- S'assurer que la colonne bibliotheque_id existe dans exercices
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS bibliotheque_id uuid;

-- Ajouter la FK si elle n'existe pas encore (nécessaire pour le join Supabase)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercices_bibliotheque_id_fkey'
  ) THEN
    ALTER TABLE exercices
      ADD CONSTRAINT exercices_bibliotheque_id_fkey
      FOREIGN KEY (bibliotheque_id) REFERENCES bibliotheque_exercices(id) ON DELETE SET NULL;
  END IF;
END $$;
