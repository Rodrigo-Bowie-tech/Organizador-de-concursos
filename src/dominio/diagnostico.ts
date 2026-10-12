// Diagnóstico por assunto (disciplina): quanto ainda falta estudar em cada um, num composto de
// três notas de 0 a 1 — a teoria feita (as horas de teoria sobre as previstas no Edital), o
// acerto nas questões (cadernos, sessões e lançamentos) e o acerto nos simulados. O domínio é a
// média das três. Com poucas questões, o acerto é puxado para 50%, como se houvesse mais algumas
// questões meio a meio: uma questão de sorte não vira domínio, e a falta de dados conta como
// "ainda não sei". O que falta = valor do assunto na prova × (1 − domínio); é com esse peso que
// o planejador reparte os blocos de questões (`necessidade` em planejador.ts).

import { valorNaProva } from './balanco';
import { segundosLiquidos } from './cronometro';
import { instanteSP } from './datas';
import type { Questoes } from './desempenho';
import { topicoConcluido } from './painel';
import { minutos } from './planejador';
import { estimativaTeoria } from './teoria';
import { achatar } from './topicos';
import type { BlocoPlanejado, Disciplina, Id, Sessao, Simulado, Topico } from './tipos';

/** Questões meio a meio somadas às suas: com poucas, o acerto fica perto de 50%. */
export const PRIORI_QUESTOES = 4;
/** O mesmo nos simulados, que têm poucas questões de cada assunto. */
export const PRIORI_SIMULADOS = 2;

export interface Acerto {
  feitas: number;
  acertos: number;
}

/** Acerto puxado para 50% quando há poucas questões: (acertos + k/2) ÷ (feitas + k). */
export function notaDeAcerto(a: Acerto, k: number): number {
  return (a.acertos + k / 2) / (a.feitas + k);
}

export interface Teoria {
  /** Blocos de teoria previstos (estimativa do Edital). */
  previstos: number;
  /**
   * Blocos feitos, até o previsto; tópico com a teoria concluída conta inteiro. No assunto, a
   * teoria estudada sem escolher tópico (a disciplina inteira) também conta.
   */
  feitos: number;
}

export function teoriaDoTopico(t: Topico, feitos: number): Teoria {
  const previstos = estimativaTeoria(t);
  return { previstos, feitos: topicoConcluido(t) ? previstos : Math.min(previstos, Math.max(0, feitos)) };
}

/** Questões de cada disciplina nos simulados, somadas (nota ÷ peso = acertos; máximo ÷ peso = questões). */
export function simuladosPorDisciplina(simulados: Simulado[], disciplinas: Disciplina[]): Map<Id, Acerto> {
  const peso = new Map(disciplinas.map((d) => [d.id, d.peso > 0 ? d.peso : 1]));
  const saida = new Map<Id, Acerto>();
  for (const s of simulados) {
    for (const n of s.notas) {
      const p = n.disciplinaId ? peso.get(n.disciplinaId) : undefined;
      if (!p || !(n.maximo > 0)) continue;
      const a = saida.get(n.disciplinaId as Id) ?? { feitas: 0, acertos: 0 };
      a.feitas += n.maximo / p;
      a.acertos += Math.min(n.maximo, Math.max(0, n.nota)) / p;
      saida.set(n.disciplinaId as Id, a);
    }
  }
  return saida;
}

/**
 * Minutos que o plano ainda reserva para cada disciplina, dos blocos que não começaram
 * (bloco de revisão com vários tópicos é dividido entre eles). Gestão e simulados não contam.
 */
export function minutosNoPlano(blocos: BlocoPlanejado[], disciplinas: Disciplina[], agora: Date | number): Map<Id, number> {
  const disciplinaDo = new Map<Id, Id>();
  for (const d of disciplinas) for (const id of Object.keys(d.topicos)) disciplinaDo.set(id, d.id);
  const saida = new Map<Id, number>();
  const somar = (id: Id | null | undefined, m: number) => {
    if (id) saida.set(id, (saida.get(id) ?? 0) + m);
  };
  for (const b of blocos) {
    if (b.status !== 'planejado' || b.motivo === 'gestao' || b.motivo === 'simulado') continue;
    if (instanteSP(b.dia, b.inicio).getTime() < Number(agora)) continue;
    const m = minutos(b);
    if (b.revisoes && b.revisoes.length > 1) for (const t of b.revisoes) somar(disciplinaDo.get(t), m / b.revisoes.length);
    else somar(b.disciplinaId ?? (b.topicoId ? disciplinaDo.get(b.topicoId) : null), m);
  }
  return saida;
}

export interface DiagnosticoTopico {
  topico: Topico;
  teoria: Teoria;
  questoes: Acerto;
  /** Tempo líquido estudado no tópico. */
  segundos: number;
}

export interface DiagnosticoAssunto {
  disciplina: Disciplina;
  /** Tempo líquido estudado no assunto (todas as sessões), em segundos. */
  segundos: number;
  /** Soma dos tópicos que não foram cortados. */
  teoria: Teoria;
  questoes: Acerto;
  simulados: Acerto;
  /** As três notas, de 0 a 1. */
  notas: { teoria: number; questoes: number; simulados: number };
  /** Média das três notas. */
  dominio: number;
  /** Valor na prova (questões × peso) que ainda falta: valor × (1 − domínio). */
  emRisco: number;
  /** Minutos que o plano ainda reserva para o assunto. */
  minutosNoPlano: number;
  /** Tópicos-folha na ordem do edital. */
  topicos: DiagnosticoTopico[];
}

