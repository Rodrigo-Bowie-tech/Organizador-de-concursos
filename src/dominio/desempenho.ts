// Desempenho (Fase 5): questões (sessões e registros avulsos), caderno de
// erros, simulados e as séries das estatísticas.

import { intervalosAtivos, segundosLiquidos } from './cronometro';
import { diaSP, inicioDaSemana, partesSP, somarDias } from './datas';
import { normalizar, similaridade } from './edital';
import { minutos } from './planejador';
import type { BlocoPlanejado, DiaISO, Disciplina, ErroCaderno, Id, RegistroQuestoes, Sessao, Simulado } from './tipos';

// ------------------------------------------------------------- questões

export interface Questoes {
  topicoId: Id | null;
  disciplinaId: Id | null;
  dia: DiaISO;
  feitas: number;
  acertos: number;
  /** Hora (0–23, SP) em que começou; só para sessões. */
  hora: number | null;
}

/** Sessões e registros avulsos num formato só. */
export function todasAsQuestoes(sessoes: Sessao[], registros: RegistroQuestoes[]): Questoes[] {
  const lista: Questoes[] = [];
  for (const s of sessoes) {
    if (!s.questoesFeitas) continue;
    lista.push({ topicoId: s.topicoId, disciplinaId: s.disciplinaId, dia: diaSP(s.inicio), feitas: s.questoesFeitas, acertos: Math.min(s.acertos, s.questoesFeitas), hora: partesSP(new Date(s.inicio)).hora });
  }
  for (const r of registros) {
    if (!r.feitas) continue;
    lista.push({ topicoId: r.topicoId, disciplinaId: r.disciplinaId, dia: r.dia, feitas: r.feitas, acertos: Math.min(r.acertos, r.feitas), hora: null });
  }
  return lista;
}

export interface Taxa {
  feitas: number;
  acertos: number;
  taxa: number;
}

export function agrupar(lista: Questoes[], chave: (q: Questoes) => string | null): Map<string, Taxa> {
  const m = new Map<string, Taxa>();
  for (const q of lista) {
    const k = chave(q);
    if (k === null) continue;
    const t = m.get(k) ?? { feitas: 0, acertos: 0, taxa: 0 };
    t.feitas += q.feitas;
    t.acertos += q.acertos;
    t.taxa = t.acertos / t.feitas;
    m.set(k, t);
  }
  return m;
}

/** % de acerto por semana (das últimas `semanas`), para uma disciplina ou todas. */
export function acertoSemanal(lista: Questoes[], hoje: DiaISO, semanas = 12, disciplinaId?: Id): { semana: DiaISO; taxa: number | null; feitas: number }[] {
  const ultima = inicioDaSemana(hoje);
  const por = agrupar(
    lista.filter((q) => !disciplinaId || q.disciplinaId === disciplinaId),
    (q) => inicioDaSemana(q.dia),
  );
  return Array.from({ length: semanas }, (_, i) => {
    const semana = somarDias(ultima, (i - semanas + 1) * 7);
    const t = por.get(semana);
    return { semana, taxa: t ? t.taxa : null, feitas: t?.feitas ?? 0 };
  });
}

// ---------------------------------------------------- planejado × realizado

/** Minutos planejados (todos os blocos, marcados ou não) e estudados, por semana. */
export function planejadoRealizado(blocos: BlocoPlanejado[], sessoes: Sessao[], hoje: DiaISO, semanas = 8, agora: Date | number = Date.now()) {
  const ultima = inicioDaSemana(hoje);
  return Array.from({ length: semanas }, (_, i) => {
    const semana = somarDias(ultima, (i - semanas + 1) * 7);
    const fim = somarDias(semana, 6);
    const planejado = blocos.filter((b) => b.dia >= semana && b.dia <= fim).reduce((t, b) => t + minutos(b), 0);
    const realizado = sessoes.filter((s) => {
      const d = diaSP(s.inicio);
      return d >= semana && d <= fim;
    }).reduce((t, s) => t + segundosLiquidos(s, agora) / 60, 0);
    return { semana, planejado, realizado: Math.round(realizado) };
  });
}

