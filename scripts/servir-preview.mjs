// Servidor estático mínimo para testar os builds localmente. Uso: npm run preview [porta]
//   /                            build do Artifact (dist/preview.html), sem depender do cdnjs
//   /Organizador-de-concursos/   app instalável (dist/web), no mesmo caminho do GitHub Pages

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.argv[2] ?? process.env.PORTA ?? 4173);

const ROTAS = {
  '/': ['dist/preview.html', 'text/html; charset=utf-8'],
  '/vendor/react.production.min.js': ['node_modules/react/umd/react.production.min.js', 'text/javascript'],
  '/vendor/react-dom.production.min.js': ['node_modules/react-dom/umd/react-dom.production.min.js', 'text/javascript'],
  '/vendor/pdfjs/pdf.min.js': ['node_modules/pdfjs-dist/build/pdf.min.js', 'text/javascript'],
  '/vendor/pdfjs/pdf.worker.min.js': ['node_modules/pdfjs-dist/build/pdf.worker.min.js', 'text/javascript'],
};

const WEB = '/Organizador-de-concursos/';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const caminho = new URL(req.url ?? '/', 'http://x').pathname;
  if (caminho === WEB.slice(0, -1)) {
    res.writeHead(301, { location: WEB }).end();
    return;
  }
  if (caminho.startsWith(WEB)) {
    const relativo = normalize(caminho.slice(WEB.length) || 'index.html');
    if (relativo.startsWith('..')) {
      res.writeHead(400).end();
      return;
    }
    try {
      const corpo = await readFile(join(raiz, 'dist/web', relativo));
      res.writeHead(200, { 'content-type': TIPOS[extname(relativo)] ?? 'application/octet-stream' }).end(corpo);
    } catch {
      res.writeHead(404).end('não encontrado');
    }
    return;
  }
  const rota = ROTAS[caminho];
  if (!rota) {
    res.writeHead(404).end('não encontrado');
    return;
  }
  try {
    res.writeHead(200, { 'content-type': rota[1] }).end(await readFile(join(raiz, rota[0])));
  } catch {
    res.writeHead(500).end('rode "npm run build" antes');
  }
}).listen(porta, () => console.log(`Preview em http://localhost:${porta}`));
