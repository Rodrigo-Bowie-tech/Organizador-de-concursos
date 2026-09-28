import { describe, expect, it } from 'vitest';
import {
  aplicarGabarito,
  codigosDoEdital,
  comIncidenciaDasProvas,
  dividirProva,
  incidenciaPorTopico,
  indiceDaLetra,
  juntarQuestoes,
  lerGabarito,
  montarPedidoProva,
  validarQuestoesProva,
} from '../../src/dominio/provas';
import { filaDeTeoria } from '../../src/dominio/planejador';
import type { Concurso, Disciplina, ProvaAnterior, QuestaoProva, Topico } from '../../src/dominio/tipos';

const topico = (id: string, titulo: string, ordem: number, paiId: string | null = null, extra: Partial<Topico> = {}): Topico => ({
  id, paiId, titulo, ordem, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...extra,
});

const concurso = (id: string, banca: string): Concurso => ({
  id, nome: id, orgao: id, banca, cargo: 'Engenheiro Eletricista', area: 'Engenharia Elétrica', dataProva: '2026-12-13', status: 'edital_aberto', link: '', notaCorte: null, prioridade: 5, criadoEm: '2026-09-01T00:00:00Z',
});

const disciplina = (id: string, concursoId: string, topicos: Topico[]): Disciplina => ({
  id, concursoId, editalId: null, nome: id === 'ee' ? 'Engenharia Elétrica' : 'Português', peso: 1, numQuestoes: 10, tipo: 'especifica', ordem: 0, cor: '#000', topicos: Object.fromEntries(topicos.map((t) => [t.id, t])),
});

const ee = disciplina('ee', 'ff', [topico('circ', 'Circuitos', 0), topico('ohm', 'Lei de Ohm', 0, 'circ'), topico('kir', 'Leis de Kirchhoff', 1, 'circ'), topico('trafo', 'Transformadores', 1)]);
const pt = disciplina('pt', 'ff', [topico('crase', 'Crase', 0)]);

const q = (numero: number, topicoId: string | null, extra: Partial<QuestaoProva> = {}): QuestaoProva => ({
  id: `q${numero}`, numero, enunciado: `Questão ${numero}`, alternativas: ['a', 'b', 'c', 'd', 'e'], correta: 0, disciplinaId: 'ee', topicoId, anulada: false, ...extra,
});

const prova = (id: string, banca: string, questoes: QuestaoProva[], concursoId = 'ff'): ProvaAnterior => ({
  id, concursoId, titulo: id, banca, orgao: '', ano: 2023, cargo: '', arquivoId: null, arquivoNome: null, importadaEm: '2026-09-01T00:00:00Z', questoes: Object.fromEntries(questoes.map((x) => [x.id, x])),
});

describe('divisão da prova para a IA', () => {
  it('corta antes de uma questão, sem partir o enunciado', () => {
    const texto = Array.from({ length: 40 }, (_, i) => `${i + 1}. Enunciado da questão ${i + 1} ${'x'.repeat(200)}\n(A) um\n(B) dois\n(C) três`).join('\n');
    const partes = dividirProva(texto, 3000);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) {
      expect(p).toMatch(/^\d+\. Enunciado/);
      expect(p.trim().endsWith('(C) três')).toBe(true);
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(3000);
    }
    expect(partes.join('\n')).toBe(texto);
  });
});

describe('pedido e validação', () => {
  const codigos = codigosDoEdital([ee, pt]);

  it('dá códigos às disciplinas e aos tópicos-folha, na ordem da árvore e com o caminho', () => {
    expect(codigos.map((c) => `${c.codigo}=${c.rotulo}`)).toEqual([
      'D1=Engenharia Elétrica',
      'T1=Engenharia Elétrica › Circuitos › Lei de Ohm',
      'T2=Engenharia Elétrica › Circuitos › Leis de Kirchhoff',
      'T3=Engenharia Elétrica › Transformadores',
      'D2=Português',
      'T4=Português › Crase',
    ]);
    const pedido = montarPedidoProva('1. Questão', { banca: 'FCC', concurso: 'FF', cargo: 'Eng.', codigos, parte: 1, totalPartes: 2 });
    expect(pedido).toContain('T3: Engenharia Elétrica › Transformadores');
    expect(pedido).toContain('parte 1 de 2');
  });

  it('valida a resposta: códigos viram ids, letras viram índice, lixo fica de fora', () => {
    const r = validarQuestoesProva(
      {
        questoes: [
          { numero: 1, enunciado: 'V2 vale:', alternativas: ['(A) 110 V', 'B) 220 V', 'C) 440 V'], correta: 'a', topico: 't3' },
          { numero: '2', enunciado: 'A crase...', alternativas: ['Certo', 'Errado'], correta: 'E', topico: 'D2' },
          { numero: 3, enunciado: 'Sem assunto', alternativas: [], correta: null, topico: 'T99' },
          { numero: 4, enunciado: '' },
          { enunciado: 'sem número' },
        ],
      },
      codigos,
    );
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ numero: 1, alternativas: ['110 V', '220 V', '440 V'], correta: 0, disciplinaId: 'ee', topicoId: 'trafo' });
    expect(r[1]).toMatchObject({ correta: 1, disciplinaId: 'pt', topicoId: null });
    expect(r[2]).toMatchObject({ correta: null, disciplinaId: null, topicoId: null });
  });

  it('junta as partes por número, sem repetir', () => {
    const a = validarQuestoesProva([{ numero: 2, enunciado: 'curto', alternativas: [] }, { numero: 1, enunciado: 'um', alternativas: [] }], codigos);
    const b = validarQuestoesProva([{ numero: 2, enunciado: 'mais completo', alternativas: [] }], codigos);
    expect(juntarQuestoes([a, b]).map((x) => `${x.numero}:${x.enunciado}`)).toEqual(['1:um', '2:mais completo']);
  });
});