export interface EntradaDiagnostico {
  disciplinas: Disciplina[];
  sessoes: Sessao[];
  /** Questões das sessões e dos lançamentos (`todasAsQuestoes`). */
  questoes: Questoes[];
  simulados: Simulado[];
  blocos: BlocoPlanejado[];
  /** Blocos de teoria feitos por tópico (`blocosDeTeoriaFeitos`). */
  feitos: Map<Id, number>;
  /** Duração do bloco, para a teoria estudada sem tópico (padrão 60 min). */
  blocoMin?: number;
  agora: Date | number;
}

const somarEm = <K>(m: Map<K, Acerto>, k: K, feitas: number, acertos: number) => {
  const a = m.get(k) ?? { feitas: 0, acertos: 0 };
  a.feitas += feitas;
  a.acertos += acertos;
  m.set(k, a);
};

export function diagnosticoPorAssunto(e: EntradaDiagnostico): DiagnosticoAssunto[] {
  const disciplinaDo = new Map<Id, Id>();
  for (const d of e.disciplinas) for (const id of Object.keys(d.topicos)) disciplinaDo.set(id, d.id);

  const segPorDisciplina = new Map<Id, number>();
  const segPorTopico = new Map<Id, number>();
  /** Teoria estudada na disciplina inteira (sem tópico), em segundos. */
  const teoriaSemTopico = new Map<Id, number>();
  for (const s of e.sessoes) {
    const seg = segundosLiquidos(s, e.agora);
    if (!seg) continue;
    const disciplinaId = s.disciplinaId ?? (s.topicoId ? disciplinaDo.get(s.topicoId) : undefined);
    if (disciplinaId) segPorDisciplina.set(disciplinaId, (segPorDisciplina.get(disciplinaId) ?? 0) + seg);
    if (s.topicoId) segPorTopico.set(s.topicoId, (segPorTopico.get(s.topicoId) ?? 0) + seg);
    else if (disciplinaId && s.tipo === 'teoria' && s.fim) teoriaSemTopico.set(disciplinaId, (teoriaSemTopico.get(disciplinaId) ?? 0) + seg);
  }
  const duracaoBloco = Math.max(15, e.blocoMin || 60) * 60;

  const qPorDisciplina = new Map<Id, Acerto>();
  const qPorTopico = new Map<Id, Acerto>();
  for (const q of e.questoes) {
    const disciplinaId = q.disciplinaId ?? (q.topicoId ? disciplinaDo.get(q.topicoId) : undefined);
    if (disciplinaId) somarEm(qPorDisciplina, disciplinaId, q.feitas, q.acertos);
    if (q.topicoId) somarEm(qPorTopico, q.topicoId, q.feitas, q.acertos);
  }

  const sims = simuladosPorDisciplina(e.simulados, e.disciplinas);
  const plano = minutosNoPlano(e.blocos, e.disciplinas, e.agora);
  const zero = (): Acerto => ({ feitas: 0, acertos: 0 });

  return e.disciplinas.map((d) => {
    const topicos = achatar(d.topicos)
      .filter((l) => !l.temFilhos)
      .map(({ topico: t }) => ({
        topico: t,
        teoria: teoriaDoTopico(t, e.feitos.get(t.id) ?? 0),
        questoes: qPorTopico.get(t.id) ?? zero(),
        segundos: segPorTopico.get(t.id) ?? 0,
      }));
    const porTopico = topicos
      .filter((x) => !x.topico.cortado)
      .reduce((a, x) => ({ previstos: a.previstos + x.teoria.previstos, feitos: a.feitos + x.teoria.feitos }), { previstos: 0, feitos: 0 });
    const teoria = {
      previstos: porTopico.previstos,
      feitos: Math.min(porTopico.previstos, porTopico.feitos + (teoriaSemTopico.get(d.id) ?? 0) / duracaoBloco),
    };
    const questoes = qPorDisciplina.get(d.id) ?? zero();
    const simulados = sims.get(d.id) ?? zero();
    const notas = {
      teoria: teoria.previstos ? teoria.feitos / teoria.previstos : 0,
      questoes: notaDeAcerto(questoes, PRIORI_QUESTOES),
      simulados: notaDeAcerto(simulados, PRIORI_SIMULADOS),
    };
    const dominio = (notas.teoria + notas.questoes + notas.simulados) / 3;
    return {
      disciplina: d,
      segundos: segPorDisciplina.get(d.id) ?? 0,
      teoria,
      questoes,
      simulados,
      notas,
      dominio,
      emRisco: valorNaProva(d) * (1 - dominio),
      minutosNoPlano: plano.get(d.id) ?? 0,
      topicos,
    };
  });
}

/** O que falta de cada disciplina na prova (`emRisco`). */
export function necessidadePorDisciplina(diagnostico: DiagnosticoAssunto[]): Map<Id, number> {
  return new Map(diagnostico.map((x) => [x.disciplina.id, x.emRisco]));
}

/**
 * Peso de cada tópico nos blocos de questões do planejador: o que falta da disciplina dividido
 * entre os tópicos dela pelo erro nas questões de cada um (sem questões conta meio a meio).
 * A soma dos tópicos de uma disciplina dá o `emRisco` dela.
 */
export function necessidadePorTopico(diagnostico: DiagnosticoAssunto[]): Map<Id, number> {
  const saida = new Map<Id, number>();
  for (const x of diagnostico) {
    const validos = x.topicos.filter((t) => !t.topico.cortado);
    const erro = validos.map((t) => 1 - notaDeAcerto(t.questoes, PRIORI_QUESTOES));
    const soma = erro.reduce((a, b) => a + b, 0);
    validos.forEach((t, i) => saida.set(t.topico.id, soma ? (x.emRisco * erro[i]) / soma : 0));
  }
  return saida;
}
