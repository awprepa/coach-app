-- ═══════════════════════════════════════════════════════════════════════════
-- Calendrier saison par groupe (préparateur physique)
-- ─────────────────────────────────────────────────────────────────────────────
-- Vue saison (mois × jours) avec matchs comme repères, séances de prépa
-- détaillées en blocs → exercices, phases de saison et vacances.
-- Tout est rattaché à un GROUPE (pas à un client individuel).
-- Accès : coach uniquement (helper public.is_coach()).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Évènements du groupe ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupe_evenements (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  groupe_id   uuid        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  heure       time,
  -- match | collectif | muscu | vitesse | prevention | recup | test | autre
  type        text        NOT NULL DEFAULT 'autre'
                          CHECK (type IN ('match','collectif','muscu','vitesse','prevention','recup','test','autre')),
  titre       text,
  -- spécifiques match :
  adversaire  text,
  domicile    boolean,                 -- true = domicile, false = extérieur
  journee     text,                    -- 'J1', '1/4', 'Amical'…
  -- détails séance :
  lieu        text,
  duree_min   int,
  charge      text,                    -- 'Faible' | 'Modérée' | 'Haute' | 'Compét.'…
  note        text,
  terminee    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groupe_evenements_groupe_date
  ON public.groupe_evenements (groupe_id, date);

ALTER TABLE public.groupe_evenements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupe_evenements" ON public.groupe_evenements
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());

-- ── Blocs d'une séance (déroulé chronologique) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupe_seance_blocs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  evenement_id  uuid        NOT NULL REFERENCES public.groupe_evenements(id) ON DELETE CASCADE,
  nom           text        NOT NULL,             -- 'Échauffement', 'Force principale'…
  duree         text,                             -- '10 min', '30 min'…
  ordre         int         NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groupe_seance_blocs_evt
  ON public.groupe_seance_blocs (evenement_id, ordre);

ALTER TABLE public.groupe_seance_blocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupe_seance_blocs" ON public.groupe_seance_blocs
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());

-- ── Exercices / ateliers d'un bloc ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupe_seance_exercices (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  bloc_id       uuid        NOT NULL REFERENCES public.groupe_seance_blocs(id) ON DELETE CASCADE,
  nom           text        NOT NULL,             -- 'Squat barre'
  prescription  text,                             -- '5 × 4 @ 85 %'
  detail        text,                             -- 'Récup 3 min'
  ordre         int         NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groupe_seance_exercices_bloc
  ON public.groupe_seance_exercices (bloc_id, ordre);

ALTER TABLE public.groupe_seance_exercices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupe_seance_exercices" ON public.groupe_seance_exercices
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());

-- ── Phases de saison + vacances (bandeaux du calendrier) ───────────────────────
CREATE TABLE IF NOT EXISTS public.groupe_phases (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  groupe_id   uuid        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  -- 'phase' = bandeau coloré horizontal | 'vacances' = plage de jours grisée
  type        text        NOT NULL DEFAULT 'phase' CHECK (type IN ('phase','vacances')),
  label       text        NOT NULL,
  couleur     text,                               -- pour les phases (sinon teinte vacances par défaut)
  date_debut  date        NOT NULL,
  date_fin    date        NOT NULL,
  ordre       int         NOT NULL DEFAULT 1,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groupe_phases_groupe
  ON public.groupe_phases (groupe_id, date_debut);

ALTER TABLE public.groupe_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupe_phases" ON public.groupe_phases
  FOR ALL USING (public.is_coach()) WITH CHECK (public.is_coach());
