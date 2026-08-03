-- Âge / taille / poids pour le profil joueur du roster. Ces champs sont un
-- filet de sécurité pour les joueurs sans compte client lié (donc sans
-- nutrition_profile / date_naissance accessibles) — coach-éditables, et
-- affichés seulement en fallback si le joueur a un compte avec ces infos
-- déjà renseignées ailleurs.
alter table public.groupe_joueurs
  add column if not exists date_naissance date,
  add column if not exists taille_cm numeric,
  add column if not exists poids_kg numeric;
