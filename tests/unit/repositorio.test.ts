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

describe('revisões no repositório', () => {
  it('concluir a teoria agenda D+1; revisar com "bom" marca como revisado e agenda D+7', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const { disciplinaId } = await concursoComDisciplina(repo);
    const ohm = () => Object.values(repo.atual.disciplinas[0].topicos).find((t) => t.titulo === 'Lei de Ohm')!;

    await repo.atualizarTopico(disciplinaId, ohm().id, { status: 'teoria_concluida' });
    expect(ohm().revisao?.proxima).toBe('2026-09-28'); // domingo 27/09 (SP) + 1
    expect(ohm().concluidoEm).toBe(agora.toISOString());

    agora = new Date('2026-09-28T12:00:00Z');
    await repo.registrarRevisao(disciplinaId, ohm().id, 'bom');
    expect(ohm().status).toBe('revisado');
    expect(ohm().revisao?.proxima).toBe('2026-10-04'); // D+7 a partir da conclusão
    expect(repo.atual.revisoesFeitas).toMatchObject([{ topicoId: ohm().id, avaliacao: 'bom', dia: '2026-09-28', intervalo: 6 }]);
    expect(Object.keys(store.despejar())).toContain('revisoes/2026-09-27');
  });

  it('voltar o tópico para "em estudo" cancela as revisões', async () => {
    const { repo } = await novoRepo();
    const { disciplinaId } = await concursoComDisciplina(repo);
    const t = Object.values(repo.atual.disciplinas[0].topicos)[0];
    await repo.atualizarTopico(disciplinaId, t.id, { status: 'teoria_concluida' });
    await repo.atualizarTopico(disciplinaId, t.id, { status: 'em_estudo' });
    const depois = repo.atual.disciplinas[0].topicos[t.id];
    expect(depois.revisao).toBeNull();
    expect(depois.concluidoEm).toBeNull();
  });

  it('agenda revisões para tópicos concluídos antes de as revisões existirem', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const { disciplinaId } = await concursoComDisciplina(repo);
    const t = Object.values(repo.atual.disciplinas[0].topicos)[0];
    // Simula dado antigo: concluído sem `revisao`.
    await store.mesclar(`disciplinas/${disciplinaId}`, { topicos: { [t.id]: { status: 'teoria_concluida' } } });
    expect(repo.concluidosSemRevisao()).toHaveLength(1);
    expect(await repo.agendarRevisoesPendentes()).toBe(1);
    expect(repo.atual.disciplinas[0].topicos[t.id].revisao?.proxima).toBe('2026-09-28');
    expect(repo.concluidosSemRevisao()).toHaveLength(0);
  });
});

describe('biblioteca', () => {
  it('guarda materiais por disciplina e remove o PDF junto', async () => {
    const removidos: string[] = [];
    const store = new MemoriaStore();
    const repo = new Repositorio(store, relogio, {
      enviar: async () => ({ id: 'arq1', url: '/_blob/arq1' }),
      remover: async (id) => void removidos.push(id),
    });
    repo.iniciar();
    await repo.pronto();
    const { disciplinaId } = await concursoComDisciplina(repo);
    const base = { disciplinaId, topicoId: null, url: '', arquivoId: null, arquivoNome: null, trecho: '', observacao: '' };
    await repo.salvarMaterial({ ...base, tipo: 'video', titulo: 'Aula 1 - Circuitos', url: 'https://exemplo.com/aula1' });
    const pdfId = await repo.salvarMaterial({ ...base, tipo: 'pdf', titulo: 'Apostila', arquivoId: 'arq1', arquivoNome: 'apostila.pdf' });
    expect(repo.atual.materiais.map((m) => m.titulo)).toEqual(['Apostila', 'Aula 1 - Circuitos']);

    await repo.removerMaterial(repo.atual.materiais.find((m) => m.id === pdfId)!);
    expect(removidos).toEqual(['arq1']);
    expect(repo.atual.materiais).toHaveLength(1);

    await repo.excluirDisciplina(disciplinaId);
    expect(repo.atual.materiais).toHaveLength(0);
    expect(Object.keys(store.despejar()).some((c) => c.startsWith('biblioteca/'))).toBe(false);
  });
});

