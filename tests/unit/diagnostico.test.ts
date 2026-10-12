import { describe, expect, it } from 'vitest';
import { todasAsQuestoes } from '../../src/dominio/desempenho';
import {
  diagnosticoPorAssunto,
  minutosNoPlano,
  necessidadePorDisciplina,
  necessidadePorTopico,
  notaDeAcerto,
  simuladosPorDisciplina,
  teoriaDoTopico,
} from '../../src/dominio/diagnostico';
import type { BlocoPlanejado, Disciplina, RegistroQuestoes, Sessao, Simulado, Topico } from '../../src/dominio/tipos';

// Segunda-feira, 12/10/2026, 12:00 em São Paulo.
const AGORA = new Date('2026-10-12T15:00:00Z');

const topico = (id: string, extra: Partial<Topico> = {}): Topico => ({
  id, paiId: null, titulo: id, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...extra,
});
const disciplina = (id: string, topicos: Topico[], extra: Partial<Disciplina> = {}): Disciplina => ({
  id, concursoId: 'embu', editalId: null, nome: id, peso: 1, numQuestoes: 1, tipo: 'especifica', ordem: 0, cor: '#000',
  topicos: Object.fromEntries(topicos.map((t) => [t.id, t])), ...extra,
});
const sessao = (disciplinaId: string | null, topicoId: string | null, min: number, extra: Partial<Sessao> = {}): Sessao => ({
  id: `${topicoId}-${min}-${Math.random()}`, concursoId: 'embu', disciplinaId, topicoId, tipo: 'teoria',
  inicio: '2026-10-08T23:00:00.000Z', fim: new Date(Date.parse('2026-10-08T23:00:00.000Z') + min * 60_000).toISOString(),
  pausas: [], segundosLiquidos: min * 60, questoesFeitas: 0, acertos: 0, paginas: 0, anotacoes: '', origem: 'cronometro', concluiuTeoria: false, ...extra,
});
const registro = (disciplinaId: string, topicoId: string, feitas: number, acertos: number): RegistroQuestoes => ({
  id: `${topicoId}-${feitas}-${acertos}`, concursoId: 'embu', disciplinaId, topicoId, dia: '2026-10-12', feitas, acertos, fonte: 'Caderno de RL · Bloco 01',
});
const simulado = (dia: string, notas: [string, number, number][]): Simulado => ({
  id: dia, concursoId: 'embu', titulo: dia, dia, duracaoMin: 180, observacoes: '',
  notaTotal: notas.reduce((t, n) => t + n[1], 0), notaMaxima: notas.reduce((t, n) => t + n[2], 0),
  notas: notas.map(([disciplinaId, nota, maximo]) => ({ disciplinaId, nome: disciplinaId, nota, maximo })),
});
const bloco = (dia: string, inicio: string, fim: string, extra: Partial<BlocoPlanejado> = {}): BlocoPlanejado => ({
  id: `${dia}-${inicio}`, dia, inicio, fim, concursoId: 'embu', disciplinaId: 'lum', topicoId: 'lum1', tipo: 'teoria', status: 'planejado', motivo: 'teoria', ...extra,
});

