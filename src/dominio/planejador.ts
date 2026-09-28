// Planejador adaptativo (seções 5.1, 5.2 e 5.4 da SPEC). Função pura: recebe o
// estado do estudo e a disponibilidade e devolve os blocos planejados de agora
// até o horizonte. Replanejar é chamar de novo: o que já foi estudado muda o
// status e o domínio dos tópicos, e a fila se reorganiza sozinha.

import { intervalosAtivos } from './cronometro';
import { diaDaSemana, diaSP, diasEntre, instanteSP, somarDias } from './datas';
import { topicoConcluido, topicosFolha } from './painel';
import type { BlocoHorario, BlocoPlanejado, Concurso, DiaISO, Disciplina, Disponibilidade, Id, Sessao, Topico } from './tipos';

export const DISPONIBILIDADE_VAZIA: Disponibilidade = { dias: {}, excecoes: {}, blocoMin: 60 };
export const HORIZONTE_DIAS = 28;
/** Blocos de teoria estimados por tópico: não iniciado 2, em estudo 1. */
const BLOCOS_TEORIA = { nao_iniciado: 2, em_estudo: 1 } as const;
const MINIMO_BLOCO_MIN = 25;

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
 * Tópicos vinculados entre concursos aparecem uma vez só, somando as prioridades.
 */
export function filaDeTeoria(
  concursos: Concurso[],
  disciplinas: Disciplina[],
  acertos: Map<Id, AcertoRecente>,
  hoje: DiaISO,
): ItemFila[] {
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
      const folhas = topicosFolha(d.topicos);
      const maxInc = Math.max(0, ...folhas.map((t) => t.incidencia ?? 0));
      for (const t of folhas) {
        if (topicoConcluido(t) || t.cortado) continue;
        const pesoDisc = maxValor ? valor(d) / maxValor : 1;
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
          blocos: BLOCOS_TEORIA[t.status as 'nao_iniciado' | 'em_estudo'] ?? 1,
        });
      }
    }
  }
  return [...porGrupo.values()].sort((a, b) => b.prioridade - a.prioridade || a.topico.titulo.localeCompare(b.topico.titulo));
}

/** Fração dos blocos para revisão e questões: 20% longe da prova, 60% nas últimas 3 semanas. */
export function fracaoRevisao(diasAteProva: number | null): number {
  if (diasAteProva === null || diasAteProva > 42) return 0.2;
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
  const horizonte = e.horizonteDias ?? HORIZONTE_DIAS;
  const acertos = e.acertos ?? new Map();
  const fila = filaDeTeoria(e.concursos, e.disciplinas, acertos, hoje);
  const concursosAtivos = e.concursos.filter((c) => c.status !== 'prova_feita' && (!c.dataProva || c.dataProva >= hoje));
  const ativos = new Set(concursosAtivos.map((c) => c.id));
  const dataProva = new Map(concursosAtivos.map((c) => [c.id, c.dataProva]));
  const provas = concursosAtivos.map((c) => c.dataProva).filter((d): d is DiaISO => Boolean(d)).sort();
  const todosComData = concursosAtivos.length > 0 && provas.length === concursosAtivos.length;
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
  // Tópicos concluídos, candidatos a blocos de questões (pior acerto primeiro).
  const paraQuestoes = e.disciplinas
    .filter((d) => ativos.has(d.concursoId))
    .flatMap((d) => topicosFolha(d.topicos).filter((t) => topicoConcluido(t) && !t.cortado).map((t) => ({ d, t })))
    .sort((a, b) => (acertos.get(a.t.id)?.taxa ?? 0.5) - (acertos.get(b.t.id)?.taxa ?? 0.5));

  // Horários ocupados por blocos que ficam.
  const agoraMs = e.agora.getTime();
  const ficam = e.existentes.filter((b) => b.status !== 'planejado' || instanteSP(b.dia, b.inicio).getTime() < agoraMs);
  const ocupado = (dia: DiaISO, s: BlocoHorario) =>
    ficam.some((b) => b.dia === dia && b.inicio < s.fim && s.inicio < b.fim);

  const plano: BlocoPlanejado[] = [];
  const restantes = fila.map((i) => ({ ...i }));
  let blocosRevisao = 0;
  let blocosTotal = 0;
  let questoesIdx = 0;

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
      const devidas = revisoes.filter((r) => r.devida <= dia).sort((a, b) => a.devida.localeCompare(b.devida));
      const atrasadas = devidas.filter((r) => r.atrasada);
      let escolhido: BlocoPlanejado | null = null;
      const querRevisao = blocosTotal === 0 ? fracao > 0 && devidas.length > 0 : blocosRevisao / blocosTotal < fracao;
      const validos = restantes.filter((i) => valeEm(i.concursoIds, dia));
      if (atrasadas.length || (querRevisao && devidas.length)) {
        const r = (atrasadas[0] ?? devidas[0]) as ItemRevisao;
        revisoes.splice(revisoes.indexOf(r), 1);
        escolhido = bloco(dia, s, r.disciplina, r.topico, r.concursoId, r.atrasada ? 'revisao_atrasada' : 'revisao');
      } else if (querRevisao && paraQuestoes.length) {
        // 2. Parte do tempo vai para questões dos tópicos já vistos (pior acerto primeiro).
        const q = paraQuestoes[questoesIdx++ % paraQuestoes.length];
        escolhido = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
      } else if (validos.length) {
        // 3. Teoria: maior prioridade, sem passar de 2 blocos seguidos da mesma disciplina.
        const [u1, u2] = [plano[plano.length - 1], plano[plano.length - 2]];
        const bloqueada = u1 && u2 && u1.disciplinaId === u2.disciplinaId ? u1.disciplinaId : null;
        const item = validos.find((i) => i.disciplina.id !== bloqueada) ?? validos[0];
        const idx = restantes.indexOf(item);
        escolhido = bloco(dia, s, item.disciplina, item.topico, item.concursoIds[0], 'teoria');
        item.blocos--;
        if (item.blocos <= 0) {
          restantes.splice(idx, 1);
          // Teoria planejada até aqui gera as revisões de D+1 e D+7 no plano.
          for (const k of [1, 7]) {
            revisoes.push({ disciplina: item.disciplina, topico: item.topico, concursoId: item.concursoIds[0], devida: somarDias(dia, k), atrasada: false });
          }
        }
      } else if (devidas.length) {
        // Sem teoria pela frente: as revisões vencidas não esperam a cota.
        const r = devidas[0];
        revisoes.splice(revisoes.indexOf(r), 1);
        escolhido = bloco(dia, s, r.disciplina, r.topico, r.concursoId, 'revisao');
      } else if (paraQuestoes.length) {
        const q = paraQuestoes[questoesIdx++ % paraQuestoes.length];
        escolhido = bloco(dia, s, q.d, q.t, q.d.concursoId, 'questoes');
      }
      if (!escolhido) continue;
      plano.push(escolhido);
      blocosTotal++;
      if (escolhido.motivo !== 'teoria') blocosRevisao++;
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
