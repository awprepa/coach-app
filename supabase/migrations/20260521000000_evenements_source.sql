-- ─────────────────────────────────────────────────────────────────────────────
-- Séances ponctuelles : colonne source sur evenements
-- 'coach'  = événement ajouté par le coach (défaut, rétro-compatible)
-- 'client' = séance ajoutée librement par le client
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.evenements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'coach'
  CHECK (source IN ('coach', 'client'));

-- Tous les événements existants sont du coach
UPDATE public.evenements SET source = 'coach' WHERE source IS NULL OR source = '';

CREATE INDEX IF NOT EXISTS idx_evenements_source ON public.evenements(client_id, source);

-- ── RLS : le client peut insérer / lire / supprimer SES PROPRES événements ──
-- (policies existantes pour le coach restent inchangées)

-- Le client peut lire ses événements (source coach ET client)
DROP POLICY IF EXISTS "client_select_own_evenements" ON public.evenements;
CREATE POLICY "client_select_own_evenements" ON public.evenements
  FOR SELECT USING (client_id = current_client_id());

-- Le client peut insérer uniquement des événements source='client'
DROP POLICY IF EXISTS "client_insert_own_evenements" ON public.evenements;
CREATE POLICY "client_insert_own_evenements" ON public.evenements
  FOR INSERT WITH CHECK (
    client_id = current_client_id()
    AND source = 'client'
  );

-- Le client peut supprimer uniquement ses propres événements source='client'
DROP POLICY IF EXISTS "client_delete_own_evenements" ON public.evenements;
CREATE POLICY "client_delete_own_evenements" ON public.evenements
  FOR DELETE USING (
    client_id = current_client_id()
    AND source = 'client'
  );
