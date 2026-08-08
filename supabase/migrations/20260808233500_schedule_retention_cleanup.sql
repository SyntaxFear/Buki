begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'buki_project_url') then
    perform vault.create_secret(
      'https://hoaufnulrockulvwfzzo.supabase.co',
      'buki_project_url',
      'Buki Edge Functions base URL for scheduled retention cleanup'
    );
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'buki_retention_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'buki_retention_cron_secret',
      'Buki internal retention cleanup authorization'
    );
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'buki_project_url') then
    raise exception 'Missing Vault secret: buki_project_url';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'buki_retention_cron_secret') then
    raise exception 'Missing Vault secret: buki_retention_cron_secret';
  end if;

  select jobid into existing_job
  from cron.job
  where jobname = 'buki-retention-cleanup';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'buki-retention-cleanup',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'buki_project_url'
          limit 1
        ) || '/functions/v1/retention-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-buki-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'buki_retention_cron_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
end;
$$;

commit;
