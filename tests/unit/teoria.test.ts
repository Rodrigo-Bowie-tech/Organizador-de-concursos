import { describe, expect, it } from 'vitest';
import { blocosDeTeoria, filaDeTeoria, gerarPlano, horarioDaGestao } from '../../src/dominio/planejador';
import { viabilidade } from '../../src/dominio/adaptacao';
import { pontosDaGestao } from '../../src/dominio/gestao';
import { blocosDeTeoriaFeitos, restanteDeTeoria, ritmoDoAssunto, sugestaoDeAjuste, teoriasAConfirmar } from '../../src/dominio/teoria';
import type { BlocoPlanejado, Concurso, Disciplina, Disponibilidade, Sessao, Topico } from '../../src/dominio/tipos';

const topico = (id: string, extra: Partial<Topico> = {}): Topico => ({
  id, paiId: null, titulo: id, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...extra,
});
const disciplina = (id: string, topicos: Topico[], extra: Partial<Disciplina> = {}): Disciplina => ({
  id, concursoId: 'embu', editalId: null, nome: id, peso: 1, numQuestoes: 2, tipo: 'especifica', ordem: 0, cor: '#000',
  topicos: Object.fromEntries(topicos.map((t) => [t.id, t])), ...extra,
});
const concurso = (dataProva: string): Concurso => ({
  id: 'embu', nome: 'Embu', orgao: '', banca: '', cargo: '', area: '', dataProva, status: 'inscrito', link: '', notaCorte: null, prioridade: 5, criadoEm: '',
});
/** Sessão de teoria finalizada com `min` minutos. */
const sessao = (topicoId: string, min: number, tipo: Sessao['tipo'] = 'teoria'): Sessao => ({
  id: `${topicoId}-${min}`, concursoId: 'embu', disciplinaId: 'prot', topicoId, tipo,
  inicio: '2026-10-05T23:00:00.000Z', fim: new Date(Date.parse('2026-10-05T23:00:00.000Z') + min * 60_000).toISOString(),
  pausas: [], segundosLiquidos: min * 60, questoesFeitas: 0, acertos: 0, paginas: 0, anotacoes: '', origem: 'cronometro', concluiuTeoria: false,
});
const bloco = (topicoId: string, status: BlocoPlanejado['status'], motivo: BlocoPlanejado['motivo'] = 'teoria'): BlocoPlanejado => ({
  id: `${topicoId}-${status}-${Math.random()}`, dia: '2026-10-05', inicio: '20:00', fim: '21:00', concursoId: 'embu', disciplinaId: 'prot',
  topicoId, tipo: 'teoria', status, motivo,
});

describe('blocos de teoria feitos', () => {
  const prot = disciplina('prot', [topico('reles'), topico('fusiveis'), topico('seletividade')]);

  it('pelo tempo de teoria (÷ duração do bloco) ou pelos blocos marcados: vale o maior, sem somar os dois', () => {
    const feitos = blocosDeTeoriaFeitos(
      [sessao('reles', 60), sessao('reles', 45), sessao('reles', 30, 'questoes'), sessao('fusiveis', 50)],
      [bloco('reles', 'feito'), bloco('fusiveis', 'feito'), bloco('fusiveis', 'parcial'), bloco('fusiveis', 'pulado'), bloco('seletividade', 'feito', 'revisao')],
      [prot],
      60,
    );
    expect(feitos.get('reles')).toBeCloseTo(1.75); // 105 min de teoria; questões não contam
    expect(feitos.get('fusiveis')).toBe(1.5); // 1 feito + 1 parcial > 50 min
    expect(feitos.has('seletividade')).toBe(false); // bloco de revisão não é teoria
  });

  it('tópicos vinculados entre editais contam juntos', () => {
    const a = disciplina('a', [topico('ohm1', { grupoEquivalenciaId: 'g' })]);
    const b = disciplina('b', [topico('ohm2', { grupoEquivalenciaId: 'g' })], { concursoId: 'outro' });
    const feitos = blocosDeTeoriaFeitos([sessao('ohm1', 60), sessao('ohm2', 60)], [], [a, b], 60);
    expect(feitos.get('ohm1')).toBe(2);
    expect(feitos.get('ohm2')).toBe(2);
  });

  it('o plano reserva só o que falta; acabou a estimativa sem resposta, guarda 1 bloco', () => {
    const t = topico('reles', { status: 'em_estudo', blocosTeoria: 4 });
    expect(blocosDeTeoria(t, 0)).toBe(4);
    expect(blocosDeTeoria(t, 1)).toBe(3);
    expect(blocosDeTeoria(t, 2.8)).toBe(1);
    expect(restanteDeTeoria(t, 3.8)).toBe(0); // 75% do último bloco já conta
    expect(blocosDeTeoria(t, 3.8)).toBe(1);
    expect(blocosDeTeoria(topico('x'), 0)).toBe(2); // sem estimativa: 2
    const fila = filaDeTeoria([concurso('2026-12-06')], [disciplina('prot', [t])], new Map(), '2026-10-05', [], new Map([['reles', 1]]));
    expect(fila[0].blocos).toBe(3);
  });
});

