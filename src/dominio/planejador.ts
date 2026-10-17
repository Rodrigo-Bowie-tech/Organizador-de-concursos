// Planejador adaptativo (seções 5.1, 5.2 e 5.4 da SPEC). Função pura: recebe o
// estado do estudo e a disponibilidade e devolve os blocos planejados de agora
// até o horizonte. Replanejar é chamar de novo: o que já foi estudado muda o
// status e o domínio dos tópicos, e a fila se reorganiza sozinha.

import { intervalosAtivos, segundosLiquidos } from './cronometro';
import { diaDaSemana, diaSP, diasEntre, formatarHora, inicioDaSemana, instanteSP, somarDias } from './datas';
import { topicoConcluido, topicosFolha } from './painel';
import { restanteDeTeoria } from './teoria';
import { achatar } from './topicos';
import type { BlocoHorario, BlocoPlanejado, Concurso, DiaISO, Disciplina, Disponibilidade, GestaoSemanal, Id, Sessao, Simulado, Topico } from './tipos';

export const DISPONIBILIDADE_VAZIA: Disponibilidade = { dias: {}, excecoes: {}, blocoMin: 60 };
/** Horizonte quando falta a data de alguma prova. */
export const HORIZONTE_DIAS = 28;
/** Com todas as datas de prova, o plano vai até a última, limitado a este número de dias. */
export const HORIZONTE_MAXIMO_DIAS = 120;
const MINIMO_BLOCO_MIN = 25;
/** Tempo de uma revisão de tópico: um bloco de 60 min junta até 3 revisões. */
export const MINUTOS_POR_REVISAO = 20;
/** A cota de revisão e questões vale para os últimos N blocos (não para o plano inteiro). */
const JANELA_COTA = 10;
/** No plano pela relevância, parte dos horários de um assunto com teoria pela frente que vai para questões. */
const FRACAO_COM_TEORIA = 0.2;

// ------------------------------------------------------------ horários

const paraMin = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const paraHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function minutos(b: Pick<BlocoHorario, 'inicio' | 'fim'>): number {
  return Math.max(0, paraMin(b.fim) - paraMin(b.inicio));
}

/** O horário de cuidar dos concursos neste dia, se a gestão semanal cair nele. */
export function horarioDaGestao(g: GestaoSemanal | null | undefined, dia: DiaISO): BlocoHorario | null {
  if (!g || !(g.minutos > 0) || String(diaDaSemana(dia)) !== g.dia) return null;
  return { inicio: g.inicio, fim: paraHora(Math.min(24 * 60 - 1, paraMin(g.inicio) + g.minutos)) };
}

const sobrepoe = (a: Pick<BlocoHorario, 'inicio' | 'fim'>, b: Pick<BlocoHorario, 'inicio' | 'fim'>) => a.inicio < b.fim && b.inicio < a.fim;

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

/**
 * Blocos de teoria a planejar: o que falta da estimativa pelos blocos já feitos (dominio/teoria.ts).
 * Se os previstos acabaram e a teoria não foi confirmada, guarda 1 bloco até a resposta.
 */
