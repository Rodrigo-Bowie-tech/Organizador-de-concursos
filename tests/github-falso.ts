// GitHub de mentira para os testes da sincronização: imita só as rotas que o app usa
// (repositório, ref, árvore, blob, commit, contents) num repositório em memória, com os mesmos
// SHAs de blob do git. Serve aos testes unitários (`comoFetch`) e ao Playwright (`atender`).

import { createHash, randomBytes } from 'node:crypto';
import type { Route } from '@playwright/test';

interface Commit {
  arvore: string;
  pais: string[];
  mensagem: string;
}

type Resposta = { status: number; corpo: unknown };

export const shaGit = (texto: string): string => {
  const corpo = Buffer.from(texto, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${corpo.length}\0`), corpo])).digest('hex');
};

const novoSha = () => randomBytes(20).toString('hex');

export class GitHubFalso {
  readonly dono = 'Rodrigo-Bowie-tech';
  readonly nome = 'organizador-dados';
  readonly ramo = 'main';
  token = 'token-de-teste';
  /** Token que só lê (como um token sem "Contents: Read and write"). */
  somenteLeitura = false;
  ref: string | null = null;
  commits = new Map<string, Commit>();
  private arvores = new Map<string, Map<string, string>>();
  /** "MÉTODO /caminho" de cada pedido, para conferir quantos foram. */
  pedidos: string[] = [];
  /** Roda uma vez antes de mover o ramo (simula outro aparelho enviando no meio). */
  antesDeMoverRamo: (() => void) | null = null;

  /** Arquivos do último commit (caminho → texto). */
  arquivos(): Map<string, string> {
    return new Map(this.ref ? this.arvores.get(this.commits.get(this.ref)!.arvore) : []);
  }

  /** Commit feito direto no repositório (outro aparelho, ou alguém editando à mão). */
  commitar(mudancas: Record<string, string | null>, mensagem = 'outro aparelho'): string {
    const arvore = this.arquivos();
    for (const [p, t] of Object.entries(mudancas)) {
      if (t === null) arvore.delete(p);
      else arvore.set(p, t);
    }
    const shaArvore = novoSha();
    this.arvores.set(shaArvore, arvore);
    const sha = novoSha();
    this.commits.set(sha, { arvore: shaArvore, pais: this.ref ? [this.ref] : [], mensagem });
    this.ref = sha;
    return sha;
  }

  async responder(metodo: string, url: string, cabecalhos: Record<string, string>, corpoTexto?: string): Promise<Resposta> {
    const u = new URL(url);
    const prefixo = `/repos/${this.dono}/${this.nome}`;
    this.pedidos.push(`${metodo} ${u.pathname.replace(prefixo, '')}`);
    if (metodo === 'OPTIONS') return { status: 204, corpo: null };
    const auth = Object.entries(cabecalhos).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
    if (auth !== `Bearer ${this.token}`) return { status: 401, corpo: { message: 'Bad credentials' } };
    if (u.pathname.toLowerCase() !== prefixo.toLowerCase() && !u.pathname.toLowerCase().startsWith(`${prefixo.toLowerCase()}/`)) {
      return { status: 404, corpo: { message: 'Not Found' } };
    }
    const rota = u.pathname.slice(prefixo.length);
    const corpo = corpoTexto ? JSON.parse(corpoTexto) : undefined;
    const escrita = metodo !== 'GET';
    if (escrita && this.somenteLeitura) return { status: 403, corpo: { message: 'Resource not accessible by personal access token' } };

    if (metodo === 'GET' && rota === '') return { status: 200, corpo: { default_branch: this.ramo, private: true } };
    if (metodo === 'GET' && rota === `/git/ref/heads/${this.ramo}`) {
      return this.ref ? { status: 200, corpo: { object: { sha: this.ref } } } : { status: 409, corpo: { message: 'Git Repository is empty.' } };
    }
    if (metodo === 'PUT' && rota.startsWith('/contents/')) {
      const caminho = decodeURIComponent(rota.slice('/contents/'.length));
      if (this.arquivos().has(caminho)) return { status: 422, corpo: { message: 'sha wasn\'t supplied' } };
      const sha = this.commitar({ [caminho]: Buffer.from(corpo.content, 'base64').toString('utf8') }, corpo.message);
      return { status: 201, corpo: { commit: { sha } } };
    }
    let m = /^\/git\/commits\/(\w+)$/.exec(rota);
    if (metodo === 'GET' && m) {
      const c = this.commits.get(m[1]);
      return c ? { status: 200, corpo: { sha: m[1], tree: { sha: c.arvore }, parents: c.pais.map((sha) => ({ sha })) } } : { status: 404, corpo: {} };
    }
    m = /^\/git\/trees\/(\w+)$/.exec(rota);
    if (metodo === 'GET' && m) {
      const arvore = this.arvores.get(m[1]);
      if (!arvore) return { status: 404, corpo: {} };
      const pastas = new Set<string>();
      for (const p of arvore.keys()) {
        const partes = p.split('/');
        for (let i = 1; i < partes.length; i++) pastas.add(partes.slice(0, i).join('/'));
      }
      const itens = [
        ...[...pastas].map((path) => ({ path, mode: '040000', type: 'tree', sha: novoSha() })),
        ...[...arvore].map(([path, texto]) => ({ path, mode: '100644', type: 'blob', sha: shaGit(texto), size: Buffer.byteLength(texto) })),
      ];
      return { status: 200, corpo: { sha: m[1], tree: itens, truncated: false } };
    }
    m = /^\/git\/blobs\/(\w+)$/.exec(rota);
    if (metodo === 'GET' && m) {
      for (const arvore of this.arvores.values()) {
        for (const texto of arvore.values()) {
          if (shaGit(texto) !== m[1]) continue;
          const b64 = Buffer.from(texto, 'utf8').toString('base64').replace(/.{60}/g, '$&\n');
          return { status: 200, corpo: { sha: m[1], encoding: 'base64', content: b64 } };
        }
      }
      return { status: 404, corpo: {} };
    }
    if (metodo === 'POST' && rota === '/git/trees') {
      const base = this.arvores.get(corpo.base_tree);
      if (!base) return { status: 422, corpo: { message: 'base_tree inválida' } };
      const arvore = new Map(base);
      for (const item of corpo.tree as { path: string; sha?: string | null; content?: string }[]) {
        if (item.sha === null) {
          if (!arvore.has(item.path)) return { status: 422, corpo: { message: `${item.path} não existe` } };
          arvore.delete(item.path);
        } else arvore.set(item.path, item.content ?? '');
      }
      const sha = novoSha();
      this.arvores.set(sha, arvore);
      return { status: 201, corpo: { sha } };
    }
    if (metodo === 'POST' && rota === '/git/commits') {
      const sha = novoSha();
      this.commits.set(sha, { arvore: corpo.tree, pais: corpo.parents, mensagem: corpo.message });
      return { status: 201, corpo: { sha } };
    }
    if (metodo === 'PATCH' && rota === `/git/refs/heads/${this.ramo}`) {
      const antes = this.antesDeMoverRamo;
      this.antesDeMoverRamo = null;
      antes?.();
      const c = this.commits.get(corpo.sha);
      if (!c || (!corpo.force && c.pais[0] !== this.ref)) return { status: 422, corpo: { message: 'Update is not a fast forward' } };
      this.ref = corpo.sha;
      return { status: 200, corpo: { object: { sha: corpo.sha } } };
    }
    return { status: 404, corpo: { message: `rota não simulada: ${metodo} ${rota}` } };
  }

  /** Para o Sincronizador nos testes unitários. */
  comoFetch(): (url: string, init?: RequestInit) => Promise<Response> {
    return async (url, init) => {
      const r = await this.responder(init?.method ?? 'GET', url, (init?.headers as Record<string, string>) ?? {}, init?.body as string | undefined);
      return new Response(r.corpo === null ? null : JSON.stringify(r.corpo), { status: r.status, headers: { 'content-type': 'application/json' } });
    };
  }

  /** Para `context.route('https://api.github.com/**', ...)` no Playwright. */
  async atender(rota: Route): Promise<void> {
    const p = rota.request();
    const r = await this.responder(p.method(), p.url(), await p.allHeaders(), p.postData() ?? undefined);
    await rota.fulfill({
      status: r.status,
      contentType: 'application/json',
      body: r.corpo === null ? '' : JSON.stringify(r.corpo),
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, x-github-api-version, accept',
        'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
      },
    });
  }
}
