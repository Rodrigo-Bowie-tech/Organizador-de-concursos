import { describe, expect, it } from 'vitest';
import {
  acertoSemanal,
  acharTopico,
  distanciaCorte,
  errosParaRevisar,
  heatmapAno,
  lerCsvDesempenho,
  minutosPorHora,
  planejadoRealizado,
  proximaRevisaoErro,
  rendimentoPorFaixa,
  revisarErro,
  todasAsQuestoes,
} from '../../src/dominio/desempenho';
import type { BlocoPlanejado, Disciplina, ErroCaderno, RegistroQuestoes, Sessao, Topico } from '../../src/dominio/tipos';

function sessao(inicio: string, minutos: number, extra: Partial<Sessao> = {}): Sessao {
  return {
    id: inicio,
    concursoId: null,
    disciplinaId: 'd',
    topicoId: 't1',
    tipo: 'questoes',
    inicio,
    fim: new Date(Date.parse(inicio) + minutos * 60_000).toISOString(),
    pausas: [],
    segundosLiquidos: minutos * 60,
    questoesFeitas: 0,
    acertos: 0,
    paginas: 0,
    anotacoes: '',
    origem: 'manual',
    concluiuTeoria: false,
    ...extra,
  };
}

const registro = (dia: string, feitas: number, acertos: number, topicoId = 't1'): RegistroQuestoes => ({ id: dia, concursoId: null, disciplinaId: 'd', topicoId, dia, feitas, acertos, fonte: 'QConcursos' });

describe('questões', () => {
  it('junta sessões e registros avulsos, com a hora de SP das sessões', () => {
    const q = todasAsQuestoes([sessao('2026-09-28T10:00:00Z', 60, { questoesFeitas: 10, acertos: 8 })], [registro('2026-09-29', 20, 15)]);
    expect(q).toEqual([
      { topicoId: 't1', disciplinaId: 'd', dia: '2026-09-28', feitas: 10, acertos: 8, hora: 7 },
      { topicoId: 't1', disciplinaId: 'd', dia: '2026-09-29', feitas: 20, acertos: 15, hora: null },
    ]);
  });

  it('acerto semanal com semanas sem questões em branco', () => {
    const q = todasAsQuestoes([], [registro('2026-09-28', 10, 5), registro('2026-09-30', 10, 9), registro('2026-09-15', 4, 4)]);
    const s = acertoSemanal(q, '2026-10-01', 3);
    expect(s).toEqual([
      { semana: '2026-09-13', taxa: 1, feitas: 4 },
      { semana: '2026-09-20', taxa: null, feitas: 0 },
      { semana: '2026-09-27', taxa: 0.7, feitas: 20 },
    ]);
  });
});

describe('estatísticas', () => {
  it('planejado × realizado por semana', () => {
    const bloco = (dia: string, status: BlocoPlanejado['status']): BlocoPlanejado => ({ id: dia, dia, inicio: '20:00', fim: '21:00', concursoId: null, disciplinaId: null, topicoId: null, tipo: 'teoria', status, motivo: 'teoria' });
    const r = planejadoRealizado([bloco('2026-09-28', 'feito'), bloco('2026-09-29', 'pulado')], [sessao('2026-09-28T23:00:00Z', 45)], '2026-10-01', 2);
    expect(r).toEqual([
      { semana: '2026-09-20', planejado: 0, realizado: 0 },
      { semana: '2026-09-27', planejado: 120, realizado: 45 },
    ]);
  });

  it('heatmap de 53 semanas termina na semana de hoje e marca o futuro', () => {
    const h = heatmapAno(new Map([['2026-09-28', 3600]]), '2026-09-30');
    expect(h).toHaveLength(53);
    const ultima = h[52];
    expect(ultima[0].dia).toBe('2026-09-27');
    expect(ultima[1].segundos).toBe(3600);
    expect(ultima[4].futuro).toBe(true);
  });

  it('melhor horário: minutos por hora e acerto por faixa', () => {
    // 07:30–08:30 em SP com 10 questões (9 certas); 20:00–21:00 com 10 (5 certas).
    const s = [
      sessao('2026-09-28T10:30:00Z', 60, { questoesFeitas: 10, acertos: 9 }),
      sessao('2026-09-28T23:00:00Z', 60, { questoesFeitas: 10, acertos: 5 }),
    ];
    const h = minutosPorHora(s, 0);
    expect(h[7]).toBe(30);
    expect(h[8]).toBe(30);
    expect(h[20]).toBe(60);
    const f = rendimentoPorFaixa(s, 0);
    expect(f.find((x) => x.nome === 'Manhã')).toMatchObject({ minutos: 60, taxa: 0.9 });
    expect(f.find((x) => x.nome === 'Noite')).toMatchObject({ minutos: 60, taxa: 0.5 });
  });
});

