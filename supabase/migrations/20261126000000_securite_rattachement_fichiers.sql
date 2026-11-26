-- 1. Rattachement joueur <-> fiche d'effectif : seulement quand le coach agit
create or replace function public.auto_link_joueur_client() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- une inscription ou un changement de nom par le joueur ne doit jamais
  -- lui donner la fiche (blessures, mensurations) d'un autre
  if not public.is_coach() then return NEW; end if;
  update public.groupe_joueurs set client_id = NEW.id
  where client_id is null
    and lower(trim(prenom)) = lower(trim(NEW.prenom))
    and lower(trim(nom)) = lower(trim(NEW.nom));
  return NEW;
end $$;

-- ... et quand le coach ajoute le joueur à une équipe : fiche de cette équipe au même nom
create or replace function public.auto_link_joueur_membre() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_coach() then return NEW; end if;
  update public.groupe_joueurs gj set client_id = NEW.client_id
  from public.clients c
  where c.id = NEW.client_id and gj.groupe_id = NEW.groupe_id and gj.client_id is null
    and lower(trim(gj.prenom)) = lower(trim(c.prenom))
    and lower(trim(gj.nom)) = lower(trim(c.nom));
  return NEW;
end $$;
drop trigger if exists trg_auto_link_joueur_membre on public.groupe_membres;
create trigger trg_auto_link_joueur_membre after insert on public.groupe_membres
  for each row execute function public.auto_link_joueur_membre();

-- 2. Fichiers : plus de liste publique (les liens publics des images marchent toujours)
drop policy if exists "public_read_groupe_documents" on storage.objects;
create policy "coach_read_groupe_documents" on storage.objects for select
  using (bucket_id = 'groupe-documents' and public.is_coach());
drop policy if exists "profile-photos: lecture publique" on storage.objects;
create policy "profile-photos: lecture client" on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select id::text from public.clients where user_id = auth.uid() limit 1));
