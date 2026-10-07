// Repositório: mantém o espelho do banco (via assinaturas) e faz todas as
// gravações. As telas leem `Dados` e chamam os métodos daqui.
//
// Caminhos no banco:
//   concursos/<id>            Concurso
//   disciplinas/<id>          Disciplina (com os tópicos dentro)
//   sessoes/<AAAA-MM-DD>      { semana, itens: { <id>: Sessao } }, semana começando no domingo
//   estado/cronometro         { sessao: Sessao | null }, a sessão em andamento
//   config/geral              Configuracao
//   revisoes/<AAAA-MM-DD>     { semana, itens: { <id>: RegistroRevisao } }, histórico de revisões
//   biblioteca/<disciplinaId> { disciplinaId, itens: { <id>: Material } }
//   editais/<id>              Edital importado (PDF no armazenamento de arquivos)
//   disponibilidade/geral     Disponibilidade (grade semanal, exceções, duração do bloco)
//   plano/<AAAA-MM-DD>        { semana, itens: { <id>: BlocoPlanejado } }, blocos do calendário
//   estado/planejamento       { ultimoReplanejamento: AAAA-MM-DD }, replanejamento do dia
//   questoes/<AAAA-MM-DD>     { semana, itens: { <id>: RegistroQuestoes } }, questões avulsas
//   erros/<disciplinaId>      { disciplinaId, itens: { <id>: ErroCaderno } }, caderno de erros
//   simulados/<id>            Simulado
//   oportunidades/<UF>        { uf, itens: { <id>: Oportunidade } }, radar de concursos
//   estado/radar              { vistoAte }: até quando as oportunidades já foram vistas
//   estado/backup             { ultimoEm }: quando o último backup foi exportado
//   estado/vinculos           { ignorados: string[] }, sugestões de equivalência recusadas
//   radar_filtros/<id>        FiltroRadar (Fase 6; já vem no seed)
//   provas/<id>               ProvaAnterior (questões dentro, PDF no armazenamento de arquivos)

import * as crono from '../dominio/cronometro';
import { diaSP, inicioDaSemana, instanteSP } from '../dominio/datas';
import { mesclarOportunidades } from '../radar/radar';
import type { ItensPorUf } from '../radar/radar';
import { chavePar, topicosDaImportacao } from '../dominio/edital';
import { capacidadeParaPlano, capacidadeReal } from '../dominio/adaptacao';
import { revisarErro } from '../dominio/desempenho';
import { acertoRecente, DISPONIBILIDADE_VAZIA, gerarPlano, minutos } from '../dominio/planejador';
import type { DisciplinaImportada } from '../dominio/edital';
import { lerLote, topicosDoLote } from '../dominio/lote';
import { comIncidenciaDasProvas } from '../dominio/provas';
import type { QuestaoImportada } from '../dominio/provas';
import { topicoConcluido } from '../dominio/painel';
import * as rev from '../dominio/revisoes';
import { CORES_DISCIPLINA } from '../dominio/rotulos';
import { comDescendentes, mover, proximaOrdem } from '../dominio/topicos';
import type {
  AvaliacaoRevisao,
  BlocoPlanejado,
  Concurso,
  Configuracao,
  Disciplina,
  Disponibilidade,
  Edital,
  ErroCaderno,
  EstadoRevisao,
  FiltroRadar,
  Id,
  Material,
  Oportunidade,
  ProvaAnterior,
  RegistroQuestoes,
  RegistroRevisao,
  Sessao,
  Simulado,
  StatusTopico,
  TipoSessao,
  Topico,
} from '../dominio/tipos';
import type { ErroStore, Json, Store } from './store';

export const COLECOES = [
  'concursos',
  'disciplinas',
  'sessoes',
  'estado',
  'config',
  'revisoes',
  'biblioteca',
  'editais',
  'disponibilidade',
  'plano',
  'questoes',
  'erros',
  'simulados',
  'oportunidades',
  'radar_filtros',
  'provas',
] as const;
type Colecao = (typeof COLECOES)[number];
type ColecaoSemanal = 'sessoes' | 'revisoes' | 'plano' | 'questoes';

/** Armazenamento de arquivos (PDFs da biblioteca). No claude.ai, o recurso `assets`. */
export interface Arquivos {
  enviar(arquivo: File): Promise<{ id: string; url: string }>;
  remover(id: string): Promise<void>;
}

export const CONFIG_PADRAO: Configuracao = {
  metaDiariaMin: 180,
  metaSemanalMin: 1260,
  metaMensalMin: 5400,
  pomodoro: { ativo: false, focoMin: 25, pausaCurtaMin: 5, pausaLongaMin: 15, ciclosAtePausaLonga: 4 },
  tema: 'sistema',
  usarCapacidadeReal: true,
  intercalarAssuntos: 0,
};

export interface Dados {
  carregado: boolean;
  modo: Store['modo'];
  concursos: Concurso[];
  disciplinas: Disciplina[];
  /** Sessões finalizadas, da mais recente para a mais antiga. */
  sessoes: Sessao[];
  /** Sessão em andamento (rodando ou pausada). */
  ativa: Sessao | null;
  /** Revisões feitas, da mais recente para a mais antiga. */
  revisoesFeitas: RegistroRevisao[];
  materiais: Material[];
  editais: Edital[];
  /** Pares de tópicos (`chavePar`) cuja sugestão de equivalência foi recusada. */
  vinculosIgnorados: Set<string>;
  disponibilidade: Disponibilidade;
  /** Blocos do calendário, em ordem de dia e horário. */
  blocos: BlocoPlanejado[];
  /** Questões lançadas fora das sessões, da mais recente para a mais antiga. */
  registrosQuestoes: RegistroQuestoes[];
  erros: ErroCaderno[];
  simulados: Simulado[];
  oportunidades: Oportunidade[];
  filtrosRadar: FiltroRadar[];
  /** Oportunidades coletadas depois deste instante são "novas". */
  radarVistoAte: string | null;
  /** Fase 7: provas anteriores importadas, mais novas primeiro. */
  provas: ProvaAnterior[];
  /** Instante do último backup exportado (lembrete na Home). */
  ultimoBackup: string | null;
  config: Configuracao;
  erro: ErroStore | null;
}

export interface Backup {
  app: 'organizador-de-concursos';
  versao: 1;
  exportadoEm: string;
  documentos: Record<string, Json>;
}

export interface DetalhesSessao {
  concursoId: Id | null;
  disciplinaId: Id | null;
  topicoId: Id | null;
  tipo: TipoSessao;
  questoesFeitas?: number;
  acertos?: number;
  paginas?: number;
  anotacoes?: string;
  concluiuTeoria?: boolean;
}

