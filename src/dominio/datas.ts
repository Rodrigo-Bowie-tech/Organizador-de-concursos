// Datas e horas no fuso de São Paulo. Instantes são guardados em UTC (ISO) e
// convertidos aqui para o dia civil de SP, que decide a qual dia, semana e mês
// cada minuto de estudo pertence. Sem dependências: usa só Intl.

import type { DiaISO } from './tipos';

export const FUSO = 'America/Sao_Paulo';

const formatoPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface Partes {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

export function partesSP(instante: Date | number): Partes {
  const p: Record<string, number> = {};
  for (const parte of formatoPartes.formatToParts(new Date(instante))) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  }
  return {
    ano: p.year,
    mes: p.month,
    dia: p.day,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  };
}

/** Diferença, em ms, entre a hora de SP e UTC naquele instante (ex.: -3h). */
function deslocamento(instanteMs: number): number {
  const p = partesSP(instanteMs);
  const comoUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUTC - Math.floor(instanteMs / 1000) * 1000;
}

const dois = (n: number) => String(n).padStart(2, '0');

export function montarDia(ano: number, mes: number, dia: number): DiaISO {
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

function lerDia(dia: DiaISO): [number, number, number] {
  const [a, m, d] = dia.split('-').map(Number);
  return [a, m, d];
}

/** Dia civil em SP de um instante. */
export function diaSP(instante: Date | number | string): DiaISO {
  const p = partesSP(new Date(instante));
  return montarDia(p.ano, p.mes, p.dia);
}

/** Instante correspondente a `HH:mm` de um dia em SP. */
export function instanteSP(dia: DiaISO, hora = '00:00'): Date {
  const [a, m, d] = lerDia(dia);
  const [h, min] = hora.split(':').map(Number);
  const comoUTC = Date.UTC(a, m - 1, d, h, min);
  let palpite = comoUTC - deslocamento(comoUTC);
  // Segunda passada cobre mudanças de horário de verão (SP não tem desde 2019).
  palpite = comoUTC - deslocamento(palpite);
  return new Date(palpite);
}

export function inicioDoDiaSP(dia: DiaISO): Date {
  return instanteSP(dia, '00:00');
}

export function somarDias(dia: DiaISO, n: number): DiaISO {
  const [a, m, d] = lerDia(dia);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return montarDia(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(dia: DiaISO): number {
  const [a, m, d] = lerDia(dia);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Semanas começam no domingo, como no calendário do app. */
export function inicioDaSemana(dia: DiaISO): DiaISO {
  return somarDias(dia, -diaDaSemana(dia));
}

export function inicioDoMes(dia: DiaISO): DiaISO {
  return `${dia.slice(0, 7)}-01`;
}

/** Dias de `de` até `ate` (positivo se `ate` for depois). */
export function diasEntre(de: DiaISO, ate: DiaISO): number {
  const [a1, m1, d1] = lerDia(de);
  const [a2, m2, d2] = lerDia(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

// ---------------------------------------------------------------- formatação

/** `dd/mm/aaaa`. */
export function formatarData(valor: DiaISO | Date | string): string {
  const dia = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : diaSP(valor);
  const [a, m, d] = lerDia(dia);
  return `${dois(d)}/${dois(m)}/${a}`;
}

/** `HH:mm` em SP. */
export function formatarHora(instante: Date | string | number): string {
  const p = partesSP(new Date(instante));
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** `1h05min`, `0h32min`. Arredonda para baixo. */
export function formatarDuracao(segundos: number): string {
  const min = Math.floor(Math.max(0, segundos) / 60);
  return `${Math.floor(min / 60)}h${dois(min % 60)}min`;
}

/** `01:05:09`, para o relógio do cronômetro. */
export function formatarRelogio(segundos: number): string {
  const s = Math.floor(Math.max(0, segundos));
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
}

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function nomeDiaCurto(dia: DiaISO): string {
  return NOMES_DIAS[diaDaSemana(dia)];
}

export function nomeMes(dia: DiaISO): string {
  return NOMES_MESES[lerDia(dia)[1] - 1];
}

/** Converte `dd/mm/aaaa` para `AAAA-MM-DD`; `null` se inválida. */
export function lerDataBR(texto: string): DiaISO | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dia = montarDia(a, mes, d);
  return somarDias(dia, 0) === dia ? dia : null;
}
