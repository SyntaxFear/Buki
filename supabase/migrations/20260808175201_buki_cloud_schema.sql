begin;

create extension if not exists pgcrypto with schema extensions;

create table public.adult_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_profiles (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 80),
  avatar_color text not null check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  avatar_url text,
  birth_month smallint check (birth_month between 1 and 12),
  birth_year smallint check (birth_year between 1900 and 2200),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);

create table public.sketchpads (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  child_id text not null,
  name text not null check (char_length(name) between 1 and 100),
  style text not null check (style in ('spread', 'vertical', 'album', 'grid', 'strip')),
  design text not null check (design in ('sunshine', 'garden', 'berry', 'sky', 'moonlight', 'rainbow', 'forest', 'ocean', 'space', 'candy')),
  border text not null default 'none' check (border in ('none', 'gallery-mat', 'polaroid', 'torn-paper', 'washi-tape', 'scalloped', 'crayon-edge', 'sticker-stars', 'museum-frame')),
  decoration text not null default 'none' check (decoration in ('none', 'confetti-pop', 'sparkle-trail', 'heart-parade', 'flower-garden', 'starry-sky', 'sticker-party')),
  cover_color text not null check (cover_color ~ '^#[0-9A-Fa-f]{6}$'),
  page_color text check (page_color is null or page_color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  foreign key (owner_id, child_id)
    references public.child_profiles(owner_id, id) on delete cascade
);

create table public.artworks (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  child_id text not null,
  sketchpad_id text not null,
  width double precision not null check (width > 0),
  height double precision not null check (height > 0),
  rotation double precision not null default 0 check (rotation between -360 and 360),
  title text check (title is null or char_length(title) <= 100),
  notes text check (notes is null or char_length(notes) <= 10000),
  favorite boolean not null default false,
  added_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  foreign key (owner_id, child_id)
    references public.child_profiles(owner_id, id) on delete cascade,
  foreign key (owner_id, sketchpad_id)
    references public.sketchpads(owner_id, id) on delete cascade
);

create table public.tags (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 40),
  normalized_name text not null check (char_length(normalized_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  unique (owner_id, normalized_name)
);

create table public.artwork_tags (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  artwork_id text not null,
  tag_id text not null,
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, artwork_id, tag_id),
  foreign key (owner_id, artwork_id)
    references public.artworks(owner_id, id) on delete cascade,
  foreign key (owner_id, tag_id)
    references public.tags(owner_id, id) on delete cascade
);

create table public.media_files (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  id text not null check (char_length(id) between 1 and 240),
  artwork_id text not null,
  kind text not null check (kind in ('cutout', 'preview', 'original')),
  storage_path text not null check (char_length(storage_path) between 1 and 1000),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/heic', 'image/webp')),
  upload_state text not null default 'uploaded' check (upload_state in ('reserved', 'uploading', 'uploaded', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  unique (owner_id, storage_path),
  foreign key (owner_id, artwork_id)
    references public.artworks(owner_id, id) on delete cascade
);

create unique index media_files_owner_checksum_kind_idx
  on public.media_files(owner_id, checksum, kind)
  where deleted_at is null and upload_state <> 'deleted';

create table public.tombstones (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  entity_type text not null check (entity_type in ('child_profile', 'sketchpad', 'artwork', 'tag', 'media_file')),
  entity_id text not null check (char_length(entity_id) between 1 and 240),
  deleted_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, entity_type, entity_id)
);

create table public.sync_devices (
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 200),
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  last_pulled_at timestamptz,
  last_pushed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, device_id)
);

create table public.entitlement_snapshots (
  owner_id uuid primary key references public.adult_profiles(owner_id) on delete cascade,
  access_tier text not null default 'free' check (access_tier in ('free', 'pro')),
  product text check (product is null or product in ('monthly', 'yearly', 'lifetime')),
  status text not null default 'unknown' check (status in ('active', 'grace', 'expired', 'unknown')),
  expires_at timestamptz,
  grace_expires_at timestamptz,
  will_renew boolean not null default false,
  checked_at timestamptz not null default now(),
  source text not null default 'revenuecat' check (source in ('revenuecat', 'webhook', 'admin')),
  updated_at timestamptz not null default now()
);

create table public.storage_usage (
  owner_id uuid primary key references public.adult_profiles(owner_id) on delete cascade,
  bytes_used bigint not null default 0 check (bytes_used >= 0),
  bytes_reserved bigint not null default 0 check (bytes_reserved >= 0),
  bytes_limit bigint not null default 2147483648 check (bytes_limit > 0),
  measured_at timestamptz not null default now()
);

