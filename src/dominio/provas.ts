// Provas anteriores (Fase 7): dividir o texto da prova para a IA, montar o
// pedido, validar a resposta, ler o gabarito e calcular a incidência de cada
// tópico nas provas da banca (que alimenta a prioridade do planejador).

import { caminhoDoTopico } from './topicos';
import { normalizar } from './edital';
import { topicosFolha } from './painel';
import type { Concurso, Disciplina, Id, ProvaAnterior, QuestaoProva, Topico } from './tipos';

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Linha que abre uma questão: "12.", "12)", "12 -", "Questão 12", "QUESTÃO 12". */
const INICIO_QUESTAO = /^\s*(?:quest[ãa]o\s*)?\d{1,3}\s*(?:[.)\-–:]|$|\s+[A-ZÀ-Ú])/i;

/**
 * Divide o texto da prova em partes de até `maxBytes`, cortando antes de uma
 * linha que abre questão, para nenhuma questão ficar partida entre duas chamadas.
 */
export function dividirProva(texto: string, maxBytes = 24_000): string[] {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const partes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  let ultimoInicio = -1;
  for (const linha of linhas) {
    const b = bytes(linha) + 1;
    if (tamanho + b > maxBytes && atual.length) {
      // Corta no último início de questão da parte (se não for o primeiro); senão, aqui mesmo.
      const corte = ultimoInicio > 0 ? ultimoInicio : atual.length;
      partes.push(atual.slice(0, corte).join('\n'));
      atual = atual.slice(corte);
      tamanho = atual.reduce((t, l) => t + bytes(l) + 1, 0);
      ultimoInicio = -1;
    }
    if (INICIO_QUESTAO.test(linha)) ultimoInicio = atual.length;
    atual.push(linha);
    tamanho += b;
  }
  if (atual.join('').trim()) partes.push(atual.join('\n'));
  return partes.filter((p) => p.trim());
}

/** Tópicos do edital com um código curto (T1, T2...) para a IA responder sem inventar ids. */
export interface CodigoTopico {
  codigo: string;
  disciplinaId: Id;
  topicoId: Id | null;
  rotulo: string;
}

/** Disciplinas (D1...) e tópicos-folha (T1...) do concurso, com o caminho completo. */
export function codigosDoEdital(disciplinas: Disciplina[]): CodigoTopico[] {
  const saida: CodigoTopico[] = [];
  let t = 0;
  disciplinas.forEach((d, i) => {
    saida.push({ codigo: `D${i + 1}`, disciplinaId: d.id, topicoId: null, rotulo: d.nome });
    const ordem = new Map(caminhos(d.topicos).map((x, k) => [x, k]));
    for (const f of [...topicosFolha(d.topicos)].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))) {
      saida.push({ codigo: `T${++t}`, disciplinaId: d.id, topicoId: f.id, rotulo: [d.nome, ...caminhoDoTopico(d.topicos, f.id)].join(' › ') });
    }
  });
  return saida;
}

/** Ids na ordem da árvore (pai antes dos filhos, irmãos por `ordem`). */
function caminhos(topicos: Record<Id, Topico>): Id[] {
  const lista = Object.values(topicos);
  const saida: Id[] = [];
  const visitar = (pai: Id | null) => {
    for (const t of lista.filter((x) => x.paiId === pai).sort((a, b) => a.ordem - b.ordem)) {
      saida.push(t.id);
      visitar(t.id);
    }
  };
  visitar(null);
  return saida;
}

export interface ContextoPedidoProva {
  banca: string;
  concurso: string;
  cargo: string;
  codigos: CodigoTopico[];
  parte: number;
  totalPartes: number;
}

