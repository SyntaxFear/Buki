begin;

-- The app's RLS policies need a self-scoped cloud-access predicate, while
-- service functions need to inspect arbitrary owners. SECURITY INVOKER keeps
-- authenticated calls constrained by the entitlement/retention RLS policies.
create or replace function public.has_cloud_access(
  target_owner uuid default auth.uid()
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    (coalesce(auth.role(), '') = 'authenticated' and target_owner = auth.uid())
    or coalesce(auth.role(), '') = 'service_role'
  ) and exists (
    select 1
    from public.entitlement_snapshots snapshot
    join public.cloud_retention retention using (owner_id)
    where snapshot.owner_id = target_owner
      and snapshot.access_tier = 'pro'
      and snapshot.status in ('active', 'grace')
      and snapshot.checked_at >= now() - interval '24 hours'
      and retention.status = 'active'
      and retention.uploads_enabled
      and (
        snapshot.expires_at is null
        or snapshot.expires_at > now()
        or (snapshot.status = 'grace' and snapshot.grace_expires_at > now())
      )
  );
$$;

revoke all on function public.has_cloud_access(uuid) from public, anon;
grant execute on function public.has_cloud_access(uuid) to authenticated, service_role;

-- Authenticated users may inspect only their own entitlement state through
-- RLS. Mutations remain service-only.
revoke all on public.entitlement_snapshots from anon, authenticated;
revoke all on public.cloud_retention from anon, authenticated;
grant select on public.entitlement_snapshots to authenticated;
grant select on public.cloud_retention to authenticated;

-- These RPCs are invoked only by JWT-protected Edge Functions using the
-- service-role client. Revoke PostgreSQL's explicit default function grants.
revoke all on function public.claim_due_cloud_retention(integer)
  from public, anon, authenticated;
revoke all on function public.claim_entitlements_due_for_refresh(integer)
  from public, anon, authenticated;
revoke all on function public.claim_media_upload_verification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_stale_media_upload_reservations(integer)
  from public, anon, authenticated;
revoke all on function public.claim_storage_deletion_sweeps(integer)
  from public, anon, authenticated;
revoke all on function public.complete_media_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_media_upload(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.consume_entitlement_verification_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_stale_media_upload_reservation(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.prepare_media_delete(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.purge_buki_cloud_content(uuid)
  from public, anon, authenticated;
revoke all on function public.record_analytics_events_unlimited(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_entitlement_verification(
  uuid, boolean, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.release_media_upload_reservation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_media_upload_verification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_media_upload(
  uuid, text, text, text, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.verify_retention_cron_secret(text)
  from public, anon, authenticated;

grant execute on function public.claim_due_cloud_retention(integer) to service_role;
grant execute on function public.claim_entitlements_due_for_refresh(integer) to service_role;
grant execute on function public.claim_media_upload_verification(uuid, uuid) to service_role;
grant execute on function public.claim_stale_media_upload_reservations(integer) to service_role;
grant execute on function public.claim_storage_deletion_sweeps(integer) to service_role;
grant execute on function public.complete_media_delete(uuid, text) to service_role;
grant execute on function public.complete_media_upload(uuid, uuid, bigint) to service_role;
grant execute on function public.consume_entitlement_verification_rate_limit(uuid, integer, integer)
  to service_role;
grant execute on function public.finalize_stale_media_upload_reservation(uuid, uuid, text)
  to service_role;
grant execute on function public.prepare_media_delete(uuid, text, timestamptz) to service_role;
grant execute on function public.purge_buki_cloud_content(uuid) to service_role;
grant execute on function public.record_analytics_events_unlimited(jsonb) to service_role;
grant execute on function public.record_entitlement_verification(
  uuid, boolean, boolean, timestamptz, timestamptz
) to service_role;
grant execute on function public.release_media_upload_reservation(uuid, uuid) to service_role;
grant execute on function public.release_media_upload_verification(uuid, uuid) to service_role;
grant execute on function public.reserve_media_upload(
  uuid, text, text, text, text, bigint, text, text
) to service_role;
grant execute on function public.verify_retention_cron_secret(text) to service_role;

-- Trigger functions are not callable RPCs.
revoke all on function public.handle_new_buki_user() from public, anon, authenticated;
revoke all on function public.reject_tombstoned_entity() from public, anon, authenticated;
revoke all on function public.release_media_upload_quota_difference()
  from public, anon, authenticated;

-- This is the one intentional authenticated SECURITY DEFINER RPC. It performs
-- its own auth.uid(), schema, source, batch-size, and rate-limit validation.
revoke all on function public.record_analytics_events(jsonb) from public, anon;
grant execute on function public.record_analytics_events(jsonb) to authenticated, service_role;

commit;
