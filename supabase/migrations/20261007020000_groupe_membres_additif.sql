-- Jusqu'ici, ajouter un joueur à un sous-groupe le retirait du groupe
-- principal (transfert destructif) -- voir FicheGroupe.js,
-- transfererMembresSelectionnes(). Corrigé côté application pour devenir
-- additif : un joueur reste membre du groupe principal en plus d'appartenir
-- à un ou plusieurs sous-groupes.
--
-- Cette migration rattrape les joueurs déjà transférés dans le passé : pour
-- chaque appartenance à un sous-groupe, on recrée l'appartenance manquante au
-- groupe parent, pour qu'ils réapparaissent dans son effectif et son
-- calendrier. Rejouée en boucle (tant qu'elle insère encore des lignes) pour
-- remonter toute la hiérarchie d'un coup, quelle que soit sa profondeur —
-- utile ici où la structure a 3 niveaux (club > équipe > sous-groupe).
do $$
declare
  inserted int;
begin
  loop
    insert into groupe_membres (groupe_id, client_id)
    select g.parent_id, gm.client_id
    from groupe_membres gm
    join groupes g on g.id = gm.groupe_id
    where g.parent_id is not null
    and not exists (
      select 1 from groupe_membres gm2
      where gm2.groupe_id = g.parent_id and gm2.client_id = gm.client_id
    );
    get diagnostics inserted = row_count;
    exit when inserted = 0;
  end loop;
end $$;
