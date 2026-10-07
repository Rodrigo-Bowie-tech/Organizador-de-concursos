import { beforeEach, describe, expect, it } from 'vitest';
import { BancoAparelho } from '../../src/dados/aparelho';
import { arquivoDe, lerArquivoDados, serializar } from '../../src/dados/juntar';
import { Sincronizador } from '../../src/dados/sincronizacao';
import { GitHubFalso } from '../github-falso';

const REPO = 'Rodrigo-Bowie-tech/organizador-dados';
let gh: GitHubFalso;
let tempo: number;
// Um relógio só para os dois aparelhos: cada leitura anda 1 s (ordem previsível nos conflitos).
const relogio = () => new Date((tempo += 1000));

function aparelho() {
  const banco = new BancoAparelho(relogio);
  return { banco, sinc: new Sincronizador(banco, gh.comoFetch(), relogio) };
}

const sessao = (id: string, min: number) => ({ id, inicio: '2026-10-07T20:00:00.000Z', segundosLiquidos: min * 60 });
const remoto = (caminho: string) => {
  const t = gh.arquivos().get(arquivoDe(caminho));
  return t ? lerArquivoDados(t)?.dado : undefined;
};

beforeEach(() => {
  gh = new GitHubFalso();
  tempo = Date.parse('2026-10-07T12:00:00.000Z');
});

