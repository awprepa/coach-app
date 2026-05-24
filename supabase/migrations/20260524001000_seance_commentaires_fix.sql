-- ─── seance_commentaires : contrainte unique + RLS clients ─────────────────
-- Contexte : la fonction saveCommentaire utilise upsert avec onConflict:'seance_id,semaine'
-- mais cela nécessite une contrainte UNIQUE réelle en base. Sans elle, le upsert
-- insère simplement de nouveaux doublons et la note n'est pas retrouvée au rechargement.

-- 1. Contrainte UNIQUE (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seance_commentaires_seance_id_semaine_key'
      AND conrelid = 'public.seance_commentaires'::regclass
  ) THEN
    ALTER TABLE public.seance_commentaires
      ADD CONSTRAINT seance_commentaires_seance_id_semaine_key
      UNIQUE (seance_id, semaine);
  END IF;
END $$;

-- 2. Activer RLS si pas encore fait
ALTER TABLE public.seance_commentaires ENABLE ROW LEVEL SECURITY;

-- 3. Politique d'accès : coach peut tout lire/écrire
DROP POLICY IF EXISTS "coach_all_commentaires" ON public.seance_commentaires;
CREATE POLICY "coach_all_commentaires" ON public.seance_commentaires
  FOR ALL TO authenticated
  USING  (auth.uid() = (SELECT value::uuid FROM app_settings WHERE key = 'coach_user_id'))
  WITH CHECK (auth.uid() = (SELECT value::uuid FROM app_settings WHERE key = 'coach_user_id'));

-- 4. Politique d'accès : client peut lire et écrire ses propres commentaires
DROP POLICY IF EXISTS "client_own_commentaires" ON public.seance_commentaires;
CREATE POLICY "client_own_commentaires" ON public.seance_commentaires
  FOR ALL TO authenticated
  USING (
    seance_id IN (
      SELECT s.id FROM seances s
      JOIN programmes p ON s.programme_id = p.id
      JOIN clients c    ON p.client_id    = c.id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    seance_id IN (
      SELECT s.id FROM seances s
      JOIN programmes p ON s.programme_id = p.id
      JOIN clients c    ON p.client_id    = c.id
      WHERE c.user_id = auth.uid()
    )
  );
