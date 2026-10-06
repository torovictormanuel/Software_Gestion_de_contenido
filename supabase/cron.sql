-- =============================================================================
-- HIM Product Media · pg_cron + pg_net
-- Ejecutar DESPUÉS de schema.sql y de desplegar la Edge Function.
-- =============================================================================

create extension if not exists pg_cron;                       -- crea el esquema cron
create extension if not exists pg_net with schema extensions; -- HTTP asíncrono desde SQL

-- -----------------------------------------------------------------------------
-- 1. Secretos en Vault
--    cron_secret: lo crea schema.sql con un valor aleatorio que nunca sale de la base.
--    La Edge Function lo valida con la RPC verify_cron_secret (no hace falta
--    copiarlo a ningún lado). Para rotarlo:
--      select vault.update_secret((select id from vault.secrets where name = 'cron_secret'),
--                                 encode(extensions.gen_random_bytes(32), 'hex'));
--    project_url: reemplazá <project-ref> por el de tu proyecto.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://<project-ref>.supabase.co', 'project_url', 'URL base del proyecto para pg_net');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Publicador: cada 2 minutos (cambiá '*/2' por '* * * * *' para 1 min o '*/5' para 5).
--    La función responde 202 al instante y procesa en segundo plano.
-- -----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'publish-scheduled-posts';

select cron.schedule(
  'publish-scheduled-posts',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/publish-scheduled-posts',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := jsonb_build_object('source', 'pg_cron', 'limit', 5),
    timeout_milliseconds := 10000
  );
  $job$
);

-- -----------------------------------------------------------------------------
-- 3. Limpieza diaria (03:15 UTC): estados OAuth vencidos, webhooks, logs, errores y eventos viejos.
-- -----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'him-cleanup';

select cron.schedule(
  'him-cleanup',
  '15 3 * * *',
  $job$
  delete from public.oauth_states    where expires_at  < now();
  delete from public.webhook_events  where received_at < now() - interval '30 days';
  delete from public.publishing_logs where executed_at < now() - interval '180 days';
  delete from public.error_reports   where created_at  < now() - interval '90 days';
  delete from public.app_events      where created_at  < now() - interval '400 days';
  delete from cron.job_run_details   where end_time    < now() - interval '14 days';
  $job$
);

-- -----------------------------------------------------------------------------
-- 4. Monitoreo rápido
-- -----------------------------------------------------------------------------
-- Últimas ejecuciones del cron:
--   select jobname, status, return_message, start_time
--     from cron.job_run_details d join cron.job j using (jobid)
--    order by start_time desc limit 20;
-- Respuestas HTTP de la Edge Function (pg_net las guarda ~6 h):
--   select id, status_code, left(content::text, 200), created from net._http_response order by created desc limit 20;
-- Posts trabados o fallidos:
--   select id, platform, status, attempts, error_message, scheduled_at from public.posts
--    where status in ('publishing', 'failed') order by updated_at desc;
