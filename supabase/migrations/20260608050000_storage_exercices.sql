-- Bucket public pour les médias des exercices (images, GIFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercices', 'exercices', true)
ON CONFLICT (id) DO NOTHING;

-- Le coach peut tout faire (upload / delete)
DROP POLICY IF EXISTS "exercices_coach_all" ON storage.objects;
CREATE POLICY "exercices_coach_all"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'exercices' AND public.is_coach())
  WITH CHECK (bucket_id = 'exercices' AND public.is_coach());

-- Tout le monde peut lire (public = true suffit, mais on met quand même la policy SELECT)
DROP POLICY IF EXISTS "exercices_public_read" ON storage.objects;
CREATE POLICY "exercices_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exercices');
