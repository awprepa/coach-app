-- ─────────────────────────────────────────────────────────────────────────────
-- Exercices et séries pour les séances ponctuelles (ajoutées par le client)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seances_libres_exercices (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  evenement_id  uuid        NOT NULL REFERENCES public.evenements(id) ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES public.clients(id)   ON DELETE CASCADE,
  nom           text        NOT NULL,
  ordre         int         NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seances_libres_series (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  exercice_id   uuid        NOT NULL REFERENCES public.seances_libres_exercices(id) ON DELETE CASCADE,
  num_serie     int         NOT NULL DEFAULT 1,
  poids         numeric,
  reps          int,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (exercice_id, num_serie)
);

ALTER TABLE public.seances_libres_exercices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seances_libres_series    ENABLE ROW LEVEL SECURITY;

-- Client : CRUD sur ses propres exercices
CREATE POLICY "client_crud_seances_libres_exercices" ON public.seances_libres_exercices
  USING  (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());

-- Client : CRUD sur ses propres séries (via exercice → client)
CREATE POLICY "client_crud_seances_libres_series" ON public.seances_libres_series
  USING  (exercice_id IN (
    SELECT id FROM public.seances_libres_exercices WHERE client_id = current_client_id()
  ))
  WITH CHECK (exercice_id IN (
    SELECT id FROM public.seances_libres_exercices WHERE client_id = current_client_id()
  ));

-- Coach : lecture de toutes les séances libres
CREATE POLICY "coach_read_seances_libres_exercices" ON public.seances_libres_exercices
  FOR SELECT USING (public.is_coach());

CREATE POLICY "coach_read_seances_libres_series" ON public.seances_libres_series
  FOR SELECT USING (
    exercice_id IN (SELECT id FROM public.seances_libres_exercices)
    AND public.is_coach()
  );
