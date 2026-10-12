-- Documents joints à un événement de groupe (déroulé d'entraînement fait par
-- un entraîneur : PDF / capture). Seules les images recadrées sont stockées.

create table public.groupe_evenement_documents (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.groupe_evenements(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  ordre smallint not null default 0,
  created_at timestamptz default now()
);

create index on public.groupe_evenement_documents(evenement_id);

alter table public.groupe_evenement_documents enable row level security;
create policy "coach_all_evenement_documents" on public.groupe_evenement_documents
  for all using (public.is_coach()) with check (public.is_coach());

insert into storage.buckets (id, name, public) values ('groupe-documents', 'groupe-documents', true)
  on conflict (id) do nothing;

create policy "public_read_groupe_documents" on storage.objects
  for select using (bucket_id = 'groupe-documents');
create policy "coach_upload_groupe_documents" on storage.objects
  for insert with check (bucket_id = 'groupe-documents' and public.is_coach());
create policy "coach_delete_groupe_documents" on storage.objects
  for delete using (bucket_id = 'groupe-documents' and public.is_coach());
