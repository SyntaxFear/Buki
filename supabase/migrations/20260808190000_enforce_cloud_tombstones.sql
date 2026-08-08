begin;

create or replace function public.reject_tombstoned_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.tombstones tombstone
    where tombstone.owner_id = new.owner_id
      and tombstone.entity_type = tg_argv[0]
      and tombstone.entity_id = new.id
  ) then
    raise exception 'entity was deleted on another device'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.keep_latest_tombstone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.deleted_at = greatest(old.deleted_at, new.deleted_at);
  return new;
end;
$$;

create trigger child_profiles_reject_tombstone
before insert or update on public.child_profiles
for each row execute function public.reject_tombstoned_entity('child_profile');
create trigger sketchpads_reject_tombstone
before insert or update on public.sketchpads
for each row execute function public.reject_tombstoned_entity('sketchpad');
create trigger artworks_reject_tombstone
before insert or update on public.artworks
for each row execute function public.reject_tombstoned_entity('artwork');
create trigger tags_reject_tombstone
before insert or update on public.tags
for each row execute function public.reject_tombstoned_entity('tag');
create trigger media_files_reject_tombstone
before insert or update on public.media_files
for each row execute function public.reject_tombstoned_entity('media_file');

create trigger tombstones_keep_latest_delete
before update on public.tombstones
for each row execute function public.keep_latest_tombstone();

revoke all on function public.reject_tombstoned_entity() from public;
revoke all on function public.keep_latest_tombstone() from public;

commit;
