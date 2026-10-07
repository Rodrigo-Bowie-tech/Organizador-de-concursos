// Cliente mínimo da API do GitHub para o repositório de dados (Fase 9). Usa a API Git Data:
// lê a árvore do último commit e os arquivos que mudaram; envia tudo o que mudou num commit
// só e move o ramo apenas se ninguém enviou nada no meio (sem `force`).
// O token é o do usuário, guardado só no aparelho; aqui ele só vai no cabeçalho.

import { PASTA_DADOS, caminhoDe } from './juntar';

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

export class ErroGitHub extends Error {
  constructor(
    readonly status: number,
    readonly limiteDeUso: boolean,
    detalhe: string,
  ) {
    super(`GitHub ${status}: ${detalhe}`);
  }
}

export interface ArvoreRemota {
  arvore: string;
  /** caminho do documento → SHA do arquivo. */
  arquivos: Map<string, string>;
}

const API = 'https://api.github.com';

function paraBase64(texto: string): string {
  let binario = '';
  for (const b of new TextEncoder().encode(texto)) binario += String.fromCharCode(b);
  return btoa(binario);
}

function deBase64(b64: string): string {
  const binario = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

export class ClienteGitHub {
  readonly dono: string;
  readonly nome: string;

  constructor(
    repositorio: string,
    private token: string,
    private buscar: Buscar = (url, init) => fetch(url, init),
  ) {
    [this.dono, this.nome] = repositorio.split('/');
  }

  private async pedir<T>(caminho: string, init: { method?: string; corpo?: unknown } = {}, aceitar: number[] = []): Promise<T | null> {
    const r = await this.buscar(`${API}/repos/${this.dono}/${this.nome}${caminho}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        ...(init.corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.corpo !== undefined ? JSON.stringify(init.corpo) : undefined,
    });
    if (aceitar.includes(r.status)) return null;
    if (!r.ok) throw new ErroGitHub(r.status, r.headers.get('x-ratelimit-remaining') === '0', await r.text().catch(() => ''));
    return (await r.json()) as T;
  }

  /** Ramo padrão do repositório (também confere se ele existe e se o token chega até ele). */
  async ramoPadrao(): Promise<string> {
    const r = await this.pedir<{ default_branch: string }>('');
    return r?.default_branch ?? 'main';
  }

  /** SHA do último commit do ramo; `null` se o repositório ainda está vazio. */
  async commitDoRamo(ramo: string): Promise<string | null> {
    const r = await this.pedir<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(ramo)}`, {}, [404, 409]);
    return r?.object.sha ?? null;
  }

  /** Primeiro commit de um repositório vazio (a API Git Data não funciona antes dele). */
  async iniciar(ramo: string): Promise<string> {
    const texto =
      '# Dados do Organizador de Concursos\n\nSincronizados pelo app (Configurações › Sincronizar com o GitHub). ' +
      'Não edite à mão: cada arquivo em `dados/` é um registro do app.\n';
    await this.pedir('/contents/LEIAME.md', { method: 'PUT', corpo: { message: 'Começa os dados do Organizador', content: paraBase64(texto), branch: ramo } }, [422]);
    const commit = await this.commitDoRamo(ramo);
    if (!commit) throw new ErroGitHub(409, false, 'repositório continua vazio');
    return commit;
  }

  async arvore(commit: string): Promise<ArvoreRemota> {
    const c = await this.pedir<{ tree: { sha: string } }>(`/git/commits/${commit}`);
    const t = await this.pedir<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(`/git/trees/${c!.tree.sha}?recursive=1`);
    const arquivos = new Map<string, string>();
    for (const item of t!.tree) {
      if (item.type !== 'blob' || !item.path.startsWith(PASTA_DADOS)) continue;
      const caminho = caminhoDe(item.path);
      if (caminho) arquivos.set(caminho, item.sha);
    }
    return { arvore: c!.tree.sha, arquivos };
  }

  async lerArquivo(sha: string): Promise<string> {
    const b = await this.pedir<{ content: string; encoding: string }>(`/git/blobs/${sha}`);
    return b!.encoding === 'base64' ? deBase64(b!.content) : b!.content;
  }

  /**
   * Um commit com os arquivos mudados (`texto: null` apaga) em cima de `commit`. Devolve o SHA
   * do commit novo, ou `null` se o ramo andou no meio (outro aparelho enviou antes).
   */
  async enviar(ramo: string, commit: string, arvore: string, arquivos: { arquivo: string; texto: string | null }[], mensagem: string): Promise<string | null> {
    const novaArvore = await this.pedir<{ sha: string }>('/git/trees', {
      method: 'POST',
      corpo: {
        base_tree: arvore,
        tree: arquivos.map((a) =>
          a.texto === null ? { path: a.arquivo, mode: '100644', type: 'blob', sha: null } : { path: a.arquivo, mode: '100644', type: 'blob', content: a.texto },
        ),
      },
    });
    const novo = await this.pedir<{ sha: string }>('/git/commits', { method: 'POST', corpo: { message: mensagem, tree: novaArvore!.sha, parents: [commit] } });
    const movido = await this.pedir(`/git/refs/heads/${encodeURIComponent(ramo)}`, { method: 'PATCH', corpo: { sha: novo!.sha, force: false } }, [409, 422]);
    return movido ? novo!.sha : null;
  }
}