// ------------------------------------------------------------ heatmap

/** 53 semanas terminando na semana de hoje; cada dia com os segundos estudados. */
export function heatmapAno(porDia: Map<DiaISO, number>, hoje: DiaISO): { dia: DiaISO; segundos: number; futuro: boolean }[][] {
  const inicio = somarDias(inicioDaSemana(hoje), -52 * 7);
  return Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const dia = somarDias(inicio, w * 7 + d);
      return { dia, segundos: porDia.get(dia) ?? 0, futuro: dia > hoje };
    }),
  );
}

// ------------------------------------------------------- melhor horário

export const FAIXAS = [
  { nome: 'Madrugada', de: 0, ate: 6 },
  { nome: 'Manhã', de: 6, ate: 12 },
  { nome: 'Tarde', de: 12, ate: 18 },
  { nome: 'Noite', de: 18, ate: 24 },
];

/** Minutos estudados por hora do dia (0–23, SP), somando todos os dias. */
export function minutosPorHora(sessoes: Sessao[], agora: Date | number): number[] {
  const horas = Array.from({ length: 24 }, () => 0);
  for (const s of sessoes) {
    for (const [a, b] of intervalosAtivos(s, agora)) {
      let t = a;
      while (t < b) {
        const p = partesSP(t);
        const virada = t + ((60 - p.minuto) * 60 - p.segundo) * 1000 - (t % 1000);
        const fim = Math.min(b, Math.max(virada, t + 1000));
        horas[p.hora] += (fim - t) / 60_000;
        t = fim;
      }
    }
  }
  return horas.map((m) => Math.round(m));
}

/** Por faixa do dia: minutos estudados e % de acerto das sessões que começaram nela. */
export function rendimentoPorFaixa(sessoes: Sessao[], agora: Date | number) {
  const porHora = minutosPorHora(sessoes, agora);
  const questoes = todasAsQuestoes(sessoes, []);
  return FAIXAS.map((f) => {
    const q = questoes.filter((x) => x.hora !== null && x.hora >= f.de && x.hora < f.ate);
    const feitas = q.reduce((t, x) => t + x.feitas, 0);
    const acertos = q.reduce((t, x) => t + x.acertos, 0);
    return { ...f, minutos: porHora.slice(f.de, f.ate).reduce((a, b) => a + b, 0), feitas, taxa: feitas ? acertos / feitas : null };
  });
}

// ------------------------------------------------------------------ CSV

export interface LinhaCsv {
  linha: number;
  topico: string;
  feitas: number;
  acertos: number;
  dia: DiaISO | null;
  fonte: string;
}

function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

