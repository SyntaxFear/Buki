begin;

alter table public.media_upload_reservations
  add column if not exists verification_claimed_at timestamptz;

alter table public.media_files
  add constraint media_files_owner_storage_path_check
  check (storage_path like owner_id::text || '/%') not valid;

alter table public.media_upload_reservations
  add constraint media_upload_reservations_owner_storage_path_check
  check (storage_path like owner_id::text || '/%') not valid,
  add constraint media_upload_reservations_owner_final_path_check
  check (final_storage_path like owner_id::text || '/%') not valid;

create function public.claim_media_upload_verification(
  target_owner uuid,
  target_reservation_id uuid
)
returns table (
  id uuid,
  owner_id uuid,
  checksum text,
  requested_bytes bigint,
  storage_path text,
  mime_type text,
  status text,
  expires_at timestamptz,
  final_storage_path text
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
  update public.media_upload_reservations as reservation
  set verification_claimed_at = now()
  where reservation.owner_id = target_owner
    and reservation.id = target_reservation_id
    and reservation.status = 'reserved'
    and reservation.expires_at > now()
    and (
      reservation.verification_claimed_at is null
      or reservation.verification_claimed_at < now() - interval '5 minutes'
    )
  returning
    reservation.id,
    reservation.owner_id,
    reservation.checksum,
    reservation.requested_bytes,
    reservation.storage_path,
    reservation.mime_type,
    reservation.status,
    reservation.expires_at,
    reservation.final_storage_path;
end;
$$;

create function public.release_media_upload_verification(
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
  set verification_claimed_at = null
  where owner_id = target_owner
    and id = target_reservation_id
    and status = 'reserved';
end;
$$;

revoke all on function public.claim_media_upload_verification(uuid, uuid) from public;
revoke all on function public.release_media_upload_verification(uuid, uuid) from public;
grant execute on function public.claim_media_upload_verification(uuid, uuid) to service_role;
grant execute on function public.release_media_upload_verification(uuid, uuid) to service_role;

commit;
