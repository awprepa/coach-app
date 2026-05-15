ALTER TABLE serie_tracking ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;
UPDATE serie_tracking SET is_done = true WHERE valide = true;
