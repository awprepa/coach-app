-- Course ajoutée par le joueur dans son calendrier : données lues dans son
-- fichier GPX/TCX (distance, durée, dénivelé, fréquence cardiaque, tracé
-- simplifié) et lien Strava facultatif. Le fichier lui-même n'est pas stocké.
alter table public.evenements add column if not exists activite jsonb;
