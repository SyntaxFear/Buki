begin;

alter table public.cloud_retention
  add column last_entitlement_refresh_attempt_at timestamptz;

create index cloud_retention_entitlement_refresh_idx
  on public.cloud_retention(last_entitlement_refresh_attempt_at, owner_id)
  where status = 'active' and uploads_enabled;

create function public.claim_entitlements_due_for_refresh(batch_limit integer default 25)
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
    join public.entitlement_snapshots snapshot using (owner_id)
    where retention.status = 'active'
      and retention.uploads_enabled
      and snapshot.had_pro
      and snapshot.access_tier = 'pro'
      and snapshot.checked_at <= now() - interval '12 hours'
      and (
        retention.last_entitlement_refresh_attempt_at is null
        or retention.last_entitlement_refresh_attempt_at <= now() - interval '15 minutes'
      )
    order by snapshot.checked_at, retention.owner_id
    for update of retention skip locked
    limit greatest(1, least(coalesce(batch_limit, 25), 100))
  )
  update public.cloud_retention retention
  set last_entitlement_refresh_attempt_at = now()
  from candidates
  where retention.owner_id = candidates.owner_id
  returning retention.owner_id;
end;
$$;

revoke all on function public.claim_entitlements_due_for_refresh(integer) from public;
grant execute on function public.claim_entitlements_due_for_refresh(integer) to service_role;

create or replace function public.record_entitlement_verification(
  target_owner uuid,
  entitlement_active boolean,
  entitlement_had_pro boolean,
  entitlement_expires_at timestamptz default null,
  verified_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_had_pro boolean;
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
    had_pro,
    expires_at,
    grace_expires_at,
    will_renew,
    checked_at,
    source
  ) values (
    target_owner,
    case when entitlement_active then 'pro' else 'free' end,
    null,
    case
      when entitlement_active then 'active'
      when entitlement_had_pro then 'expired'
      else 'unknown'
    end,
    entitlement_active or entitlement_had_pro,
    entitlement_expires_at,
    null,
    false,
    verified_at,
    'revenuecat'
  )
  on conflict (owner_id) do update set
    access_tier = excluded.access_tier,
    status = case
      when excluded.status = 'active' then 'active'
      when public.entitlement_snapshots.had_pro or excluded.had_pro then 'expired'
      else 'unknown'
    end,
    had_pro = public.entitlement_snapshots.had_pro or excluded.had_pro,
    expires_at = case
      when excluded.status = 'active' then excluded.expires_at
      else coalesce(excluded.expires_at, public.entitlement_snapshots.expires_at)
    end,
    grace_expires_at = null,
    checked_at = excluded.checked_at,
    source = excluded.source
  returning had_pro into resolved_had_pro;

  insert into public.cloud_retention (owner_id)
  values (target_owner)
  on conflict (owner_id) do nothing;

  if entitlement_active then
    update public.cloud_retention
    set status = case when uploads_enabled then 'active' else 'inactive' end,
        read_only_since = null,
        delete_after = null,
        last_verified_at = verified_at,
        last_cleanup_attempt_at = null,
        last_entitlement_refresh_attempt_at = null
    where owner_id = target_owner;
  elsif resolved_had_pro and (
    select uploads_enabled from public.cloud_retention where owner_id = target_owner
  ) then
    update public.cloud_retention
    set status = case
          when status = 'pending_deletion' then 'pending_deletion'
          else 'read_only'
        end,
        read_only_since = coalesce(read_only_since, verified_at),
        delete_after = coalesce(delete_after, verified_at + interval '90 days'),
        last_verified_at = verified_at,
        last_entitlement_refresh_attempt_at = null
    where owner_id = target_owner;
  else
    update public.cloud_retention
    set status = 'inactive',
        read_only_since = null,
        delete_after = null,
        last_verified_at = verified_at,
        last_cleanup_attempt_at = null,
        last_entitlement_refresh_attempt_at = null
    where owner_id = target_owner;
  end if;
end;
$$;

revoke all on function public.record_entitlement_verification(
  uuid,
  boolean,
  boolean,
  timestamptz,
  timestamptz
) from public;
grant execute on function public.record_entitlement_verification(
  uuid,
  boolean,
  boolean,
  timestamptz,
  timestamptz
) to service_role;

commit;
