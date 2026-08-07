ALTER TABLE public.nutrition_scan_history
  ADD COLUMN IF NOT EXISTS sugar_100g numeric,
  ADD COLUMN IF NOT EXISTS satfat_100g numeric;
