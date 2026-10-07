// Ajuste à realidade (seção 5.4): capacidade real por dia da semana e
// viabilidade do edital até a prova, com sugestão de cortes.

import { segundosPorDia } from './cronometro';
import { diaDaSemana, diaSP, diasEntre, somarDias } from './datas';
import { fracaoRevisao, filaDeTeoria, minutos, minutosDeclarados, slotsDoDia } from './planejador';
import type { AcertoRecente, ItemFila } from './planejador';
import type { Concurso, DiaISO, Disciplina, Disponibilidade, Id, Sessao, Simulado } from './tipos';

export const JANELA_CAPACIDADE = 14;
/** Abaixo de 80% do declarado, o plano passa a usar a capacidade real. */
const LIMITE_AJUSTE = 0.8;

export interface CapacidadeDia {
  diaSemana: number;
  /** Média declarada nos dias da janela, em minutos. */
  declarado: number;
  /** Média estudada nos dias da janela, em minutos. */
  real: number;
  ajustado: boolean;
}

/**
 * Média móvel de 14 dias de horas líquidas por dia da semana, comparada com a
 * disponibilidade declarada. Só ajusta com pelo menos 14 dias de uso.
 */
export function capacidadeReal(sessoes: Sessao[], d: Disponibilidade, agora: Date | number, janela = JANELA_CAPACIDADE): CapacidadeDia[] {
  const hoje = diaSP(agora);
  const primeiro = sessoes.reduce<DiaISO | null>((p, s) => {
    const dia = diaSP(s.inicio);
    return !p || dia < p ? dia : p;
  }, null);
  const temHistorico = primeiro !== null && diasEntre(primeiro, hoje) >= janela;
  const porDia = segundosPorDia(sessoes, agora);
  const acumulado = Array.from({ length: 7 }, () => ({ declarado: 0, real: 0, dias: 0 }));
  for (let n = 1; n <= janela; n++) {
    const dia = somarDias(hoje, -n);
    const a = acumulado[diaDaSemana(dia)];
    a.declarado += minutosDeclarados(d, dia);
    a.real += (porDia.get(dia) ?? 0) / 60;
    a.dias++;
  }
  return acumulado.map((a, diaSemana) => {
    const declarado = a.dias ? a.declarado / a.dias : 0;
    const real = a.dias ? a.real / a.dias : 0;
    return { diaSemana, declarado, real, ajustado: temHistorico && declarado > 0 && real < declarado * LIMITE_AJUSTE };
  });
}

/**
 * Minutos por dia da semana para o planejador. Nos dias ajustados, usa a
 * média real, com pelo menos um bloco para manter o ritmo.
 */
export function capacidadeParaPlano(c: CapacidadeDia[], d: Disponibilidade): Record<string, number> | undefined {
  const ajustados = c.filter((x) => x.ajustado);
  if (!ajustados.length) return undefined;
  return Object.fromEntries(ajustados.map((x) => [String(x.diaSemana), Math.max(d.blocoMin || 60, Math.round(x.real))]));
}

const NOMES = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

const horas = (min: number) => {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

/** "Você planeja 4h00 às terças mas estuda 2h10 em média; ajustei o plano." */
export function avisoCapacidade(c: CapacidadeDia): string {
  const artigo = c.diaSemana === 0 || c.diaSemana === 6 ? 'aos' : 'às';
  return `Você planeja ${horas(c.declarado)} ${artigo} ${NOMES[c.diaSemana]} mas estuda ${horas(c.real)} em média; ajustei o plano.`;
}

// ------------------------------------------------------------- viabilidade

export interface Viabilidade {
  concurso: Concurso;
  /** Blocos de teoria que faltam para fechar o edital. */
  necessarios: number;
  /** Blocos de teoria que cabem até a prova (descontada a cota de revisão). */
  disponiveis: number;
  fecha: boolean;
  /** Tópicos de menor prioridade cujo corte fecha a conta, do menos importante ao mais. */
  cortes: ItemFila[];
}

export function viabilidade(
  concurso: Concurso,
  disciplinas: Disciplina[],
  d: Disponibilidade,
  agora: Date | number,
  acertos: Map<Id, AcertoRecente> = new Map(),
  capacidadeMin?: Record<string, number>,
  simulados: Simulado[] = [],
): Viabilidade | null {
  if (!concurso.dataProva) return null;
  const hoje = diaSP(agora);
  const dias = diasEntre(hoje, concurso.dataProva);
  if (dias < 0) return null;
  const fila = filaDeTeoria([concurso], disciplinas.filter((x) => x.concursoId === concurso.id), acertos, hoje, simulados);
  const necessarios = fila.reduce((t, i) => t + i.blocos, 0);

  let disponiveis = 0;
  for (let n = 0; n < dias; n++) {
    const dia = somarDias(hoje, n);
    let slots = slotsDoDia(d, dia);
    const cap = capacidadeMin?.[String(diaDaSemana(dia))];
    if (cap !== undefined) {
      let usados = 0;
      slots = slots.filter((s) => {
        if (usados >= cap) return false;
        usados += minutos(s);
        return true;
      });
    }
    // Na última semana o plano prefere revisão, mas ainda dá para ver teoria: a conta para em 60%.
    disponiveis += slots.length * (1 - Math.min(0.6, fracaoRevisao(diasEntre(dia, concurso.dataProva))));
  }
  disponiveis = Math.floor(disponiveis);

  const cortes: ItemFila[] = [];
  if (necessarios > disponiveis) {
    let falta = necessarios - disponiveis;
    for (const item of [...fila].reverse()) {
      if (falta <= 0) break;
      cortes.push(item);
      falta -= item.blocos;
    }
  }
  return { concurso, necessarios, disponiveis, fecha: necessarios <= disponiveis, cortes };
}
