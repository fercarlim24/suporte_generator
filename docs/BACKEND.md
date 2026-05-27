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

Invente uma chave longa, por exemplo: `openssl rand -hex 32`

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

- **☁ Salvar** envia para nuvem + navegador  
- **Histórico** mostra status da nuvem e botão **Sincronizar**  
- **Enviar locais para nuvem** migra o histórico antigo do `localStorage`

Sem as variáveis, o app continua funcionando só com armazenamento local.
