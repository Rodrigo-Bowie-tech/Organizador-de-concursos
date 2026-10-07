// Camada de armazenamento. No claude.ai, o banco do Artifact (`claude.use("db")`);
// no app instalado (GitHub Pages), o IndexedDB do aparelho; em desenvolvimento,
// testes e quando o banco não está disponível, um banco em memória que persiste
// no localStorage deste navegador.
// As implementações seguem a mesma semântica do banco do Artifact:
// `definir` substitui o documento; `mesclar` exige que ele exista, mescla
// objetos recursivamente e substitui arrays.

export type Json = Record<string, unknown>;

export interface ErroStore {
  codigo: string;
  mensagem: string;
}

export interface Store {
  /** claude: banco do Artifact; aparelho: IndexedDB do app instalado; local: localStorage (desenvolvimento). */
  readonly modo: 'claude' | 'aparelho' | 'local';
  assinarColecao(
    colecao: string,
    aoMudar: (docs: Map<string, Json>) => void,
    aoErro: (e: ErroStore) => void,
  ): () => void;
  assinarDoc(caminho: string, aoMudar: (dado: Json | null) => void, aoErro: (e: ErroStore) => void): () => void;
  definir(caminho: string, dado: Json): Promise<void>;
  mesclar(caminho: string, dado: Json): Promise<void>;
  remover(caminho: string): Promise<void>;
}

const MENSAGENS: Record<string, string> = {
  quota_exceeded:
    'O banco do app atingiu o limite de documentos. Exporte um backup em Configurações e apague registros antigos.',
  resource_exhausted: 'Muitas gravações em pouco tempo. Espere alguns segundos e tente de novo.',
  unavailable: 'O banco do claude.ai não respondeu. Confira a conexão e tente de novo.',
  revoked: 'O acesso ao banco foi encerrado nesta página. Recarregue a página.',
  invalid_argument: 'O registro não pôde ser gravado (dados inválidos ou grandes demais).',
};

export function erroStore(e: unknown): ErroStore {
  const codigo =
    typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : 'unavailable';
  return { codigo, mensagem: MENSAGENS[codigo] ?? MENSAGENS.unavailable };
}

function ehObjeto(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Mesclagem igual à do `update` do banco do Artifact. */
export function mesclarProfundo(base: Json, patch: Json): Json {
  const saida: Json = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    saida[k] = ehObjeto(v) && ehObjeto(base[k]) ? mesclarProfundo(base[k] as Json, v) : v;
  }
  return saida;
}

const clonar = <T>(v: T): T => structuredClone(v);

function colecaoDe(caminho: string): string {
  return caminho.split('/').slice(0, -1).join('/');
}

function idDe(caminho: string): string {
  return caminho.split('/').pop() as string;
}

// ------------------------------------------------------------ memória

export class MemoriaStore implements Store {
  readonly modo: Store['modo'] = 'local';
  protected docs = new Map<string, Json>();
  private ouvintesColecao = new Map<string, Set<(docs: Map<string, Json>) => void>>();
  private ouvintesDoc = new Map<string, Set<(dado: Json | null) => void>>();

  constructor(private chaveStorage: string | null = null) {
    if (chaveStorage) {
      try {
        const salvo = localStorage.getItem(chaveStorage);
        if (salvo) this.docs = new Map(Object.entries(JSON.parse(salvo) as Record<string, Json>));
      } catch {
        // localStorage indisponível: segue só em memória.
      }
    }
  }

  private colecao(nome: string): Map<string, Json> {
    const m = new Map<string, Json>();
    for (const [caminho, dado] of this.docs) {
      if (colecaoDe(caminho) === nome) m.set(idDe(caminho), clonar(dado));
    }
    return m;
  }

  /** Guarda a mudança fora da memória (aqui, no localStorage). */
  protected async persistir(_caminho: string): Promise<void> {
    if (!this.chaveStorage) return;
    try {
      localStorage.setItem(this.chaveStorage, JSON.stringify(Object.fromEntries(this.docs)));
    } catch {
      // idem
    }
  }

  protected avisar(caminho: string) {
    const dado = this.docs.get(caminho);
    for (const f of this.ouvintesDoc.get(caminho) ?? []) f(dado ? clonar(dado) : null);
    const col = colecaoDe(caminho);
    const ouvintes = this.ouvintesColecao.get(col);
    if (ouvintes?.size) {
      const docs = this.colecao(col);
      for (const f of ouvintes) f(docs);
    }
  }

