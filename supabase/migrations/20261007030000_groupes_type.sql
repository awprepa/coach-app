-- Distingue les trois niveaux de la hiérarchie club > équipe > sous-groupe,
-- jusqu'ici indiscernables (seul `parent_id` existait). Un club est un simple
-- "lobby" d'affichage qui regroupe ses équipes (logo + nom) : il n'a jamais
-- de membres propres dans `groupe_membres`. Une équipe est un vrai groupe
-- (roster, calendrier, programmes). Un sous-groupe est un découpage
-- additif à l'intérieur d'une équipe (ex. postes).
alter table groupes
  add column if not exists type text check (type in ('club', 'equipe', 'sous_groupe'));

-- Racine (parent_id null) : 'club' si elle a au moins un petit-enfant
-- (structure à 3 niveaux), sinon 'equipe' (équipe autonome sans club).
update groupes g0 set type = 'club'
where g0.parent_id is null
and exists (
  select 1 from groupes g1 join groupes g2 on g2.parent_id = g1.id
  where g1.parent_id = g0.id
);

update groupes set type = 'equipe'
where parent_id is null and type is null;

-- Niveau 1 (parent_id défini, dont le parent est racine) : équipe.
update groupes g1 set type = 'equipe'
where g1.type is null
and exists (select 1 from groupes g0 where g0.id = g1.parent_id and g0.parent_id is null);

-- Niveau 2 (parent du parent existe) : sous-groupe.
update groupes g2 set type = 'sous_groupe'
where g2.type is null
and exists (select 1 from groupes g1 where g1.id = g2.parent_id and g1.parent_id is not null);

-- Un club ne doit jamais avoir de membres propres : purge les éventuelles
-- lignes groupe_membres rattachées directement à un groupe de type 'club'
-- (notamment celles ajoutées par le rattrapage additif de la migration
-- précédente, qui remontait par erreur jusqu'au club).
delete from groupe_membres gm
using groupes g
where g.id = gm.groupe_id and g.type = 'club';
