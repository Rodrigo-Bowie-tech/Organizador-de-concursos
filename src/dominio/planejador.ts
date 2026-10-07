// Planejador adaptativo (seções 5.1, 5.2 e 5.4 da SPEC). Função pura: recebe o
// estado do estudo e a disponibilidade e devolve os blocos planejados de agora
// até o horizonte. Replanejar é chamar de novo: o que já foi estudado muda o
// status e o domínio dos tópicos, e a fila se reorganiza sozinha.

import { intervalosAtivos } from './cronometro';
import { diaDaSemana, diaSP, diasEntre, instanteSP, somarDias } from './datas';
import { topicoConcluido, topicosFolha } from './painel';
import { achatar } from './topicos';
import type { BlocoHorario, BlocoPlanejado, Concurso, DiaISO, Disciplina, Disponibilidade, Id, Sessao, Simulado, Topico } from './tipos';

export const DISPONIBILIDADE_VAZIA: Disponibilidade = { dias: {}, excecoes: {}, blocoMin: 60 };
/** Horizonte quando falta a data de alguma prova. */
export const HORIZONTE_DIAS = 28;
/** Com todas as datas de prova, o plano vai até a última, limitado a este número de dias. */
export const HORIZONTE_MAXIMO_DIAS = 120;
/** Blocos de teoria estimados por tópico: não iniciado 2, em estudo 1. */
const BLOCOS_TEORIA = { nao_iniciado: 2, em_estudo: 1 } as const;
const MINIMO_BLOCO_MIN = 25;
/** Tempo de uma revisão de tópico: um bloco de 60 min junta até 3 revisões. */
export const MINUTOS_POR_REVISAO = 20;
/** A cota de revisão e questões vale para os últimos N blocos (não para o plano inteiro). */
const JANELA_COTA = 10;

// ------------------------------------------------------------ horários

const paraMin = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const paraHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function minutos(b: Pick<BlocoHorario, 'inicio' | 'fim'>): number {
  return Math.max(0, paraMin(b.fim) - paraMin(b.inicio));
}

