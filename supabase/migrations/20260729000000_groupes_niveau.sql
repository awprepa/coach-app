-- Groupes de niveau (section 2 du cahier des charges "Schémas d'entraînement") :
-- distincts des groupes d'effectif (table `groupes`), regroupent des joueurs
-- du roster selon leur VMI/VMA pour un exercice donné. Réutilisables d'une
-- séance à l'autre (composition modifiable à tout moment).
create table if not exists public.groupes_niveau (
  id                 uuid        primary key default gen_random_uuid(),
  groupe_id          uuid        not null references public.groupes(id) on delete cascade,
  nom                text        not null,
  critere            text        not null check (critere in ('vmi', 'vma')),
  valeur_ref         numeric,
  valeur_ref_auto    boolean     not null default true, -- true = recalculée depuis les membres, false = ajustée à la main
  couleur            text,
  ordre              integer     not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists public.groupes_niveau_membres (
  niveau_id   uuid not null references public.groupes_niveau(id) on delete cascade,
  joueur_id   uuid not null references public.groupe_joueurs(id) on delete cascade,
  primary key (niveau_id, joueur_id)
);

alter table public.groupes_niveau enable row level security;
alter table public.groupes_niveau_membres enable row level security;

create policy gn_coach_all on public.groupes_niveau
  for all using (public.is_coach()) with check (public.is_coach());
create policy gnm_coach_all on public.groupes_niveau_membres
  for all using (public.is_coach()) with check (public.is_coach());
