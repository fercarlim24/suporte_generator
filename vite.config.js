import { defineConfig } from 'vite';

// GitHub Pages: https://<user>.github.io/<repo>/
const base = process.env.GITHUB_PAGES === 'true' ? '/suporte_generator/' : '/';

export default defineConfig({
  root: '.',
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
