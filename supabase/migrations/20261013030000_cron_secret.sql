-- Tâches planifiées : authentification par un secret partagé (Vault
-- 'cron_secret' ↔ secret de fonction CRON_SECRET) au lieu de la clé publique.
-- Corrige aussi process-timer-pushes (erreur de syntaxe : échouait chaque minute)
-- et fait pointer le rappel du matin vers send-wellness-reminder (version à jour).
select cron.schedule('process-timer-pushes', '* * * * *', $cmd$
  select net.http_post(
    url := 'https://ytdqyhajqxnmkwxehwmg.supabase.co/functions/v1/process-timer-pushes',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$cmd$);
select cron.schedule('rpe-window-notify', '*/15 * * * *', $cmd$
  select net.http_post(
    url := 'https://ytdqyhajqxnmkwxehwmg.supabase.co/functions/v1/rpe-window-notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$cmd$);
select cron.schedule('wellness-morning-reminder', '0 4 * * *', $cmd$
  select net.http_post(
    url := 'https://ytdqyhajqxnmkwxehwmg.supabase.co/functions/v1/send-wellness-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$cmd$);