export function novoId(): Id {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function chaveSemana(inicio: string): string {
  return inicioDaSemana(diaSP(inicio));
}

function falha(codigo: string, mensagem: string): ErroStore {
  return { codigo, mensagem };
}

const ORDEM_STATUS: StatusTopico[] = ['nao_iniciado', 'em_estudo', 'teoria_concluida', 'revisado', 'dominado'];

export class Repositorio {
  private brutos = new Map<Colecao, Map<string, Json>>();
  private desinscrever: (() => void)[] = [];
  private ouvintes = new Set<(d: Dados) => void>();
  private erro: ErroStore | null = null;
  private dados: Dados;
  private limpandoAtiva = false;

  constructor(
    private store: Store,
    private relogio: () => Date = () => new Date(),
    readonly arquivos: Arquivos | null = null,
  ) {
    this.dados = this.montar();
  }

  iniciar(): void {
    for (const col of COLECOES) {
      this.desinscrever.push(
        this.store.assinarColecao(
          col,
          (docs) => {
            this.brutos.set(col, docs);
            this.atualizar();
          },
          (e) => {
            this.erro = e;
            this.atualizar();
          },
        ),
      );
    }
  }

  encerrar(): void {
    this.desinscrever.forEach((f) => f());
    this.desinscrever = [];
  }

  assinar(f: (d: Dados) => void): () => void {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  get atual(): Dados {
    return this.dados;
  }

  /** Espera todas as coleções chegarem ao menos uma vez (útil em testes). */
  pronto(): Promise<Dados> {
    if (this.dados.carregado) return Promise.resolve(this.dados);
    return new Promise((ok) => {
      const sair = this.assinar((d) => {
        if (d.carregado) {
          sair();
          ok(d);
        }
      });
    });
  }

  private col(c: Colecao): Map<string, Json> {
    return this.brutos.get(c) ?? new Map();
  }

  private montar(): Dados {
    const concursos = [...this.col('concursos').entries()]
      .map(([id, d]) => ({ ...(d as unknown as Concurso), id }))
      .sort((a, b) => b.prioridade - a.prioridade || a.nome.localeCompare(b.nome, 'pt-BR'));
    const disciplinas = [...this.col('disciplinas').entries()]
      .map(([id, d]) => ({ ...(d as unknown as Disciplina), id, topicos: (d.topicos as Record<Id, Topico>) ?? {} }))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
    const sessoes = this.itensSemanais<Sessao>('sessoes').sort((a, b) => b.inicio.localeCompare(a.inicio));
    const revisoesFeitas = this.itensSemanais<RegistroRevisao>('revisoes').sort((a, b) => b.dia.localeCompare(a.dia));
    const materiais: Material[] = [];
    for (const doc of this.col('biblioteca').values()) {
      for (const m of Object.values((doc.itens as Record<Id, Material | null>) ?? {})) if (m) materiais.push(m);
    }
    materiais.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const editais = [...this.col('editais').values()]
      .map((e) => e as unknown as Edital)
      .sort((a, b) => b.importadoEm.localeCompare(a.importadoEm));
    const vinculosIgnorados = new Set((this.col('estado').get('vinculos')?.ignorados as string[] | undefined) ?? []);
    const disp = this.col('disponibilidade').get('geral') as Partial<Disponibilidade> | undefined;
    const disponibilidade: Disponibilidade = { ...DISPONIBILIDADE_VAZIA, ...disp, dias: disp?.dias ?? {}, excecoes: disp?.excecoes ?? {} };
    const blocos = this.itensSemanais<BlocoPlanejado>('plano').sort((a, b) => a.dia.localeCompare(b.dia) || a.inicio.localeCompare(b.inicio));
    const registrosQuestoes = this.itensSemanais<RegistroQuestoes>('questoes').sort((a, b) => b.dia.localeCompare(a.dia));
    const erros: ErroCaderno[] = [];
    for (const doc of this.col('erros').values()) {
      for (const e of Object.values((doc.itens as Record<Id, ErroCaderno | null>) ?? {})) if (e) erros.push(e);
    }
    erros.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const simulados = [...this.col('simulados').values()].map((x) => x as unknown as Simulado).sort((a, b) => b.dia.localeCompare(a.dia));
    const oportunidades: Oportunidade[] = [];
    for (const doc of this.col('oportunidades').values()) {
      for (const [id, o] of Object.entries((doc.itens as Record<Id, Oportunidade | null>) ?? {})) if (o?.titulo) oportunidades.push({ ...o, id });
    }
    oportunidades.sort((a, b) => (a.inscricoesAte ?? '9999').localeCompare(b.inscricoesAte ?? '9999') || a.orgao.localeCompare(b.orgao, 'pt-BR'));
    const filtrosRadar = [...this.col('radar_filtros').entries()].map(([id, f]) => ({ ...(f as unknown as FiltroRadar), id }));
    const radarVistoAte = (this.col('estado').get('radar')?.vistoAte as string | undefined) ?? null;
    const provas = [...this.col('provas').entries()]
      .map(([id, p]) => ({ ...(p as unknown as ProvaAnterior), id, questoes: (p.questoes as unknown as ProvaAnterior['questoes']) ?? {} }))
      .sort((a, b) => (b.ano ?? 0) - (a.ano ?? 0) || b.importadaEm.localeCompare(a.importadaEm));
    const ultimoBackup = (this.col('estado').get('backup')?.ultimoEm as string | undefined) ?? null;
    const ativa = ((this.col('estado').get('cronometro')?.sessao as Sessao | null) ?? null) || null;
    const cfg = this.col('config').get('geral') as Partial<Configuracao> | undefined;
    const config: Configuracao = {
      ...CONFIG_PADRAO,
      ...cfg,
      pomodoro: { ...CONFIG_PADRAO.pomodoro, ...cfg?.pomodoro },
    };
    return {
      carregado: COLECOES.every((c) => this.brutos.has(c)),
      modo: this.store.modo,
      concursos,
      disciplinas,
      sessoes,
      ativa,
      revisoesFeitas,
      materiais,
      editais,
      vinculosIgnorados,
      disponibilidade,
      blocos,
      registrosQuestoes,
      erros,
      simulados,
      oportunidades,
      filtrosRadar,
      radarVistoAte,
      provas,
      ultimoBackup,
      config,
      erro: this.erro,
    };
  }

  private itensSemanais<T>(col: ColecaoSemanal): T[] {
    const itens: T[] = [];
    for (const semana of this.col(col).values()) {
      for (const item of Object.values((semana.itens as Record<Id, T | null>) ?? {})) if (item) itens.push(item);
    }
    return itens;
  }

  private atualizar() {
    this.dados = this.montar();
    this.reconciliarAtiva();
    for (const f of this.ouvintes) f(this.dados);
  }

  /**
   * Se a sessão em andamento já foi gravada nas semanas (ex.: a gravação do
   * `estado` falhou depois de finalizar), limpa o estado para não duplicar.
   */
  private reconciliarAtiva() {
    const { ativa, sessoes, carregado } = this.dados;
    if (!carregado || !ativa || this.limpandoAtiva) return;
    if (!sessoes.some((s) => s.id === ativa.id)) return;
    this.limpandoAtiva = true;
    this.store
      .definir('estado/cronometro', { sessao: null })
      .catch(() => undefined)
      .finally(() => (this.limpandoAtiva = false));
  }

  // ------------------------------------------------------------ concursos

  async salvarConcurso(c: Omit<Concurso, 'id' | 'criadoEm'> & { id?: Id; criadoEm?: string }): Promise<Id> {
    const id = c.id ?? novoId();
    const doc: Concurso = { ...c, id, criadoEm: c.criadoEm ?? this.relogio().toISOString() };
    await this.store.definir(`concursos/${id}`, doc as unknown as Json);
    return id;
  }

  /** Apaga o concurso, as disciplinas e a biblioteca dele. As sessões ficam no histórico. */
  async excluirConcurso(id: Id): Promise<void> {
    for (const d of this.dados.disciplinas.filter((x) => x.concursoId === id)) {
      await this.excluirDisciplina(d.id);
    }
    for (const e of this.dados.editais.filter((x) => x.concursoId === id)) await this.excluirEdital(e);
    await this.store.remover(`concursos/${id}`);
  }

  // ---------------------------------------------------------- disciplinas

  async salvarDisciplina(
    d: Pick<Disciplina, 'concursoId' | 'nome' | 'peso' | 'numQuestoes' | 'tipo'> & { id?: Id; cor?: string },
  ): Promise<Id> {
    const existente = d.id ? this.dados.disciplinas.find((x) => x.id === d.id) : undefined;
    if (existente) {
      await this.store.mesclar(`disciplinas/${existente.id}`, {
        nome: d.nome,
        peso: d.peso,
        numQuestoes: d.numQuestoes,
        tipo: d.tipo,
        ...(d.cor ? { cor: d.cor } : {}),
      });
      return existente.id;
    }
    const irmas = this.dados.disciplinas.filter((x) => x.concursoId === d.concursoId);
    const id = d.id ?? novoId();
    const nova: Disciplina = {
      id,
      concursoId: d.concursoId,
      editalId: null,
      nome: d.nome,
      peso: d.peso,
      numQuestoes: d.numQuestoes,
      tipo: d.tipo,
      ordem: irmas.length ? Math.max(...irmas.map((x) => x.ordem)) + 1 : 0,
      cor: d.cor ?? CORES_DISCIPLINA[irmas.length % CORES_DISCIPLINA.length],
      topicos: {},
    };
    await this.store.definir(`disciplinas/${id}`, nova as unknown as Json);
    return id;
  }

  /** Apaga a disciplina, os tópicos e a biblioteca dela (inclusive os PDFs enviados). */
  async excluirDisciplina(id: Id): Promise<void> {
    const pdfs = this.dados.materiais.filter((m) => m.disciplinaId === id && m.arquivoId);
    if (this.col('biblioteca').has(id)) await this.store.remover(`biblioteca/${id}`);
    if (this.col('erros').has(id)) await this.store.remover(`erros/${id}`);
    await this.store.remover(`disciplinas/${id}`);
    for (const m of pdfs) await this.arquivos?.remover(m.arquivoId as string).catch(() => undefined);
  }

  // -------------------------------------------------------------- tópicos

  private disciplina(id: Id): Disciplina {
    const d = this.dados.disciplinas.find((x) => x.id === id);
    if (!d) throw falha('nao_encontrado', 'Disciplina não encontrada.');
    return d;
  }

  async adicionarTopico(disciplinaId: Id, titulo: string, paiId: Id | null = null): Promise<Id> {
    const d = this.disciplina(disciplinaId);
    const t: Topico = {
      id: novoId(),
      paiId,
      titulo: titulo.trim(),
      ordem: proximaOrdem(d.topicos, paiId),
      status: 'nao_iniciado',
      autoavaliacao: null,
      incidencia: null,
      grupoEquivalenciaId: null,
    };
    await this.store.mesclar(`disciplinas/${disciplinaId}`, { topicos: { [t.id]: t } });
    return t.id;
  }

  /** Cadastra uma lista colada. Devolve quantos tópicos entraram. */
  async adicionarLote(disciplinaId: Id, texto: string, paiId: Id | null = null): Promise<number> {
    const d = this.disciplina(disciplinaId);
    const novos = topicosDoLote(lerLote(texto), novoId, paiId, proximaOrdem(d.topicos, paiId));
    if (!novos.length) return 0;
    await this.store.mesclar(`disciplinas/${disciplinaId}`, {
      topicos: Object.fromEntries(novos.map((t) => [t.id, t])),
    });
    return novos.length;
  }

  /**
   * Ao concluir a teoria, marca a data e agenda a primeira revisão (D+1). Ao
   * voltar para "não iniciado" ou "em estudo", desfaz as duas coisas.
   */
  async atualizarTopico(
    disciplinaId: Id,
    topicoId: Id,
    patch: Partial<Pick<Topico, 'titulo' | 'status' | 'autoavaliacao' | 'incidencia' | 'blocosTeoria'>>,
  ): Promise<void> {
    const t = this.dados.disciplinas.find((x) => x.id === disciplinaId)?.topicos[topicoId];
    const extra: Partial<Topico> = {};
    if (t && patch.status) {
      const antes = topicoConcluido(t);
      const depois = topicoConcluido({ status: patch.status });
      if (depois) {
        if (!antes) extra.concluidoEm = this.relogio().toISOString();
        if (!t.revisao) extra.revisao = rev.iniciarRevisao(diaSP(this.relogio()));
      } else if (antes) {
        extra.concluidoEm = null;
        extra.revisao = null;
      }
    }
    const mudancas = [{ disciplinaId, topicoId, patch: { ...patch, ...extra } }];
    // Tópicos equivalentes em outros editais acompanham o status (estudar um conta para o outro).
    if (t?.grupoEquivalenciaId && patch.status) {
      for (const m of this.membrosDoGrupo(t.grupoEquivalenciaId, topicoId)) {
        mudancas.push({ ...m, patch: { status: patch.status, ...extra } });
      }
    }
    await this.aplicarEmTopicos(mudancas);
  }

  /** Grava alterações de vários tópicos, uma gravação por disciplina. */
  private async aplicarEmTopicos(mudancas: { disciplinaId: Id; topicoId: Id; patch: Partial<Topico> }[]): Promise<void> {
    const porDisciplina = new Map<Id, Record<Id, Json>>();
    for (const m of mudancas) {
      const topicos = porDisciplina.get(m.disciplinaId) ?? {};
      topicos[m.topicoId] = { ...(topicos[m.topicoId] ?? {}), ...(m.patch as Json) };
      porDisciplina.set(m.disciplinaId, topicos);
    }
    for (const [id, topicos] of porDisciplina) await this.store.mesclar(`disciplinas/${id}`, { topicos });
  }

  private membrosDoGrupo(grupo: Id, excetoTopicoId?: Id): { disciplinaId: Id; topicoId: Id }[] {
    const membros: { disciplinaId: Id; topicoId: Id }[] = [];
    for (const d of this.dados.disciplinas) {
      for (const t of Object.values(d.topicos)) {
        if (t.grupoEquivalenciaId === grupo && t.id !== excetoTopicoId) membros.push({ disciplinaId: d.id, topicoId: t.id });
      }
    }
    return membros;
  }

  // ------------------------------------------------ tópicos equivalentes

  /**
   * Vincula dois tópicos de editais diferentes. Os dois (e os que já estavam
   * vinculados a eles) passam a ter o status mais avançado entre eles.
   */
  async vincularTopicos(a: { disciplinaId: Id; topicoId: Id }, b: { disciplinaId: Id; topicoId: Id }): Promise<void> {
    const ta = this.disciplina(a.disciplinaId).topicos[a.topicoId];
    const tb = this.disciplina(b.disciplinaId).topicos[b.topicoId];
    if (!ta || !tb) throw falha('nao_encontrado', 'Tópico não encontrado.');
    const grupo = ta.grupoEquivalenciaId ?? tb.grupoEquivalenciaId ?? novoId();
    const membros = [a, b];
    for (const g of [ta.grupoEquivalenciaId, tb.grupoEquivalenciaId]) {
      if (g) membros.push(...this.membrosDoGrupo(g));
    }
    const unicos = [...new Map(membros.map((m) => [m.topicoId, m])).values()];
    const topicos = unicos.map((m) => this.disciplina(m.disciplinaId).topicos[m.topicoId]).filter(Boolean);
    const lider = topicos.reduce((x, y) => (ORDEM_STATUS.indexOf(y.status) > ORDEM_STATUS.indexOf(x.status) ? y : x));
    const concluidoEm = topicos.map((t) => t.concluidoEm).filter(Boolean).sort()[0] ?? null;
    await this.aplicarEmTopicos(
      unicos.map((m) => ({
        ...m,
        patch: { grupoEquivalenciaId: grupo, status: lider.status, concluidoEm, revisao: lider.revisao ?? null },
      })),
    );
  }

  async desvincularTopico(disciplinaId: Id, topicoId: Id): Promise<void> {
    const t = this.disciplina(disciplinaId).topicos[topicoId];
    if (!t?.grupoEquivalenciaId) return;
    const resto = this.membrosDoGrupo(t.grupoEquivalenciaId, topicoId);
    const mudancas = [{ disciplinaId, topicoId, patch: { grupoEquivalenciaId: null } as Partial<Topico> }];
    // Um grupo de um só tópico não faz sentido: desfaz também.
    if (resto.length === 1) mudancas.push({ ...resto[0], patch: { grupoEquivalenciaId: null } });
    await this.aplicarEmTopicos(mudancas);
  }

  async ignorarEquivalencia(topicoA: Id, topicoB: Id): Promise<void> {
    const ignorados = [...this.dados.vinculosIgnorados, chavePar(topicoA, topicoB)];
    await this.store.definir('estado/vinculos', { ignorados });
  }

  // --------------------------------------------------------------- editais

  /**
   * Salva o resultado revisado da importação: o edital (com o PDF, se houver)
   * e as disciplinas. `destinoId` junta os tópicos numa disciplina existente.
   */
  async importarEdital(d: {
    concursoId: Id;
    cargo: string;
    trecho: string;
    arquivo: File | null;
    disciplinas: (DisciplinaImportada & { destinoId: Id | null })[];
  }): Promise<{ disciplinas: number; topicos: number }> {
    const editalId = novoId();
    let arquivoId: string | null = null;
    if (d.arquivo && this.arquivos) {
      try {
        arquivoId = (await this.arquivos.enviar(d.arquivo)).id;
      } catch {
        arquivoId = null; // o PDF é um extra: a importação segue sem ele
      }
    }
    const edital: Edital = {
      id: editalId,
      concursoId: d.concursoId,
      arquivoId,
      arquivoNome: arquivoId && d.arquivo ? d.arquivo.name : null,
      cargo: d.cargo,
      trecho: d.trecho.slice(0, 150_000),
      importadoEm: this.relogio().toISOString(),
      dataPublicacao: null,
    };
    await this.store.definir(`editais/${editalId}`, edital as unknown as Json);

    let nTopicos = 0;
    const irmas = this.dados.disciplinas.filter((x) => x.concursoId === d.concursoId);
    let ordem = irmas.length ? Math.max(...irmas.map((x) => x.ordem)) + 1 : 0;
    for (const imp of d.disciplinas) {
      const destino = imp.destinoId ? this.dados.disciplinas.find((x) => x.id === imp.destinoId) : undefined;
      if (destino) {
        const novos = topicosDaImportacao(imp.topicos, novoId, proximaOrdem(destino.topicos, null));
        nTopicos += novos.length;
        if (novos.length) {
          await this.store.mesclar(`disciplinas/${destino.id}`, { topicos: Object.fromEntries(novos.map((t) => [t.id, t])) });
        }
        continue;
      }
      const novos = topicosDaImportacao(imp.topicos, novoId);
      nTopicos += novos.length;
      const id = novoId();
      const nova: Disciplina = {
        id,
        concursoId: d.concursoId,
        editalId,
        nome: imp.nome,
        peso: imp.peso ?? 1,
        numQuestoes: imp.numQuestoes,
        tipo: imp.tipo,
        ordem: ordem++,
        cor: CORES_DISCIPLINA[(ordem - 1) % CORES_DISCIPLINA.length],
        topicos: Object.fromEntries(novos.map((t) => [t.id, t])),
      };
      await this.store.definir(`disciplinas/${id}`, nova as unknown as Json);
    }
    return { disciplinas: d.disciplinas.length, topicos: nTopicos };
  }

  async excluirEdital(e: Edital): Promise<void> {
    await this.store.remover(`editais/${e.id}`);
    if (e.arquivoId) await this.arquivos?.remover(e.arquivoId).catch(() => undefined);
  }

  /** Remove o tópico e os subtópicos dele. */
  async removerTopico(disciplinaId: Id, topicoId: Id): Promise<void> {
    const d = this.disciplina(disciplinaId);
    const sair = comDescendentes(d.topicos, topicoId);
    const topicos = Object.fromEntries(Object.entries(d.topicos).filter(([id]) => !sair.has(id)));
    await this.store.definir(`disciplinas/${disciplinaId}`, { ...d, topicos } as unknown as Json);
  }

  async moverTopico(disciplinaId: Id, topicoId: Id, direcao: -1 | 1): Promise<void> {
    const novas = mover(this.disciplina(disciplinaId).topicos, topicoId, direcao);
    if (!novas) return;
    await this.store.mesclar(`disciplinas/${disciplinaId}`, {
      topicos: Object.fromEntries(Object.entries(novas).map(([id, ordem]) => [id, { ordem }])),
    });
  }

  private async avancarStatus(disciplinaId: Id | null, topicoId: Id | null, status: StatusTopico) {
    if (!disciplinaId || !topicoId) return;
    const t = this.dados.disciplinas.find((x) => x.id === disciplinaId)?.topicos[topicoId];
    if (!t || ORDEM_STATUS.indexOf(t.status) >= ORDEM_STATUS.indexOf(status)) return;
    await this.atualizarTopico(disciplinaId, topicoId, { status });
  }

  // ------------------------------------------------------------- revisões

  /** Registra uma revisão feita hoje e agenda a próxima conforme a avaliação. */
  async registrarRevisao(disciplinaId: Id, topicoId: Id, avaliacao: AvaliacaoRevisao): Promise<EstadoRevisao> {
    const d = this.disciplina(disciplinaId);
    const t = d.topicos[topicoId];
    if (!t) throw falha('nao_encontrado', 'Tópico não encontrado.');
    const hoje = diaSP(this.relogio());
    const estado = rev.registrarRevisao(t.revisao ?? rev.iniciarRevisao(hoje), avaliacao, hoje);
    const patch: Partial<Topico> = { revisao: estado };
    if ((avaliacao === 'bom' || avaliacao === 'facil') && t.status === 'teoria_concluida') patch.status = 'revisado';
    const membros = t.grupoEquivalenciaId ? this.membrosDoGrupo(t.grupoEquivalenciaId, topicoId) : [];
    await this.aplicarEmTopicos([{ disciplinaId, topicoId, patch }, ...membros.map((m) => ({ ...m, patch }))]);
    const registro: RegistroRevisao = {
      id: novoId(),
      concursoId: d.concursoId,
      disciplinaId,
      topicoId,
      dia: hoje,
      avaliacao,
      intervalo: estado.intervalo,
    };
    await this.gravarItemSemanal('revisoes', inicioDaSemana(hoje), registro);
    return estado;
  }

  /** Tópicos já concluídos que ainda não têm revisão agendada (ex.: marcados antes das revisões existirem). */
  concluidosSemRevisao(): { disciplina: Disciplina; topico: Topico }[] {
    return this.dados.disciplinas.flatMap((d) =>
      Object.values(d.topicos)
        .filter((t) => topicoConcluido(t) && !t.revisao)
        .map((topico) => ({ disciplina: d, topico })),
    );
  }

  /** Agenda para amanhã a primeira revisão dos tópicos concluídos sem revisão. */
  async agendarRevisoesPendentes(): Promise<number> {
    const hoje = diaSP(this.relogio());
    const porDisciplina = new Map<Id, Record<Id, Json>>();
    for (const { disciplina, topico } of this.concluidosSemRevisao()) {
      const m = porDisciplina.get(disciplina.id) ?? {};
      m[topico.id] = { revisao: rev.iniciarRevisao(hoje) as unknown as Json };
      porDisciplina.set(disciplina.id, m);
    }
    let n = 0;
    for (const [id, topicos] of porDisciplina) {
      await this.store.mesclar(`disciplinas/${id}`, { topicos });
      n += Object.keys(topicos).length;
    }
    return n;
  }

  // ----------------------------------------------------------- biblioteca

  async salvarMaterial(m: Omit<Material, 'id' | 'criadoEm'> & { id?: Id; criadoEm?: string }): Promise<Id> {
    const id = m.id ?? novoId();
    const doc: Material = { ...m, id, criadoEm: m.criadoEm ?? this.relogio().toISOString() };
    const antigo = this.dados.materiais.find((x) => x.id === id);
    if (antigo && antigo.disciplinaId !== doc.disciplinaId) await this.tirarMaterial(antigo);
    const caminho = `biblioteca/${doc.disciplinaId}`;
    if (this.col('biblioteca').has(doc.disciplinaId)) {
      await this.store.mesclar(caminho, { itens: { [id]: doc as unknown as Json } });
    } else {
      await this.store.definir(caminho, { disciplinaId: doc.disciplinaId, itens: { [id]: doc as unknown as Json } });
    }
    return id;
  }

  /** Remove o material e, se houver, o PDF enviado. */
  async removerMaterial(m: Material): Promise<void> {
    await this.tirarMaterial(m);
    if (m.arquivoId) await this.arquivos?.remover(m.arquivoId);
  }

  private async tirarMaterial(m: Material): Promise<void> {
    const doc = this.col('biblioteca').get(m.disciplinaId);
    if (!doc) return;
    const itens = { ...(doc.itens as Record<Id, Json>) };
    delete itens[m.id];
    if (Object.keys(itens).length) await this.store.definir(`biblioteca/${m.disciplinaId}`, { disciplinaId: m.disciplinaId, itens });
    else await this.store.remover(`biblioteca/${m.disciplinaId}`);
  }

  // --------------------------------------------------------- planejamento

  async salvarDisponibilidade(d: Disponibilidade): Promise<void> {
    await this.store.definir('disponibilidade/geral', d as unknown as Json);
  }

  /** Questões (sessões e avulsas) no formato do cálculo de acerto recente. */
  private registrosDeQuestoes() {
    return [
      ...this.dados.sessoes.map((s) => ({ topicoId: s.topicoId, feitas: s.questoesFeitas, acertos: s.acertos, dia: diaSP(s.inicio) })),
      ...this.dados.registrosQuestoes.map((r) => ({ topicoId: r.topicoId, feitas: r.feitas, acertos: r.acertos, dia: r.dia })),
    ];
  }

  /** Minutos por dia da semana que o plano deve usar (capacidade real), se o ajuste estiver ligado. */
  capacidadeDoPlano(): Record<string, number> | undefined {
    if (!this.dados.config.usarCapacidadeReal) return undefined;
    const todas = this.dados.ativa ? [...this.dados.sessoes, this.dados.ativa] : this.dados.sessoes;
    return capacidadeParaPlano(capacidadeReal(todas, this.dados.disponibilidade, this.relogio()), this.dados.disponibilidade);
  }

  temDisponibilidade(): boolean {
    const d = this.dados.disponibilidade;
    return Object.values(d.dias).some((l) => l.length > 0) || Object.values(d.excecoes).some((e) => e.blocos.length > 0);
  }

  /**
   * Refaz os blocos planejados de agora em diante. Blocos marcados (feito,
   * parcial, pulado), os que já começaram e os movidos por você ficam como
   * estão: o histórico nunca é apagado. Devolve quantos blocos foram planejados.
   */
  async replanejar(): Promise<number> {
    const agora = this.relogio();
    const novos = gerarPlano({
      agora,
      concursos: this.dados.concursos,
      disciplinas: comIncidenciaDasProvas(this.dados.disciplinas, this.dados.concursos, this.dados.provas),
      disponibilidade: this.dados.disponibilidade,
      existentes: this.dados.blocos,
      acertos: acertoRecente(this.registrosDeQuestoes(), diaSP(agora)),
      capacidadeMin: this.capacidadeDoPlano(),
      intercalar: this.dados.config.intercalarAssuntos,
      ultimoEstudo: this.ultimoEstudoDeTeoria(),
      simulados: this.dados.simulados,
      novoId,
    });
    await this.substituirFuturos(novos);
    await this.store.definir('estado/planejamento', { ultimoReplanejamento: diaSP(agora) });
    return novos.length;
  }

  /** Último estudo de teoria de cada disciplina (sessões e blocos de teoria feitos), para o rodízio. */
  private ultimoEstudoDeTeoria(): Map<Id, string> {
    const m = new Map<Id, string>();
    const marcar = (id: Id | null, quando: string) => {
      if (id && (m.get(id) ?? '') < quando) m.set(id, quando);
    };
    for (const s of this.dados.ativa ? [...this.dados.sessoes, this.dados.ativa] : this.dados.sessoes) {
      if (s.tipo === 'teoria') marcar(s.disciplinaId, s.inicio);
    }
    for (const b of this.dados.blocos) {
      if (b.motivo === 'teoria' && (b.status === 'feito' || b.status === 'parcial')) marcar(b.disciplinaId, instanteSP(b.dia, b.inicio).toISOString());
    }
    return m;
  }

  /** Replaneja se houver disponibilidade configurada (depois de sessões e blocos marcados). */
  private async replanejarSePuder(): Promise<void> {
    if (this.temDisponibilidade()) await this.replanejar();
  }

  /** Na primeira abertura do dia, refaz o plano (o "replanejar de madrugada"). */
  async replanejarDoDia(): Promise<boolean> {
    const ultimo = this.col('estado').get('planejamento')?.ultimoReplanejamento;
    if (ultimo === diaSP(this.relogio()) || !this.temDisponibilidade()) return false;
    await this.replanejar();
    return true;
  }

  /** Tira tópicos do plano (edital não fecha). Continuam no edital e voltam quando quiser. */
  async cortarTopicos(refs: { disciplinaId: Id; topicoId: Id }[], cortado = true): Promise<void> {
    const mudancas = refs.flatMap((r) => {
      const t = this.dados.disciplinas.find((d) => d.id === r.disciplinaId)?.topicos[r.topicoId];
      const grupo = t?.grupoEquivalenciaId ? this.membrosDoGrupo(t.grupoEquivalenciaId, r.topicoId) : [];
      return [r, ...grupo].map((m) => ({ ...m, patch: { cortado } as Partial<Topico> }));
    });
    await this.aplicarEmTopicos(mudancas);
    await this.replanejarSePuder();
  }

  /** Apaga os blocos planejados de agora em diante, inclusive os movidos (o histórico fica). */
  async removerPlanoFuturo(): Promise<number> {
    const agora = this.relogio().getTime();
    const fixos = this.dados.blocos.filter((b) => b.status === 'planejado' && b.fixo && instanteSP(b.dia, b.inicio).getTime() >= agora);
    for (const b of fixos) await this.gravarItemSemanal('plano', inicioDaSemana(b.dia), { ...b, fixo: false } as BlocoPlanejado);
    const antes = this.futurosPlanejados().length;
    await this.substituirFuturos([]);
    return antes;
  }

  private futurosPlanejados(): BlocoPlanejado[] {
    const agora = this.relogio().getTime();
    return this.dados.blocos.filter((b) => b.status === 'planejado' && !b.fixo && instanteSP(b.dia, b.inicio).getTime() >= agora);
  }

  private async substituirFuturos(novos: BlocoPlanejado[]): Promise<void> {
    const sair = new Set(this.futurosPlanejados().map((b) => b.id));
    const porSemana = new Map<string, Record<Id, Json>>();
    const semanasTocadas = new Set<string>();
    for (const b of this.dados.blocos) {
      const semana = inicioDaSemana(b.dia);
      if (sair.has(b.id)) {
        semanasTocadas.add(semana);
        continue;
      }
      const m = porSemana.get(semana) ?? {};
      m[b.id] = b as unknown as Json;
      porSemana.set(semana, m);
    }
    for (const b of novos) {
      const semana = inicioDaSemana(b.dia);
      semanasTocadas.add(semana);
      const m = porSemana.get(semana) ?? {};
      m[b.id] = b as unknown as Json;
      porSemana.set(semana, m);
    }
    for (const semana of semanasTocadas) {
      const itens = porSemana.get(semana);
      if (itens && Object.keys(itens).length) await this.store.definir(`plano/${semana}`, { semana, itens });
      else if (this.col('plano').has(semana)) await this.store.remover(`plano/${semana}`);
    }
  }

  async marcarBloco(id: Id, status: BlocoPlanejado['status']): Promise<void> {
    const b = this.dados.blocos.find((x) => x.id === id);
    if (!b) throw falha('nao_encontrado', 'Bloco não encontrado.');
    await this.gravarItemSemanal('plano', inicioDaSemana(b.dia), { ...b, status } as BlocoPlanejado);
    await this.replanejarSePuder();
  }

  /** Move o bloco para outro dia e horário, mantendo a duração. */
  async moverBloco(id: Id, dia: string, inicio: string): Promise<void> {
    const b = this.dados.blocos.find((x) => x.id === id);
    if (!b) throw falha('nao_encontrado', 'Bloco não encontrado.');
    const [h, m] = inicio.split(':').map(Number);
    const fimMin = h * 60 + m + minutos(b);
    if (fimMin > 24 * 60) throw falha('horario_invalido', 'O bloco passaria da meia-noite. Escolha um horário mais cedo.');
    const fim = `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`;
    await this.gravarItemSemanal('plano', inicioDaSemana(dia), { ...b, dia, inicio, fim, fixo: true } as BlocoPlanejado);
  }

  // ------------------------------------------------------------ desempenho

  async salvarRegistroQuestoes(r: Omit<RegistroQuestoes, 'id'> & { id?: Id }): Promise<Id> {
    const reg: RegistroQuestoes = { ...r, id: r.id ?? novoId(), acertos: Math.min(r.acertos, r.feitas) };
    await this.gravarItemSemanal('questoes', inicioDaSemana(reg.dia), reg);
    return reg.id;
  }

  async excluirRegistroQuestoes(id: Id): Promise<void> {
    const semana = this.semanaDoItem('questoes', id);
    if (semana) await this.tirarItemSemanal('questoes', semana, id);
  }

  /** Vários registros de uma vez (importação de CSV): uma gravação por semana. */
  async importarQuestoes(registros: Omit<RegistroQuestoes, 'id'>[]): Promise<number> {
    const porSemana = new Map<string, Record<Id, Json>>();
    for (const r of registros) {
      const reg: RegistroQuestoes = { ...r, id: novoId(), acertos: Math.min(r.acertos, r.feitas) };
      const semana = inicioDaSemana(reg.dia);
      porSemana.set(semana, { ...(porSemana.get(semana) ?? {}), [reg.id]: reg as unknown as Json });
    }
    for (const [semana, itens] of porSemana) {
      if (this.col('questoes').has(semana)) await this.store.mesclar(`questoes/${semana}`, { itens });
      else await this.store.definir(`questoes/${semana}`, { semana, itens });
    }
    return registros.length;
  }

  async salvarErro(e: Omit<ErroCaderno, 'id'> & { id?: Id }): Promise<Id> {
    const erro: ErroCaderno = { ...e, id: e.id ?? novoId() };
    const antigo = this.dados.erros.find((x) => x.id === erro.id);
    if (antigo && antigo.disciplinaId !== erro.disciplinaId) await this.tirarErro(antigo);
    const caminho = `erros/${erro.disciplinaId}`;
    if (this.col('erros').has(erro.disciplinaId)) await this.store.mesclar(caminho, { itens: { [erro.id]: erro as unknown as Json } });
    else await this.store.definir(caminho, { disciplinaId: erro.disciplinaId, itens: { [erro.id]: erro as unknown as Json } });
    return erro.id;
  }

  async excluirErro(e: ErroCaderno): Promise<void> {
    await this.tirarErro(e);
  }

  private async tirarErro(e: ErroCaderno): Promise<void> {
    const doc = this.col('erros').get(e.disciplinaId);
    if (!doc) return;
    const itens = { ...(doc.itens as Record<Id, Json>) };
    delete itens[e.id];
    if (Object.keys(itens).length) await this.store.definir(`erros/${e.disciplinaId}`, { disciplinaId: e.disciplinaId, itens });
    else await this.store.remover(`erros/${e.disciplinaId}`);
  }

  /** Revisão do caderno de erros: acertou segue D+3/D+14; errou de novo recomeça. */
  async revisarErroCaderno(e: ErroCaderno, acertou: boolean): Promise<ErroCaderno> {
    const novo = { ...e, ...revisarErro(e, acertou, diaSP(this.relogio())) };
    await this.salvarErro(novo);
    return novo;
  }

  async salvarSimulado(s: Omit<Simulado, 'id'> & { id?: Id }): Promise<Id> {
    const id = s.id ?? novoId();
    await this.store.definir(`simulados/${id}`, { ...s, id } as unknown as Json);
    return id;
  }

  async excluirSimulado(id: Id): Promise<void> {
    await this.store.remover(`simulados/${id}`);
  }

  // ----------------------------------------------------------------- radar

  /**
   * Junta oportunidades novas às que já existem (por id). Uma oportunidade já
   * conhecida mantém a data em que apareceu e se estava ignorada. Encerradas
   * há mais de 30 dias saem do banco.
   */
  async salvarOportunidades(lista: Oportunidade[]): Promise<{ novas: number; atualizadas: number }> {
    const banco: ItensPorUf = {};
    for (const [uf, doc] of this.col('oportunidades')) banco[uf] = (doc.itens as unknown as ItensPorUf[string]) ?? {};
    const r = mesclarOportunidades(banco, lista, diaSP(this.relogio()));
    for (const [uf, itens] of Object.entries(r.docs)) await this.store.definir(`oportunidades/${uf}`, { uf, itens } as unknown as Json);
    for (const uf of r.vazias) await this.store.remover(`oportunidades/${uf}`);
    return { novas: r.novas, atualizadas: r.atualizadas };
  }

  async ignorarOportunidade(o: Oportunidade, ignorada = true): Promise<void> {
    await this.store.mesclar(`oportunidades/${o.uf}`, { itens: { [o.id]: { ignorada } } });
  }

  async salvarFiltroRadar(f: Omit<FiltroRadar, 'id'> & { id?: Id }): Promise<Id> {
    const id = f.id ?? novoId();
    await this.store.definir(`radar_filtros/${id}`, { ...f, id } as unknown as Json);
    return id;
  }

  async excluirFiltroRadar(id: Id): Promise<void> {
    await this.store.remover(`radar_filtros/${id}`);
  }

  async marcarRadarVisto(): Promise<void> {
    await this.store.definir('estado/radar', { vistoAte: this.relogio().toISOString() });
  }

  /** Cria o concurso a partir da oportunidade (para depois importar o edital). */
  async transformarEmConcurso(o: Oportunidade, area: string): Promise<Id> {
    return this.salvarConcurso({
      nome: o.orgao || o.titulo,
      orgao: o.orgao,
      banca: o.banca,
      cargo: o.cargos.find((c) => /eletric|el[eé]tric/i.test(c)) ?? o.cargos[0] ?? '',
      area,
      dataProva: null,
      status: 'edital_aberto',
      link: o.link,
      notaCorte: null,
      prioridade: 3,
    });
  }

  // --------------------------------------------------- provas anteriores

  /** Salva a prova revisada (com o PDF, se houver) e replaneja com a nova incidência. */
  async importarProva(d: Omit<ProvaAnterior, 'id' | 'arquivoId' | 'arquivoNome' | 'importadaEm' | 'questoes'> & { arquivo: File | null; questoes: QuestaoImportada[] }): Promise<Id> {
    const id = novoId();
    const questoes = Object.fromEntries(d.questoes.map((q) => ({ ...q, id: novoId() })).map((q) => [q.id, q]));
    const base = { concursoId: d.concursoId, titulo: d.titulo, banca: d.banca, orgao: d.orgao, ano: d.ano, cargo: d.cargo };
    if (JSON.stringify(questoes).length > 240_000) {
      throw falha('grande_demais', 'A prova ficou grande demais para um documento. Importe em duas partes (por exemplo, conhecimentos básicos e específicos).');
    }
    let arquivoId: string | null = null;
    if (d.arquivo && this.arquivos) {
      try {
        arquivoId = (await this.arquivos.enviar(d.arquivo)).id;
      } catch {
        arquivoId = null; // o PDF é um extra
      }
    }
    const prova: ProvaAnterior = {
      ...base,
      id,
      arquivoId,
      arquivoNome: arquivoId && d.arquivo ? d.arquivo.name : null,
      importadaEm: this.relogio().toISOString(),
      questoes,
    };
    await this.store.definir(`provas/${id}`, prova as unknown as Json);
    await this.replanejarSePuder();
    return id;
  }

  /** Grava as questões revisadas (tópico, gabarito, anulada) e os dados da prova. */
  async atualizarProva(p: ProvaAnterior): Promise<void> {
    await this.store.definir(`provas/${p.id}`, p as unknown as Json);
    await this.replanejarSePuder();
  }

  async excluirProva(p: ProvaAnterior): Promise<void> {
    await this.store.remover(`provas/${p.id}`);
    if (p.arquivoId) await this.arquivos?.remover(p.arquivoId).catch(() => undefined);
    await this.replanejarSePuder();
  }

  /** Resultado de refazer a prova: um registro de questões por tópico, com a prova como fonte. */
  async registrarProvaRefeita(p: ProvaAnterior, respostas: Record<Id, number>): Promise<{ feitas: number; acertos: number }> {
    const dia = diaSP(this.relogio());
    const grupos = new Map<string, Omit<RegistroQuestoes, 'id'>>();
    let feitas = 0;
    let acertos = 0;
    for (const [qid, r] of Object.entries(respostas)) {
      const q = p.questoes[qid];
      if (!q || q.anulada || q.correta === null) continue;
      const chave = `${q.disciplinaId}|${q.topicoId}`;
      const g = grupos.get(chave) ?? { concursoId: p.concursoId, disciplinaId: q.disciplinaId, topicoId: q.topicoId, dia, feitas: 0, acertos: 0, fonte: p.titulo };
      g.feitas++;
      feitas++;
      if (r === q.correta) {
        g.acertos++;
        acertos++;
      }
      grupos.set(chave, g);
    }
    if (grupos.size) await this.importarQuestoes([...grupos.values()]);
    return { feitas, acertos };
  }

  // ----------------------------------------------------------- cronômetro

  async iniciarSessao(d: DetalhesSessao): Promise<Sessao> {
    if (this.dados.ativa) throw falha('sessao_ativa', 'Já existe uma sessão em andamento. Finalize-a antes.');
    const s: Sessao = {
      id: novoId(),
      concursoId: d.concursoId,
      disciplinaId: d.disciplinaId,
      topicoId: d.topicoId,
      tipo: d.tipo,
      inicio: this.relogio().toISOString(),
      fim: null,
      pausas: [],
      segundosLiquidos: null,
      questoesFeitas: 0,
      acertos: 0,
      paginas: 0,
      anotacoes: '',
      origem: 'cronometro',
      concluiuTeoria: false,
    };
    await this.store.definir('estado/cronometro', { sessao: s as unknown as Json });
    await this.avancarStatus(d.disciplinaId, d.topicoId, 'em_estudo');
    return s;
  }

  private ativaOuFalha(): Sessao {
    if (!this.dados.ativa) throw falha('sem_sessao', 'Nenhuma sessão em andamento.');
    return this.dados.ativa;
  }

  async pausarSessao(): Promise<void> {
    const s = crono.pausar(this.ativaOuFalha(), this.relogio());
    await this.store.definir('estado/cronometro', { sessao: s as unknown as Json });
  }

  async retomarSessao(): Promise<void> {
    const s = crono.retomar(this.ativaOuFalha(), this.relogio());
    await this.store.definir('estado/cronometro', { sessao: s as unknown as Json });
  }

  /** Troca tópico ou tipo sem parar o relógio. */
  async atualizarSessaoAtiva(d: Partial<DetalhesSessao>): Promise<void> {
    const s = { ...this.ativaOuFalha(), ...d };
    await this.store.definir('estado/cronometro', { sessao: s as unknown as Json });
    await this.avancarStatus(s.disciplinaId, s.topicoId, 'em_estudo');
  }

  async finalizarSessao(d: DetalhesSessao): Promise<Sessao> {
    const ativa = this.ativaOuFalha();
    this.limpandoAtiva = true; // a própria finalização limpa o estado
    try {
      return await this.fecharSessao(ativa, d);
    } finally {
      this.limpandoAtiva = false;
    }
  }

  private async fecharSessao(ativa: Sessao, d: DetalhesSessao): Promise<Sessao> {
    const s = crono.finalizar(
      {
        ...ativa,
        ...d,
        questoesFeitas: d.questoesFeitas ?? 0,
        acertos: Math.min(d.acertos ?? 0, d.questoesFeitas ?? 0),
        paginas: d.paginas ?? 0,
        anotacoes: d.anotacoes ?? '',
        concluiuTeoria: d.concluiuTeoria ?? false,
      },
      this.relogio(),
    );
    // Primeiro grava no histórico; só depois limpa o estado. Se a segunda
    // gravação falhar, `reconciliarAtiva` limpa na próxima carga.
    await this.gravarSessao(s);
    await this.store.definir('estado/cronometro', { sessao: null });
    if (s.concluiuTeoria) await this.avancarStatus(s.disciplinaId, s.topicoId, 'teoria_concluida');
    await this.replanejarSePuder();
    return s;
  }

  async descartarSessaoAtiva(): Promise<void> {
    await this.store.definir('estado/cronometro', { sessao: null });
  }

  // -------------------------------------------------------------- sessões

  /** Grava (cria ou edita) uma sessão finalizada no documento da semana dela. */
  async gravarSessao(s: Sessao): Promise<void> {
    await this.gravarItemSemanal('sessoes', chaveSemana(s.inicio), s);
  }

  /** Registro manual retroativo ("esqueci de ligar o cronômetro"). */
  async registrarManual(
    d: DetalhesSessao & { inicio: Date; segundosLiquidos: number; origem?: Sessao['origem'] },
  ): Promise<Sessao> {
    const inicio = d.inicio;
    const fim = new Date(inicio.getTime() + d.segundosLiquidos * 1000);
    const s: Sessao = {
      id: novoId(),
      concursoId: d.concursoId,
      disciplinaId: d.disciplinaId,
      topicoId: d.topicoId,
      tipo: d.tipo,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      pausas: [],
      segundosLiquidos: d.segundosLiquidos,
      questoesFeitas: d.questoesFeitas ?? 0,
      acertos: Math.min(d.acertos ?? 0, d.questoesFeitas ?? 0),
      paginas: d.paginas ?? 0,
      anotacoes: d.anotacoes ?? '',
      origem: d.origem ?? 'manual',
      concluiuTeoria: d.concluiuTeoria ?? false,
    };
    await this.gravarSessao(s);
    if (s.concluiuTeoria) await this.avancarStatus(s.disciplinaId, s.topicoId, 'teoria_concluida');
    await this.replanejarSePuder();
    return s;
  }

  /**
   * Resultado da prática com IA. Com uma sessão em andamento, as questões
   * somam nela; sem sessão, vira uma sessão de questões com o tempo da prática.
   */
  async registrarPratica(d: {
    concursoId: Id | null;
    disciplinaId: Id | null;
    topicoId: Id | null;
    feitas: number;
    acertos: number;
    inicio: Date;
    descricao: string;
  }): Promise<'ativa' | 'nova'> {
    const ativa = this.dados.ativa;
    if (ativa) {
      const s = {
        ...ativa,
        questoesFeitas: ativa.questoesFeitas + d.feitas,
        acertos: ativa.acertos + Math.min(d.acertos, d.feitas),
      };
      await this.store.definir('estado/cronometro', { sessao: s as unknown as Json });
      return 'ativa';
    }
    const segundos = Math.max(60, Math.round((this.relogio().getTime() - d.inicio.getTime()) / 1000));
    await this.registrarManual({
      concursoId: d.concursoId,
      disciplinaId: d.disciplinaId,
      topicoId: d.topicoId,
      tipo: 'questoes',
      inicio: d.inicio,
      segundosLiquidos: segundos,
      questoesFeitas: d.feitas,
      acertos: d.acertos,
      anotacoes: d.descricao,
      origem: 'pratica_ia',
    });
    return 'nova';
  }

  async excluirSessao(id: Id): Promise<void> {
    const semana = this.semanaDoItem('sessoes', id);
    if (semana) await this.tirarItemSemanal('sessoes', semana, id);
  }

  // ------------------------------------------- documentos agrupados por semana

  private semanaDoItem(col: ColecaoSemanal, id: Id): string | null {
    for (const [semana, doc] of this.col(col)) {
      if ((doc.itens as Record<Id, unknown> | undefined)?.[id]) return semana;
    }
    return null;
  }

  private async gravarItemSemanal(col: ColecaoSemanal, semana: string, item: { id: Id }): Promise<void> {
    const antiga = this.semanaDoItem(col, item.id);
    if (antiga && antiga !== semana) await this.tirarItemSemanal(col, antiga, item.id);
    const caminho = `${col}/${semana}`;
    if (this.col(col).has(semana)) {
      await this.store.mesclar(caminho, { itens: { [item.id]: item as unknown as Json } });
    } else {
      await this.store.definir(caminho, { semana, itens: { [item.id]: item as unknown as Json } });
    }
  }

  private async tirarItemSemanal(col: ColecaoSemanal, semana: string, id: Id): Promise<void> {
    const doc = this.col(col).get(semana);
    if (!doc) return;
    const itens = { ...(doc.itens as Record<Id, Json>) };
    delete itens[id];
    if (Object.keys(itens).length) await this.store.definir(`${col}/${semana}`, { semana, itens });
    else await this.store.remover(`${col}/${semana}`);
  }

  // --------------------------------------------------------- configuração

  async salvarConfig(c: Configuracao): Promise<void> {
    await this.store.definir('config/geral', c as unknown as Json);
  }

  // --------------------------------------------------------------- backup

  async marcarBackup(): Promise<void> {
    await this.store.definir('estado/backup', { ultimoEm: this.relogio().toISOString() });
  }

  exportar(): Backup {
    const documentos: Record<string, Json> = {};
    for (const col of COLECOES) {
      for (const [id, doc] of this.col(col)) documentos[`${col}/${id}`] = doc;
    }
    return { app: 'organizador-de-concursos', versao: 1, exportadoEm: this.relogio().toISOString(), documentos };
  }

  /** Substitui todo o conteúdo do banco pelo do backup. */
  async importar(backup: unknown): Promise<number> {
    const b = backup as Partial<Backup>;
    if (b?.app !== 'organizador-de-concursos' || b.versao !== 1 || typeof b.documentos !== 'object' || !b.documentos) {
      throw falha('backup_invalido', 'Este arquivo não é um backup do Organizador de Concursos.');
    }
    const caminhos = Object.keys(b.documentos);
    const validos = caminhos.every((c) => {
      const partes = c.split('/');
      return partes.length === 2 && (COLECOES as readonly string[]).includes(partes[0]);
    });
    if (!validos) throw falha('backup_invalido', 'O backup tem registros que o app não reconhece.');

    for (const col of COLECOES) {
      for (const id of this.col(col).keys()) {
        if (!(`${col}/${id}` in b.documentos)) await this.store.remover(`${col}/${id}`);
      }
    }
    for (const c of caminhos) await this.store.definir(c, b.documentos[c]);
    return caminhos.length;
  }
}
