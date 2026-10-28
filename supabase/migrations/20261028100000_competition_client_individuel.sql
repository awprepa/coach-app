-- Compétition pour un client en préparation physique sans groupe : il colle le
-- lien Mon Clubhouse de son équipe, sync-ffr range matchs et classement à son nom.
alter table public.clients add column if not exists monclubhouse_url text;

alter table public.matchs_ffr add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.classements_ffr add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.matchs_ffr alter column groupe_id drop not null;
alter table public.classements_ffr alter column groupe_id drop not null;
create index if not exists matchs_ffr_client_id_idx on public.matchs_ffr(client_id);
create index if not exists classements_ffr_client_id_idx on public.classements_ffr(client_id);

drop policy if exists client_read_own_matchs_ffr on public.matchs_ffr;
create policy client_read_own_matchs_ffr on public.matchs_ffr
  for select to authenticated using (client_id = public.current_client_id());
drop policy if exists client_read_own_classements_ffr on public.classements_ffr;
create policy client_read_own_classements_ffr on public.classements_ffr
  for select to authenticated using (client_id = public.current_client_id());
