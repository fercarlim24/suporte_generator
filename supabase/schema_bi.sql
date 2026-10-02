-- LandscapeOS 2 — warehouse analítico (BI de produto)
-- Execute no SQL Editor do Supabase DEPOIS de supabase/schema.sql
-- Não substitui a tabela reports (documento/auditoria); adiciona fatos + marts.

-- ═══════════════════════════════════════════════════════════
-- Extensões
-- ═══════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ═══════════════════════════════════════════════════════════
-- Dimensões
-- ═══════════════════════════════════════════════════════════

create table if not exists dim_date (
  date_id        date primary key,
  year           int not null,
  quarter        int not null check (quarter between 1 and 4),
  month          int not null check (month between 1 and 12),
  month_key      text not null,          -- YYYY-MM (alinha com reportMonth do app)
  week_of_month  int check (week_of_month between 1 and 5),
  week_start     date not null,          -- segunda-feira da semana ISO
  iso_year       int not null,
  iso_week       int not null,
  sprint_id      text,                   -- opcional (ex.: sprint-17)
  is_month_end   boolean not null default false
);

create index if not exists dim_date_month_key_idx on dim_date (month_key);
create index if not exists dim_date_week_start_idx on dim_date (week_start);

create table if not exists dim_product (
  product_code   text primary key,       -- OS2 | FORE | GERAL
  product_name   text not null,
  is_active      boolean not null default true
);

insert into dim_product (product_code, product_name) values
  ('OS2',   'LandscapeOS 2'),
  ('FORE',  'FORE'),
  ('GERAL', 'Geral / não classificado')
on conflict (product_code) do nothing;

