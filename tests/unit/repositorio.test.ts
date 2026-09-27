import { beforeEach, describe, expect, it } from 'vitest';
import { chaveSemana, Repositorio } from '../../src/dados/repositorio';
import { MemoriaStore, mesclarProfundo } from '../../src/dados/store';
import { segundosLiquidos } from '../../src/dominio/cronometro';

let agora = new Date('2026-09-27T23:00:00Z'); // 20:00 em SP, domingo
const relogio = () => agora;
const avancar = (min: number) => (agora = new Date(agora.getTime() + min * 60_000));

async function novoRepo(store = new MemoriaStore()) {
  const repo = new Repositorio(store, relogio);
  repo.iniciar();
  await repo.pronto();
  return { repo, store };
}

async function concursoComDisciplina(repo: Repositorio) {
  const concursoId = await repo.salvarConcurso({
    nome: 'Fundação Florestal SP',
    orgao: 'Fundação Florestal',
    banca: 'FCC',
    cargo: 'Engenheiro Eletricista',
    area: 'Engenharia Elétrica',
    dataProva: '2026-11-08',
    status: 'edital_aberto',
    link: '',
    notaCorte: null,
    prioridade: 5,
  });
  const disciplinaId = await repo.salvarDisciplina({
    concursoId,
    nome: 'Engenharia Elétrica',
    peso: 2,
    numQuestoes: 40,
    tipo: 'especifica',
  });
  await repo.adicionarLote(disciplinaId, '1 Circuitos\n1.1 Lei de Ohm\n2 Máquinas elétricas');
  return { concursoId, disciplinaId };
}

beforeEach(() => {
  agora = new Date('2026-09-27T23:00:00Z');
});

describe('mesclagem igual à do banco do Artifact', () => {
  it('mescla objetos recursivamente e substitui arrays', () => {
    expect(mesclarProfundo({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9] })).toEqual({
      a: { b: 1, c: 3 },
      l: [9],
    });
  });

  it('mesclar exige documento existente', async () => {
    const store = new MemoriaStore();
    await expect(store.mesclar('config/geral', { a: 1 })).rejects.toMatchObject({ code: 'invalid_argument' });
  });
});

