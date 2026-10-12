import { describe, expect, it } from 'vitest';
import { todasAsQuestoes } from '../../src/dominio/desempenho';
import {
  diagnosticoPorAssunto,
  minutosNoPlano,
  relevanciaPorTopico,
  simuladosPorDisciplina,
  teoriaDoTopico,
  ultimoSimuladoPorDisciplina,
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

describe('relevância: o quanto estudar segue a incidência na prova', () => {
  it('divide as questões × peso da disciplina entre os tópicos-folha não cortados', () => {
    const bt = disciplina('bt', [topico('a'), topico('b'), topico('c', { cortado: true }), topico('pai'), topico('filho', { paiId: 'pai' })], { numQuestoes: 4 });
    const pt = disciplina('pt', [topico('crase', { status: 'dominado' }), topico('virgula')], { numQuestoes: 10, peso: 2 });
    const r = relevanciaPorTopico([bt, pt]);
    // bt: 4 questões em 3 folhas válidas (a, b, filho); o cortado e o pai ficam de fora.
    expect(r.get('a')).toBeCloseTo(4 / 3);
    expect(r.get('filho')).toBeCloseTo(4 / 3);
    expect(r.has('c')).toBe(false);
    expect(r.has('pai')).toBe(false);
    // Dominado fica com a sua parte (o plano não a usa): ela não vai para o outro tópico.
    expect(r.get('crase')).toBe(10);
    expect(r.get('virgula')).toBe(10);
  });

  it('com a incidência dos tópicos, o que mais caiu pesa até o dobro do que nunca caiu', () => {
    const bt = disciplina('bt', [topico('a', { incidencia: 4 }), topico('b', { incidencia: 0 }), topico('c')], { numQuestoes: 4 });
    const r = relevanciaPorTopico([bt]);
    expect(r.get('a')).toBeCloseTo(2); // fatores 2, 1 e 1: 4 × 2/4
    expect(r.get('b')).toBeCloseTo(1);
    expect(r.get('c')).toBeCloseTo(1);
  });
});

describe('desempenho e plano', () => {
  it('teoria: blocos feitos até o previsto; teoria concluída conta inteira', () => {
    expect(teoriaDoTopico(topico('a', { blocosTeoria: 3 }), 1.5)).toEqual({ previstos: 3, feitos: 1.5 });
    expect(teoriaDoTopico(topico('a', { blocosTeoria: 2 }), 5)).toEqual({ previstos: 2, feitos: 2 });
    expect(teoriaDoTopico(topico('a'), 0)).toEqual({ previstos: 2, feitos: 0 }); // sem estimativa = 2 blocos
    expect(teoriaDoTopico(topico('a', { status: 'revisado', blocosTeoria: 2 }), 0)).toEqual({ previstos: 2, feitos: 2 });
  });

  it('simulados: soma de todos (nota ÷ peso) e o último em que a disciplina caiu', () => {
    const discs = [disciplina('lum', []), disciplina('pt', [], { peso: 2 })];
    const sims = [simulado('2026-10-12', [['lum', 0, 2], ['pt', 16, 20], ['outra', 1, 1]]), simulado('2026-10-25', [['lum', 2, 2], ['pt', 0, 0]])];
    const s = simuladosPorDisciplina(sims, discs);
    expect(s.get('lum')).toEqual({ feitas: 4, acertos: 2 });
    expect(s.get('pt')).toEqual({ feitas: 10, acertos: 8 }); // peso 2: 20 pontos = 10 questões
    expect(s.has('outra')).toBe(false);
    const u = ultimoSimuladoPorDisciplina(sims, discs);
    expect(u.get('lum')).toEqual({ feitas: 2, acertos: 2 }); // 25/10
    expect(u.get('pt')).toEqual({ feitas: 10, acertos: 8 }); // em 25/10 não caiu (máximo 0): vale 12/10
  });

  it('horas no plano: blocos planejados que não começaram; revisão com vários tópicos é dividida', () => {
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

describe('quanto estudar por assunto', () => {
  const lum = disciplina('lum', [topico('lum1', { blocosTeoria: 2, status: 'em_estudo' }), topico('lum2', { blocosTeoria: 2, ordem: 1 })], { nome: 'Luminotécnica' });
  const rl = disciplina(
    'rl',
    [topico('rl1', { status: 'revisado' }), topico('rl2', { status: 'revisado', ordem: 1 }), topico('rl3', { ordem: 2, cortado: true })],
    { nome: 'Raciocínio Lógico', numQuestoes: 9 },
  );
  const outro = { ...disciplina('cam', [topico('cam1')], { numQuestoes: 50 }), concursoId: 'camara' };
  const sessoes = [sessao('lum', 'lum1', 30), sessao(null, 'lum1', 15, { tipo: 'questoes' }), sessao('rl', 'rl1', 60), sessao('lum', null, 60, { origem: 'manual' })];
  const registros = [registro('rl', 'rl1', 4, 4), registro('rl', 'rl2', 5, 3)];
  const [dLum, dRl] = diagnosticoPorAssunto({
    disciplinas: [lum, rl, outro],
    sessoes,
    questoes: todasAsQuestoes(sessoes, registros),
    simulados: [simulado('2026-10-12', [['lum', 0, 2], ['rl', 9, 9]])],
    blocos: [
      bloco('2026-10-12', '20:00', '21:00'),
      bloco('2026-10-13', '20:00', '21:00', { motivo: 'questoes', tipo: 'questoes', disciplinaId: 'rl', topicoId: 'rl1' }),
      bloco('2026-10-14', '20:00', '21:00', { motivo: 'questoes', tipo: 'questoes', disciplinaId: 'rl', topicoId: 'rl2' }),
      bloco('2026-10-15', '20:00', '21:00', { motivo: 'questoes', tipo: 'questoes', disciplinaId: 'rl', topicoId: 'rl2' }),
    ],
    feitos: new Map([['lum1', 0.5]]),
    blocoMin: 60,
    agora: AGORA,
  });

  it('parte da prova e parte do plano, dentro do concurso', () => {
    expect(dLum.valor).toBe(1);
    expect(dLum.fracaoProva).toBeCloseTo(1 / 10); // 1 de 10 questões de Embu (a Câmara é outro concurso)
    expect(dRl.fracaoProva).toBeCloseTo(9 / 10);
    expect(dLum.minutosNoPlano).toBe(60);
    expect(dLum.fracaoPlano).toBeCloseTo(1 / 4);
    expect(dRl.fracaoPlano).toBeCloseTo(3 / 4);
  });

  it('o desempenho fica como informação: horas, teoria, questões e simulados', () => {
    expect(dLum.segundos).toBe((30 + 15 + 60) * 60); // a sessão sem disciplina conta pelo tópico
    expect(dLum.teoria).toEqual({ previstos: 4, feitos: 1.5 }); // 0,5 no tópico + 1 bloco na disciplina inteira
    expect(dRl.teoria).toEqual({ previstos: 4, feitos: 4 }); // o cortado fica fora
    expect(dRl.questoes).toEqual({ feitas: 9, acertos: 7 });
    expect(dRl.topicos.map((t) => t.topico.id)).toEqual(['rl1', 'rl2', 'rl3']); // ordem do edital
    expect(dRl.topicos[0]).toMatchObject({ questoes: { feitas: 4, acertos: 4 }, segundos: 3600 });
  });

  it('foi mal no último simulado em que caiu: estudar logo (sem mais horas por isso)', () => {
    expect(dLum.ultimoSimulado).toEqual({ feitas: 2, acertos: 0 });
    expect(dLum.urgente).toBe(true);
    expect(dRl.urgente).toBe(false);
  });
});
