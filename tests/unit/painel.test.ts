import { describe, expect, it } from 'vitest';
import {
  cobertura,
  provasFuturas,
  sequenciaDeDias,
  totaisPorPeriodo,
  ultimosDias,
} from '../../src/dominio/painel';
import type { Concurso, Topico } from '../../src/dominio/tipos';

const H = 3600;

describe('totais do painel', () => {
  it('separa hoje, semana (desde domingo) e mês', () => {
    const porDia = new Map([
      ['2026-08-31', 5 * H], // mês anterior
      ['2026-09-20', 2 * H], // semana anterior
      ['2026-09-27', 1 * H], // domingo desta semana
      ['2026-09-29', 3 * H], // hoje (terça)
    ]);
    expect(totaisPorPeriodo(porDia, '2026-09-29')).toEqual({ hoje: 3 * H, semana: 4 * H, mes: 6 * H });
  });
});

describe('sequência de dias estudados', () => {
  const dias = (...d: string[]) => new Map(d.map((x) => [x, H]));

  it('conta dias seguidos até hoje', () => {
    expect(sequenciaDeDias(dias('2026-09-25', '2026-09-26', '2026-09-27'), '2026-09-27')).toBe(3);
  });

  it('se hoje ainda não teve estudo, mantém a sequência de ontem', () => {
    expect(sequenciaDeDias(dias('2026-09-25', '2026-09-26'), '2026-09-27')).toBe(2);
  });

  it('um dia em branco zera a sequência', () => {
    expect(sequenciaDeDias(dias('2026-09-24', '2026-09-26', '2026-09-27'), '2026-09-27')).toBe(2);
    expect(sequenciaDeDias(dias('2026-09-24'), '2026-09-27')).toBe(0);
  });

  it('menos de 1 minuto não conta', () => {
    expect(sequenciaDeDias(new Map([['2026-09-27', 30]]), '2026-09-27')).toBe(0);
  });

  it('últimos dias em ordem, com zero onde não houve estudo', () => {
    expect(ultimosDias(dias('2026-09-27'), '2026-09-27', 3)).toEqual([
      { dia: '2026-09-25', segundos: 0 },
      { dia: '2026-09-26', segundos: 0 },
      { dia: '2026-09-27', segundos: H },
    ]);
  });
});

function topico(id: string, paiId: string | null, status: Topico['status'] = 'nao_iniciado'): Topico {
  return { id, paiId, titulo: id, ordem: 0, status, autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null };
}

describe('cobertura do edital', () => {
  it('conta só as folhas com teoria concluída ou além', () => {
    const topicos = Object.fromEntries(
      [
        topico('circuitos', null, 'teoria_concluida'), // tem filhos: não conta
        topico('ohm', 'circuitos', 'teoria_concluida'),
        topico('kirchhoff', 'circuitos', 'em_estudo'),
        topico('maquinas', null, 'dominado'),
        topico('protecao', null),
      ].map((t) => [t.id, t]),
    );
    expect(cobertura([{ topicos }])).toEqual({ total: 4, concluidos: 2, fracao: 0.5 });
  });

  it('edital vazio tem cobertura zero, sem dividir por zero', () => {
    expect(cobertura([{ topicos: {} }])).toEqual({ total: 0, concluidos: 0, fracao: 0 });
  });
});

describe('contagem regressiva', () => {
  const c = (id: string, dataProva: string | null, status: Concurso['status'] = 'inscrito'): Concurso => ({
    id,
    nome: id,
    orgao: '',
    banca: '',
    cargo: '',
    area: '',
    dataProva,
    status,
    link: '',
    notaCorte: null,
    prioridade: 3,
    criadoEm: '',
  });

  it('lista provas futuras da mais próxima para a mais distante', () => {
    const lista = provasFuturas(
      [c('petrobras', '2027-03-14'), c('ff', '2026-11-08'), c('sem-data', null), c('passou', '2026-09-01'), c('feita', '2026-10-01', 'prova_feita')],
      '2026-09-27',
    );
    expect(lista.map((p) => [p.concurso.id, p.dias])).toEqual([
      ['ff', 42],
      ['petrobras', 168],
    ]);
  });
});
