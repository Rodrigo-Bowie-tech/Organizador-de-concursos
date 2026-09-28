import { describe, expect, it } from 'vitest';
import { disciplinasEsquecidas, esforcoPorDisciplina, projecaoCobertura, topicosParados, valorNaProva } from '../../src/dominio/balanco';
import type { Disciplina, Sessao, Topico } from '../../src/dominio/tipos';

const AGORA = new Date('2026-09-30T15:00:00Z'); // quarta, 30/09/2026, 12:00 em SP
const HOJE = '2026-09-30';

function topico(id: string, extra: Partial<Topico> = {}): Topico {
  return { id, paiId: null, titulo: id, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...extra };
}

function disciplina(id: string, peso: number, numQuestoes: number | null, topicos: Topico[] = []): Disciplina {
  return {
    id,
    concursoId: 'c1',
    editalId: null,
    nome: id,
    peso,
    numQuestoes,
    tipo: 'especifica',
    ordem: 0,
    cor: '#000',
    topicos: Object.fromEntries(topicos.map((t) => [t.id, t])),
  };
}

function sessao(disciplinaId: string, inicio: string, horas: number, extra: Partial<Sessao> = {}): Sessao {
  const fim = new Date(Date.parse(inicio) + horas * 3600_000).toISOString();
  return {
    id: `${disciplinaId}-${inicio}`,
    concursoId: 'c1',
    disciplinaId,
    topicoId: null,
    tipo: 'teoria',
    inicio,
    fim,
    pausas: [],
    segundosLiquidos: horas * 3600,
    questoesFeitas: 0,
    acertos: 0,
    paginas: 0,
    anotacoes: '',
    origem: 'manual',
    concluiuTeoria: false,
    ...extra,
  };
}

describe('tempo × peso', () => {
  const eletrica = disciplina('eletrica', 2, 40); // vale 80
  const portugues = disciplina('portugues', 1, 20); // vale 20

  it('peso efetivo é peso × questões', () => {
    expect(valorNaProva(eletrica)).toBe(80);
    expect(valorNaProva({ peso: 1.5, numQuestoes: null })).toBe(1.5);
  });

  it('compara a fração do tempo com a fração da prova, só na janela de 4 semanas', () => {
    const sessoes = [
      sessao('portugues', '2026-09-29T12:00:00Z', 3),
      sessao('eletrica', '2026-09-28T12:00:00Z', 1),
      sessao('eletrica', '2026-08-01T12:00:00Z', 10), // fora da janela
    ];
    const [e, p] = esforcoPorDisciplina([eletrica, portugues], sessoes, AGORA);
    expect(e.fracaoPeso).toBeCloseTo(0.8);
    expect(e.fracaoTempo).toBeCloseTo(0.25);
    expect(p.fracaoTempo).toBeCloseTo(0.75);
    expect(e.diasSemEstudo).toBe(2);
  });

  it('aponta a disciplina de peso alto esquecida', () => {
    const sessoes = [sessao('portugues', '2026-09-29T12:00:00Z', 3), sessao('eletrica', '2026-09-15T12:00:00Z', 1)];
    const esquecidas = disciplinasEsquecidas(esforcoPorDisciplina([eletrica, portugues], sessoes, AGORA));
    expect(esquecidas.map((l) => [l.disciplina.id, l.diasSemEstudo])).toEqual([['eletrica', 15]]);
  });

  it('disciplina nunca estudada conta como esquecida', () => {
    const esquecidas = disciplinasEsquecidas(esforcoPorDisciplina([eletrica, portugues], [], AGORA));
    expect(esquecidas.map((l) => l.disciplina.id)).toEqual(['eletrica']);
  });
});

describe('tópicos parados', () => {
  it('lista tópicos em estudo sem sessão há 14 dias ou mais', () => {
    const d = disciplina('eletrica', 1, null, [
      topico('trafos', { status: 'em_estudo' }),
      topico('motores', { status: 'em_estudo' }),
      topico('ohm', { status: 'teoria_concluida' }),
    ]);
    const sessoes = [
      sessao('eletrica', '2026-09-10T12:00:00Z', 1, { topicoId: 'trafos' }),
      sessao('eletrica', '2026-09-25T12:00:00Z', 1, { topicoId: 'motores' }),
      sessao('eletrica', '2026-09-01T12:00:00Z', 1, { topicoId: 'ohm' }),
    ];
    expect(topicosParados([d], sessoes, HOJE).map((p) => [p.topico.id, p.dias])).toEqual([['trafos', 20]]);
  });
});

describe('projeção de cobertura', () => {
  it('projeta pelo ritmo das últimas 4 semanas', () => {
    // 10 tópicos; 2 concluídos na janela (8 dias atrás e ontem) e 1 concluído há 2 meses.
    const topicos = [
      topico('t1', { status: 'teoria_concluida', concluidoEm: '2026-09-22T12:00:00Z' }),
      topico('t2', { status: 'revisado', concluidoEm: '2026-09-29T12:00:00Z' }),
      topico('t3', { status: 'dominado', concluidoEm: '2026-07-30T12:00:00Z' }),
      ...Array.from({ length: 7 }, (_, i) => topico(`n${i}`)),
    ];
    // Prova em 28 dias (4 semanas): ritmo de 0,5 tópico/semana → +2 tópicos.
    const p = projecaoCobertura([disciplina('d', 1, null, topicos)], [], '2026-10-28', HOJE)!;
    expect(p.total).toBe(10);
    expect(p.concluidos).toBe(3);
    expect(p.ritmoSemanal).toBeCloseTo(0.5);
    expect(p.projetados).toBeCloseTo(5);
    expect(p.fracaoProjetada).toBeCloseTo(0.5);
    expect(p.necessarioPorSemana).toBeCloseTo(7 / 4);
  });

  it('usa a sessão com "concluí a teoria" quando o tópico não tem data de conclusão', () => {
    const topicos = [topico('t1', { status: 'teoria_concluida' }), topico('t2')];
    const sessoes = [sessao('d', '2026-09-28T12:00:00Z', 1, { topicoId: 't1', concluiuTeoria: true })];
    const p = projecaoCobertura([disciplina('d', 1, null, topicos)], sessoes, '2026-10-28', HOJE)!;
    expect(p.ritmoSemanal).toBeCloseTo(0.25);
  });

  it('não projeta prova que já passou nem edital sem tópicos', () => {
    expect(projecaoCobertura([disciplina('d', 1, null, [topico('t')])], [], '2026-09-01', HOJE)).toBeNull();
    expect(projecaoCobertura([disciplina('d', 1, null)], [], '2026-12-01', HOJE)).toBeNull();
  });
});
