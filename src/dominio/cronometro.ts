// Cronômetro de horas líquidas. O banco guarda só o início da sessão e as pausas;
// o tempo líquido é sempre calculado: (fim ou agora) − início − pausas. Assim,
// recarregar a página, fechar o app ou trocar de aparelho não perde nada.

import { diaSP, inicioDoDiaSP, somarDias } from './datas';
import type { ConfigPomodoro, DiaISO, Sessao } from './tipos';

export type EstadoSessao = 'rodando' | 'pausada' | 'finalizada';

type Intervalo = [number, number];
type SessaoTempo = Pick<Sessao, 'inicio' | 'fim' | 'pausas'>;

export function estadoDaSessao(s: SessaoTempo): EstadoSessao {
  if (s.fim) return 'finalizada';
  const ultima = s.pausas[s.pausas.length - 1];
  return ultima && ultima.fim === null ? 'pausada' : 'rodando';
}

/**
 * Trechos em que a sessão contou tempo: [início, fim] menos as pausas. Pausas
 * fora da sessão são cortadas e pausas sobrepostas não descontam duas vezes.
 */
export function intervalosAtivos(s: SessaoTempo, agora: Date | number): Intervalo[] {
  const inicio = Date.parse(s.inicio);
  const fim = s.fim ? Date.parse(s.fim) : Number(agora);
  if (!(fim > inicio)) return [];

  const pausas = s.pausas
    .map((p): Intervalo => [
      Math.max(inicio, Date.parse(p.inicio)),
      Math.min(fim, p.fim ? Date.parse(p.fim) : fim),
    ])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const ativos: Intervalo[] = [];
  let cursor = inicio;
  for (const [a, b] of pausas) {
    if (a > cursor) ativos.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (fim > cursor) ativos.push([cursor, fim]);
  return ativos;
}

export function segundosLiquidos(s: SessaoTempo, agora: Date | number): number {
  const ms = intervalosAtivos(s, agora).reduce((t, [a, b]) => t + (b - a), 0);
  return Math.floor(ms / 1000);
}

export function segundosDePausa(s: SessaoTempo, agora: Date | number): number {
  const inicio = Date.parse(s.inicio);
  const fim = s.fim ? Date.parse(s.fim) : Number(agora);
  return Math.max(0, Math.floor((fim - inicio) / 1000) - segundosLiquidos(s, agora));
}

/**
 * Soma o tempo líquido por dia civil de SP. Uma sessão das 23h30 à 0h30 conta
 * 30 minutos para cada dia.
 */
export function segundosPorDia(sessoes: SessaoTempo[], agora: Date | number): Map<DiaISO, number> {
  const ms = new Map<DiaISO, number>();
  for (const s of sessoes) {
    for (const [a, b] of intervalosAtivos(s, agora)) {
      let cursor = a;
      while (cursor < b) {
        const dia = diaSP(cursor);
        const proximaMeiaNoite = inicioDoDiaSP(somarDias(dia, 1)).getTime();
        const ate = Math.min(b, proximaMeiaNoite);
        ms.set(dia, (ms.get(dia) ?? 0) + (ate - cursor));
        cursor = ate;
      }
    }
  }
  const segundos = new Map<DiaISO, number>();
  for (const [dia, v] of ms) segundos.set(dia, Math.floor(v / 1000));
  return segundos;
}

// ------------------------------------------------------------ transições

export function pausar(s: Sessao, agora: Date, motivo?: string): Sessao {
  if (estadoDaSessao(s) !== 'rodando') return s;
  const pausa = motivo ? { inicio: agora.toISOString(), fim: null, motivo } : { inicio: agora.toISOString(), fim: null };
  return { ...s, pausas: [...s.pausas, pausa] };
}

export function retomar(s: Sessao, agora: Date): Sessao {
  if (estadoDaSessao(s) !== 'pausada') return s;
  const pausas = s.pausas.slice();
  pausas[pausas.length - 1] = { ...pausas[pausas.length - 1], fim: agora.toISOString() };
  return { ...s, pausas };
}

/** Fecha a pausa aberta (se houver), grava o fim e o tempo líquido. */
export function finalizar(s: Sessao, agora: Date): Sessao {
  if (s.fim) return s;
  const aberta = retomar(s, agora);
  const fechada = { ...aberta, fim: agora.toISOString() };
  return { ...fechada, segundosLiquidos: segundosLiquidos(fechada, agora) };
}

// ------------------------------------------------------------- Pomodoro

export interface FasePomodoro {
  fase: 'foco' | 'pausa_curta' | 'pausa_longa';
  /** Ciclos de foco completos nesta sessão. */
  ciclosCompletos: number;
  /** Segundos até o fim da fase atual (negativo = passou do tempo). */
  restante: number;
  /** Duração total da fase atual, em segundos. */
  duracao: number;
}

/**
 * O Pomodoro deriva do próprio estado da sessão: cada `focoMin` de tempo
 * líquido fecha um ciclo; durante uma pausa, conta a pausa curta ou longa
 * (longa a cada `ciclosAtePausaLonga` ciclos).
 */
export function fasePomodoro(s: Sessao, cfg: ConfigPomodoro, agora: Date | number): FasePomodoro {
  const foco = Math.max(1, cfg.focoMin) * 60;
  const liquido = segundosLiquidos(s, agora);
  const ciclosCompletos = Math.floor(liquido / foco);

  if (estadoDaSessao(s) === 'pausada') {
    const longa = ciclosCompletos > 0 && ciclosCompletos % Math.max(1, cfg.ciclosAtePausaLonga) === 0;
    const duracao = (longa ? cfg.pausaLongaMin : cfg.pausaCurtaMin) * 60;
    const pausa = s.pausas[s.pausas.length - 1];
    const decorrido = Math.floor((Number(agora) - Date.parse(pausa.inicio)) / 1000);
    return { fase: longa ? 'pausa_longa' : 'pausa_curta', ciclosCompletos, restante: duracao - decorrido, duracao };
  }
  return { fase: 'foco', ciclosCompletos, restante: foco - (liquido % foco), duracao: foco };
}
