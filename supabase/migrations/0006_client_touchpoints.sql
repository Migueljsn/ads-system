-- Rotina de interação com os clientes ativos (Luiz, seg/qua/sex): tarefa no ClickUp criada pelo Fonil Ads.

-- Gol Distribuidora e Vem da Fruta deixaram de ser clientes (nov/2026)
update public.clients set active = false where slug in ('gol-distribuidora', 'vem-da-fruta');

insert into public.settings (key, value) values
  ('touchpoint_enabled', 'true'::jsonb),
  ('touchpoint_assignee', '102732979'::jsonb),                 -- Luiz Lima
  ('touchpoint_list_id', '"1400720000003550"'::jsonb),         -- Fonil Group › Rotinas da Equipe › Gestor de Tráfego
  ('touchpoint_days', '[1, 3, 5]'::jsonb),                     -- seg, qua, sex
  ('touchpoint_playbook_url', '"https://app.clickup.com/90132983043/v/dc/2ky5gb83-1453"'::jsonb)
on conflict (key) do nothing;

-- 08h BRT (11h UTC) seg/qua/sex; a rota confere o dia e evita duplicar
select cron.unschedule('client-touchpoints') where exists (select 1 from cron.job where jobname = 'client-touchpoints');
select cron.schedule('client-touchpoints', '0 11 * * 1,3,5',
  $$select net.http_get(
      (select value #>> '{}' from public.settings where key = 'app_url') || '/api/cron/client-touchpoints',
      headers := jsonb_build_object('x-cron-token', (select value #>> '{}' from public.settings where key = 'cron_secret')),
      timeout_milliseconds := 120000)$$);
