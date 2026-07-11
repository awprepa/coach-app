-- Sécurité : ces 3 tables avaient la RLS DÉSACTIVÉE (accessibles publiquement).
-- Elles ne sont utilisées que côté coach (paiements, modèles de cycles).
-- On active la RLS + une policy coach uniquement.

-- Paiements (données financières sensibles)
alter table public.paiements enable row level security;
drop policy if exists paiements_coach on public.paiements;
create policy paiements_coach on public.paiements
  for all using (public.is_coach()) with check (public.is_coach());

-- Modèles de cycles
alter table public.programme_templates enable row level security;
drop policy if exists programme_templates_coach on public.programme_templates;
create policy programme_templates_coach on public.programme_templates
  for all using (public.is_coach()) with check (public.is_coach());

alter table public.programme_template_seances enable row level security;
drop policy if exists programme_template_seances_coach on public.programme_template_seances;
create policy programme_template_seances_coach on public.programme_template_seances
  for all using (public.is_coach()) with check (public.is_coach());
