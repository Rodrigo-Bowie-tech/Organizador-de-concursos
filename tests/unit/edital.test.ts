import { describe, expect, it } from 'vitest';
import {
  dividirEmPartes,
  juntarPartes,
  localizarConteudoProgramatico,
  montarPedidoEdital,
  similaridade,
  sugerirEquivalencias,
  topicosDaImportacao,
  validarEstrutura,
} from '../../src/dominio/edital';
import type { RefTopico } from '../../src/dominio/edital';
import type { Topico } from '../../src/dominio/tipos';

const EDITAL = `EDITAL DE ABERTURA Nº 01/2026
SUMÁRIO
1. Das disposições preliminares ... 2
ANEXO II - Conteúdo Programático ... 30
1. DAS DISPOSIÇÕES PRELIMINARES
O concurso destina-se ao provimento de cargos.
ANEXO I
QUADRO DE PROVAS
ANEXO II
CONTEÚDO PROGRAMÁTICO
LÍNGUA PORTUGUESA: Interpretação de texto. Ortografia oficial. Crase. Concordância verbal e nominal.
${'Regência verbal e nominal. '.repeat(20)}
CONHECIMENTOS ESPECÍFICOS – ENGENHEIRO ELETRICISTA: 1. Circuitos elétricos. 1.1 Leis de Kirchhoff. 2. Máquinas elétricas.
ANEXO III
MODELO DE REQUERIMENTO`;

describe('conteúdo programático', () => {
  it('acha o trecho no anexo, não a menção do sumário', () => {
    const r = localizarConteudoProgramatico(EDITAL)!;
    const trecho = EDITAL.slice(r.inicio, r.fim);
    expect(trecho.startsWith('CONTEÚDO PROGRAMÁTICO')).toBe(true);
    expect(trecho).toContain('Máquinas elétricas');
    expect(trecho).not.toContain('MODELO DE REQUERIMENTO');
  });

  it('sem a expressão, não adivinha', () => {
    expect(localizarConteudoProgramatico('Edital sem anexo de conteúdo.')).toBeNull();
  });
});

describe('divisão em partes para a IA', () => {
  it('respeita o limite de bytes e prefere cortar antes de um título', () => {
    const bloco = (titulo: string) => `${titulo}\n${'Assunto relevante; '.repeat(40)}\n`;
    const texto = [bloco('LÍNGUA PORTUGUESA'), bloco('RACIOCÍNIO LÓGICO'), bloco('ENGENHARIA ELÉTRICA')].join('');
    const partes = dividirEmPartes(texto, 1_500);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(1_500);
    expect(partes[1].startsWith('RACIOCÍNIO LÓGICO')).toBe(true);
    expect(partes.join('\n').replace(/\s/g, '')).toBe(texto.replace(/\s/g, ''));
  });

  it('corta linha gigante de PDF sem quebras', () => {
    const partes = dividirEmPartes('palavra '.repeat(1000), 1_000);
    expect(partes.length).toBeGreaterThan(5);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(1_000);
  });
});

