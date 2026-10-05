# Backend — relatórios na nuvem

O app salva relatórios no **Supabase** via API serverless na **Vercel** (`/api/reports`).

## 1. Criar projeto Supabase

1. [supabase.com](https://supabase.com) → New project  
2. **SQL Editor** → cole e execute `supabase/schema.sql`  
3. **Project Settings → API** → copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

Nunca exponha a `service_role` no frontend.

## 2. Variáveis na Vercel

**Project → Settings → Environment Variables** (Production + Preview):

| Variável | Onde usar |
|----------|-----------|
| `SUPABASE_URL` | Servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor |
| `REPORTS_API_KEY` | Servidor (valida header `x-api-key`) |
| `VITE_REPORTS_API_KEY` | Build frontend (mesmo valor da chave acima) |

Invente uma chave longa para `REPORTS_API_KEY`, por exemplo: `openssl rand -hex 32`

## 3. Redeploy

Após salvar as variáveis: **Deployments → Redeploy**.

Teste: abra `https://seu-dominio.vercel.app/api/health`

Resposta com tudo certo:
```json
{
  "ok": true,
  "cloud": true,
  "config": {
    "SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true,
    "REPORTS_API_KEY": true
  }
}
```

Se `cloud` for `false`, o JSON lista `missing` com o que falta.

### `cloud: false` — causas comuns

| Problema | Solução |
|----------|---------|
| Só criou `VITE_REPORTS_API_KEY` | Crie também **`REPORTS_API_KEY`** (mesmo valor) — o servidor não lê variáveis `VITE_*` |
| Variável só em Development | Marque **Production** e **Preview** ao salvar |
| Usou `anon` em vez de `service_role` | Em Supabase → API → copie a chave **service_role** |
| Adicionou vars e não redeployou | **Deployments → Redeploy** |
| Nome digitado errado | Exatamente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REPORTS_API_KEY` |

## 4. No app

- Relatórios de **suporte** são salvos **automaticamente** ao carregar o CSV (substitui o mesmo período no histórico)
- **☁ Atualizar histórico** força nova gravação manual
- **Histórico** mostra status da nuvem e botão **Sincronizar**
- **Enviar locais para nuvem** migra o histórico antigo do `localStorage`

Sem as variáveis, o app continua funcionando só com armazenamento local.

## 5. Warehouse BI (Product Pulse)

Além de `reports`, [`supabase/schema_bi.sql`](../supabase/schema_bi.sql) cria dimensões, fatos e marts.

Ordem no SQL Editor:

1. `supabase/schema.sql`
2. `supabase/schema_bi.sql`

Documentação: [`docs/BI_MODEL.md`](BI_MODEL.md) · [`docs/BI_DESIGN_SCOPE.md`](BI_DESIGN_SCOPE.md) · eventos GA: [`docs/BI_GA_EVENTS.md`](BI_GA_EVENTS.md).

Ao salvar um relatório (`POST /api/reports`), o servidor faz upsert nas facts e grava `etl_runs`:

| Tipo | Facts |
|------|--------|
| suporte | `fact_support_month` + `fact_support_ticket` |
| horas | `fact_dev_effort` |
| op | `fact_product_health` |

E-mail de contato vira `contact_email_hash` (`sha256` com `REPORTS_PII_SALT`). Sem o salt, o hash fica nulo — o e-mail não é gravado nas facts.

Rotas (mesmo header `x-api-key` de `/api/reports`):

| Método | Rota |
|--------|------|
| GET | `/api/bi/pulse?from=YYYY-MM&to=YYYY-MM&product=OS2\|FORE\|ALL` |
| GET | `/api/bi/freshness` |
| GET | `/api/bi/features?week_start=YYYY-MM-DD` |
| GET | `/api/bi/tenants?week_start=YYYY-MM-DD` |
| GET/POST | `/api/bi/sync/ga` |
| GET/POST | `/api/bi/sync/metabase` |

Sem as credenciais, os syncs respondem `{ "ok": false, "reason": "not_configured" }`. Com `GA_*`, `GET /api/bi/sync/ga` busca a Data API e grava `fact_product_usage_daily`. `POST` com `{ "rows": [...] }` continua para carga manual. O cron diário em `vercel.json` (`0 11 * * *`, 08:00 em Brasília) chama essa rota; a Vercel envia `Authorization: Bearer CRON_SECRET` quando a variável existe. Abrir o Pulse ou o botão Sincronizar GA dispara o mesmo fetch na hora. O plano Hobby da Vercel só permite cron uma vez por dia. O Metabase, com credenciais, ainda não busca o remoto: `POST` com `{ "rows": [...] }` grava `fact_business_daily`.

GitHub Pages não serve `/api`. O Pulse na Pages usa o histórico local e deixa GA/Metabase vazios.

### Variáveis extras

| Variável | Uso |
|----------|-----|
| `REPORTS_PII_SALT` | Salt do hash de e-mail |
| `GA_PROPERTY_ID`, `GA_CLIENT_EMAIL`, `GA_PRIVATE_KEY` | GA4 (servidor) |
| `CRON_SECRET` | Bearer do cron da Vercel em `/api/bi/sync/ga` |
| `METABASE_URL`, `METABASE_API_KEY`, `METABASE_DATABASE_ID` | Metabase (servidor) |
