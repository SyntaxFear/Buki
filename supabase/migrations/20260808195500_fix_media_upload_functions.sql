begin;

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
  released_bytes bigint := 0;
  created_reservation_id uuid;
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
      and media.checksum <> target_checksum
      and media.deleted_at is null
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

  select coalesce(sum(reservation.requested_bytes), 0) into released_bytes
  from public.media_upload_reservations as reservation
  where reservation.owner_id = target_owner
    and reservation.status = 'reserved'
    and (reservation.expires_at <= now() or reservation.media_id = target_media_id);

  update public.media_upload_reservations as reservation
  set status = case when reservation.expires_at <= now() then 'expired' else 'released' end
  where reservation.owner_id = target_owner
    and reservation.status = 'reserved'
    and (reservation.expires_at <= now() or reservation.media_id = target_media_id);

  if released_bytes > 0 then
    update public.storage_usage as usage
    set bytes_reserved = greatest(0, usage.bytes_reserved - released_bytes),
        measured_at = now()
    where usage.owner_id = target_owner
    returning usage.* into usage_row;
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

  insert into public.media_upload_reservations (
    owner_id, media_id, artwork_id, kind, checksum, requested_bytes,
    storage_path, mime_type, status, expires_at
  ) values (
    target_owner, target_media_id, target_artwork_id, target_kind,
    target_checksum, requested_bytes, target_storage_path, target_mime_type,
    'reserved', now() + interval '30 minutes'
  )
  returning id into created_reservation_id;

  update public.storage_usage as usage
  set bytes_reserved = usage.bytes_reserved + requested_bytes,
      measured_at = now()
  where usage.owner_id = target_owner
  returning usage.* into usage_row;

  return query select
    'reserved'::text,
    created_reservation_id,
    false,
    target_storage_path,
    requested_bytes,
    target_mime_type,
    usage_row.bytes_used,
    usage_row.bytes_limit;
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
  where reservation.owner_id = target_owner and reservation.id = target_reservation_id
  for update;

  if not found then
    raise exception 'upload_reservation_not_found' using errcode = 'P0002';
  end if;
  if reservation_row.status <> 'reserved' then
    raise exception 'upload_reservation_inactive' using errcode = '55000';
  end if;
  if reservation_row.expires_at <= now() then
    update public.media_upload_reservations
    set status = 'expired'
    where id = reservation_row.id;
    update public.storage_usage as usage
    set bytes_reserved = greatest(0, usage.bytes_reserved - reservation_row.requested_bytes),
        measured_at = now()
    where usage.owner_id = target_owner;
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
    set status = 'released', consumed_bytes = 0
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
    reservation_row.kind, reservation_row.storage_path, reservation_row.checksum,
    actual_bytes, reservation_row.mime_type, 'uploaded', now(), now(), null
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
  set status = 'consumed', consumed_bytes = actual_bytes
  where id = reservation_row.id;
  update public.storage_usage as usage
  set bytes_reserved = greatest(0, usage.bytes_reserved - reservation_row.requested_bytes),
      bytes_used = usage.bytes_used + actual_bytes,
      measured_at = now()
  where usage.owner_id = target_owner
  returning usage.* into usage_row;

  return query select
    false,
    reservation_row.storage_path,
    actual_bytes,
    reservation_row.mime_type,
    usage_row.bytes_used,
    usage_row.bytes_limit;
end;
$$;

create or replace function public.prepare_media_delete(
  target_owner uuid,
  target_media_id text,
  target_deleted_at timestamptz default now()
)
returns table (
  delete_object boolean,
  storage_path text,
  stored_bytes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_row public.media_files%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into media_row
  from public.media_files as media
  where media.owner_id = target_owner and media.id = target_media_id
  for update;

  if not found then
    insert into public.tombstones (owner_id, entity_type, entity_id, deleted_at)
    values (target_owner, 'media_file', target_media_id, target_deleted_at)
    on conflict (owner_id, entity_type, entity_id) do update set
      deleted_at = greatest(public.tombstones.deleted_at, excluded.deleted_at);
    return query select false, null::text, 0::bigint;
    return;
  end if;

  if media_row.deleted_at is null or media_row.upload_state <> 'deleted' then
    update public.media_files
    set upload_state = 'deleted', deleted_at = target_deleted_at
    where owner_id = target_owner and id = target_media_id;
  end if;

  insert into public.tombstones (owner_id, entity_type, entity_id, deleted_at)
  values (target_owner, 'media_file', target_media_id, target_deleted_at)
  on conflict (owner_id, entity_type, entity_id) do update set
    deleted_at = greatest(public.tombstones.deleted_at, excluded.deleted_at);

  if exists (
    select 1
    from public.media_files as media
    where media.owner_id = target_owner
      and media.storage_path = media_row.storage_path
      and media.id <> target_media_id
      and media.deleted_at is null
      and media.upload_state = 'uploaded'
  ) then
    delete from public.media_files
    where owner_id = target_owner and id = target_media_id;
    return query select false, media_row.storage_path, media_row.byte_size;
    return;
  end if;

  return query select true, media_row.storage_path, media_row.byte_size;
end;
$$;

create or replace function public.complete_media_delete(
  target_owner uuid,
  target_media_id text
)
returns table (
  bytes_used bigint,
  bytes_limit bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.storage_usage%rowtype;
  media_row public.media_files%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into usage_row
  from public.storage_usage as usage
  where usage.owner_id = target_owner
  for update;
  select * into media_row
  from public.media_files as media
  where media.owner_id = target_owner and media.id = target_media_id
  for update;

  if found then
    delete from public.media_files
    where owner_id = target_owner and id = target_media_id;
    if not exists (
      select 1
      from public.media_files as media
      where media.owner_id = target_owner
        and media.storage_path = media_row.storage_path
        and media.deleted_at is null
        and media.upload_state = 'uploaded'
    ) then
      update public.storage_usage as usage
      set bytes_used = greatest(0, usage.bytes_used - media_row.byte_size),
          measured_at = now()
      where usage.owner_id = target_owner
      returning usage.* into usage_row;
    end if;
  end if;

  return query select usage_row.bytes_used, usage_row.bytes_limit;
end;
$$;

commit;
