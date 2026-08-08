begin;

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
  ) and exists (
    select 1
    from public.entitlement_snapshots snapshot
    where snapshot.owner_id = target_owner
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

commit;
