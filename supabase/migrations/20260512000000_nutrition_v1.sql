-- ============================================================================
-- NUTRITION V1 — Schéma complet
-- ----------------------------------------------------------------------------
-- Tables :
--   nutrition_profile        — restrictions, allergènes, régime
--   nutrition_goals          — cibles quotidiennes (kcal + macros + hydratation)
--   nutrition_foods          — catalogue produits (cache OFF + AI + manuel)
--   nutrition_meals          — repas loggés
--   nutrition_meal_items     — composition détaillée d'un repas
--   nutrition_meal_templates — repas favoris réutilisables
--   nutrition_water          — hydratation quotidienne
-- Storage : bucket `meal-photos` (privé, accès par sous-dossier {client_id}/)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPERS
-- ----------------------------------------------------------------------------

-- Renvoie le client_id de l'utilisateur courant (NULL si coach ou non-client).
create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clients where user_id = auth.uid() limit 1;
$$;

-- True si l'utilisateur courant est le coach (défini dans app_settings).
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_settings
    where key = 'coach_user_id'
      and trim(both '"' from value::text) = auth.uid()::text
  );
$$;

-- ============================================================================
-- 1. nutrition_profile — restrictions / allergènes
-- ============================================================================
create table if not exists public.nutrition_profile (
  client_id     uuid primary key references public.clients(id) on delete cascade,
  regime        text,                              -- omnivore | vegetarien | vegan | sans_gluten | autre
  allergenes    text[] default '{}'::text[],
  intolerances  text[] default '{}'::text[],
  exclusions    text[] default '{}'::text[],      -- aliments libres à éviter
  notes         text,
  updated_at    timestamptz default now()
);

alter table public.nutrition_profile enable row level security;

drop policy if exists "np_read"   on public.nutrition_profile;
drop policy if exists "np_insert" on public.nutrition_profile;
drop policy if exists "np_update" on public.nutrition_profile;

create policy "np_read"
  on public.nutrition_profile for select
  using (client_id = public.current_client_id() or public.is_coach());

create policy "np_insert"
  on public.nutrition_profile for insert
  with check (client_id = public.current_client_id() or public.is_coach());

create policy "np_update"
  on public.nutrition_profile for update
  using (client_id = public.current_client_id() or public.is_coach())
  with check (client_id = public.current_client_id() or public.is_coach());

-- ============================================================================
-- 2. nutrition_goals — cibles quotidiennes
-- ============================================================================
create table if not exists public.nutrition_goals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  kcal_target   int  not null,
  prot_g        numeric(6,1),
  carbs_g       numeric(6,1),
  fat_g         numeric(6,1),
  fibre_g       numeric(6,1),
  hydration_ml  int default 2000,
  active_from   date not null default current_date,
  active_to     date,                             -- NULL = en cours
  created_by    uuid default auth.uid(),
  created_at    timestamptz default now()
);

create index if not exists idx_nutrition_goals_client on public.nutrition_goals(client_id, active_from desc);

alter table public.nutrition_goals enable row level security;

drop policy if exists "ng_read"   on public.nutrition_goals;
drop policy if exists "ng_write"  on public.nutrition_goals;

create policy "ng_read"
  on public.nutrition_goals for select
  using (client_id = public.current_client_id() or public.is_coach());

-- Seul le coach peut créer/modifier/supprimer des cibles.
create policy "ng_write"
  on public.nutrition_goals for all
  using (public.is_coach())
  with check (public.is_coach());

