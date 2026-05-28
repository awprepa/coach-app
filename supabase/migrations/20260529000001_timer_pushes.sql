-- Table pour les pushs de fin de récupération programmés côté serveur
-- L'app insère une ligne au démarrage du chrono ; une cron Edge Function l'envoie à l'heure pile

CREATE TABLE IF NOT EXISTS timer_pushes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,                    -- auth.uid() du client
  seance_id  uuid,                             -- pour annuler si l'on stoppe le chrono
  send_at    timestamptz NOT NULL,             -- quand envoyer
  sent_at    timestamptz,                      -- null = pas encore envoyé
  titre      text NOT NULL DEFAULT '🔔 Récupération terminée',
  corps      text NOT NULL DEFAULT 'C''est reparti !',
  lien       text NOT NULL DEFAULT '/',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timer_pushes ENABLE ROW LEVEL SECURITY;

-- Le client peut créer ses propres lignes
CREATE POLICY "timer_pushes_insert" ON timer_pushes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Le client peut supprimer ses propres lignes (annuler le chrono)
CREATE POLICY "timer_pushes_delete" ON timer_pushes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Le service role peut tout faire (utilisé par la Edge Function cron)
CREATE POLICY "timer_pushes_service_all" ON timer_pushes
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Nettoyage automatique : supprimer les lignes envoyées depuis plus de 24h
CREATE OR REPLACE FUNCTION cleanup_timer_pushes()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM timer_pushes
  WHERE sent_at IS NOT NULL AND sent_at < now() - interval '24 hours';
$$;
