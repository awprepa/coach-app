-- Permettre aux clients de lire les événements des groupes dont ils sont membres
-- (type + titre uniquement visible côté client — pas de contenu blocs/exercices)
CREATE POLICY "client_read_groupe_evenements"
  ON public.groupe_evenements
  FOR SELECT
  USING (
    groupe_id IN (
      SELECT groupe_id
      FROM public.groupe_membres
      WHERE client_id = public.current_client_id()
    )
  );