describe('prática com IA', () => {
  it('sem sessão em andamento, vira uma sessão de questões com o tempo da prática', async () => {
    const { repo } = await novoRepo();
    const inicio = new Date(agora);
    avancar(12);
    expect(
      await repo.registrarPratica({ concursoId: null, disciplinaId: null, topicoId: null, feitas: 10, acertos: 7, inicio, descricao: 'Prática com IA' }),
    ).toBe('nova');
    expect(repo.atual.sessoes[0]).toMatchObject({ tipo: 'questoes', origem: 'pratica_ia', questoesFeitas: 10, acertos: 7, segundosLiquidos: 720 });
  });

  it('com sessão em andamento, soma as questões nela', async () => {
    const { repo } = await novoRepo();
    await repo.iniciarSessao({ concursoId: null, disciplinaId: null, topicoId: null, tipo: 'teoria' });
    expect(
      await repo.registrarPratica({ concursoId: null, disciplinaId: null, topicoId: null, feitas: 5, acertos: 4, inicio: agora, descricao: '' }),
    ).toBe('ativa');
    expect(repo.atual.ativa).toMatchObject({ questoesFeitas: 5, acertos: 4 });
    expect(repo.atual.sessoes).toHaveLength(0);
  });
});

describe('importação de edital', () => {
  it('cria disciplinas novas com tópicos e junta numa disciplina existente', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    const { concursoId, disciplinaId } = await concursoComDisciplina(repo);
    type No = { titulo: string; filhos: No[] };
    const t = (titulo: string, filhos: No[] = []): No => ({ titulo, filhos });
    const r = await repo.importarEdital({
      concursoId,
      cargo: 'Engenheiro Eletricista',
      trecho: 'CONTEÚDO PROGRAMÁTICO ...',
      arquivo: null,
      disciplinas: [
        { nome: 'Língua Portuguesa', peso: 1, numQuestoes: 20, tipo: 'basica', topicos: [t('Crase'), t('Concordância')], destinoId: null },
        { nome: 'Engenharia Elétrica', peso: null, numQuestoes: null, tipo: 'especifica', topicos: [t('Proteção', [t('Relés')])], destinoId: disciplinaId },
      ],
    });
    expect(r).toEqual({ disciplinas: 2, topicos: 4 });
    const pt = repo.atual.disciplinas.find((d) => d.nome === 'Língua Portuguesa')!;
    expect(pt.editalId).toBe(repo.atual.editais[0].id);
    expect(Object.values(pt.topicos).map((x) => x.titulo).sort()).toEqual(['Concordância', 'Crase']);
    const ee = repo.atual.disciplinas.find((d) => d.id === disciplinaId)!;
    expect(Object.values(ee.topicos).map((x) => x.titulo)).toContain('Relés');
    expect(repo.atual.editais[0]).toMatchObject({ cargo: 'Engenheiro Eletricista', arquivoId: null });
  });
});