-- ============================================================================
-- 3. nutrition_foods — catalogue partagé
-- ============================================================================
create table if not exists public.nutrition_foods (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brand        text,
  barcode      text unique,
  -- Macros pour 100 g (ou 100 ml si liquide)
  kcal_100     numeric(7,1),
  prot_100     numeric(6,2),
  carbs_100    numeric(6,2),
  sugar_100    numeric(6,2),
  fat_100      numeric(6,2),
  satfat_100   numeric(6,2),
  fibre_100    numeric(6,2),
  salt_100     numeric(6,3),
  -- Scores qualité (Open Food Facts)
  nutri_score  text,                  -- a..e
  nova_group   int,                   -- 1..4
  eco_score    text,
  -- Métadonnées
  unit         text default 'g',      -- 'g' | 'ml'
  serving_g    numeric(6,1),          -- portion standard
  image_url    text,
  source       text default 'manual', -- 'openfoodfacts' | 'ai' | 'manual'
  source_id    text,                  -- ex. code OFF
  created_by   uuid default auth.uid(),
  created_at   timestamptz default now()
);

create index if not exists idx_foods_barcode on public.nutrition_foods(barcode);
create index if not exists idx_foods_search  on public.nutrition_foods
  using gin (to_tsvector('french', coalesce(name, '') || ' ' || coalesce(brand, '')));

alter table public.nutrition_foods enable row level security;

drop policy if exists "nf_read"  on public.nutrition_foods;
drop policy if exists "nf_write" on public.nutrition_foods;

-- Tous les utilisateurs authentifiés peuvent lire (catalogue partagé).
create policy "nf_read"
  on public.nutrition_foods for select
  using (auth.role() = 'authenticated');

-- Tous les utilisateurs authentifiés peuvent insérer (rempli par scan/AI).
create policy "nf_write"
  on public.nutrition_foods for insert
  with check (auth.role() = 'authenticated');

-- ============================================================================
-- 4. nutrition_meals — repas loggés
-- ============================================================================
create table if not exists public.nutrition_meals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  date          date not null default current_date,
  time          time,
  meal_type     text,                  -- 'petit_dej' | 'dejeuner' | 'diner' | 'collation'
  name          text,                  -- libellé libre
  kcal          int,
  prot_g        numeric(6,1),
  carbs_g       numeric(6,1),
  fat_g         numeric(6,1),
  fibre_g       numeric(6,1),
  photo_url     text,                  -- chemin dans le bucket meal-photos
  voice_text    text,                  -- transcription brute (vocal)
  source        text default 'manual', -- 'manual' | 'photo_ai' | 'voice_ai' | 'barcode' | 'template'
  workout_tag   text,                  -- 'pre' | 'post' | NULL — exposé seulement si client.offre = 'preparation_physique'
  quality_score numeric(4,1),          -- note /10 calculée par l'IA vs objectifs
  quality_note  text,                  -- commentaire IA
  notes         text,                  -- notes du client
  coach_comment text,                  -- commentaire du coach
  created_at    timestamptz default now()
);

create index if not exists idx_meals_client_date on public.nutrition_meals(client_id, date desc);

alter table public.nutrition_meals enable row level security;

drop policy if exists "nm_read"   on public.nutrition_meals;
drop policy if exists "nm_insert" on public.nutrition_meals;
drop policy if exists "nm_update" on public.nutrition_meals;
drop policy if exists "nm_delete" on public.nutrition_meals;

create policy "nm_read"
  on public.nutrition_meals for select
  using (client_id = public.current_client_id() or public.is_coach());

create policy "nm_insert"
  on public.nutrition_meals for insert
  with check (client_id = public.current_client_id() or public.is_coach());

create policy "nm_update"
  on public.nutrition_meals for update
  using (client_id = public.current_client_id() or public.is_coach())
  with check (client_id = public.current_client_id() or public.is_coach());

create policy "nm_delete"
  on public.nutrition_meals for delete
  using (client_id = public.current_client_id() or public.is_coach());

