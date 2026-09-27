import { describe, expect, it } from 'vitest';
import {
  diaDaSemana,
  diaSP,
  diasEntre,
  formatarData,
  formatarDuracao,
  formatarHora,
  formatarRelogio,
  inicioDaSemana,
  inicioDoMes,
  instanteSP,
  lerDataBR,
  somarDias,
} from '../../src/dominio/datas';

describe('datas no fuso de São Paulo', () => {
  it('23h30 em SP ainda é o mesmo dia, embora já seja o dia seguinte em UTC', () => {
    // 27/09/2026 23:30 em SP = 28/09/2026 02:30 UTC
    expect(diaSP('2026-09-28T02:30:00Z')).toBe('2026-09-27');
    expect(diaSP('2026-09-28T03:00:00Z')).toBe('2026-09-28');
  });

  it('converte hora local de SP para o instante UTC', () => {
    expect(instanteSP('2026-09-27', '06:00').toISOString()).toBe('2026-09-27T09:00:00.000Z');
    expect(instanteSP('2026-09-27').toISOString()).toBe('2026-09-27T03:00:00.000Z');
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarData('2026-01-05')).toBe('05/01/2026');
    expect(formatarData(new Date('2026-09-28T02:30:00Z'))).toBe('27/09/2026');
    expect(formatarHora('2026-09-28T02:30:00Z')).toBe('23:30');
    expect(formatarDuracao(3900)).toBe('1h05min');
    expect(formatarDuracao(32 * 60 + 59)).toBe('0h32min');
    expect(formatarRelogio(3909)).toBe('01:05:09');
  });

  it('semana começa no domingo; mês no dia 1', () => {
    expect(diaDaSemana('2026-09-27')).toBe(0); // domingo
    expect(inicioDaSemana('2026-10-03')).toBe('2026-09-27'); // sábado → domingo anterior
    expect(inicioDaSemana('2026-09-27')).toBe('2026-09-27');
    expect(inicioDoMes('2026-09-27')).toBe('2026-09-01');
  });

  it('aritmética de dias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasEntre('2026-09-27', '2026-11-08')).toBe(42);
  });

  it('lê datas digitadas em dd/mm/aaaa', () => {
    expect(lerDataBR('08/11/2026')).toBe('2026-11-08');
    expect(lerDataBR('31/02/2026')).toBeNull();
    expect(lerDataBR('2026-11-08')).toBeNull();
  });
});
