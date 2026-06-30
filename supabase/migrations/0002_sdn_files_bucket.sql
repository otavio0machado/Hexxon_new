-- Optional: sync the actual PDF/image files between devices (not just text/metadata).
-- Run this in YOUR dedicated Supabase project (SQL editor) AFTER 0001_sdn_state.sql.
--
-- Creates a PRIVATE Storage bucket 'sdn-files'. Each file is stored under a folder
-- named after the user's id, and Row Level Security limits every user to their own folder.

insert into storage.buckets (id, name, public)
values ('sdn-files', 'sdn-files', false)
on conflict (id) do nothing;

-- One policy per operation on storage.objects, scoped to the authenticated owner's folder.
drop policy if exists sdn_files_select_own on storage.objects;
create policy sdn_files_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'sdn-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists sdn_files_insert_own on storage.objects;
create policy sdn_files_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sdn-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists sdn_files_update_own on storage.objects;
create policy sdn_files_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'sdn-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sdn-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists sdn_files_delete_own on storage.objects;
create policy sdn_files_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'sdn-files' and (storage.foldername(name))[1] = auth.uid()::text);
