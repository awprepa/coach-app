-- Informations complémentaires que le client peut remplir lui-même
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS date_naissance DATE,
  ADD COLUMN IF NOT EXISTS telephone      TEXT;

-- Poste par groupe (pour le rugby et autres sports collectifs)
ALTER TABLE public.groupe_membres
  ADD COLUMN IF NOT EXISTS poste TEXT;

-- Permettre au client de mettre à jour ses propres infos de base
-- (la politique UPDATE existante couvre déjà avatar_url, on la réutilise)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'clients can update own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clients can update own profile" ON public.clients
        FOR UPDATE
        USING  (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- Permettre au client de lire et modifier son propre poste dans groupe_membres
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'groupe_membres' AND policyname = 'membres can update own poste'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "membres can update own poste" ON public.groupe_membres
        FOR UPDATE
        USING  (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
        WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
    $policy$;
  END IF;
END $$;
