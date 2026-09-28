// Radar de concursos: filtros, identidade das oportunidades e a interface
// das fontes. Sem dependências de outros módulos do app, para o coletor
// (scripts/radar/coletar.ts) rodar direto no Node.

import type { FiltroRadar, Oportunidade } from '../dominio/tipos';

/** Uma fonte pública de concursos. Novas fontes implementam esta interface. */
export interface FonteConcursos {
  id: string;
  nome: string;
  /** Páginas públicas de listagem que a fonte lê (respeitando o robots.txt). */
  paginas: string[];
  /** Extrai as oportunidades do HTML de uma página de listagem. */
  extrair(html: string, url: string, coletadoEm: string): Oportunidade[];
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Id estável (hash djb2 em base 36) a partir do link ou do órgão e cargos. */
export function idOportunidade(o: Pick<Oportunidade, 'link' | 'orgao' | 'cargos'>): string {
  const base = o.link || `${o.orgao}|${o.cargos.join(',')}`;
  let h = 5381;
  for (const c of normalizarTexto(base)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `op${h.toString(36)}`;
}

/** "R$ 8.500,00" → 8500. Pega o maior valor do texto. */
export function lerSalario(texto: string): number | null {
  const valores = [...texto.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)].map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')));
  return valores.length ? Math.max(...valores) : null;
}

/** "12 vagas", "1 vaga" → número. "cadastro reserva" → null. */
export function lerVagas(texto: string): number | null {
  const m = texto.match(/(\d[\d.]*)\s*vagas?/i);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

/** Última data dd/mm/aaaa do texto, como AAAA-MM-DD (em geral, o fim das inscrições). */
export function lerData(texto: string): string | null {
  const datas = [...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => `${m[3]}-${m[2]}-${m[1]}`);
  return datas.length ? datas[datas.length - 1] : null;
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

export function ehUF(s: string): boolean {
  return UFS.has(s.toUpperCase());
}

/** Radicais das palavras: "Engenharia Elétrica" casa com "Engenheiro Eletricista". */
function radicais(termo: string): string[] {
  return normalizarTexto(termo)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !['de', 'da', 'do', 'das', 'dos', 'em', 'e'].includes(p))
    .map((p) => p.slice(0, 6));
}

export function casaArea(o: Pick<Oportunidade, 'titulo' | 'cargos'>, area: string): boolean {
  const texto = normalizarTexto([o.titulo, ...o.cargos].join(' '));
  const r = radicais(area);
  return r.length > 0 && r.every((x) => texto.includes(x));
}

/** A oportunidade bate com o filtro? Campos vazios do filtro não restringem. */
export function casaFiltro(o: Oportunidade, f: Pick<FiltroRadar, 'areas' | 'ufs' | 'bancas' | 'salarioMinimo'>): boolean {
  if (f.areas.length && !f.areas.some((a) => casaArea(o, a))) return false;
  if (f.ufs.length && !f.ufs.some((u) => u.toUpperCase() === o.uf.toUpperCase()) && o.uf !== 'BR') return false;
  if (f.bancas.length && !f.bancas.some((b) => normalizarTexto(o.banca).includes(normalizarTexto(b)))) return false;
  if (f.salarioMinimo !== null && (o.salario === null || o.salario < f.salarioMinimo)) return false;
  return true;
}

/** Inscrições ainda abertas (ou sem data informada) no dia. */
export function aberta(o: Pick<Oportunidade, 'inscricoesAte'>, hoje: string): boolean {
  return !o.inscricoesAte || o.inscricoesAte >= hoje;
}

/** Bate com algum filtro salvo? Sem filtros, tudo bate. */
export function casaAlgumFiltro(o: Oportunidade, filtros: FiltroRadar[]): boolean {
  return !filtros.length || filtros.some((f) => casaFiltro(o, f));
}

/** Oportunidades abertas, não ignoradas, que batem com os filtros e apareceram depois de `vistoAte`. */
export function oportunidadesNovas(ops: Oportunidade[], filtros: FiltroRadar[], vistoAte: string | null, hoje: string): Oportunidade[] {
  return ops.filter((o) => !o.ignorada && aberta(o, hoje) && casaAlgumFiltro(o, filtros) && (!vistoAte || o.coletadoEm > vistoAte));
}

export type ItensPorUf = Record<string, Record<string, Oportunidade>>;

/**
 * Junta oportunidades coletadas às que já estão no banco (documentos
 * `oportunidades/<UF>`). Uma já conhecida mantém a data em que apareceu e se
 * estava ignorada; encerradas há mais de 30 dias saem. Devolve só os
 * documentos que mudaram (`vazias` = UFs que ficaram sem nada e devem ser apagadas).
 */
export function mesclarOportunidades(
  banco: ItensPorUf,
  lista: Oportunidade[],
  hoje: string,
): { docs: ItensPorUf; vazias: string[]; novas: number; atualizadas: number } {
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const conhecidas = new Map<string, Oportunidade>();
  const porUf: ItensPorUf = {};
  const mudou = new Set<string>();
  for (const [uf, itens] of Object.entries(banco)) {
    porUf[uf] = {};
    for (const [id, o] of Object.entries(itens ?? {})) {
      if (!o?.titulo) continue;
      conhecidas.set(id, { ...o, id, uf });
      if (!o.inscricoesAte || o.inscricoesAte >= limite) porUf[uf][id] = { ...o, id };
      else mudou.add(uf);
    }
  }
  let novas = 0;
  let atualizadas = 0;
  for (const o of lista) {
    const antiga = conhecidas.get(o.id);
    const uf = (o.uf || 'BR').toUpperCase();
    if (antiga) {
      atualizadas++;
      if (antiga.uf !== uf && porUf[antiga.uf]) {
        delete porUf[antiga.uf][o.id];
        mudou.add(antiga.uf);
      }
    } else novas++;
    porUf[uf] = { ...(porUf[uf] ?? {}), [o.id]: { ...o, uf, coletadoEm: antiga?.coletadoEm ?? o.coletadoEm, ignorada: antiga?.ignorada ?? false } };
    mudou.add(uf);
  }
  const docs: ItensPorUf = {};
  const vazias: string[] = [];
  for (const uf of mudou) {
    if (Object.keys(porUf[uf] ?? {}).length) docs[uf] = porUf[uf];
    else if (banco[uf]) vazias.push(uf);
  }
  return { docs, vazias, novas, atualizadas };
}
