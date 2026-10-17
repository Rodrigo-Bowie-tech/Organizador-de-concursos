import { describe, expect, it } from 'vitest';
import { diaDaSemana } from '../../src/dominio/datas';
import { ajusteDosSimulados, blocosDaSessao, dominio, filaDeTeoria, fracaoRevisao, gerarPlano, horarioLivre, janelasDoDia, slotsDoDia, statusSugerido } from '../../src/dominio/planejador';
import type { EntradaPlano } from '../../src/dominio/planejador';
import { relevanciaPorTopico } from '../../src/dominio/diagnostico';
import { iniciarRevisao } from '../../src/dominio/revisoes';
import type { BlocoPlanejado, Concurso, Disciplina, Disponibilidade, Sessao, Simulado, Topico } from '../../src/dominio/tipos';

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

  it('cada bloco no seu horário: se já há outro, logo depois dele; sem lugar até a meia-noite, antes', () => {
    const ocupados = [{ inicio: '20:00', fim: '21:00' }, { inicio: '21:00', fim: '22:00' }];
    expect(horarioLivre(ocupados, '18:00', 60)).toBe('18:00'); // livre
    expect(horarioLivre(ocupados, '20:00', 60)).toBe('22:00'); // 20h e 21h ocupados
    expect(horarioLivre(ocupados, '20:30', 60)).toBe('22:00');
    expect(horarioLivre(ocupados, '19:30', 60)).toBe('22:00'); // 19:30–20:30 bate no das 20h
    expect(horarioLivre(ocupados, '08:00', 60, 14 * 60)).toBe('14:00'); // hoje: não antes de agora
    expect(horarioLivre([{ inicio: '22:00', fim: '24:00' }], '22:30', 60)).toBe('21:00'); // depois não cabe
    expect(horarioLivre([{ inicio: '00:00', fim: '24:00' }], '10:00', 60)).toBeNull();
  });

  describe('a sessão terminada risca os blocos do assunto naquele dia', () => {
    const discs = [disciplina('rl', 'embu', 1, 10, [topico('rl1'), topico('rl2')]), disciplina('pt', 'embu', 1, 10, [topico('pt1')])];
    const bloco = (id: string, inicio: string, fim: string, extra: Partial<BlocoPlanejado> = {}): BlocoPlanejado => ({
      id, dia: '2026-10-16', inicio, fim, concursoId: 'embu', disciplinaId: 'rl', topicoId: 'rl1', tipo: 'questoes', status: 'planejado', motivo: 'questoes', ...extra,
    });
    // Sessão de RL das 08:39 às 09:44 em SP (65 min), sem pausas.
    const sessao = (min: number, extra: Partial<Sessao> = {}): Sessao => ({
      id: 's', concursoId: 'embu', disciplinaId: 'rl', topicoId: 'rl1', tipo: 'questoes', inicio: '2026-10-16T11:39:00.000Z',
      fim: new Date(Date.parse('2026-10-16T11:39:00.000Z') + min * 60_000).toISOString(), pausas: [], segundosLiquidos: min * 60,
      questoesFeitas: 0, acertos: 0, paginas: 0, anotacoes: '', origem: 'cronometro', concluiuTeoria: false, ...extra,
    });
    const blocos = [
      bloco('rl-noite', '20:00', '21:00'),
      bloco('pt-noite', '21:00', '22:00', { disciplinaId: 'pt', topicoId: 'pt1' }),
      bloco('rl-outro-dia', '20:00', '21:00', { dia: '2026-10-17' }),
      bloco('rev', '22:00', '23:00', { disciplinaId: null, topicoId: null, tipo: 'revisao', motivo: 'revisao', revisoes: ['pt1', 'rl2'] }),
    ];

    it('o bloco do assunto vira feito e vai para o horário da sessão; os outros assuntos e dias ficam', () => {
      const m = blocosDaSessao(sessao(65), blocos, discs, Date.parse('2026-10-16T13:00:00Z'));
      expect(m).toEqual([{ ...blocos[0], status: 'feito', inicio: '08:39', fim: '09:39' }]);
    });

    it('sessão longa risca também a revisão com um tópico do assunto; curta deixa parcial', () => {
      const longa = blocosDaSessao(sessao(125), blocos, discs, Date.parse('2026-10-16T14:00:00Z'));
      expect(longa.map((b) => [b.id, b.status, b.inicio, b.fim])).toEqual([
        ['rl-noite', 'feito', '08:39', '09:39'],
        ['rev', 'feito', '09:39', '10:39'],
      ]);
      expect(blocosDaSessao(sessao(20), blocos, discs, Date.parse('2026-10-16T13:00:00Z')).map((b) => b.status)).toEqual(['parcial']);
      expect(blocosDaSessao(sessao(10), blocos, discs, Date.parse('2026-10-16T13:00:00Z'))).toEqual([]); // menos de 25%
    });

    it('bloco que cai no horário da sessão é riscado onde está', () => {
      const naHora = [bloco('rl-manha', '08:30', '09:30'), ...blocos];
      const m = blocosDaSessao(sessao(65), naHora, discs, Date.parse('2026-10-16T13:00:00Z'));
      expect(m[0]).toEqual({ ...naHora[0], status: 'feito' });
    });

    it('a sessão de teoria risca primeiro o bloco de teoria do tópico, mesmo com a revisão dele mais perto', () => {
      const comRevisao = [
        bloco('rev-rl1', '07:00', '07:30', { tipo: 'revisao', motivo: 'revisao' }),
        bloco('teo-rl1', '21:00', '22:00', { tipo: 'teoria', motivo: 'teoria' }),
      ];
      const m = blocosDaSessao(sessao(65, { tipo: 'teoria' }), comRevisao, discs, Date.parse('2026-10-16T13:00:00Z'));
      expect(m.map((b) => [b.id, b.status])).toEqual([['teo-rl1', 'feito']]); // sobram 5 min: pouco para a revisão
    });

    it('sem assunto, nada é riscado', () => {
      expect(blocosDaSessao(sessao(65, { disciplinaId: null, topicoId: null }), blocos, discs, Date.parse('2026-10-16T13:00:00Z'))).toEqual([]);
    });
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

  it('teoria feita toda em blocos fixos (semana de foco) também gera revisões e questões depois', () => {
    const lum = { ...disciplina('lum', 'embu', 1, 1, [topico('lum1', { blocosTeoria: 2 }), topico('lum2', { ordem: 1 })]), ordem: 0 };
    const fixo = (id: string, dia: string): BlocoPlanejado => ({
      id, dia, inicio: '09:00', fim: '10:00', concursoId: 'embu', disciplinaId: 'lum', topicoId: 'lum1', tipo: 'teoria', status: 'planejado', motivo: 'teoria', fixo: true,
    });
    // O segundo bloco (30/09) fecha a teoria; vêm na ordem errada de propósito.
    const p = gerarPlano(base({ disciplinas: [lum], horizonteDias: 20, existentes: [fixo('f2', '2026-09-30'), fixo('f1', '2026-09-29')] }));
    expect(p.filter((b) => b.topicoId === 'lum1' && b.motivo === 'teoria')).toHaveLength(0); // nada além dos fixos
    const revisoes = p.filter((b) => b.motivo.startsWith('revisao') && (b.topicoId === 'lum1' || b.revisoes?.includes('lum1'))).map((b) => b.dia);
    expect(revisoes[0] >= '2026-10-01').toBe(true);
    expect(revisoes.length).toBeGreaterThanOrEqual(2); // D+1 e D+7
    const questoes = p.filter((b) => b.motivo === 'questoes' && b.topicoId === 'lum1').map((b) => b.dia);
    expect(questoes.length).toBeGreaterThan(0);
    expect(questoes[0] >= '2026-10-07').toBe(true); // a partir de D+7
  });

  it('os assuntos que mais caem têm mais blocos de questões; o rodízio continua de onde parou', () => {
    // Teoria toda feita: o plano é só de questões. BT vale 4 questões na prova; Luminotécnica, 1.
    const pronto = (id: string, questoes: number, ordem: number) => ({
      ...disciplina(id, 'embu', 1, questoes, [topico(`${id}1`, { status: 'teoria_concluida' }), topico(`${id}2`, { status: 'teoria_concluida', ordem: 1 })]),
      ordem,
    });
    const discs = [pronto('lum', 1, 0), pronto('bt', 4, 1)];
    const relevancia = relevanciaPorTopico(discs);
    expect(Object.fromEntries(relevancia)).toEqual({ lum1: 0.5, lum2: 0.5, bt1: 2, bt2: 2 });
    const p = gerarPlano(base({ disciplinas: discs, horizonteDias: 40, relevancia }));
    const questoes = p.filter((b) => b.motivo === 'questoes').map((b) => b.disciplinaId);
    expect(questoes).toHaveLength(40);
    const bt = questoes.filter((d) => d === 'bt').length;
    expect(bt).toBeGreaterThanOrEqual(30); // perto de 4 de cada 5
    expect(bt).toBeLessThanOrEqual(34);
    // Nunca praticado vem antes; depois de replanejar, quem acabou de ter questões vai para o fim.
    const ontem = new Map([['bt1', '2026-09-27T23:00:00.000Z'], ['lum1', '2026-09-27T22:00:00.000Z']]);
    const depois = gerarPlano(base({ disciplinas: discs, horizonteDias: 3, relevancia, ultimaQuestao: ontem })).map((b) => b.topicoId);
    expect(depois.slice(0, 2).sort()).toEqual(['bt2', 'lum2']);
    expect(depois[2]).toBe('bt1'); // 4 vezes mais relevante que lum1
  });

  it('pela relevância, o que mais cai tem mais tempo, mas toda a teoria cabe antes da última semana', () => {
    // Prova em 08/11 (6 semanas): RL vale 10 questões e já tem a teoria feita; MT vale 2 e tem 6 blocos
    // de teoria; Manutenção vale 1, com 1 bloco, e é a última na prioridade (no rodízio de 2 nunca entraria).
    const rl = { ...disciplina('rl', 'embu', 1, 10, [topico('rl1', { status: 'revisado' }), topico('rl2', { status: 'revisado', ordem: 1 })]), ordem: 0 };
    const mt = { ...disciplina('mt', 'embu', 1, 2, [topico('mt1', { blocosTeoria: 3 }), topico('mt2', { blocosTeoria: 3, ordem: 1 })]), ordem: 1 };
    const man = { ...disciplina('man', 'embu', 1, 1, [topico('man1', { blocosTeoria: 1 })]), ordem: 2 };
    const discs = [rl, mt, man];
    const p = gerarPlano(base({ concursos: [concurso('embu', '2026-11-08', 5)], disciplinas: discs, intercalar: 2, relevancia: relevanciaPorTopico(discs) }));
    const teoriaAte = (id: string) => p.filter((b) => b.motivo === 'teoria' && b.disciplinaId === id && b.dia <= '2026-11-01').length;
    expect(teoriaAte('mt')).toBe(6); // toda a teoria de MT antes da última semana
    expect(teoriaAte('man')).toBe(1); // a de Manutenção também
    const horas = (id: string) => p.filter((b) => b.disciplinaId === id && (b.motivo === 'teoria' || b.motivo === 'questoes')).length;
    expect(horas('rl')).toBeGreaterThan(horas('mt'));
    expect(horas('mt')).toBeGreaterThan(horas('man'));
  });

  it('blocos fixos e o estudo recente contam no tempo do assunto: a semana de foco não vira horas a mais', () => {
    // Dois assuntos de 2 questões, só questões pela frente; A tem 4 blocos fixos na primeira semana.
    const pronto = (id: string, ordem: number) => ({
      ...disciplina(id, 'embu', 1, 2, [topico(`${id}1`, { status: 'teoria_concluida' }), topico(`${id}2`, { status: 'teoria_concluida', ordem: 1 })]),
      ordem,
    });
    const discs = [pronto('a', 0), pronto('b', 1)];
    const fixo = (dia: string): BlocoPlanejado => ({
      id: `f${dia}`, dia, inicio: '09:00', fim: '10:00', concursoId: 'embu', disciplinaId: 'a', topicoId: 'a1', tipo: 'questoes', status: 'planejado', motivo: 'questoes', fixo: true,
    });
    const existentes = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map(fixo);
    const p = gerarPlano(base({ disciplinas: discs, horizonteDias: 28, relevancia: relevanciaPorTopico(discs), existentes }));
    const conta = (id: string) => p.filter((b) => b.disciplinaId === id).length;
    expect(conta('a') + 4).toBe(conta('b')); // com os fixos, os dois ficam iguais
    // O estudo dos últimos 14 dias também conta: quem estudou 4 h a mais fica com 4 blocos a menos.
    const q = gerarPlano(base({ disciplinas: discs, horizonteDias: 28, relevancia: relevanciaPorTopico(discs), usoRecente: new Map([['b', 240]]) }));
    const contaQ = (id: string) => q.filter((b) => b.disciplinaId === id).length;
    expect(contaQ('a')).toBe(contaQ('b') + 4);
  });

  it('sem estudo recente, começa o que foi mal no simulado e depois o que mais cai, mesmo só com questões', () => {
    // RL (10 questões) só tem questões pela frente; BT (4) e LUM (1) têm teoria; LUM zerou no simulado.
    const rl = { ...disciplina('rl', 'embu', 1, 10, [topico('rl1', { status: 'revisado' }), topico('rl2', { status: 'revisado', ordem: 1 })]), ordem: 9 };
    const discs = [assunto('bt', 0, 4), assunto('lum', 1, 1), rl];
    const sim: Simulado = {
      id: 's', concursoId: 'embu', titulo: 's', dia: '2026-09-27', duracaoMin: 180, observacoes: '', notaTotal: 14, notaMaxima: 15,
      notas: [{ disciplinaId: 'rl', nome: 'rl', nota: 10, maximo: 10 }, { disciplinaId: 'lum', nome: 'lum', nota: 0, maximo: 1 }, { disciplinaId: 'bt', nome: 'bt', nota: 4, maximo: 4 }],
    };
    const p = gerarPlano(base({ disciplinas: discs, horizonteDias: 7, relevancia: relevanciaPorTopico(discs), simulados: [sim] }));
    expect(p.slice(0, 3).map((b) => b.disciplinaId)).toEqual(['lum', 'rl', 'bt']);
    // Um bloco fixo já reservado conta desde o começo: com LUM marcado para sábado, RL abre o plano.
    const fixo: BlocoPlanejado = {
      id: 'f', dia: '2026-10-03', inicio: '20:00', fim: '21:00', concursoId: 'embu', disciplinaId: 'lum', topicoId: 'lum1', tipo: 'teoria', status: 'planejado', motivo: 'teoria', fixo: true,
    };
    const q = gerarPlano(base({ disciplinas: discs, horizonteDias: 7, relevancia: relevanciaPorTopico(discs), simulados: [sim], existentes: [fixo] }));
    expect(q[0].disciplinaId).toBe('rl');
  });

  it('entre concursos, a prova mais próxima e de maior prioridade não perde o tempo para a que tem mais questões', () => {
    // Embu (prova em 06/12, prioridade 5) com 20 questões; Câmara (prova em 2027, prioridade 1) com 80.
    const embu = { ...disciplina('emb', 'embu', 1, 20, [topico('e1', { status: 'revisado' }), topico('e2', { status: 'revisado', ordem: 1 })]), ordem: 0 };
    const cam = { ...disciplina('cam', 'camara', 1, 80, [topico('c1', { status: 'revisado' }), topico('c2', { status: 'revisado', ordem: 1 })]), ordem: 1 };
    const discs = [embu, cam];
    const p = gerarPlano(
      base({ concursos: [concurso('embu', '2026-12-06', 5), concurso('camara', '2027-03-20', 1)], disciplinas: discs, horizonteDias: 28, relevancia: relevanciaPorTopico(discs) }),
    );
    const conta = (id: string) => p.filter((b) => b.disciplinaId === id).length;
    expect(conta('emb')).toBeGreaterThan(conta('cam'));
    expect(conta('cam')).toBeGreaterThan(0);
  });

  it('no rodízio de teoria, o assunto que mais cai volta mais vezes', () => {
    const discs = base().disciplinas.filter((d) => ['bt', 'fp', 'mt'].includes(d.id)); // bt: 4 questões; fp e mt: 2
    const p = gerarPlano(base({ disciplinas: discs, intercalar: 3, horizonteDias: 7, relevancia: relevanciaPorTopico(discs) }));
    const primeiros = teoria(p).slice(0, 6);
    expect(primeiros.slice(0, 3)).toEqual(['bt', 'fp', 'mt']); // nunca estudados: pela ordem
    const conta = (id: string) => primeiros.filter((d) => d === id).length;
    expect(conta('bt')).toBe(3);
    expect(conta('bt')).toBeGreaterThan(conta('fp'));
    expect(conta('bt')).toBeGreaterThan(conta('mt'));
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
