-- Permet à un événement calendrier (séance de programme) de se rattacher à une
-- semaine du cycle différente de celle calculée à partir de sa date réelle —
-- utilisé pour le rattrapage : le joueur fait sa séance un jour qui tombe en
-- semaine 4 par le calendrier, mais veut que les charges comptent pour la
-- semaine 3. Sans cette colonne, cliquer sur ce jour rouvrait toujours la
-- séance sur la semaine calculée par date, ignorant le rattrapage.
alter table evenements
  add column if not exists semaine_override integer;
