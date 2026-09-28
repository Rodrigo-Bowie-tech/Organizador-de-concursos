import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extrairPci, permitidoPeloRobots } from '../../src/radar/pci';
import { aberta, casaArea, casaFiltro, idOportunidade, lerSalario, lerVagas } from '../../src/radar/radar';

const HTML = readFileSync(join(import.meta.dirname, 'fixtures', 'pci-sudeste.html'), 'utf8');
const COLETA = '2026-09-28T09:00:00.000Z';

describe('parser do PCI Concursos (HTML salvo)', () => {
  const lista = extrairPci(HTML, 'https://www.pciconcursos.com.br/concursos/sudeste/', COLETA);

  it('extrai uma oportunidade por notícia, com os campos da listagem', () => {
    expect(lista).toHaveLength(4);
    expect(lista[0]).toMatchObject({
      titulo: 'Fundação Florestal - SP',
      orgao: 'Fundação Florestal',
      uf: 'SP',
      cargos: ['Engenheiro Eletricista', 'Engenheiro Florestal'],
      vagas: 34,
      salario: 11874.15,
      inscricoesAte: '2026-10-30',
      link: 'https://www.pciconcursos.com.br/noticias/fundacao-florestal-sp-abre-concurso-para-engenheiros',
      fonte: 'PCI Concursos',
      coletadoEm: COLETA,
    });
  });

  it('cadastro reserva fica sem número de vagas; entidades HTML viram texto', () => {
    const cesan = lista.find((o) => o.uf === 'ES')!;
    expect(cesan.vagas).toBeNull();
    expect(cesan.cargos).toEqual(['Engenharia Elétrica & Automação']);
  });

  it('id estável: a mesma notícia em duas coletas não duplica', () => {
    const de_novo = extrairPci(HTML, '', '2026-09-29T09:00:00.000Z');
    expect(de_novo.map((o) => o.id)).toEqual(lista.map((o) => o.id));
  });

  it('HTML sem notícias não quebra', () => {
    expect(extrairPci('<html><body>Manutenção</body></html>', '', COLETA)).toEqual([]);
  });
});

describe('filtros do radar', () => {
  const lista = extrairPci(HTML, '', COLETA);
  const filtro = { areas: ['Engenharia Elétrica'], ufs: ['SP', 'RJ'], bancas: [], salarioMinimo: null };

  it('"Engenharia Elétrica" casa com "Engenheiro Eletricista"', () => {
    expect(casaArea({ titulo: '', cargos: ['Engenheiro Eletricista'] }, 'Engenharia Elétrica')).toBe(true);
    expect(casaArea({ titulo: '', cargos: ['Engenheiro Civil'] }, 'Engenharia Elétrica')).toBe(false);
  });

  it('o filtro padrão (engenharia elétrica em SP e RJ) pega só a Fundação Florestal', () => {
    expect(lista.filter((o) => casaFiltro(o, filtro)).map((o) => o.orgao)).toEqual(['Fundação Florestal']);
  });

  it('salário mínimo e UF vazia (qualquer lugar)', () => {
    const r = lista.filter((o) => casaFiltro(o, { areas: ['engenharia eletrica'], ufs: [], bancas: [], salarioMinimo: 9000 }));
    expect(r.map((o) => o.uf)).toEqual(['SP', 'MG']);
  });

  it('inscrições abertas', () => {
    expect(aberta({ inscricoesAte: '2026-10-15' }, '2026-10-15')).toBe(true);
    expect(aberta({ inscricoesAte: '2026-10-14' }, '2026-10-15')).toBe(false);
    expect(aberta({ inscricoesAte: null }, '2026-10-15')).toBe(true);
  });

  it('leitura de salário, vagas e id', () => {
    expect(lerSalario('de R$ 3.000,00 a R$ 12.500,50')).toBe(12500.5);
    expect(lerVagas('1 vaga')).toBe(1);
    expect(idOportunidade({ link: 'https://x/a', orgao: '', cargos: [] })).toBe(idOportunidade({ link: 'HTTPS://X/A', orgao: 'y', cargos: [] }));
  });
});

describe('robots.txt', () => {
  const robots = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin/\nDisallow: /busca\nAllow: /busca/publica\n';
  it('respeita o grupo geral, o Disallow e o Allow mais específico', () => {
    expect(permitidoPeloRobots(robots, '/concursos/sudeste/')).toBe(true);
    expect(permitidoPeloRobots(robots, '/admin/x')).toBe(false);
    expect(permitidoPeloRobots(robots, '/busca?q=x')).toBe(false);
    expect(permitidoPeloRobots(robots, '/busca/publica')).toBe(true);
    expect(permitidoPeloRobots('User-agent: *\nDisallow: /', '/concursos/')).toBe(false);
  });
});

