-- Ajoute l'engagement (durée en mois) et la date de confirmation de l'offre sur les clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS engagement_mois integer DEFAULT NULL,  -- null = sans engagement, 3, 6
  ADD COLUMN IF NOT EXISTS offre_confirmee_at timestamptz DEFAULT NULL;  -- quand le client a confirmé sa souscription

COMMENT ON COLUMN clients.engagement_mois IS 'Durée d''engagement en mois : null = sans engagement, 3 = 3 mois, 6 = 6 mois';
COMMENT ON COLUMN clients.offre_confirmee_at IS 'Date à laquelle le client a confirmé sa souscription dans l''app';