export function blocosDeTeoria(t: Pick<Topico, 'blocosTeoria'>, feitos = 0): number {
  return Math.max(1, restanteDeTeoria(t, feitos));
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
/** Abaixo desse acerto no último simulado em que caiu, o assunto é para estudar logo. */
export const URGENTE_ABAIXO = 0.5;

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
  /** Blocos de teoria já feitos por tópico: entra só o que falta. */
  feitos: Map<Id, number> = new Map(),
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
          blocos: blocosDeTeoria(t, feitos.get(t.id) ?? 0),
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
  /** Blocos de teoria já feitos por tópico (dominio/teoria.ts): o plano só põe o que falta. */
  feitos?: Map<Id, number>;
  /**
   * Relevância de cada tópico na prova (dominio/diagnostico.ts, `relevanciaPorTopico`: questões ×
   * peso da disciplina, dividido entre os tópicos). Com ela, o tempo de cada assunto no plano segue
   * a incidência (ver "Plano pela relevância" abaixo). Sem ela, a fila por prioridade e a cota de
   * revisão e questões de sempre.
   */
  relevancia?: Map<Id, number>;
  /** Minutos estudados em cada disciplina nos últimos 14 dias: o plano continua de onde parou. */
  usoRecente?: Map<Id, number>;
  /** Últimas questões de cada tópico (instante ISO): o rodízio das questões continua de onde parou. */
  ultimaQuestao?: Map<Id, string>;
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
  const fila = filaDeTeoria(e.concursos, e.disciplinas, acertos, hoje, simulados, e.feitos);
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
  /** Blocos semanais de gestão dos concursos (não são estudo: ficam fora da cota e do rodízio). */
  const gestao: BlocoPlanejado[] = [];
  const ocupado = (dia: DiaISO, s: BlocoHorario) => ficam.some((b) => b.dia === dia && sobrepoe(b, s)) || gestao.some((b) => b.dia === dia && sobrepoe(b, s));

  const plano: BlocoPlanejado[] = [];
  const restantes = fila.map((i) => ({ ...i }));
  // O que os blocos fixos já cobrem não entra de novo.
  for (const b of [...fixosFuturos].sort((x, y) => `${x.dia}${x.inicio}`.localeCompare(`${y.dia}${y.inicio}`))) {
    if (b.motivo === 'teoria') {
      const i = restantes.findIndex((x) => x.topico.id === b.topicoId);
      if (i >= 0 && --restantes[i].blocos <= 0) {
        // A teoria acaba neste bloco fixo: as revisões de D+1 e D+7 e as questões vêm depois dele.
        const [item] = restantes.splice(i, 1);
        for (const k of [1, 7]) {
          revisoes.push({ disciplina: item.disciplina, topico: item.topico, concursoId: item.concursoIds[0], devida: somarDias(b.dia, k), atrasada: false });
        }
        paraQuestoes.push({ d: item.disciplina, t: item.topico, aPartirDe: somarDias(b.dia, 7) });
      }
    } else {
      for (const id of [b.topicoId, ...(b.revisoes ?? [])]) {
        const r = revisoes.findIndex((x) => x.topico.id === id);
        if (r >= 0) revisoes.splice(r, 1);
      }
    }
  }
  let questoesIdx = 0;
  const ultimaQuestao = new Map(e.ultimaQuestao ?? []);
  /** Relevância de um tópico (mínimo simbólico, para nenhum sumir do rodízio). */
  const relevancia = (t: Topico) => Math.max(0.001, e.relevancia?.get(t.id) ?? 0);
  /**
   * Próximo tópico para questões, só de concursos cuja prova ainda não passou. Com a relevância,
   * vai o tópico pronto de maior relevância × tempo desde as últimas questões dele: os que mais caem
   * voltam mais vezes, e depois de replanejar o rodízio continua de onde parou. Nunca praticado vem
   * antes, na ordem da fila (pior acerto e simulado mais fraco primeiro). Sem ela, rodízio igual.
   */
  const prontoEm = (q: (typeof paraQuestoes)[number], dia: DiaISO) => q.aPartirDe <= dia && valeEm([q.d.concursoId], dia);
  const proximaQuestao = (dia: DiaISO, quando: number, disciplinaId?: Id) => {
    const pronto = (q: (typeof paraQuestoes)[number]) => prontoEm(q, dia) && (!disciplinaId || q.d.id === disciplinaId);
    if (!e.relevancia) {
      for (let k = 0; k < paraQuestoes.length; k++) {
        const q = paraQuestoes[questoesIdx++ % paraQuestoes.length];
        if (pronto(q)) return q;
      }
      return null;
    }
    let escolhido: (typeof paraQuestoes)[number] | null = null;
    let melhor = -1;
    for (const q of paraQuestoes) {
      if (!pronto(q)) continue;
      const ultima = ultimaQuestao.get(q.t.id);
      const nota = ultima ? Math.max(0, quando - Date.parse(ultima)) * relevancia(q.t) : Infinity;
      if (nota > melhor) [escolhido, melhor] = [q, nota];
    }
    if (escolhido) ultimaQuestao.set(escolhido.t.id, new Date(quando).toISOString());
    return escolhido;
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

  /** Um bloco de teoria do item; quando a teoria dele acaba, já vêm as revisões de D+1 e D+7 e, a partir de D+7, questões. */
  const blocoDeTeoria = (dia: DiaISO, s: BlocoHorario, item: (typeof restantes)[number]): BlocoPlanejado => {
    const b = bloco(dia, s, item.disciplina, item.topico, item.concursoIds[0], 'teoria');
    item.blocos--;
    if (item.blocos <= 0) {
      restantes.splice(restantes.indexOf(item), 1);
      for (const k of [1, 7]) {
        revisoes.push({ disciplina: item.disciplina, topico: item.topico, concursoId: item.concursoIds[0], devida: somarDias(dia, k), atrasada: false });
      }
      paraQuestoes.push({ d: item.disciplina, t: item.topico, aPartirDe: somarDias(dia, 7) });
    }
    return b;
  };

  // Plano pela relevância: o tempo de cada assunto segue a incidência na prova. Cada horário vai para
  // o assunto com menos estudo em relação ao seu peso: os minutos dos últimos 14 dias mais o que o
  // plano já pôs (revisões e blocos fixos contam, divididos entre os assuntos do bloco) ÷ peso. Assim
  // os que mais caem ficam com mais horas, e depois de replanejar o plano continua de onde parou.
  // Empate (sem estudo recente): primeiro o que foi mal no último simulado (estudar logo), depois o
  // que mais cai, depois a ordem da prioridade; assim um assunto só de questões (RL, por exemplo) não
  // fica para o fim da fila. Até 2 blocos seguidos do mesmo assunto quando há outro (mais, só para
  // quem merece mais de 2/3 do tempo).
  // Peso = relevância dos tópicos que ainda recebem estudo (teoria pela frente ou questões; dominados
  // e cortados não) × peso do concurso × atraso da teoria (piso de cobertura, abaixo). Dentro do
  // assunto, teoria primeiro, com 20% de questões dos tópicos já vistos; terminada a teoria, questões.
  // Todos os assuntos entram ao mesmo tempo (o rodízio entre N, `intercalar`, fica para o caminho sem relevância).
  const pesoDoAssunto = new Map<Id, number>();
  if (e.relevancia) {
    const recebem = new Set<Id>([...restantes.map((i) => i.topico.id), ...paraQuestoes.map((q) => q.t.id)]);
    for (const d of e.disciplinas) {
      const p = Object.values(d.topicos).reduce((t, x) => t + (recebem.has(x.id) ? relevancia(x) : 0), 0);
      if (p > 0) pesoDoAssunto.set(d.id, p);
    }
  }
  const uso = new Map(e.usoRecente ?? []);
  const disciplinaDoTopico = new Map<Id, Id>();
  for (const d of e.disciplinas) for (const id of Object.keys(d.topicos)) disciplinaDoTopico.set(id, d.id);
  /** Soma o bloco ao estudo do assunto (revisão com vários tópicos é dividida entre eles). */
  const contarUso = (b: BlocoPlanejado) => {
    const m = minutos(b);
    const topicos = b.revisoes?.length ? b.revisoes : b.topicoId ? [b.topicoId] : [];
    const somar = (id: Id | null | undefined, x: number) => {
      if (id) uso.set(id, (uso.get(id) ?? 0) + x);
    };
    if (topicos.length) for (const t of topicos) somar(disciplinaDoTopico.get(t), m / topicos.length);
    else somar(b.disciplinaId, m);
  };
  // Entre concursos, vale o peso de cada um (prioridade e proximidade da prova), como na fila de teoria.
  const concursoDe = new Map(e.disciplinas.map((d) => [d.id, d.concursoId]));
  const prioridadeDe = new Map(concursosAtivos.map((c) => [c.id, Math.max(1, c.prioridade) / 5]));
  const pesoDoConcurso = (id: Id, dia: DiaISO) => {
    const c = concursoDe.get(id) ?? '';
    const prova = dataProva.get(c);
    return (prioridadeDe.get(c) ?? 0.2) * (1 + proximidade(prova ? diasEntre(dia, prova) : null));
  };
  // Os blocos fixos que ficam (semana de foco, movidos) contam desde já como estudo do assunto: o
  // assunto que já tem horário reservado não passa na frente dos outros.
  if (e.relevancia) for (const b of fixosFuturos) if (b.motivo !== 'simulado' && b.motivo !== 'gestao') contarUso(b);
  const feitosNoPlano = new Map<Id, { teoria: number; questoes: number }>();
  const somaDosPesos = [...pesoDoAssunto.values()].reduce((a, b) => a + b, 0) || 1;
  // Piso de cobertura: horários de estudo que restam até uma semana antes da prova de cada
  // concurso. Um assunto que, no ritmo da incidência, não terminaria a teoria até lá ganha
  // frequência na medida do que falta, para nenhum tópico ficar sem ser visto.
  const horariosAte = new Map<DiaISO, number>();
  if (e.relevancia) {
    let soma = 0;
    // Até o prazo da teoria (uma semana antes da última prova), mesmo que o plano pare antes.
    const ultimaProva = [...dataProva.values()].filter((d): d is DiaISO => Boolean(d)).sort().pop();
    const ate = Math.min(400, Math.max(horizonte, ultimaProva ? diasEntre(hoje, ultimaProva) + 1 : 0));
    const dias = Array.from({ length: ate }, (_, n) => somarDias(hoje, n));
    const porDia = dias.map((dia) => {
      const livres = slotsDoDia(e.disponibilidade, dia).filter((x) => instanteSP(dia, x.inicio).getTime() >= agoraMs && !ficam.some((b) => b.dia === dia && sobrepoe(b, x)));
      const cap = e.capacidadeMin?.[String(diaDaSemana(dia))];
      return cap === undefined ? livres.length : Math.min(livres.length, Math.ceil(cap / Math.max(1, e.disponibilidade.blocoMin || 60)));
    });
    for (let i = dias.length - 1; i >= 0; i--) horariosAte.set(dias[i], (soma += porDia[i]));
  }
  /** Horários que restam de `dia` até `limite` (inclusive). */
  const horariosEntre = (dia: DiaISO, limite: DiaISO) => (dia > limite ? 0 : (horariosAte.get(dia) ?? 0) - (horariosAte.get(somarDias(limite, 1)) ?? 0));
  /** Parte dos horários que o assunto precisa a mais para terminar a teoria (1 = o ritmo da incidência basta). */
  const atrasoDaTeoria = (id: Id, dia: DiaISO): number => {
    const blocos = restantes.filter((i) => i.disciplina.id === id).reduce((t, i) => t + i.blocos, 0);
    const prova = dataProva.get(e.disciplinas.find((d) => d.id === id)?.concursoId ?? '');
    if (!blocos || !prova) return 1;
    // Revisões levam cerca de 15% dos horários; com teoria pela frente, 80% dos do assunto são de teoria.
    const ritmo = 0.85 * (1 - FRACAO_COM_TEORIA) * ((pesoDoAssunto.get(id) ?? 0) / somaDosPesos) * horariosEntre(dia, somarDias(prova, -7));
    return Math.max(1, blocos / Math.max(0.5, ritmo));
  };

  const porRelevancia = (dia: DiaISO, s: BlocoHorario, quando: number, validos: typeof restantes, fracao: number): BlocoPlanejado | null => {
    // Candidatos: todos os assuntos com teoria pela frente (na ordem da prioridade) e os que têm questões
    // prontas. O rodízio entre N assuntos não vale aqui: limitar deixaria os que menos caem sem nenhum tempo.
    const comTeoria: Id[] = [];
    for (const i of validos) if (!comTeoria.includes(i.disciplina.id)) comTeoria.push(i.disciplina.id);
    const candidatos = [...comTeoria];
    for (const q of paraQuestoes) if (prontoEm(q, dia) && !candidatos.includes(q.d.id)) candidatos.push(q.d.id);
    const peso = new Map(candidatos.map((id) => [id, (pesoDoAssunto.get(id) ?? 0.001) * pesoDoConcurso(id, dia) * atrasoDaTeoria(id, dia)]));
    const somaPeso = [...peso.values()].reduce((a, b) => a + b, 0);
    // Blocos seguidos do mesmo assunto: até 2, ou mais para quem merece mais de 2/3 do tempo
    // (80% → 4 seguidos), para não virar uma fila do mesmo assunto quando ele está atrasado.
    const seguidos = (id: Id) => {
      let n = 0;
      for (let i = plano.length - 1; i >= 0 && plano[i].disciplinaId === id; i--) n++;
      return n;
    };
    const limite = (id: Id) => {
      const parte = (peso.get(id) as number) / somaPeso;
      return Math.max(2, Math.ceil(parte / Math.max(0.01, 1 - parte)));
    };
    const livres = candidatos.filter((id) => seguidos(id) < limite(id));
    // Desempate: estudar logo (foi mal no último simulado), depois o que mais cai; igual nos dois, a prioridade.
    const urgente = (id: Id) => (ajustes.get(id)?.taxa ?? 1) < URGENTE_ABAIXO;
    const vemAntes = (a: Id, b: Id) => urgente(a) !== urgente(b) ? urgente(a) : (peso.get(a) as number) > (peso.get(b) as number) * (1 + 1e-9);
    let alvo: Id | null = null;
    let menor = Infinity;
    for (const id of livres.length ? livres : candidatos) {
      const nota = (uso.get(id) ?? 0) / (peso.get(id) as number);
      const empate = alvo !== null && Math.abs(nota - menor) <= 1e-9 * Math.max(1, menor);
      if (alvo === null || (!empate && nota < menor) || (empate && vemAntes(id, alvo))) [alvo, menor] = [id, nota];
    }
    if (!alvo) return null;
    const c = feitosNoPlano.get(alvo) ?? { teoria: 0, questoes: 0 };
    const item = comTeoria.includes(alvo) ? validos.find((i) => i.disciplina.id === alvo) : undefined;
    const temQuestoes = paraQuestoes.some((q) => q.d.id === alvo && prontoEm(q, dia));
    let b: BlocoPlanejado | null = null;
    // Com teoria pela frente, as questões do assunto ficam em 20% dos horários dele (o resto vai para
    // terminar a teoria, para nenhum tópico ficar sem ser visto); sem teoria, tudo vai para questões.
    if (temQuestoes && (!item || c.questoes + 1 <= Math.min(fracao, FRACAO_COM_TEORIA) * (c.teoria + c.questoes + 1))) {
      const q = proximaQuestao(dia, quando, alvo);
      if (q) {
        b = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
        c.questoes++;
      }
    }
    if (!b && item) {
      b = blocoDeTeoria(dia, s, item);
      c.teoria++;
    }
    if (b) feitosNoPlano.set(alvo, c);
    return b;
  };

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
    // Um horário por semana para cuidar dos concursos; o estudo não cai nele.
    const hg = horarioDaGestao(e.disponibilidade.gestao, dia);
    if (hg && instanteSP(dia, hg.inicio).getTime() >= agoraMs) {
      const semana = inicioDaSemana(dia);
      if (!ficam.some((b) => b.motivo === 'gestao' && inicioDaSemana(b.dia) === semana)) {
        gestao.push({ id: e.novoId(), dia, ...hg, concursoId: null, disciplinaId: null, topicoId: null, tipo: 'gestao', status: 'planejado', motivo: 'gestao' });
      }
    }
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
      const quando = instanteSP(dia, s.inicio).getTime();
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
      if (atrasadas.length || ((querRevisao || e.relevancia) && devidas.length && juntou)) {
        // Pela relevância, a revisão espaçada não espera a cota: sai quando o bloco enche ou alguma espera 2 dias.
        escolhido = blocoDeRevisao(dia, s, devidas);
      } else if (e.relevancia) {
        escolhido = porRelevancia(dia, s, quando, validos, fracao) ?? (devidas.length ? blocoDeRevisao(dia, s, devidas) : null);
      } else if (querRevisao && paraQuestoes.length && (q = proximaQuestao(dia, quando))) {
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
        escolhido = blocoDeTeoria(dia, s, item);
      } else if (devidas.length) {
        // Sem teoria pela frente: as revisões vencidas não esperam a cota.
        escolhido = blocoDeRevisao(dia, s, devidas);
      } else if (paraQuestoes.length && (q = proximaQuestao(dia, quando))) {
        escolhido = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
      }
      if (!escolhido) continue;
      plano.push(escolhido);
      if (e.relevancia) contarUso(escolhido);
    }
  }
  return [...plano, ...gestao];
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

