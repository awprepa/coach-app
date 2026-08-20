-- Ajoute le type '50m' aux tests physiques suivis par joueur
alter table public.joueur_tests_physiques drop constraint joueur_tests_physiques_type_check;
alter table public.joueur_tests_physiques add constraint joueur_tests_physiques_type_check
  check (type in ('vmi', 'vma', '30m', '50m'));
