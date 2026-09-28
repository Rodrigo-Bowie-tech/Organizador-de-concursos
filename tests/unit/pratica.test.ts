import { describe, expect, it } from 'vitest';
import { estiloDaBanca, montarPedido, validarQuestoes } from '../../src/dominio/pratica';
import { lerLote, topicosDoLote } from '../../src/dominio/lote';
import { caminhoDoTopico } from '../../src/dominio/topicos';

describe('prática com IA', () => {
  it('Cebraspe cobra certo/errado; as outras bancas, múltipla escolha', () => {
    expect(estiloDaBanca('Cebraspe')).toBe('certo_errado');
    expect(estiloDaBanca('CESPE/UnB')).toBe('certo_errado');
    expect(estiloDaBanca('FCC')).toBe('multipla');
    expect(estiloDaBanca('')).toBe('multipla');
  });

  it('o pedido leva banca, tópico com o caminho completo e o formato JSON', () => {
    const pedido = montarPedido({
      banca: 'FCC',
      concurso: 'Fundação Florestal SP',
      cargo: 'Engenheiro Eletricista',
      area: 'Engenharia Elétrica',
      disciplina: 'Engenharia Elétrica',
      caminho: ['Máquinas elétricas', 'Transformadores'],
      quantidade: 5,
      estilo: 'multipla',
      dificuldade: 'media',
    });
    expect(pedido).toContain('Crie 5 questões inéditas no estilo da banca FCC');
    expect(pedido).toContain('Tópico: Máquinas elétricas > Transformadores');
    expect(pedido).toContain('5 alternativas (A a E)');
    expect(pedido).toContain('"correta": 0');
  });

  it('valida a resposta: descarta questões malformadas e limpa as letras das alternativas', () => {
    const resposta = [
      { enunciado: 'Qual a relação de espiras?', alternativas: ['A) 1:2', 'B) 2:1', 'C) 1:1', 'D) 4:1', 'E) 1:4'], correta: 1, explicacao: 'V1/V2 = N1/N2.' },
      { enunciado: '', alternativas: ['x', 'y'], correta: 0 },
      { enunciado: 'Sem gabarito', alternativas: ['x', 'y'], correta: 5 },
      'lixo',
    ];
    const q = validarQuestoes(resposta, 'multipla');
    expect(q).toHaveLength(1);
    expect(q[0].alternativas[0]).toBe('1:2');
    expect(q[0].correta).toBe(1);
  });

  it('em certo/errado, as alternativas são sempre Certo e Errado', () => {
    const q = validarQuestoes({ questoes: [{ enunciado: 'O trafo ideal não tem perdas.', alternativas: ['C', 'E'], correta: 0, explicacao: '' }] }, 'certo_errado');
    expect(q[0].alternativas).toEqual(['Certo', 'Errado']);
  });

  it('monta o caminho do tópico até a raiz', () => {
    let n = 0;
    const lista = topicosDoLote(lerLote('1 Máquinas\n1.1 Transformadores\n1.1.1 Ensaios'), () => `t${++n}`);
    const topicos = Object.fromEntries(lista.map((t) => [t.id, t]));
    expect(caminhoDoTopico(topicos, 't3')).toEqual(['Máquinas', 'Transformadores', 'Ensaios']);
  });
});
