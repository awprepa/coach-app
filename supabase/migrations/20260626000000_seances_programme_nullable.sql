-- Permettre la création de séances sans programme (mode bibliothèque)
ALTER TABLE public.seances ALTER COLUMN programme_id DROP NOT NULL;
