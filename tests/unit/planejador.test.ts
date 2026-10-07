import { describe, expect, it } from 'vitest';
import { diaDaSemana } from '../../src/dominio/datas';
import { ajusteDosSimulados, dominio, filaDeTeoria, fracaoRevisao, gerarPlano, janelasDoDia, slotsDoDia, statusSugerido } from '../../src/dominio/planejador';
import type { EntradaPlano } from '../../src/dominio/planejador';
import { iniciarRevisao } from '../../src/dominio/revisoes';
import type { BlocoPlanejado, Concurso, Disciplina, Disponibilidade, Simulado, Topico } from '../../src/dominio/tipos';

// Segunda-feira, 28/09/2026, 05:00 em São Paulo.
const AGORA = new Date('2026-09-28T08:00:00Z');

function topico(id: string, extra: Partial<Topico> = {}): Topico {
  return { id, paiId: null, titulo: id, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...extra };
}

function disciplina(id: string, concursoId: string, peso: number, numQuestoes: number, topicos: Topico[]): Disciplina {
  return { id, concursoId, editalId: null, nome: id, peso, numQuestoes, tipo: 'especifica', ordem: 0, cor: '#000', topicos: Object.fromEntries(topicos.map((t) => [t.id, t])) };
}

function concurso(id: string, dataProva: string | null, prioridade = 3): Concurso {
  return { id, nome: id, orgao: '', banca: '', cargo: '', area: '', dataProva, status: 'inscrito', link: '', notaCorte: null, prioridade, criadoEm: '' };
}

// Seg a sex: 06:00–07:30 e 20:00–22:30. Sábado: 09:00–12:00. Domingo livre.
const GRADE: Disponibilidade = {
  blocoMin: 60,
  dias: {
    '1': [{ inicio: '06:00', fim: '07:30' }, { inicio: '20:00', fim: '22:30' }],
    '2': [{ inicio: '06:00', fim: '07:30' }, { inicio: '20:00', fim: '22:30' }],
    '3': [{ inicio: '06:00', fim: '07:30' }, { inicio: '20:00', fim: '22:30' }],
    '4': [{ inicio: '06:00', fim: '07:30' }, { inicio: '20:00', fim: '22:30' }],
    '5': [{ inicio: '06:00', fim: '07:30' }, { inicio: '20:00', fim: '22:30' }],
    '6': [{ inicio: '09:00', fim: '12:00' }],
  },
  excecoes: {
    '2026-09-30': { blocos: [], motivo: 'Plantão' },
    '2026-10-01': { blocos: [{ inicio: '14:00', fim: '16:00' }], motivo: 'Folga à tarde' },
  },
};

let n = 0;
const novoId = () => `b${++n}`;

function entrada(extra: Partial<EntradaPlano> = {}): EntradaPlano {
  const eletrica = disciplina('eletrica', 'ff', 2, 40, Array.from({ length: 8 }, (_, i) => topico(`e${i + 1}`)));
  const portugues = disciplina('portugues', 'ff', 1, 20, Array.from({ length: 4 }, (_, i) => topico(`p${i + 1}`)));
  return { agora: AGORA, concursos: [concurso('ff', '2026-12-13')], disciplinas: [eletrica, portugues], disponibilidade: GRADE, existentes: [], novoId, ...extra };
}

describe('disponibilidade', () => {
  it('divide as janelas em blocos de 60 min; a sobra de 30 min vira bloco menor', () => {
    expect(slotsDoDia(GRADE, '2026-09-28')).toEqual([
      { inicio: '06:00', fim: '07:00' },
      { inicio: '07:00', fim: '07:30' },
      { inicio: '20:00', fim: '21:00' },
      { inicio: '21:00', fim: '22:00' },
      { inicio: '22:00', fim: '22:30' },
    ]);
  });

  it('sobra menor que 25 min estica o último bloco', () => {
    const d: Disponibilidade = { blocoMin: 60, dias: { '1': [{ inicio: '08:00', fim: '09:15' }] }, excecoes: {} };
    expect(slotsDoDia(d, '2026-09-28')).toEqual([{ inicio: '08:00', fim: '09:15' }]);
  });

  it('exceção substitui a grade do dia', () => {
    expect(janelasDoDia(GRADE, '2026-09-30')).toEqual([]);
    expect(janelasDoDia(GRADE, '2026-10-01')).toEqual([{ inicio: '14:00', fim: '16:00' }]);
  });
});

