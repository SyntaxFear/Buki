begin;

create table public.analytics_rate_limits (
  rate_key bytea primary key,
  window_start timestamptz not null,
  event_count integer not null check (event_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.analytics_rate_limits enable row level security;
revoke all on public.analytics_rate_limits from public, anon, authenticated;
grant all on public.analytics_rate_limits to service_role;

alter function public.record_analytics_events(jsonb)
  rename to record_analytics_events_unlimited;

revoke all on function public.record_analytics_events_unlimited(jsonb) from public, anon, authenticated;

create function public.record_analytics_events(events jsonb)
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
begin
  if coalesce(auth.role(), '') <> 'authenticated' or current_owner is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(events) <> 'array'
     or jsonb_array_length(events) < 1
     or jsonb_array_length(events) > 50 then
    raise exception 'invalid_analytics_batch' using errcode = '22023';
  end if;

  incoming_count := jsonb_array_length(events);
  key_hash := extensions.digest(
    convert_to(current_owner::text || ':buki-analytics-rate-limit-v1', 'UTF8'),
    'sha256'
  );

  insert into public.analytics_rate_limits as limits (
    rate_key, window_start, event_count, updated_at
  ) values (
    key_hash, current_window, incoming_count, now()
  )
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

commit;
