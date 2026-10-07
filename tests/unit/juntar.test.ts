import { describe, expect, it } from 'vitest';
import { arquivoDe, caminhoDe, igual, juntar3, lerArquivoDados, serializar, shaDoBlob } from '../../src/dados/juntar';

const sessao = (id: string, min: number) => ({ id, inicio: `2026-10-0${min % 9}T20:00:00.000Z`, segundosLiquidos: min * 60 });

describe('junção de três vias', () => {
  const base = { semana: '2026-10-04', itens: { a: sessao('a', 30) } };

  it('só um lado mudou: vale ele', () => {
    const local = { ...base, itens: { ...base.itens, b: sessao('b', 40) } };
    expect(juntar3(base, local, base, false)).toEqual(local);
    expect(juntar3(base, base, local, true)).toEqual(local);
  });

  it('sessões novas nos dois aparelhos na mesma semana: ficam as duas', () => {
    const local = { ...base, itens: { ...base.itens, b: sessao('b', 40) } };
    const remoto = { ...base, itens: { ...base.itens, c: sessao('c', 50) } };
    expect(juntar3(base, local, remoto, false)?.itens).toEqual({ a: sessao('a', 30), b: sessao('b', 40), c: sessao('c', 50) });
  });

  it('exclusão de um lado e nada do outro: some', () => {
    const local = { ...base, itens: {} };
    const remoto = { ...base, itens: { ...base.itens, c: sessao('c', 50) } };
    expect(juntar3(base, local, remoto, false)?.itens).toEqual({ c: sessao('c', 50) });
  });

  it('o mesmo registro mudou nos dois: vale o mais novo, inteiro (sem misturar campos)', () => {
    const local = { ...base, itens: { a: { ...sessao('a', 30), segundosLiquidos: 100, anotacoes: 'aqui' } } };
    const remoto = { ...base, itens: { a: { ...sessao('a', 30), segundosLiquidos: 200 } } };
    expect(juntar3(base, local, remoto, true)?.itens).toEqual(local.itens);
    expect(juntar3(base, local, remoto, false)?.itens).toEqual(remoto.itens);
  });

  it('tópicos da mesma disciplina mudados em aparelhos diferentes', () => {
    const t = (id: string, status: string) => ({ id, titulo: id, status });
    const b = { id: 'ee', nome: 'Elétrica', peso: 2, topicos: { t1: t('t1', 'nao_iniciado'), t2: t('t2', 'nao_iniciado') } };
    const local = { ...b, topicos: { ...b.topicos, t1: t('t1', 'teoria_concluida') } };
    const remoto = { ...b, peso: 3, topicos: { ...b.topicos, t2: t('t2', 'em_estudo') } };
    expect(juntar3(b, local, remoto, false)).toEqual({ id: 'ee', nome: 'Elétrica', peso: 3, topicos: { t1: t('t1', 'teoria_concluida'), t2: t('t2', 'em_estudo') } });
  });

  it('campo comum é indivisível: a sessão do cronômetro vem inteira de um lado', () => {
    const b = { sessao: null };
    const local = { sessao: { id: 's1', inicio: '2026-10-07T20:00:00.000Z' } };
    const remoto = { sessao: { id: 's2', inicio: '2026-10-07T21:00:00.000Z' } };
    expect(juntar3(b, local, remoto, false)).toEqual(remoto);
  });

  it('documento apagado de um lado e mudado do outro: vale o mais novo', () => {
    const mudado = { ...base, semana: 'x' };
    expect(juntar3(base, undefined, mudado, false)).toEqual(mudado);
    expect(juntar3(base, undefined, mudado, true)).toBeUndefined();
    expect(juntar3(base, undefined, base, false)).toBeUndefined();
  });

  it('primeira sincronização (sem base): junta os mapas; em conflito, o mais novo', () => {
    const local = { semana: '2026-10-04', itens: { a: sessao('a', 30) } };
    const remoto = { semana: '2026-10-04', itens: { c: sessao('c', 50) } };
    expect(juntar3(undefined, local, remoto, false)?.itens).toEqual({ a: sessao('a', 30), c: sessao('c', 50) });
    expect(juntar3(undefined, { metaDiariaMin: 60 }, { metaDiariaMin: 90 }, false)).toEqual({ metaDiariaMin: 90 });
  });

  it('ordem das chaves não conta como mudança', () => {
    expect(igual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(juntar3({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 5 }, true)).toEqual({ a: 1, b: 5 });
  });
});

describe('arquivos do repositório de dados', () => {
  it('caminho ↔ arquivo, inclusive com caracteres estranhos no id', () => {
    expect(arquivoDe('sessoes/2026-10-04')).toBe('dados/sessoes/2026-10-04.json');
    for (const c of ['concursos/embu-2026', 'radar_filtros/padrao', 'estado/cronometro', 'biblioteca/a b/c%d']) expect(caminhoDe(arquivoDe(c))).toBe(c);
    expect(caminhoDe('LEIAME.md')).toBeNull();
    expect(caminhoDe('dados/x.json')).toBeNull();
  });

  it('serializa com chaves em ordem e lê de volta', () => {
    const texto = serializar({ em: '2026-10-07T12:00:00.000Z', dado: { b: 1, a: { d: 2, c: 3 } } });
    expect(texto).toBe('{\n  "dado": {\n    "a": {\n      "c": 3,\n      "d": 2\n    },\n    "b": 1\n  },\n  "em": "2026-10-07T12:00:00.000Z"\n}\n');
    expect(lerArquivoDados(texto)).toEqual({ em: '2026-10-07T12:00:00.000Z', dado: { a: { c: 3, d: 2 }, b: 1 } });
    expect(lerArquivoDados('não é json')).toBeNull();
  });

  it('SHA igual ao do git (git hash-object)', async () => {
    expect(await shaDoBlob('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(await shaDoBlob('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await shaDoBlob('ção\n')).toHaveLength(40);
  });
});
