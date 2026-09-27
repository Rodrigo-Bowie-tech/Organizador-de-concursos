import { describe, expect, it } from 'vitest';
import {
  estadoDaSessao,
  fasePomodoro,
  finalizar,
  pausar,
  retomar,
  segundosDePausa,
  segundosLiquidos,
  segundosPorDia,
} from '../../src/dominio/cronometro';
import type { ConfigPomodoro, Sessao } from '../../src/dominio/tipos';

const t = (iso: string) => new Date(iso);

function sessao(inicio: string, extra: Partial<Sessao> = {}): Sessao {
  return {
    id: 's1',
    concursoId: null,
    disciplinaId: null,
    topicoId: null,
    tipo: 'teoria',
    inicio,
    fim: null,
    pausas: [],
    segundosLiquidos: null,
    questoesFeitas: 0,
    acertos: 0,
    paginas: 0,
    anotacoes: '',
    origem: 'cronometro',
    concluiuTeoria: false,
    ...extra,
  };
}

describe('tempo líquido', () => {
  it('desconta várias pausas', () => {
    // 20:00 às 22:00 com pausas de 10 e 20 minutos → 1h30 líquida
    const s = sessao('2026-09-27T23:00:00Z', {
      fim: '2026-09-28T01:00:00Z',
      pausas: [
        { inicio: '2026-09-27T23:30:00Z', fim: '2026-09-27T23:40:00Z' },
        { inicio: '2026-09-28T00:10:00Z', fim: '2026-09-28T00:30:00Z' },
      ],
    });
    expect(segundosLiquidos(s, 0)).toBe(90 * 60);
    expect(segundosDePausa(s, 0)).toBe(30 * 60);
  });

  it('pausa aberta congela o relógio', () => {
    const s = sessao('2026-09-27T12:00:00Z', {
      pausas: [{ inicio: '2026-09-27T12:25:00Z', fim: null }],
    });
    expect(estadoDaSessao(s)).toBe('pausada');
    expect(segundosLiquidos(s, t('2026-09-27T12:40:00Z'))).toBe(25 * 60);
    expect(segundosLiquidos(s, t('2026-09-27T15:00:00Z'))).toBe(25 * 60);
  });

  it('pausas sobrepostas ou fora da sessão não descontam em dobro', () => {
    const s = sessao('2026-09-27T12:00:00Z', {
      fim: '2026-09-27T13:00:00Z',
      pausas: [
        { inicio: '2026-09-27T11:50:00Z', fim: '2026-09-27T12:10:00Z' }, // começa antes
        { inicio: '2026-09-27T12:05:00Z', fim: '2026-09-27T12:20:00Z' }, // sobreposta
        { inicio: '2026-09-27T12:55:00Z', fim: '2026-09-27T13:30:00Z' }, // termina depois
      ],
    });
    // pausa efetiva: 12:00–12:20 e 12:55–13:00 = 25 min → 35 min líquidos
    expect(segundosLiquidos(s, 0)).toBe(35 * 60);
  });

  it('recarregar a página não perde tempo: o cálculo só depende dos horários salvos', () => {
    const salvo = JSON.parse(JSON.stringify(sessao('2026-09-27T12:00:00Z'))) as Sessao;
    expect(segundosLiquidos(salvo, t('2026-09-27T12:45:10Z'))).toBe(45 * 60 + 10);
  });

  it('pausar, retomar e finalizar', () => {
    let s = sessao('2026-09-27T12:00:00Z');
    s = pausar(s, t('2026-09-27T12:30:00Z'));
    expect(estadoDaSessao(s)).toBe('pausada');
    expect(pausar(s, t('2026-09-27T12:31:00Z'))).toBe(s); // pausar de novo não duplica
    s = retomar(s, t('2026-09-27T12:40:00Z'));
    expect(estadoDaSessao(s)).toBe('rodando');
    s = pausar(s, t('2026-09-27T13:00:00Z'));
    // finalizar durante a pausa fecha a pausa no mesmo instante
    s = finalizar(s, t('2026-09-27T13:15:00Z'));
    expect(estadoDaSessao(s)).toBe('finalizada');
    expect(s.pausas.every((p) => p.fim)).toBe(true);
    expect(s.segundosLiquidos).toBe(50 * 60);
  });
});

describe('tempo por dia (fuso de SP)', () => {
  it('sessão que atravessa a meia-noite de SP conta para os dois dias', () => {
    // 23:30 às 00:30 em SP
    const s = sessao('2026-09-28T02:30:00Z', { fim: '2026-09-28T03:30:00Z' });
    const porDia = segundosPorDia([s], 0);
    expect(porDia.get('2026-09-27')).toBe(30 * 60);
    expect(porDia.get('2026-09-28')).toBe(30 * 60);
  });

  it('sessão às 23h30 de SP conta para o dia de SP, não o de UTC', () => {
    const s = sessao('2026-09-28T02:30:00Z', { fim: '2026-09-28T02:50:00Z' });
    expect([...segundosPorDia([s], 0).keys()]).toEqual(['2026-09-27']);
  });

  it('soma várias sessões e usa "agora" para a sessão em andamento', () => {
    const feita = sessao('2026-09-27T09:00:00Z', { fim: '2026-09-27T10:00:00Z' });
    const rodando = sessao('2026-09-27T20:00:00Z');
    const porDia = segundosPorDia([feita, rodando], t('2026-09-27T20:15:00Z'));
    expect(porDia.get('2026-09-27')).toBe(75 * 60);
  });
});

describe('Pomodoro', () => {
  const cfg: ConfigPomodoro = { ativo: true, focoMin: 25, pausaCurtaMin: 5, pausaLongaMin: 15, ciclosAtePausaLonga: 4 };

  it('conta o foco pelo tempo líquido', () => {
    const s = sessao('2026-09-27T12:00:00Z');
    const f = fasePomodoro(s, cfg, t('2026-09-27T12:20:00Z'));
    expect(f).toMatchObject({ fase: 'foco', ciclosCompletos: 0, restante: 5 * 60 });
  });

  it('pausa curta depois de um ciclo e longa depois de quatro', () => {
    const curta = pausar(sessao('2026-09-27T12:00:00Z'), t('2026-09-27T12:25:00Z'));
    expect(fasePomodoro(curta, cfg, t('2026-09-27T12:27:00Z'))).toMatchObject({
      fase: 'pausa_curta',
      restante: 3 * 60,
    });
    const longa = pausar(sessao('2026-09-27T12:00:00Z'), t('2026-09-27T13:40:00Z'));
    expect(fasePomodoro(longa, cfg, t('2026-09-27T13:40:00Z'))).toMatchObject({
      fase: 'pausa_longa',
      ciclosCompletos: 4,
      restante: 15 * 60,
    });
  });
});
