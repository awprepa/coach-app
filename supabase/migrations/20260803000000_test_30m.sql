-- Ajoute le sprint 30m comme type de test physique valide, au même titre
-- que vmi/vma (import de la feuille de tests papier du 17/07).
alter table public.joueur_tests_physiques drop constraint joueur_tests_physiques_type_check;
alter table public.joueur_tests_physiques add constraint joueur_tests_physiques_type_check
  check (type in ('vmi', 'vma', '30m'));
