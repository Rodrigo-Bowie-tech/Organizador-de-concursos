// Importação de editais: localizar o conteúdo programático no texto do PDF,
// dividir em partes que cabem numa chamada à IA, montar o pedido, validar e
// juntar as respostas, e sugerir tópicos equivalentes entre editais.

import type { Id, Topico, TipoDisciplina } from './tipos';

export interface TopicoImportado {
  titulo: string;
  filhos: TopicoImportado[];
}

export interface DisciplinaImportada {
  nome: string;
  peso: number | null;
  numQuestoes: number | null;
  tipo: TipoDisciplina;
  topicos: TopicoImportado[];
}

// ------------------------------------------------ conteúdo programático

const TITULO_CONTEUDO = /conte[úu]do[s]?\s+program[áa]tico[s]?/gi;
const PROXIMO_ANEXO = /\n\s*ANEXO\s+(?:[IVXLC]+|\d+)\b/g;

/**
 * Trecho do conteúdo programático. Editais citam a expressão no índice e no
 * corpo; fica o trecho mais longo entre uma ocorrência e o anexo seguinte.
 */
export function localizarConteudoProgramatico(texto: string): { inicio: number; fim: number } | null {
  let melhor: { inicio: number; fim: number } | null = null;
  for (const m of texto.matchAll(TITULO_CONTEUDO)) {
    const inicio = m.index ?? 0;
    PROXIMO_ANEXO.lastIndex = inicio + m[0].length;
    const proximo = PROXIMO_ANEXO.exec(texto);
    const fim = proximo ? proximo.index : texto.length;
    if (!melhor || fim - inicio > melhor.fim - melhor.inicio) melhor = { inicio, fim };
  }
  if (!melhor || melhor.fim - melhor.inicio < 200) return null;
  return melhor;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Linha que parece título de disciplina: curta e em maiúsculas. */
function pareceTitulo(linha: string): boolean {
  const t = linha.trim();
  return t.length >= 4 && t.length <= 90 && t === t.toLocaleUpperCase('pt-BR') && /[A-ZÀ-Ú]{3}/.test(t);
}

/**
 * Divide o texto em partes de até `maxBytes`, cortando de preferência antes
 * de um título de disciplina quando a parte já passou da metade.
 */
export function dividirEmPartes(texto: string, maxBytes = 48_000): string[] {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const partes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const linha of linhas) {
    const b = bytes(linha) + 1;
    const cheia = tamanho + b > maxBytes;
    const bomCorte = tamanho > maxBytes * 0.5 && pareceTitulo(linha);
    if (atual.length && (cheia || bomCorte)) {
      partes.push(atual.join('\n'));
      atual = [];
      tamanho = 0;
    }
    if (b > maxBytes) {
      // Linha gigante (PDF sem quebras): corta em pedaços.
      let resto = linha;
      while (bytes(resto) > maxBytes) {
        const corte = Math.floor(resto.length * (maxBytes / bytes(resto)) * 0.95);
        partes.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      atual = [resto];
      tamanho = bytes(resto);
      continue;
    }
    atual.push(linha);
    tamanho += b;
  }
  if (atual.join('').trim()) partes.push(atual.join('\n'));
  return partes.filter((p) => p.trim());
}

// ------------------------------------------------------------- pedido à IA

export interface ContextoPedidoEdital {
  concurso: string;
  cargo: string;
  banca: string;
  parte: number;
  totalPartes: number;
}

export function montarPedidoEdital(trecho: string, c: ContextoPedidoEdital): string {
  const parte = c.totalPartes > 1 ? `\nEste é o trecho ${c.parte} de ${c.totalPartes}; o texto pode começar ou terminar no meio de uma disciplina.` : '';
  const cargo = c.cargo.trim()
    ? `Se o texto trouxer conteúdos de vários cargos, use só os do cargo "${c.cargo}" e os conhecimentos gerais/básicos comuns a todos.`
    : 'Se o texto trouxer conteúdos de vários cargos, inclua todos.';
  return `Você organiza editais de concursos públicos brasileiros em "edital verticalizado".

Concurso: ${c.concurso}${c.banca ? ` (banca ${c.banca})` : ''}${parte}

Transforme o conteúdo programático abaixo em disciplinas, tópicos e subtópicos.
Regras:
- Mantenha a redação do edital; não invente assuntos nem resuma demais.
- Separe cada assunto num tópico. Enumerações longas separadas por ponto, ponto e vírgula ou numeração viram tópicos.
- Use subtópicos quando o edital tiver hierarquia (ex.: 1. Máquinas elétricas: 1.1 Transformadores...). No máximo 3 níveis.
- Não repita a numeração do edital no título.
- ${cargo}
- "peso" e "numQuestoes" só se o texto informar; senão null.
- "tipo": "basica" (conhecimentos gerais/básicos), "especifica" (conhecimentos específicos) ou "discursiva".

Responda somente com JSON neste formato:
{"disciplinas": [{"nome": "Língua Portuguesa", "peso": null, "numQuestoes": null, "tipo": "basica", "topicos": [{"titulo": "Interpretação de texto", "subtopicos": []}]}]}

Conteúdo programático:
"""
${trecho}
"""`;
}

// ------------------------------------------------------ validar e juntar

const TIPOS: TipoDisciplina[] = ['basica', 'especifica', 'discursiva'];

function numeroOuNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function limparTitulo(t: string): string {
  return t
    .replace(/^\s*(?:\d+(?:\.\d+)*\.?|[a-z]\)|[-–•*])\s*/i, '')
    .replace(/[;.,\s]+$/, '')
    .trim();
}