describe('notas do diagnóstico', () => {
  it('o acerto é puxado para 50% quando há poucas questões', () => {
    expect(notaDeAcerto({ feitas: 0, acertos: 0 }, 4)).toBe(0.5); // sem dados: "ainda não sei"
    expect(notaDeAcerto({ feitas: 1, acertos: 1 }, 2)).toBeCloseTo(2 / 3); // uma de sorte não vira domínio
    expect(notaDeAcerto({ feitas: 10, acertos: 10 }, 2)).toBeCloseTo(11 / 12);
    expect(notaDeAcerto({ feitas: 10, acertos: 8 }, 4)).toBeCloseTo(10 / 14);
    expect(notaDeAcerto({ feitas: 200, acertos: 150 }, 4)).toBeCloseTo(0.75, 2); // com muitas, vale o acerto
  });

  it('teoria: blocos feitos até o previsto; teoria concluída conta inteira', () => {
    expect(teoriaDoTopico(topico('a', { blocosTeoria: 3 }), 1.5)).toEqual({ previstos: 3, feitos: 1.5 });
    expect(teoriaDoTopico(topico('a', { blocosTeoria: 2 }), 5)).toEqual({ previstos: 2, feitos: 2 });
    expect(teoriaDoTopico(topico('a'), 0)).toEqual({ previstos: 2, feitos: 0 }); // sem estimativa = 2 blocos
    expect(teoriaDoTopico(topico('a', { status: 'revisado', blocosTeoria: 2 }), 0)).toEqual({ previstos: 2, feitos: 2 });
  });

  it('simulados: soma as questões de cada disciplina em todos os simulados (nota ÷ peso)', () => {
    const discs = [disciplina('lum', []), disciplina('pt', [], { peso: 2 })];
    const s = simuladosPorDisciplina(
      [simulado('2026-10-12', [['lum', 0, 2], ['pt', 16, 20], ['outra', 1, 1]]), simulado('2026-10-25', [['lum', 2, 2], ['pt', 0, 0]])],
      discs,
    );
    expect(s.get('lum')).toEqual({ feitas: 4, acertos: 2 });
    expect(s.get('pt')).toEqual({ feitas: 10, acertos: 8 }); // peso 2: 20 pontos = 10 questões
    expect(s.has('outra')).toBe(false);
  });
});

describe('horas no plano', () => {
  it('soma os blocos planejados que ainda não começaram; revisão com vários tópicos é dividida', () => {
    const discs = [disciplina('lum', [topico('lum1'), topico('lum2')]), disciplina('rl', [topico('rl1')])];
    const m = minutosNoPlano(
      [
        bloco('2026-10-12', '09:00', '10:00'), // já passou
        bloco('2026-10-12', '20:00', '21:00'),
        bloco('2026-10-12', '21:00', '22:00', { status: 'feito' }),
        bloco('2026-10-13', '20:00', '21:00', { motivo: 'questoes', tipo: 'questoes', disciplinaId: 'rl', topicoId: 'rl1' }),
        bloco('2026-10-14', '20:00', '21:00', { motivo: 'revisao', tipo: 'revisao', disciplinaId: null, topicoId: null, revisoes: ['lum1', 'lum2', 'rl1'] }),
        bloco('2026-10-18', '19:00', '20:00', { motivo: 'gestao', tipo: 'gestao', disciplinaId: null, topicoId: null }),
        bloco('2026-10-25', '09:00', '12:00', { motivo: 'simulado', tipo: 'simulado', disciplinaId: null, topicoId: null }),
      ],
      discs,
      AGORA,
    );
    expect(m.get('lum')).toBe(60 + 40); // 1 bloco de teoria + 2 terços da revisão
    expect(m.get('rl')).toBe(60 + 20);
  });
});