describe('prioridade (5.1)', () => {
  it('domínio combina teoria, autoavaliação e acerto recente', () => {
    expect(dominio(topico('a'))).toBe(0);
    expect(dominio(topico('a', { status: 'teoria_concluida', autoavaliacao: 5 }), { taxa: 0.8, feitas: 20 })).toBeCloseTo(0.45 + 0.25 + 0.2);
    expect(dominio(topico('a', { status: 'dominado' }))).toBeGreaterThanOrEqual(0.9);
  });

  it('tópico de peso alto e domínio baixo vem antes do de peso baixo e domínio alto', () => {
    const alta = disciplina('alta', 'ff', 3, 40, [topico('pesado')]);
    const baixa = disciplina('baixa', 'ff', 1, 10, [topico('leve', { status: 'em_estudo', autoavaliacao: 4 })]);
    const fila = filaDeTeoria([concurso('ff', '2026-12-13')], [baixa, alta], new Map(), '2026-09-28');
    expect(fila.map((i) => i.topico.id)).toEqual(['pesado', 'leve']);
    const plano = gerarPlano(entrada({ disciplinas: [baixa, alta] }));
    expect(plano[0].topicoId).toBe('pesado');
  });

  it('incidência na banca aumenta a prioridade', () => {
    const d = disciplina('d', 'ff', 1, 10, [topico('raro', { incidencia: 0 }), topico('comum', { incidencia: 12 })]);
    expect(filaDeTeoria([concurso('ff', null)], [d], new Map(), '2026-09-28')[0].topico.id).toBe('comum');
  });
});

describe('geração do plano (5.2)', () => {
  it('respeita os blocos de disponibilidade e as exceções', () => {
    const plano = gerarPlano(entrada());
    expect(plano.length).toBeGreaterThan(0);
    for (const b of plano) {
      const dentro = janelasDoDia(GRADE, b.dia).some((j) => j.inicio <= b.inicio && b.fim <= j.fim);
      expect(dentro, `${b.dia} ${b.inicio}-${b.fim}`).toBe(true);
      expect(diaDaSemana(b.dia)).not.toBe(0); // domingo livre
    }
    expect(plano.some((b) => b.dia === '2026-09-30')).toBe(false); // plantão
    expect(plano.filter((b) => b.dia === '2026-10-01').map((b) => b.inicio)).toEqual(['14:00', '15:00']);
  });

  it('não planeja no passado nem por cima de blocos já marcados', () => {
    const feito: BlocoPlanejado = {
      id: 'x', dia: '2026-09-28', inicio: '20:00', fim: '21:00', concursoId: 'ff', disciplinaId: 'portugues', topicoId: 'p1', tipo: 'teoria', status: 'feito', motivo: 'teoria',
    };
    const plano = gerarPlano(entrada({ agora: new Date('2026-09-28T10:30:00Z'), existentes: [feito] })); // 07:30 em SP
    const hoje = plano.filter((b) => b.dia === '2026-09-28').map((b) => b.inicio);
    expect(hoje).toEqual(['21:00', '22:00']);
  });

  it('alterna disciplinas: nunca mais de 2 blocos seguidos da mesma quando há outra', () => {
    const plano = gerarPlano(entrada());
    for (let i = 2; i < plano.length; i++) {
      const [a, b, c] = [plano[i - 2], plano[i - 1], plano[i]];
      if (c.motivo !== 'teoria' || a.disciplinaId !== c.disciplinaId || b.disciplinaId !== c.disciplinaId) continue;
      // Três seguidos só quando não havia teoria de outra disciplina para pôr ali.
      const haviaOutra = plano.slice(i).some((x) => x.motivo === 'teoria' && x.disciplinaId !== c.disciplinaId);
      expect(haviaOutra, `blocos ${i - 2}–${i}`).toBe(false);
    }
    expect(new Set(plano.slice(0, 6).map((b) => b.disciplinaId)).size).toBe(2);
  });

  it('a fração de revisão e questões cresce perto da prova', () => {
    expect(fracaoRevisao(90)).toBe(0.2);
    expect(fracaoRevisao(30)).toBeCloseTo(0.2 + (12 / 21) * 0.4);
    expect(fracaoRevisao(10)).toBe(0.6);
    // Muita teoria pela frente (60 tópicos) e 5 tópicos já vistos para questões.
    const vistos = disciplina('d', 'ff', 1, 10, Array.from({ length: 65 }, (_, i) => topico(`t${i}`, i < 5 ? { status: 'teoria_concluida' } : {})));
    const longe = gerarPlano(entrada({ concursos: [concurso('ff', '2027-03-01')], disciplinas: [vistos], horizonteDias: 14 }));
    const perto = gerarPlano(entrada({ concursos: [concurso('ff', '2026-10-12')], disciplinas: [vistos], horizonteDias: 14 }));
    const parte = (p: BlocoPlanejado[]) => p.filter((b) => b.motivo !== 'teoria').length / p.length;
    expect(parte(longe)).toBeCloseTo(0.2, 1);
    expect(parte(perto)).toBeGreaterThan(0.5);
  });

  it('não planeja depois da última prova', () => {
    const plano = gerarPlano(entrada({ concursos: [concurso('ff', '2026-10-03')] }));
    expect(plano.every((b) => b.dia <= '2026-10-03')).toBe(true);
  });
});

