begin;

create extension if not exists pgtap with schema extensions;
select plan(44);

select has_table('public', 'adult_profiles', 'adult_profiles exists');
select has_table('public', 'child_profiles', 'child_profiles exists');
select has_table('public', 'sketchpads', 'sketchpads exists');
select has_table('public', 'artworks', 'artworks exists');
select has_table('public', 'media_files', 'media_files exists');
select has_table('public', 'entitlement_snapshots', 'entitlement_snapshots exists');
select has_table('public', 'storage_usage', 'storage_usage exists');
select has_table('public', 'media_upload_reservations', 'media upload reservations exist');
select has_table('public', 'cloud_retention', 'cloud_retention exists');
select has_table('public', 'storage_deletion_sweeps', 'delayed storage deletion sweeps exist');
select has_table('public', 'analytics_events', 'privacy-safe analytics events exist');
select has_column('public', 'cloud_retention', 'uploads_enabled', 'privacy hold is persisted server-side');
select has_column('public', 'cloud_retention', 'last_entitlement_refresh_attempt_at', 'stale active entitlements are refreshable without webhooks');
select has_column('public', 'entitlement_snapshots', 'had_pro', 'historical Pro access is persisted server-side');

select ok((select relrowsecurity from pg_class where oid = 'public.adult_profiles'::regclass), 'adult_profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.child_profiles'::regclass), 'child_profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sketchpads'::regclass), 'sketchpads has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.artworks'::regclass), 'artworks has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.media_files'::regclass), 'media_files has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.storage_deletion_sweeps'::regclass), 'storage deletion sweeps are service-only');
select ok((select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass), 'analytics events have RLS enabled');
select ok(
  not has_table_privilege('authenticated', 'public.analytics_events', 'SELECT'),
  'authenticated clients cannot read analytics rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.analytics_events', 'INSERT'),
  'authenticated clients cannot bypass the analytics recorder'
);
select ok(
  not has_table_privilege('authenticated', 'public.storage_deletion_sweeps', 'SELECT'),
  'authenticated clients cannot inspect delayed storage sweeps'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_files', 'INSERT'),
  'authenticated clients cannot bypass media upload reservations'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_files', 'UPDATE'),
  'authenticated clients cannot rewrite cloud media paths'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_files', 'DELETE'),
  'authenticated clients cannot delete storage metadata directly'
);

select has_function('public', 'has_cloud_access', array['uuid'], 'cloud access resolver exists');
select has_function(
  'public',
  'record_entitlement_verification',
  array['uuid', 'boolean', 'boolean', 'timestamp with time zone', 'timestamp with time zone'],
  'server entitlement verifier exists'
);
select has_function(
  'public',
  'claim_due_cloud_retention',
  array['integer'],
  'due retention records can be claimed safely'
);
select has_function(
  'public',
  'claim_entitlements_due_for_refresh',
  array['integer'],
  'stale active entitlements can be claimed safely'
);
select has_function(
  'public',
  'claim_storage_deletion_sweeps',
  array['integer'],
  'delayed storage sweeps can be claimed safely'
);
select has_function(
  'public',
  'verify_retention_cron_secret',
  array['text'],
  'retention cron authorization is verified inside Vault'
);
select has_function(
  'public',
  'purge_buki_cloud_content',
  array['uuid'],
  'cloud content can be purged without deleting the adult account'
);
select has_function(
  'public',
  'record_analytics_events',
  array['jsonb'],
  'analytics recorder exists'
);
select has_function(
  'public',
  'reserve_media_upload',
  array['uuid', 'text', 'text', 'text', 'text', 'bigint', 'text', 'text'],
  'server-side media reservations exist'
);
select has_function(
  'public',
  'release_media_upload_reservation',
  array['uuid', 'uuid'],
  'media reservations can be released safely'
);
select has_function(
  'public',
  'complete_media_upload',
  array['uuid', 'uuid', 'bigint'],
  'server-side media completion exists'
);
select has_function(
  'public',
  'prepare_media_delete',
  array['uuid', 'text', 'timestamp with time zone'],
  'media deletion is prepared transactionally'
);
select has_function(
  'public',
  'complete_media_delete',
  array['uuid', 'text'],
  'media deletion updates quota usage'
);
select ok(
  exists(select 1 from storage.buckets where id = 'buki-media' and public = false),
  'Buki media bucket is private'
);
select has_trigger(
  'public',
  'child_profiles',
  'child_profiles_reject_tombstone',
  'child profiles reject stale writes after deletion'
);
select has_trigger(
  'public',
  'tombstones',
  'tombstones_keep_latest_delete',
  'tombstone timestamps never move backwards'
);
select ok(
  exists(select 1 from cron.job where jobname = 'buki-retention-cleanup'),
  'retention cleanup is scheduled'
);

select * from finish();
rollback;
