-- Traits tracés par le coach sur une comparaison de photos d'évolution.
-- Une ligne par ensemble de photos comparées (cle = ids des photos triés).
create table if not exists public.photo_comparaison_traits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cle text not null,
  traits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (client_id, cle)
);
alter table public.photo_comparaison_traits enable row level security;
drop policy if exists pct_coach_all on public.photo_comparaison_traits;
create policy pct_coach_all on public.photo_comparaison_traits for all using (is_coach()) with check (is_coach());
