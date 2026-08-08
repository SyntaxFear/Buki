begin;

alter table public.entitlement_snapshots
  add column had_pro boolean not null default false;

create table public.storage_deletion_sweeps (
  owner_id uuid primary key,
  reason text not null check (reason in ('cloud_copy_removal', 'account_deletion', 'retention_expiry')),
  started_at timestamptz not null default now(),
  final_sweep_after timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  updated_at timestamptz not null default now(),
  check (final_sweep_after > started_at)
);

create index storage_deletion_sweeps_due_idx
  on public.storage_deletion_sweeps(next_attempt_at, final_sweep_after);

alter table public.storage_deletion_sweeps enable row level security;
revoke all on public.storage_deletion_sweeps from anon, authenticated;
grant all on public.storage_deletion_sweeps to service_role;

update public.entitlement_snapshots
set had_pro = true
where access_tier = 'pro'
   or product is not null;

drop function if exists public.record_entitlement_verification(
  uuid,
  boolean,
  timestamptz,
  timestamptz
);

create function public.record_entitlement_verification(
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
        last_cleanup_attempt_at = null
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
        last_verified_at = verified_at
    where owner_id = target_owner;
  else
    update public.cloud_retention
    set status = 'inactive',
        read_only_since = null,
        delete_after = null,
        last_verified_at = verified_at,
        last_cleanup_attempt_at = null
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
    join public.entitlement_snapshots snapshot using (owner_id)
    where snapshot.had_pro
      and retention.status in ('read_only', 'pending_deletion')
      and retention.uploads_enabled
      and retention.delete_after <= now()
      and (
        retention.last_cleanup_attempt_at is null
        or retention.last_cleanup_attempt_at <= now() - interval '15 minutes'
      )
    order by retention.delete_after, retention.owner_id
    for update of retention skip locked
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

create function public.claim_storage_deletion_sweeps(batch_limit integer default 25)
returns table (
  claimed_owner_id uuid,
  claimed_reason text,
  claimed_final_sweep_after timestamptz,
  claimed_attempts integer
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
    select sweep.owner_id
    from public.storage_deletion_sweeps sweep
    where sweep.next_attempt_at <= now()
    order by sweep.next_attempt_at, sweep.owner_id
    for update of sweep skip locked
    limit greatest(1, least(coalesce(batch_limit, 25), 100))
  )
  update public.storage_deletion_sweeps sweep
  set attempts = sweep.attempts + 1,
      next_attempt_at = now() + interval '15 minutes',
      updated_at = now()
  from candidates
  where sweep.owner_id = candidates.owner_id
  returning sweep.owner_id, sweep.reason, sweep.final_sweep_after, sweep.attempts;
end;
$$;

revoke all on function public.claim_storage_deletion_sweeps(integer) from public;
grant execute on function public.claim_storage_deletion_sweeps(integer) to service_role;

create function public.verify_retention_cron_secret(provided_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
    and exists (
      select 1
      from vault.decrypted_secrets secret
      where secret.name = 'buki_retention_cron_secret'
        and secret.decrypted_secret = provided_secret
    );
$$;

revoke all on function public.verify_retention_cron_secret(text) from public;
grant execute on function public.verify_retention_cron_secret(text) to service_role;

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
      uploads_enabled = false,
      last_cleanup_attempt_at = null
  where owner_id = target_owner;
end;
$$;

revoke all on function public.purge_buki_cloud_content(uuid) from public;
grant execute on function public.purge_buki_cloud_content(uuid) to service_role;

commit;
