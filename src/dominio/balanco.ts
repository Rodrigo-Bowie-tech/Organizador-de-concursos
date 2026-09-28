// Balanço semanal: onde o tempo está indo em relação ao peso de cada
// disciplina, o que ficou esquecido e a projeção de cobertura do edital até a
// prova no ritmo real.

import { segundosPorDia } from './cronometro';
import { diaSP, diasEntre, somarDias } from './datas';
import { topicoConcluido, topicosFolha } from './painel';
import type { DiaISO, Disciplina, Sessao, Topico } from './tipos';

export const JANELA_DIAS = 28;

/** Peso efetivo na prova: peso × nº de questões (1 quando o edital não informa). */
export function valorNaProva(d: Pick<Disciplina, 'peso' | 'numQuestoes'>): number {
  return Math.max(0, d.peso) * (d.numQuestoes ?? 1);
}

export interface EsforcoDisciplina {
  disciplina: Disciplina;
  /** Tempo líquido na janela. */
  segundos: number;
  /** 0 a 1: parte do tempo estudado (na janela) que foi para esta disciplina. */
  fracaoTempo: number;
  /** 0 a 1: parte da prova que esta disciplina vale. */
  fracaoPeso: number;
  ultimoEstudo: DiaISO | null;
  /** Dias desde o último estudo; `null` se nunca estudou. */
  diasSemEstudo: number | null;
}

export function esforcoPorDisciplina(
  disciplinas: Disciplina[],
  sessoes: Sessao[],
  agora: Date | number,
  janelaDias = JANELA_DIAS,
): EsforcoDisciplina[] {
  const hoje = diaSP(agora);
  const desde = somarDias(hoje, -(janelaDias - 1));
  const somaPeso = disciplinas.reduce((t, d) => t + valorNaProva(d), 0);
  const linhas = disciplinas.map((d) => {
    const dela = sessoes.filter((s) => s.disciplinaId === d.id);
    let segundos = 0;
    for (const [dia, seg] of segundosPorDia(dela, agora)) if (dia >= desde && dia <= hoje) segundos += seg;
    const ultimoEstudo = dela.reduce<DiaISO | null>((u, s) => {
      const dia = diaSP(s.inicio);
      return !u || dia > u ? dia : u;
    }, null);
    return {
      disciplina: d,
      segundos,
      fracaoTempo: 0,
      fracaoPeso: somaPeso ? valorNaProva(d) / somaPeso : 0,
      ultimoEstudo,
      diasSemEstudo: ultimoEstudo ? diasEntre(ultimoEstudo, hoje) : null,
    };
  });
  const total = linhas.reduce((t, l) => t + l.segundos, 0);
  for (const l of linhas) l.fracaoTempo = total ? l.segundos / total : 0;
  return linhas;
}

/**
 * Disciplinas que valem pelo menos a média da prova e estão sem estudo há
 * `limiteDias` ou mais (ou nunca foram estudadas), das que valem mais primeiro.
 */
export function disciplinasEsquecidas(linhas: EsforcoDisciplina[], limiteDias = 7): EsforcoDisciplina[] {
  if (!linhas.length) return [];
  const media = 1 / linhas.length;
  return linhas
    .filter((l) => l.fracaoPeso >= media - 1e-9 && (l.diasSemEstudo === null || l.diasSemEstudo >= limiteDias))
    .sort((a, b) => b.fracaoPeso - a.fracaoPeso);
}

export interface TopicoParado {
  disciplina: Disciplina;
  topico: Topico;
  dias: number;
}

/** Tópicos "em estudo" cuja última sessão foi há `limiteDias` ou mais. */
export function topicosParados(disciplinas: Disciplina[], sessoes: Sessao[], hoje: DiaISO, limiteDias = 14): TopicoParado[] {
  const ultima = new Map<string, DiaISO>();
  for (const s of sessoes) {
    if (!s.topicoId) continue;
    const dia = diaSP(s.inicio);
    if (dia > (ultima.get(s.topicoId) ?? '')) ultima.set(s.topicoId, dia);
  }
  const parados: TopicoParado[] = [];
  for (const d of disciplinas) {
    for (const t of Object.values(d.topicos)) {
      const dia = ultima.get(t.id);
      if (t.status !== 'em_estudo' || !dia) continue;
      const dias = diasEntre(dia, hoje);
      if (dias >= limiteDias) parados.push({ disciplina: d, topico: t, dias });
    }
  }
  return parados.sort((a, b) => b.dias - a.dias);
}

export interface Projecao {
  total: number;
  concluidos: number;
  /** Tópicos concluídos por semana, na média da janela. */
  ritmoSemanal: number;
  diasAteProva: number;
  /** Tópicos concluídos esperados na data da prova, no ritmo atual. */
  projetados: number;
  /** 0 a 1. */
  fracaoProjetada: number;
  /** Tópicos por semana necessários para fechar o edital até a prova. */
  necessarioPorSemana: number;
}

/**
 * Projeção de cobertura na data da prova, no ritmo das últimas `janelaDias`.
 * A data de conclusão vem do tópico (`concluidoEm`) ou, para tópicos antigos,
 * da sessão em que a teoria foi marcada como concluída.
 */
export function projecaoCobertura(
  disciplinas: Disciplina[],
  sessoes: Sessao[],
  dataProva: DiaISO,
  hoje: DiaISO,
  janelaDias = JANELA_DIAS,
): Projecao | null {
  const diasAteProva = diasEntre(hoje, dataProva);
  if (diasAteProva < 0) return null;
  const folhas = disciplinas.flatMap((d) => topicosFolha(d.topicos));
  if (!folhas.length) return null;

  const conclusaoPorSessao = new Map<string, DiaISO>();
  for (const s of sessoes) {
    if (s.concluiuTeoria && s.topicoId) conclusaoPorSessao.set(s.topicoId, diaSP(s.fim ?? s.inicio));
  }
  const desde = somarDias(hoje, -(janelaDias - 1));
  const concluidas = folhas.filter(topicoConcluido);
  const naJanela = concluidas.filter((t) => {
    const dia = t.concluidoEm ? diaSP(t.concluidoEm) : conclusaoPorSessao.get(t.id);
    return dia !== undefined && dia >= desde && dia <= hoje;
  }).length;

  const ritmoSemanal = naJanela / (janelaDias / 7);
  const semanas = diasAteProva / 7;
  const restantes = folhas.length - concluidas.length;
  const projetados = Math.min(folhas.length, concluidas.length + ritmoSemanal * semanas);
  return {
    total: folhas.length,
    concluidos: concluidas.length,
    ritmoSemanal,
    diasAteProva,
    projetados,
    fracaoProjetada: projetados / folhas.length,
    necessarioPorSemana: semanas > 0 ? restantes / semanas : restantes,
  };
}