describe('diagnóstico por assunto', () => {
  const lum = disciplina('lum', [topico('lum1', { blocosTeoria: 2, status: 'em_estudo' }), topico('lum2', { blocosTeoria: 2, ordem: 1 })], { nome: 'Luminotécnica' });
  const rl = disciplina(
    'rl',
    [topico('rl1', { status: 'revisado' }), topico('rl2', { status: 'revisado', ordem: 1 }), topico('rl3', { ordem: 2, cortado: true })],
    { nome: 'Raciocínio Lógico', numQuestoes: 10 },
  );
  const sessoes = [sessao('lum', 'lum1', 30), sessao(null, 'lum1', 15, { tipo: 'questoes' }), sessao('rl', 'rl1', 60)];
  const registros = [registro('rl', 'rl1', 4, 4), registro('rl', 'rl2', 5, 3)];
  const diag = diagnosticoPorAssunto({
    disciplinas: [lum, rl],
    sessoes,
    questoes: todasAsQuestoes(sessoes, registros),
    simulados: [simulado('2026-10-12', [['lum', 0, 2], ['rl', 10, 10]])],
    blocos: [bloco('2026-10-12', '20:00', '21:00'), bloco('2026-10-12', '21:00', '22:00', { topicoId: 'lum2' })],
    feitos: new Map([['lum1', 0.5]]),
    agora: AGORA,
  });
  const [dLum, dRl] = diag;

  it('compõe as três notas: teoria feita, acerto nas questões e acerto nos simulados', () => {
    expect(dLum.segundos).toBe(45 * 60); // a sessão sem disciplina conta pelo tópico
    expect(dLum.teoria).toEqual({ previstos: 4, feitos: 0.5 });
    expect(dLum.notas.teoria).toBeCloseTo(0.125);
    expect(dLum.notas.questoes).toBe(0.5); // nenhuma questão ainda
    expect(dLum.notas.simulados).toBeCloseTo(0.25); // 0 de 2, puxado para o meio
    expect(dLum.dominio).toBeCloseTo((0.125 + 0.5 + 0.25) / 3);
    expect(dLum.emRisco).toBeCloseTo(1 - dLum.dominio); // 1 questão na prova
    expect(dLum.minutosNoPlano).toBe(120);
  });

  it('teoria estudada na disciplina inteira (sem tópico) conta no assunto, até o previsto', () => {
    const bt = disciplina('bt', [topico('bt1'), topico('bt2', { ordem: 1 })]);
    const [d] = diagnosticoPorAssunto({
      disciplinas: [bt],
      sessoes: [sessao('bt', null, 60, { origem: 'manual' }), sessao('bt', null, 30, { tipo: 'questoes' })],
      questoes: [],
      simulados: [],
      blocos: [],
      feitos: new Map([['bt1', 0.5]]),
      blocoMin: 60,
      agora: AGORA,
    });
    expect(d.teoria).toEqual({ previstos: 4, feitos: 1.5 }); // 0,5 no tópico + 1 bloco sem tópico; questões não contam
    expect(d.segundos).toBe(90 * 60);
    expect(d.topicos[0].teoria.feitos).toBe(0.5);
  });

  it('tópico cortado fica no detalhe, mas fora da teoria prevista; questões por tópico', () => {
    expect(dRl.teoria).toEqual({ previstos: 4, feitos: 4 });
    expect(dRl.questoes).toEqual({ feitas: 9, acertos: 7 });
    expect(dRl.topicos.map((t) => t.topico.id)).toEqual(['rl1', 'rl2', 'rl3']); // ordem do edital
    expect(dRl.topicos[0]).toMatchObject({ questoes: { feitas: 4, acertos: 4 }, segundos: 3600 });
    expect(dRl.notas.questoes).toBeCloseTo((7 + 2) / 13);
    expect(dRl.notas.simulados).toBeCloseTo(11 / 12);
  });

  it('o que falta pesa as questões do assunto na prova', () => {
    expect(dRl.dominio).toBeGreaterThan(dLum.dominio);
    expect(dRl.emRisco).toBeCloseTo(10 * (1 - dRl.dominio)); // 10 questões na prova
    expect(necessidadePorDisciplina(diag)).toEqual(new Map([['lum', dLum.emRisco], ['rl', dRl.emRisco]]));
  });

  it('para o planejador, o que falta da disciplina é dividido pelo erro de cada tópico', () => {
    const n = necessidadePorTopico(diag);
    expect((n.get('rl1') as number) + (n.get('rl2') as number)).toBeCloseTo(dRl.emRisco);
    expect(n.has('rl3')).toBe(false); // cortado
    expect(n.get('rl2') as number).toBeGreaterThan(n.get('rl1') as number); // 3 de 5 pesa mais que 4 de 4
    expect(n.get('lum1')).toBeCloseTo(dLum.emRisco / 2); // sem questões: meio a meio
  });
});
