// Junção de três vias para a sincronização entre aparelhos (Fase 9) e o formato dos
// arquivos no repositório de dados. Sem banco e sem rede: é o que os testes cobrem.
//
// Cada documento do banco vira um arquivo `dados/<colecao>/<id>.json` com `{ em, dado }`.
// A "base" é a última versão que os dois lados tinham em comum; comparando base, local e
// remoto dá para saber quem mudou o quê.

import type { Json } from './store';

/**
 * Campos que são mapas de registros (id → registro): juntam registro por registro, para que
 * duas sessões lançadas na mesma semana em aparelhos diferentes fiquem as duas. O registro em
 * si é indivisível (não mistura campos de duas versões da mesma sessão).
 */
const MAPAS = new Set(['itens', 'topicos', 'questoes', 'dias', 'excecoes']);

const ehObjeto = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Cópia com as chaves dos objetos em ordem alfabética (comparação e arquivos estáveis). */
export function ordenar<T>(v: T): T {
  if (Array.isArray(v)) return v.map(ordenar) as T;
  if (!ehObjeto(v)) return v;
  const saida: Json = {};
  for (const k of Object.keys(v).sort()) if (v[k] !== undefined) saida[k] = ordenar(v[k]);
  return saida as T;
}

export const canonico = (v: unknown): string => (v === undefined ? '' : JSON.stringify(ordenar(v)));

export const igual = (a: unknown, b: unknown): boolean => canonico(a) === canonico(b);

/** Um valor indivisível: se só um lado mudou, vale ele; se os dois mudaram, vale o mais novo. */
function atomico(base: unknown, local: unknown, remoto: unknown, localMaisNovo: boolean): unknown {
  if (igual(local, base)) return remoto;
  if (igual(remoto, base)) return local;
  if (igual(local, remoto)) return local;
  return localMaisNovo ? local : remoto;
}

function juntarMapa(base: unknown, local: unknown, remoto: unknown, localMaisNovo: boolean): unknown {
  if (!ehObjeto(local) || !ehObjeto(remoto)) return atomico(base, local, remoto, localMaisNovo);
  const b = ehObjeto(base) ? base : {};
  const saida: Json = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remoto)])) {
    const v = atomico(b[k], local[k], remoto[k], localMaisNovo);
    if (v !== undefined) saida[k] = v;
  }
  return saida;
}

/**
 * Junta as duas versões de um documento a partir da base comum (`undefined` = não existe).
 * Campos comuns são indivisíveis; os de `MAPAS` juntam registro por registro.
 * Em conflito de verdade (os dois mudaram a mesma coisa), vale o lado mais novo.
 */
export function juntar3(base: Json | undefined, local: Json | undefined, remoto: Json | undefined, localMaisNovo: boolean): Json | undefined {
  if (igual(local, base)) return remoto;
  if (igual(remoto, base)) return local;
  if (igual(local, remoto)) return local;
  if (!local || !remoto) return localMaisNovo ? local : remoto; // apagado de um lado e mudado do outro
  const b = base ?? {};
  const saida: Json = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remoto)])) {
    const v = MAPAS.has(k) ? juntarMapa(b[k], local[k], remoto[k], localMaisNovo) : atomico(b[k], local[k], remoto[k], localMaisNovo);
    if (v !== undefined) saida[k] = v;
  }
  return saida;
}

// ------------------------------------------------------------ arquivos

export interface ArquivoDados {
  /** Quando o documento mudou no aparelho que enviou (ISO). Desempata conflitos. */
  em: string;
  dado: Json;
}

export const PASTA_DADOS = 'dados/';

/** `sessoes/2026-10-04` → `dados/sessoes/2026-10-04.json`. */
export function arquivoDe(caminho: string): string {
  const i = caminho.lastIndexOf('/');
  return `${PASTA_DADOS}${caminho.slice(0, i)}/${encodeURIComponent(caminho.slice(i + 1))}.json`;
}

/** O inverso de `arquivoDe`; `null` para arquivos que não são de dados. */
export function caminhoDe(arquivo: string): string | null {
  const m = /^dados\/(.+)\/([^/]+)\.json$/.exec(arquivo);
  if (!m) return null;
  try {
    return `${m[1]}/${decodeURIComponent(m[2])}`;
  } catch {
    return null;
  }
}

export const serializar = (a: ArquivoDados): string => `${JSON.stringify(ordenar(a), null, 2)}\n`;

export function lerArquivoDados(texto: string): ArquivoDados | null {
  try {
    const a = JSON.parse(texto) as Partial<ArquivoDados>;
    return ehObjeto(a.dado) ? { em: typeof a.em === 'string' ? a.em : '', dado: a.dado } : null;
  } catch {
    return null;
  }
}

/** O SHA que o git dá a um arquivo com esse conteúdo (`git hash-object`). */
export async function shaDoBlob(texto: string): Promise<string> {
  const corpo = new TextEncoder().encode(texto);
  const cabecalho = new TextEncoder().encode(`blob ${corpo.length}\0`);
  const tudo = new Uint8Array(cabecalho.length + corpo.length);
  tudo.set(cabecalho);
  tudo.set(corpo, cabecalho.length);
  const resumo = await crypto.subtle.digest('SHA-1', tudo);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
