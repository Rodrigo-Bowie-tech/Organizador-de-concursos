// Vales de descanso (27/11/2026, a pedido do usuário): a cada `estudoMin` de estudo de verdade
// (cronômetro, registro manual, prática com IA) ganha-se um vale da próxima atividade da lista,
// sempre na mesma ordem e sem recomeçar a cada dia (o que sobra num dia vale no seguinte). O vale
// fica guardado até ser usado; usar abre uma contagem de `minutos`.

import { intervalosAtivos } from './cronometro';
import type { ConfigVales, Sessao, UsoVale } from './tipos';

export const VALES_PADRAO: Omit<ConfigVales, 'desde'> = {
  estudoMin: 120,
  atividades: [
    { nome: 'Música', minutos: 60 },
    { nome: 'Exercícios físicos', minutos: 60 },
  ],
};

export interface Vale {
  /** Ordem do vale desde o começo da contagem (0, 1, 2…): define a atividade. */
  numero: number;
  atividade: string;
  minutos: number;
  /** Quando as horas de estudo que o pagam se completaram. */
  ganhoEm: string;
}

export interface EstadoVales {
  /** Segundos de estudo desde o começo da contagem. */
  estudadoSeg: number;
  ganhos: Vale[];
  /** Ganhos e ainda não usados, do mais antigo para o mais novo. */
  disponiveis: Vale[];
  /** O vale em uso agora (contagem correndo), se houver. */
  emUso: (UsoVale & { restaSeg: number }) | null;
  /** O próximo vale: qual atividade, quanto falta e a parte já estudada (0 a 1). */
  proximo: { atividade: string; minutos: number; faltaSeg: number; progresso: number } | null;
}

/** Vales ganhos, disponíveis e o próximo, a partir das sessões (inclusive a em andamento). */
export function estadoDosVales(cfg: ConfigVales | null | undefined, sessoes: Sessao[], ativa: Sessao | null, usos: UsoVale[], agora: Date | number): EstadoVales {
  const atividades = (cfg?.atividades ?? []).filter((a) => a.nome.trim() && a.minutos > 0);
  const passo = (cfg?.estudoMin ?? 0) * 60;
  if (!cfg || !atividades.length || !(passo > 0)) return { estudadoSeg: 0, ganhos: [], disponiveis: [], emUso: null, proximo: null };
  const desde = Date.parse(cfg.desde);
  const agoraMs = Number(agora);
  // Trechos de estudo depois do começo da contagem, na ordem do relógio.
  const trechos = [...sessoes, ...(ativa ? [ativa] : [])]
    .flatMap((s) => intervalosAtivos(s, agoraMs))
    .map(([a, z]): [number, number] => [Math.max(a, desde), Math.min(z, agoraMs)])
    .filter(([a, z]) => z > a)
    .sort((x, y) => x[0] - y[0]);
  const ganhos: Vale[] = [];
  let acumulado = 0;
  for (const [a, z] of trechos) {
    let inicio = a;
    while (inicio < z) {
      const proximaMarca = (ganhos.length + 1) * passo;
      const ate = Math.min(z, inicio + (proximaMarca - acumulado) * 1000);
      acumulado += (ate - inicio) / 1000;
      inicio = ate;
      if (acumulado >= proximaMarca - 1e-6) {
        const atividade = atividades[ganhos.length % atividades.length];
        ganhos.push({ numero: ganhos.length, atividade: atividade.nome.trim(), minutos: atividade.minutos, ganhoEm: new Date(ate).toISOString() });
      }
    }
  }
  const usados = new Set(usos.map((u) => u.numero));
  const emUsoBruto = usos.find((u) => !u.fim && Date.parse(u.inicio) + u.minutos * 60_000 > agoraMs) ?? null;
  const emUso = emUsoBruto ? { ...emUsoBruto, restaSeg: Math.ceil((Date.parse(emUsoBruto.inicio) + emUsoBruto.minutos * 60_000 - agoraMs) / 1000) } : null;
  const seguinte = atividades[ganhos.length % atividades.length];
  const feito = acumulado - ganhos.length * passo;
  return {
    estudadoSeg: Math.floor(acumulado),
    ganhos,
    disponiveis: ganhos.filter((v) => !usados.has(v.numero)),
    emUso,
    proximo: { atividade: seguinte.nome.trim(), minutos: seguinte.minutos, faltaSeg: Math.max(0, Math.ceil(passo - feito)), progresso: Math.min(1, Math.max(0, feito / passo)) },
  };
}