function validarTopicos(v: unknown, nivel: number): TopicoImportado[] {
  if (!Array.isArray(v)) return [];
  const saida: TopicoImportado[] = [];
  for (const item of v) {
    const obj = (typeof item === 'string' ? { titulo: item } : item) as { titulo?: unknown; subtopicos?: unknown; filhos?: unknown };
    const titulo = typeof obj?.titulo === 'string' ? limparTitulo(obj.titulo) : '';
    if (!titulo) continue;
    saida.push({ titulo: titulo.slice(0, 300), filhos: nivel < 3 ? validarTopicos(obj.subtopicos ?? obj.filhos, nivel + 1) : [] });
  }
  return saida;
}

export function validarEstrutura(resposta: unknown): DisciplinaImportada[] {
  const lista = Array.isArray(resposta) ? resposta : (resposta as { disciplinas?: unknown })?.disciplinas;
  if (!Array.isArray(lista)) return [];
  const saida: DisciplinaImportada[] = [];
  for (const item of lista) {
    const d = item as Record<string, unknown>;
    const nome = typeof d?.nome === 'string' ? d.nome.trim() : '';
    if (!nome) continue;
    saida.push({
      nome: nome.slice(0, 150),
      peso: numeroOuNull(d.peso),
      numQuestoes: numeroOuNull(d.numQuestoes) === null ? null : Math.round(numeroOuNull(d.numQuestoes) as number),
      tipo: TIPOS.includes(d.tipo as TipoDisciplina) ? (d.tipo as TipoDisciplina) : 'especifica',
      topicos: validarTopicos(d.topicos, 1),
    });
  }
  return saida;
}

/** Junta as disciplinas das várias partes: mesmo nome vira uma só. */
export function juntarPartes(partes: DisciplinaImportada[][]): DisciplinaImportada[] {
  const mapa = new Map<string, DisciplinaImportada>();
  for (const parte of partes) {
    for (const d of parte) {
      const chave = normalizar(d.nome);
      const existente = mapa.get(chave);
      if (!existente) {
        mapa.set(chave, { ...d, topicos: [...d.topicos] });
        continue;
      }
      existente.peso ??= d.peso;
      existente.numQuestoes ??= d.numQuestoes;
      const titulos = new Set(existente.topicos.map((t) => normalizar(t.titulo)));
      for (const t of d.topicos) if (!titulos.has(normalizar(t.titulo))) existente.topicos.push(t);
    }
  }
  return [...mapa.values()];
}

