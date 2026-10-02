# Prompt — atualizar ferramenta para BI de produto

Copie o bloco abaixo e cole num **novo Cloud Agent** (ou Agent Desktop) no repo `fercarlim24/suporte_generator`.

Preferência de base: branch do PR #11 (`cursor/bi-data-model-1478`) se ainda não estiver merged; senão `main` após merge.

---

## Prompt (copiar daqui)

```
Contexto
Repo: fercarlim24/suporte_generator — hub interno LandscapeOS 2 (Vite + JS vanilla).
Já existe modelo BI documentado e SQL:
- docs/BI_MODEL.md
- docs/BI_DESIGN_SCOPE.md
- supabase/schema_bi.sql
- docs/BACKEND.md (reports + nuvem)

Objetivo
Evoluir o Analytics atual para um BI de produto (Product Pulse) que cruza:
1) Suporte (CSV Drag — upload CONTINUA MANUAL)
2) Horas (lançamento manual)
3) One Pager
4) Google Analytics 4 do OS2 (sync via API no servidor)
5) Metabase / ops (sync ou embed + fatos no warehouse)

Não quebrar: fluxos atuais de Suporte, Horas, One Pager, Histórico, PDF/JSON, localStorage offline.

Leia primeiro
- README.md, docs/BI_MODEL.md, docs/BI_DESIGN_SCOPE.md, supabase/schema_bi.sql
- src/lib/analytics.js, history.js, suporte.js, horas.js, op.js, api.js
- api/reports/*, api/_lib/*

Escopo desta entrega = P0 + fundação P1 (sem depender de credenciais reais de GA/Metabase para a UI funcionar com empty states)

P0 — obrigatório
1) Confirmar/ajustar schema_bi.sql se necessário; documentar ordem de apply (schema.sql → schema_bi.sql).
2) ETL no save (quando cloud disponível):
   - Ao histAutoSave/histSave de suporte → upsert fact_support_ticket + fact_support_month a partir do payload atual
   - Horas → fact_dev_effort
   - One Pager → fact_product_health (week_start derivado da data do form)
   - Registrar etl_runs (source, status, rows_upserted)
   - PII: contact_email_hash = sha256(email + salt); salt em env REPORTS_PII_SALT; nunca gravar e-mail raw nas facts
3) API BI (Vercel serverless, auth x-api-key igual /api/reports):
   - GET /api/bi/pulse?from=&to=&product=
   - GET /api/bi/freshness
   - GET /api/bi/features?week_start= (pode retornar [] se vazio)
   - GET /api/bi/tenants?week_start= (pode retornar [] se vazio)
   Preferir ler mart_product_pulse / v_etl_freshness; se mart vazio, fallback agregando reports/histórico local no client só para suporte (comportamento atual).
4) UI — transformar tela Analytics em Product Pulse:
   - Filtros: período (mês from/to), produto (OS2 | FORE | ALL)
   - Faixa de KPIs (tickets, closed_rate, bugs, unique_contacts, dev_hours, pct_bugfix; placeholders para MAU/sessions/tenants se sem GA/MB)
   - 1–2 gráficos de tendência mensal
   - Abas/seções: Pulse | Suporte | Uso | Esforço | Contas | Qualitativo
   - Badges de freshness por fonte (origem + atualizado em)
   - Empty states claros: sem CSV no mês; GA não configurado; Metabase não configurado
   - Hub: renomear card Analytics para algo como “Product Pulse” / “BI” e atualizar descrição
5) .env.example: documentar REPORTS_PII_SALT, e placeholders GA_*/METABASE_* (mesmo sem implementar sync completo)
6) Testes Vitest para: hashing PII, mapeamento payload suporte→fact_support_month, agregação pulse a partir de fixtures
7) Atualizar README (Horas = manual; link BI; como aplicar schema_bi)

P1 — fundação (implementar stubs seguros)
8) Módulo api/bi/sync ou jobs documentados:
   - Stub GET/POST /api/bi/sync/ga e /api/bi/sync/metabase que retornam { ok:false, reason:'not_configured' } se env ausente
   - Se env presentes, estrutura pronta para upsert em fact_product_usage_daily / fact_business_daily (pode ser minimal)
9) Contratos de eventos GA no docs (feature_use, error_shown, login, page_view + feature_key/tenant_id) — já esboçados em BI_MODEL; refine se preciso

Restrições
- Stack atual: vanilla JS + Vite; não migrar para React sem pedido explícito
- Credenciais só no servidor; nunca expor service_role / GA private key no frontend
- GitHub Pages não serve /api — BI cloud só na Vercel; degradar graceful em Pages
- UI: preservar design system existente (src/styles/main.css); não reinventar visual do zero, mas Pulse deve ser usável e claro
- Commits claros; abrir/atualizar PR; rodar npm test

Critérios de aceite
- [ ] npm test passa
- [ ] npm run build passa
- [ ] Com cloud off: app continua igual (local), Analytics mostra dados de suporte do histórico + empty para GA/MB
- [ ] Com cloud on + schema_bi aplicado: save de suporte/horas/op popula facts; /api/bi/pulse e /api/bi/freshness respondem
- [ ] UI Pulse com filtros, KPIs, freshness, abas e empty states
- [ ] Docs atualizados

Ordem de trabalho sugerida
1. Branch a partir do modelo BI
2. Camada api/_lib/bi (map payloads → rows) + testes
3. Rotas /api/bi/*
4. Hook no history save → ETL
5. Refatorar analytics.js + index.html
6. Stubs sync + env + README
7. Testar build/test, PR

Ao terminar: resumo do que foi feito, como aplicar o SQL no Supabase, e quais env vars faltam para ligar GA/Metabase de verdade.
```

---

## Variante curta (só P0 UI + API, sem sync GA/MB)

Se quiser um agent mais barato/rápido, use:

```
No repo suporte_generator (base: branch do PR #11 ou main com docs/BI_* e supabase/schema_bi.sql), implemente o P0 do BI de produto descrito em docs/BI_DESIGN_SCOPE.md e docs/BI_MODEL.md:

- ETL no save (suporte/horas/op → facts) quando cloud on
- GET /api/bi/pulse e /api/bi/freshness (auth x-api-key)
- Reformular tela Analytics em Product Pulse (filtros período/produto, KPIs, freshness, abas, empty states)
- Manter upload manual de suporte e demais módulos
- Testes + README; npm test && npm run build
- Não implementar sync real GA/Metabase ainda — só empty states e env placeholders

Abra PR com o resultado.
```
