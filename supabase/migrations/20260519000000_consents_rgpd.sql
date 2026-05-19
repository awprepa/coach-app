-- ─────────────────────────────────────────────────────────────
-- Consentements RGPD (Art. 9 - données de santé)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consents (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type           text        NOT NULL DEFAULT 'sante',   -- 'sante' pour l'instant
  consented_at   timestamptz NOT NULL DEFAULT now(),
  texte_version  text        NOT NULL DEFAULT '1.0',     -- versionnage du texte de consentement
  UNIQUE (client_id, type)
);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- Le client voit et insère uniquement ses propres consentements
CREATE POLICY "client_select_own_consents" ON public.consents
  FOR SELECT USING (client_id = current_client_id());

CREATE POLICY "client_insert_own_consent" ON public.consents
  FOR INSERT WITH CHECK (client_id = current_client_id());

-- Le coach peut voir tous les consentements
CREATE POLICY "coach_select_all_consents" ON public.consents
  FOR SELECT USING (is_coach());
