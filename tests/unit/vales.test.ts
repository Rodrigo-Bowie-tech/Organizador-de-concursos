import { describe, expect, it } from 'vitest';
import { estadoDosVales, VALES_PADRAO } from '../../src/dominio/vales';
import type { Sessao, UsoVale } from '../../src/dominio/tipos';

const cfg = { ...VALES_PADRAO, desde: '2026-11-27T03:00:00.000Z' }; // 27/11, 00:00 em SP

function sessao(id: string, inicio: string, fim: string | null, pausas: Sessao['pausas'] = []): Sessao {
  return {
    id, concursoId: null, disciplinaId: null, topicoId: null, tipo: 'teoria', inicio, fim, pausas, segundosLiquidos: null,
    questoesFeitas: 0, acertos: 0, paginas: 0, concluiuTeoria: false, anotacoes: '', origem: 'cronometro',
  } as Sessao;
}

describe('vales de descanso', () => {
  it('a cada 2 h de estudo um vale, alternando música e exercícios, sem recomeçar a cada dia', () => {
    const sessoes = [
      sessao('a', '2026-11-27T23:00:00Z', '2026-11-28T01:00:00Z'), // 27/11 20h–22h
      sessao('b', '2026-11-28T12:00:00Z', '2026-11-28T13:30:00Z'), // 28/11 9h–10h30
    ];
    const e = estadoDosVales(cfg, sessoes, null, [], new Date('2026-11-28T15:00:00Z'));
    expect(e.ganhos.map((v) => `${v.numero} ${v.atividade} ${v.ganhoEm}`)).toEqual(['0 Música 2026-11-28T01:00:00.000Z']);
    expect(e.proximo).toMatchObject({ atividade: 'Exercícios físicos', faltaSeg: 30 * 60, progresso: 0.75 });
    const mais = [...sessoes, sessao('c', '2026-11-28T16:00:00Z', '2026-11-28T18:30:00Z')];
    const e2 = estadoDosVales(cfg, mais, null, [], new Date('2026-11-28T19:00:00Z'));
    // 2 h + 1,5 h + 2,5 h = 6 h: Música, Exercícios e Música de novo.
    expect(e2.ganhos.map((v) => v.atividade)).toEqual(['Música', 'Exercícios físicos', 'Música']);
    expect(e2.ganhos[1].ganhoEm).toBe('2026-11-28T16:30:00.000Z');
    expect(e2.ganhos[2].ganhoEm).toBe('2026-11-28T18:30:00.000Z');
    expect(e2.proximo).toMatchObject({ atividade: 'Exercícios físicos', faltaSeg: 2 * 3600, progresso: 0 });
  });

  it('pausas não contam, o estudo antes do começo da contagem não conta e a sessão em andamento conta', () => {
    const antes = sessao('x', '2026-11-26T12:00:00Z', '2026-11-26T18:00:00Z');
    const pausada = sessao('p', '2026-11-27T12:00:00Z', '2026-11-27T15:00:00Z', [{ inicio: '2026-11-27T13:00:00Z', fim: '2026-11-27T14:00:00Z' }]);
    const ativa = sessao('agora', '2026-11-27T23:00:00Z', null);
    const e = estadoDosVales(cfg, [antes, pausada], ativa, [], new Date('2026-11-27T23:30:00Z'));
    expect(e.estudadoSeg).toBe(2.5 * 3600);
    expect(e.ganhos).toHaveLength(1);
    expect(e.proximo?.faltaSeg).toBe(1.5 * 3600);
  });

  it('usar um vale tira dos disponíveis e a contagem corre; terminado, não fica em uso', () => {
    const sessoes = [sessao('a', '2026-11-27T12:00:00Z', '2026-11-27T16:00:00Z')];
    const uso: UsoVale = { id: 'u', numero: 0, atividade: 'Música', minutos: 60, inicio: '2026-11-27T17:00:00Z', fim: null };
    const e = estadoDosVales(cfg, sessoes, null, [uso], new Date('2026-11-27T17:20:00Z'));
    expect(e.disponiveis.map((v) => v.atividade)).toEqual(['Exercícios físicos']);
    expect(e.emUso).toMatchObject({ id: 'u', restaSeg: 40 * 60 });
    expect(estadoDosVales(cfg, sessoes, null, [uso], new Date('2026-11-27T18:01:00Z')).emUso).toBeNull();
    expect(estadoDosVales(cfg, sessoes, null, [{ ...uso, fim: '2026-11-27T17:30:00Z' }], new Date('2026-11-27T17:40:00Z')).emUso).toBeNull();
    expect(estadoDosVales(null, sessoes, null, [], new Date()).proximo).toBeNull();
  });
});