export function contarTopicos(topicos: TopicoImportado[]): number {
  return topicos.reduce((n, t) => n + 1 + contarTopicos(t.filhos), 0);
}

/** Converte a árvore importada em tópicos do app. */
export function topicosDaImportacao(arvore: TopicoImportado[], novoId: () => Id, ordemInicial = 0): Topico[] {
  const saida: Topico[] = [];
  const visitar = (lista: TopicoImportado[], paiId: Id | null, inicio: number) => {
    lista.forEach((t, i) => {
      const topico: Topico = {
        id: novoId(),
        paiId,
        titulo: t.titulo,
        ordem: inicio + i,
        status: 'nao_iniciado',
        autoavaliacao: null,
        incidencia: null,
        grupoEquivalenciaId: null,
      };
      saida.push(topico);
      visitar(t.filhos, topico.id, 0);
    });
  };
  visitar(arvore, null, ordemInicial);
  return saida;
}

// ------------------------------------------------ tópicos equivalentes

const PALAVRAS_VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'com', 'no', 'na', 'nos', 'nas',
  'por', 'sua', 'seu', 'suas', 'seus', 'ao', 'aos', 'um', 'uma', 'sobre', 'entre', 'noções', 'nocoes', 'conceitos',
]);

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function palavrasChave(titulo: string): Set<string> {
  return new Set(
    normalizar(titulo)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(' ')
      .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p) && !/^\d+$/.test(p)),
  );
}

/** Jaccard das palavras-chave: 1 = mesmas palavras. */
export function similaridade(a: string, b: string): number {
  const x = palavrasChave(a);
  const y = palavrasChave(b);
  if (!x.size || !y.size) return 0;
  let comum = 0;
  for (const p of x) if (y.has(p)) comum++;
  return comum / (x.size + y.size - comum);
}

export interface RefTopico {
  concursoId: Id;
  disciplinaId: Id;
  topico: Topico;
}

export interface SugestaoEquivalencia {
  a: RefTopico;
  b: RefTopico;
  similaridade: number;
}

export function chavePar(a: Id, b: Id): string {
  return [a, b].sort().join('|');
}

/**
 * Pares de tópicos parecidos em concursos diferentes, ainda não vinculados
 * nem ignorados. Cada tópico entra no máximo uma vez, com o par mais parecido.
 */
export function sugerirEquivalencias(topicos: RefTopico[], ignorados: Set<string>, minimo = 0.6): SugestaoEquivalencia[] {
  const palavras = new Map(topicos.map((r) => [r.topico.id, palavrasChave(r.topico.titulo)]));
  const candidatos: SugestaoEquivalencia[] = [];
  for (let i = 0; i < topicos.length; i++) {
    for (let j = i + 1; j < topicos.length; j++) {
      const a = topicos[i];
      const b = topicos[j];
      if (a.concursoId === b.concursoId) continue;
      if (a.topico.grupoEquivalenciaId && a.topico.grupoEquivalenciaId === b.topico.grupoEquivalenciaId) continue;
      if (ignorados.has(chavePar(a.topico.id, b.topico.id))) continue;
      const x = palavras.get(a.topico.id)!;
      const y = palavras.get(b.topico.id)!;
      if (!x.size || !y.size) continue;
      let comum = 0;
      for (const p of x) if (y.has(p)) comum++;
      const s = comum / (x.size + y.size - comum);
      if (s >= minimo) candidatos.push({ a, b, similaridade: s });
    }
  }
  candidatos.sort((p, q) => q.similaridade - p.similaridade);
  const usados = new Set<Id>();
  return candidatos.filter((c) => {
    if (usados.has(c.a.topico.id) || usados.has(c.b.topico.id)) return false;
    usados.add(c.a.topico.id);
    usados.add(c.b.topico.id);
    return true;
  });
}
