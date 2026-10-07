// Monta o app instalável (PWA) publicado no GitHub Pages a partir do build
// `vite build --mode web` (dist/web-build/app.js e app.css, com o React dentro).
//
// Saída: dist/web/
//   index.html             página com manifest, ícones e o JS/CSS com hash no nome
//   app.<hash>.js/.css     o app (cache permanente: o nome muda a cada versão)
//   manifest.webmanifest   nome, cores e ícones para instalar
//   sw.js                  service worker: guarda o app para abrir sem internet
//   icones/                copiados de web/icones (PNGs gerados por scripts/gerar-icones.mjs)
//
// Todos os caminhos são relativos: funciona em https://<usuario>.github.io/<repositorio>/
// e em qualquer outra pasta.

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(raiz, 'dist/web-build');
const saida = join(raiz, 'dist/web');

const FONTES =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Roboto+Mono:wght@500;600&display=swap';
const COR_TEMA = '#13846b';
const COR_TEMA_ESCURO = '#0c3f35';
const COR_FUNDO = '#f1f5f3';

const resumo = (conteudo) => createHash('sha256').update(conteudo).digest('hex').slice(0, 10);

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

const js = readFileSync(join(build, 'app.js'));
const css = readFileSync(join(build, 'app.css'));
const nomeJs = `app.${resumo(js)}.js`;
const nomeCss = `app.${resumo(css)}.css`;
writeFileSync(join(saida, nomeJs), js);
writeFileSync(join(saida, nomeCss), css);

cpSync(join(raiz, 'web/icones'), join(saida, 'icones'), { recursive: true });
const icones = readdirSync(join(saida, 'icones')).map((n) => `icones/${n}`);

const manifest = {
  id: './',
  name: 'Organizador de Concursos',
  short_name: 'Concursos',
  description: 'Estudos para concursos: edital, cronômetro, planejamento, revisões e questões. Funciona sem internet.',
  lang: 'pt-BR',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: COR_FUNDO,
  theme_color: COR_TEMA,
  categories: ['education', 'productivity'],
  icons: [
    { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icones/icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};
writeFileSync(join(saida, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Organizador de Concursos</title>
<meta name="description" content="${manifest.description}">
<meta name="theme-color" content="${COR_TEMA}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${COR_TEMA_ESCURO}" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icones/icone.svg" type="image/svg+xml">
<link rel="icon" href="icones/icone-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icones/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="${manifest.short_name}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTES}">
<link rel="stylesheet" href="${nomeCss}">
<style>:root{padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}</style>
</head>
<body>
<div id="raiz"></div>
<noscript><p style="padding:16px">O Organizador de Concursos precisa de JavaScript ligado.</p></noscript>
<script src="${nomeJs}"></script>
</body>
</html>
`;
writeFileSync(join(saida, 'index.html'), html);

const precache = ['./', nomeJs, nomeCss, 'manifest.webmanifest', ...icones];
const versao = resumo([html, js, css, JSON.stringify(manifest), ...icones].join('\n'));
const sw = `// Service worker do Organizador de Concursos (gerado por scripts/montar-web.mjs).
// Guarda o app na instalação para abrir sem internet; os dados ficam no IndexedDB.
const VERSAO = '${versao}';
const CACHE_APP = 'organizador-app-' + VERSAO;
const CACHE_FONTES = 'organizador-fontes';
const ARQUIVOS = ${JSON.stringify(precache)};

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_APP)
      // 'reload': ignora o cache HTTP (o GitHub Pages guarda por 10 min) para não misturar versões.
      .then((cache) => cache.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('organizador-app-') && n !== CACHE_APP).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('sem resposta')), ms);
    promessa.then(
      (r) => (clearTimeout(t), ok(r)),
      (e) => (clearTimeout(t), falha(e)),
    );
  });
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);

  if (url.origin === self.location.origin) {
    if (pedido.mode === 'navigate') {
      // A página: da rede (versão nova, se houver); sem internet, a guardada desta versão.
      evento.respondWith(
        comPrazo(fetch(pedido), 4000).catch(() => caches.open(CACHE_APP).then((c) => c.match('./')).then((r) => r || Response.error())),
      );
      return;
    }
    evento.respondWith(caches.open(CACHE_APP).then((c) => c.match(pedido)).then((r) => r || fetch(pedido)));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Fontes: a guardada na hora e atualiza por trás.
    evento.respondWith(
      caches.open(CACHE_FONTES).then(async (cache) => {
        const guardada = await cache.match(pedido);
        const rede = fetch(pedido)
          .then((r) => {
            if (r.ok || r.type === 'opaque') cache.put(pedido, r.clone());
            return r;
          })
          .catch(() => guardada || Response.error());
        return guardada || rede;
      }),
    );
  }
});
`;
writeFileSync(join(saida, 'sw.js'), sw);

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
console.log(`dist/web/  app instalável (GitHub Pages): ${nomeJs} ${kb(js.length)}, ${nomeCss} ${kb(css.length)}, versão ${versao}`);
