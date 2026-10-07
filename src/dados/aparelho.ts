// Banco do app instalado (GitHub Pages, Fase 9): os documentos ficam no aparelho e funcionam
// sem internet. Além dos documentos, guarda o que a sincronização com o GitHub precisa:
//   pendentes  o que mudou aqui e ainda não foi enviado (com a hora e uma versão)
//   bases      a última versão de cada documento que este aparelho e o GitHub tinham em comum
//   meta       repositório, token, último commit visto (nunca vão para o GitHub)
// `BancoAparelho` guarda tudo em memória (é o que os testes usam); `IndexedDBStore` grava no
// IndexedDB e avisa as outras abas pelo BroadcastChannel.

import { CHAVE_LOCAL, MemoriaStore } from './store';
import type { ErroStore, Json } from './store';

export interface Pendente {
  /** Quando mudou aqui (ISO); vazio = veio de antes da sincronização (perde empates). */
  em: string;
  versao: string;
}

export interface Base {
  sha: string;
  dado: Json;
}

/** Uma gravação. Em cada campo, `undefined` = não mexe e `null` = apaga. */
export interface Operacao {
  caminho: string;
  doc?: Json | null;
  base?: Base | null;
  pendente?: Pendente | null;
}

/** O que a sincronização quer gravar para um documento que mudou no GitHub. */
export interface MudancaDaNuvem {
  caminho: string;
  doc: Json | null;
  base: Base | null;
  pendente: Pendente | null;
  /** Versão pendente que a sincronização viu; se mudou desde então, a mudança fica para a próxima. */
  versaoEsperada: string | null;
}

export interface Enviado {
  caminho: string;
  versao: string;
  base: Base | null;
}

export const novaVersao = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class BancoAparelho extends MemoriaStore {
  override readonly modo = 'aparelho' as const;
  protected pendentes = new Map<string, Pendente>();
  protected bases = new Map<string, Base>();
  private metas = new Map<string, unknown>();
  private ouvintesGravacao = new Set<() => void>();

  constructor(protected relogio: () => Date = () => new Date()) {
    super(null);
  }

  // ---------------------------------------------- pontos que o IndexedDB troca

  /**
   * Grava as operações de uma vez. `decidir` recebe os pendentes atuais de `caminhos` (no
   * IndexedDB, lidos na mesma transação, para valer também o que outra aba gravou).
   */
  protected async gravarOps(caminhos: string[], decidir: (pendentes: Map<string, Pendente | undefined>) => Operacao[]): Promise<Operacao[]> {
    return decidir(new Map(caminhos.map((c) => [c, this.pendentes.get(c)])));
  }

  /** Conta a mudança de um documento às outras abas. */
  protected anunciar(_caminho: string): void {}

  /** Relê pendentes e bases (outra aba pode ter mudado). */
  async recarregarSinc(): Promise<void> {}

  protected async limparSinc(): Promise<void> {
    this.metas.clear();
  }

  async lerMeta<T>(chave: string): Promise<T | undefined> {
    return this.metas.get(chave) as T | undefined;
  }

  async gravarMeta(chave: string, valor: unknown): Promise<void> {
    if (valor === undefined) this.metas.delete(chave);
    else this.metas.set(chave, structuredClone(valor));
  }

  // ---------------------------------------------------------- gravação local

  protected override async persistir(caminho: string): Promise<void> {
    const pendente = { em: this.relogio().toISOString(), versao: novaVersao() };
    await this.gravarOps([], () => [{ caminho, doc: this.docs.get(caminho) ?? null, pendente }]);
    this.pendentes.set(caminho, pendente);
    this.anunciar(caminho);
    for (const f of this.ouvintesGravacao) f();
  }

  /** Avisa a cada gravação feita neste aparelho (não as que chegam do GitHub ou de outra aba). */
  aoGravarLocal(f: () => void): () => void {
    this.ouvintesGravacao.add(f);
    return () => this.ouvintesGravacao.delete(f);
  }

  // ------------------------------------------------------------ sincronização

  doc(caminho: string): Json | undefined {
    const d = this.docs.get(caminho);
    return d ? structuredClone(d) : undefined;
  }

  pendentesAtuais(): Map<string, Pendente> {
    return new Map(this.pendentes);
  }

  basesAtuais(): Map<string, Base> {
    return new Map(this.bases);
  }

  /** Grava o que veio do GitHub. Devolve os caminhos aplicados (os mudados aqui no meio ficam de fora). */
  async aplicarDaNuvem(mudancas: MudancaDaNuvem[]): Promise<string[]> {
    if (!mudancas.length) return [];
    let aplicadas: string[] = [];
    const ops = await this.gravarOps(
      mudancas.map((m) => m.caminho),
      (atuais) => {
        const validas = mudancas.filter((m) => (atuais.get(m.caminho)?.versao ?? null) === m.versaoEsperada);
        aplicadas = validas.map((m) => m.caminho);
        return validas.map(({ caminho, doc, base, pendente }) => ({ caminho, doc, base, pendente }));
      },
    );
    this.naMemoria(ops, true);
    return aplicadas;
  }

  /** Depois do envio: a base passa a ser o que foi enviado; o pendente sai se não mudou de novo. */
  async confirmarEnvio(enviados: Enviado[]): Promise<void> {
    if (!enviados.length) return;
    const ops = await this.gravarOps(
      enviados.map((e) => e.caminho),
      (atuais) => enviados.map((e) => ({ caminho: e.caminho, base: e.base, ...(atuais.get(e.caminho)?.versao === e.versao ? { pendente: null } : {}) })),
    );
    this.naMemoria(ops, false);
  }

  /** Primeira sincronização: tudo o que já existe aqui vai junto. */
  async marcarTudoPendente(em: string): Promise<void> {
    const ops = await this.gravarOps([], () => [...this.docs.keys()].map((caminho) => ({ caminho, pendente: { em, versao: novaVersao() } })));
    this.naMemoria(ops, false);
  }

  /** Desliga: os dados ficam; some o que a sincronização sabia (bases, pendentes, token). */
  async esquecerSincronizacao(): Promise<void> {
    await this.limparSinc();
    this.pendentes.clear();
    this.bases.clear();
  }

  private naMemoria(ops: Operacao[], avisarDocs: boolean) {
    for (const op of ops) {
      if (op.doc !== undefined) {
        if (op.doc) this.docs.set(op.caminho, op.doc);
        else this.docs.delete(op.caminho);
      }
      if (op.base !== undefined) {
        if (op.base) this.bases.set(op.caminho, op.base);
        else this.bases.delete(op.caminho);
      }
      if (op.pendente !== undefined) {
        if (op.pendente) this.pendentes.set(op.caminho, op.pendente);
        else this.pendentes.delete(op.caminho);
      }
    }
    if (!avisarDocs) return;
    for (const op of ops) {
      if (op.doc === undefined) continue;
      this.avisar(op.caminho);
      this.anunciar(op.caminho);
    }
  }
}

