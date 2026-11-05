-- Sincronização automática: de hora em hora, últimos 3 dias de Meta e Google.
-- URL do app e segredo ficam em settings (app_url, cron_secret), gravados no deploy.
select cron.unschedule('ads-sync') where exists (select 1 from cron.job where jobname = 'ads-sync');
select cron.schedule('ads-sync', '17 * * * *',
  $$select net.http_get(
      (select value #>> '{}' from public.settings where key = 'app_url') || '/api/cron/sync',
      headers := jsonb_build_object('x-cron-token', (select value #>> '{}' from public.settings where key = 'cron_secret')),
      timeout_milliseconds := 290000)$$);
-- relatório diário de IA (08:00 BRT = 11:00 UTC), se houver cliente com lista do ClickUp
select cron.unschedule('ads-daily-report') where exists (select 1 from cron.job where jobname = 'ads-daily-report');
select cron.schedule('ads-daily-report', '0 11 * * *',
  $$select net.http_get(
      (select value #>> '{}' from public.settings where key = 'app_url') || '/api/cron/daily-report',
      headers := jsonb_build_object('x-cron-token', (select value #>> '{}' from public.settings where key = 'cron_secret')),
      timeout_milliseconds := 290000)$$);
