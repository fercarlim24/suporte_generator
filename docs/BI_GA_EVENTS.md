# Eventos GA4 — contrato para o Product Pulse

O sync de GA grava `fact_product_usage_daily` (grão: dia × evento × feature × tenant). Com `GA_PROPERTY_ID`, `GA_CLIENT_EMAIL` e `GA_PRIVATE_KEY`, `GET /api/bi/sync/ga` busca os últimos 6 meses na Data API e faz o upsert. O cron horário da Vercel chama a mesma rota com `Authorization: Bearer CRON_SECRET`. `POST { "rows": [...] }` continua aceito para carga manual.

Parâmetros de evento no OS2 (custom dimensions / event params):

| Param | Obrigatório | Uso |
|-------|-------------|-----|
| `feature_key` | em `feature_use`, `page_view`, `error_shown` | casa com `dim_feature` |
| `tenant_id` | quando a sessão tem conta | casa com `dim_tenant` e `mart_tenant_health` |

`product_code` no warehouse é `OS2` para este stream.

## Eventos

| `event_name` | Quando disparar | Params | Colunas |
|--------------|-----------------|--------|---------|
| `feature_use` | ação concluída num módulo (ex.: baixar recibo) | `feature_key`, `tenant_id?` | `event_count`, `users` |
| `page_view` | abertura de tela | `feature_key` (tela), `tenant_id?` | `event_count`, `users` |
| `error_shown` | erro visível ao usuário | `feature_key?`, `tenant_id?` | `event_count` |
| `login` | sessão autenticada | `tenant_id?` | `users`, `sessions` |
| `session_start` | sessão GA (automático) | `tenant_id?` se der para enriquecer | entra no proxy de MAU junto com `user_engagement` |

`feature_key` sugerido: `modulo.acao` em minúsculas, estável (`recibo.download`, `auth.login`, `onboarding.step`). Não usar o título visível da tela — ele muda com copy.

## Linha de sync

```json
{
  "date_id": "2026-03-01",
  "product_code": "OS2",
  "event_name": "feature_use",
  "feature_key": "recibo.download",
  "tenant_id": "acme",
  "users": 12,
  "sessions": 0,
  "event_count": 40
}
```

`usage_grain` é montado no servidor: `date_id|product_code|event_name|feature_key|tenant_id`. Não enviar e-mail, nome de pessoa ou outro PII nos params.

## O que a UI lê

- Pulse / aba Uso: `mart_product_pulse` (`mau_proxy` soma `session_start` e `user_engagement`; `feature_events` soma `feature_use`)
- O fetch grava o MAU como uma linha `session_start` no dia 1 do mês, com `users` = active users daquele mês. Assim a soma do mart acompanha o cartão de usuários ativos do GA, em vez de somar usuários de cada dia.
- Aba Uso, bloco de features: `mart_feature_health` (`feature_use`, `page_view`, `error_shown`). Se a property não tiver `feature_key`, o sync usa o `event_name` no lugar.
- Sem `GA_PROPERTY_ID` + `GA_CLIENT_EMAIL` + `GA_PRIVATE_KEY`, a rota responde `{ "ok": false, "reason": "not_configured" }` e a aba mostra o empty state
