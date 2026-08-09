begin;

-- Signed upload tokens cannot enforce Content-Length. Charge every outstanding
-- reservation for the bucket's full per-object limit until completion proves
-- the real size, so temporary objects can never exceed the owner's 2 GiB quota.
alter table public.media_upload_reservations
  add column reserved_bytes bigint,
  add column quota_hardened boolean not null default false;

update public.media_upload_reservations
set reserved_bytes = 31457280,
    quota_hardened = true;

alter table public.media_upload_reservations
  alter column reserved_bytes set not null,
  alter column reserved_bytes set default 31457280,
  add constraint media_upload_reservations_reserved_bytes_check
    check (
      reserved_bytes between requested_bytes and 31457280
      and requested_bytes <= 31457280
    );

update public.storage_usage as usage
set bytes_reserved = coalesce((
      select sum(reservation.reserved_bytes)
      from public.media_upload_reservations as reservation
      where reservation.owner_id = usage.owner_id
        and reservation.status in ('reserved', 'expired')
    ), 0),
    measured_at = now();

alter function public.reserve_media_upload(
  uuid, text, text, text, text, bigint, text, text
) rename to reserve_media_upload_declared_bytes;

revoke all on function public.reserve_media_upload_declared_bytes(
  uuid, text, text, text, text, bigint, text, text
) from public, anon, authenticated, service_role;

create function public.release_media_upload_quota_difference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.quota_hardened
     and old.status in ('reserved', 'expired')
     and new.status in ('consumed', 'released') then
    update public.storage_usage
    set bytes_reserved = greatest(
          0,
          bytes_reserved - greatest(0, old.reserved_bytes - old.requested_bytes)
        ),
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

create function public.reserve_media_upload(
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
  raw_result record;
  usage_row public.storage_usage%rowtype;
  reservation_row public.media_upload_reservations%rowtype;
  additional_reservation_bytes bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  insert into public.storage_usage (owner_id)
  values (target_owner)
  on conflict (owner_id) do nothing;

  -- Serialize the complete reserve-and-harden operation per owner. The inner
  -- implementation also locks this row, which is re-entrant in this transaction.
  perform 1
  from public.storage_usage
  where owner_id = target_owner
  for update;

  select * into raw_result
  from public.reserve_media_upload_declared_bytes(
    target_owner,
    target_media_id,
    target_artwork_id,
    target_kind,
    target_checksum,
    requested_bytes,
    target_mime_type,
    target_storage_path
  );

  if raw_result.result <> 'reserved' or raw_result.reservation_id is null then
    return query select
      raw_result.result::text,
      raw_result.reservation_id::uuid,
      raw_result.deduplicated::boolean,
      raw_result.storage_path::text,
      raw_result.stored_bytes::bigint,
      raw_result.stored_mime_type::text,
      raw_result.bytes_used::bigint,
      raw_result.bytes_limit::bigint;
    return;
  end if;

  select * into reservation_row
  from public.media_upload_reservations as reservation
  where reservation.owner_id = target_owner
    and reservation.id = raw_result.reservation_id
  for update;

  if reservation_row.quota_hardened then
    return query select
      raw_result.result::text,
      raw_result.reservation_id::uuid,
      raw_result.deduplicated::boolean,
      raw_result.storage_path::text,
      raw_result.stored_bytes::bigint,
      raw_result.stored_mime_type::text,
      raw_result.bytes_used::bigint,
      raw_result.bytes_limit::bigint;
    return;
  end if;

  additional_reservation_bytes := greatest(
    0,
    reservation_row.reserved_bytes - reservation_row.requested_bytes
  );

  select * into usage_row
  from public.storage_usage as usage
  where usage.owner_id = target_owner
  for update;

  if usage_row.bytes_used + usage_row.bytes_reserved + additional_reservation_bytes
     > usage_row.bytes_limit then
    update public.media_upload_reservations
    set status = 'released',
        consumed_bytes = 0,
        quota_hardened = true,
        cleanup_claimed_at = null,
        cleanup_last_error = null
    where id = reservation_row.id;

    update public.storage_usage as usage
    set bytes_reserved = greatest(0, usage.bytes_reserved - reservation_row.requested_bytes),
        measured_at = now()
    where usage.owner_id = target_owner
    returning usage.* into usage_row;

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

  update public.storage_usage as usage
  set bytes_reserved = usage.bytes_reserved + additional_reservation_bytes,
      measured_at = now()
  where usage.owner_id = target_owner
  returning usage.* into usage_row;

  update public.media_upload_reservations
  set quota_hardened = true
  where id = reservation_row.id;

  return query select
    raw_result.result::text,
    raw_result.reservation_id::uuid,
    raw_result.deduplicated::boolean,
    raw_result.storage_path::text,
    raw_result.stored_bytes::bigint,
    raw_result.stored_mime_type::text,
    usage_row.bytes_used,
    usage_row.bytes_limit;
end;
$$;

revoke all on function public.release_media_upload_quota_difference() from public;
revoke all on function public.reserve_media_upload(
  uuid, text, text, text, text, bigint, text, text
) from public;
grant execute on function public.reserve_media_upload(
  uuid, text, text, text, text, bigint, text, text
) to service_role;

commit;
