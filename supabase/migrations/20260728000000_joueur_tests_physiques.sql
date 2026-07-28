-- VMI / VMA par joueur du roster (groupe_joueurs), pas seulement les clients
-- avec compte — historique daté, permet de suivre l'évolution dans le temps.
-- Base pour les groupes de niveau (VMI/VMA moyenne) et le calculateur
-- d'intensité (section 4 du cahier des charges "Schémas d'entraînement").
create table if not exists public.joueur_tests_physiques (
  id          uuid        primary key default gen_random_uuid(),
  joueur_id   uuid        not null references public.groupe_joueurs(id) on delete cascade,
  type        text        not null check (type in ('vmi', 'vma')),
  valeur      numeric     not null,
  date        date        not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists joueur_tests_physiques_joueur_idx on public.joueur_tests_physiques (joueur_id, type, date desc);

alter table public.joueur_tests_physiques enable row level security;

-- Effectif géré exclusivement par le coach (comme joueur_postes, joueur_blessures).
create policy jtp_coach_all on public.joueur_tests_physiques
  for all using (public.is_coach()) with check (public.is_coach());
