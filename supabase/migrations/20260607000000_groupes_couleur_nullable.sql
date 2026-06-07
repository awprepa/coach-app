-- Rendre la colonne couleur nullable dans groupes
-- (les groupes sans logo n'ont plus besoin d'une couleur par défaut)
ALTER TABLE groupes ALTER COLUMN couleur DROP NOT NULL;
ALTER TABLE groupes ALTER COLUMN couleur SET DEFAULT NULL;