export function montarPedidoProva(texto: string, c: ContextoPedidoProva): string {
  const lista = c.codigos.map((x) => `${x.codigo}: ${x.rotulo}`).join('\n');
  return `Você organiza provas de concursos públicos brasileiros.
Esta é a parte ${c.parte} de ${c.totalPartes} de uma prova da banca ${c.banca || '(não informada)'}.
Vou usar as questões para saber quais assuntos do edital de "${c.concurso}"${c.cargo ? ` (cargo: ${c.cargo})` : ''} mais caem.

Separe TODAS as questões completas do texto. Ignore capa, instruções e questões cortadas no começo ou no fim do texto.
Para cada questão:
- "numero": o número da questão na prova.
- "enunciado": o enunciado completo, sem as alternativas (inclua o texto-base, se for curto).
- "alternativas": o texto de cada alternativa, na ordem, sem a letra. Em provas de certo ou errado, use ["Certo", "Errado"].
- "correta": a letra do gabarito ("A" a "E", ou "C"/"E" em certo ou errado) só se estiver no texto; senão null.
- "topico": o código do assunto mais específico da lista abaixo (T...); se nenhum tópico servir mas a disciplina sim, o código da disciplina (D...); se nada servir, null.

Assuntos do edital:
${lista}

Responda somente com JSON:
{"questoes": [{"numero": 1, "enunciado": "", "alternativas": [""], "correta": null, "topico": "T1"}]}

Texto da prova:
"""
${texto}
"""`;
}

export type QuestaoImportada = Omit<QuestaoProva, 'id'>;

const LETRAS = 'ABCDEF';

/** Índice da alternativa a partir da letra do gabarito ("C"/"E" em certo ou errado). */
export function indiceDaLetra(letra: unknown, alternativas: string[]): number | null {
  if (typeof letra !== 'string' || !letra.trim()) return null;
  const l = letra.trim().toUpperCase().slice(0, 1);
  const certoErrado = alternativas.length === 2 && /^certo$/i.test(alternativas[0]) && /^errado$/i.test(alternativas[1]);
  if (certoErrado) return l === 'C' ? 0 : l === 'E' ? 1 : null;
  const i = LETRAS.indexOf(l);
  return i >= 0 && i < alternativas.length ? i : null;
}

export function validarQuestoesProva(resposta: unknown, codigos: CodigoTopico[]): QuestaoImportada[] {
  const lista = Array.isArray(resposta) ? resposta : (resposta as { questoes?: unknown })?.questoes;
  if (!Array.isArray(lista)) return [];
  const porCodigo = new Map(codigos.map((c) => [c.codigo.toUpperCase(), c]));
  const saida: QuestaoImportada[] = [];
  for (const item of lista) {
    const r = item as Record<string, unknown>;
    const enunciado = typeof r.enunciado === 'string' ? r.enunciado.trim() : '';
    const numero = Math.round(Number(r.numero));
    if (!enunciado || !Number.isFinite(numero) || numero <= 0) continue;
    const alternativas = Array.isArray(r.alternativas)
      ? r.alternativas.filter((a): a is string => typeof a === 'string').map((a) => a.replace(/^\s*\(?[A-Ea-e]\)\s*/, '').trim()).filter(Boolean)
      : [];
    const cod = typeof r.topico === 'string' ? porCodigo.get(r.topico.trim().toUpperCase()) : undefined;
    saida.push({
      numero,
      enunciado: enunciado.slice(0, 6000),
      alternativas: alternativas.slice(0, 6).map((a) => a.slice(0, 1500)),
      correta: indiceDaLetra(r.correta, alternativas),
      disciplinaId: cod?.disciplinaId ?? null,
      topicoId: cod?.topicoId ?? null,
      anulada: false,
    });
  }
  return saida;
}

/** Junta as partes: uma questão por número (fica a de enunciado mais longo), em ordem. */
export function juntarQuestoes(partes: QuestaoImportada[][]): QuestaoImportada[] {
  const porNumero = new Map<number, QuestaoImportada>();
  for (const q of partes.flat()) {
    const antes = porNumero.get(q.numero);
    if (!antes || q.enunciado.length > antes.enunciado.length) porNumero.set(q.numero, q);
  }
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

/**
 * Lê um gabarito colado: "1-A 2-C 3 E", "01 B", "4) X" (X, * ou "anulada" = anulada),
 * inclusive em tabela (linha de números e linha de letras logo abaixo).
 */
export function lerGabarito(texto: string): Map<number, string> {
  const saida = new Map<number, string>();
  const pares = /(?<!\d)(\d{1,3})[ \t]*[-–.:)]?[ \t]*(ANULADA|[A-EX*])(?![A-Za-zÀ-ú])/gi;
  for (const m of texto.matchAll(pares)) saida.set(Number(m[1]), /^(anulada|x|\*)$/i.test(m[2]) ? 'X' : m[2].toUpperCase());
  if (saida.size) return saida;
  // Tabela: números numa linha, letras na seguinte.
  const linhas = texto.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i + 1 < linhas.length; i++) {
    const nums = linhas[i].split(/\s+/);
    const letras = linhas[i + 1].split(/\s+/);
    if (nums.length === letras.length && nums.every((n) => /^\d{1,3}$/.test(n)) && letras.every((l) => /^([A-EX*]|anulada)$/i.test(l))) {
      nums.forEach((n, k) => saida.set(Number(n), /^(anulada|x|\*)$/i.test(letras[k]) ? 'X' : letras[k].toUpperCase()));
      i++;
    }
  }
  return saida;
}