describe('concursos, disciplinas e tópicos', () => {
  it('cadastra concurso, disciplina com cor e tópicos em lote', async () => {
    const { repo } = await novoRepo();
    const { disciplinaId } = await concursoComDisciplina(repo);
    const d = repo.atual.disciplinas.find((x) => x.id === disciplinaId)!;
    expect(d.cor).toMatch(/^#/);
    expect(Object.values(d.topicos).map((t) => t.titulo).sort()).toEqual([
      'Circuitos',
      'Lei de Ohm',
      'Máquinas elétricas',
    ]);
  });

  it('remover um tópico leva junto os subtópicos', async () => {
    const { repo } = await novoRepo();
    const { disciplinaId } = await concursoComDisciplina(repo);
    const topicos = () => repo.atual.disciplinas[0].topicos;
    const circuitos = Object.values(topicos()).find((t) => t.titulo === 'Circuitos')!;
    await repo.removerTopico(disciplinaId, circuitos.id);
    expect(Object.values(topicos()).map((t) => t.titulo)).toEqual(['Máquinas elétricas']);
  });

  it('excluir o concurso apaga as disciplinas mas mantém o histórico de sessões', async () => {
    const { repo } = await novoRepo();
    const { concursoId, disciplinaId } = await concursoComDisciplina(repo);
    await repo.iniciarSessao({ concursoId, disciplinaId, topicoId: null, tipo: 'teoria' });
    avancar(30);
    await repo.finalizarSessao({ concursoId, disciplinaId, topicoId: null, tipo: 'teoria' });
    await repo.excluirConcurso(concursoId);
    expect(repo.atual.concursos).toHaveLength(0);
    expect(repo.atual.disciplinas).toHaveLength(0);
    expect(repo.atual.sessoes).toHaveLength(1);
  });
});

describe('cronômetro persistido no banco', () => {
  it('fluxo completo: iniciar, pausar, recarregar, retomar e finalizar', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const { concursoId, disciplinaId } = await concursoComDisciplina(repo);
    const ohm = Object.values(repo.atual.disciplinas[0].topicos).find((t) => t.titulo === 'Lei de Ohm')!;

    await repo.iniciarSessao({ concursoId, disciplinaId, topicoId: ohm.id, tipo: 'teoria' });
    expect(repo.atual.disciplinas[0].topicos[ohm.id].status).toBe('em_estudo');
    await expect(
      repo.iniciarSessao({ concursoId, disciplinaId, topicoId: null, tipo: 'teoria' }),
    ).rejects.toMatchObject({ codigo: 'sessao_ativa' });

    avancar(25);
    await repo.pausarSessao();
    avancar(10);

    // "Recarregar a página": outro repositório lendo o mesmo banco.
    repo.encerrar();
    const { repo: recarregado } = await novoRepo(store);
    const ativa = recarregado.atual.ativa!;
    expect(ativa).not.toBeNull();
    expect(segundosLiquidos(ativa, agora)).toBe(25 * 60);

    await recarregado.retomarSessao();
    avancar(20);
    const s = await recarregado.finalizarSessao({
      concursoId,
      disciplinaId,
      topicoId: ohm.id,
      tipo: 'teoria',
      questoesFeitas: 10,
      acertos: 8,
      paginas: 12,
      anotacoes: 'Revisar exemplos de potência.',
      concluiuTeoria: true,
    });

    expect(s.segundosLiquidos).toBe(45 * 60);
    expect(recarregado.atual.ativa).toBeNull();
    expect(recarregado.atual.sessoes).toHaveLength(1);
    expect(recarregado.atual.sessoes[0]).toMatchObject({ questoesFeitas: 10, acertos: 8, paginas: 12 });
    expect(recarregado.atual.disciplinas[0].topicos[ohm.id].status).toBe('teoria_concluida');
    // Grava na semana que começa no domingo 27/09 (dia de SP da sessão).
    expect(Object.keys(store.despejar())).toContain('sessoes/2026-09-27');
  });

  it('se o estado ficou para trás após finalizar, a reconciliação limpa sem duplicar', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const s = await repo.iniciarSessao({ concursoId: null, disciplinaId: null, topicoId: null, tipo: 'questoes' });
    avancar(15);
    const fechada = { ...s, fim: agora.toISOString(), segundosLiquidos: 900 };
    // Simula a falha: gravou no histórico, mas o estado continuou com a sessão.
    await store.definir(`sessoes/${chaveSemana(s.inicio)}`, { semana: chaveSemana(s.inicio), itens: { [s.id]: fechada } });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.atual.ativa).toBeNull();
    expect(repo.atual.sessoes).toHaveLength(1);
  });

  it('acertos nunca passam das questões feitas', async () => {
    const { repo } = await novoRepo();
    await repo.iniciarSessao({ concursoId: null, disciplinaId: null, topicoId: null, tipo: 'questoes' });
    avancar(5);
    const s = await repo.finalizarSessao({
      concursoId: null,
      disciplinaId: null,
      topicoId: null,
      tipo: 'questoes',
      questoesFeitas: 5,
      acertos: 9,
    });
    expect(s.acertos).toBe(5);
  });
});

describe('registro manual e edição de sessões', () => {
  it('registro retroativo entra na semana certa e editar a data move de semana', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const s = await repo.registrarManual({
      concursoId: null,
      disciplinaId: null,
      topicoId: null,
      tipo: 'teoria',
      inicio: new Date('2026-09-26T09:00:00Z'), // sábado → semana de 20/09
      segundosLiquidos: 3600,
    });
    expect(Object.keys(store.despejar())).toContain('sessoes/2026-09-20');

    await repo.gravarSessao({ ...s, inicio: '2026-09-28T09:00:00Z', fim: '2026-09-28T10:00:00Z' });
    const caminhos = Object.keys(store.despejar());
    expect(caminhos).toContain('sessoes/2026-09-27');
    expect(caminhos).not.toContain('sessoes/2026-09-20'); // semana vazia é apagada
    expect(repo.atual.sessoes).toHaveLength(1);

    await repo.excluirSessao(s.id);
    expect(repo.atual.sessoes).toHaveLength(0);
  });
});

describe('backup', () => {
  it('exporta e importa tudo, substituindo o conteúdo atual', async () => {
    const { repo } = await novoRepo();
    await concursoComDisciplina(repo);
    await repo.salvarConfig({ ...repo.atual.config, metaDiariaMin: 240 });
    const backup = JSON.parse(JSON.stringify(repo.exportar()));

    const { repo: outro } = await novoRepo();
    await outro.salvarConcurso({ ...backup.documentos[Object.keys(backup.documentos)[0]], id: 'intruso', nome: 'Apagar' });
    const n = await outro.importar(backup);
    expect(n).toBe(Object.keys(backup.documentos).length);
    expect(outro.atual.concursos.map((c) => c.nome)).toEqual(['Fundação Florestal SP']);
    expect(outro.atual.config.metaDiariaMin).toBe(240);
  });

  it('recusa arquivo que não é backup do app', async () => {
    const { repo } = await novoRepo();
    await expect(repo.importar({ qualquer: 1 })).rejects.toMatchObject({ codigo: 'backup_invalido' });
  });
});
