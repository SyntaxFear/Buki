begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'adult_profiles', 'adult_profiles exists');
select has_table('public', 'child_profiles', 'child_profiles exists');
select has_table('public', 'sketchpads', 'sketchpads exists');
select has_table('public', 'artworks', 'artworks exists');
select has_table('public', 'media_files', 'media_files exists');
select has_table('public', 'entitlement_snapshots', 'entitlement_snapshots exists');
select has_table('public', 'storage_usage', 'storage_usage exists');
select has_table('public', 'cloud_retention', 'cloud_retention exists');

select ok((select relrowsecurity from pg_class where oid = 'public.adult_profiles'::regclass), 'adult_profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.child_profiles'::regclass), 'child_profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sketchpads'::regclass), 'sketchpads has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.artworks'::regclass), 'artworks has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.media_files'::regclass), 'media_files has RLS enabled');

select has_function('public', 'has_cloud_access', array['uuid'], 'cloud access resolver exists');
select has_function(
  'public',
  'record_entitlement_verification',
  array['uuid', 'boolean', 'timestamp with time zone', 'timestamp with time zone'],
  'server entitlement verifier exists'
);
select ok(
  exists(select 1 from storage.buckets where id = 'buki-media' and public = false),
  'Buki media bucket is private'
);

select * from finish();
rollback;
