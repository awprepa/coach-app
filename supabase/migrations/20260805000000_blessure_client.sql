-- Permet au joueur (client) de déclarer lui-même une blessure sur sa propre
-- fiche joueur_blessures, en plus du coach qui gère déjà tout via coach_all_blessures.

CREATE POLICY "client_own_blessure_select" ON public.joueur_blessures
  FOR SELECT
  USING (
    joueur_id IN (
      SELECT id FROM public.groupe_joueurs WHERE client_id = public.current_client_id()
    )
  );

CREATE POLICY "client_own_blessure_upsert" ON public.joueur_blessures
  FOR INSERT
  WITH CHECK (
    joueur_id IN (
      SELECT id FROM public.groupe_joueurs WHERE client_id = public.current_client_id()
    )
  );

CREATE POLICY "client_own_blessure_update" ON public.joueur_blessures
  FOR UPDATE
  USING (
    joueur_id IN (
      SELECT id FROM public.groupe_joueurs WHERE client_id = public.current_client_id()
    )
  )
  WITH CHECK (
    joueur_id IN (
      SELECT id FROM public.groupe_joueurs WHERE client_id = public.current_client_id()
    )
  );
