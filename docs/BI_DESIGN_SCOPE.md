# Escopo de design — BI de produto (LandscapeOS 2)

Resumo para atualizar o escopo de UX/UI. Detalhe técnico em [`BI_MODEL.md`](BI_MODEL.md).

---

## Visão do produto

Evoluir o hub atual (Suporte · Horas · One Pager · Histórico · Analytics) para um **BI de produto em um único ambiente**, cruzando:

| Fonte | Entrada | Tempo real? |
|-------|---------|-------------|
| Suporte (Drag) | Upload CSV **manual** | No momento do upload |
| Horas | Lançamento manual | No save |
| One Pager | Formulário semanal | No save |
| Google Analytics OS2 | Sync automático (cron 1×/dia no Hobby) e ao abrir o Pulse | Diário, ou na hora ao abrir o Pulse |
| Metabase / ops | Sync automático | Quase tempo real (5–15 min) |

O usuário não troca de ferramenta para cruzar uso, suporte, esforço e negócio.

---

## O que o design precisa cobrir

### 1. Analytics vira “Product Pulse” (hub BI)

Não é só gráfico de tickets salvos. Três níveis de leitura:

1. **Pulse (mês × produto)** — visão executiva  
2. **Features (semana)** — onde dói no produto  
3. **Tenants / contas (semana)** — onde dói no cliente  

Filtros globais sugeridos: **período**, **produto (OS2 / FORE)**, opcionalmente sprint.

### 2. Frescor dos dados (obrigatório na UI)

Cada bloco deve mostrar origem + “atualizado em”:

- Suporte · upload manual · `as_of`
- GA · sync · `as_of`
- Metabase · sync · `as_of`
- Horas / One Pager · save manual · `as_of`

Evita parecer que suporte CSV é live igual ao GA.

### 3. KPIs do Pulse (primeiro viewport do BI)

Prioridade visual (um job: saúde do produto no período):

| KPI | Cruzamento |
|-----|------------|
| MAU / sessões | GA |
| Tickets · taxa de fechamento · bugs | Suporte |
| Tickets por MAU | Suporte ÷ GA |
| Horas dev · % bugfix | Horas |
| Tenants ativos · erros backend | Metabase |
| RAG risco (média) | One Pager |

Evitar dashboard inchado: **uma faixa de KPIs + 1–2 gráficos principais**; o resto em abas/seções abaixo.

### 4. Seções / abas sugeridas

| Seção | Pergunta que responde | Conteúdo |
|-------|----------------------|----------|
| **Pulse** | Como está o OS2 este mês? | KPIs + tendência mensal |
| **Suporte** | O que está gerando chamado? | Volume, bugs, tipos, categorias (fluxo atual enriquecido) |
| **Uso (GA)** | O que as pessoas usam? | Features, eventos, funis simples |
| **Esforço** | Onde o time gasta tempo? | OS2/FORE × categoria |
| **Contas** | Quem está em risco? | Tenant: uso ↓ + tickets ↑ |
| **Qualitativo** | O que o one pager diz? | RAG + riscos da semana |

Upload de suporte e editores de Horas/OP **permanecem** nas telas atuais do hub; o BI **consome** o que já foi salvo.

### 5. Insights “mágicos” (cards de narrativa)

Estados prontos para design (não só tabelas):

- **Dor × uso** — feature com muitos eventos e muitos tickets  
- **Bug tax** — bugs altos vs horas em BUG  
- **Conta em risco** — uso caindo + suporte subindo (+ RAG vermelho)  
- **FORE vs OS2** — split lado a lado  

Cada card: título curto, 1 métrica âncora, 1 frase de contexto, CTA opcional (“ver feature”, “ver mês de suporte”).

### 6. Fluxos que o design não deve quebrar

- Upload manual do CSV de suporte (inalterado no fluxo)  
- Auto-save no histórico após gerar relatório  
- Offline / só localStorage se nuvem estiver off — BI completo **depende da Vercel + Supabase**; estados vazios e empty states importam  
- Export PDF/JSON dos relatórios atuais continua fora do BI  

### 7. Empty states e permissões

- Sem CSV no mês → Pulse mostra GA/Metabase e placeholder de suporte  
- Sem GA configurado → banner “conecte Analytics”  
- Sem Metabase → esconde bloco de negócio ou estado “não configurado”  
- Uso interno: sem multi-login por enquanto (mesma chave de API do app)

---

## Fora de escopo (por agora)

- Substituir o Drag por API automática de tickets  
- Self-serve de clientes finais (é ferramenta interna)  
- Editor visual de dashboards tipo Metabase  
- Tempo real estrito (&lt; 1 min) no GA  

---

## Entidades para wireframes (vocabulário)

Use estes nomes nos frames:

- **Period** (mês `YYYY-MM` ou semana)  
- **Product** (`OS2` / `FORE`)  
- **Feature** (`feature_key`)  
- **Tenant** (conta)  
- **Pulse** (mart mensal cruzado)  
- **Freshness** (badge por fonte)  

---

## Fases de entrega (alinhamento design × eng)

| Fase | Design | Eng |
|------|--------|-----|
| **P0** | Pulse + freshness + empty states | Schema BI + ETL suporte/horas/OP + API pulse |
| **P1** | Aba Uso (GA) + insights dor×uso | Sync GA4 |
| **P2** | Aba Contas + cards risco | Sync Metabase |
| **P3** | Feature health detalhado | Mapeamento `feature_key` no OS2 + suporte |

---

## Uma frase para o escopo

> Hub interno de BI do LandscapeOS 2 que cruza suporte (CSV manual), horas, one pager, Google Analytics e Metabase num Pulse único, com filtros por período/produto e indicação clara do frescor de cada fonte.
