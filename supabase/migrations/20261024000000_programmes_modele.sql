-- Lien entre un programme envoyé à un client et le cycle modèle de la
-- bibliothèque dont il vient, pour pouvoir lui ajouter plus tard les séances
-- ajoutées au modèle (sans toucher à ce que le client a déjà rempli).
alter table public.programmes
  add column if not exists modele_id uuid references public.programme_templates(id) on delete set null;

-- Rattachement des programmes déjà envoyés : même nom que le modèle (les noms
-- de modèles sont uniques), programme de client, créé après le modèle.
update public.programmes p set modele_id = t.id
from public.programme_templates t
where p.modele_id is null and p.client_id is not null and p.groupe_id is null
  and p.nom = t.nom and p.created_at >= t.created_at;
