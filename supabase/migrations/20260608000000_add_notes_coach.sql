-- Colonne notes privées du coach sur chaque client
-- Visible uniquement côté coach, jamais exposée côté client
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes_coach text;
