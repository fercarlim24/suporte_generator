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

Os arquivos estáticos ficam em `dist/`. Publique essa pasta (GitHub Pages, Netlify, etc.).

Para abrir sem build, use `npm run dev` — o app depende de módulos ES (`import`).

## Testes

```bash
npm test
```

## Histórico (localStorage)

- Chave atual: `ls2-history-v2` (payload JSON, versão 2)
- Relatórios antigos em `ls2-history-v1` (HTML) continuam visíveis como **legado**
- Exporte backup com o botão **⬇ JSON** em cada módulo

## Estrutura

```
src/
  lib/       # lógica por módulo
  styles/    # CSS
  main.js    # inicialização
legacy/      # index monolítico original (referência)
```
