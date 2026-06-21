-- Planification entraînement rugby
-- themes_seance : thèmes travaillés en séance (virgule-séparés), sur l'événement
-- contact_intensite : échelle 0-4 (Gabbett et al. 2012) par bloc
-- course_volume / course_intensite : échelles qualitatives par bloc

ALTER TABLE groupe_evenements
  ADD COLUMN IF NOT EXISTS themes_seance TEXT;

ALTER TABLE groupe_seance_blocs
  ADD COLUMN IF NOT EXISTS contact_intensite INTEGER CHECK (contact_intensite BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS course_volume     TEXT,
  ADD COLUMN IF NOT EXISTS course_intensite  TEXT;
