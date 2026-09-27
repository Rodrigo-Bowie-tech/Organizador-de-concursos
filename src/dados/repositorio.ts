// Repositório: mantém o espelho do banco (via assinaturas) e faz todas as
// gravações. As telas leem `Dados` e chamam os métodos daqui.
//
// Caminhos no banco:
//   concursos/<id>            Concurso
//   disciplinas/<id>          Disciplina (com os tópicos dentro)
//   sessoes/<AAAA-MM-DD>      { semana, itens: { <id>: Sessao } }, semana começando no domingo
//   estado/cronometro         { sessao: Sessao | null }, a sessão em andamento
//   config/geral              Configuracao
//   radar_filtros/<id>        FiltroRadar (Fase 6; já vem no seed)

import * as crono from '../dominio/cronometro';
import { diaSP, inicioDaSemana } from '../dominio/datas';
import { lerLote, topicosDoLote } from '../dominio/lote';
import { CORES_DISCIPLINA } from '../dominio/rotulos';
import { comDescendentes, mover, proximaOrdem } from '../dominio/topicos';
import type {
  Concurso,
  Configuracao,
  Disciplina,
  Id,
  Sessao,
  StatusTopico,
  TipoSessao,
  Topico,
} from '../dominio/tipos';
import type { ErroStore, Json, Store } from './store';

export const COLECOES = ['concursos', 'disciplinas', 'sessoes', 'estado', 'config', 'radar_filtros'] as const;
type Colecao = (typeof COLECOES)[number];

export const CONFIG_PADRAO: Configuracao = {
  metaDiariaMin: 180,
  metaSemanalMin: 1260,
  metaMensalMin: 5400,
  pomodoro: { ativo: false, focoMin: 25, pausaCurtaMin: 5, pausaLongaMin: 15, ciclosAtePausaLonga: 4 },
  tema: 'sistema',
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
    const sessoes: Sessao[] = [];
    for (const semana of this.col('sessoes').values()) {
      for (const s of Object.values((semana.itens as Record<Id, Sessao | null>) ?? {})) {
        if (s) sessoes.push(s);
      }
    }
    sessoes.sort((a, b) => b.inicio.localeCompare(a.inicio));
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
      config,
      erro: this.erro,
    };
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

  /** Apaga o concurso e as disciplinas dele. As sessões ficam no histórico. */
  async excluirConcurso(id: Id): Promise<void> {
    for (const d of this.dados.disciplinas.filter((x) => x.concursoId === id)) {
      await this.store.remover(`disciplinas/${d.id}`);
    }
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

  async excluirDisciplina(id: Id): Promise<void> {
    await this.store.remover(`disciplinas/${id}`);
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

  async atualizarTopico(
    disciplinaId: Id,
    topicoId: Id,
    patch: Partial<Pick<Topico, 'titulo' | 'status' | 'autoavaliacao' | 'incidencia'>>,
  ): Promise<void> {
    await this.store.mesclar(`disciplinas/${disciplinaId}`, { topicos: { [topicoId]: patch } });
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
    return s;
  }

  async descartarSessaoAtiva(): Promise<void> {
    await this.store.definir('estado/cronometro', { sessao: null });
  }

  // -------------------------------------------------------------- sessões

  /** Grava (cria ou edita) uma sessão finalizada no documento da semana dela. */
  async gravarSessao(s: Sessao): Promise<void> {
    const semana = chaveSemana(s.inicio);
    const antiga = this.semanaDaSessao(s.id);
    if (antiga && antiga !== semana) await this.tirarDaSemana(antiga, s.id);

    const caminho = `sessoes/${semana}`;
    if (this.col('sessoes').has(semana)) {
      await this.store.mesclar(caminho, { itens: { [s.id]: s as unknown as Json } });
    } else {
      await this.store.definir(caminho, { semana, itens: { [s.id]: s as unknown as Json } });
    }
  }

  /** Registro manual retroativo ("esqueci de ligar o cronômetro"). */
  async registrarManual(
    d: DetalhesSessao & { inicio: Date; segundosLiquidos: number },
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
      origem: 'manual',
      concluiuTeoria: d.concluiuTeoria ?? false,
    };
    await this.gravarSessao(s);
    if (s.concluiuTeoria) await this.avancarStatus(s.disciplinaId, s.topicoId, 'teoria_concluida');
    return s;
  }

  async excluirSessao(id: Id): Promise<void> {
    const semana = this.semanaDaSessao(id);
    if (semana) await this.tirarDaSemana(semana, id);
  }

  private semanaDaSessao(id: Id): string | null {
    for (const [semana, doc] of this.col('sessoes')) {
      if ((doc.itens as Record<Id, unknown> | undefined)?.[id]) return semana;
    }
    return null;
  }

  private async tirarDaSemana(semana: string, id: Id): Promise<void> {
    const doc = this.col('sessoes').get(semana);
    if (!doc) return;
    const itens = { ...(doc.itens as Record<Id, Json>) };
    delete itens[id];
    if (Object.keys(itens).length) await this.store.definir(`sessoes/${semana}`, { semana, itens });
    else await this.store.remover(`sessoes/${semana}`);
  }

  // --------------------------------------------------------- configuração

  async salvarConfig(c: Configuracao): Promise<void> {
    await this.store.definir('config/geral', c as unknown as Json);
  }

  // --------------------------------------------------------------- backup

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
