-- ═══════════════════════════════════════════════════════════════════════════
-- Calendrier saison — refonte des types d'évènement
-- ─────────────────────────────────────────────────────────────────────────────
-- Nouveaux types côté UI : Entraînement (+ style libre), Match (+ catégorie),
-- Musculation. On garde les anciens types pour compatibilité des données
-- existantes, et on ajoute 'entrainement' à la contrainte.
--   • style     : libellé libre du style d'entraînement (ex. « Vitesse »,
--                 « Collectif », « Prévention »…)
--   • categorie : pour les matchs (Amical / Championnat / Coupe / Phases finales)
-- Idempotent : peut être ré-exécuté sans erreur.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Nouvelles colonnes ─────────────────────────────────────────────────────────
ALTER TABLE public.groupe_evenements
  ADD COLUMN IF NOT EXISTS style     text,
  ADD COLUMN IF NOT EXISTS categorie text;

-- ── Mise à jour de la contrainte de type (ajout de 'entrainement') ─────────────
ALTER TABLE public.groupe_evenements
  DROP CONSTRAINT IF EXISTS groupe_evenements_type_check;

ALTER TABLE public.groupe_evenements
  ADD CONSTRAINT groupe_evenements_type_check
  CHECK (type IN (
    'match','entrainement','muscu',
    'collectif','vitesse','prevention','recup','test','autre'
  ));
