// Prepara a gravação da coleta no banco do app (rotina diária do radar).
//
// 1. A rotina baixa o que já está no banco: ArtifactData `list` da coleção
//    "oportunidades" com `out_dir` = .cache/radar/banco (um JSON por UF).
// 2. Este script junta a coleta (.cache/radar/oportunidades.json) com o banco,
//    usando a mesma regra do app (src/radar/radar.ts#mesclarOportunidades), e
//    escreve um JSON por documento em .cache/radar/escritas/ e a lista de
//    escritas em .cache/radar/escritas/lote.json.
// 3. A rotina aplica o lote com ArtifactData `batch` (writes = conteúdo do lote.json).
//
// Uso: node scripts/radar/mesclar.ts [--coleta arq] [--banco pasta] [--escritas pasta]

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mesclarOportunidades } from '../../src/radar/radar.ts';
import type { ItensPorUf } from '../../src/radar/radar.ts';
import type { Oportunidade } from '../../src/dominio/tipos.ts';

const args = process.argv.slice(2);
const opcao = (nome: string, padrao: string) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : padrao;
};
const arqColeta = opcao('--coleta', '.cache/radar/oportunidades.json');
const pastaBanco = opcao('--banco', '.cache/radar/banco');
const pastaEscritas = opcao('--escritas', '.cache/radar/escritas');

/** Acha os documentos da coleção em qualquer profundidade (o `out_dir` cria subpastas). */
function lerBanco(pasta: string): ItensPorUf {
  const banco: ItensPorUf = {};
  if (!existsSync(pasta)) return banco;
  for (const nome of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, nome.name);
    if (nome.isDirectory()) Object.assign(banco, lerBanco(caminho));
    else if (nome.name.endsWith('.json')) {
      const bruto = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>;
      const doc = (bruto.itens ? bruto : (bruto.data ?? bruto)) as { uf?: string; itens?: ItensPorUf[string] };
      const uf = (doc.uf ?? nome.name.replace(/\.json$/, '')).toUpperCase();
      if (doc.itens) banco[uf] = doc.itens;
    }
  }
  return banco;
}

const coleta = JSON.parse(readFileSync(arqColeta, 'utf8')) as { coletadoEm: string; oportunidades: Oportunidade[] };
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const banco = lerBanco(pastaBanco);
const r = mesclarOportunidades(banco, coleta.oportunidades, hoje);

rmSync(pastaEscritas, { recursive: true, force: true });
mkdirSync(pastaEscritas, { recursive: true });
const lote: Record<string, unknown>[] = [];
for (const [uf, itens] of Object.entries(r.docs)) {
  const arquivo = join(pastaEscritas, `${uf}.json`);
  writeFileSync(arquivo, JSON.stringify({ uf, itens }));
  lote.push({ op: 'set', collection: 'oportunidades', doc_id: uf, file_path: resolve(arquivo) });
}
for (const uf of r.vazias) lote.push({ op: 'delete', collection: 'oportunidades', doc_id: uf });
writeFileSync(join(pastaEscritas, 'lote.json'), JSON.stringify(lote, null, 2));
console.error(
  `Banco: ${Object.keys(banco).length} UFs. Coleta: ${coleta.oportunidades.length} oportunidades (${r.novas} novas, ${r.atualizadas} já conhecidas). ` +
    `${lote.length} escritas em ${join(pastaEscritas, 'lote.json')}.`,
);
