-- Templates de séances que les clients peuvent créer et réutiliser
CREATE TABLE IF NOT EXISTS public.seances_libres_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Exercices d'un template (structure cible)
CREATE TABLE IF NOT EXISTS public.template_exercices (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.seances_libres_templates(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  ordre       INT  NOT NULL DEFAULT 1
);

-- Séries cibles d'un exercice de template
CREATE TABLE IF NOT EXISTS public.template_series (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exercice_id UUID NOT NULL REFERENCES public.template_exercices(id) ON DELETE CASCADE,
  num_serie   INT  NOT NULL,
  poids       NUMERIC,
  reps        INT
);

-- RLS
ALTER TABLE public.seances_libres_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_exercices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_series           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client own templates"
  ON public.seances_libres_templates FOR ALL
  USING  (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "client own template_exercices"
  ON public.template_exercices FOR ALL
  USING  (template_id IN (
    SELECT id FROM public.seances_libres_templates
    WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM public.seances_libres_templates
    WHERE client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  ));

CREATE POLICY "client own template_series"
  ON public.template_series FOR ALL
  USING  (exercice_id IN (
    SELECT te.id FROM public.template_exercices te
    JOIN public.seances_libres_templates t ON t.id = te.template_id
    WHERE t.client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  ))
  WITH CHECK (exercice_id IN (
    SELECT te.id FROM public.template_exercices te
    JOIN public.seances_libres_templates t ON t.id = te.template_id
    WHERE t.client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  ));

-- Permettre aux clients de lire la bibliothèque d'exercices du coach
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bibliotheque_exercices' AND policyname = 'clients can read bibliotheque'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clients can read bibliotheque" ON public.bibliotheque_exercices
        FOR SELECT USING (auth.role() = 'authenticated')
    $policy$;
  END IF;
END $$;