describe('terminou a teoria?', () => {
  it('pergunta quando os blocos previstos acabam e a teoria não foi concluída', () => {
    const d = disciplina('prot', [
      topico('reles', { status: 'em_estudo', blocosTeoria: 3 }),
      topico('fusiveis', { status: 'em_estudo', blocosTeoria: 3 }),
      topico('feito', { status: 'teoria_concluida', blocosTeoria: 1 }),
      topico('cortado', { status: 'em_estudo', blocosTeoria: 1, cortado: true }),
    ]);
    const feitos = new Map([['reles', 3], ['fusiveis', 2], ['feito', 2], ['cortado', 1]]);
    expect(teoriasAConfirmar([d], feitos).map((c) => [c.topico.id, c.feitos, c.estimativa])).toEqual([['reles', 3, 3]]);
  });

  it('ritmo do assunto: concluídos e os que pediram mais, contra a estimativa original', () => {
    const d = disciplina('prot', [
      topico('reles', { ordem: 0, status: 'teoria_concluida', blocosTeoria: 2 }), // levou 3
      topico('fusiveis', { ordem: 1, status: 'em_estudo', blocosTeoria: 5, blocosTeoriaOriginal: 3, blocosTeoriaPedidos: 2 }),
      topico('seletividade', { ordem: 2, blocosTeoria: 2 }),
      topico('aterramento', { ordem: 3, blocosTeoria: 3 }),
      topico('comecado', { ordem: 4, status: 'em_estudo', blocosTeoria: 2 }),
    ]);
    const feitos = new Map([['reles', 3], ['fusiveis', 3], ['comecado', 1]]);
    expect(ritmoDoAssunto(d, feitos)).toEqual({ real: 8, previsto: 5, fator: 1.6, topicos: 2 });
    const ajuste = sugestaoDeAjuste(d, feitos);
    // Só os que ainda não começaram: 2 × 1,6 = 3,2 → 3 e 3 × 1,6 = 4,8 → 5.
    expect(ajuste?.mudancas.map((m) => [m.topico.id, m.de, m.para])).toEqual([['seletividade', 2, 3], ['aterramento', 3, 5]]);
  });

  it('não sugere ajuste com o assunto no ritmo, nem acumula sobre um ajuste anterior', () => {
    const noRitmo = disciplina('prot', [topico('reles', { status: 'teoria_concluida', blocosTeoria: 3 }), topico('fusiveis', { blocosTeoria: 2 })]);
    expect(sugestaoDeAjuste(noRitmo, new Map([['reles', 3]]))).toBeNull();
    const jaAjustado = disciplina('prot', [
      topico('reles', { status: 'teoria_concluida', blocosTeoria: 2 }),
      topico('fusiveis', { blocosTeoria: 3, blocosTeoriaOriginal: 2 }),
    ]);
    // Ritmo 1,5: o ajuste parte da estimativa original (2 × 1,5 = 3), que já é a atual.
    expect(sugestaoDeAjuste(jaAjustado, new Map([['reles', 3]]))).toBeNull();
  });
});

