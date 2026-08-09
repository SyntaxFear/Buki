begin;

alter table public.media_upload_reservations
  add column final_storage_path text,
  add column cleanup_claimed_at timestamptz,
  add column cleanup_attempts integer not null default 0 check (cleanup_attempts >= 0),
  add column cleanup_last_error text;

update public.media_upload_reservations
set final_storage_path = storage_path
where final_storage_path is null;

alter table public.media_upload_reservations
  alter column final_storage_path set not null;

create index media_upload_reservations_cleanup_idx
  on public.media_upload_reservations(expires_at, cleanup_claimed_at)
  where status in ('reserved', 'expired');

create or replace function public.reserve_media_upload(
  target_owner uuid,
  target_media_id text,
  target_artwork_id text,
  target_kind text,
  target_checksum text,
  requested_bytes bigint,
  target_mime_type text,
  target_storage_path text
)
returns table (
  result text,
  reservation_id uuid,
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
  existing_media public.media_files%rowtype;
  active_reservation public.media_upload_reservations%rowtype;
  created_reservation_id uuid;
  created_upload_path text;
  created_final_path text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if not public.has_cloud_access(target_owner) then
    raise exception 'cloud_access_required' using errcode = '42501';
  end if;
  if requested_bytes <= 0 or requested_bytes > 31457280 then
    raise exception 'invalid_upload_size' using errcode = '22023';
  end if;
  if target_kind not in ('cutout', 'preview', 'original') then
    raise exception 'invalid_media_kind' using errcode = '22023';
  end if;
  if target_mime_type not in ('image/png', 'image/jpeg', 'image/heic', 'image/webp') then
    raise exception 'invalid_media_type' using errcode = '22023';
  end if;
  if target_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_media_checksum' using errcode = '22023';
  end if;
  if target_storage_path not like target_owner::text || '/%' then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.artworks as artwork
    where artwork.owner_id = target_owner
      and artwork.id = target_artwork_id
      and artwork.deleted_at is null
  ) then
    raise exception 'artwork_not_found' using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.media_files as media
    where media.owner_id = target_owner
      and media.id = target_media_id
      and media.deleted_at is null
      and (
        media.artwork_id <> target_artwork_id
        or media.kind <> target_kind
        or media.checksum <> target_checksum
      )
  ) then
    raise exception 'media_id_conflict' using errcode = '23505';
  end if;

  insert into public.storage_usage (owner_id)
  values (target_owner)
  on conflict (owner_id) do nothing;

  select * into usage_row
  from public.storage_usage as usage
  where usage.owner_id = target_owner
  for update;

  select * into active_reservation
  from public.media_upload_reservations as reservation
  where reservation.owner_id = target_owner
    and reservation.media_id = target_media_id
    and reservation.status in ('reserved', 'expired')
  order by reservation.created_at desc
  limit 1
  for update;

  select * into existing_media
  from public.media_files as media
  where media.owner_id = target_owner
    and media.checksum = target_checksum
    and media.kind = target_kind
    and media.deleted_at is null
    and media.upload_state = 'uploaded'
  order by media.created_at
  limit 1
  for share;

  if found then
    if active_reservation.id is not null then
      update public.media_upload_reservations
      set status = 'expired',
          cleanup_last_error = null
      where id = active_reservation.id;
    end if;

    insert into public.media_files (
      owner_id, id, artwork_id, kind, storage_path, checksum, byte_size,
      mime_type, upload_state, created_at, updated_at, deleted_at
    ) values (
      target_owner, target_media_id, target_artwork_id, target_kind,
      existing_media.storage_path, target_checksum, existing_media.byte_size,
      existing_media.mime_type, 'uploaded', now(), now(), null
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

    return query select
      'deduplicated'::text,
      null::uuid,
      true,
      existing_media.storage_path,
      existing_media.byte_size,
      existing_media.mime_type,
      usage_row.bytes_used,
      usage_row.bytes_limit;
    return;
  end if;

  if active_reservation.id is not null then
    if active_reservation.status <> 'reserved' or active_reservation.expires_at <= now() then
      raise exception 'upload_cleanup_pending' using errcode = '55000';
    end if;
    if active_reservation.artwork_id <> target_artwork_id
      or active_reservation.kind <> target_kind
      or active_reservation.checksum <> target_checksum
      or active_reservation.requested_bytes <> requested_bytes
      or active_reservation.mime_type <> target_mime_type then
      raise exception 'upload_reservation_conflict' using errcode = '23505';
    end if;

    update public.media_upload_reservations
    set expires_at = now() + interval '135 minutes',
        cleanup_claimed_at = null,
        cleanup_last_error = null
    where id = active_reservation.id;

    return query select
      'reserved'::text,
      active_reservation.id,
      false,
      active_reservation.storage_path,
      active_reservation.requested_bytes,
      active_reservation.mime_type,
      usage_row.bytes_used,
      usage_row.bytes_limit;
    return;
  end if;

  if usage_row.bytes_used + usage_row.bytes_reserved + requested_bytes > usage_row.bytes_limit then
    return query select
      'quota_exceeded'::text,
      null::uuid,
      false,
      null::text,
      requested_bytes,
      target_mime_type,
      usage_row.bytes_used,
      usage_row.bytes_limit;
    return;
  end if;

  created_reservation_id := extensions.gen_random_uuid();
  created_upload_path := target_owner::text || '/_uploads/' || created_reservation_id::text;
  created_final_path := target_owner::text || '/media/' || created_reservation_id::text;

  insert into public.media_upload_reservations (
    id, owner_id, media_id, artwork_id, kind, checksum, requested_bytes,
    storage_path, final_storage_path, mime_type, status, expires_at
  ) values (
    created_reservation_id, target_owner, target_media_id, target_artwork_id,
    target_kind, target_checksum, requested_bytes, created_upload_path,
    created_final_path, target_mime_type, 'reserved',
    now() + interval '135 minutes'
  );

  update public.storage_usage as usage
  set bytes_reserved = usage.bytes_reserved + requested_bytes,
      measured_at = now()
  where usage.owner_id = target_owner
  returning usage.* into usage_row;

  return query select
    'reserved'::text,
    created_reservation_id,
    false,
    created_upload_path,
    requested_bytes,
    target_mime_type,
    usage_row.bytes_used,
    usage_row.bytes_limit;
end;
$$;

create or replace function public.release_media_upload_reservation(
  target_owner uuid,
  target_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  update public.media_upload_reservations
  set status = 'expired',
      cleanup_last_error = null
  where owner_id = target_owner
    and id = target_reservation_id
    and status = 'reserved';
end;
$$;

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
    set status = 'released',
        consumed_bytes = 0,
        cleanup_claimed_at = null,
        cleanup_last_error = null
    where id = reservation_row.id;

    update public.storage_usage as usage
    set bytes_reserved = greatest(0, usage.bytes_reserved - reservation_row.requested_bytes),
        measured_at = now()
    where usage.owner_id = target_owner
    returning usage.* into usage_row;

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
      cleanup_claimed_at = null,
      cleanup_last_error = null
  where id = reservation_row.id;

  update public.storage_usage as usage
  set bytes_reserved = greatest(0, usage.bytes_reserved - reservation_row.requested_bytes),
      bytes_used = usage.bytes_used + actual_bytes,
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

create function public.claim_stale_media_upload_reservations(batch_limit integer default 25)
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
    where reservation.status in ('reserved', 'expired')
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

create function public.finalize_stale_media_upload_reservation(
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

  update public.storage_usage
  set bytes_reserved = greatest(0, bytes_reserved - reservation_row.requested_bytes),
      measured_at = now()
  where owner_id = target_owner;
end;
$$;

revoke all on function public.claim_stale_media_upload_reservations(integer) from public;
revoke all on function public.finalize_stale_media_upload_reservation(uuid, uuid, text) from public;
grant execute on function public.claim_stale_media_upload_reservations(integer) to service_role;
grant execute on function public.finalize_stale_media_upload_reservation(uuid, uuid, text) to service_role;

commit;
