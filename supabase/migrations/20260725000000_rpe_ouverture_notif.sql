-- Marque si le coach a déjà été notifié que la notation RPE est ouverte
-- pour cet entraînement de groupe (évite les doublons entre deux passages du cron).
alter table groupe_evenements
  add column if not exists rpe_ouverture_notifiee boolean not null default false;
