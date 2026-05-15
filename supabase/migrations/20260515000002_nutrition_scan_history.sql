-- Historique des produits scannés par les clients
CREATE TABLE IF NOT EXISTS nutrition_scan_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  food_id       uuid REFERENCES nutrition_foods(id) ON DELETE SET NULL,
  barcode       text,
  product_name  text NOT NULL,
  brand         text,
  image_url     text,
  kcal_100g     numeric,
  prot_100g     numeric,
  carbs_100g    numeric,
  fat_100g      numeric,
  fiber_100g    numeric,
  nutriscore_grade text,   -- depuis Open Food Facts (a/b/c/d/e)
  nova_group    integer,
  quality_grade text,      -- calculé côté client (A/B/C/D/E)
  quality_score numeric,   -- /10
  scanned_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_scan_history_client_id_idx
  ON nutrition_scan_history(client_id, scanned_at DESC);

ALTER TABLE nutrition_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients can manage their own scan history"
  ON nutrition_scan_history FOR ALL
  USING  (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());

CREATE POLICY "coach can view all scan history"
  ON nutrition_scan_history FOR SELECT
  USING (is_coach());