/** Bloco de estudo (o simulado e a gestão dos concursos não são). */
export const blocoDeEstudo = (b: Pick<BlocoPlanejado, 'motivo'>) => b.motivo !== 'simulado' && b.motivo !== 'gestao';

/**
 * Primeiro horário livre do dia para `duracao` minutos, a partir de `inicio` (e nunca antes de
 * `minimo`, em minutos do dia): se o horário já tem outro bloco, logo depois dele, e assim por diante;
 * sem lugar até a meia-noite, o mais tarde que couber antes. `null` = o dia não tem lugar.
 */
export function horarioLivre(ocupados: Pick<BlocoHorario, 'inicio' | 'fim'>[], inicio: string, duracao: number, minimo = 0): string | null {
  const faixas = ocupados.map((b) => [paraMin(b.inicio), paraMin(b.fim)] as const);
  const cabe = (x: number) => x >= minimo && x + duracao <= 24 * 60 && !faixas.some(([a, z]) => x < z && a < x + duracao);
  const desejado = Math.max(minimo, paraMin(inicio));
  const depois = [desejado, ...faixas.map(([, z]) => z).filter((z) => z > desejado).sort((x, y) => x - y)];
  const antes = faixas.map(([a]) => a - duracao).filter((x) => x < desejado).sort((x, y) => y - x);
  const x = [...depois, ...antes].find(cabe);
  return x === undefined ? null : paraHora(x);
}