describe('sincronização pelo GitHub', () => {
  it('o primeiro aparelho começa o repositório vazio e envia tudo; o segundo recebe', async () => {
    const a = aparelho();
    await a.banco.definir('concursos/embu', { id: 'embu', nome: 'Embu das Artes' });
    await a.banco.definir('sessoes/2026-10-04', { semana: '2026-10-04', itens: { s1: sessao('s1', 60) } });
    expect(await a.sinc.ligar(REPO, gh.token)).toBe(true);
    expect([...gh.arquivos().keys()].sort()).toEqual(['LEIAME.md', 'dados/concursos/embu.json', 'dados/sessoes/2026-10-04.json']);
    expect(remoto('concursos/embu')).toEqual({ id: 'embu', nome: 'Embu das Artes' });
    expect(a.banco.pendentesAtuais().size).toBe(0);
    expect(a.sinc.estado).toMatchObject({ situacao: 'ok', repositorio: REPO });
    // O token nunca vai para o repositório.
    for (const texto of gh.arquivos().values()) expect(texto).not.toContain(gh.token);

    const b = aparelho();
    expect(await b.sinc.ligar(REPO, gh.token)).toBe(true);
    expect(b.banco.doc('sessoes/2026-10-04')).toEqual({ semana: '2026-10-04', itens: { s1: sessao('s1', 60) } });
    expect(b.banco.pendentesAtuais().size).toBe(0);
  });

  it('sessões lançadas nos dois aparelhos na mesma semana ficam as duas', async () => {
    const a = aparelho();
    const b = aparelho();
    await a.banco.definir('sessoes/2026-10-04', { semana: '2026-10-04', itens: { s1: sessao('s1', 60) } });
    await a.sinc.ligar(REPO, gh.token);
    await b.sinc.ligar(REPO, gh.token);

    await a.banco.mesclar('sessoes/2026-10-04', { itens: { s2: sessao('s2', 30) } });
    await b.banco.mesclar('sessoes/2026-10-04', { itens: { s3: sessao('s3', 45) } }); // b sem internet
    await a.sinc.sincronizar();
    await b.sinc.sincronizar();
    await a.sinc.sincronizar();

    const esperado = { semana: '2026-10-04', itens: { s1: sessao('s1', 60), s2: sessao('s2', 30), s3: sessao('s3', 45) } };
    expect(a.banco.doc('sessoes/2026-10-04')).toEqual(esperado);
    expect(b.banco.doc('sessoes/2026-10-04')).toEqual(esperado);
    expect(remoto('sessoes/2026-10-04')).toEqual(esperado);
  });

  it('o mesmo registro mudado nos dois: vale a mudança mais nova', async () => {
    const a = aparelho();
    const b = aparelho();
    await a.banco.definir('config/geral', { metaDiariaMin: 60, tema: 'claro' });
    await a.sinc.ligar(REPO, gh.token);
    await b.sinc.ligar(REPO, gh.token);
    await a.banco.mesclar('config/geral', { metaDiariaMin: 90 });
    await b.banco.mesclar('config/geral', { metaDiariaMin: 120 }); // depois
    await a.sinc.sincronizar();
    await b.sinc.sincronizar();
    await a.sinc.sincronizar();
    expect(a.banco.doc('config/geral')).toEqual({ metaDiariaMin: 120, tema: 'claro' });
    expect(b.banco.doc('config/geral')).toEqual({ metaDiariaMin: 120, tema: 'claro' });
  });

  it('exclusão chega no outro aparelho', async () => {
    const a = aparelho();
    const b = aparelho();
    await a.banco.definir('simulados/x', { id: 'x', dia: '2026-10-11' });
    await a.sinc.ligar(REPO, gh.token);
    await b.sinc.ligar(REPO, gh.token);
    await a.banco.remover('simulados/x');
    await a.sinc.sincronizar();
    expect(gh.arquivos().has('dados/simulados/x.json')).toBe(false);
    await b.sinc.sincronizar();
    expect(b.banco.doc('simulados/x')).toBeUndefined();
  });

  it('sem nada novo, a cada minuto é uma consulta só', async () => {
    const a = aparelho();
    await a.banco.definir('concursos/embu', { id: 'embu' });
    await a.sinc.ligar(REPO, gh.token);
    gh.pedidos = [];
    await a.sinc.sincronizar();
    expect(gh.pedidos).toEqual(['GET /git/ref/heads/main']);
  });

  it('outro aparelho enviou no meio do envio: recomeça e junta os dois', async () => {
    const a = aparelho();
    await a.banco.definir('concursos/embu', { id: 'embu' });
    await a.sinc.ligar(REPO, gh.token);
    await a.banco.definir('simulados/meu', { id: 'meu' });
    gh.antesDeMoverRamo = () => gh.commitar({ [arquivoDe('simulados/outro')]: serializar({ em: '2026-10-07T13:00:00.000Z', dado: { id: 'outro' } }) });
    await a.sinc.sincronizar();
    expect(a.sinc.estado.situacao).toBe('ok');
    expect(remoto('simulados/meu')).toEqual({ id: 'meu' });
    expect(remoto('simulados/outro')).toEqual({ id: 'outro' });
    expect(a.banco.doc('simulados/outro')).toEqual({ id: 'outro' });
  });

  it('o que é editado aqui durante a sincronização não se perde', async () => {
    const a = aparelho();
    const b = aparelho();
    await a.banco.definir('sessoes/2026-10-04', { semana: '2026-10-04', itens: { s1: sessao('s1', 60) } });
    await a.sinc.ligar(REPO, gh.token);
    await b.sinc.ligar(REPO, gh.token);
    await a.banco.mesclar('sessoes/2026-10-04', { itens: { s2: sessao('s2', 30) } });
    await a.sinc.sincronizar();

    // b recebe s2 e, enquanto baixa, lança s3 na mesma semana.
    const buscar = gh.comoFetch();
    let editou = false;
    const bComEdicao = new Sincronizador(
      b.banco,
      async (url, init) => {
        if (!editou && url.includes('/git/blobs/')) {
          editou = true;
          await b.banco.mesclar('sessoes/2026-10-04', { itens: { s3: sessao('s3', 45) } });
        }
        return buscar(url, init);
      },
      relogio,
    );
    await bComEdicao.sincronizar();
    expect(editou).toBe(true);
    const esperado = { semana: '2026-10-04', itens: { s1: sessao('s1', 60), s2: sessao('s2', 30), s3: sessao('s3', 45) } };
    expect(b.banco.doc('sessoes/2026-10-04')).toEqual(esperado);
    expect(remoto('sessoes/2026-10-04')).toEqual(esperado);
  });

  it('plano mudado nos dois lados avisa para replanejar', async () => {
    const a = aparelho();
    const b = aparelho();
    await a.banco.definir('plano/2026-10-04', { semana: '2026-10-04', itens: {} });
    await a.sinc.ligar(REPO, gh.token);
    await b.sinc.ligar(REPO, gh.token);
    await a.banco.mesclar('plano/2026-10-04', { itens: { p1: { id: 'p1' } } });
    await b.banco.mesclar('plano/2026-10-04', { itens: { p2: { id: 'p2' } } });
    await a.sinc.sincronizar();
    const juntados: string[][] = [];
    b.sinc.aoJuntar((c) => juntados.push(c));
    await b.sinc.sincronizar();
    expect(juntados).toEqual([['plano/2026-10-04']]);
  });

  it('erros viram mensagens claras e nada se perde', async () => {
    const a = aparelho();
    await a.banco.definir('concursos/embu', { id: 'embu' });
    expect(await a.sinc.ligar(REPO, 'token-errado')).toBe(false);
    expect(a.sinc.estado).toMatchObject({ situacao: 'erro', mensagem: expect.stringContaining('recusou o token') });

    expect(await a.sinc.ligar('Rodrigo-Bowie-tech/nao-existe', gh.token)).toBe(false);
    expect(a.sinc.estado.mensagem).toContain('Não achei o repositório');

    gh.somenteLeitura = true;
    expect(await a.sinc.ligar(REPO, gh.token)).toBe(false);
    expect(a.sinc.estado.mensagem).toContain('Contents: Read and write');

    expect(await a.sinc.ligar('sem barra', gh.token)).toBe(false);
    expect(a.sinc.estado.mensagem).toContain('dono/nome');

    // Sem internet: fica pendente e vai quando voltar.
    gh.somenteLeitura = false;
    const semRede = new Sincronizador(a.banco, async () => Promise.reject(new TypeError('Failed to fetch')), relogio);
    await a.banco.gravarMeta('github', { repositorio: REPO, token: gh.token });
    await semRede.sincronizar();
    expect(semRede.estado.situacao).toBe('sem_internet');
    expect(a.banco.pendentesAtuais().has('concursos/embu')).toBe(true);
    expect(await a.sinc.ligar(REPO, gh.token)).toBe(true);
    expect(remoto('concursos/embu')).toEqual({ id: 'embu' });
  });

  it('desligar mantém os dados e esquece o token', async () => {
    const a = aparelho();
    await a.banco.definir('concursos/embu', { id: 'embu' });
    await a.sinc.ligar(REPO, gh.token);
    await a.sinc.desligar();
    expect(a.banco.doc('concursos/embu')).toEqual({ id: 'embu' });
    expect(await a.banco.lerMeta('github')).toBeUndefined();
    expect(a.sinc.estado.situacao).toBe('desligada');
  });
});
