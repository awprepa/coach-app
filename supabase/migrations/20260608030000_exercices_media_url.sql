-- URL média (YouTube, image PNG/GIF) attachée à un exercice
-- Affichée côté client dans une modale au tap
ALTER TABLE exercices ADD COLUMN IF NOT EXISTS media_url text;
