// Gera os PNGs do app instalável a partir dos SVGs de web/icones (rodar só quando o
// desenho mudar; os PNGs ficam no repositório). Uso: node scripts/gerar-icones.mjs
// No container remoto: PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node scripts/gerar-icones.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '../web/icones');
const SAIDAS = [
  ['icone.svg', 'icone-192.png', 192],
  ['icone.svg', 'icone-512.png', 512],
  ['icone-maskable.svg', 'icone-maskable-512.png', 512],
  // O iOS arredonda sozinho: fundo até a borda.
  ['icone-maskable.svg', 'apple-touch-icon.png', 180],
];

const navegador = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const pagina = await navegador.newPage();
for (const [svg, png, lado] of SAIDAS) {
  await pagina.setViewportSize({ width: lado, height: lado });
  const dados = Buffer.from(readFileSync(join(pasta, svg))).toString('base64');
  await pagina.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block;width:${lado}px;height:${lado}px}</style><img src="data:image/svg+xml;base64,${dados}">`,
  );
  await pagina.locator('img').evaluate((img) => img.decode());
  await pagina.screenshot({ path: join(pasta, png), omitBackground: true });
  console.log(`web/icones/${png}`);
}
await navegador.close();
