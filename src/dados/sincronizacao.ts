// Sincronização entre aparelhos pelo GitHub (Fase 9, etapa 3). Cada aparelho guarda os dados
// no próprio banco (aparelho.ts) e, com internet, troca com um repositório privado:
//   1. lê o último commit do ramo; se mudou desde a última vez, baixa os arquivos que mudaram;
//   2. o que não mudou aqui é só copiado; o que mudou dos dois lados é juntado (juntar.ts);
//   3. envia num commit só o que mudou aqui; se outro aparelho enviou no meio, recomeça.
// Roda ao abrir, alguns segundos depois de cada gravação, a cada minuto com o app na tela e ao
// voltar a internet. Uma sincronização por vez no aparelho (Web Locks, entre abas).

import type { BancoAparelho, Enviado, MudancaDaNuvem } from './aparelho';
import { novaVersao } from './aparelho';
import { ClienteGitHub, ErroGitHub } from './github';
import type { Buscar } from './github';
import { arquivoDe, igual, juntar3, lerArquivoDados, serializar, shaDoBlob } from './juntar';
import type { ArquivoDados } from './juntar';

export type SituacaoSinc = 'desligada' | 'sincronizando' | 'ok' | 'sem_internet' | 'erro';

export interface EstadoSinc {
  situacao: SituacaoSinc;
  repositorio: string | null;
  /** Última sincronização completa (ISO). */
  ultimaEm: string | null;
  mensagem: string | null;
}

interface ConfigGitHub {
  repositorio: string;
  token: string;
  ramo?: string;
}

export const REPOSITORIO_VALIDO = /^[\w.-]+\/[\w.-]+$/;
const ESPERA_DEPOIS_DE_GRAVAR = 3000;
const INTERVALO = 60_000;
const TENTATIVAS = 3;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Até `n` pedidos ao mesmo tempo. */
async function emParalelo<T, R>(itens: T[], n: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhar = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await f(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhar));
  return saida;
}

function nomeDoAparelho(): string {
  const ua = globalThis.navigator?.userAgent ?? '';
  if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'navegador';
}

export function mensagemDoErro(e: unknown): Pick<EstadoSinc, 'situacao' | 'mensagem'> {
  if (e instanceof ErroGitHub) {
    if (e.status === 401) return { situacao: 'erro', mensagem: 'O GitHub recusou o token (expirou ou foi apagado). Gere outro e troque em Configurações.' };
    if (e.status === 403 && e.limiteDeUso) return { situacao: 'erro', mensagem: 'O GitHub limitou os pedidos por agora. Tento de novo em alguns minutos.' };
    if (e.status === 403) return { situacao: 'erro', mensagem: 'O token não pode gravar nesse repositório. Gere outro com "Contents: Read and write" para ele.' };
    if (e.status === 404) return { situacao: 'erro', mensagem: 'Não achei o repositório. Confira o nome (dono/repositório) e se o token tem acesso a ele.' };
    return { situacao: 'erro', mensagem: `O GitHub não respondeu como esperado (código ${e.status}). Tento de novo em 1 minuto.` };
  }
  const deRede = e instanceof TypeError && /fetch|network|load failed|internet/i.test(e.message);
  if (deRede || globalThis.navigator?.onLine === false) {
    return { situacao: 'sem_internet', mensagem: 'Sem internet: as mudanças ficam guardadas aqui e vão quando a conexão voltar.' };
  }
  return { situacao: 'erro', mensagem: e instanceof Error ? e.message : 'A sincronização falhou. Tento de novo em 1 minuto.' };
}