describe('revisões no plano (5.3)', () => {
  it('revisão atrasada entra no primeiro bloco livre', () => {
    const d = disciplina('d', 'ff', 1, 10, [
      topico('velho', { status: 'teoria_concluida', revisao: { ...iniciarRevisao('2026-09-20'), proxima: '2026-09-21' } }),
      ...Array.from({ length: 3 }, (_, i) => topico(`n${i}`)),
    ]);
    const plano = gerarPlano(entrada({ disciplinas: [d] }));
    expect(plano[0]).toMatchObject({ topicoId: 'velho', motivo: 'revisao_atrasada', tipo: 'revisao' });
  });

  it('teoria planejada gera revisões em D+1 e D+7 dentro do plano', () => {
    const d = disciplina('d', 'ff', 1, 10, [topico('unico')]);
    const plano = gerarPlano(entrada({ disciplinas: [d] }));
    const teoria = plano.filter((b) => b.topicoId === 'unico' && b.motivo === 'teoria');
    const ultimoDia = teoria[teoria.length - 1].dia;
    const revisoes = plano.filter((b) => b.topicoId === 'unico' && b.motivo === 'revisao').map((b) => b.dia);
    expect(revisoes[0] >= '2026-09-29' && revisoes[0] > ultimoDia).toBe(true);
    expect(revisoes).toHaveLength(2);
  });
});

describe('ajuste à realidade (5.4)', () => {
  it('pular 3 dias seguidos replaneja sem perder tópicos', () => {
    const e = entrada({ horizonteDias: 21 });
    const antes = gerarPlano(e);
    const topicosAntes = new Set(antes.filter((b) => b.motivo === 'teoria').map((b) => b.topicoId));
    // Os 3 primeiros dias foram pulados: os blocos ficam no histórico como "pulado".
    const pulados = antes.filter((b) => b.dia <= '2026-09-30').map((b) => ({ ...b, status: 'pulado' as const }));
    const depois = gerarPlano({ ...e, agora: new Date('2026-10-01T08:00:00Z'), existentes: pulados });
    const topicosDepois = new Set(depois.filter((b) => b.motivo === 'teoria').map((b) => b.topicoId));
    for (const t of topicosAntes) expect(topicosDepois.has(t), `tópico ${t}`).toBe(true);
    expect(depois.every((b) => b.dia >= '2026-10-01')).toBe(true);
  });

  it('capacidade real menor que a declarada reduz a carga planejada', () => {
    const cheio = gerarPlano(entrada({ horizonteDias: 7 }));
    const real = gerarPlano(entrada({ horizonteDias: 7, capacidadeMin: { '1': 60, '2': 60, '3': 60, '4': 60, '5': 60, '6': 120 } }));
    expect(real.length).toBeLessThan(cheio.length);
    const segunda = real.filter((b) => b.dia === '2026-09-28');
    expect(segunda).toHaveLength(1);
  });

  it('dois concursos com tópico vinculado não duplicam o estudo', () => {
    const a = disciplina('a', 'petro', 1, 10, [topico('trafo-a', { grupoEquivalenciaId: 'g1' }), topico('outro-a')]);
    const b = disciplina('b', 'transpetro', 1, 10, [topico('trafo-b', { grupoEquivalenciaId: 'g1' }), topico('outro-b')]);
    const plano = gerarPlano(entrada({ concursos: [concurso('petro', '2026-12-01'), concurso('transpetro', '2026-12-20')], disciplinas: [a, b] }));
    const trafo = plano.filter((x) => x.motivo === 'teoria' && (x.topicoId === 'trafo-a' || x.topicoId === 'trafo-b'));
    expect(new Set(trafo.map((x) => x.topicoId)).size).toBe(1);
    expect(trafo).toHaveLength(2); // 2 blocos de teoria, uma vez só
    const fila = filaDeTeoria([concurso('petro', '2026-12-01'), concurso('transpetro', '2026-12-20')], [a, b], new Map(), '2026-09-28');
    expect(fila.find((i) => i.topico.grupoEquivalenciaId === 'g1')?.concursoIds.sort()).toEqual(['petro', 'transpetro']);
  });

  it('tópico cortado sai do plano', () => {
    const d = disciplina('d', 'ff', 1, 10, [topico('fica'), topico('corta', { cortado: true })]);
    expect(gerarPlano(entrada({ disciplinas: [d] })).some((b) => b.topicoId === 'corta')).toBe(false);
  });
});