describe('CSV de desempenho', () => {
  it('lê com cabeçalho, ponto e vírgula, data brasileira e aspas', () => {
    const csv = 'Tópico;Feitas;Acertos;Data;Fonte\n"Transformadores; ensaios";20;15;28/09/2026;QConcursos\nLei de Ohm;10;12;;\nsem numeros;x;y\n';
    const r = lerCsvDesempenho(csv);
    expect(r.linhas).toEqual([
      { linha: 2, topico: 'Transformadores; ensaios', feitas: 20, acertos: 15, dia: '2026-09-28', fonte: 'QConcursos' },
      { linha: 3, topico: 'Lei de Ohm', feitas: 10, acertos: 10, dia: null, fonte: '' },
    ]);
    expect(r.erros).toEqual(['Linha 4: precisa de tópico, questões feitas e acertos.']);
  });

  it('lê sem cabeçalho, separado por vírgula', () => {
    expect(lerCsvDesempenho('Crase,10,7').linhas[0]).toMatchObject({ topico: 'Crase', feitas: 10, acertos: 7 });
  });

  it('acha o tópico pelo título, sem acento e com palavras em comum', () => {
    const t = (id: string, titulo: string): Topico => ({ id, paiId: null, titulo, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null });
    const d = { id: 'd', topicos: { a: t('a', 'Transformadores: ensaios e perdas'), b: t('b', 'Crase') } } as unknown as Disciplina;
    expect(acharTopico('crase', [d])).toEqual({ disciplinaId: 'd', topicoId: 'b' });
    expect(acharTopico('Ensaios de transformadores', [d])).toEqual({ disciplinaId: 'd', topicoId: 'a' });
    expect(acharTopico('Geometria', [d])).toBeNull();
  });
});

describe('caderno de erros', () => {
  const erro = (criadoEm: string, feitas: string[] = []): ErroCaderno => ({
    id: 'e', disciplinaId: 'd', topicoId: null, enunciado: '', minhaResposta: '', respostaCerta: '', motivo: 'pegadinha', comentario: '', fonte: '', explicacaoIA: '',
    criadoEm, revisoesFeitas: feitas, proximaRevisao: proximaRevisaoErro(criadoEm, feitas),
  });

  it('revisões em D+3 e D+14; depois, concluído', () => {
    expect(proximaRevisaoErro('2026-09-28', [])).toBe('2026-10-01');
    const r1 = revisarErro(erro('2026-09-28'), true, '2026-10-01');
    expect(r1.proximaRevisao).toBe('2026-10-12');
    const r2 = revisarErro({ ...erro('2026-09-28'), ...r1 }, true, '2026-10-12');
    expect(r2.proximaRevisao).toBeNull();
  });

  it('errar de novo recomeça em D+3 a partir de hoje', () => {
    expect(revisarErro(erro('2026-09-28', ['2026-10-01']), false, '2026-10-12')).toEqual({ criadoEm: '2026-10-12', revisoesFeitas: [], proximaRevisao: '2026-10-15' });
  });

  it('lista os erros para revisar até hoje', () => {
    expect(errosParaRevisar([erro('2026-09-28'), erro('2026-09-30')], '2026-10-01').map((e) => e.criadoEm)).toEqual(['2026-09-28']);
  });
});

describe('simulados', () => {
  it('distância até a nota de corte', () => {
    expect(distanciaCorte({ notaTotal: 62.5 }, 70)).toBe(-7.5);
    expect(distanciaCorte({ notaTotal: 62.5 }, null)).toBeNull();
  });
});
