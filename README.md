# suporte_generator

Gerador de relatórios internos do **LandscapeOS 2** (suporte, horas de desenvolvimento e one pager de produto).

## Ferramentas

- **Suporte** — CSV do Drag.app (Daily Cards)
- **Horas** — CSV ou Google Sheets publicado
- **One Pager** — formulário semanal com roadmap
- **Histórico** — relatórios salvos no navegador (JSON estruturado; compatível com versões antigas em HTML)

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
  styles/    # CSS
  main.js    # inicialização
legacy/      # index monolítico original (referência)
```
