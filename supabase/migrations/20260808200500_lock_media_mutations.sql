begin;

drop policy if exists media_files_insert_pro on public.media_files;
drop policy if exists media_files_update_pro on public.media_files;
drop policy if exists media_files_delete_own on public.media_files;

revoke insert, update, delete on public.media_files from authenticated;
grant select on public.media_files to authenticated;

commit;