// ----------------------------------------------------------------- IndexedDB

const NOME = 'organizador-concursos';
const DOCS = 'documentos';
const PENDENTES = 'pendentes';
const BASES = 'bases';
const META = 'meta';

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function lerTabela<T>(idb: IDBDatabase, tabela: string): Promise<Map<string, T>> {
  const t = idb.transaction(tabela, 'readonly').objectStore(tabela);
  const [chaves, valores] = await Promise.all([pedido(t.getAllKeys()), pedido(t.getAll())]);
  return new Map(chaves.map((c, i) => [String(c), valores[i] as T]));
}

function erroDeGravacao(e: DOMException | null): ErroStore {
  const cheio = e?.name === 'QuotaExceededError';
  return {
    codigo: cheio ? 'quota_exceeded' : 'unavailable',
    mensagem: cheio
      ? 'O espaço do navegador para o app acabou. Exporte um backup em Configurações e apague registros antigos.'
      : 'Não consegui gravar neste aparelho. Recarregue a página e tente de novo.',
  };
}

/**
 * Banco do app instalado no IndexedDB. Abas abertas ao mesmo tempo se avisam pelo
 * BroadcastChannel. Na primeira abertura, traz o que havia no banco local (localStorage).
 */
export class IndexedDBStore extends BancoAparelho {
  private canal: BroadcastChannel | null = null;

  private constructor(
    private idb: IDBDatabase,
    docs: Map<string, Json>,
    pendentes: Map<string, Pendente>,
    bases: Map<string, Base>,
  ) {
    super();
    this.docs = docs;
    this.pendentes = pendentes;
    this.bases = bases;
    if (typeof BroadcastChannel === 'undefined') return;
    this.canal = new BroadcastChannel(NOME);
    this.canal.onmessage = (e: MessageEvent<{ caminho: string; dado: Json | null }>) => {
      const { caminho, dado } = e.data;
      if (dado) this.docs.set(caminho, dado);
      else this.docs.delete(caminho);
      this.avisar(caminho);
    };
  }

