-- Relatório de tráfego como comentário na tarefa do cliente (Gestão de Clientes), em vez de uma tarefa nova por dia.
alter table public.clients add column if not exists clickup_report_task_id text;
