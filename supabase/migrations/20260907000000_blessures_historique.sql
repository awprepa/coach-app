-- Passage de joueur_blessures d'"une ligne = l'état courant du joueur" (écrasée
-- à chaque déclaration) à "une ligne = un épisode de blessure" : nécessaire
-- pour avoir un vrai historique (récidives, durées, stats de saison) sur la
-- nouvelle page "Suivi blessures".
ALTER TABLE public.joueur_blessures
  DROP CONSTRAINT IF EXISTS joueur_blessures_joueur_id_key;

ALTER TABLE public.joueur_blessures
  ADD COLUMN IF NOT EXISTS date_debut date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS date_fin_reelle date,
  ADD COLUMN IF NOT EXISTS mecanisme text,
  ADD COLUMN IF NOT EXISTS zone_precise text,
  ADD COLUMN IF NOT EXISTS type_lesion text,
  ADD COLUMN IF NOT EXISTS gravite text;

ALTER TABLE public.joueur_blessures
  ADD CONSTRAINT joueur_blessures_mecanisme_check
    CHECK (mecanisme IS NULL OR mecanisme IN ('contact', 'non_contact'));

ALTER TABLE public.joueur_blessures
  ADD CONSTRAINT joueur_blessures_gravite_check
    CHECK (gravite IS NULL OR gravite IN ('grade_1', 'grade_2', 'grade_3'));

-- Ajoute le 4e palier "entraînement complet" (le 5e, "apte match", est
-- représenté par statut='ok', pas par une valeur de niveau).
ALTER TABLE public.joueur_blessures DROP CONSTRAINT IF EXISTS joueur_blessures_niveau_check;
ALTER TABLE public.joueur_blessures
  ADD CONSTRAINT joueur_blessures_niveau_check
    CHECK (niveau IS NULL OR niveau IN ('repos_total', 'course_seule', 'sans_contact', 'entrainement_complet'));

-- Backfill : pour les lignes existantes (déclarées avant ce changement),
-- on n'a pas de vraie date de survenue — on utilise la date de dernière
-- mise à jour comme meilleure approximation disponible.
UPDATE public.joueur_blessures SET date_debut = updated_at::date WHERE date_debut = CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_joueur_blessures_joueur_id ON public.joueur_blessures(joueur_id);