/** Aplica o gabarito lido: letra vira `correta`, X anula. */
export function aplicarGabarito<T extends QuestaoImportada>(questoes: T[], gabarito: Map<number, string>): T[] {
  return questoes.map((q) => {
    const g = gabarito.get(q.numero);
    if (!g) return q;
    if (g === 'X') return { ...q, anulada: true, correta: null };
    return { ...q, anulada: false, correta: indiceDaLetra(g, q.alternativas) ?? q.correta };
  });
}

// ---------------------------------------------------------------- incidência

const mesmaBanca = (a: string, b: string) => Boolean(normalizar(a)) && normalizar(a) === normalizar(b);

/** Provas que contam para o concurso: as da mesma banca (ou, sem banca, as importadas para ele). */
export function provasDoConcurso(provas: ProvaAnterior[], concurso: Concurso): ProvaAnterior[] {
  return provas.filter((p) => (concurso.banca.trim() ? mesmaBanca(p.banca, concurso.banca) : p.concursoId === concurso.id));
}

/**
 * Quantas questões de provas da banca caíram em cada tópico do concurso.
 * Uma questão ligada a um tópico de outro concurso conta nos tópicos
 * vinculados (mesmo grupo de equivalência) deste concurso. Anuladas não contam.
 */
export function incidenciaPorTopico(provas: ProvaAnterior[], concurso: Concurso, disciplinas: Disciplina[]): Map<Id, number> {
  const doConcurso = disciplinas.filter((d) => d.concursoId === concurso.id);
  const meus = new Set(doConcurso.flatMap((d) => Object.keys(d.topicos)));
  const porGrupo = new Map<string, Id[]>();
  for (const d of doConcurso) for (const t of Object.values(d.topicos)) if (t.grupoEquivalenciaId) porGrupo.set(t.grupoEquivalenciaId, [...(porGrupo.get(t.grupoEquivalenciaId) ?? []), t.id]);
  const grupoDe = new Map<Id, string>();
  for (const d of disciplinas) for (const t of Object.values(d.topicos)) if (t.grupoEquivalenciaId) grupoDe.set(t.id, t.grupoEquivalenciaId);

  const contagem = new Map<Id, number>();
  const somar = (id: Id) => contagem.set(id, (contagem.get(id) ?? 0) + 1);
  for (const p of provasDoConcurso(provas, concurso)) {
    for (const q of Object.values(p.questoes)) {
      if (q.anulada || !q.topicoId) continue;
      if (meus.has(q.topicoId)) somar(q.topicoId);
      else {
        const grupo = grupoDe.get(q.topicoId);
        for (const id of (grupo && porGrupo.get(grupo)) || []) somar(id);
      }
    }
  }
  return contagem;
}

/**
 * Disciplinas com a incidência das provas nos tópicos que não têm incidência
 * informada à mão (o valor manual vence). É o que o planejador recebe.
 */
export function comIncidenciaDasProvas(disciplinas: Disciplina[], concursos: Concurso[], provas: ProvaAnterior[]): Disciplina[] {
  if (!provas.length) return disciplinas;
  const porConcurso = new Map(concursos.map((c) => [c.id, incidenciaPorTopico(provas, c, disciplinas)]));
  return disciplinas.map((d) => {
    const inc = porConcurso.get(d.concursoId);
    if (!inc?.size) return d;
    const topicos = Object.fromEntries(
      Object.entries(d.topicos).map(([id, t]) => [id, t.incidencia === null && inc.has(id) ? { ...t, incidencia: inc.get(id) as number } : t]),
    );
    return { ...d, topicos };
  });
}
