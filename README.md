# suporte_generator

Gerador de relatórios internos do **LandscapeOS 2** (suporte, horas de desenvolvimento e one pager de produto).

A entrada é a **seleção de produto** (OS2 ou FORE). Com um produto escolhido, a sidebar abre Início, Product Pulse, os geradores e o Histórico. O **Início** resume o mês escolhido (tickets, resolução, bugs e horas) e o status de cada gerador, só com o que já foi salvo para aquele produto e período. O estado `{ product, period, screen, pulseTab }` fica em `localStorage` e a rota é o hash (`#/OS2/inicio`, `#/FORE/pulse/uso`, …).

## Ferramentas

- **Suporte** — CSV do Drag.app, em três passos: fonte, revisão e exportação (pede confirmação antes de substituir o mês)
- **Horas** — lançamento manual numa grade categoria × OS2/FORE, com cópia da semana anterior
- **One Pager** — resumo semanal, status por frente e roadmap de sprints editável
- **Histórico** — relatórios do produto e do período, com filtro por tipo e exportação PDF/JSON
- **Product Pulse (BI)** — saúde do produto no período: suporte, horas, one pager e, quando configurados, GA4 e Metabase

## Product Pulse (BI)

A tela **Product Pulse** cruza o que já foi salvo. O upload de suporte continua manual; horas e one pager também. GA4 e Metabase entram por sync no servidor (stubs até as credenciais existirem).

- Modelo → [`docs/BI_MODEL.md`](docs/BI_MODEL.md)
- Escopo de UX → [`docs/BI_DESIGN_SCOPE.md`](docs/BI_DESIGN_SCOPE.md)
- Eventos GA4 → [`docs/BI_GA_EVENTS.md`](docs/BI_GA_EVENTS.md)
- SQL → [`supabase/schema_bi.sql`](supabase/schema_bi.sql)

No SQL Editor do Supabase, nesta ordem:

1. [`supabase/schema.sql`](supabase/schema.sql) — tabela `reports`
2. [`supabase/schema_bi.sql`](supabase/schema_bi.sql) — dimensões, fatos, marts

Cada save na nuvem (suporte, horas, one pager) alimenta as facts. A UI lê `GET /api/bi/pulse` e `GET /api/bi/freshness` (header `x-api-key`, a mesma de `/api/reports`).

Sem nuvem, ou no GitHub Pages (não serve `/api`), o Pulse usa o histórico do navegador e mostra empty state para GA e Metabase.

Variáveis novas (só na Vercel, nunca no frontend): `REPORTS_PII_SALT`, `GA_PROPERTY_ID`, `GA_CLIENT_EMAIL`, `GA_PRIVATE_KEY`, `METABASE_URL`, `METABASE_API_KEY`, `METABASE_DATABASE_ID`. Ver [`.env.example`](.env.example) e [`docs/BACKEND.md`](docs/BACKEND.md).

## Desenvolvimento

Requisitos: Node.js 18+

```bash
npm install
npm run dev
```

Abra a URL exibida pelo Vite (geralmente `http://localhost:5173`).

## Build para produção

```bash
npm run build
```

Os arquivos estáticos ficam em `dist/`.

### Vercel

1. Conecte o repositório GitHub em [vercel.com](https://vercel.com) (se ainda não estiver).
2. **Não** defina a variável `GITHUB_PAGES` no projeto — o `base` do Vite deve ser `/` (padrão).
3. Build: `npm run build` · Output: `dist` (já definido em `vercel.json`).
4. Para atualizar: faça **push em `main`** ou no dashboard **Deployments → ⋯ → Redeploy**.

### GitHub Pages

Em **Settings → Pages → Build and deployment → Source: GitHub Actions**, cada push em `main` publica o app automaticamente.

URL: https://fercarlim24.github.io/suporte_generator/

### Outros hosts

```bash
npm run build              # site na raiz do domínio
GITHUB_PAGES=true npm run build   # subpasta /suporte_generator/
```

Para desenvolvimento local use `npm run dev` — o app usa módulos ES (`import`).

## Testes

```bash
npm test
```

## Histórico

- **Local:** `ls2-history-v2` (JSON) + legado `ls2-history-v1` (HTML)
- **Nuvem (opcional):** Supabase + API na Vercel — ver **[docs/BACKEND.md](docs/BACKEND.md)**
- Exporte backup com **⬇ JSON** em cada módulo

## Estrutura

```
src/
  lib/       # lógica por módulo
  styles/    # tokens Nocturne (`tokens.css`) e componentes
  main.js    # inicialização
legacy/      # index monolítico original (referência)
```