/**
 * Blocos de estudo ainda planejados do assunto da sessão (pela disciplina, ou pelos tópicos de uma
 * revisão) no dia em que ela começou.
 */
export function blocosDoAssuntoDaSessao(s: Sessao, blocos: BlocoPlanejado[], disciplinas: Disciplina[]): BlocoPlanejado[] {
  const disciplinaDoTopico = new Map<Id, Id>();
  for (const d of disciplinas) for (const id of Object.keys(d.topicos)) disciplinaDoTopico.set(id, d.id);
  const disciplinaId = s.disciplinaId ?? (s.topicoId ? disciplinaDoTopico.get(s.topicoId) : undefined);
  if (!disciplinaId) return [];
  const dia = diaSP(s.inicio);
  return blocos.filter(
    (b) =>
      b.dia === dia &&
      b.status === 'planejado' &&
      blocoDeEstudo(b) &&
      (b.disciplinaId === disciplinaId || (b.revisoes ?? []).some((t) => disciplinaDoTopico.get(t) === disciplinaId)),
  );
}

/**
 * Blocos que uma sessão terminada risca: os planejados do mesmo assunto no dia em que ela começou (os
 * que caem no horário dela primeiro, depois os do mesmo tópico, os do mesmo tipo e os mais perto). O tempo da sessão
 * cobre um bloco por vez, como em `statusSugerido` (≥ 75% feito, ≥ 25% parcial). O bloco que estava em
 * outro horário passa para o horário da sessão (cada bloco fica no horário em que foi feito), sem cair
 * sobre um bloco que já foi marcado; os planejados que ficarem por baixo saem no replanejamento.
 * Devolve os blocos mudados.
 */
