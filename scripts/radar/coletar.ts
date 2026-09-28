// Coletor do radar (Fase 6). Lê as páginas públicas de listagem das fontes
// (hoje, o PCI Concursos), respeitando o robots.txt, com User-Agent
// identificado, 1 requisição a cada 4 segundos e cache do dia em disco.
//
// Uso:
//   node scripts/radar/coletar.ts [--saida radar.json] [--forcar]
//   node scripts/radar/coletar.ts --amostra tests/unit/fixtures/pci-sudeste.html
//
// A rotina agendada do Claude Code roda este script uma vez por dia e grava as
// oportunidades no banco do app (ver CLAUDE.md, "Radar").

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fontePci, permitidoPeloRobots } from '../../src/radar/pci.ts';
import type { FonteConcursos } from '../../src/radar/radar.ts';

const FONTES: FonteConcursos[] = [fontePci];
const AGENTE = 'OrganizadorDeConcursos/1.0 (app pessoal de estudos; github.com/Rodrigo-Bowie-tech/Organizador-de-concursos)';
const INTERVALO_MS = 4000;

const args = process.argv.slice(2);
const opcao = (nome: string) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const forcar = args.includes('--forcar');
const pastaCache = opcao('--cache') ?? '.cache/radar';
const hoje = new Date().toISOString().slice(0, 10);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ultimaRequisicao = 0;

async function baixar(url: string): Promise<string> {
  const espera = ultimaRequisicao + INTERVALO_MS - Date.now();
  if (espera > 0) await esperar(espera);
  ultimaRequisicao = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': AGENTE, Accept: 'text/html,text/plain' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

async function comCache(url: string): Promise<string> {
  mkdirSync(pastaCache, { recursive: true });
  const arquivo = join(pastaCache, `${hoje}-${url.replace(/[^a-z0-9]+/gi, '_')}.html`);
  if (!forcar && existsSync(arquivo)) return readFileSync(arquivo, 'utf8');
  const html = await baixar(url);
  writeFileSync(arquivo, html);
  return html;
}

async function main() {
  const amostra = opcao('--amostra');
  if (amostra) {
    const html = await baixar(fontePci.paginas[0]);
    writeFileSync(amostra, html);
    console.error(`Amostra salva em ${amostra} (${html.length} caracteres). Rode "npm test" para conferir o parser.`);
    return;
  }

  const coletadoEm = new Date().toISOString();
  const oportunidades = new Map<string, unknown>();
  const relatorio: string[] = [];
  for (const fonte of FONTES) {
    const robotsPorOrigem = new Map<string, string>();
    for (const pagina of fonte.paginas) {
      const url = new URL(pagina);
      try {
        if (!robotsPorOrigem.has(url.origin)) {
          // Sem robots.txt (404) tudo é permitido; se não deu para ler por outro motivo, não arrisca.
          const robots = await comCache(`${url.origin}/robots.txt`).catch((e: Error) => {
            if (e.message.includes('HTTP 404')) return '';
            throw e;
          });
          robotsPorOrigem.set(url.origin, robots);
        }
        if (!permitidoPeloRobots(robotsPorOrigem.get(url.origin) ?? '', url.pathname)) {
          relatorio.push(`${pagina}: bloqueada pelo robots.txt, ignorada`);
          continue;
        }
        const itens = fonte.extrair(await comCache(pagina), pagina, coletadoEm);
        for (const o of itens) oportunidades.set(o.id, o);
        relatorio.push(`${pagina}: ${itens.length} oportunidades`);
      } catch (e) {
        relatorio.push(`${pagina}: erro (${(e as Error).message})`);
      }
    }
  }
  const saida = JSON.stringify({ coletadoEm, relatorio, oportunidades: [...oportunidades.values()] }, null, 2);
  const arquivo = opcao('--saida');
  if (arquivo) writeFileSync(arquivo, saida);
  else process.stdout.write(saida);
  for (const linha of relatorio) console.error(linha);
  if (!oportunidades.size && relatorio.every((l) => l.includes('erro'))) process.exit(1);
}

void main();