/** Janelas de estudo de um dia: a exceção, se houver, senão a grade do dia da semana. */
export function janelasDoDia(d: Disponibilidade, dia: DiaISO): BlocoHorario[] {
  const lista = d.excecoes[dia]?.blocos ?? d.dias[String(diaDaSemana(dia))] ?? [];
  return [...lista].filter((b) => minutos(b) > 0).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Minutos declarados de estudo num dia. */
export function minutosDeclarados(d: Disponibilidade, dia: DiaISO): number {
  return janelasDoDia(d, dia).reduce((t, b) => t + minutos(b), 0);
}

/** Divide as janelas em blocos de `blocoMin`; sobra de pelo menos 25 min vira bloco menor. */
export function slotsDoDia(d: Disponibilidade, dia: DiaISO): BlocoHorario[] {
  const passo = Math.max(15, d.blocoMin || 60);
  const slots: BlocoHorario[] = [];
  for (const j of janelasDoDia(d, dia)) {
    let ini = paraMin(j.inicio);
    const fim = paraMin(j.fim);
    while (fim - ini >= MINIMO_BLOCO_MIN) {
      const f = Math.min(fim, ini + passo);
      // Evita um toco no fim da janela: se sobrar menos que o mínimo, estica este bloco.
      const ate = fim - f < MINIMO_BLOCO_MIN ? fim : f;
      slots.push({ inicio: paraHora(ini), fim: paraHora(ate) });
      ini = ate;
    }
  }
  return slots;
}

// ------------------------------------------------------ prioridade (5.1)

export interface AcertoRecente {
  /** Acerto ponderado pela recência (0 a 1). */
  taxa: number;
  feitas: number;
}

/** Acerto por tópico com peso maior para o recente (meia-vida de 30 dias). */
export function acertoRecente(
  registros: { topicoId: string | null; feitas: number; acertos: number; dia: DiaISO }[],
  hoje: DiaISO,
): Map<Id, AcertoRecente> {
  const soma = new Map<Id, { p: number; a: number; feitas: number }>();
  for (const r of registros) {
    if (!r.topicoId || !r.feitas) continue;
    const peso = Math.pow(0.5, Math.max(0, diasEntre(r.dia, hoje)) / 30) * r.feitas;
    const x = soma.get(r.topicoId) ?? { p: 0, a: 0, feitas: 0 };
    x.p += peso;
    x.a += peso * (Math.min(r.acertos, r.feitas) / r.feitas);
    x.feitas += r.feitas;
    soma.set(r.topicoId, x);
  }
  const saida = new Map<Id, AcertoRecente>();
  for (const [id, x] of soma) saida.set(id, { taxa: x.p ? x.a / x.p : 0, feitas: x.feitas });
  return saida;
}

/**
 * Domínio de 0 a 1: teoria (até 0,5), autoavaliação (0,25) e acerto recente
 * (0,25, a partir de 5 questões). Dominado vale pelo menos 0,9.
 */
export function dominio(t: Topico, acerto?: AcertoRecente): number {
  const teoria = { nao_iniciado: 0, em_estudo: 0.15, teoria_concluida: 0.45, revisado: 0.5, dominado: 0.5 }[t.status];
  const auto = t.autoavaliacao ? ((t.autoavaliacao - 1) / 4) * 0.25 : 0;
  const questoes = acerto && acerto.feitas >= 5 ? acerto.taxa * 0.25 : 0;
  const d = teoria + auto + questoes;
  return Math.min(1, t.status === 'dominado' ? Math.max(0.9, d) : d);
}

/** Cresce de 0 (120 dias ou mais até a prova) a 1 (dia da prova). */
function proximidade(diasAteProva: number | null): number {
  if (diasAteProva === null) return 0;
  return Math.min(1, Math.max(0, 1 - diasAteProva / 120));
}

/** Blocos de teoria que faltam: a estimativa do tópico (metade, se já está em estudo) ou o padrão. */
export function blocosDeTeoria(t: Pick<Topico, 'status' | 'blocosTeoria'>): number {
  const padrao = BLOCOS_TEORIA[t.status as 'nao_iniciado' | 'em_estudo'] ?? 1;
  if (!t.blocosTeoria || t.blocosTeoria < 1) return padrao;
  return t.status === 'em_estudo' ? Math.max(1, Math.ceil(t.blocosTeoria / 2)) : Math.round(t.blocosTeoria);
}

// ------------------------------------------------------ simulados

export interface AjusteSimulado {
  /** Multiplica o peso da disciplina na prioridade (0,5 a 1,5). */
  fator: number;
  /** Acerto da disciplina no último simulado em que ela apareceu (0 a 1). */
  taxa: number;
  /** Questões dela nesse simulado (máximo ÷ peso). */
  questoes: number;
}

/**
 * O último simulado em que a disciplina apareceu dá o tom: 70% de acerto é neutro;
 * abaixo disso ela sobe de prioridade (até 1,5×), acima desce (até 0,5×). Com menos de
 * 5 questões dela no simulado o efeito é proporcionalmente menor (1 questão = 1/5 do efeito).
 */
export function ajusteDosSimulados(simulados: Simulado[], disciplinas: Disciplina[]): Map<Id, AjusteSimulado> {
  const peso = new Map(disciplinas.map((d) => [d.id, Math.max(0.01, d.peso)]));
  const saida = new Map<Id, AjusteSimulado>();
  const ordem = [...simulados].sort((a, b) => b.dia.localeCompare(a.dia));
  for (const s of ordem) {
    for (const n of s.notas) {
      if (!n.disciplinaId || saida.has(n.disciplinaId) || !(n.maximo > 0)) continue;
      const taxa = Math.min(1, Math.max(0, n.nota / n.maximo));
      const questoes = n.maximo / (peso.get(n.disciplinaId) ?? 1);
      const cheio = Math.min(1.5, Math.max(0.5, 1.7 - taxa));
      saida.set(n.disciplinaId, { fator: 1 + Math.min(1, questoes / 5) * (cheio - 1), taxa, questoes });
    }
  }
  return saida;
}

export interface ItemFila {
  concursoIds: Id[];
  disciplina: Disciplina;
  topico: Topico;
  prioridade: number;
  /** Blocos de teoria ainda estimados. */
  blocos: number;
}

/**
 * prioridade = pesoDisciplina × incidência × (1 − domínio) × urgência × peso do concurso.
 * O peso da disciplina é ajustado pelo último simulado (`ajusteDosSimulados`).
 * Tópicos vinculados entre concursos aparecem uma vez só, somando as prioridades.
 * Empate: a ordem das disciplinas e, dentro delas, a ordem do edital.
 */
export function filaDeTeoria(
  concursos: Concurso[],
  disciplinas: Disciplina[],
  acertos: Map<Id, AcertoRecente>,
  hoje: DiaISO,
  simulados: Simulado[] = [],
): ItemFila[] {
  const ajustes = ajusteDosSimulados(simulados, disciplinas);
  const posicao = new Map<Id, number>();
  const ativos = new Map(
    concursos
      .filter((c) => c.status !== 'prova_feita' && (!c.dataProva || c.dataProva >= hoje))
      .map((c) => [c.id, c]),
  );
  const porGrupo = new Map<string, ItemFila>();
  for (const [concursoId, c] of ativos) {
    const discs = disciplinas.filter((d) => d.concursoId === concursoId);
    const valor = (d: Disciplina) => Math.max(0.01, d.peso) * (d.numQuestoes ?? 1);
    const maxValor = Math.max(0, ...discs.map(valor));
    const dias = c.dataProva ? diasEntre(hoje, c.dataProva) : null;
    const pesoConcurso = (Math.max(1, c.prioridade) / 5) * (1 + proximidade(dias));
    for (const d of discs) {
      achatar(d.topicos).forEach((l, i) => posicao.set(l.topico.id, i));
      const folhas = topicosFolha(d.topicos);
      const maxInc = Math.max(0, ...folhas.map((t) => t.incidencia ?? 0));
      for (const t of folhas) {
        if (topicoConcluido(t) || t.cortado) continue;
        const pesoDisc = (maxValor ? valor(d) / maxValor : 1) * (ajustes.get(d.id)?.fator ?? 1);
        const incidencia = maxInc ? 1 + (t.incidencia ?? 0) / maxInc : 1;
        const urgencia = 1 + proximidade(dias) * (t.status === 'nao_iniciado' ? 1 : 0.5);
        const prioridade = pesoDisc * incidencia * (1 - dominio(t, acertos.get(t.id))) * urgencia * pesoConcurso;
        const chave = t.grupoEquivalenciaId ?? t.id;
        const existente = porGrupo.get(chave);
        if (existente) {
          existente.prioridade += prioridade;
          if (!existente.concursoIds.includes(concursoId)) existente.concursoIds.push(concursoId);
          continue;
        }
        porGrupo.set(chave, {
          concursoIds: [concursoId],
          disciplina: d,
          topico: t,
          prioridade,
          blocos: blocosDeTeoria(t),
        });
      }
    }
  }
  return [...porGrupo.values()].sort(
    (a, b) =>
      b.prioridade - a.prioridade ||
      a.disciplina.ordem - b.disciplina.ordem ||
      (posicao.get(a.topico.id) ?? 0) - (posicao.get(b.topico.id) ?? 0) ||
      a.topico.titulo.localeCompare(b.topico.titulo),
  );
}

/**
 * Fração dos blocos para revisão e questões: 20% longe da prova, subindo até 60% nas últimas
 * 3 semanas; na última semana, tudo (teoria nova só se não houver revisão nem questão para fazer).
 */
export function fracaoRevisao(diasAteProva: number | null): number {
  if (diasAteProva === null || diasAteProva > 42) return 0.2;
  if (diasAteProva <= 7) return 1;
  if (diasAteProva <= 21) return 0.6;
  return 0.2 + ((42 - diasAteProva) / 21) * 0.4;
}

// --------------------------------------------------------- geração (5.2)

export interface EntradaPlano {
  agora: Date;
  concursos: Concurso[];
  disciplinas: Disciplina[];
  disponibilidade: Disponibilidade;
  /** Blocos já gravados: os marcados (feito, parcial, pulado) e os passados ficam como estão. */
  existentes: BlocoPlanejado[];
  acertos?: Map<Id, AcertoRecente>;
  /** Fase 4: minutos por dia da semana ("0" a "6") que cabem na rotina real. */
  capacidadeMin?: Record<string, number>;
  horizonteDias?: number;
  /** Teoria em rodízio entre as N disciplinas de maior prioridade (0 ou 1 = desligado). */
  intercalar?: number;
  /** Último estudo de teoria de cada disciplina (instante ISO): o rodízio continua de onde parou. */
  ultimoEstudo?: Map<Id, string>;
  /** O último simulado de cada disciplina ajusta a prioridade dela. */
  simulados?: Simulado[];
  novoId: () => Id;
}

interface ItemRevisao {
  disciplina: Disciplina;
  topico: Topico;
  concursoId: Id;
  devida: DiaISO;
  atrasada: boolean;
}

/** Os blocos planejados (novos) de agora até o horizonte. */
export function gerarPlano(e: EntradaPlano): BlocoPlanejado[] {
  const hoje = diaSP(e.agora);
  const acertos = e.acertos ?? new Map();
  const simulados = e.simulados ?? [];
  const ajustes = ajusteDosSimulados(simulados, e.disciplinas);
  const fila = filaDeTeoria(e.concursos, e.disciplinas, acertos, hoje, simulados);
  const concursosAtivos = e.concursos.filter((c) => c.status !== 'prova_feita' && (!c.dataProva || c.dataProva >= hoje));
  const ativos = new Set(concursosAtivos.map((c) => c.id));
  const dataProva = new Map(concursosAtivos.map((c) => [c.id, c.dataProva]));
  // Só contam as provas dos concursos com disciplinas (um concurso "previsto" vazio não segura o plano).
  const comEstudo = concursosAtivos.filter((c) => e.disciplinas.some((d) => d.concursoId === c.id));
  const provas = comEstudo.map((c) => c.dataProva).filter((d): d is DiaISO => Boolean(d)).sort();
  const todosComData = comEstudo.length > 0 && provas.length === comEstudo.length;
  const horizonte =
    e.horizonteDias ?? (todosComData ? Math.min(HORIZONTE_MAXIMO_DIAS, diasEntre(hoje, provas[provas.length - 1]) + 1) : HORIZONTE_DIAS);
  const intercalar = Math.max(0, Math.floor(e.intercalar ?? 0));
  const ultimo = new Map(e.ultimoEstudo ?? []);
  /** O tópico ainda serve para alguma prova neste dia? */
  const valeEm = (concursoIds: Id[], dia: DiaISO) => concursoIds.some((id) => !dataProva.get(id) || (dataProva.get(id) as DiaISO) >= dia);

  // Revisões: as agendadas nos tópicos, uma por grupo de tópicos vinculados.
  const revisoes: ItemRevisao[] = [];
  const gruposComRevisao = new Set<string>();
  for (const d of e.disciplinas) {
    if (!ativos.has(d.concursoId)) continue;
    for (const t of Object.values(d.topicos)) {
      if (!t.revisao || t.cortado) continue;
      const chave = t.grupoEquivalenciaId ?? t.id;
      if (gruposComRevisao.has(chave)) continue;
      gruposComRevisao.add(chave);
      revisoes.push({ disciplina: d, topico: t, concursoId: d.concursoId, devida: t.revisao.proxima, atrasada: t.revisao.proxima < hoje });
    }
  }
  // Tópicos concluídos, candidatos a blocos de questões (pior acerto primeiro). Os "dominados"
  // ficam de fora, a não ser que o último simulado da disciplina tenha ficado abaixo de 70%.
  const fracaNoSimulado = (d: Disciplina) => (ajustes.get(d.id)?.taxa ?? 1) < 0.7;
  const paraQuestoes = e.disciplinas
    .filter((d) => ativos.has(d.concursoId))
    .flatMap((d) =>
      topicosFolha(d.topicos)
        .filter((t) => topicoConcluido(t) && !t.cortado && (t.status !== 'dominado' || fracaNoSimulado(d)))
        .map((t) => ({ d, t, aPartirDe: hoje })),
    )
    .sort(
      (a, b) =>
        (acertos.get(a.t.id)?.taxa ?? 0.5) - (acertos.get(b.t.id)?.taxa ?? 0.5) ||
        (ajustes.get(b.d.id)?.fator ?? 1) - (ajustes.get(a.d.id)?.fator ?? 1),
    );

  // Horários ocupados por blocos que ficam: marcados, passados e os movidos por você (fixos).
  const agoraMs = e.agora.getTime();
  const ficam = e.existentes.filter((b) => b.status !== 'planejado' || b.fixo || instanteSP(b.dia, b.inicio).getTime() < agoraMs);
  const fixosFuturos = e.existentes.filter((b) => b.status === 'planejado' && b.fixo && instanteSP(b.dia, b.inicio).getTime() >= agoraMs);
  const ocupado = (dia: DiaISO, s: BlocoHorario) =>
    ficam.some((b) => b.dia === dia && b.inicio < s.fim && s.inicio < b.fim);

  const plano: BlocoPlanejado[] = [];
  const restantes = fila.map((i) => ({ ...i }));
  // O que os blocos fixos já cobrem não entra de novo.
  for (const b of fixosFuturos) {
    if (b.motivo === 'teoria') {
      const i = restantes.findIndex((x) => x.topico.id === b.topicoId);
      if (i >= 0 && --restantes[i].blocos <= 0) restantes.splice(i, 1);
    } else {
      for (const id of [b.topicoId, ...(b.revisoes ?? [])]) {
        const r = revisoes.findIndex((x) => x.topico.id === id);
        if (r >= 0) revisoes.splice(r, 1);
      }
    }
  }
  let questoesIdx = 0;
  /** Próximo tópico para questões (em rodízio), só de concursos cuja prova ainda não passou. */
  const proximaQuestao = (dia: DiaISO) => {
    for (let k = 0; k < paraQuestoes.length; k++) {
      const q = paraQuestoes[questoesIdx++ % paraQuestoes.length];
      if (q.aPartirDe <= dia && valeEm([q.d.concursoId], dia)) return q;
    }
    return null;
  };

  const bloco = (dia: DiaISO, s: BlocoHorario, d: Disciplina, t: Topico, concursoId: Id, motivo: BlocoPlanejado['motivo']): BlocoPlanejado => ({
    id: e.novoId(),
    dia,
    inicio: s.inicio,
    fim: s.fim,
    concursoId,
    disciplinaId: d.id,
    topicoId: t.id,
    tipo: motivo === 'teoria' ? 'teoria' : motivo === 'questoes' ? 'questoes' : 'revisao',
    status: 'planejado',
    motivo,
  });

  /** Um bloco de revisão junta as revisões que couberem nele (atrasadas primeiro). */
  const blocoDeRevisao = (dia: DiaISO, s: BlocoHorario, devidas: ItemRevisao[]): BlocoPlanejado => {
    const cabem = Math.max(1, Math.floor(minutos(s) / MINUTOS_POR_REVISAO));
    const itens = [...devidas.filter((r) => r.atrasada), ...devidas.filter((r) => !r.atrasada)].slice(0, cabem);
    for (const r of itens) revisoes.splice(revisoes.indexOf(r), 1);
    const [r0] = itens;
    const motivo = itens.some((r) => r.atrasada) ? 'revisao_atrasada' : 'revisao';
    const b = bloco(dia, s, r0.disciplina, r0.topico, r0.concursoId, motivo);
    if (itens.length > 1) {
      b.revisoes = itens.map((r) => r.topico.id);
      b.topicoId = null;
      if (itens.some((r) => r.disciplina.id !== r0.disciplina.id)) b.disciplinaId = null;
    }
    return b;
  };

  for (let n = 0; n < horizonte; n++) {
    const dia = somarDias(hoje, n);
    if (todosComData && dia > provas[provas.length - 1]) break;
    let slots = slotsDoDia(e.disponibilidade, dia).filter(
      (s) => instanteSP(dia, s.inicio).getTime() >= agoraMs && !ocupado(dia, s),
    );
    // Fase 4: capacidade real do dia da semana.
    const cap = e.capacidadeMin?.[String(diaDaSemana(dia))];
    if (cap !== undefined) {
      let usados = 0;
      slots = slots.filter((s) => {
        if (usados >= cap) return false;
        usados += minutos(s);
        return true;
      });
    }
    const proxima = provas.find((p) => p >= dia) ?? null;
    const diasAteProva = proxima ? diasEntre(dia, proxima) : null;
    const fracao = fracaoRevisao(diasAteProva);

    for (const s of slots) {
      // 1. Revisão atrasada ou vencida entra no próximo bloco livre.
      const devidas = revisoes.filter((r) => r.devida <= dia && valeEm([r.concursoId], dia)).sort((a, b) => a.devida.localeCompare(b.devida));
      const atrasadas = devidas.filter((r) => r.atrasada);
      let escolhido: BlocoPlanejado | null = null;
      let q: ReturnType<typeof proximaQuestao> = null;
      // Cota medida nos últimos blocos, para a mudança perto da prova não virar uma fila de questões.
      const janela = plano.slice(-JANELA_COTA);
      const querRevisao = janela.length === 0 ? fracao > 0 : janela.filter((b) => b.motivo !== 'teoria').length / janela.length < fracao;
      // Revisão vira bloco quando enche o bloco ou quando alguma já espera 2 dias.
      const cabem = Math.max(1, Math.floor(minutos(s) / MINUTOS_POR_REVISAO));
      const juntou = devidas.length >= cabem || devidas.some((r) => r.devida <= somarDias(dia, -2));
      const validos = restantes.filter((i) => valeEm(i.concursoIds, dia));
      if (atrasadas.length || (querRevisao && devidas.length && juntou)) {
        escolhido = blocoDeRevisao(dia, s, devidas);
      } else if (querRevisao && paraQuestoes.length && (q = proximaQuestao(dia))) {
        // 2. Parte do tempo vai para questões dos tópicos já vistos (pior acerto primeiro).
        escolhido = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
      } else if (validos.length) {
        let item: (typeof restantes)[number];
        if (intercalar >= 2) {
          // 3a. Rodízio: entre as N disciplinas de maior prioridade, a estudada há mais tempo
          // (nunca estudada vem antes; empate pela ordem das disciplinas).
          const roda: Disciplina[] = [];
          for (const i of validos) {
            if (roda.length >= intercalar) break;
            if (!roda.some((d) => d.id === i.disciplina.id)) roda.push(i.disciplina);
          }
          const alvo = roda.reduce((a, b) => {
            const [ua, ub] = [ultimo.get(a.id) ?? '', ultimo.get(b.id) ?? ''];
            if (ua !== ub) return ua < ub ? a : b;
            return b.ordem < a.ordem ? b : a;
          });
          item = validos.find((i) => i.disciplina.id === alvo.id) as (typeof restantes)[number];
          ultimo.set(alvo.id, instanteSP(dia, s.inicio).toISOString());
        } else {
          // 3b. Teoria: maior prioridade, sem passar de 2 blocos seguidos da mesma disciplina.
          const [u1, u2] = [plano[plano.length - 1], plano[plano.length - 2]];
          const bloqueada = u1 && u2 && u1.disciplinaId === u2.disciplinaId ? u1.disciplinaId : null;
          item = validos.find((i) => i.disciplina.id !== bloqueada) ?? validos[0];
        }
        const idx = restantes.indexOf(item);
        escolhido = bloco(dia, s, item.disciplina, item.topico, item.concursoIds[0], 'teoria');
        item.blocos--;
        if (item.blocos <= 0) {
          restantes.splice(idx, 1);
          // Teoria planejada até aqui gera as revisões de D+1 e D+7 no plano e, a partir de D+7, questões.
          for (const k of [1, 7]) {
            revisoes.push({ disciplina: item.disciplina, topico: item.topico, concursoId: item.concursoIds[0], devida: somarDias(dia, k), atrasada: false });
          }
          paraQuestoes.push({ d: item.disciplina, t: item.topico, aPartirDe: somarDias(dia, 7) });
        }
      } else if (devidas.length) {
        // Sem teoria pela frente: as revisões vencidas não esperam a cota.
        escolhido = blocoDeRevisao(dia, s, devidas);
      } else if (paraQuestoes.length && (q = proximaQuestao(dia))) {
        escolhido = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
      }
      if (!escolhido) continue;
      plano.push(escolhido);
    }
  }
  return plano;
}

// ----------------------------------------------------- realizado × planejado

/** Segundos estudados dentro do horário do bloco (qualquer sessão). */
export function segundosNoBloco(b: Pick<BlocoPlanejado, 'dia' | 'inicio' | 'fim'>, sessoes: Sessao[], agora: Date | number): number {
  const ini = instanteSP(b.dia, b.inicio).getTime();
  const fim = instanteSP(b.dia, b.fim).getTime();
  let ms = 0;
  for (const s of sessoes) {
    for (const [a, z] of intervalosAtivos(s, agora)) ms += Math.max(0, Math.min(z, fim) - Math.max(a, ini));
  }
  return Math.floor(ms / 1000);
}

/** Sugestão de status pelo que foi cronometrado no horário: ≥ 75% feito, ≥ 25% parcial. */
export function statusSugerido(b: Pick<BlocoPlanejado, 'dia' | 'inicio' | 'fim'>, segundos: number): 'feito' | 'parcial' | null {
  const duracao = minutos(b) * 60;
  if (!duracao || !segundos) return null;
  if (segundos >= duracao * 0.75) return 'feito';
  if (segundos >= duracao * 0.25) return 'parcial';
  return null;
}