create table if not exists dim_tenant (
  tenant_id      text primary key,
  tenant_name    text,
  plan           text,
  segment        text,
  status         text default 'active',
  domain         text,                   -- domínio de e-mail conhecido (opcional)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dim_tenant_domain_idx on dim_tenant (domain);

create table if not exists dim_feature (
  feature_key    text primary key,       -- ex.: recibo.download, auth.login
  feature_name   text not null,
  module         text,                   -- agrupamento de produto
  product_code   text references dim_product (product_code),
  ga_event_name  text,                   -- evento GA4 associado (opcional)
  is_active      boolean not null default true
);

create table if not exists dim_issue_type (
  issue_type     text primary key,
  sort_order     int not null default 100
);

insert into dim_issue_type (issue_type, sort_order) values
  ('Bug/Erro', 10),
  ('Acesso e permissões', 20),
  ('Financeiro/FORE', 30),
  ('Integrações', 40),
  ('Relatórios', 50),
  ('Dúvidas operacionais', 60),
  ('Outros', 90)
on conflict (issue_type) do nothing;

create table if not exists dim_category (
  category       text primary key,
  sort_order     int not null default 100
);

insert into dim_category (category, sort_order) values
  ('NOVA FEATURE', 10),
  ('SUPORTE', 20),
  ('BUG', 30),
  ('CALL', 40),
  ('ROTINA', 50),
  ('SEM CATEGORIA', 90)
on conflict (category) do nothing;

create table if not exists dim_source (
  source         text primary key,
  description    text
);

insert into dim_source (source, description) values
  ('drag', 'CSV Drag.app (upload manual)'),
  ('manual_horas', 'Lançamento manual de horas'),
  ('one_pager', 'One Pager semanal'),
  ('ga4', 'Google Analytics 4 (OS2)'),
  ('metabase', 'Metabase / ops DB'),
  ('derived', 'Agregação interna / mart')
on conflict (source) do nothing;

-- ═══════════════════════════════════════════════════════════
-- Controle de ETL / frescor
-- ═══════════════════════════════════════════════════════════

create table if not exists etl_runs (
  id             bigserial primary key,
  source         text not null references dim_source (source),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                   check (status in ('running', 'ok', 'error')),
  rows_upserted  int not null default 0,
  cursor_from    timestamptz,
  cursor_to      timestamptz,
  error_message  text,
  meta           jsonb not null default '{}'::jsonb
);

create index if not exists etl_runs_source_started_idx
  on etl_runs (source, started_at desc);

-- Último sync bem-sucedido por fonte (para o app mostrar "dados de …")
create or replace view v_etl_freshness as
select distinct on (source)
  source,
  finished_at as as_of,
  rows_upserted,
  cursor_from,
  cursor_to
from etl_runs
where status = 'ok'
order by source, finished_at desc nulls last;

-- ═══════════════════════════════════════════════════════════
-- Fatos — Suporte (upload manual Drag)
-- ═══════════════════════════════════════════════════════════

-- Grão: 1 card/ticket por relatório de suporte
create table if not exists fact_support_ticket (
  ticket_id              text not null,          -- hash estável (report_id + card name + tags)
  source_report_id       bigint references reports (id) on delete cascade,
  report_month           text not null,          -- YYYY-MM
  board                  text,
  card_name              text not null,
  product_code           text not null references dim_product (product_code),
  issue_type             text not null references dim_issue_type (issue_type),
  is_notification        boolean not null default false,
  is_closed              boolean not null default false,
  is_bug                 boolean not null default false,
  is_action_required     boolean not null default false,
  is_awaiting_response   boolean not null default false,
  is_in_progress         boolean not null default false,
  contact_email_hash     text,                   -- sha256(email || salt) — sem PII raw
  tenant_id              text references dim_tenant (tenant_id),
  feature_key            text references dim_feature (feature_key),
  tags                   text[] not null default '{}',
  categories             text[] not null default '{}',
  source                 text not null default 'drag' references dim_source (source),
  ingested_at            timestamptz not null default now(),
  primary key (source_report_id, ticket_id)
);

create index if not exists fact_support_ticket_month_idx
  on fact_support_ticket (report_month);
create index if not exists fact_support_ticket_product_idx
  on fact_support_ticket (product_code, report_month);
create index if not exists fact_support_ticket_issue_idx
  on fact_support_ticket (issue_type, report_month);
create index if not exists fact_support_ticket_tenant_idx
  on fact_support_ticket (tenant_id)
  where tenant_id is not null;
create index if not exists fact_support_ticket_real_idx
  on fact_support_ticket (report_month)
  where is_notification = false;

-- Agregado mensal (materializado no save do relatório)
create table if not exists fact_support_month (
  report_month           text not null,
  product_code           text not null references dim_product (product_code),
  source_report_id       bigint references reports (id) on delete set null,
  total_cards            int not null default 0,
  notifications          int not null default 0,
  tickets                int not null default 0,   -- realTickets
  closed                 int not null default 0,
  open_tickets           int not null default 0,
  bugs                   int not null default 0,
  fore_emails            int not null default 0,
  fore_tickets           int not null default 0,
  action_required        int not null default 0,
  awaiting               int not null default 0,
  in_progress            int not null default 0,
  unique_contacts        int not null default 0,
  closed_rate            numeric(5,2),             -- 0–100
  cats_json              jsonb not null default '[]'::jsonb,
  env_type_matrix        jsonb not null default '[]'::jsonb,
  category_insights      jsonb not null default '[]'::jsonb,
  custom_insights        text,
  source                 text not null default 'drag' references dim_source (source),
  as_of                  timestamptz not null default now(),
  primary key (report_month, product_code)
);

-- ═══════════════════════════════════════════════════════════
-- Fatos — Horas (lançamento manual)
-- ═══════════════════════════════════════════════════════════

create table if not exists fact_dev_effort (
  effort_id              uuid primary key default gen_random_uuid(),
  source_report_id       bigint references reports (id) on delete cascade,
  report_month           text not null,          -- YYYY-MM
  week_of_month          int not null check (week_of_month between 1 and 5),
  work_date              date,                   -- opcional se no futuro houver data
  product_code           text not null references dim_product (product_code),
  category               text not null references dim_category (category),
  minutes                int not null check (minutes >= 0),
  description            text,
  feature_key            text references dim_feature (feature_key),
  source                 text not null default 'manual_horas' references dim_source (source),
  ingested_at            timestamptz not null default now()
);

create index if not exists fact_dev_effort_month_idx
  on fact_dev_effort (report_month, product_code);
create index if not exists fact_dev_effort_category_idx
  on fact_dev_effort (category, report_month);

-- ═══════════════════════════════════════════════════════════
-- Fatos — One Pager (snapshot semanal)
-- ═══════════════════════════════════════════════════════════

create table if not exists fact_product_health (
  health_id              uuid primary key default gen_random_uuid(),
  source_report_id       bigint references reports (id) on delete cascade,
  week_start             date not null,
  product_code           text not null default 'OS2' references dim_product (product_code),
  product_label          text,
  stakeholder            text,
  rag_scope              smallint not null default 0 check (rag_scope between 0 and 3),
  rag_roadmap            smallint not null default 0 check (rag_roadmap between 0 and 3),
  rag_resources          smallint not null default 0 check (rag_resources between 0 and 3),
  rag_risk               smallint not null default 0 check (rag_risk between 0 and 3),
  rag_cost               smallint not null default 0 check (rag_cost between 0 and 3),
  deliveries_text        text,
  summary_text           text,
  team_text              text,
  indicators_text        text,
  risks_high_text        text,
  risks_med_text         text,
  risks_low_text         text,
  cur_sprint             int,
  roadmap_items          jsonb not null default '[]'::jsonb,
  source                 text not null default 'one_pager' references dim_source (source),
  as_of                  timestamptz not null default now(),
  unique (week_start, product_code)
);

create index if not exists fact_product_health_week_idx
  on fact_product_health (week_start desc);

-- ═══════════════════════════════════════════════════════════
-- Fatos — Google Analytics 4 (OS2)
-- ═══════════════════════════════════════════════════════════

-- Grão: dia × evento × feature (tenant opcional)
create table if not exists fact_product_usage_daily (
  usage_id               bigserial primary key,
  date_id                date not null references dim_date (date_id),
  product_code           text not null default 'OS2' references dim_product (product_code),
  event_name             text not null,
  feature_key            text references dim_feature (feature_key),
  tenant_id              text references dim_tenant (tenant_id),
  users                  int not null default 0,
  sessions               int not null default 0,
  event_count            int not null default 0,
  source                 text not null default 'ga4' references dim_source (source),
  as_of                  timestamptz not null default now()
);

create unique index if not exists fact_product_usage_daily_uidx
  on fact_product_usage_daily (
    date_id,
    product_code,
    event_name,
    coalesce(feature_key, ''),
    coalesce(tenant_id, '')
  );

create index if not exists fact_product_usage_daily_feature_idx
  on fact_product_usage_daily (feature_key, date_id)
  where feature_key is not null;

-- ═══════════════════════════════════════════════════════════
-- Fatos — Metabase / ops
-- ═══════════════════════════════════════════════════════════

create table if not exists fact_business_daily (
  business_id            bigserial primary key,
  date_id                date not null references dim_date (date_id),
  tenant_id              text references dim_tenant (tenant_id),
  product_code           text not null default 'OS2' references dim_product (product_code),
  active_users           int,
  sessions               int,
  transactions_count     int,
  mrr_cents              bigint,
  plan                   text,
  backend_errors         int,
  nps_score              numeric(5,2),
  csat_score             numeric(5,2),
  extras                 jsonb not null default '{}'::jsonb,
  source                 text not null default 'metabase' references dim_source (source),
  as_of                  timestamptz not null default now()
);

create unique index if not exists fact_business_daily_uidx
  on fact_business_daily (
    date_id,
    product_code,
    coalesce(tenant_id, '')
  );

create index if not exists fact_business_daily_tenant_idx
  on fact_business_daily (tenant_id, date_id)
  where tenant_id is not null;

-- ═══════════════════════════════════════════════════════════
-- Helpers: popular dim_date
-- ═══════════════════════════════════════════════════════════

create or replace function seed_dim_date(start_d date, end_d date)
returns void
language plpgsql
as $$
declare
  d date;
begin
  d := start_d;
  while d <= end_d loop
    insert into dim_date (
      date_id, year, quarter, month, month_key,
      week_of_month, week_start, iso_year, iso_week, is_month_end
    ) values (
      d,
      extract(year from d)::int,
      extract(quarter from d)::int,
      extract(month from d)::int,
      to_char(d, 'YYYY-MM'),
      least(5, ceil(extract(day from d) / 7.0)::int),
      date_trunc('week', d)::date,  -- segunda (ISO)
      extract(isoyear from d)::int,
      extract(week from d)::int,
      (d = (date_trunc('month', d) + interval '1 month - 1 day')::date)
    )
    on conflict (date_id) do nothing;
    d := d + 1;
  end loop;
end;
$$;

-- Seed inicial: 24 meses a partir de 2024-01-01 (ajuste se precisar)
select seed_dim_date('2024-01-01'::date, (date_trunc('month', now()) + interval '2 months' - interval '1 day')::date);

-- ═══════════════════════════════════════════════════════════
-- Marts (views) — camada de consumo do app / API BI
-- ═══════════════════════════════════════════════════════════

-- Pulse mensal por produto (cruzamento suporte × esforço × uso × negócio × saúde)
create or replace view mart_product_pulse as
with support as (
  select
    report_month as period,
    product_code,
    sum(tickets) as tickets,
    sum(closed) as closed,
    sum(bugs) as bugs,
    sum(unique_contacts) as unique_contacts,
    sum(notifications) as notifications,
    case when sum(tickets) > 0
      then round(100.0 * sum(closed) / sum(tickets), 2)
      else null end as closed_rate,
    max(as_of) as support_as_of
  from fact_support_month
  group by report_month, product_code
),
effort as (
  select
    report_month as period,
    product_code,
    sum(minutes) as dev_minutes,
    round(sum(minutes) / 60.0, 2) as dev_hours,
    sum(minutes) filter (where category = 'BUG') as bugfix_minutes,
    sum(minutes) filter (where category = 'NOVA FEATURE') as feature_minutes,
    sum(minutes) filter (where category = 'SUPORTE') as support_minutes,
    count(*) as effort_rows
  from fact_dev_effort
  group by report_month, product_code
),
usage as (
  select
    d.month_key as period,
    u.product_code,
    sum(u.users) filter (where u.event_name in ('session_start', 'user_engagement')) as mau_proxy,
    sum(u.sessions) as sessions,
    sum(u.event_count) filter (where u.event_name = 'feature_use') as feature_events,
    max(u.as_of) as ga_as_of
  from fact_product_usage_daily u
  join dim_date d on d.date_id = u.date_id
  group by d.month_key, u.product_code
),
business as (
  select
    d.month_key as period,
    b.product_code,
    count(distinct b.tenant_id) filter (where coalesce(b.active_users, 0) > 0) as active_tenants,
    sum(b.active_users) as active_users_sum,
    max(b.mrr_cents) as mrr_cents_max,
    sum(b.backend_errors) as backend_errors,
    max(b.as_of) as business_as_of
  from fact_business_daily b
  join dim_date d on d.date_id = b.date_id
  group by d.month_key, b.product_code
),
health as (
  select
    to_char(week_start, 'YYYY-MM') as period,
    product_code,
    round(avg(rag_risk), 2) as rag_risk_avg,
    round(avg(rag_scope), 2) as rag_scope_avg,
    round(avg(rag_roadmap), 2) as rag_roadmap_avg,
    max(as_of) as health_as_of
  from fact_product_health
  group by to_char(week_start, 'YYYY-MM'), product_code
),
periods as (
  select period, product_code from support
  union
  select period, product_code from effort
  union
  select period, product_code from usage
  union
  select period, product_code from business
  union
  select period, product_code from health
)
select
  p.period,
  p.product_code,
  s.tickets,
  s.closed,
  s.closed_rate,
  s.bugs,
  s.unique_contacts,
  s.notifications,
  e.dev_hours,
  e.bugfix_minutes,
  e.feature_minutes,
  e.support_minutes,
  case when coalesce(e.dev_minutes, 0) > 0
    then round(100.0 * coalesce(e.bugfix_minutes, 0) / e.dev_minutes, 2)
    else null end as pct_bugfix,
  u.mau_proxy,
  u.sessions,
  u.feature_events,
  case when coalesce(u.mau_proxy, 0) > 0 and s.tickets is not null
    then round(s.tickets::numeric / u.mau_proxy, 4)
    else null end as tickets_per_mau,
  b.active_tenants,
  b.active_users_sum,
  b.mrr_cents_max,
  b.backend_errors,
  h.rag_risk_avg,
  h.rag_scope_avg,
  h.rag_roadmap_avg,
  s.support_as_of,
  u.ga_as_of,
  b.business_as_of,
  h.health_as_of
from periods p
left join support s using (period, product_code)
left join effort e using (period, product_code)
left join usage u using (period, product_code)
left join business b using (period, product_code)
left join health h using (period, product_code);

-- Saúde por feature (semana): uso GA × tickets × horas
create or replace view mart_feature_health as
with weeks as (
  select distinct week_start from dim_date
),
usage_w as (
  select
    d.week_start,
    u.product_code,
    coalesce(u.feature_key, '_unmapped') as feature_key,
    sum(u.event_count) as event_count,
    sum(u.users) as users,
    max(u.as_of) as ga_as_of
  from fact_product_usage_daily u
  join dim_date d on d.date_id = u.date_id
  where u.event_name in ('feature_use', 'page_view', 'error_shown')
  group by d.week_start, u.product_code, coalesce(u.feature_key, '_unmapped')
),
tickets_w as (
  select
    d.week_start,
    t.product_code,
    coalesce(t.feature_key, '_unmapped') as feature_key,
    count(*) filter (where not t.is_notification) as tickets,
    count(*) filter (where t.is_bug) as bugs,
    count(*) filter (where t.is_closed and not t.is_notification) as closed
  from fact_support_ticket t
  join dim_date d on d.month_key = t.report_month and d.is_month_end  -- proxy: mês → última semana
  where t.feature_key is not null
  group by d.week_start, t.product_code, coalesce(t.feature_key, '_unmapped')
),
effort_w as (
  select
    -- aproxima semana pelo week_of_month dentro do report_month
    (date_trunc('month', (e.report_month || '-01')::date)
      + ((e.week_of_month - 1) * 7) * interval '1 day')::date as week_proxy,
    e.product_code,
    coalesce(e.feature_key, '_unmapped') as feature_key,
    sum(e.minutes) as minutes
  from fact_dev_effort e
  where e.feature_key is not null
  group by 1, e.product_code, coalesce(e.feature_key, '_unmapped')
)
select
  coalesce(u.week_start, date_trunc('week', e.week_proxy)::date) as week_start,
  coalesce(u.product_code, e.product_code, t.product_code) as product_code,
  coalesce(u.feature_key, e.feature_key, t.feature_key) as feature_key,
  f.feature_name,
  f.module,
  u.event_count,
  u.users,
  t.tickets,
  t.bugs,
  t.closed,
  e.minutes as dev_minutes,
  u.ga_as_of
from usage_w u
full outer join effort_w e
  on e.product_code = u.product_code
 and e.feature_key = u.feature_key
 and date_trunc('week', e.week_proxy)::date = u.week_start
full outer join tickets_w t
  on t.product_code = coalesce(u.product_code, e.product_code)
 and t.feature_key = coalesce(u.feature_key, e.feature_key)
 and t.week_start = coalesce(u.week_start, date_trunc('week', e.week_proxy)::date)
left join dim_feature f
  on f.feature_key = nullif(coalesce(u.feature_key, e.feature_key, t.feature_key), '_unmapped');

-- Saúde por tenant (semana)
create or replace view mart_tenant_health as
with usage_w as (
  select
    d.week_start,
    u.tenant_id,
    u.product_code,
    sum(u.users) as users,
    sum(u.sessions) as sessions,
    sum(u.event_count) as events
  from fact_product_usage_daily u
  join dim_date d on d.date_id = u.date_id
  where u.tenant_id is not null
  group by d.week_start, u.tenant_id, u.product_code
),
biz_w as (
  select
    d.week_start,
    b.tenant_id,
    b.product_code,
    avg(b.active_users)::int as active_users_avg,
    sum(b.transactions_count) as transactions,
    sum(b.backend_errors) as backend_errors,
    max(b.mrr_cents) as mrr_cents
  from fact_business_daily b
  join dim_date d on d.date_id = b.date_id
  where b.tenant_id is not null
  group by d.week_start, b.tenant_id, b.product_code
),
tickets_m as (
  select
    t.report_month,
    t.tenant_id,
    t.product_code,
    count(*) filter (where not t.is_notification) as tickets,
    count(*) filter (where t.is_bug) as bugs
  from fact_support_ticket t
  where t.tenant_id is not null
  group by t.report_month, t.tenant_id, t.product_code
)
select
  coalesce(u.week_start, b.week_start) as week_start,
  coalesce(u.tenant_id, b.tenant_id) as tenant_id,
  tn.tenant_name,
  tn.plan,
  tn.segment,
  coalesce(u.product_code, b.product_code) as product_code,
  u.users as ga_users,
  u.sessions as ga_sessions,
  b.active_users_avg,
  b.transactions,
  b.backend_errors,
  b.mrr_cents,
  tm.tickets as support_tickets_month,
  tm.bugs as support_bugs_month
from usage_w u
full outer join biz_w b
  on b.week_start = u.week_start
 and b.tenant_id = u.tenant_id
 and b.product_code = u.product_code
left join dim_tenant tn
  on tn.tenant_id = coalesce(u.tenant_id, b.tenant_id)
left join tickets_m tm
  on tm.tenant_id = coalesce(u.tenant_id, b.tenant_id)
 and tm.product_code = coalesce(u.product_code, b.product_code)
 and tm.report_month = to_char(coalesce(u.week_start, b.week_start), 'YYYY-MM');

-- ═══════════════════════════════════════════════════════════
-- RLS: tabelas BI só via service_role (API Vercel), igual reports
-- ═══════════════════════════════════════════════════════════

alter table dim_date enable row level security;
alter table dim_product enable row level security;
alter table dim_tenant enable row level security;
alter table dim_feature enable row level security;
alter table dim_issue_type enable row level security;
alter table dim_category enable row level security;
alter table dim_source enable row level security;
alter table etl_runs enable row level security;
alter table fact_support_ticket enable row level security;
alter table fact_support_month enable row level security;
alter table fact_dev_effort enable row level security;
alter table fact_product_health enable row level security;
alter table fact_product_usage_daily enable row level security;
alter table fact_business_daily enable row level security;

-- Observação: sem policies para anon/authenticated → acesso só com service_role.
