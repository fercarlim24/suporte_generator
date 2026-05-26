-- LandscapeOS 2 — relatórios na nuvem
-- Execute no SQL Editor do Supabase (https://supabase.com/dashboard)

create table if not exists reports (
  id          bigint primary key,
  type        text not null check (type in ('suporte', 'horas', 'op')),
  title       text,
  period      text,
  version     int not null default 2,
  payload     jsonb not null,
  saved_at    timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists reports_type_saved_at_idx
  on reports (type, saved_at desc);

-- Opcional: habilitar RLS depois com políticas por usuário
alter table reports enable row level security;

-- Política aberta apenas se usar anon key no cliente (não recomendado).
-- Com API Vercel + service role, a tabela fica acessível só pelo backend.
