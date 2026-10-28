-- Les séances des cycles de la bibliothèque gardent leur type (musculation /
-- terrain) : sans cette colonne, une séance terrain envoyée à un client
-- redevenait une séance de musculation.
alter table public.programme_template_seances
  add column if not exists type text not null default 'musculation'
  check (type in ('musculation', 'terrain'));
