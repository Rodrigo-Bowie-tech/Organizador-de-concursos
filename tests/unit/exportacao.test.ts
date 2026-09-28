import { describe, expect, it } from 'vitest';
import { backupAtrasado, csvQuestoes, csvSessoes, paraCsv } from '../../src/dominio/exportacao';
import type { Concurso, Disciplina, Sessao } from '../../src/dominio/tipos';

const concurso = { id: 'ff', nome: 'Fundação Florestal' } as Concurso;
const disciplina = {
  id: 'ee',
  concursoId: 'ff',
  nome: 'Engenharia Elétrica',
  topicos: {
    t1: { id: 't1', paiId: null, titulo: 'Circuitos', ordem: 0 },
    t2: { id: 't2', paiId: 't1', titulo: 'Lei de Ohm', ordem: 0 },
  },
} as unknown as Disciplina;

const sessao = (extra: Partial<Sessao>): Sessao => ({
  id: 's', concursoId: 'ff', disciplinaId: 'ee', topicoId: 't2', tipo: 'questoes', inicio: '2026-09-25T12:00:00.000Z', fim: '2026-09-25T13:30:00.000Z',
  pausas: [{ inicio: '2026-09-25T12:30:00.000Z', fim: '2026-09-25T12:45:00.000Z', motivo: '' }], segundosLiquidos: null, questoesFeitas: 20, acertos: 15, paginas: 0,
  anotacoes: 'Revisar; "pegadinha"', origem: 'cronometro', concluiuTeoria: false, ...extra,
});

describe('planilhas CSV', () => {
  it('usa ; e vírgula decimal, com BOM e aspas quando precisa', () => {
    expect(paraCsv(['a', 'b'], [[1.5, 'x;y'], ['linha\nnova', null]])).toBe('﻿a;b\r\n1,5;"x;y"\r\n"linha\nnova";\r\n');
  });

  it('sessões: dia e hora de São Paulo, minutos líquidos (sem pausas) e o caminho do tópico', () => {
    const linhas = csvSessoes([sessao({})], [concurso], [disciplina], new Date('2026-09-28T00:00:00Z')).replace('﻿', '').trim().split('\r\n');
    expect(linhas[0]).toBe('Data;Início;Fim;Minutos líquidos;Concurso;Disciplina;Tópico;Tipo;Questões;Acertos;Páginas;Origem;Anotações');
    expect(linhas[1]).toBe('25/09/2026;09:00;10:30;75;Fundação Florestal;Engenharia Elétrica;Circuitos › Lei de Ohm;Questões;20;15;0;Cronômetro;"Revisar; ""pegadinha"""');
  });

  it('questões: sessões com questões e registros avulsos, em ordem de data', () => {
    const csv = csvQuestoes(
      [sessao({}), sessao({ questoesFeitas: 0 })],
      [{ id: 'r', concursoId: 'ff', disciplinaId: 'ee', topicoId: null, dia: '2026-09-20', feitas: 3, acertos: 1, fonte: 'QConcursos' }],
      [concurso],
      [disciplina],
    );
    const linhas = csv.replace('﻿', '').trim().split('\r\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe('20/09/2026;Fundação Florestal;Engenharia Elétrica;;3;1;33,33;QConcursos');
    expect(linhas[2]).toBe('25/09/2026;Fundação Florestal;Engenharia Elétrica;Circuitos › Lei de Ohm;20;15;75;Sessão (Questões)');
  });

  it('lembra do backup só quando há dados e o último tem mais de 30 dias', () => {
    const agora = new Date('2026-09-28T12:00:00Z');
    expect(backupAtrasado(null, 3, agora)).toBe(false);
    expect(backupAtrasado(null, 10, agora)).toBe(true);
    expect(backupAtrasado('2026-09-01T12:00:00Z', 50, agora)).toBe(false);
    expect(backupAtrasado('2026-08-20T12:00:00Z', 50, agora)).toBe(true);
  });
});
