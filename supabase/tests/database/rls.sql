begin;

create extension if not exists pgtap with schema extensions;
select plan(69);

select has_table('public', 'adult_profiles', 'adult_profiles exists');
select has_table('public', 'child_profiles', 'child_profiles exists');
select has_table('public', 'sketchpads', 'sketchpads exists');
select has_table('public', 'artworks', 'artworks exists');
select has_table('public', 'media_files', 'media_files exists');
select has_table('public', 'entitlement_snapshots', 'entitlement_snapshots exists');
select has_table('public', 'storage_usage', 'storage_usage exists');
select has_table('public', 'media_upload_reservations', 'media upload reservations exist');
select has_column(
  'public',
  'media_upload_reservations',
  'reserved_bytes',
  'pending uploads track their full temporary quota charge'
);
select has_table('public', 'cloud_retention', 'cloud_retention exists');
select has_table('public', 'storage_deletion_sweeps', 'delayed storage deletion sweeps exist');
select has_table('public', 'analytics_events', 'privacy-safe analytics events exist');
select hasnt_column('public', 'analytics_events', 'owner_id', 'analytics rows do not store account identifiers');
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

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
  'authenticated',
  'authenticated',
  'entitlement-retention-test@buki.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);
insert into public.adult_profiles (owner_id, display_name, email)
values (
  'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
  'Entitlement Retention Test',
  'entitlement-retention-test@buki.invalid'
)
on conflict (owner_id) do nothing;

select lives_ok(
  $$select public.record_entitlement_verification(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    true,
    false,
    '2026-02-01 00:00:00+00'::timestamptz,
    '2026-01-01 00:00:00+00'::timestamptz
  )$$,
  'active entitlement verification executes'
);
select is(
  (select status from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  'active',
  'active entitlement enables cloud uploads'
);
select lives_ok(
  $$select public.record_entitlement_verification(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    false,
    true,
    null,
    '2026-01-02 00:00:00+00'::timestamptz
  )$$,
  'expired entitlement verification executes'
);
select is(
  (select status from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  'read_only',
  'expired Pro cloud content becomes read-only'
);
select is(
  (select delete_after from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  '2026-04-02 00:00:00+00'::timestamptz,
  'expired Pro cloud content receives exactly 90 days retention'
);
select lives_ok(
  $$select public.record_entitlement_verification(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    false,
    false,
    null,
    '2026-01-03 00:00:00+00'::timestamptz
  )$$,
  'historical entitlement verification executes'
);
select is(
  (select status from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  'read_only',
  'historical Pro access preserves retention state'
);
select lives_ok(
  $$select public.record_entitlement_verification(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    true,
    true,
    '2099-02-04 00:00:00+00'::timestamptz,
    now()
  )$$,
  'renewed entitlement verification executes'
);
select is(
  (select status from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  'active',
  'renewal immediately restores cloud uploads'
);
select ok(
  (select delete_after is null from public.cloud_retention where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  'renewal clears the retention deletion deadline'
);
insert into public.child_profiles (owner_id, id, name, avatar_color)
values ('fcd350ce-32bd-4cf8-a31f-a1f1edee8369', 'quota-child', 'Quota Child', '#FFD65A');
insert into public.sketchpads (
  owner_id, id, child_id, name, style, design, cover_color
) values (
  'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
  'quota-pad',
  'quota-child',
  'Quota Pad',
  'spread',
  'sunshine',
  '#FFD65A'
);
insert into public.artworks (
  owner_id, id, child_id, sketchpad_id, width, height, added_at, updated_at
) values (
  'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
  'quota-artwork',
  'quota-child',
  'quota-pad',
  100,
  100,
  now(),
  now()
);
select lives_ok(
  $$select * from public.reserve_media_upload(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    'quota-media',
    'quota-artwork',
    'cutout',
    repeat('a', 64),
    1,
    'image/png',
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369/declared-path.png'
  )$$,
  'a one-byte declaration receives a hardened upload reservation'
);
select is(
  (select reserved_bytes from public.media_upload_reservations
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369' and media_id = 'quota-media'),
  31457280::bigint,
  'the reservation charges the full 30 MiB signed-upload allowance'
);
select is(
  (select bytes_reserved from public.storage_usage
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  31457280::bigint,
  'temporary quota accounting includes the full possible object size'
);
select lives_ok(
  $$select public.release_media_upload_reservation(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    (select id from public.media_upload_reservations
     where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369' and media_id = 'quota-media')
  )$$,
  'a hardened reservation can enter cleanup'
);
select lives_ok(
  $$select public.finalize_stale_media_upload_reservation(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    (select id from public.media_upload_reservations
     where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369' and media_id = 'quota-media'),
    null
  )$$,
  'cleanup releases the hardened reservation'
);
select is(
  (select bytes_reserved from public.storage_usage
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  0::bigint,
  'cleanup returns the complete temporary quota charge'
);
update public.storage_usage
set bytes_used = bytes_limit - 1
where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369';
select is(
  (select result from public.reserve_media_upload(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    'quota-media-near-limit',
    'quota-artwork',
    'cutout',
    repeat('b', 64),
    1,
    'image/png',
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369/near-limit.png'
  )),
  'quota_exceeded',
  'declaring one byte cannot bypass the full signed-upload quota charge'
);
select is(
  (select status from public.media_upload_reservations
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'
     and media_id = 'quota-media-near-limit'),
  'released',
  'a rejected near-limit reservation is closed immediately'
);
select is(
  (select bytes_reserved from public.storage_usage
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  0::bigint,
  'a rejected hardened reservation leaves no temporary quota charge'
);
update public.storage_usage
set bytes_used = 0
where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369';
select lives_ok(
  $$select * from public.reserve_media_upload(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    'quota-media-complete',
    'quota-artwork',
    'cutout',
    repeat('c', 64),
    10,
    'image/png',
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369/complete.png'
  )$$,
  'a normal upload receives the hardened temporary reservation'
);
select lives_ok(
  $$select * from public.complete_media_upload(
    'fcd350ce-32bd-4cf8-a31f-a1f1edee8369',
    (select id from public.media_upload_reservations
     where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'
       and media_id = 'quota-media-complete'),
    10
  )$$,
  'completion converts the hardened reservation to measured usage'
);
select is(
  (select bytes_reserved from public.storage_usage
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  0::bigint,
  'completion releases the full pending quota charge'
);
select is(
  (select bytes_used from public.storage_usage
   where owner_id = 'fcd350ce-32bd-4cf8-a31f-a1f1edee8369'),
  10::bigint,
  'completion charges only the verified object size'
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
