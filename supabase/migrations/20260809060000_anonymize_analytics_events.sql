begin;

drop index if exists public.analytics_events_owner_time_idx;

alter table public.analytics_events
  drop column if exists owner_id;

create or replace function public.record_analytics_events(events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  item jsonb;
  event_id uuid;
  event_name_value text;
  source_value text;
  feature_value text;
  plan_value text;
  result_value text;
  export_kind_value text;
  app_version_value text;
  build_number_value text;
  occurred_at_value timestamptz;
  affected integer;
  inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or current_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(events) <> 'array'
     or jsonb_array_length(events) < 1
     or jsonb_array_length(events) > 50 then
    raise exception 'invalid_analytics_batch' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(events)
  loop
    if jsonb_typeof(item) <> 'object'
       or item - array[
         'id',
         'event_name',
         'source',
         'feature',
         'plan',
         'result',
         'export_kind',
         'app_version',
         'build_number',
         'occurred_at'
       ]::text[] <> '{}'::jsonb then
      raise exception 'invalid_analytics_event_shape' using errcode = '22023';
    end if;

    begin
      event_id := nullif(item ->> 'id', '')::uuid;
      occurred_at_value := nullif(item ->> 'occurred_at', '')::timestamptz;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid_analytics_event_value' using errcode = '22023';
    end;

    event_name_value := nullif(item ->> 'event_name', '');
    source_value := nullif(item ->> 'source', '');
    feature_value := nullif(item ->> 'feature', '');
    plan_value := nullif(item ->> 'plan', '');
    result_value := nullif(item ->> 'result', '');
    export_kind_value := nullif(item ->> 'export_kind', '');
    app_version_value := nullif(item ->> 'app_version', '');
    build_number_value := nullif(item ->> 'build_number', '');

    if event_id is null or occurred_at_value is null then
      raise exception 'missing_analytics_event_value' using errcode = '22023';
    end if;
    if event_name_value is null or event_name_value not in (
      'paywall_viewed',
      'purchase_started',
      'purchase_completed',
      'purchase_cancelled',
      'purchase_failed',
      'trial_started',
      'restore_attempted',
      'restore_completed',
      'backup_enabled',
      'quota_exceeded',
      'export_used'
    ) then
      raise exception 'invalid_analytics_event_name' using errcode = '22023';
    end if;
    if source_value is not null and source_value !~ '^[a-z0-9_]{1,80}$' then
      raise exception 'invalid_analytics_source' using errcode = '22023';
    end if;
    if feature_value is not null and feature_value not in (
      'children',
      'sketchpads',
      'artworks',
      'cloudBackup',
      'exportData',
      'advancedOrganization',
      'premiumVisuals'
    ) then
      raise exception 'invalid_analytics_feature' using errcode = '22023';
    end if;
    if plan_value is not null and plan_value not in ('monthly', 'yearly', 'lifetime') then
      raise exception 'invalid_analytics_plan' using errcode = '22023';
    end if;
    if result_value is not null and result_value not in ('success', 'not_found', 'failed', 'cancelled') then
      raise exception 'invalid_analytics_result' using errcode = '22023';
    end if;
    if export_kind_value is not null and export_kind_value not in (
      'png',
      'jpg',
      'share_card',
      'pdf',
      'zip',
      'buki_archive'
    ) then
      raise exception 'invalid_analytics_export_kind' using errcode = '22023';
    end if;
    if app_version_value is not null and char_length(app_version_value) > 40 then
      raise exception 'invalid_analytics_app_version' using errcode = '22023';
    end if;
    if build_number_value is not null and char_length(build_number_value) > 40 then
      raise exception 'invalid_analytics_build_number' using errcode = '22023';
    end if;
    if occurred_at_value < now() - interval '30 days'
       or occurred_at_value > now() + interval '5 minutes' then
      raise exception 'invalid_analytics_timestamp' using errcode = '22023';
    end if;

    insert into public.analytics_events (
      id,
      event_name,
      source,
      feature,
      plan,
      result,
      export_kind,
      app_version,
      build_number,
      occurred_at
    ) values (
      event_id,
      event_name_value,
      source_value,
      feature_value,
      plan_value,
      result_value,
      export_kind_value,
      app_version_value,
      build_number_value,
      occurred_at_value
    )
    on conflict (id) do nothing;
    get diagnostics affected = row_count;
    inserted_count := inserted_count + affected;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.record_analytics_events(jsonb) from public;
grant execute on function public.record_analytics_events(jsonb) to authenticated;

commit;
