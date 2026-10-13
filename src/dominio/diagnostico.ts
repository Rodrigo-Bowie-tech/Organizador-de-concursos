// Quanto estudar por assunto (disciplina). O tempo de cada assunto no plano segue só a relevância
// dele na prova: a incidência, questões × peso, dividida entre os tópicos pela incidência de cada um
// quando se sabe (provas da banca ou o campo do Edital). Os assuntos que mais caem aparecem mais no
// plano. O desempenho (simulados e questões) não muda quanto tempo o assunto leva: diz o que estudar
// primeiro (o planejador põe antes o que foi mal no simulado) e fica aqui como informação.

import { valorNaProva } from './balanco';
import { segundosLiquidos } from './cronometro';
import { instanteSP } from './datas';
import type { Questoes } from './desempenho';
import { topicoConcluido } from './painel';
import { minutos, URGENTE_ABAIXO } from './planejador';
import { estimativaTeoria } from './teoria';
import { achatar } from './topicos';
import type { BlocoPlanejado, Disciplina, Id, Sessao, Simulado, Topico } from './tipos';

export { URGENTE_ABAIXO };

export interface Acerto {
  feitas: number;
  acertos: number;
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

const acertoDaNota = (n: Simulado['notas'][number], peso: number): Acerto => ({
  feitas: n.maximo / peso,
  acertos: Math.min(n.maximo, Math.max(0, n.nota)) / peso,
});

/** Questões de cada disciplina nos simulados, somadas (nota ÷ peso = acertos; máximo ÷ peso = questões). */
export function simuladosPorDisciplina(simulados: Simulado[], disciplinas: Disciplina[]): Map<Id, Acerto> {
  const peso = new Map(disciplinas.map((d) => [d.id, d.peso > 0 ? d.peso : 1]));
  const saida = new Map<Id, Acerto>();
  for (const s of simulados) {
    for (const n of s.notas) {
      const p = n.disciplinaId ? peso.get(n.disciplinaId) : undefined;
      if (!p || !(n.maximo > 0)) continue;
      const a = saida.get(n.disciplinaId as Id) ?? { feitas: 0, acertos: 0 };
      const x = acertoDaNota(n, p);
      a.feitas += x.feitas;
      a.acertos += x.acertos;
      saida.set(n.disciplinaId as Id, a);
    }
  }
  return saida;
}

/** O resultado de cada disciplina no último simulado em que ela caiu. */
export function ultimoSimuladoPorDisciplina(simulados: Simulado[], disciplinas: Disciplina[]): Map<Id, Acerto> {
  const peso = new Map(disciplinas.map((d) => [d.id, d.peso > 0 ? d.peso : 1]));
  const saida = new Map<Id, Acerto>();
  for (const s of [...simulados].sort((a, b) => b.dia.localeCompare(a.dia))) {
    for (const n of s.notas) {
      const p = n.disciplinaId ? peso.get(n.disciplinaId) : undefined;
      if (p && n.maximo > 0 && !saida.has(n.disciplinaId as Id)) saida.set(n.disciplinaId as Id, acertoDaNota(n, p));
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

/** Tópicos-folha que contam (os cortados ficam fora do plano). */
const folhasValidas = (d: Disciplina) =>
  achatar(d.topicos)
    .filter((l) => !l.temFilhos && !l.topico.cortado)
    .map((l) => l.topico);

/**
 * Relevância de cada tópico no plano: o valor da disciplina na prova (questões × peso) dividido
 * entre os tópicos-folha não cortados. Com a incidência de algum tópico conhecida, cada um pesa de
 * 1 (nunca caiu) a 2 (o que mais caiu), como na prioridade do planejador; sem ela, por igual. A
 * soma dos tópicos de uma disciplina dá o valor dela; tópico "dominado" fica com a sua parte, que
 * o plano não usa (ela não vai para os outros tópicos).
 */
export function relevanciaPorTopico(disciplinas: Disciplina[]): Map<Id, number> {
  const saida = new Map<Id, number>();
  for (const d of disciplinas) {
    const folhas = folhasValidas(d);
    const maxInc = Math.max(0, ...folhas.map((t) => t.incidencia ?? 0));
    const fator = (t: Topico) => (maxInc ? 1 + (t.incidencia ?? 0) / maxInc : 1);
    const soma = folhas.reduce((s, t) => s + fator(t), 0);
    for (const t of folhas) saida.set(t.id, soma ? (valorNaProva(d) * fator(t)) / soma : 0);
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
  /** Valor na prova: questões × peso. */
  valor: number;
  /** Parte da prova (valor ÷ soma dos valores das disciplinas do mesmo concurso). */
  fracaoProva: number;
  /** Minutos que o plano ainda reserva para o assunto. */
  minutosNoPlano: number;
  /** Parte das horas que o plano ainda reserva para o concurso. */
  fracaoPlano: number;
  /** Tempo líquido estudado no assunto (todas as sessões), em segundos. */
  segundos: number;
  /** Soma dos tópicos que não foram cortados. */
  teoria: Teoria;
  questoes: Acerto;
  /** Todos os simulados somados. */
  simulados: Acerto;
  /** O último simulado em que o assunto caiu. */
  ultimoSimulado: Acerto | null;
  /** Foi mal no último simulado em que caiu (acerto abaixo de `URGENTE_ABAIXO`): estudar logo. */
  urgente: boolean;
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
  const ultimos = ultimoSimuladoPorDisciplina(e.simulados, e.disciplinas);
  const plano = minutosNoPlano(e.blocos, e.disciplinas, e.agora);
  // As partes da prova e do plano contam dentro de cada concurso.
  const valorDoConcurso = new Map<Id, number>();
  const planoDoConcurso = new Map<Id, number>();
  for (const d of e.disciplinas) {
    valorDoConcurso.set(d.concursoId, (valorDoConcurso.get(d.concursoId) ?? 0) + valorNaProva(d));
    planoDoConcurso.set(d.concursoId, (planoDoConcurso.get(d.concursoId) ?? 0) + (plano.get(d.id) ?? 0));
  }
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
    const valor = valorNaProva(d);
    const minutosDoAssunto = plano.get(d.id) ?? 0;
    const ultimo = ultimos.get(d.id) ?? null;
    return {
      disciplina: d,
      valor,
      fracaoProva: valor / (valorDoConcurso.get(d.concursoId) || 1),
      minutosNoPlano: minutosDoAssunto,
      fracaoPlano: minutosDoAssunto / (planoDoConcurso.get(d.concursoId) || 1),
      segundos: segPorDisciplina.get(d.id) ?? 0,
      teoria: {
        previstos: porTopico.previstos,
        feitos: Math.min(porTopico.previstos, porTopico.feitos + (teoriaSemTopico.get(d.id) ?? 0) / duracaoBloco),
      },
      questoes: qPorDisciplina.get(d.id) ?? zero(),
      simulados: sims.get(d.id) ?? zero(),
      ultimoSimulado: ultimo,
      urgente: Boolean(ultimo && ultimo.feitas > 0 && ultimo.acertos / ultimo.feitas < URGENTE_ABAIXO),
      topicos,
    };
  });
}