describe('tópicos equivalentes', () => {
  async function doisConcursos() {
    const { repo } = await novoRepo();
    const base = { orgao: '', banca: '', cargo: '', area: '', dataProva: null, status: 'previsto' as const, link: '', notaCorte: null, prioridade: 3 };
    const c1 = await repo.salvarConcurso({ ...base, nome: 'Petrobras' });
    const c2 = await repo.salvarConcurso({ ...base, nome: 'Transpetro' });
    const d1 = await repo.salvarDisciplina({ concursoId: c1, nome: 'Elétrica', peso: 1, numQuestoes: null, tipo: 'especifica' });
    const d2 = await repo.salvarDisciplina({ concursoId: c2, nome: 'Elétrica', peso: 1, numQuestoes: null, tipo: 'especifica' });
    const t1 = await repo.adicionarTopico(d1, 'Máquinas elétricas');
    const t2 = await repo.adicionarTopico(d2, 'Máquinas Elétricas');
    const topico = (d: string, t: string) => repo.atual.disciplinas.find((x) => x.id === d)!.topicos[t];
    return { repo, d1, d2, t1, t2, topico };
  }

  it('vincular leva o status mais avançado para os dois', async () => {
    const { repo, d1, d2, t1, t2, topico } = await doisConcursos();
    await repo.atualizarTopico(d1, t1, { status: 'teoria_concluida' });
    await repo.vincularTopicos({ disciplinaId: d1, topicoId: t1 }, { disciplinaId: d2, topicoId: t2 });
    expect(topico(d2, t2).grupoEquivalenciaId).toBe(topico(d1, t1).grupoEquivalenciaId);
    expect(topico(d2, t2).status).toBe('teoria_concluida');
    expect(topico(d2, t2).revisao?.proxima).toBe('2026-09-28');
  });

  it('estudar um conta para o outro: status e revisão se propagam', async () => {
    const { repo, d1, d2, t1, t2, topico } = await doisConcursos();
    await repo.vincularTopicos({ disciplinaId: d1, topicoId: t1 }, { disciplinaId: d2, topicoId: t2 });
    await repo.atualizarTopico(d2, t2, { status: 'teoria_concluida' });
    expect(topico(d1, t1).status).toBe('teoria_concluida');
    agora = new Date('2026-09-28T12:00:00Z');
    await repo.registrarRevisao(d1, t1, 'bom');
    expect(topico(d2, t2)).toMatchObject({ status: 'revisado', revisao: { proxima: '2026-10-04' } });
  });

  it('desvincular desfaz o grupo e ignorar some com a sugestão', async () => {
    const { repo, d1, d2, t1, t2, topico } = await doisConcursos();
    await repo.vincularTopicos({ disciplinaId: d1, topicoId: t1 }, { disciplinaId: d2, topicoId: t2 });
    await repo.desvincularTopico(d1, t1);
    expect(topico(d1, t1).grupoEquivalenciaId).toBeNull();
    expect(topico(d2, t2).grupoEquivalenciaId).toBeNull();
    await repo.ignorarEquivalencia(t2, t1);
    expect(repo.atual.vinculosIgnorados.has([t1, t2].sort().join('|'))).toBe(true);
  });
});

describe('planejamento no repositório', () => {
  const grade = {
    blocoMin: 60,
    excecoes: {},
    dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ inicio: '20:00', fim: '22:00' }]])),
  };

  it('replaneja por semanas, mantém o histórico marcado e move blocos', async () => {
    const store = new MemoriaStore();
    agora = new Date('2026-09-27T12:00:00Z'); // domingo, 09:00 em SP
    const { repo } = await novoRepo(store);
    await concursoComDisciplina(repo);
    await repo.salvarDisponibilidade(grade);
    const n = await repo.replanejar();
    expect(n).toBeGreaterThan(0);
    expect(repo.atual.blocos[0]).toMatchObject({ dia: '2026-09-27', inicio: '20:00', fim: '21:00', status: 'planejado' });
    expect(Object.keys(store.despejar())).toContain('plano/2026-09-27');

    const primeiro = repo.atual.blocos[0];
    await repo.marcarBloco(primeiro.id, 'feito');
    await repo.replanejar();
    expect(repo.atual.blocos.find((b) => b.id === primeiro.id)?.status).toBe('feito');
    expect(repo.atual.blocos.filter((b) => b.dia === '2026-09-27' && b.inicio === '20:00')).toHaveLength(1);

    const outro = repo.atual.blocos.find((b) => b.status === 'planejado')!;
    await repo.moverBloco(outro.id, '2026-10-05', '06:30');
    expect(repo.atual.blocos.find((b) => b.id === outro.id)).toMatchObject({ dia: '2026-10-05', inicio: '06:30', fim: '07:30' });

    const removidos = await repo.removerPlanoFuturo();
    expect(removidos).toBeGreaterThan(0);
    expect(repo.atual.blocos.map((b) => b.id)).toEqual([primeiro.id]);
  });
});

