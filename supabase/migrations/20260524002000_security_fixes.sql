-- ─── Sécurité : corrections issues audit ─────────────────────────────────────

-- 1. nutrition_foods : retirer la politique qui autorisait n'importe quel
--    client authentifié à insérer dans le catalogue partagé.
--    Les insertions passent uniquement par les Edge Functions (service role).
DROP POLICY IF EXISTS "nf_write" ON public.nutrition_foods;

-- Vérifier qu'il existe toujours une politique de lecture pour les clients
-- (les politiques de SELECT restent intactes — seul INSERT/UPDATE est restreint)
-- Si besoin de recréer la lecture seule :
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nutrition_foods' AND policyname = 'nf_read'
  ) THEN
    CREATE POLICY "nf_read" ON public.nutrition_foods
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