  assinarColecao(colecao: string, aoMudar: (docs: Map<string, Json>) => void): () => void {
    const set = this.ouvintesColecao.get(colecao) ?? new Set();
    this.ouvintesColecao.set(colecao, set);
    set.add(aoMudar);
    queueMicrotask(() => set.has(aoMudar) && aoMudar(this.colecao(colecao)));
    return () => set.delete(aoMudar);
  }

  assinarDoc(caminho: string, aoMudar: (dado: Json | null) => void): () => void {
    const set = this.ouvintesDoc.get(caminho) ?? new Set();
    this.ouvintesDoc.set(caminho, set);
    set.add(aoMudar);
    queueMicrotask(() => {
      const dado = this.docs.get(caminho);
      if (set.has(aoMudar)) aoMudar(dado ? clonar(dado) : null);
    });
    return () => set.delete(aoMudar);
  }

  async definir(caminho: string, dado: Json): Promise<void> {
    this.docs.set(caminho, clonar(dado));
    this.avisar(caminho);
    await this.persistir(caminho);
  }

  async mesclar(caminho: string, dado: Json): Promise<void> {
    const atual = this.docs.get(caminho);
    if (!atual) throw { code: 'invalid_argument', message: `documento inexistente: ${caminho}` };
    this.docs.set(caminho, mesclarProfundo(atual, clonar(dado)));
    this.avisar(caminho);
    await this.persistir(caminho);
  }

  async remover(caminho: string): Promise<void> {
    if (!this.docs.delete(caminho)) return;
    this.avisar(caminho);
    await this.persistir(caminho);
  }

  /** Para testes: conteúdo cru do banco. */
  despejar(): Record<string, Json> {
    return clonar(Object.fromEntries(this.docs));
  }
}

// ------------------------------------------------- IndexedDB (app instalado)

const BANCO_APARELHO = 'organizador-concursos';
const TABELA = 'documentos';

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

/**
 * Banco do app instalado (GitHub Pages): os documentos ficam no IndexedDB do aparelho e
 * funcionam sem internet. Abas abertas ao mesmo tempo se avisam pelo BroadcastChannel.
 * Na primeira abertura, traz o que havia no banco local (localStorage).
 */
export class IndexedDBStore extends MemoriaStore {
  override readonly modo = 'aparelho' as const;
  private canal: BroadcastChannel | null = null;

  private constructor(
    private idb: IDBDatabase,
    docs: Map<string, Json>,
  ) {
    super(null);
    this.docs = docs;
    if (typeof BroadcastChannel === 'undefined') return;
    this.canal = new BroadcastChannel(BANCO_APARELHO);
    this.canal.onmessage = (e: MessageEvent<{ caminho: string; dado: Json | null }>) => {
      const { caminho, dado } = e.data;
      if (dado) this.docs.set(caminho, dado);
      else this.docs.delete(caminho);
      this.avisar(caminho);
    };
  }

  static async abrir(chaveAntiga: string | null = CHAVE_LOCAL): Promise<IndexedDBStore> {
    const abertura = indexedDB.open(BANCO_APARELHO, 1);
    abertura.onupgradeneeded = () => abertura.result.createObjectStore(TABELA);
    const idb = await pedido(abertura);
    const tabela = idb.transaction(TABELA, 'readonly').objectStore(TABELA);
    const [chaves, valores] = await Promise.all([pedido(tabela.getAllKeys()), pedido(tabela.getAll())]);
    const store = new IndexedDBStore(idb, new Map(chaves.map((c, i) => [String(c), valores[i] as Json])));
    if (!chaves.length && chaveAntiga) await store.trazerDoLocalStorage(chaveAntiga);
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
    await this.gravar([...this.docs.keys()]);
    try {
      localStorage.removeItem(chave);
    } catch {
      // fica a cópia antiga; o IndexedDB já não está vazio, então ela não volta.
    }
  }

  protected override async persistir(caminho: string): Promise<void> {
    const dado = this.docs.get(caminho) ?? null;
    await this.gravar([caminho]);
    this.canal?.postMessage({ caminho, dado });
  }

