-- ============================================================================
-- NUTRITION — Données physiques & objectifs auto-calculés
-- ============================================================================
-- Ajoute les colonnes anthropométriques dans nutrition_profile pour permettre
-- au client de remplir son questionnaire et faire calculer ses besoins
-- nutritionnels via l'algorithme Mifflin-St Jeor + Morton 2018 + ANSES 2019.
--
-- Met aussi à jour la RLS de nutrition_goals pour permettre au client
-- de sauvegarder ses propres objectifs auto-calculés.
-- ============================================================================

-- Données physiques du client
ALTER TABLE public.nutrition_profile
  ADD COLUMN IF NOT EXISTS sexe              text,              -- 'homme' | 'femme'
  ADD COLUMN IF NOT EXISTS age_ans           integer,
  ADD COLUMN IF NOT EXISTS taille_cm         numeric(5,1),
  ADD COLUMN IF NOT EXISTS poids_kg          numeric(5,1),
  ADD COLUMN IF NOT EXISTS objectif_physique text,              -- 'masse' | 'perte' | 'maintien' | 'recomposition'
  ADD COLUMN IF NOT EXISTS niveau_activite   text,              -- 'sedentaire' | 'leger' | 'modere' | 'actif' | 'tres_actif'
  ADD COLUMN IF NOT EXISTS goals_source      text DEFAULT 'coach'; -- 'coach' | 'auto'

-- Permettre au client de créer et modifier ses propres objectifs nutritionnels.
-- Auparavant réservé au coach uniquement.
DROP POLICY IF EXISTS "ng_write" ON public.nutrition_goals;

CREATE POLICY "ng_write"
  ON public.nutrition_goals FOR ALL
  USING  (client_id = public.current_client_id() OR public.is_coach())
  WITH CHECK (client_id = public.current_client_id() OR public.is_coach());
