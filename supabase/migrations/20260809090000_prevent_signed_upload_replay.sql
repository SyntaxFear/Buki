begin;

-- Signed upload URLs remain valid for two hours. Make new tokens create-only,
-- retain their occupied temporary object until expiry, and reserve enough
-- quota for both the temporary object and its finalized copy.
drop trigger if exists media_upload_reservations_release_quota_difference
  on public.media_upload_reservations;
drop function if exists public.release_media_upload_quota_difference();

alter table public.media_upload_reservations
  add column create_only_token boolean;

update public.media_upload_reservations
set create_only_token = false;

alter table public.media_upload_reservations
  alter column create_only_token set default true,
  alter column create_only_token set not null,
  drop constraint media_upload_reservations_reserved_bytes_check,
  alter column reserved_bytes set default 62914560;

alter table public.media_upload_reservations
  add constraint media_upload_reservations_reserved_bytes_check
    check (
      reserved_bytes between requested_bytes and 62914560
      and requested_bytes <= 31457280
    );

-- Existing outstanding tokens allowed overwrite. Active uploads need room for
-- a 30 MiB source and a 30 MiB finalized object. Previously terminal rows are
-- reopened for cleanup because their old token may have recreated the source.
update public.media_upload_reservations
set reserved_bytes = 62914560,
    create_only_token = false
where status in ('reserved', 'expired');

update public.media_upload_reservations
set status = 'expired',
    reserved_bytes = 31457280,
    create_only_token = false,
    cleanup_claimed_at = null,
    cleanup_last_error = null
where status in ('consumed', 'released');

update public.storage_usage as usage
set bytes_reserved = coalesce((
      select sum(reservation.reserved_bytes)
      from public.media_upload_reservations as reservation
      where reservation.owner_id = usage.owner_id
        and reservation.status in ('reserved', 'expired', 'consumed')
    ), 0),
    measured_at = now();

drop index if exists public.media_upload_reservations_cleanup_idx;
create index media_upload_reservations_cleanup_idx
  on public.media_upload_reservations(expires_at, cleanup_claimed_at)
  where status in ('reserved', 'expired', 'consumed');

create function public.release_media_upload_quota_difference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_bytes bigint := 0;
begin
  if not old.quota_hardened then return new; end if;

  if old.status in ('reserved', 'expired') and new.status = 'consumed' then
    released_bytes := greatest(0, old.reserved_bytes - new.reserved_bytes);
  elsif old.status in ('reserved', 'expired', 'consumed') and new.status = 'released' then
    released_bytes := old.reserved_bytes;
  end if;

  if released_bytes > 0 then
    update public.storage_usage
    set bytes_reserved = greatest(0, bytes_reserved - released_bytes),
        measured_at = now()
    where owner_id = old.owner_id;
  end if;
  return new;
end;
$$;

create trigger media_upload_reservations_release_quota_difference
after update of status on public.media_upload_reservations
for each row
when (old.status is distinct from new.status)
execute function public.release_media_upload_quota_difference();