describe('realizado × planejado', () => {
  it('sugere feito ou parcial pelo tempo cronometrado no horário', () => {
    const b = { dia: '2026-09-28', inicio: '20:00', fim: '21:00' };
    expect(statusSugerido(b, 50 * 60)).toBe('feito');
    expect(statusSugerido(b, 20 * 60)).toBe('parcial');
    expect(statusSugerido(b, 5 * 60)).toBeNull();
  });
});

describe('cronograma por assuntos: rodízio, simulados e horizonte', () => {
  // Uma hora por noite, todos os dias.
  const NOITE: Disponibilidade = {
    blocoMin: 60,
    dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ inicio: '20:00', fim: '21:00' }]])),
    excecoes: {},
  };
  const assunto = (id: string, ordem: number, questoes: number, n = 2) => ({
    ...disciplina(id, 'embu', 1, questoes, Array.from({ length: n }, (_, i) => topico(`${id}${i + 1}`, { ordem: i }))),
    ordem,
  });
  const base = (extra: Partial<EntradaPlano> = {}): EntradaPlano => ({
    agora: AGORA,
    concursos: [concurso('embu', '2026-12-06', 5)],
    disciplinas: [assunto('bt', 0, 4), assunto('fp', 1, 2), assunto('mt', 2, 2), assunto('prot', 3, 2), assunto('spda', 4, 2), assunto('lum', 5, 1)],
    disponibilidade: NOITE,
    existentes: [],
    novoId,
    ...extra,
  });
  const teoria = (p: BlocoPlanejado[]) => p.filter((b) => b.motivo === 'teoria').map((b) => b.disciplinaId);

  it('intercala os 4 assuntos de maior prioridade, um por bloco, na ordem das disciplinas', () => {
    const p = gerarPlano(base({ intercalar: 4, horizonteDias: 10 }));
    expect(teoria(p).slice(0, 8)).toEqual(['bt', 'fp', 'mt', 'prot', 'bt', 'fp', 'mt', 'prot']);
    // As revisões esperam juntar: a do bt1 (devida em 03/10) espera 2 dias e sai num bloco só com fp1 e mt1.
    const revisao = p.find((b) => b.motivo === 'revisao');
    expect(revisao).toMatchObject({ dia: '2026-10-05', topicoId: null, disciplinaId: null, revisoes: ['bt1', 'fp1', 'mt1'] });
    // Cada tópico tem os seus 2 blocos de teoria, um em cada volta do rodízio.
    expect(p.filter((b) => b.topicoId === 'bt1' && b.motivo === 'teoria').map((b) => b.dia)).toEqual(['2026-09-28', '2026-10-02']);
  });

  it('continua o rodízio de onde parou: o assunto estudado por último vai para o fim', () => {
    const ultimoEstudo = new Map([['bt', '2026-09-27T23:00:00.000Z']]);
    const p = gerarPlano(base({ intercalar: 4, horizonteDias: 4, ultimoEstudo }));
    expect(teoria(p)).toEqual(['fp', 'mt', 'prot', 'bt']);
  });

  it('quando um assunto acaba, o próximo por prioridade entra no rodízio', () => {
    const p = gerarPlano(base({ intercalar: 2, horizonteDias: 30 }));
    const ordem = teoria(p).filter((d, i, a) => a.indexOf(d) === i);
    expect(ordem).toEqual(['bt', 'fp', 'mt', 'prot', 'spda', 'lum']);
  });

  it('sem rodízio, o desempate segue a ordem das disciplinas e do edital', () => {
    const fila = filaDeTeoria([concurso('embu', '2026-12-06')], base().disciplinas, new Map(), '2026-09-28');
    expect(fila.slice(0, 5).map((i) => i.topico.id)).toEqual(['bt1', 'bt2', 'fp1', 'fp2', 'mt1']);
  });

  it('o último simulado dá o tom: área fraca sobe, área forte desce, com efeito menor se teve poucas questões', () => {
    const discs = base().disciplinas;
    const simulado = (dia: string, notas: [string, number, number][]): Simulado => ({
      id: dia, concursoId: 'embu', titulo: dia, dia, duracaoMin: 180, observacoes: '', notaTotal: 0, notaMaxima: 0,
      notas: notas.map(([disciplinaId, nota, maximo]) => ({ disciplinaId, nome: disciplinaId, nota, maximo })),
    });
    const ajustes = ajusteDosSimulados(
      [simulado('2026-09-20', [['lum', 0, 5]]), simulado('2026-09-27', [['spda', 0, 5], ['bt', 5, 5], ['fp', 0, 1]])],
      discs,
    );
    expect(ajustes.get('spda')?.fator).toBeCloseTo(1.5);
    expect(ajustes.get('bt')?.fator).toBeCloseTo(0.7);
    expect(ajustes.get('fp')?.fator).toBeCloseTo(1.1); // 1 questão: 1/5 do efeito
    expect(ajustes.get('lum')?.fator).toBeCloseTo(1.5); // vale o último simulado em que apareceu
    const sims = [simulado('2026-09-27', [['spda', 0, 5], ['bt', 5, 5]])];
    const fila = filaDeTeoria([concurso('embu', '2026-12-06')], discs, new Map(), '2026-09-28', sims);
    expect(fila[0].disciplina.id).toBe('spda'); // 2 questões × 1,5 = 3 > fp 2... e bt 4 × 0,7 = 2,8
    const p = gerarPlano(base({ intercalar: 4, horizonteDias: 4, simulados: sims }));
    expect(teoria(p)).toEqual(['bt', 'fp', 'mt', 'spda']); // spda entra no rodízio no lugar de prot
  });

  it('assunto "dominado" não ganha blocos de questões, a não ser que caia no simulado', () => {
    const pt = { ...disciplina('pt', 'embu', 1, 10, [topico('crase', { status: 'dominado' }), topico('virgula', { status: 'dominado' })]), ordem: 9 };
    const discs = [...base().disciplinas, pt];
    const semSimulado = gerarPlano(base({ disciplinas: discs, intercalar: 4, horizonteDias: 21 }));
    expect(semSimulado.some((b) => b.disciplinaId === 'pt')).toBe(false);
    const fraco: Simulado = {
      id: 's', concursoId: 'embu', titulo: 's', dia: '2026-09-27', duracaoMin: 180, observacoes: '', notaTotal: 5, notaMaxima: 10,
      notas: [{ disciplinaId: 'pt', nome: 'pt', nota: 5, maximo: 10 }],
    };
    const comSimulado = gerarPlano(base({ disciplinas: discs, intercalar: 4, horizonteDias: 21, simulados: [fraco] }));
    expect(comSimulado.some((b) => b.disciplinaId === 'pt' && b.motivo === 'questoes')).toBe(true);
  });

  it('com a data da prova, o plano vai até ela (concurso sem disciplinas não conta)', () => {
    const p = gerarPlano(base({ concursos: [concurso('embu', '2026-12-06', 5), concurso('transpetro', null)], intercalar: 4 }));
    const dias = p.map((b) => b.dia).sort();
    expect(dias[dias.length - 1] > '2026-10-26').toBe(true); // passa das 4 semanas
    expect(dias[dias.length - 1] <= '2026-12-06').toBe(true);
    // Sem data em um concurso com disciplinas, volta às 4 semanas.
    const semData = gerarPlano(base({ concursos: [concurso('embu', null, 5)], intercalar: 4 }));
    expect(semData.every((b) => b.dia < '2026-10-26')).toBe(true);
  });

  it('bloco de simulado fixo ocupa o horário e não tira nada da fila', () => {
    const simulado: BlocoPlanejado = {
      id: 'sim', dia: '2026-09-29', inicio: '20:00', fim: '21:00', concursoId: 'embu', disciplinaId: null, topicoId: null,
      tipo: 'simulado', status: 'planejado', motivo: 'simulado', fixo: true,
    };
    const p = gerarPlano(base({ intercalar: 4, horizonteDias: 5, existentes: [simulado] }));
    expect(p.some((b) => b.dia === '2026-09-29')).toBe(false);
    expect(teoria(p)).toEqual(['bt', 'fp', 'mt', 'prot']);
  });
});
