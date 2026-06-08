-- ── Table factures ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      uuid REFERENCES clients(id) ON DELETE SET NULL,
  numero         text NOT NULL,
  date_emission  date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance  date,
  statut         text NOT NULL DEFAULT 'brouillon'
                   CHECK (statut IN ('brouillon','envoyee','payee')),
  lignes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- Index pour trier par date
CREATE INDEX IF NOT EXISTS factures_created_at_idx ON factures (created_at DESC);

-- RLS : seul le coach peut voir et modifier ses factures
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_all_factures" ON factures
  USING  (public.is_coach())
  WITH CHECK (public.is_coach());

-- ── Pré-remplissage des paramètres coach dans app_settings ────────────────
INSERT INTO app_settings (key, value) VALUES
  ('facture_nom',    'Arthur Wehrey'),
  ('facture_adresse','41 rue Fénelon, 31200 Toulouse'),
  ('facture_siret',  '10602688300012'),
  ('facture_email',  'arthur.whry@gmail.com'),
  ('facture_numero_debut', '1')
ON CONFLICT (key) DO NOTHING;
