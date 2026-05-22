-- Ajout du logo de club sur les catégories (utilisé dans la projection)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS logo_url TEXT;
