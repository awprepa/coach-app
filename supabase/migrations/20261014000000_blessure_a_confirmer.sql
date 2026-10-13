-- Blessures signalées par le joueur lui-même : à confirmer par le coach.
-- Le coach les voit dans « Signalements à confirmer » (suivi blessures du groupe)
-- et les confirme ou les ignore. Les épisodes existants ne sont pas concernés.
alter table public.joueur_blessures
  add column if not exists a_confirmer boolean not null default false;
