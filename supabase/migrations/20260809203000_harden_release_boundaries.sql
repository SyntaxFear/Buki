begin;

create table public.entitlement_verification_rate_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.entitlement_verification_rate_limits enable row level security;
revoke all on public.entitlement_verification_rate_limits from public, anon, authenticated;
grant all on public.entitlement_verification_rate_limits to service_role;

create function public.consume_entitlement_verification_rate_limit(
  target_owner uuid,
  window_seconds integer default 60,
  max_requests integer default 12
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  accepted_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if target_owner is null
     or window_seconds < 10 or window_seconds > 3600
     or max_requests < 1 or max_requests > 120 then
    raise exception 'invalid_entitlement_rate_limit' using errcode = '22023';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from now()) / window_seconds) * window_seconds
  );
  insert into public.entitlement_verification_rate_limits as limits (
    owner_id, window_start, request_count, updated_at
  ) values (target_owner, current_window, 1, now())
  on conflict (owner_id) do update set
    window_start = case
      when limits.window_start < current_window then current_window
      else limits.window_start
    end,
    request_count = case
      when limits.window_start < current_window then 1
      else limits.request_count + 1
    end,
    updated_at = now()
  returning request_count into accepted_count;

  return accepted_count <= max_requests;
end;
$$;

revoke all on function public.consume_entitlement_verification_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_entitlement_verification_rate_limit(uuid, integer, integer)
  to service_role;

create or replace function public.record_analytics_events(events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  current_window timestamptz := date_trunc('hour', now());
  incoming_count integer;
  accepted_count integer;
  key_hash bytea;
  event_item jsonb;
  source_value text;
  app_version_value text;
  build_number_value text;
  allowed_sources constant text[] := array[
    'account_backup_toggle', 'account_center', 'account_children',
    'account_export_archive', 'account_export_artwork', 'account_export_pdf',
    'account_export_zip', 'account_import_archive', 'account_membership',
    'account_restore', 'account_sync_now', 'advanced_organization',
    'archive_export', 'archive_export_commit', 'archive_export_complete',
    'archive_import', 'archive_import_commit', 'artwork_card_export',
    'artwork_card_export_commit', 'artwork_card_prepare', 'artwork_details_export',
    'artwork_favorite', 'artwork_favorite_commit', 'artwork_jpg_export',
    'artwork_jpg_export_commit', 'artwork_jpg_prepare', 'artwork_limit',
    'artwork_limit_commit', 'artwork_png_export', 'artwork_png_export_commit',
    'artwork_png_prepare', 'artwork_tags', 'artwork_tags_commit',
    'automatic_backup', 'child_limit', 'export_center', 'first_artwork',
    'library_bulk_delete', 'library_bulk_favorite', 'library_bulk_favorite_commit',
    'library_bulk_move', 'library_bulk_move_commit', 'library_bulk_select',
    'library_bulk_tag', 'library_bulk_tag_commit', 'library_favorites_filter',
    'library_filters', 'library_search', 'library_sketchpad_filter',
    'library_tag_filter', 'paywall', 'premium_visual_create', 'premium_visual_save',
    'premium_visual_save_commit', 'save_to_photos', 'share_sheet',
    'sketchpad_limit', 'sketchpad_limit_commit', 'sketchpad_pdf_export',
    'sketchpad_pdf_export_commit', 'sketchpad_pdf_export_complete',
    'sketchpad_zip_export', 'sketchpad_zip_export_commit',
    'sketchpad_zip_export_complete'
  ];
begin
  if coalesce(auth.role(), '') <> 'authenticated' or current_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(events) <> 'array'
     or jsonb_array_length(events) < 1
     or jsonb_array_length(events) > 50 then
    raise exception 'invalid_analytics_batch' using errcode = '22023';
  end if;

  for event_item in select value from jsonb_array_elements(events)
  loop
    source_value := event_item ->> 'source';
    app_version_value := event_item ->> 'app_version';
    build_number_value := event_item ->> 'build_number';
    if source_value is not null
       and source_value <> all(allowed_sources)
       and not (
         source_value like '%\_retry' escape '\'
         and regexp_replace(source_value, '_retry$', '') = any(allowed_sources)
       ) then
      raise exception 'invalid_analytics_source' using errcode = '22023';
    end if;
    if app_version_value is not null
       and app_version_value !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$' then
      raise exception 'invalid_analytics_app_version' using errcode = '22023';
    end if;
    if build_number_value is not null and build_number_value !~ '^[0-9]{1,10}$' then
      raise exception 'invalid_analytics_build_number' using errcode = '22023';
    end if;
  end loop;

  incoming_count := jsonb_array_length(events);
  key_hash := extensions.digest(
    convert_to(current_owner::text || ':buki-analytics-rate-limit-v1', 'UTF8'),
    'sha256'
  );
  insert into public.analytics_rate_limits as limits (
    rate_key, window_start, event_count, updated_at
  ) values (key_hash, current_window, incoming_count, now())
  on conflict (rate_key) do update set
    window_start = case
      when limits.window_start < current_window then current_window
      else limits.window_start
    end,
    event_count = case
      when limits.window_start < current_window then incoming_count
      else limits.event_count + incoming_count
    end,
    updated_at = now()
  returning event_count into accepted_count;
  if accepted_count > 500 then
    raise exception 'analytics_rate_limit_exceeded' using errcode = '54000';
  end if;
  return public.record_analytics_events_unlimited(events);
end;
$$;

revoke all on function public.record_analytics_events(jsonb) from public, anon;
grant execute on function public.record_analytics_events(jsonb) to authenticated;

do $$
declare
  existing_job bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'buki_retention_cron_secret'
  ) then
    raise exception 'Missing Vault secret: buki_retention_cron_secret';
  end if;
  select jobid into existing_job from cron.job where jobname = 'buki-retention-cleanup';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'buki-retention-cleanup',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := 'https://hoaufnulrockulvwfzzo.supabase.co/functions/v1/retention-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-buki-cron-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'buki_retention_cron_secret' limit 1
          )
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
end;
$$;

commit;