create table public.media_upload_reservations (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.adult_profiles(owner_id) on delete cascade,
  requested_bytes bigint not null check (requested_bytes > 0),
  consumed_bytes bigint check (consumed_bytes is null or consumed_bytes >= 0),
  storage_path text not null check (char_length(storage_path) between 1 and 1000),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cloud_retention (
  owner_id uuid primary key references public.adult_profiles(owner_id) on delete cascade,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'read_only', 'pending_deletion')),
  read_only_since timestamptz,
  delete_after timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status <> 'read_only' and status <> 'pending_deletion')
    or (read_only_since is not null and delete_after is not null)
  )
);

create table public.account_deletion_requests (
  owner_id uuid primary key references public.adult_profiles(owner_id) on delete cascade,
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed', 'cancelled')),
  last_error text,
  updated_at timestamptz not null default now()
);

create index child_profiles_owner_sort_idx on public.child_profiles(owner_id, sort_order, created_at);
create index sketchpads_owner_child_sort_idx on public.sketchpads(owner_id, child_id, sort_order, created_at);
create index artworks_owner_pad_updated_idx on public.artworks(owner_id, sketchpad_id, updated_at);
create index artworks_owner_child_updated_idx on public.artworks(owner_id, child_id, updated_at);
create index artworks_owner_server_updated_idx on public.artworks(owner_id, server_updated_at);
create index tags_owner_server_updated_idx on public.tags(owner_id, server_updated_at);
create index media_files_owner_artwork_idx on public.media_files(owner_id, artwork_id, kind);
create index media_files_owner_server_updated_idx on public.media_files(owner_id, server_updated_at);
create index tombstones_owner_updated_idx on public.tombstones(owner_id, server_updated_at);
create index upload_reservations_owner_expiry_idx on public.media_upload_reservations(owner_id, expires_at);
create index account_deletion_status_idx on public.account_deletion_requests(status, execute_after);

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger child_profiles_server_updated
before update on public.child_profiles
for each row execute function public.set_server_updated_at();
create trigger sketchpads_server_updated
before update on public.sketchpads
for each row execute function public.set_server_updated_at();
create trigger artworks_server_updated
before update on public.artworks
for each row execute function public.set_server_updated_at();
create trigger tags_server_updated
before update on public.tags
for each row execute function public.set_server_updated_at();
create trigger artwork_tags_server_updated
before update on public.artwork_tags
for each row execute function public.set_server_updated_at();
create trigger media_files_server_updated
before update on public.media_files
for each row execute function public.set_server_updated_at();
create trigger tombstones_server_updated
before update on public.tombstones
for each row execute function public.set_server_updated_at();

create trigger adult_profiles_updated
before update on public.adult_profiles
for each row execute function public.set_updated_at();
create trigger sync_devices_updated
before update on public.sync_devices
for each row execute function public.set_updated_at();
create trigger entitlement_snapshots_updated
before update on public.entitlement_snapshots
for each row execute function public.set_updated_at();
create trigger upload_reservations_updated
before update on public.media_upload_reservations
for each row execute function public.set_updated_at();
create trigger cloud_retention_updated
before update on public.cloud_retention
for each row execute function public.set_updated_at();
create trigger account_deletion_requests_updated
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

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

  if entitlement_active then
    insert into public.cloud_retention (
      owner_id,
      status,
      read_only_since,
      delete_after,
      last_verified_at
    ) values (
      target_owner,
      'active',
      null,
      null,
      verified_at
    )
    on conflict (owner_id) do update set
      status = 'active',
      read_only_since = null,
      delete_after = null,
      last_verified_at = excluded.last_verified_at;
  else
    insert into public.cloud_retention (
      owner_id,
      status,
      read_only_since,
      delete_after,
      last_verified_at
    ) values (
      target_owner,
      'read_only',
      verified_at,
      verified_at + interval '90 days',
      verified_at
    )
    on conflict (owner_id) do update set
      status = case
        when public.cloud_retention.status = 'pending_deletion' then 'pending_deletion'
        else 'read_only'
      end,
      read_only_since = coalesce(public.cloud_retention.read_only_since, excluded.read_only_since),
      delete_after = coalesce(public.cloud_retention.delete_after, excluded.delete_after),
      last_verified_at = excluded.last_verified_at;
  end if;
end;
$$;