export class Sincronizador {
  private atual: EstadoSinc = { situacao: 'desligada', repositorio: null, ultimaEm: null, mensagem: null };
  private ouvintes = new Set<() => void>();
  private ouvintesJuntar = new Set<(caminhos: string[]) => void>();
  private emAndamento: Promise<void> | null = null;
  private deNovo = false;
  private agendada: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private banco: BancoAparelho,
    private buscar?: Buscar,
    private relogio: () => Date = () => new Date(),
  ) {}

  get estado(): EstadoSinc {
    return this.atual;
  }

  /** Para o React (`useSyncExternalStore`). */
  assinar = (f: () => void): (() => void) => {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  };

  /** Avisa quando documentos mudados dos dois lados foram juntados (ex.: replanejar). */
  aoJuntar(f: (caminhos: string[]) => void): () => void {
    this.ouvintesJuntar.add(f);
    return () => this.ouvintesJuntar.delete(f);
  }

  private mudar(parte: Partial<EstadoSinc>) {
    this.atual = { ...this.atual, ...parte };
    for (const f of this.ouvintes) f();
  }

  /** Lê a configuração, liga os gatilhos e faz a primeira sincronização (esperando no máximo `esperarMs`). */
  async iniciar(esperarMs = 4000): Promise<void> {
    const cfg = await this.banco.lerMeta<ConfigGitHub>('github');
    const ultimaEm = (await this.banco.lerMeta<string>('ultimaSincronizacao')) ?? null;
    this.mudar({ situacao: cfg ? 'ok' : 'desligada', repositorio: cfg?.repositorio ?? null, ultimaEm });
    this.banco.aoGravarLocal(() => this.agendar(ESPERA_DEPOIS_DE_GRAVAR));
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.sincronizar());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.sincronizar();
      });
      setInterval(() => {
        if (document.visibilityState === 'visible') void this.sincronizar();
      }, INTERVALO);
    }
    if (cfg) await Promise.race([this.sincronizar(), esperar(esperarMs)]);
  }

  private agendar(ms: number) {
    if (this.agendada) clearTimeout(this.agendada);
    this.agendada = setTimeout(() => {
      this.agendada = null;
      void this.sincronizar();
    }, ms);
  }

  /** Liga (ou troca o token) e sincroniza. Devolve `true` se deu certo. */
  async ligar(repositorio: string, token: string): Promise<boolean> {
    repositorio = repositorio.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!REPOSITORIO_VALIDO.test(repositorio)) {
      this.mudar({ situacao: 'erro', mensagem: 'Escreva o repositório como dono/nome, por exemplo Rodrigo-Bowie-tech/organizador-dados.' });
      return false;
    }
    const anterior = await this.banco.lerMeta<ConfigGitHub>('github');
    if (anterior && anterior.repositorio.toLowerCase() !== repositorio.toLowerCase()) await this.banco.esquecerSincronizacao();
    await this.banco.gravarMeta('github', { repositorio, token: token.trim() } satisfies ConfigGitHub);
    // Primeira vez com este repositório: tudo o que há aqui vai junto. Em conflito, vale o que já
    // está no GitHub (data vazia perde o desempate).
    if (!(await this.banco.lerMeta<string>('commit'))) await this.banco.marcarTudoPendente('');
    this.mudar({ repositorio, situacao: 'ok', mensagem: null });
    await this.sincronizar();
    return this.atual.situacao === 'ok';
  }

  /** Para de sincronizar. Os dados continuam no aparelho. */
  async desligar(): Promise<void> {
    await this.banco.esquecerSincronizacao();
    this.mudar({ situacao: 'desligada', repositorio: null, ultimaEm: null, mensagem: null });
  }

  /** Sincroniza agora (se já houver uma em andamento, faz mais uma logo depois). */
  sincronizar(): Promise<void> {
    if (this.emAndamento) {
      this.deNovo = true;
      return this.emAndamento;
    }
    this.emAndamento = (async () => {
      do {
        this.deNovo = false;
        await this.comTrava(() => this.ciclo());
      } while (this.deNovo);
    })().finally(() => {
      this.emAndamento = null;
    });
    return this.emAndamento;
  }

  private comTrava(f: () => Promise<void>): Promise<void> {
    const travas = (globalThis.navigator as Navigator | undefined)?.locks;
    return travas ? travas.request('organizador-sincronizacao', f) : f();
  }

  private async ciclo(): Promise<void> {
    const cfg = await this.banco.lerMeta<ConfigGitHub>('github');
    if (!cfg) return;
    this.mudar({ situacao: 'sincronizando' });
    try {
      await this.banco.recarregarSinc();
      const gh = new ClienteGitHub(cfg.repositorio, cfg.token, this.buscar);
      if (!cfg.ramo) {
        cfg.ramo = await gh.ramoPadrao();
        await this.banco.gravarMeta('github', cfg);
      }
      const juntados = new Set<string>();
      for (let tentativa = 1; !(await this.passo(gh, cfg.ramo, juntados)); tentativa++) {
        if (tentativa >= TENTATIVAS) throw new Error('Outro aparelho enviou mudanças várias vezes seguidas. Tento de novo em 1 minuto.');
      }
      if (juntados.size) for (const f of this.ouvintesJuntar) f([...juntados]);
      const agora = this.relogio().toISOString();
      await this.banco.gravarMeta('ultimaSincronizacao', agora);
      this.mudar({ situacao: 'ok', ultimaEm: agora, mensagem: null });
    } catch (e) {
      this.mudar(mensagemDoErro(e));
    }
  }

  /** Traz, junta e envia. Devolve `false` se o ramo andou no meio do envio (tentar de novo). */
  private async passo(gh: ClienteGitHub, ramo: string, juntados: Set<string>): Promise<boolean> {
    const commit = (await gh.commitDoRamo(ramo)) ?? (await gh.iniciar(ramo));
    const ultimo = await this.banco.lerMeta<string>('commit');
    if (commit === ultimo && !this.banco.pendentesAtuais().size) return true;
    const { arvore, arquivos } = await gh.arvore(commit);

    if (commit !== ultimo) {
      const bases = this.banco.basesAtuais();
      const pendentes = this.banco.pendentesAtuais();
      const mudaram = [...new Set([...arquivos.keys(), ...bases.keys()])].filter((c) => arquivos.get(c) !== bases.get(c)?.sha);
      const remotos = await emParalelo(mudaram, 6, async (c) => {
        const sha = arquivos.get(c);
        return sha ? lerArquivoDados(await gh.lerArquivo(sha)) : null;
      });
      const mudancas: MudancaDaNuvem[] = mudaram.map((caminho, i) => {
        const remoto: ArquivoDados | null = remotos[i];
        const sha = arquivos.get(caminho);
        const base = remoto && sha ? { sha, dado: remoto.dado } : null;
        const p = pendentes.get(caminho);
        if (!p) return { caminho, doc: remoto?.dado ?? null, base, pendente: null, versaoEsperada: null };
        // Mudou dos dois lados: junta a partir da base comum.
        juntados.add(caminho);
        const junto = juntar3(bases.get(caminho)?.dado, this.banco.doc(caminho), remoto?.dado, p.em > (remoto?.em ?? ''));
        const pendente = igual(junto, remoto?.dado) ? null : { em: this.relogio().toISOString(), versao: novaVersao() };
        return { caminho, doc: junto ?? null, base, pendente, versaoEsperada: p.versao };
      });
      await this.banco.aplicarDaNuvem(mudancas);
    }

    const pendentes = this.banco.pendentesAtuais();
    // Mudou lá e ainda não foi juntado aqui (ex.: editado durante esta sincronização): traz de novo.
    const bases = this.banco.basesAtuais();
    if ([...pendentes.keys()].some((c) => arquivos.get(c) !== bases.get(c)?.sha)) return false;
    const agora = this.relogio().toISOString();
    const envio = await Promise.all(
      [...pendentes].map(async ([caminho, p]) => {
        const dado = this.banco.doc(caminho) ?? null;
        const texto = dado ? serializar({ em: p.em || agora, dado }) : null;
        return { caminho, versao: p.versao, dado, texto, sha: texto ? await shaDoBlob(texto) : null };
      }),
    );
    // Só vai para o commit o que é diferente do que já está lá.
    const mudados = envio.filter((e) => (e.sha ? e.sha !== arquivos.get(e.caminho) : arquivos.has(e.caminho)));
    let novo = commit;
    if (mudados.length) {
      const mensagem = `${mudados.length === 1 ? '1 registro' : `${mudados.length} registros`} (${nomeDoAparelho()})`;
      const enviado = await gh.enviar(ramo, commit, arvore, mudados.map((e) => ({ arquivo: arquivoDe(e.caminho), texto: e.texto })), mensagem);
      if (!enviado) return false;
      novo = enviado;
    }
    await this.banco.confirmarEnvio(envio.map((e): Enviado => ({ caminho: e.caminho, versao: e.versao, base: e.dado && e.sha ? { sha: e.sha, dado: e.dado } : null })));
    await this.banco.gravarMeta('commit', novo);
    return true;
  }
}