describe('pedido e resposta da IA', () => {
  it('o pedido leva cargo, parte e formato', () => {
    const p = montarPedidoEdital('LÍNGUA PORTUGUESA: Crase.', { concurso: 'Petrobras', cargo: 'Engenheiro Eletricista', banca: 'Cebraspe', parte: 2, totalPartes: 3 });
    expect(p).toContain('trecho 2 de 3');
    expect(p).toContain('só os do cargo "Engenheiro Eletricista"');
    expect(p).toContain('"disciplinas"');
    expect(p).toContain('LÍNGUA PORTUGUESA: Crase.');
  });

  it('valida a estrutura: limpa numeração, aceita strings e corta além de 3 níveis', () => {
    const d = validarEstrutura({
      disciplinas: [
        {
          nome: 'Engenharia Elétrica',
          peso: '2',
          numQuestoes: 40,
          tipo: 'especifica',
          topicos: [
            { titulo: '1. Máquinas elétricas', subtopicos: [{ titulo: '1.1 Transformadores;', subtopicos: [{ titulo: 'Ensaios', subtopicos: [{ titulo: 'nível 4' }] }] }] },
            'Proteção de sistemas.',
            { titulo: '' },
          ],
        },
        { nome: '', topicos: [] },
        { nome: 'Português', tipo: 'qualquer', peso: null },
      ],
    });
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ peso: 2, numQuestoes: 40, tipo: 'especifica' });
    expect(d[0].topicos.map((t) => t.titulo)).toEqual(['Máquinas elétricas', 'Proteção de sistemas']);
    expect(d[0].topicos[0].filhos[0].titulo).toBe('Transformadores');
    expect(d[0].topicos[0].filhos[0].filhos[0].filhos).toEqual([]);
    expect(d[1]).toMatchObject({ tipo: 'especifica', peso: null, topicos: [] });
  });

  it('junta a mesma disciplina vinda de partes diferentes, sem repetir tópicos', () => {
    const t = (titulo: string) => ({ titulo, filhos: [] });
    const juntas = juntarPartes([
      [{ nome: 'Engenharia Elétrica', peso: null, numQuestoes: 40, tipo: 'especifica', topicos: [t('Circuitos'), t('Máquinas')] }],
      [
        { nome: 'engenharia eletrica', peso: 2, numQuestoes: null, tipo: 'especifica', topicos: [t('Máquinas'), t('Proteção')] },
        { nome: 'Português', peso: null, numQuestoes: null, tipo: 'basica', topicos: [t('Crase')] },
      ],
    ]);
    expect(juntas).toHaveLength(2);
    expect(juntas[0]).toMatchObject({ peso: 2, numQuestoes: 40 });
    expect(juntas[0].topicos.map((x) => x.titulo)).toEqual(['Circuitos', 'Máquinas', 'Proteção']);
  });

  it('converte a árvore em tópicos com pais e ordem', () => {
    let n = 0;
    const topicos = topicosDaImportacao(
      [{ titulo: 'Máquinas', filhos: [{ titulo: 'Trafos', filhos: [] }, { titulo: 'Motores', filhos: [] }] }],
      () => `t${++n}`,
      3,
    );
    expect(topicos.map((t) => [t.titulo, t.paiId, t.ordem])).toEqual([
      ['Máquinas', null, 3],
      ['Trafos', 't1', 0],
      ['Motores', 't1', 1],
    ]);
  });
});

describe('tópicos equivalentes entre editais', () => {
  const ref = (concursoId: string, id: string, titulo: string, grupo: string | null = null): RefTopico => ({
    concursoId,
    disciplinaId: `d-${concursoId}`,
    topico: { id, paiId: null, titulo, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: grupo } as Topico,
  });

  it('similaridade ignora acentos, numeração e palavras vazias', () => {
    expect(similaridade('Máquinas Elétricas', '3. maquinas eletricas')).toBe(1);
    expect(similaridade('Transformadores de potência', 'Motores de indução')).toBe(0);
  });

  it('sugere pares de concursos diferentes, uma vez por tópico, e respeita ignorados e vínculos', () => {
    const lista = [
      ref('ff', 'a1', 'Máquinas elétricas'),
      ref('ff', 'a2', 'Máquinas elétricas rotativas'),
      ref('petro', 'b1', 'Máquinas Elétricas'),
      ref('petro', 'b2', 'Proteção de sistemas elétricos'),
      ref('transpetro', 'c1', 'Proteção de sistemas elétricos de potência'),
      ref('transpetro', 'c2', 'Crase', 'g1'),
      ref('ff', 'a3', 'Crase', 'g1'),
    ];
    const s = sugerirEquivalencias(lista, new Set(['b2|c1']));
    expect(s.map((x) => [x.a.topico.id, x.b.topico.id])).toEqual([['a1', 'b1']]);
  });
});
