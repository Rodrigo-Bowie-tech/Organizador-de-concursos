// Servidor estático mínimo para testar o build do Artifact localmente
// (dist/preview.html) sem depender do cdnjs. Uso: npm run preview [porta]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.argv[2] ?? process.env.PORTA ?? 4173);

const ROTAS = {
  '/': ['dist/preview.html', 'text/html; charset=utf-8'],
  '/vendor/react.production.min.js': ['node_modules/react/umd/react.production.min.js', 'text/javascript'],
  '/vendor/react-dom.production.min.js': ['node_modules/react-dom/umd/react-dom.production.min.js', 'text/javascript'],
};

createServer(async (req, res) => {
  const rota = ROTAS[new URL(req.url ?? '/', 'http://x').pathname];
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