revoke all on function public.record_entitlement_verification(uuid, boolean, timestamptz, timestamptz) from public;
grant execute on function public.record_entitlement_verification(uuid, boolean, timestamptz, timestamptz) to service_role;

create or replace function public.handle_new_buki_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
begin
  resolved_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Buki Parent'
  );

  insert into public.adult_profiles (owner_id, display_name, email, avatar_url)
  values (new.id, resolved_name, new.email, nullif(new.raw_user_meta_data ->> 'avatar_url', ''))
  on conflict (owner_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        avatar_url = coalesce(excluded.avatar_url, public.adult_profiles.avatar_url);

  insert into public.storage_usage (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  insert into public.cloud_retention (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_buki on auth.users;
create trigger on_auth_user_created_buki
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_buki_user();

insert into public.adult_profiles (owner_id, display_name, email, avatar_url, created_at, updated_at)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Buki Parent'
  ),
  users.email,
  nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
  users.created_at,
  now()
from auth.users users
on conflict (owner_id) do nothing;

insert into public.storage_usage (owner_id)
select owner_id from public.adult_profiles
on conflict (owner_id) do nothing;

insert into public.cloud_retention (owner_id)
select owner_id from public.adult_profiles
on conflict (owner_id) do nothing;

alter table public.adult_profiles enable row level security;
alter table public.child_profiles enable row level security;
alter table public.sketchpads enable row level security;
alter table public.artworks enable row level security;
alter table public.tags enable row level security;
alter table public.artwork_tags enable row level security;
alter table public.media_files enable row level security;
alter table public.tombstones enable row level security;
alter table public.sync_devices enable row level security;
alter table public.entitlement_snapshots enable row level security;
alter table public.storage_usage enable row level security;
alter table public.media_upload_reservations enable row level security;
alter table public.cloud_retention enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy adult_profiles_select_own
on public.adult_profiles for select
to authenticated
using (owner_id = auth.uid());
create policy adult_profiles_insert_own
on public.adult_profiles for insert
to authenticated
with check (owner_id = auth.uid());
create policy adult_profiles_update_own
on public.adult_profiles for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'child_profiles',
    'sketchpads',
    'artworks',
    'tags',
    'artwork_tags',
    'media_files',
    'sync_devices'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
      table_name || '_select_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid() and public.has_cloud_access(auth.uid()))',
      table_name || '_insert_pro',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = auth.uid() and public.has_cloud_access(auth.uid())) with check (owner_id = auth.uid() and public.has_cloud_access(auth.uid()))',
      table_name || '_update_pro',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())',
      table_name || '_delete_own',
      table_name
    );
  end loop;
end;
$$;

create policy tombstones_select_own
on public.tombstones for select
to authenticated
using (owner_id = auth.uid());
create policy tombstones_insert_own
on public.tombstones for insert
to authenticated
with check (owner_id = auth.uid());
create policy tombstones_update_own
on public.tombstones for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
create policy tombstones_delete_own
on public.tombstones for delete
to authenticated
using (owner_id = auth.uid());

create policy entitlement_snapshots_select_own
on public.entitlement_snapshots for select
to authenticated
using (owner_id = auth.uid());
create policy storage_usage_select_own
on public.storage_usage for select
to authenticated
using (owner_id = auth.uid());
create policy cloud_retention_select_own
on public.cloud_retention for select
to authenticated
using (owner_id = auth.uid());
create policy account_deletion_requests_select_own
on public.account_deletion_requests for select
to authenticated
using (owner_id = auth.uid());

revoke all on
  public.adult_profiles,
  public.child_profiles,
  public.sketchpads,
  public.artworks,
  public.tags,
  public.artwork_tags,
  public.media_files,
  public.tombstones,
  public.sync_devices,
  public.entitlement_snapshots,
  public.storage_usage,
  public.media_upload_reservations,
  public.cloud_retention,
  public.account_deletion_requests
from anon;
grant select, insert, update on public.adult_profiles to authenticated;
grant select, insert, update, delete on
  public.child_profiles,
  public.sketchpads,
  public.artworks,
  public.tags,
  public.artwork_tags,
  public.media_files,
  public.tombstones,
  public.sync_devices
to authenticated;
grant select on
  public.entitlement_snapshots,
  public.storage_usage,
  public.cloud_retention,
  public.account_deletion_requests
to authenticated;
grant all on all tables in schema public to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'buki-media',
  'buki-media',
  false,
  31457280,
  array['image/png', 'image/jpeg', 'image/heic', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy buki_media_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'buki-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
