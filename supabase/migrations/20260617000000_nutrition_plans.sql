-- ============================================================================
-- NUTRITION PLANS — Plans prescrits par le coach
-- ----------------------------------------------------------------------------
-- Tables :
--   nutrition_plans          — le plan (nom, dates, objectifs globaux)
--   nutrition_plan_days      — jours du plan (j1 à j7)
--   nutrition_plan_meals     — repas prescrits par jour
--   nutrition_plan_foods     — aliments dans chaque repas
--   nutrition_plan_logs      — suivi client (coché / hors-plan / sauté)
-- ============================================================================

-- ============================================================================
-- 1. nutrition_plans — Plan nutritionnel prescrit
-- ============================================================================
create table if not exists public.nutrition_plans (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  nom           text not null,
  description   text,
  date_debut    date,
  date_fin      date,
  statut        text not null default 'brouillon' check (statut in ('brouillon','actif','archive')),
  -- Objectifs globaux (base, peut être surchargé par jour)
  objectif_kcal int,
  objectif_prot int,
  objectif_carbs int,
  objectif_fat  int,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.nutrition_plans enable row level security;

drop policy if exists "nplan_select"  on public.nutrition_plans;
drop policy if exists "nplan_insert"  on public.nutrition_plans;
drop policy if exists "nplan_update"  on public.nutrition_plans;
drop policy if exists "nplan_delete"  on public.nutrition_plans;

create policy "nplan_select" on public.nutrition_plans for select
  using (client_id = public.current_client_id() or public.is_coach());
create policy "nplan_insert" on public.nutrition_plans for insert
  with check (public.is_coach());
create policy "nplan_update" on public.nutrition_plans for update
  using (public.is_coach());
create policy "nplan_delete" on public.nutrition_plans for delete
  using (public.is_coach());

-- ============================================================================
-- 2. nutrition_plan_days — Jours du plan
-- ============================================================================
create table if not exists public.nutrition_plan_days (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.nutrition_plans(id) on delete cascade,
  jour_numero   int not null check (jour_numero between 1 and 7),
  label         text not null default 'Jour',   -- ex: "Lundi", "Jour d'entraînement"
  type_jour     text not null default 'standard' check (type_jour in ('standard','entrainement','repos','competition','custom')),
  objectif_kcal int,   -- surcharge l'objectif du plan pour ce jour
  objectif_prot int,
  objectif_carbs int,
  objectif_fat  int,
  unique (plan_id, jour_numero)
);

alter table public.nutrition_plan_days enable row level security;

drop policy if exists "npday_select" on public.nutrition_plan_days;
drop policy if exists "npday_insert" on public.nutrition_plan_days;
drop policy if exists "npday_update" on public.nutrition_plan_days;
drop policy if exists "npday_delete" on public.nutrition_plan_days;

create policy "npday_select" on public.nutrition_plan_days for select
  using (exists (select 1 from public.nutrition_plans p where p.id = plan_id and (p.client_id = public.current_client_id() or public.is_coach())));
create policy "npday_insert" on public.nutrition_plan_days for insert
  with check (public.is_coach());
create policy "npday_update" on public.nutrition_plan_days for update
  using (public.is_coach());
create policy "npday_delete" on public.nutrition_plan_days for delete
  using (public.is_coach());

-- ============================================================================
-- 3. nutrition_plan_meals — Repas prescrits
-- ============================================================================
create table if not exists public.nutrition_plan_meals (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references public.nutrition_plan_days(id) on delete cascade,
  meal_type   text not null check (meal_type in ('petit_dej','dejeuner','collation','diner','collation_2')),
  nom         text not null,
  ordre       int not null default 0,
  kcal        int,
  prot_g      numeric(6,1),
  carbs_g     numeric(6,1),
  fat_g       numeric(6,1),
  recette     text,   -- instructions de préparation
  notes       text
);

alter table public.nutrition_plan_meals enable row level security;

drop policy if exists "npmeal_select" on public.nutrition_plan_meals;
drop policy if exists "npmeal_insert" on public.nutrition_plan_meals;
drop policy if exists "npmeal_update" on public.nutrition_plan_meals;
drop policy if exists "npmeal_delete" on public.nutrition_plan_meals;

create policy "npmeal_select" on public.nutrition_plan_meals for select
  using (exists (
    select 1 from public.nutrition_plan_days d
    join public.nutrition_plans p on p.id = d.plan_id
    where d.id = day_id and (p.client_id = public.current_client_id() or public.is_coach())
  ));
create policy "npmeal_insert" on public.nutrition_plan_meals for insert
  with check (public.is_coach());
create policy "npmeal_update" on public.nutrition_plan_meals for update
  using (public.is_coach());
create policy "npmeal_delete" on public.nutrition_plan_meals for delete
  using (public.is_coach());

-- ============================================================================
-- 4. nutrition_plan_foods — Aliments dans un repas
-- ============================================================================
create table if not exists public.nutrition_plan_foods (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references public.nutrition_plan_meals(id) on delete cascade,
  nom         text not null,
  quantite_g  numeric(7,1),
  kcal        int,
  prot_g      numeric(6,1),
  carbs_g     numeric(6,1),
  fat_g       numeric(6,1),
  fibre_g     numeric(6,1),
  ordre       int not null default 0
);

alter table public.nutrition_plan_foods enable row level security;

drop policy if exists "npfood_select" on public.nutrition_plan_foods;
drop policy if exists "npfood_insert" on public.nutrition_plan_foods;
drop policy if exists "npfood_update" on public.nutrition_plan_foods;
drop policy if exists "npfood_delete" on public.nutrition_plan_foods;

create policy "npfood_select" on public.nutrition_plan_foods for select
  using (exists (
    select 1 from public.nutrition_plan_meals m
    join public.nutrition_plan_days d on d.id = m.day_id
    join public.nutrition_plans p on p.id = d.plan_id
    where m.id = meal_id and (p.client_id = public.current_client_id() or public.is_coach())
  ));
create policy "npfood_insert" on public.nutrition_plan_foods for insert
  with check (public.is_coach());
create policy "npfood_update" on public.nutrition_plan_foods for update
  using (public.is_coach());
create policy "npfood_delete" on public.nutrition_plan_foods for delete
  using (public.is_coach());

-- ============================================================================
-- 5. nutrition_plan_logs — Suivi client (coché / hors-plan / sauté)
-- ============================================================================
create table if not exists public.nutrition_plan_logs (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.nutrition_plans(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  date        date not null,
  jour_numero int not null,   -- quel jour du plan (1-7)
  meal_id     uuid references public.nutrition_plan_meals(id) on delete set null,
  statut      text not null check (statut in ('fait','hors_plan','saute')),
  -- Pour repas hors-plan
  hors_plan_nom    text,
  hors_plan_kcal   int,
  hors_plan_prot   numeric(6,1),
  hors_plan_carbs  numeric(6,1),
  hors_plan_fat    numeric(6,1),
  created_at  timestamptz default now(),
  unique (client_id, date, meal_id)
);

alter table public.nutrition_plan_logs enable row level security;

drop policy if exists "nplog_select" on public.nutrition_plan_logs;
drop policy if exists "nplog_insert" on public.nutrition_plan_logs;
drop policy if exists "nplog_update" on public.nutrition_plan_logs;
drop policy if exists "nplog_delete" on public.nutrition_plan_logs;

create policy "nplog_select" on public.nutrition_plan_logs for select
  using (client_id = public.current_client_id() or public.is_coach());
create policy "nplog_insert" on public.nutrition_plan_logs for insert
  with check (client_id = public.current_client_id() or public.is_coach());
create policy "nplog_update" on public.nutrition_plan_logs for update
  using (client_id = public.current_client_id() or public.is_coach());
create policy "nplog_delete" on public.nutrition_plan_logs for delete
  using (client_id = public.current_client_id() or public.is_coach());

-- Index utiles
create index if not exists nutrition_plan_logs_client_date on public.nutrition_plan_logs(client_id, date);
create index if not exists nutrition_plans_client_statut on public.nutrition_plans(client_id, statut);