create or replace function public.complete_media_upload(
  target_owner uuid,
  target_reservation_id uuid,
  actual_bytes bigint
)
returns table (
  deduplicated boolean,
  storage_path text,
  stored_bytes bigint,
  stored_mime_type text,
  bytes_used bigint,
  bytes_limit bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.storage_usage%rowtype;
  reservation_row public.media_upload_reservations%rowtype;
  existing_media public.media_files%rowtype;
  replay_guard_bytes bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into usage_row
  from public.storage_usage as usage
  where usage.owner_id = target_owner
  for update;

  select * into reservation_row
  from public.media_upload_reservations as reservation
  where reservation.owner_id = target_owner
    and reservation.id = target_reservation_id
  for update;

  if not found then
    raise exception 'upload_reservation_not_found' using errcode = 'P0002';
  end if;
  if reservation_row.status <> 'reserved' then
    raise exception 'upload_reservation_inactive' using errcode = '55000';
  end if;
  if reservation_row.expires_at <= now() then
    raise exception 'upload_reservation_expired' using errcode = '55000';
  end if;
  if actual_bytes <> reservation_row.requested_bytes then
    raise exception 'uploaded_size_mismatch' using errcode = '22023';
  end if;

  -- Create-only tokens are blocked by the retained source object, so its
  -- measured size is sufficient. Legacy overwrite tokens keep a full 30 MiB
  -- replay guard until their expiry and cleanup.
  replay_guard_bytes := case
    when reservation_row.create_only_token then actual_bytes
    else 31457280
  end;

  select * into existing_media
  from public.media_files as media
  where media.owner_id = target_owner
    and media.checksum = reservation_row.checksum
    and media.kind = reservation_row.kind
    and media.deleted_at is null
    and media.upload_state = 'uploaded'
  order by media.created_at
  limit 1
  for share;

  if found then
    insert into public.media_files (
      owner_id, id, artwork_id, kind, storage_path, checksum, byte_size,
      mime_type, upload_state, created_at, updated_at, deleted_at
    ) values (
      target_owner, reservation_row.media_id, reservation_row.artwork_id,
      reservation_row.kind, existing_media.storage_path, reservation_row.checksum,
      existing_media.byte_size, existing_media.mime_type, 'uploaded', now(), now(), null
    )
    on conflict (owner_id, id) do update set
      artwork_id = excluded.artwork_id,
      kind = excluded.kind,
      storage_path = excluded.storage_path,
      checksum = excluded.checksum,
      byte_size = excluded.byte_size,
      mime_type = excluded.mime_type,
      upload_state = 'uploaded',
      deleted_at = null;

    update public.media_upload_reservations
    set status = 'consumed',
        consumed_bytes = 0,
        reserved_bytes = replay_guard_bytes,
        cleanup_claimed_at = null,
        cleanup_last_error = null
    where id = reservation_row.id;

    select * into usage_row
    from public.storage_usage as usage
    where usage.owner_id = target_owner;

    return query select
      true,
      existing_media.storage_path,
      existing_media.byte_size,
      existing_media.mime_type,
      usage_row.bytes_used,
      usage_row.bytes_limit;
    return;
  end if;

  insert into public.media_files (
    owner_id, id, artwork_id, kind, storage_path, checksum, byte_size,
    mime_type, upload_state, created_at, updated_at, deleted_at
  ) values (
    target_owner, reservation_row.media_id, reservation_row.artwork_id,
    reservation_row.kind, reservation_row.final_storage_path,
    reservation_row.checksum, actual_bytes, reservation_row.mime_type,
    'uploaded', now(), now(), null
  )
  on conflict (owner_id, id) do update set
    artwork_id = excluded.artwork_id,
    kind = excluded.kind,
    storage_path = excluded.storage_path,
    checksum = excluded.checksum,
    byte_size = excluded.byte_size,
    mime_type = excluded.mime_type,
    upload_state = 'uploaded',
    deleted_at = null;

  update public.media_upload_reservations
  set status = 'consumed',
      consumed_bytes = actual_bytes,
      reserved_bytes = replay_guard_bytes,
      cleanup_claimed_at = null,
      cleanup_last_error = null
  where id = reservation_row.id;

  update public.storage_usage as usage
  set bytes_used = usage.bytes_used + actual_bytes,
      measured_at = now()
  where usage.owner_id = target_owner
  returning usage.* into usage_row;

  return query select
    false,
    reservation_row.final_storage_path,
    actual_bytes,
    reservation_row.mime_type,
    usage_row.bytes_used,
    usage_row.bytes_limit;
end;
$$;

create or replace function public.claim_stale_media_upload_reservations(batch_limit integer default 25)
returns table (
  claimed_reservation_id uuid,
  claimed_owner_id uuid,
  claimed_storage_path text,
  claimed_final_storage_path text,
  claimed_requested_bytes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select reservation.id
    from public.media_upload_reservations as reservation
    where reservation.status in ('reserved', 'expired', 'consumed')
      and reservation.expires_at <= now()
      and (
        reservation.cleanup_claimed_at is null
        or reservation.cleanup_claimed_at <= now() - interval '15 minutes'
      )
    order by reservation.expires_at, reservation.id
    for update skip locked
    limit greatest(1, least(coalesce(batch_limit, 25), 100))
  )
  update public.media_upload_reservations as reservation
  set status = 'expired',
      cleanup_claimed_at = now(),
      cleanup_attempts = reservation.cleanup_attempts + 1,
      cleanup_last_error = null
  from candidates
  where reservation.id = candidates.id
  returning
    reservation.id,
    reservation.owner_id,
    reservation.storage_path,
    reservation.final_storage_path,
    reservation.requested_bytes;
end;
$$;

create or replace function public.finalize_stale_media_upload_reservation(
  target_owner uuid,
  target_reservation_id uuid,
  cleanup_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.media_upload_reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if cleanup_error is not null then
    update public.media_upload_reservations
    set cleanup_last_error = left(cleanup_error, 500),
        cleanup_claimed_at = now()
    where owner_id = target_owner
      and id = target_reservation_id
      and status = 'expired';
    return;
  end if;

  perform 1
  from public.storage_usage
  where owner_id = target_owner
  for update;

  select * into reservation_row
  from public.media_upload_reservations
  where owner_id = target_owner
    and id = target_reservation_id
  for update;

  if not found or reservation_row.status <> 'expired' then return; end if;

  update public.media_upload_reservations
  set status = 'released',
      consumed_bytes = 0,
      cleanup_claimed_at = null,
      cleanup_last_error = null
  where id = reservation_row.id;
end;
$$;

revoke all on function public.release_media_upload_quota_difference() from public;
revoke all on function public.complete_media_upload(uuid, uuid, bigint) from public;
revoke all on function public.claim_stale_media_upload_reservations(integer) from public;
revoke all on function public.finalize_stale_media_upload_reservation(uuid, uuid, text) from public;
grant execute on function public.complete_media_upload(uuid, uuid, bigint) to service_role;
grant execute on function public.claim_stale_media_upload_reservations(integer) to service_role;
grant execute on function public.finalize_stale_media_upload_reservation(uuid, uuid, text) to service_role;

commit;
