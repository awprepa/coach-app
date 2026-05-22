-- ── Groupes (clubs / équipes) ─────────────────────────────────────────────────
-- Arbre illimité via parent_id (self-reference)
CREATE TABLE IF NOT EXISTS public.groupes (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        text        NOT NULL,
  couleur    text        NOT NULL DEFAULT '#6366f1',
  logo_url   text,
  parent_id  uuid        REFERENCES public.groupes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.groupes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupes" ON public.groupes
  FOR ALL USING (public.is_coach());

-- ── Membres d'un groupe ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupe_membres (
  groupe_id  uuid NOT NULL REFERENCES public.groupes(id)  ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
  PRIMARY KEY (groupe_id, client_id)
);

ALTER TABLE public.groupe_membres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_groupe_membres" ON public.groupe_membres
  FOR ALL USING (public.is_coach());

-- ── Colonnes sur programmes ────────────────────────────────────────────────────
-- groupe_id  : programme appartenant à un groupe (template)
-- template_id: copie individuelle issue d'un template de groupe
ALTER TABLE public.programmes
  ADD COLUMN IF NOT EXISTS groupe_id   uuid REFERENCES public.groupes(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.programmes(id) ON DELETE SET NULL;
