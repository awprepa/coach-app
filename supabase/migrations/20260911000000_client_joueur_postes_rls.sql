alter table public.joueur_postes enable row level security;

drop policy if exists client_own_postes_select on public.joueur_postes;
create policy client_own_postes_select on public.joueur_postes for select using (
  joueur_id in (select id from public.groupe_joueurs where client_id = current_client_id())
);

drop policy if exists client_own_postes_insert on public.joueur_postes;
create policy client_own_postes_insert on public.joueur_postes for insert with check (
  joueur_id in (select id from public.groupe_joueurs where client_id = current_client_id())
);

drop policy if exists client_own_postes_update on public.joueur_postes;
create policy client_own_postes_update on public.joueur_postes for update using (
  joueur_id in (select id from public.groupe_joueurs where client_id = current_client_id())
);

drop policy if exists client_own_postes_delete on public.joueur_postes;
create policy client_own_postes_delete on public.joueur_postes for delete using (
  joueur_id in (select id from public.groupe_joueurs where client_id = current_client_id())
);
