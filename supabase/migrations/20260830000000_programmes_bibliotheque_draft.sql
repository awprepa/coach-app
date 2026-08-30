-- Un "brouillon bibliothèque" est un programme sans client ni groupe, utilisé
-- uniquement pour éditer un cycle de la bibliothèque avec le vrai éditeur
-- (Programme.js / Seance.js) au lieu de l'éditeur simplifié de CycleTemplates.js.
-- Supprimer le template supprime automatiquement son brouillon (cascade).
ALTER TABLE public.programmes
  ADD COLUMN IF NOT EXISTS bibliotheque_template_id uuid REFERENCES public.programme_templates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_programmes_bibliotheque_template_id
  ON public.programmes(bibliotheque_template_id) WHERE bibliotheque_template_id IS NOT NULL;