describe('gestão semanal dos concursos', () => {
  const NOITE: Disponibilidade = {
    blocoMin: 60,
    dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ inicio: '19:00', fim: '21:00' }]])),
    excecoes: {},
    gestao: { dia: '0', inicio: '19:00', minutos: 60 },
  };
  const entrada = (extra = {}) => ({
    agora: new Date('2026-10-05T08:00:00Z'), // segunda, 05:00 em SP
    concursos: [concurso('2026-12-06')],
    disciplinas: [disciplina('prot', [topico('reles', { blocosTeoria: 6 }), topico('fusiveis', { blocosTeoria: 6 })])],
    disponibilidade: NOITE,
    existentes: [] as BlocoPlanejado[],
    horizonteDias: 14,
    novoId: (() => {
      let n = 0;
      return () => `g${++n}`;
    })(),
    ...extra,
  });

  it('um bloco por semana no horário escolhido, e o estudo não cai nele', () => {
    expect(horarioDaGestao(NOITE.gestao, '2026-10-11')).toEqual({ inicio: '19:00', fim: '20:00' });
    expect(horarioDaGestao(NOITE.gestao, '2026-10-12')).toBeNull();
    const p = gerarPlano(entrada());
    const gestao = p.filter((b) => b.motivo === 'gestao');
    expect(gestao.map((b) => [b.dia, b.inicio, b.fim, b.tipo])).toEqual([
      ['2026-10-11', '19:00', '20:00', 'gestao'],
      ['2026-10-18', '19:00', '20:00', 'gestao'],
    ]);
    const domingo = p.filter((b) => b.dia === '2026-10-11').map((b) => [b.inicio, b.motivo]);
    expect(domingo).toEqual([['20:00', 'teoria'], ['19:00', 'gestao']]);
  });

  it('a gestão da semana já marcada (ou movida) não se repete', () => {
    // Movida por você para a quarta 14/10 (a semana começa no domingo 11/10).
    const movida: BlocoPlanejado = { ...bloco('x', 'planejado', 'gestao'), dia: '2026-10-14', inicio: '18:00', fim: '19:00', tipo: 'gestao', topicoId: null, disciplinaId: null, fixo: true };
    const p = gerarPlano(entrada({ existentes: [movida] }));
    expect(p.filter((b) => b.motivo === 'gestao').map((b) => b.dia)).toEqual(['2026-10-18']);
    expect(gerarPlano(entrada({ disponibilidade: { ...NOITE, gestao: null } })).some((b) => b.motivo === 'gestao')).toBe(false);
  });

  it('a viabilidade não conta o horário da gestão como estudo', () => {
    const com = viabilidade(concurso('2026-10-19'), entrada().disciplinas, NOITE, new Date('2026-10-05T08:00:00Z'));
    const sem = viabilidade(concurso('2026-10-19'), entrada().disciplinas, { ...NOITE, gestao: null }, new Date('2026-10-05T08:00:00Z'));
    expect((sem?.disponiveis ?? 0) - (com?.disponiveis ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('aponta o que pede atenção em cada tarefa', () => {
    const concursos: Concurso[] = [
      { ...concurso('2026-10-20'), status: 'edital_aberto' },
      { ...concurso('2026-09-30'), id: 'velho', nome: 'Velho', status: 'inscrito' },
      { ...concurso('2026-09-01'), id: 'feita', nome: 'Feita', status: 'prova_feita' },
      { ...concurso(''), id: 'novo', nome: 'Novo', dataProva: null, status: 'previsto' },
    ];
    const blocos = [bloco('a', 'feito'), bloco('b', 'pulado'), { ...bloco('c', 'planejado', 'gestao'), tipo: 'gestao' as const }];
    const pontos = pontosDaGestao({ concursos, disciplinas: [disciplina('prot', [])], blocos, novasNoRadar: 2, hoje: '2026-10-11' });
    expect(pontos.editais).toEqual(['Sem edital no app: Velho, Novo.']);
    expect(pontos.outros).toEqual(['2 oportunidades novas no radar.']);
    expect(pontos.inscricoes).toEqual(['Edital aberto, inscrição a confirmar: Embu.', 'Prova de Embu em 20/10/2026 (9 dias).']);
    expect(pontos.planejamento).toEqual(['Semana passada: 1 de 2 blocos feitos.']);
    expect(pontos.resultados).toEqual(['A prova já passou, atualize o status: Velho.', 'Prova feita, acompanhe o resultado: Feita.']);
  });
});
