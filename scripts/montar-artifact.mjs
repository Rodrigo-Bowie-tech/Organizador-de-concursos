// Monta a página do Artifact a partir do build do Vite (dist/build/app.js e app.css).
//
// Saídas:
//   dist/organizador-de-concursos.html  página publicada no claude.ai. Sem <!doctype>,
//                                       <html>, <head> ou <body>: o claude.ai envolve a
//                                       página nesse esqueleto ao publicar.
//   dist/preview.html                   a mesma página dentro de um esqueleto equivalente,
//                                       com React servido localmente, para testes (Playwright).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const pacote = JSON.parse(readFileSync(join(raiz, 'node_modules/react/package.json'), 'utf8'));
const versaoReact = pacote.version;

const REACT = `https://cdnjs.cloudflare.com/ajax/libs/react/${versaoReact}/umd/react.production.min.js`;
const REACT_DOM = `https://cdnjs.cloudflare.com/ajax/libs/react-dom/${versaoReact}/umd/react-dom.production.min.js`;
// Reserva, se o cdnjs falhar (os dois hosts são permitidos nos Artifacts).
const REACT_RESERVA = `https://cdn.jsdelivr.net/npm/react@${versaoReact}/umd/react.production.min.js`;
const REACT_DOM_RESERVA = `https://cdn.jsdelivr.net/npm/react-dom@${versaoReact}/umd/react-dom.production.min.js`;
const FONTES =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Roboto+Mono:wght@500;600&display=swap';

const js = readFileSync(join(dist, 'build/app.js'), 'utf8')
  .replaceAll('</script', '<\\/script')
  .replaceAll('<!--', '<\\!--');
const css = readFileSync(join(dist, 'build/app.css'), 'utf8').replaceAll('</style', '<\\/style');

function pagina(react, reactDom, reserva = true) {
  const plano = (global, url) =>
    reserva ? `\n<script>window.${global}||document.write('<script src="${url}"><\\/script>')</script>` : '';
  return `<title>Organizador de Concursos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTES}">
<style>
${css}
</style>
<div id="raiz"></div>
<script src="${react}"></script>${plano('React', REACT_RESERVA)}
<script src="${reactDom}"></script>${plano('ReactDOM', REACT_DOM_RESERVA)}
<script>
${js}
</script>
`;
}

// Esqueleto equivalente ao que o claude.ai aplica na publicação.
const ESQUELETO_INICIO = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
const ESQUELETO_FIM = '</body></html>';

mkdirSync(dist, { recursive: true });
const artifact = pagina(REACT, REACT_DOM);
writeFileSync(join(dist, 'organizador-de-concursos.html'), artifact);
writeFileSync(
  join(dist, 'preview.html'),
  ESQUELETO_INICIO + pagina('vendor/react.production.min.js', 'vendor/react-dom.production.min.js', false) + ESQUELETO_FIM,
);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/organizador-de-concursos.html  ${kb(artifact)} (React ${versaoReact} via cdnjs)`);
console.log('dist/preview.html                    para testes locais (npm run preview)');
