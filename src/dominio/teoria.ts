// Progresso da teoria de cada tópico: quantos blocos já foram feitos, quanto falta da
// estimativa, quais tópicos chegaram ao fim dos blocos previstos sem a teoria confirmada e em
// que ritmo cada assunto (disciplina) está andando em relação ao previsto.
//
// Blocos feitos = o maior entre (tempo de teoria no tópico ÷ duração do bloco) e (blocos de
// teoria marcados como feitos; parcial vale meio). Assim conta tanto quem usa o cronômetro
// quanto quem só marca o bloco, sem somar os dois. Tópicos vinculados contam juntos.

import { segundosLiquidos } from './cronometro';
import { topicoConcluido, topicosFolha } from './painel';
import { achatar } from './topicos';
import type { BlocoPlanejado, Disciplina, Id, Sessao, Topico } from './tipos';

/** Estimativa quando o tópico não tem a sua ("Blocos de teoria" em branco no Edital). */
export const BLOCOS_TEORIA_PADRAO = 2;
/** Fração de bloco que já conta como bloco feito (o mesmo critério do "feito" sugerido: 75%). */
const TOLERANCIA = 0.25;
/** A partir de quanto acima do previsto o app sugere ajustar o resto do assunto. */
export const RITMO_PARA_AJUSTE = 1.25;

const chaveDoGrupo = (t: Pick<Topico, 'id' | 'grupoEquivalenciaId'>) => t.grupoEquivalenciaId ?? t.id;

/** Blocos de teoria previstos para o tópico (total, não o que falta). */
export function estimativaTeoria(t: Pick<Topico, 'blocosTeoria'>): number {
  return t.blocosTeoria && t.blocosTeoria >= 1 ? Math.round(t.blocosTeoria) : BLOCOS_TEORIA_PADRAO;
}

/** Blocos de teoria feitos em cada tópico (tópicos vinculados recebem a soma do grupo). */
export function blocosDeTeoriaFeitos(
  sessoes: Sessao[],
  blocos: BlocoPlanejado[],
  disciplinas: Disciplina[],
  blocoMin: number,
  agora: Date | number = Date.now(),
): Map<Id, number> {
  const grupoDe = new Map<Id, string>();
  for (const d of disciplinas) for (const t of Object.values(d.topicos)) grupoDe.set(t.id, chaveDoGrupo(t));
  const porTempo = new Map<string, number>();
  const porMarcacao = new Map<string, number>();
  const somar = (m: Map<string, number>, topicoId: Id | null, valor: number) => {
    const g = topicoId ? grupoDe.get(topicoId) : undefined;
    if (g && valor > 0) m.set(g, (m.get(g) ?? 0) + valor);
  };
  const duracao = Math.max(15, blocoMin || 60) * 60;
  for (const s of sessoes) if (s.tipo === 'teoria' && s.fim) somar(porTempo, s.topicoId, segundosLiquidos(s, agora) / duracao);
  for (const b of blocos) {
    if (b.motivo !== 'teoria') continue;
    somar(porMarcacao, b.topicoId, b.status === 'feito' ? 1 : b.status === 'parcial' ? 0.5 : 0);
  }
  const feitos = new Map<Id, number>();
  for (const [topicoId, g] of grupoDe) {
    const n = Math.max(porTempo.get(g) ?? 0, porMarcacao.get(g) ?? 0);
    if (n > 0) feitos.set(topicoId, n);
  }
  return feitos;
}

/** Blocos de teoria que ainda faltam pela estimativa (0 = os previstos acabaram). */
export function restanteDeTeoria(t: Pick<Topico, 'blocosTeoria'>, feitos: number): number {
  return Math.max(0, Math.ceil(estimativaTeoria(t) - feitos - TOLERANCIA));
}

/** Os blocos previstos acabaram e a teoria ainda não foi dada como concluída. */
export function teoriaNoFim(t: Topico, feitos: number): boolean {
  return !topicoConcluido(t) && !t.cortado && feitos > 0 && restanteDeTeoria(t, feitos) === 0;
}

/**
 * Resposta "ainda não terminei, preciso de mais `mais` blocos": a estimativa vira o que já foi
 * feito + `mais`; a original fica guardada para medir o ritmo do assunto.
 */
