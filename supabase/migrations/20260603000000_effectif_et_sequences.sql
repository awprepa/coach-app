-- ══ EFFECTIF ══

CREATE TABLE public.groupe_joueurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  prenom text NOT NULL,
  nom text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.joueur_postes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  joueur_id uuid NOT NULL REFERENCES public.groupe_joueurs(id) ON DELETE CASCADE,
  poste smallint NOT NULL CHECK (poste BETWEEN 1 AND 15),
  rang smallint NOT NULL DEFAULT 1,  -- 1=titulaire, 2=remplaçant, etc.
  is_primary boolean DEFAULT true
);

CREATE TABLE public.joueur_blessures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  joueur_id uuid NOT NULL REFERENCES public.groupe_joueurs(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'ok' CHECK (statut IN ('ok','cond','out')),
  description text,
  duree_estimee text,
  restrictions jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(joueur_id)
);

-- RLS
ALTER TABLE public.groupe_joueurs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.joueur_postes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.joueur_blessures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_all_joueurs"   ON public.groupe_joueurs   FOR ALL USING (public.is_coach());
CREATE POLICY "coach_all_postes"    ON public.joueur_postes    FOR ALL USING (public.is_coach());
CREATE POLICY "coach_all_blessures" ON public.joueur_blessures FOR ALL USING (public.is_coach());

-- Auto-link: quand client créé avec même prenom+nom qu'un joueur existant
CREATE OR REPLACE FUNCTION public.auto_link_joueur_client()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.groupe_joueurs
  SET client_id = NEW.id
  WHERE client_id IS NULL
    AND lower(trim(prenom)) = lower(trim(NEW.prenom))
    AND lower(trim(nom))    = lower(trim(NEW.nom));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_link_joueur
  AFTER INSERT OR UPDATE OF prenom, nom ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_joueur_client();

-- Index
CREATE INDEX ON public.groupe_joueurs(groupe_id);
CREATE INDEX ON public.joueur_postes(joueur_id);
CREATE INDEX ON public.joueur_blessures(joueur_id);

-- ══ SÉQUENCES DE JEU ══

ALTER TABLE public.groupe_seance_blocs
  ADD COLUMN IF NOT EXISTS bloc_type text NOT NULL DEFAULT 'standard' CHECK (bloc_type IN ('standard','sequences')),
  ADD COLUMN IF NOT EXISTS conditions_jeu text,
  ADD COLUMN IF NOT EXISTS recup_inter_seq text,
  ADD COLUMN IF NOT EXISTS effectif_desc text;

CREATE TABLE public.groupe_seance_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloc_id uuid NOT NULL REFERENCES public.groupe_seance_blocs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('jeu','recup')),
  theme text,           -- "FIGHT", "CONDITIONNÉ", etc.
  duree_sec integer,    -- durée en secondes (ex: 90 pour 1'30)
  ordre smallint NOT NULL DEFAULT 0
);

ALTER TABLE public.groupe_seance_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_all_sequences" ON public.groupe_seance_sequences FOR ALL USING (public.is_coach());
CREATE INDEX ON public.groupe_seance_sequences(bloc_id);
