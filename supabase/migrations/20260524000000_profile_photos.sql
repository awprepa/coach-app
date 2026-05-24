-- Colonne avatar_url sur les clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Bucket pour les photos de profil (public pour accès URL direct)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage : chaque client peut uploader/lire sa propre photo
CREATE POLICY "Client can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.clients WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Client can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.clients WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Anyone can read profile photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');

-- Coach peut tout gérer (pour sa propre photo dans app_settings)
CREATE POLICY "Coach can manage all profile photos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_coach());