  static async abrir(chaveAntiga: string | null = CHAVE_LOCAL): Promise<IndexedDBStore> {
    const abertura = indexedDB.open(NOME, 2);
    abertura.onupgradeneeded = () => {
      const db = abertura.result;
      for (const t of [DOCS, PENDENTES, BASES, META]) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t);
    };
    const idb = await pedido(abertura);
    // Uma versão mais nova do app, aberta em outra aba, precisa atualizar o banco.
    idb.onversionchange = () => idb.close();
    const [docs, pendentes, bases] = await Promise.all([
      lerTabela<Json>(idb, DOCS),
      lerTabela<Pendente>(idb, PENDENTES),
      lerTabela<Base>(idb, BASES),
    ]);
    const store = new IndexedDBStore(idb, docs, pendentes, bases);
    if (!docs.size && chaveAntiga) await store.trazerDoLocalStorage(chaveAntiga);
    return store;
  }

  private async trazerDoLocalStorage(chave: string) {
    let salvo: Record<string, Json> | null = null;
    try {
      const texto = localStorage.getItem(chave);
      salvo = texto ? (JSON.parse(texto) as Record<string, Json>) : null;
    } catch {
      return;
    }
    if (!salvo) return;
    for (const [caminho, dado] of Object.entries(salvo)) this.docs.set(caminho, dado);
    await this.gravarOps([], () => Object.entries(salvo).map(([caminho, doc]) => ({ caminho, doc })));
    try {
      localStorage.removeItem(chave);
    } catch {
      // fica a cópia antiga; o IndexedDB já não está vazio, então ela não volta.
    }
  }

  protected override gravarOps(
    caminhos: string[],
    decidir: (pendentes: Map<string, Pendente | undefined>) => Operacao[],
  ): Promise<Operacao[]> {
    return new Promise((ok, falha) => {
      const tx = this.idb.transaction([DOCS, PENDENTES, BASES], 'readwrite');
      const docs = tx.objectStore(DOCS);
      const pendentes = tx.objectStore(PENDENTES);
      const bases = tx.objectStore(BASES);
      const atuais = new Map<string, Pendente | undefined>();
      let ops: Operacao[] = [];
      const escrever = () => {
        ops = decidir(atuais);
        for (const op of ops) {
          if (op.doc !== undefined) {
            if (op.doc) docs.put(op.doc, op.caminho);
            else docs.delete(op.caminho);
          }
          if (op.base !== undefined) {
            if (op.base) bases.put(op.base, op.caminho);
            else bases.delete(op.caminho);
          }
          if (op.pendente !== undefined) {
            if (op.pendente) pendentes.put(op.pendente, op.caminho);
            else pendentes.delete(op.caminho);
          }
        }
      };
      const unicos = [...new Set(caminhos)];
      let faltam = unicos.length;
      if (!faltam) escrever();
      for (const c of unicos) {
        const r = pendentes.get(c);
        r.onsuccess = () => {
          atuais.set(c, r.result as Pendente | undefined);
          if (--faltam === 0) escrever();
        };
      }
      tx.oncomplete = () => ok(ops);
      tx.onerror = tx.onabort = () => falha(erroDeGravacao(tx.error));
    });
  }

  protected override anunciar(caminho: string): void {
    this.canal?.postMessage({ caminho, dado: this.docs.get(caminho) ?? null });
  }

  override async recarregarSinc(): Promise<void> {
    const [pendentes, bases] = await Promise.all([lerTabela<Pendente>(this.idb, PENDENTES), lerTabela<Base>(this.idb, BASES)]);
    this.pendentes = pendentes;
    this.bases = bases;
  }

  protected override async limparSinc(): Promise<void> {
    const tx = this.idb.transaction([PENDENTES, BASES, META], 'readwrite');
    for (const t of [PENDENTES, BASES, META]) tx.objectStore(t).clear();
    await new Promise<void>((ok, falha) => {
      tx.oncomplete = () => ok();
      tx.onerror = tx.onabort = () => falha(erroDeGravacao(tx.error));
    });
  }

  override async lerMeta<T>(chave: string): Promise<T | undefined> {
    return (await pedido(this.idb.transaction(META, 'readonly').objectStore(META).get(chave))) as T | undefined;
  }

  override async gravarMeta(chave: string, valor: unknown): Promise<void> {
    const t = this.idb.transaction(META, 'readwrite').objectStore(META);
    if (valor === undefined) await pedido(t.delete(chave));
    else await pedido(t.put(valor, chave));
  }
}

/** O banco do aparelho, ou `null` se o IndexedDB não estiver disponível (ex.: navegação privada antiga). */
export async function abrirBancoDoAparelho(): Promise<IndexedDBStore | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return await IndexedDBStore.abrir();
  } catch {
    return null;
  }
}