import { montarPedidoRadar, validarOportunidades } from '../../src/radar/texto';

describe('oportunidades a partir de texto colado (IA)', () => {
  it('pedido leva a data de hoje e o formato', () => {
    const p = montarPedidoRadar('Prefeitura de Santos abre concurso', '2026-09-28');
    expect(p).toContain('Hoje é 2026-09-28');
    expect(p).toContain('"inscricoesAte"');
  });

  it('valida a resposta: UF inválida vira BR, datas fora do formato viram null, links só http(s)', () => {
    const r = validarOportunidades(
      [
        { orgao: 'Prefeitura de Santos', titulo: '', cargos: ['Engenheiro Eletricista', ''], salario: '9.800,50', vagas: '3', uf: 'sp', inscricoesAte: '2026-10-20', banca: 'Vunesp', link: 'https://santos.sp.gov.br/edital' },
        { orgao: 'Eletrobras', uf: 'XX', inscricoesAte: '20/10/2026', link: 'javascript:alert(1)', vagas: 'cadastro reserva' },
        { titulo: '' },
      ],
      'texto colado',
      '2026-09-28T12:00:00.000Z',
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ titulo: 'Prefeitura de Santos', uf: 'SP', salario: 9800.5, vagas: 3, cargos: ['Engenheiro Eletricista'], banca: 'Vunesp' });
    expect(r[1]).toMatchObject({ uf: 'BR', inscricoesAte: null, link: '', vagas: null });
    expect(r[0].id).toMatch(/^op/);
  });
});

import { oportunidadesNovas } from '../../src/radar/radar';

describe('alerta de oportunidades novas', () => {
  const base = { id: 'x', titulo: 'Prefeitura de Santos', orgao: 'Prefeitura de Santos', banca: '', cargos: ['Engenheiro Eletricista'], salario: 9000, vagas: 1, uf: 'SP', inscricoesAte: '2026-10-20', link: '', fonte: 'PCI Concursos', coletadoEm: '2026-09-28T09:00:00.000Z' };
  const filtro = { id: 'padrao', nome: 'Padrão', areas: ['Engenharia Elétrica'], ufs: ['SP', 'RJ'], bancas: [], salarioMinimo: null };

  it('só as abertas, não ignoradas, que batem com o filtro e chegaram depois da última visita', () => {
    const ops = [
      base,
      { ...base, id: 'mg', uf: 'MG' },
      { ...base, id: 'fechada', inscricoesAte: '2026-09-01' },
      { ...base, id: 'ignorada', ignorada: true },
      { ...base, id: 'vista', coletadoEm: '2026-09-20T09:00:00.000Z' },
      { ...base, id: 'civil', cargos: ['Engenheiro Civil'] },
    ];
    expect(oportunidadesNovas(ops, [filtro], '2026-09-25T00:00:00.000Z', '2026-09-28').map((o) => o.id)).toEqual(['x']);
    expect(oportunidadesNovas(ops, [], null, '2026-09-28').map((o) => o.id)).toEqual(['x', 'mg', 'vista', 'civil']);
  });
});

import { mesclarOportunidades } from '../../src/radar/radar';

describe('junção da coleta com o banco', () => {
  const o = (id: string, uf: string, extra = {}) => ({ id, titulo: id, orgao: id, banca: '', cargos: [], salario: null, vagas: null, uf, inscricoesAte: '2026-10-30', link: '', fonte: 'PCI Concursos', coletadoEm: '2026-09-28T10:00:00.000Z', ...extra });

  it('só devolve os documentos que mudaram e apaga a UF que ficou vazia', () => {
    const banco = {
      SP: { a: o('a', 'SP', { coletadoEm: '2026-09-01T10:00:00.000Z', ignorada: true }) },
      RJ: { velha: o('velha', 'RJ', { inscricoesAte: '2026-08-01' }) },
      MG: { m: o('m', 'MG') },
    };
    const r = mesclarOportunidades(banco, [o('a', 'SP'), o('b', 'ES')], '2026-09-28');
    expect(Object.keys(r.docs).sort()).toEqual(['ES', 'SP']);
    expect(r.vazias).toEqual(['RJ']);
    expect(r.docs.SP.a).toMatchObject({ coletadoEm: '2026-09-01T10:00:00.000Z', ignorada: true });
    expect(r).toMatchObject({ novas: 1, atualizadas: 1 });
  });
});
