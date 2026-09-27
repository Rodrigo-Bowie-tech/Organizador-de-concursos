import { describe, expect, it } from 'vitest';
import { lerLote, topicosDoLote } from '../../src/dominio/lote';
import { achatar, comDescendentes, mover } from '../../src/dominio/topicos';

describe('cadastro de tópicos em lote', () => {
  it('usa a numeração do edital para montar os níveis', () => {
    const texto = `
1. Circuitos elétricos.
1.1 Lei de Ohm;
1.2 Leis de Kirchhoff;
1.2.1 Análise nodal
2. Máquinas elétricas
2.1 Transformadores
`;
    expect(lerLote(texto)).toEqual([
      { titulo: 'Circuitos elétricos', nivel: 0 },
      { titulo: 'Lei de Ohm', nivel: 1 },
      { titulo: 'Leis de Kirchhoff', nivel: 1 },
      { titulo: 'Análise nodal', nivel: 2 },
      { titulo: 'Máquinas elétricas', nivel: 0 },
      { titulo: 'Transformadores', nivel: 1 },
    ]);
  });

  it('sem numeração, usa o recuo e ignora marcadores', () => {
    const texto = ['- Instalações elétricas', '  - NBR 5410', '\t• Aterramento', 'Proteção'].join('\n');
    expect(lerLote(texto)).toEqual([
      { titulo: 'Instalações elétricas', nivel: 0 },
      { titulo: 'NBR 5410', nivel: 1 },
      { titulo: 'Aterramento', nivel: 1 },
      { titulo: 'Proteção', nivel: 0 },
    ]);
  });

  it('não deixa um item pular níveis', () => {
    expect(lerLote('1.1.1 Solto\n2 Raiz').map((i) => i.nivel)).toEqual([0, 0]);
  });

  it('gera a árvore de tópicos com pais e ordens corretos', () => {
    let n = 0;
    const topicos = topicosDoLote(lerLote('1 A\n1.1 A1\n1.2 A2\n2 B'), () => `t${++n}`, null, 5);
    const porId = Object.fromEntries(topicos.map((t) => [t.id, t]));
    expect(topicos.map((t) => [t.titulo, t.paiId, t.ordem])).toEqual([
      ['A', null, 5],
      ['A1', 't1', 0],
      ['A2', 't1', 1],
      ['B', null, 6],
    ]);
    expect(achatar(porId).map((l) => `${l.numero} ${l.topico.titulo}`)).toEqual([
      '1 A',
      '1.1 A1',
      '1.2 A2',
      '2 B',
    ]);
  });
});

describe('árvore de tópicos', () => {
  let n = 0;
  const topicos = Object.fromEntries(
    topicosDoLote(lerLote('1 A\n1.1 A1\n1.1.1 A1a\n2 B\n3 C'), () => `t${++n}`).map((t) => [t.id, t]),
  );

  it('encontra descendentes para remoção em cascata', () => {
    expect([...comDescendentes(topicos, 't1')].sort()).toEqual(['t1', 't2', 't3']);
  });

  it('move um tópico entre os irmãos', () => {
    expect(mover(topicos, 't4', -1)).toEqual({ t1: 1, t4: 0 });
    expect(mover(topicos, 't1', -1)).toBeNull();
    expect(mover(topicos, 't5', 1)).toBeNull();
  });
});
