# BI de produto — modelo de dados (LandscapeOS 2)

Transforma o `suporte_generator` de gerador de relatórios em **hub analítico**: suporte (upload manual), horas, one pager, Google Analytics (OS2) e Metabase/ops no mesmo warehouse (Supabase).

Schema SQL: [`supabase/schema_bi.sql`](../supabase/schema_bi.sql)  
Resumo para design: [`docs/BI_DESIGN_SCOPE.md`](BI_DESIGN_SCOPE.md)

## Princípio

| Camada | Papel |
|--------|--------|
| `reports` (já existe) | Documento/auditoria — preview, PDF, JSON |
| Dimensões + fatos | Warehouse canônico para cruzamento |
| Marts (`mart_*`) | Views prontas para a API / tela Analytics |

Upload de suporte **continua manual**. GA e Metabase entram por sync no backend (Vercel).

## Fontes e frescor

| Fonte | Como entra | Frescor típico |
|-------|------------|----------------|
| Drag CSV | Upload → parse → `fact_support_*` | No save |
| Horas | Input manual → `fact_dev_effort` | No save |
| One Pager | Formulário → `fact_product_health` | No save |
| GA4 OS2 | Cron API → `fact_product_usage_daily` | 15–60 min |
| Metabase / ops | Cron API ou SQL → `fact_business_daily` | 5–15 min |

`etl_runs` + view `v_etl_freshness` guardam `as_of` por fonte (UI deve exibir).

## Chaves de cruzamento

Sempre alinhar por:

1. **Tempo** — `month_key` (YYYY-MM) ou `week_start`
2. **Produto** — `OS2` | `FORE` | `GERAL`
3. **Feature** (quando houver) — `feature_key`
4. **Tenant** (quando houver) — `tenant_id`

Sem tenant no GA e no Drag, o cruzamento fica em produto/feature/mês (ainda útil).

## Dimensões

- `dim_date` — calendário + `month_key` + semana ISO
- `dim_product` — OS2, FORE, GERAL
- `dim_tenant` — conta Landscape
- `dim_feature` — módulo/tela/evento de produto
- `dim_issue_type` — alinhado ao `detectProblemType` do app
- `dim_category` — alinhado às categorias de horas
- `dim_source` — drag, manual_horas, one_pager, ga4, metabase, derived

## Fatos

### Suporte (manual)

- `fact_support_ticket` — 1 linha por card; flags `is_notification`, `is_closed`, `is_bug`; `contact_email_hash` (sem PII raw)
- `fact_support_month` — agregado do payload atual (`realTickets`, `closed`, `bugs`, `uniqueContacts`, matrizes JSON)

Mapeamento do payload `reports` tipo `suporte`:

| Payload atual | Destino |
|---------------|---------|
| `meta.reportMonth` | `report_month` |
| `data.realTickets` | `fact_support_month.tickets` |
| `data.closed` | `closed` |
| `data.bugs[]` | `bugs` + tickets com `is_bug` |
| `data.uniqueContacts` | `unique_contacts` |
| `data.envTypeMatrix` | `env_type_matrix` |
| `data.categoryInsights` | `category_insights` |
| `data.customInsights` | `custom_insights` |
| `data.dragMeta.board` | `board` nos tickets |

### Horas

`fact_dev_effort` ← `payload.rows[]` (`sem`, `sis`, `cat`, `mins`, `desc`) + `reportMonth`.

### One Pager

`fact_product_health` ← RAG (`esc/rm/rec/ri/cu`), textos, roadmap; grão `week_start × product_code`.

### GA4

`fact_product_usage_daily` ← dia × `event_name` × `feature_key?` × `tenant_id?`.

Eventos mínimos desejados no OS2: `feature_use`, `error_shown`, `login`, `page_view` (+ `tenant_id` / `feature_key` como params).

### Metabase / ops

`fact_business_daily` ← `active_users`, `mrr_cents`, `transactions_count`, `backend_errors`, NPS/CSAT opcional.

## Marts (consumo)

| View | Grão | Uso na UI |
|------|------|-----------|
| `mart_product_pulse` | mês × produto | Dashboard principal / pulse |
| `mart_feature_health` | semana × feature | Dor × uso × esforço |
| `mart_tenant_health` | semana × tenant | Contas em risco |
| `v_etl_freshness` | fonte | Badges “atualizado em…” |

### Insights-alvo

- Tickets / MAU
- Bugs vs horas em BUG
- Feature com uso ↑ e tickets ↑ (ou uso ↓)
- Tenant: suporte alto + uso caindo + RAG risco
- Split OS2 vs FORE (esforço, tickets, uso)

## API sugerida (próxima implementação)

```
GET /api/bi/pulse?from=YYYY-MM&to=YYYY-MM&product=OS2
GET /api/bi/features?week_start=YYYY-MM-DD
GET /api/bi/tenants?week_start=YYYY-MM-DD
GET /api/bi/freshness
```

Credenciais (`GA_*`, `METABASE_*`) só no servidor Vercel — mesmo padrão de [`docs/BACKEND.md`](BACKEND.md).

## Ordem de rollout

1. Rodar `schema.sql` + `schema_bi.sql` no Supabase  
2. ETL no save: suporte/horas/op → fatos  
3. Tela Analytics lê `mart_product_pulse`  
4. Sync GA4  
5. Sync Metabase / ops  
6. Telas feature + tenant health  

## PII

- E-mails de contato: apenas `sha256(email || salt)`  
- Nunca gravar payload Drag raw com e-mail em claro nas facts (ok permanecer em `reports.payload` com acesso restrito)