describe('gabarito', () => {
  it('lê pares número-letra em vários formatos e anuladas', () => {
    const g = lerGabarito('01-A 02 – C\n3) E  4.B 5 X 6: anulada 2024 A');
    expect([...g.entries()]).toEqual([[1, 'A'], [2, 'C'], [3, 'E'], [4, 'B'], [5, 'X'], [6, 'X']]);
  });

  it('lê a tabela com números numa linha e letras na de baixo', () => {
    const g = lerGabarito('Gabarito\n1 2 3 4\nB D * A');
    expect([...g.entries()]).toEqual([[1, 'B'], [2, 'D'], [3, 'X'], [4, 'A']]);
  });

  it('aplica: letra vira índice (C/E em certo ou errado) e X anula', () => {
    const qs = [
      { ...q(1, null), correta: null },
      { ...q(2, null), alternativas: ['Certo', 'Errado'], correta: null },
      q(3, null),
    ];
    const r = aplicarGabarito(qs, new Map([[1, 'D'], [2, 'C'], [3, 'X']]));
    expect(r.map((x) => [x.correta, x.anulada])).toEqual([[3, false], [0, false], [null, true]]);
    expect(indiceDaLetra('F', ['a', 'b'])).toBeNull();
  });
});

describe('incidência por assunto da banca', () => {
  const ff = concurso('ff', 'FCC');

  it('conta as questões da mesma banca por tópico; anuladas e outras bancas não contam', () => {
    const provas = [
      prova('p1', 'FCC', [q(1, 'trafo'), q(2, 'trafo'), q(3, 'ohm'), q(4, 'ohm', { anulada: true }), q(5, null)]),
      prova('p2', 'fcc ', [q(1, 'trafo')]),
      prova('p3', 'Cesgranrio', [q(1, 'kir'), q(2, 'kir')]),
    ];
    expect(Object.fromEntries(incidenciaPorTopico(provas, ff, [ee, pt]))).toEqual({ trafo: 3, ohm: 1 });
  });

  it('questão ligada a tópico de outro concurso conta no tópico vinculado', () => {
    const outra = disciplina('ee2', 'sabesp', [topico('trafo2', 'Transformadores', 0, null, { grupoEquivalenciaId: 'g1' })]);
    const eeVinc = { ...ee, topicos: { ...ee.topicos, trafo: { ...ee.topicos.trafo, grupoEquivalenciaId: 'g1' } } };
    const provas = [prova('p1', 'FCC', [q(1, 'trafo2'), q(2, 'trafo2')], 'sabesp')];
    expect(Object.fromEntries(incidenciaPorTopico(provas, ff, [eeVinc, outra]))).toEqual({ trafo: 2 });
  });

  it('alimenta a prioridade do planejador, sem passar por cima do valor manual', () => {
    const provas = [prova('p1', 'FCC', [q(1, 'kir'), q(2, 'kir'), q(3, 'kir'), q(4, 'ohm')])];
    const comManual = { ...ee, topicos: { ...ee.topicos, ohm: { ...ee.topicos.ohm, incidencia: 10 } } };
    const [d] = comIncidenciaDasProvas([comManual], [ff], provas);
    expect(d.topicos.kir.incidencia).toBe(3);
    expect(d.topicos.ohm.incidencia).toBe(10);
    expect(d.topicos.trafo.incidencia).toBeNull();

    // Sem as provas, Kirchhoff e Transformadores empatam; com elas, Kirchhoff sobe na fila.
    const antes = filaDeTeoria([ff], [ee], new Map(), '2026-09-28');
    const depois = filaDeTeoria([ff], comIncidenciaDasProvas([ee], [ff], provas), new Map(), '2026-09-28');
    const pos = (fila: typeof antes, id: string) => fila.findIndex((x) => x.topico.id === id);
    expect(antes.find((x) => x.topico.id === 'kir')?.prioridade).toBeCloseTo(antes.find((x) => x.topico.id === 'trafo')?.prioridade ?? 0);
    expect(pos(depois, 'kir')).toBe(0);
    expect(depois[0].prioridade).toBeGreaterThan(depois[pos(depois, 'trafo')].prioridade * 1.9);
  });
});
