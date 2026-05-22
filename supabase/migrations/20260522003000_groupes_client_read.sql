-- Permettre aux clients de lire leur propre appartenance à un groupe
CREATE POLICY "client_read_groupe_membres"
  ON public.groupe_membres
  FOR SELECT
  USING (client_id = public.current_client_id());

-- Permettre aux clients de lire les infos du groupe dont ils sont membres
CREATE POLICY "client_read_groupes"
  ON public.groupes
  FOR SELECT
  USING (
    id IN (
      SELECT groupe_id
      FROM public.groupe_membres
      WHERE client_id = public.current_client_id()
    )
  );