describe('adaptação no repositório (Fase 4)', () => {
  const grade = {
    blocoMin: 60,
    excecoes: {},
    dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ inicio: '20:00', fim: '22:00' }]])),
  };

  async function comPlano() {
    agora = new Date('2026-09-27T12:00:00Z'); // domingo, 09:00 em SP
    const { repo } = await novoRepo();
    const ids = await concursoComDisciplina(repo);
    await repo.salvarDisponibilidade(grade);
    await repo.replanejar();
    return { repo, ...ids };
  }

  it('bloco movido por você sobrevive ao replanejamento', async () => {
    const { repo } = await comPlano();
    const b = repo.atual.blocos[3];
    await repo.moverBloco(b.id, '2026-10-10', '09:00');
    await repo.replanejar();
    expect(repo.atual.blocos.find((x) => x.id === b.id)).toMatchObject({ dia: '2026-10-10', inicio: '09:00', fixo: true });
  });

  it('marcar bloco replaneja sozinho; replanejar do dia roda uma vez por dia', async () => {
    const { repo } = await comPlano();
    const antes = repo.atual.blocos.filter((b) => b.status === 'planejado').map((b) => b.id);
    await repo.marcarBloco(repo.atual.blocos[0].id, 'pulado');
    const depois = repo.atual.blocos.filter((b) => b.status === 'planejado').map((b) => b.id);
    expect(depois.some((id) => antes.includes(id))).toBe(false); // blocos novos
    expect(await repo.replanejarDoDia()).toBe(false); // já replanejou hoje
    agora = new Date('2026-09-28T12:00:00Z');
    expect(await repo.replanejarDoDia()).toBe(true);
  });

  it('cortar tópicos tira do plano; devolver traz de volta', async () => {
    const { repo, disciplinaId } = await comPlano();
    const ohm = Object.values(repo.atual.disciplinas[0].topicos).find((t) => t.titulo === 'Lei de Ohm')!;
    await repo.cortarTopicos([{ disciplinaId, topicoId: ohm.id }]);
    expect(repo.atual.disciplinas[0].topicos[ohm.id].cortado).toBe(true);
    expect(repo.atual.blocos.some((b) => b.topicoId === ohm.id && b.status === 'planejado')).toBe(false);
    await repo.cortarTopicos([{ disciplinaId, topicoId: ohm.id }], false);
    expect(repo.atual.blocos.some((b) => b.topicoId === ohm.id)).toBe(true);
  });
});

describe('desempenho no repositório (Fase 5)', () => {
  it('questões avulsas por semana, importação em lote e exclusão', async () => {
    const store = new MemoriaStore();
    const { repo } = await novoRepo(store);
    await repo.salvarRegistroQuestoes({ concursoId: null, disciplinaId: null, topicoId: null, dia: '2026-09-28', feitas: 10, acertos: 12, fonte: 'QConcursos' });
    expect(repo.atual.registrosQuestoes[0]).toMatchObject({ feitas: 10, acertos: 10 });
    const n = await repo.importarQuestoes([
      { concursoId: null, disciplinaId: null, topicoId: null, dia: '2026-09-29', feitas: 5, acertos: 3, fonte: 'CSV' },
      { concursoId: null, disciplinaId: null, topicoId: null, dia: '2026-10-05', feitas: 8, acertos: 8, fonte: 'CSV' },
    ]);
    expect(n).toBe(2);
    expect(Object.keys(store.despejar()).filter((c) => c.startsWith('questoes/')).sort()).toEqual(['questoes/2026-09-27', 'questoes/2026-10-04']);
    await repo.excluirRegistroQuestoes(repo.atual.registrosQuestoes[0].id);
    expect(repo.atual.registrosQuestoes).toHaveLength(2);
  });

  it('caderno de erros: salva por disciplina, revisa e exclui com a disciplina', async () => {
    const { repo } = await novoRepo();
    const { disciplinaId } = await concursoComDisciplina(repo);
    await repo.salvarErro({
      disciplinaId, topicoId: null, enunciado: 'Relação de espiras', minhaResposta: 'A', respostaCerta: 'B', motivo: 'desatencao', comentario: '', fonte: '',
      criadoEm: '2026-09-27', proximaRevisao: '2026-09-30', revisoesFeitas: [], explicacaoIA: '',
    });
    agora = new Date('2026-09-30T12:00:00Z');
    const e = await repo.revisarErroCaderno(repo.atual.erros[0], true);
    expect(e).toMatchObject({ revisoesFeitas: ['2026-09-30'], proximaRevisao: '2026-10-11' });
    await repo.excluirDisciplina(disciplinaId);
    expect(repo.atual.erros).toHaveLength(0);
  });

  it('simulados', async () => {
    const { repo } = await novoRepo();
    const id = await repo.salvarSimulado({ concursoId: 'c', titulo: 'Simulado 1', dia: '2026-09-27', duracaoMin: 240, notas: [], notaTotal: 60, notaMaxima: 100, observacoes: '' });
    expect(repo.atual.simulados[0]).toMatchObject({ id, notaTotal: 60 });
    await repo.excluirSimulado(id);
    expect(repo.atual.simulados).toHaveLength(0);
  });
});
