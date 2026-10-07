-- Séances "terrain" (course, navettes, prépa physique en extérieur) en plus des
-- séances de musculation existantes. Une séance terrain réutilise `seances` et
-- `exercices` : chaque ligne `exercices` devient un "bloc" (A, B, C... via la
-- colonne `code` déjà utilisée pour grouper visuellement) avec un contenu texte
-- structuré et un schéma de terrain, au lieu de séries/répétitions/poids.

alter table seances
  add column if not exists type text not null default 'musculation'
  check (type in ('musculation', 'terrain'));

-- Contenu texte structuré du bloc : [{ texte, repos }], et schéma visuel
-- (plots, flèches, zones, surface) — voir src/components/SchemaTerrainEditor.js.
alter table exercices
  add column if not exists contenu jsonb,
  add column if not exists schema jsonb;

-- Validation d'un bloc terrain par le client : un seul bouton "Bloc terminé"
-- par bloc et par semaine (pas de détail série par série, à la différence de
-- serie_tracking). Clé (exercice_id, semaine) : une ligne par occurrence.
create table if not exists bloc_terrain_validations (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid not null references exercices(id) on delete cascade,
  semaine integer not null,
  valide boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exercice_id, semaine)
);

alter table bloc_terrain_validations enable row level security;

-- Le client ne peut lire/écrire que les validations de ses propres séances
-- (via exercice -> séance -> programme -> client_id), le coach voit tout.
drop policy if exists client_select_own_bloc_validations on bloc_terrain_validations;
create policy client_select_own_bloc_validations on bloc_terrain_validations for select using (
  exercice_id in (
    select ex.id from exercices ex
    join seances sea on sea.id = ex.seance_id
    join programmes prog on prog.id = sea.programme_id
    where prog.client_id = current_client_id()
  )
);

drop policy if exists client_upsert_own_bloc_validations on bloc_terrain_validations;
create policy client_upsert_own_bloc_validations on bloc_terrain_validations for insert with check (
  exercice_id in (
    select ex.id from exercices ex
    join seances sea on sea.id = ex.seance_id
    join programmes prog on prog.id = sea.programme_id
    where prog.client_id = current_client_id()
  )
);

drop policy if exists client_update_own_bloc_validations on bloc_terrain_validations;
create policy client_update_own_bloc_validations on bloc_terrain_validations for update using (
  exercice_id in (
    select ex.id from exercices ex
    join seances sea on sea.id = ex.seance_id
    join programmes prog on prog.id = sea.programme_id
    where prog.client_id = current_client_id()
  )
);

drop policy if exists client_delete_own_bloc_validations on bloc_terrain_validations;
create policy client_delete_own_bloc_validations on bloc_terrain_validations for delete using (
  exercice_id in (
    select ex.id from exercices ex
    join seances sea on sea.id = ex.seance_id
    join programmes prog on prog.id = sea.programme_id
    where prog.client_id = current_client_id()
  )
);

drop policy if exists coach_all_bloc_validations on bloc_terrain_validations;
create policy coach_all_bloc_validations on bloc_terrain_validations for all using (is_coach());
