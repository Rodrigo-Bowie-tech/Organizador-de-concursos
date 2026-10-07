import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

// O app é publicado como um Artifact do claude.ai: uma página HTML com o JS e o CSS
// do app embutidos. React e ReactDOM vêm do cdnjs (UMD) como globais, por isso ficam
// fora do bundle no build. Ver scripts/montar-artifact.mjs.
//
// `vite build --mode web` gera o app instalável do GitHub Pages (dist/web-build): o React
// vai dentro do bundle e o app usa o banco do aparelho. Ver scripts/montar-web.mjs.
export default defineConfig(({ command, mode }) => ({
  plugins: [tailwindcss()],
  oxc: {
    jsx: { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' },
    jsxInject: `import React from 'react'`,
  },
  define: {
    __WEB__: JSON.stringify(mode === 'web'),
    ...(command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
  },
  build: {
    outDir: mode === 'web' ? 'dist/web-build' : 'dist/build',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.tsx',
      formats: ['iife'],
      name: 'OrganizadorDeConcursos',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
    rolldownOptions: {
      external: mode === 'web' ? [] : ['react', 'react-dom', 'react-dom/client'],
      // O "use client" do lucide-react não se aplica a um bundle só de navegador.
      onwarn(aviso, avisar) {
        if (aviso.code !== 'MODULE_LEVEL_DIRECTIVE') avisar(aviso);
      },
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