function lerDia(v: string): DiaISO | null {
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * CSV genérico de desempenho: tópico, feitas, acertos e, opcionais, data e
 * fonte. Aceita `;`, `,` ou tab, com ou sem cabeçalho.
 */
export function lerCsvDesempenho(texto: string): { linhas: LinhaCsv[]; erros: string[] } {
  const brutas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!brutas.length) return { linhas: [], erros: ['Arquivo vazio.'] };
  const sep = ['\t', ';', ','].map((s) => [s, brutas[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  let colunas = { topico: 0, feitas: 1, acertos: 2, dia: 3, fonte: 4 };
  let inicio = 0;
  const cab = dividirLinha(brutas[0], sep).map((c) => normalizar(c));
  if (cab.some((c) => /topico|assunto/.test(c)) || !cab.slice(1, 3).some((c) => /\d/.test(c))) {
    inicio = 1;
    const achar = (re: RegExp, padrao: number) => {
      const i = cab.findIndex((c) => re.test(c));
      return i >= 0 ? i : padrao;
    };
    colunas = {
      topico: achar(/topico|assunto/, 0),
      feitas: achar(/feitas|resolvidas|total|questoes/, 1),
      acertos: achar(/acert|corret/, 2),
      dia: achar(/data|dia/, -1),
      fonte: achar(/fonte|origem|site/, -1),
    };
  }
  const linhas: LinhaCsv[] = [];
  const erros: string[] = [];
  brutas.slice(inicio).forEach((l, i) => {
    const c = dividirLinha(l, sep);
    const n = i + inicio + 1;
    const topico = c[colunas.topico] ?? '';
    const feitas = Number(c[colunas.feitas]);
    const acertos = Number(c[colunas.acertos]);
    if (!topico || !Number.isFinite(feitas) || !Number.isFinite(acertos) || feitas <= 0 || acertos < 0) {
      erros.push(`Linha ${n}: precisa de tópico, questões feitas e acertos.`);
      return;
    }
    linhas.push({
      linha: n,
      topico,
      feitas: Math.round(feitas),
      acertos: Math.min(Math.round(acertos), Math.round(feitas)),
      dia: colunas.dia >= 0 ? lerDia(c[colunas.dia] ?? '') : null,
      fonte: colunas.fonte >= 0 ? c[colunas.fonte] ?? '' : '',
    });
  });
  return { linhas, erros };
}

/** Tópico do app mais parecido com o texto (título igual ou Jaccard ≥ 0,5). */
export function acharTopico(texto: string, disciplinas: Disciplina[]): { disciplinaId: Id; topicoId: Id } | null {
  const alvo = normalizar(texto);
  let melhor: { disciplinaId: Id; topicoId: Id; s: number } | null = null;
  for (const d of disciplinas) {
    for (const t of Object.values(d.topicos)) {
      const s = normalizar(t.titulo) === alvo ? 1 : similaridade(t.titulo, texto);
      if (s >= 0.5 && (!melhor || s > melhor.s)) melhor = { disciplinaId: d.id, topicoId: t.id, s };
    }
  }
  return melhor && { disciplinaId: melhor.disciplinaId, topicoId: melhor.topicoId };
}

// ------------------------------------------------------ caderno de erros

/** Erro novo: revisões em D+3 e D+14 a partir do dia em que foi anotado. */
export function proximaRevisaoErro(criadoEm: DiaISO, feitas: DiaISO[]): DiaISO | null {
  if (feitas.length === 0) return somarDias(criadoEm, 3);
  if (feitas.length === 1) return somarDias(criadoEm, 14);
  return null;
}

/** Revisar: acertou segue a agenda; errou de novo recomeça em D+3 a partir de hoje. */
export function revisarErro(e: ErroCaderno, acertou: boolean, hoje: DiaISO): Pick<ErroCaderno, 'criadoEm' | 'revisoesFeitas' | 'proximaRevisao'> {
  if (!acertou) return { criadoEm: hoje, revisoesFeitas: [], proximaRevisao: somarDias(hoje, 3) };
  const feitas = [...e.revisoesFeitas, hoje];
  return { criadoEm: e.criadoEm, revisoesFeitas: feitas, proximaRevisao: proximaRevisaoErro(e.criadoEm, feitas) };
}

export function errosParaRevisar(erros: ErroCaderno[], hoje: DiaISO): ErroCaderno[] {
  return erros.filter((e) => e.proximaRevisao && e.proximaRevisao <= hoje).sort((a, b) => (a.proximaRevisao ?? '').localeCompare(b.proximaRevisao ?? ''));
}

// ----------------------------------------------------------- simulados

export function percentual(s: Pick<Simulado, 'notaTotal' | 'notaMaxima'>): number {
  return s.notaMaxima > 0 ? s.notaTotal / s.notaMaxima : 0;
}

/** Distância até a nota de corte (positivo = acima). `null` sem nota de corte. */
export function distanciaCorte(s: Pick<Simulado, 'notaTotal'>, notaCorte: number | null): number | null {
  return notaCorte === null ? null : Math.round((s.notaTotal - notaCorte) * 100) / 100;
}

/** Evolução dos simulados de um concurso, do mais antigo ao mais novo. */
export function evolucaoSimulados(simulados: Simulado[], concursoId: Id) {
  return simulados
    .filter((s) => s.concursoId === concursoId)
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((s) => ({ simulado: s, percentual: percentual(s) }));
}
