-- Sauvegarde complète dans les templates : échauffement + RPE cibles
ALTER TABLE seance_templates
  ADD COLUMN IF NOT EXISTS echauffement jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rpe_cibles   jsonb DEFAULT '{}'::jsonb;

ALTER TABLE programme_template_seances
  ADD COLUMN IF NOT EXISTS echauffement jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rpe_cibles   jsonb DEFAULT '{}'::jsonb;
