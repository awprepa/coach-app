-- Permet de filtrer la synchro FFR sur une compétition précise quand un même
-- club a plusieurs équipes (ex: seniors "federale-2" et espoirs "federale-b...")
-- dans les mêmes pages calendrier/classement du club.

ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS monclubhouse_competition text;
