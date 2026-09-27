// Números do painel: horas líquidas por período, sequência de dias estudados,
// cobertura do edital e contagem regressiva para as provas.

import { segundosLiquidos } from './cronometro';
import { diaSP, diasEntre, inicioDaSemana, inicioDoMes, somarDias } from './datas';
import type { Concurso, DiaISO, Disciplina, Sessao, StatusTopico, Topico } from './tipos';

/** Mínimo de estudo para o dia contar na sequência. */
export const MINIMO_DIA_ESTUDADO_SEG = 60;

export interface TotaisPeriodo {
  hoje: number;
  semana: number;
  mes: number;
}

export function totaisPorPeriodo(porDia: Map<DiaISO, number>, hoje: DiaISO): TotaisPeriodo {
  const semana = inicioDaSemana(hoje);
  const mes = inicioDoMes(hoje);
  const t: TotaisPeriodo = { hoje: 0, semana: 0, mes: 0 };
  for (const [dia, seg] of porDia) {
    if (dia > hoje) continue;
    if (dia === hoje) t.hoje += seg;
    if (dia >= semana) t.semana += seg;
    if (dia >= mes) t.mes += seg;
  }
  return t;
}

/**
 * Dias seguidos com estudo, terminando hoje. Se hoje ainda não teve estudo,
 * a sequência de ontem continua valendo até o fim do dia.
 */
export function sequenciaDeDias(porDia: Map<DiaISO, number>, hoje: DiaISO): number {
  const estudou = (dia: DiaISO) => (porDia.get(dia) ?? 0) >= MINIMO_DIA_ESTUDADO_SEG;
  let dia = estudou(hoje) ? hoje : somarDias(hoje, -1);
  let n = 0;
  while (estudou(dia)) {
    n++;
    dia = somarDias(dia, -1);
  }
  return n;
}

/** Os últimos `n` dias (do mais antigo para hoje) com os segundos estudados. */
export function ultimosDias(porDia: Map<DiaISO, number>, hoje: DiaISO, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const dia = somarDias(hoje, i - n + 1);
    return { dia, segundos: porDia.get(dia) ?? 0 };
  });
}

const CONCLUIDOS: StatusTopico[] = ['teoria_concluida', 'revisado', 'dominado'];

export function topicoConcluido(t: Pick<Topico, 'status'>): boolean {
  return CONCLUIDOS.includes(t.status);
}

/** Tópicos sem subtópicos: são eles que contam na cobertura. */
export function topicosFolha(topicos: Record<string, Topico>): Topico[] {
  const lista = Object.values(topicos);
  const temFilho = new Set(lista.map((t) => t.paiId).filter(Boolean));
  return lista.filter((t) => !temFilho.has(t.id));
}

export interface Cobertura {
  total: number;
  concluidos: number;
  /** 0 a 1. */
  fracao: number;
}

/** % de tópicos (folhas) com teoria concluída ou além. */
export function cobertura(disciplinas: Pick<Disciplina, 'topicos'>[]): Cobertura {
  let total = 0;
  let concluidos = 0;
  for (const d of disciplinas) {
    for (const t of topicosFolha(d.topicos)) {
      total++;
      if (topicoConcluido(t)) concluidos++;
    }
  }
  return { total, concluidos, fracao: total ? concluidos / total : 0 };
}

export interface ProvaFutura {
  concurso: Concurso;
  dias: number;
}

/** Provas de hoje em diante, da mais próxima para a mais distante. */
export function provasFuturas(concursos: Concurso[], hoje: DiaISO): ProvaFutura[] {
  return concursos
    .filter((c) => c.dataProva && c.dataProva >= hoje && c.status !== 'prova_feita')
    .map((c) => ({ concurso: c, dias: diasEntre(hoje, c.dataProva as DiaISO) }))
    .sort((a, b) => a.dias - b.dias);
}

/** Tempo líquido por disciplina (sessões sem disciplina ficam em `''`). */
export function segundosPorDisciplina(sessoes: Sessao[], agora: Date | number): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of sessoes) {
    const seg = segundosLiquidos(s, agora);
    const chave = s.disciplinaId ?? '';
    mapa.set(chave, (mapa.get(chave) ?? 0) + seg);
  }
  return mapa;
}

/** Tempo líquido por tópico. */
export function segundosPorTopico(sessoes: Sessao[], agora: Date | number): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of sessoes) {
    if (!s.topicoId) continue;
    const seg = segundosLiquidos(s, agora);
    mapa.set(s.topicoId, (mapa.get(s.topicoId) ?? 0) + seg);
  }
  return mapa;
}

export function hojeSP(agora: Date | number = Date.now()): DiaISO {
  return diaSP(agora);
}
