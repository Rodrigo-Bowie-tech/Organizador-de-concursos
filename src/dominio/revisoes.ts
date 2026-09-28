// Revisões espaçadas adaptativas. A teoria concluída agenda a primeira revisão
// para D+1. Quem avalia "bom" em todas segue a escada da SPEC: D+1, D+7, D+30 e
// D+90. A avaliação ajusta o ritmo: "fácil" afasta a próxima revisão, "difícil"
// aproxima, e "errei" recomeça a escada. Cada tópico guarda uma "facilidade"
// (como no SM-2 do Anki) que acelera ou freia os intervalos longos.

import { diasEntre, somarDias } from './datas';
import type { AvaliacaoRevisao, DiaISO, Disciplina, EstadoRevisao, Topico } from './tipos';

export type Avaliacao = AvaliacaoRevisao;

/** Intervalos da SPEC a partir de cada revisão: D+1 → D+7 → D+30 → D+90. */
export const ESCADA = [1, 6, 23, 60];
export const FACILIDADE_INICIAL = 2.5;
const FACILIDADE_MIN = 1.3;
const FACILIDADE_MAX = 3.0;

export function iniciarRevisao(hoje: DiaISO): EstadoRevisao {
  return {
    proxima: somarDias(hoje, ESCADA[0]),
    ultima: null,
    intervalo: ESCADA[0],
    facilidade: FACILIDADE_INICIAL,
    repeticoes: 0,
    lapsos: 0,
  };
}

/** Intervalo de um "bom" no estado atual, ajustado pela facilidade. */
function intervaloBom(e: EstadoRevisao): number {
  const degrau = e.repeticoes + 1;
  const base = degrau < ESCADA.length ? ESCADA[degrau] * (e.facilidade / FACILIDADE_INICIAL) : e.intervalo * e.facilidade;
  return Math.max(1, Math.round(base));
}

const limitar = (f: number) => Math.min(FACILIDADE_MAX, Math.max(FACILIDADE_MIN, Math.round(f * 100) / 100));

/** Em quantos dias cai a próxima revisão para cada avaliação (para mostrar nos botões). */
export function previsao(e: EstadoRevisao, a: Avaliacao): number {
  switch (a) {
    case 'errei':
      return 1;
    case 'dificil':
      return Math.max(1, Math.round(intervaloBom(e) / 2));
    case 'bom':
      return intervaloBom(e);
    case 'facil':
      return Math.max(2, Math.round(intervaloBom(e) * 1.5));
  }
}

export function registrarRevisao(e: EstadoRevisao, a: Avaliacao, hoje: DiaISO): EstadoRevisao {
  const intervalo = previsao(e, a);
  const base = { ...e, ultima: hoje, intervalo, proxima: somarDias(hoje, intervalo) };
  switch (a) {
    case 'errei':
      return { ...base, repeticoes: 0, lapsos: e.lapsos + 1, facilidade: limitar(e.facilidade - 0.2) };
    case 'dificil':
      // Repete o mesmo degrau mais cedo.
      return { ...base, facilidade: limitar(e.facilidade - 0.15) };
    case 'bom':
      return { ...base, repeticoes: e.repeticoes + 1 };
    case 'facil':
      return { ...base, repeticoes: e.repeticoes + 1, facilidade: limitar(e.facilidade + 0.15) };
  }
}

/** "amanhã", "em 6 dias", "em 2 meses". */
export function descreverIntervalo(dias: number): string {
  if (dias <= 1) return 'amanhã';
  if (dias < 45) return `em ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? 'em 1 mês' : `em ${meses} meses`;
}

export interface RevisaoPendente {
  disciplina: Disciplina;
  topico: Topico;
  estado: EstadoRevisao;
  /** Dias de atraso (0 = hoje; negativo = ainda vai vencer). */
  atraso: number;
}

/** Revisões de todas as disciplinas, das mais atrasadas para as mais distantes. */
export function revisoesAgendadas(disciplinas: Disciplina[], hoje: DiaISO): RevisaoPendente[] {
  const lista: RevisaoPendente[] = [];
  for (const d of disciplinas) {
    for (const t of Object.values(d.topicos)) {
      if (!t.revisao) continue;
      lista.push({ disciplina: d, topico: t, estado: t.revisao, atraso: diasEntre(t.revisao.proxima, hoje) });
    }
  }
  return lista.sort((a, b) => b.atraso - a.atraso || a.topico.titulo.localeCompare(b.topico.titulo, 'pt-BR'));
}

export interface ResumoRevisoes {
  atrasadas: RevisaoPendente[];
  hoje: RevisaoPendente[];
  proximas: RevisaoPendente[];
}

export function separarRevisoes(lista: RevisaoPendente[], diasAFrente = 7): ResumoRevisoes {
  return {
    atrasadas: lista.filter((r) => r.atraso > 0),
    hoje: lista.filter((r) => r.atraso === 0),
    proximas: lista.filter((r) => r.atraso < 0 && -r.atraso <= diasAFrente),
  };
}
