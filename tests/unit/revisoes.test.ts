import { describe, expect, it } from 'vitest';
import { diasEntre } from '../../src/dominio/datas';
import {
  descreverIntervalo,
  iniciarRevisao,
  previsao,
  registrarRevisao,
  revisoesAgendadas,
  separarRevisoes,
} from '../../src/dominio/revisoes';
import type { Avaliacao } from '../../src/dominio/revisoes';
import type { Disciplina, EstadoRevisao, Topico } from '../../src/dominio/tipos';

const CONCLUSAO = '2026-09-27';

/** Revisa sempre no dia marcado, com as avaliações dadas; devolve os dias (D+n) de cada revisão. */
function seguir(avaliacoes: Avaliacao[]): number[] {
  let e = iniciarRevisao(CONCLUSAO);
  const dias = [diasEntre(CONCLUSAO, e.proxima)];
  for (const a of avaliacoes) {
    e = registrarRevisao(e, a, e.proxima);
    dias.push(diasEntre(CONCLUSAO, e.proxima));
  }
  return dias;
}

describe('revisões espaçadas', () => {
  it('teoria concluída agenda a primeira revisão para D+1', () => {
    expect(iniciarRevisao(CONCLUSAO)).toMatchObject({ proxima: '2026-09-28', repeticoes: 0, facilidade: 2.5 });
  });

  it('avaliando "bom" sempre, segue a escada da SPEC: D+1, D+7, D+30, D+90', () => {
    expect(seguir(['bom', 'bom', 'bom'])).toEqual([1, 7, 30, 90]);
  });

  it('depois da escada, os intervalos crescem pela facilidade', () => {
    const dias = seguir(['bom', 'bom', 'bom', 'bom']);
    expect(dias[4] - dias[3]).toBe(150); // 60 × 2,5
  });

  it('"fácil" afasta e "difícil" aproxima a próxima revisão', () => {
    const e = registrarRevisao(iniciarRevisao(CONCLUSAO), 'bom', '2026-09-28'); // próxima em 23 dias no "bom"
    expect(previsao(e, 'bom')).toBe(23);
    expect(previsao(e, 'facil')).toBeGreaterThan(23);
    expect(previsao(e, 'dificil')).toBeLessThan(23);
  });

  it('"errei" volta para o dia seguinte, recomeça a escada e reduz a facilidade', () => {
    let e = registrarRevisao(iniciarRevisao(CONCLUSAO), 'bom', '2026-09-28');
    e = registrarRevisao(e, 'errei', '2026-10-04');
    expect(e).toMatchObject({ proxima: '2026-10-05', repeticoes: 0, lapsos: 1, facilidade: 2.3 });
    // Recomeça: o próximo "bom" volta ao degrau de 6 dias, ajustado pela facilidade menor.
    expect(previsao(e, 'bom')).toBe(Math.round((6 * 2.3) / 2.5));
  });

  it('a facilidade fica entre 1,3 e 3,0', () => {
    let e: EstadoRevisao = iniciarRevisao(CONCLUSAO);
    for (let i = 0; i < 20; i++) e = registrarRevisao(e, 'errei', CONCLUSAO);
    expect(e.facilidade).toBe(1.3);
    for (let i = 0; i < 20; i++) e = registrarRevisao(e, 'facil', CONCLUSAO);
    expect(e.facilidade).toBe(3);
  });

  it('descreve o intervalo em português', () => {
    expect(descreverIntervalo(1)).toBe('amanhã');
    expect(descreverIntervalo(6)).toBe('em 6 dias');
    expect(descreverIntervalo(60)).toBe('em 2 meses');
  });
});

describe('fila de revisões', () => {
  const topico = (id: string, proxima: string | null): Topico => ({
    id,
    paiId: null,
    titulo: id,
    ordem: 0,
    status: 'teoria_concluida',
    autoavaliacao: null,
    incidencia: null,
    grupoEquivalenciaId: null,
    revisao: proxima ? { ...iniciarRevisao(CONCLUSAO), proxima } : null,
  });
  const disciplina = {
    id: 'd1',
    topicos: Object.fromEntries(
      [topico('atrasada', '2026-10-01'), topico('hoje', '2026-10-03'), topico('semana', '2026-10-08'), topico('longe', '2026-11-30'), topico('sem', null)].map(
        (t) => [t.id, t],
      ),
    ),
  } as unknown as Disciplina;

  it('separa atrasadas, de hoje e dos próximos 7 dias', () => {
    const r = separarRevisoes(revisoesAgendadas([disciplina], '2026-10-03'));
    expect(r.atrasadas.map((x) => [x.topico.id, x.atraso])).toEqual([['atrasada', 2]]);
    expect(r.hoje.map((x) => x.topico.id)).toEqual(['hoje']);
    expect(r.proximas.map((x) => x.topico.id)).toEqual(['semana']);
  });
});
