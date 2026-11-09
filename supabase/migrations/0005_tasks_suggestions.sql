-- Fase 2: tarefas do ClickUp espelhadas (ranking e impacto por cliente) + sugestões acionáveis

create table if not exists public.team_tasks (
  id text primary key,
  name text not null,
  status text not null,
  status_type text,                       -- open | custom | done | closed
  done boolean not null default false,    -- concluída (não cancelada)
  cancelled boolean not null default false,
  list_id text, list_name text, folder_name text, space_name text,
  client_id uuid references public.clients(id) on delete set null,
  area text,                              -- prefixo "Área | Ação"
  assignees jsonb not null default '[]',  -- [{id, name}]
  priority int,                           -- 1 urgente … 4 baixa
  due_date timestamptz, date_created timestamptz, date_done timestamptz, date_updated timestamptz,
  on_time boolean,
  points int not null default 0,
  url text,
  synced_at timestamptz not null default now()
);
create index if not exists team_tasks_done_idx on public.team_tasks (done, date_done);
create index if not exists team_tasks_client_idx on public.team_tasks (client_id);
alter table public.team_tasks enable row level security;

-- o que foi feito com cada sugestão (dispensada ou virou tarefa)
create table if not exists public.suggestion_actions (
  key text primary key,
  action text not null check (action in ('dismissed', 'task')),
  task_id text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.suggestion_actions enable row level security;

-- listas de cliente do ClickUp (Squad Raíz › Clientes) para ligar tarefas a clientes
update public.clients set clickup_list_id = v.list_id
  from (values ('rio-piranhas', '901329226250'), ('bio-nature', '901329226245'), ('mz3-cosmeticos', '901329226252'),
               ('gol-distribuidora', '901329226247'), ('vem-da-fruta', '901329226251'), ('so-aco', '1400720000002961')) as v(slug, list_id)
 where clients.slug = v.slug and clients.clickup_list_id is null;

-- espelho do ClickUp a cada 30 min
select cron.unschedule('clickup-sync') where exists (select 1 from cron.job where jobname = 'clickup-sync');
select cron.schedule('clickup-sync', '*/30 * * * *',
  $$select net.http_get(
      (select value #>> '{}' from public.settings where key = 'app_url') || '/api/cron/clickup-sync',
      headers := jsonb_build_object('x-cron-token', (select value #>> '{}' from public.settings where key = 'cron_secret')),
      timeout_milliseconds := 120000)$$);
