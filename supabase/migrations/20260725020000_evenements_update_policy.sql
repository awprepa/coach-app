-- Il n'existait aucune policy RLS d'UPDATE sur evenements pour les clients :
-- toute tentative de mise à jour (ex: semaine_override lors d'un rattrapage)
-- était donc silencieusement bloquée (0 ligne affectée, sans erreur renvoyée
-- par PostgREST). On ajoute une policy symétrique à celles d'insert/delete.
create policy client_update_own_evenements on evenements
  for update
  using (client_id = current_client_id() and source = 'client')
  with check (client_id = current_client_id() and source = 'client');
