begin;

alter table public.cloud_retention
  add column uploads_enabled boolean not null default true,
  add column last_cleanup_attempt_at timestamptz;

create index cloud_retention_due_idx
  on public.cloud_retention(delete_after, last_cleanup_attempt_at)
  where status in ('read_only', 'pending_deletion');

create or replace function public.has_cloud_access(target_owner uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    target_owner = auth.uid()
    or coalesce(auth.role(), '') = 'service_role'
  )
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.owner_id = target_owner
      and deletion.status in ('pending', 'processing')
  )
  and exists (
    select 1
    from public.entitlement_snapshots snapshot
    join public.cloud_retention retention using (owner_id)
    where snapshot.owner_id = target_owner
      and retention.status = 'active'
      and retention.uploads_enabled
      and snapshot.access_tier = 'pro'
      and snapshot.status in ('active', 'grace')
      and snapshot.checked_at >= now() - interval '24 hours'
      and (
        snapshot.expires_at is null
        or snapshot.expires_at > now()
        or (snapshot.status = 'grace' and snapshot.grace_expires_at > now())
      )
  );
$$;

revoke all on function public.has_cloud_access(uuid) from public;
grant execute on function public.has_cloud_access(uuid) to authenticated, service_role;

create or replace function public.record_entitlement_verification(
  target_owner uuid,
  entitlement_active boolean,
  entitlement_expires_at timestamptz default null,
  verified_at timestamptz default now()
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
  if not exists (select 1 from public.adult_profiles where owner_id = target_owner) then
    raise exception 'Buki account not found';
  end if;

  insert into public.entitlement_snapshots (
    owner_id,
    access_tier,
    product,
    status,
    expires_at,
    grace_expires_at,
    will_renew,
    checked_at,
    source
  ) values (
    target_owner,
    case when entitlement_active then 'pro' else 'free' end,
    null,
    case when entitlement_active then 'active' else 'expired' end,
    entitlement_expires_at,
    null,
    false,
    verified_at,
    'revenuecat'
  )
  on conflict (owner_id) do update set
    access_tier = excluded.access_tier,
    status = excluded.status,
    expires_at = excluded.expires_at,
    grace_expires_at = null,
    checked_at = excluded.checked_at,
    source = excluded.source;

  insert into public.cloud_retention (owner_id)
  values (target_owner)
  on conflict (owner_id) do nothing;

  if entitlement_active then
    update public.cloud_retention
    set status = case when uploads_enabled then 'active' else 'inactive' end,
        read_only_since = null,
        delete_after = null,
        last_verified_at = verified_at,
        last_cleanup_attempt_at = null
    where owner_id = target_owner;
  else
    update public.cloud_retention
    set status = case
          when not uploads_enabled then 'inactive'
          when status = 'pending_deletion' then 'pending_deletion'
          else 'read_only'
        end,
        read_only_since = case
          when not uploads_enabled then null
          else coalesce(read_only_since, verified_at)
        end,
        delete_after = case
          when not uploads_enabled then null
          else coalesce(delete_after, verified_at + interval '90 days')
        end,
        last_verified_at = verified_at
    where owner_id = target_owner;
  end if;
end;
$$;

revoke all on function public.record_entitlement_verification(uuid, boolean, timestamptz, timestamptz) from public;
grant execute on function public.record_entitlement_verification(uuid, boolean, timestamptz, timestamptz) to service_role;

create or replace function public.claim_due_cloud_retention(batch_limit integer default 25)
returns table (claimed_owner_id uuid)
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
    select retention.owner_id
    from public.cloud_retention retention
    where retention.status in ('read_only', 'pending_deletion')
      and retention.uploads_enabled
      and retention.delete_after <= now()
      and (
        retention.last_cleanup_attempt_at is null
        or retention.last_cleanup_attempt_at <= now() - interval '15 minutes'
      )
    order by retention.delete_after, retention.owner_id
    for update skip locked
    limit greatest(1, least(coalesce(batch_limit, 25), 100))
  )
  update public.cloud_retention retention
  set status = 'pending_deletion',
      last_cleanup_attempt_at = now()
  from candidates
  where retention.owner_id = candidates.owner_id
  returning retention.owner_id;
end;
$$;

revoke all on function public.claim_due_cloud_retention(integer) from public;
grant execute on function public.claim_due_cloud_retention(integer) to service_role;

create or replace function public.purge_buki_cloud_content(target_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.adult_profiles where owner_id = target_owner) then
    return;
  end if;

  delete from public.media_upload_reservations where owner_id = target_owner;
  delete from public.child_profiles where owner_id = target_owner;
  delete from public.tags where owner_id = target_owner;
  delete from public.tombstones where owner_id = target_owner;
  delete from public.sync_devices where owner_id = target_owner;

  insert into public.storage_usage (owner_id, bytes_used, bytes_reserved, measured_at)
  values (target_owner, 0, 0, now())
  on conflict (owner_id) do update set
    bytes_used = 0,
    bytes_reserved = 0,
    measured_at = excluded.measured_at;

  update public.cloud_retention
  set status = 'inactive',
      read_only_since = null,
      delete_after = null,
      last_cleanup_attempt_at = null
  where owner_id = target_owner;
end;
$$;

revoke all on function public.purge_buki_cloud_content(uuid) from public;
grant execute on function public.purge_buki_cloud_content(uuid) to service_role;

commit;
