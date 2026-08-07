-- Enrichit la déclaration de blessure : zone du corps, niveau d'aptitude,
-- et date de retour prévue calculée à partir du texte de durée saisi par
-- le joueur (ex : "2 semaines" → aujourd'hui + 14 jours). La date reste
-- modifiable manuellement ensuite (la blessure peut évoluer).

ALTER TABLE public.joueur_blessures
  ADD COLUMN IF NOT EXISTS zone text CHECK (zone IN ('haut','bas','general')),
  ADD COLUMN IF NOT EXISTS niveau text CHECK (niveau IN ('sans_contact','course_seule','repos_total')),
  ADD COLUMN IF NOT EXISTS date_retour_prevue date;