  private gravar(caminhos: string[]): Promise<void> {
    return new Promise((ok, falha) => {
      const tx = this.idb.transaction(TABELA, 'readwrite');
      const tabela = tx.objectStore(TABELA);
      for (const c of caminhos) {
        const dado = this.docs.get(c);
        if (dado) tabela.put(dado, c);
        else tabela.delete(c);
      }
      tx.oncomplete = () => ok();
      tx.onerror = tx.onabort = () => {
        const cheio = tx.error?.name === 'QuotaExceededError';
        falha({
          codigo: cheio ? 'quota_exceeded' : 'unavailable',
          mensagem: cheio
            ? 'O espaço do navegador para o app acabou. Exporte um backup em Configurações e apague registros antigos.'
            : 'Não consegui gravar neste aparelho. Recarregue a página e tente de novo.',
        } satisfies ErroStore);
      };
    });
  }
}

// ------------------------------------------------------ banco do claude.ai

// Tipos mínimos do banco do Artifact (contrato 0.2.60, ver db.d.ts).
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Json | undefined;
}
interface DocRef {
  set(d: Json): Promise<void>;
  update(d: Json): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, erro?: (e: unknown) => void): () => void;
}
interface ColRef {
  onSnapshot(next: (s: { docs: DocSnap[] }) => void, erro?: (e: unknown) => void): () => void;
}
export interface BancoArtifact {
  doc(caminho: string): DocRef;
  collection(caminho: string): ColRef;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ArtifactStore implements Store {
  readonly modo = 'claude' as const;
  /** Uma gravação por vez em cada documento, como o banco pede. */
  private filas = new Map<string, Promise<unknown>>();

  constructor(private db: BancoArtifact) {}

  private enfileirar(caminho: string, op: () => Promise<void>): Promise<void> {
    const tentar = async () => {
      try {
        await op();
      } catch (e) {
        if (erroStore(e).codigo !== 'unavailable') throw erroStore(e);
        await esperar(300 + Math.random() * 700);
        try {
          await op();
        } catch (e2) {
          throw erroStore(e2);
        }
      }
    };
    const anterior = this.filas.get(caminho) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(tentar);
    this.filas.set(caminho, atual);
    atual.finally(() => {
      if (this.filas.get(caminho) === atual) this.filas.delete(caminho);
    }).catch(() => undefined);
    return atual;
  }

  assinarColecao(
    colecao: string,
    aoMudar: (docs: Map<string, Json>) => void,
    aoErro: (e: ErroStore) => void,
  ): () => void {
    return this.db.collection(colecao).onSnapshot(
      (snap) => {
        const m = new Map<string, Json>();
        for (const d of snap.docs) if (d.exists) m.set(d.id, clonar(d.data() as Json));
        aoMudar(m);
      },
      (e) => aoErro(erroStore(e)),
    );
  }

  assinarDoc(caminho: string, aoMudar: (dado: Json | null) => void, aoErro: (e: ErroStore) => void): () => void {
    return this.db.doc(caminho).onSnapshot(
      (snap) => aoMudar(snap.exists ? clonar(snap.data() as Json) : null),
      (e) => aoErro(erroStore(e)),
    );
  }

  definir(caminho: string, dado: Json): Promise<void> {
    return this.enfileirar(caminho, () => this.db.doc(caminho).set(dado));
  }

  mesclar(caminho: string, dado: Json): Promise<void> {
    return this.enfileirar(caminho, () => this.db.doc(caminho).update(dado));
  }

  remover(caminho: string): Promise<void> {
    return this.enfileirar(caminho, () => this.db.doc(caminho).delete());
  }
}

interface ClaudeRuntime {
  use(nome: string): Promise<unknown>;
}

/** Pega um recurso do runtime do claude.ai, ou `null` fora dele. */
export async function recursoClaude<T>(nome: string): Promise<T | null> {
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (!claude?.use) return null;
  try {
    return ((await claude.use(nome)) as T | null) ?? null;
  } catch {
    return null;
  }
}

export const CHAVE_LOCAL = 'organizador-concursos:banco-local';

/**
 * Banco do claude.ai quando disponível; no app instalado (`aparelho`), o IndexedDB;
 * senão, o banco local do navegador.
 */
export async function abrirStore(aparelho = false): Promise<Store> {
  const db = await recursoClaude<BancoArtifact>('db');
  if (db) return new ArtifactStore(db);
  if (aparelho && typeof indexedDB !== 'undefined') {
    try {
      return await IndexedDBStore.abrir();
    } catch {
      // IndexedDB bloqueado (ex.: navegação privada antiga): segue com o localStorage.
    }
  }
  return new MemoriaStore(CHAVE_LOCAL);
}
