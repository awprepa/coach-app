-- ══ Table de composition nutritionnelle CIQUAL (ANSES) ══
-- Référentiel public d'aliments génériques français : c'est LUI qui fournit les
-- calories et macros, jamais un modèle d'IA. Complété par Open Food Facts pour
-- les produits de marque (le skyr, par exemple, est absent de CIQUAL).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.ciqual_aliments (
  code        integer PRIMARY KEY,          -- alim_code CIQUAL
  nom         text    NOT NULL,
  groupe      text,
  sous_groupe text,
  -- pour 100 g
  kcal        numeric(7,1) NOT NULL,
  proteines   numeric(6,2),
  glucides    numeric(6,2),
  lipides     numeric(6,2),
  sucres      numeric(6,2),
  fibres      numeric(6,2),
  satures     numeric(6,2),
  sel         numeric(6,2)
);

-- Recherche plein texte française + tolérance aux fautes de frappe
CREATE INDEX IF NOT EXISTS idx_ciqual_fts
  ON public.ciqual_aliments USING gin (to_tsvector('french', nom));
CREATE INDEX IF NOT EXISTS idx_ciqual_trgm
  ON public.ciqual_aliments USING gin (nom gin_trgm_ops);

-- Donnée de référence publique : lecture pour tout utilisateur authentifié,
-- écriture réservée au coach (import/maintenance).
ALTER TABLE public.ciqual_aliments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ciqual_lecture" ON public.ciqual_aliments;
CREATE POLICY "ciqual_lecture" ON public.ciqual_aliments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ciqual_ecriture_coach" ON public.ciqual_aliments;
CREATE POLICY "ciqual_ecriture_coach" ON public.ciqual_aliments
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());

-- ── Portions courantes ──────────────────────────────────────────────────────
-- « une banane » → 120 g. Table maison : plus fiable que de laisser l'IA
-- deviner, et corrigeable à la main.
CREATE TABLE IF NOT EXISTS public.portions_usuelles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motif       text NOT NULL,          -- fragment de nom d'aliment à reconnaître
  unite       text NOT NULL,          -- 'unite' | 'cuillere_soupe' | 'carre'…
  grammes     numeric(6,1) NOT NULL,
  libelle     text NOT NULL,          -- affiché : « cuillère à soupe »
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.portions_usuelles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portions_lecture" ON public.portions_usuelles;
CREATE POLICY "portions_lecture" ON public.portions_usuelles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "portions_ecriture_coach" ON public.portions_usuelles;
CREATE POLICY "portions_ecriture_coach" ON public.portions_usuelles
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());