export function estimativaComMais(
  t: Pick<Topico, 'blocosTeoria' | 'blocosTeoriaOriginal'>,
  feitos: number,
  mais: number,
): { blocosTeoria: number; blocosTeoriaOriginal: number; blocosTeoriaPedidos: number } {
  const atual = estimativaTeoria(t);
  const original = t.blocosTeoriaOriginal ?? atual;
  const novo = Math.max(atual, Math.round(feitos)) + Math.max(1, Math.round(mais));
  return { blocosTeoria: novo, blocosTeoriaOriginal: original, blocosTeoriaPedidos: novo - original };
}

/** Arredonda para meio bloco, para mostrar ("2,5 de 4 blocos"). */
export const meioBloco = (n: number): number => Math.round(n * 2) / 2;

export interface TeoriaAConfirmar {
  disciplina: Disciplina;
  topico: Topico;
  feitos: number;
  estimativa: number;
}

/** Tópicos em que os blocos previstos acabaram: perguntar se a teoria terminou. */
export function teoriasAConfirmar(disciplinas: Disciplina[], feitos: Map<Id, number>): TeoriaAConfirmar[] {
  const vistos = new Set<string>();
  const saida: TeoriaAConfirmar[] = [];
  for (const d of [...disciplinas].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))) {
    const folhas = new Set(topicosFolha(d.topicos).map((t) => t.id));
    for (const { topico: t } of achatar(d.topicos)) {
      if (!folhas.has(t.id) || vistos.has(chaveDoGrupo(t))) continue;
      const n = feitos.get(t.id) ?? 0;
      if (!teoriaNoFim(t, n)) continue;
      vistos.add(chaveDoGrupo(t));
      saida.push({ disciplina: d, topico: t, feitos: n, estimativa: estimativaTeoria(t) });
    }
  }
  return saida;
}

// ---------------------------------------------------------- ritmo do assunto

export interface RitmoDoAssunto {
  /** Blocos que os tópicos com resultado levaram (ou já pedem). */
  real: number;
  /** O que estava previsto para esses mesmos tópicos. */
  previsto: number;
  /** real ÷ previsto. */
  fator: number;
  topicos: number;
}

/**
 * Ritmo do assunto pelos tópicos que já dizem algo: os concluídos (levaram os blocos feitos) e
 * os que pediram mais blocos (levam pelo menos a estimativa nova). Sempre contra a estimativa
 * original, para o ajuste não se acumular.
 */
export function ritmoDoAssunto(d: Disciplina, feitos: Map<Id, number>): RitmoDoAssunto | null {
  let real = 0;
  let previsto = 0;
  let topicos = 0;
  for (const t of topicosFolha(d.topicos)) {
    if (t.cortado) continue;
    const n = feitos.get(t.id) ?? 0;
    const original = t.blocosTeoriaOriginal ?? estimativaTeoria(t);
    if (topicoConcluido(t) && n > 0) {
      real += n;
    } else if (!topicoConcluido(t) && (t.blocosTeoriaPedidos ?? 0) > 0) {
      real += Math.max(n, estimativaTeoria(t));
    } else continue;
    previsto += original;
    topicos++;
  }
  return topicos && previsto ? { real, previsto, fator: real / previsto, topicos } : null;
}

export interface AjusteDoAssunto {
  disciplina: Disciplina;
  ritmo: RitmoDoAssunto;
  mudancas: { topico: Topico; de: number; para: number }[];
}

/**
 * Sugestão para os tópicos do assunto que ainda não começaram, quando o assunto anda acima de
 * `RITMO_PARA_AJUSTE` × o previsto: a estimativa original vezes o ritmo.
 */
export function sugestaoDeAjuste(d: Disciplina, feitos: Map<Id, number>): AjusteDoAssunto | null {
  const ritmo = ritmoDoAssunto(d, feitos);
  if (!ritmo || ritmo.fator < RITMO_PARA_AJUSTE) return null;
  const mudancas: AjusteDoAssunto['mudancas'] = [];
  const folhas = new Set(topicosFolha(d.topicos).map((t) => t.id));
  for (const { topico: t } of achatar(d.topicos)) {
    if (!folhas.has(t.id)) continue;
    if (topicoConcluido(t) || t.cortado || (feitos.get(t.id) ?? 0) > 0 || (t.blocosTeoriaPedidos ?? 0) > 0) continue;
    const de = estimativaTeoria(t);
    const para = Math.max(1, Math.round((t.blocosTeoriaOriginal ?? de) * ritmo.fator));
    if (para > de) mudancas.push({ topico: t, de, para });
  }
  return mudancas.length ? { disciplina: d, ritmo, mudancas } : null;
}