export function blocosDaSessao(s: Sessao, blocos: BlocoPlanejado[], disciplinas: Disciplina[], agora: Date | number): BlocoPlanejado[] {
  const dia = diaSP(s.inicio);
  const ini = Date.parse(s.inicio);
  const fim = s.fim ? Date.parse(s.fim) : Number(agora);
  const naSessao = (b: BlocoPlanejado) => Math.max(0, Math.min(fim, instanteSP(b.dia, b.fim).getTime()) - Math.max(ini, instanteSP(b.dia, b.inicio).getTime()));
  const doTopico = (b: BlocoPlanejado) => Boolean(s.topicoId) && (b.topicoId === s.topicoId || (b.revisoes ?? []).includes(s.topicoId as Id));
  const candidatos = blocosDoAssuntoDaSessao(s, blocos, disciplinas).sort(
      (a, b) =>
        naSessao(b) - naSessao(a) ||
        Number(doTopico(b)) - Number(doTopico(a)) ||
        Number(b.tipo === s.tipo) - Number(a.tipo === s.tipo) ||
        Math.abs(instanteSP(a.dia, a.inicio).getTime() - ini) - Math.abs(instanteSP(b.dia, b.inicio).getTime() - ini),
    );
  const marcados = blocos.filter((b) => b.dia === dia && b.status !== 'planejado');
  const mudados: BlocoPlanejado[] = [];
  let resta = segundosLiquidos(s, agora);
  let cursor = formatarHora(s.inicio);
  for (const b of candidatos) {
    const status = statusSugerido(b, resta);
    if (!status) break;
    resta -= minutos(b) * 60;
    let novo: BlocoPlanejado = { ...b, status };
    if (!naSessao(b)) {
      const inicio = horarioLivre([...marcados, ...mudados], cursor, minutos(b));
      if (inicio) {
        novo = { ...novo, inicio, fim: paraHora(paraMin(inicio) + minutos(b)) };
        cursor = novo.fim;
      }
    }
    mudados.push(novo);
  }
  return mudados;
}

/** Sugestão de status pelo que foi cronometrado no horário: ≥ 75% feito, ≥ 25% parcial. */
export function statusSugerido(b: Pick<BlocoPlanejado, 'dia' | 'inicio' | 'fim'>, segundos: number): 'feito' | 'parcial' | null {
  const duracao = minutos(b) * 60;
  if (!duracao || !segundos) return null;
  if (segundos >= duracao * 0.75) return 'feito';
  if (segundos >= duracao * 0.25) return 'parcial';
  return null;
}
