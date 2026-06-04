-- ── Intégration FFR / monclubhouse.ffr.fr ─────────────────────────────────────
-- Ajoute le lien monclubhouse sur les groupes (optionnel)
ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS monclubhouse_url TEXT;

-- ── Matchs FFR (synchronisés depuis monclubhouse.ffr.fr) ──────────────────────
CREATE TABLE IF NOT EXISTS public.matchs_ffr (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  groupe_id    UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  journee      TEXT,
  date_match   DATE,
  heure        TEXT,
  equipe_dom   TEXT        NOT NULL DEFAULT '',
  equipe_ext   TEXT        NOT NULL DEFAULT '',
  score_dom    INTEGER,
  score_ext    INTEGER,
  est_domicile BOOLEAN,
  synced_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(groupe_id, date_match, equipe_dom, equipe_ext)
);

ALTER TABLE public.matchs_ffr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_matchs_ffr" ON public.matchs_ffr
  FOR ALL USING (public.is_coach());

-- ── Classement FFR (synchronisé depuis monclubhouse.ffr.fr) ──────────────────
CREATE TABLE IF NOT EXISTS public.classements_ffr (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  groupe_id  UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  position   INTEGER     NOT NULL DEFAULT 0,
  equipe     TEXT        NOT NULL DEFAULT '',
  pts        INTEGER     DEFAULT 0,
  joues      INTEGER     DEFAULT 0,
  diff       INTEGER     DEFAULT 0,
  gagnes     INTEGER     DEFAULT 0,
  nuls       INTEGER     DEFAULT 0,
  perdus     INTEGER     DEFAULT 0,
  bonus_off  INTEGER     DEFAULT 0,
  bonus_def  INTEGER     DEFAULT 0,
  synced_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(groupe_id, equipe)
);

ALTER TABLE public.classements_ffr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_classements_ffr" ON public.classements_ffr
  FOR ALL USING (public.is_coach());