-- ============================================================================
-- 5. nutrition_meal_items — composition d'un repas
-- ============================================================================
create table if not exists public.nutrition_meal_items (
  id        uuid primary key default gen_random_uuid(),
  meal_id   uuid not null references public.nutrition_meals(id) on delete cascade,
  food_id   uuid references public.nutrition_foods(id) on delete set null,
  -- Si food_id NULL : item ad-hoc (issu d'IA, pas dans le catalogue)
  name      text,
  quantity  numeric(8,2),
  unit      text default 'g',          -- 'g' | 'ml' | 'piece'
  kcal      int,
  prot_g    numeric(6,1),
  carbs_g   numeric(6,1),
  fat_g     numeric(6,1),
  ordre     int default 0
);

create index if not exists idx_meal_items_meal on public.nutrition_meal_items(meal_id, ordre);

alter table public.nutrition_meal_items enable row level security;

drop policy if exists "nmi_read"  on public.nutrition_meal_items;
drop policy if exists "nmi_write" on public.nutrition_meal_items;

create policy "nmi_read"
  on public.nutrition_meal_items for select
  using (
    exists (
      select 1 from public.nutrition_meals m
      where m.id = meal_id
        and (m.client_id = public.current_client_id() or public.is_coach())
    )
  );

create policy "nmi_write"
  on public.nutrition_meal_items for all
  using (
    exists (
      select 1 from public.nutrition_meals m
      where m.id = meal_id
        and (m.client_id = public.current_client_id() or public.is_coach())
    )
  )
  with check (
    exists (
      select 1 from public.nutrition_meals m
      where m.id = meal_id
        and (m.client_id = public.current_client_id() or public.is_coach())
    )
  );

-- ============================================================================
-- 6. nutrition_meal_templates — repas favoris
-- ============================================================================
create table if not exists public.nutrition_meal_templates (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  meal_type   text,
  kcal        int,
  prot_g      numeric(6,1),
  carbs_g     numeric(6,1),
  fat_g       numeric(6,1),
  fibre_g     numeric(6,1),
  items       jsonb default '[]'::jsonb,    -- snapshot des items pour reprise rapide
  use_count   int default 0,
  created_at  timestamptz default now()
);

create index if not exists idx_templates_client on public.nutrition_meal_templates(client_id, use_count desc);

alter table public.nutrition_meal_templates enable row level security;

drop policy if exists "nmt_all" on public.nutrition_meal_templates;

create policy "nmt_all"
  on public.nutrition_meal_templates for all
  using (client_id = public.current_client_id() or public.is_coach())
  with check (client_id = public.current_client_id() or public.is_coach());

-- ============================================================================
-- 7. nutrition_water — hydratation
-- ============================================================================
create table if not exists public.nutrition_water (
  client_id   uuid not null references public.clients(id) on delete cascade,
  date        date not null default current_date,
  ml          int  not null default 0,
  updated_at  timestamptz default now(),
  primary key (client_id, date)
);

alter table public.nutrition_water enable row level security;

drop policy if exists "nw_all" on public.nutrition_water;

create policy "nw_all"
  on public.nutrition_water for all
  using (client_id = public.current_client_id() or public.is_coach())
  with check (client_id = public.current_client_id() or public.is_coach());

-- ============================================================================
-- STORAGE — bucket `meal-photos` (privé)
-- Convention : photos rangées dans {client_id}/{meal_id}.jpg
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('meal-photos', 'meal-photos', false)
  on conflict (id) do nothing;

drop policy if exists "meal_photos_select" on storage.objects;
drop policy if exists "meal_photos_insert" on storage.objects;
drop policy if exists "meal_photos_delete" on storage.objects;

create policy "meal_photos_select"
  on storage.objects for select
  using (
    bucket_id = 'meal-photos'
    and (
      (storage.foldername(name))[1] = public.current_client_id()::text
      or public.is_coach()
    )
  );

create policy "meal_photos_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'meal-photos'
    and (
      (storage.foldername(name))[1] = public.current_client_id()::text
      or public.is_coach()
    )
  );

create policy "meal_photos_delete"
  on storage.objects for delete
  using (
    bucket_id = 'meal-photos'
    and (
      (storage.foldername(name))[1] = public.current_client_id()::text
      or public.is_coach()
    )
  );
