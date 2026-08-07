-- Permet à un client de se créer lui-même une fiche joueur (groupe_joueurs)
-- dans un groupe dont il est membre, s'il n'en a pas encore une. Nécessaire
-- pour que le bouton "Déclarer une blessure" du profil client fonctionne
-- immédiatement, sans dépendre d'une action préalable du coach.

CREATE POLICY "client_self_provision_joueur" ON public.groupe_joueurs
  FOR INSERT
  WITH CHECK (
    client_id = public.current_client_id()
    AND groupe_id IN (
      SELECT groupe_id FROM public.groupe_membres WHERE client_id = public.current_client_id()
    )
  );

CREATE POLICY "client_own_joueur_select" ON public.groupe_joueurs
  FOR SELECT
  USING (client_id = public.current_client_id());
