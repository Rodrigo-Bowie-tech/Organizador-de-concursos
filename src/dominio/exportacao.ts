// Planilhas (Fase 8): sessões e questões em CSV para abrir no Excel ou no
// Google Planilhas. Separador ";" e vírgula decimal (padrão brasileiro), BOM
// para o Excel reconhecer UTF-8, datas dd/mm/aaaa no fuso de São Paulo.

import { segundosLiquidos } from './cronometro';
import { formatarData, formatarHora } from './datas';
import { TIPO_SESSAO } from './rotulos';
import { caminhoDoTopico } from './topicos';
import type { Concurso, Disciplina, Id, RegistroQuestoes, Sessao } from './tipos';

type Celula = string | number | null | undefined;

function celula(v: Celula): string {
  if (v === null || v === undefined) return '';
  const t = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function paraCsv(cabecalho: string[], linhas: Celula[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

function nomes(concursos: Concurso[], disciplinas: Disciplina[]) {
  const concurso = new Map(concursos.map((c) => [c.id, c.nome]));
  const disciplina = new Map(disciplinas.map((d) => [d.id, d]));
  return {
    concurso: (id: Id | null) => (id ? (concurso.get(id) ?? '') : ''),
    disciplina: (id: Id | null) => (id ? (disciplina.get(id)?.nome ?? '') : ''),
    topico: (dId: Id | null, tId: Id | null) => {
      const d = dId ? disciplina.get(dId) : undefined;
      return d && tId && d.topicos[tId] ? caminhoDoTopico(d.topicos, tId).join(' › ') : '';
    },
  };
}

export function csvSessoes(sessoes: Sessao[], concursos: Concurso[], disciplinas: Disciplina[], agora: Date): string {
  const n = nomes(concursos, disciplinas);
  const linhas = [...sessoes]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((s) => [
      formatarData(s.inicio),
      formatarHora(s.inicio),
      s.fim ? formatarHora(s.fim) : '',
      segundosLiquidos(s, agora) / 60,
      n.concurso(s.concursoId),
      n.disciplina(s.disciplinaId),
      n.topico(s.disciplinaId, s.topicoId),
      TIPO_SESSAO[s.tipo],
      s.questoesFeitas,
      s.acertos,
      s.paginas,
      { cronometro: 'Cronômetro', manual: 'Manual', pratica_ia: 'Prática com IA' }[s.origem],
      s.anotacoes,
    ]);
  return paraCsv(
    ['Data', 'Início', 'Fim', 'Minutos líquidos', 'Concurso', 'Disciplina', 'Tópico', 'Tipo', 'Questões', 'Acertos', 'Páginas', 'Origem', 'Anotações'],
    linhas,
  );
}

/** Questões das sessões e os registros avulsos (lançamento rápido, CSV, provas refeitas). */
export function csvQuestoes(sessoes: Sessao[], registros: RegistroQuestoes[], concursos: Concurso[], disciplinas: Disciplina[]): string {
  const n = nomes(concursos, disciplinas);
  const linhas: { chave: string; l: Celula[] }[] = [];
  for (const s of sessoes) {
    if (!s.questoesFeitas) continue;
    const acertos = Math.min(s.acertos, s.questoesFeitas);
    linhas.push({
      chave: s.inicio,
      l: [formatarData(s.inicio), n.concurso(s.concursoId), n.disciplina(s.disciplinaId), n.topico(s.disciplinaId, s.topicoId), s.questoesFeitas, acertos, (acertos / s.questoesFeitas) * 100, `Sessão (${TIPO_SESSAO[s.tipo]})`],
    });
  }
  for (const r of registros) {
    if (!r.feitas) continue;
    const acertos = Math.min(r.acertos, r.feitas);
    linhas.push({
      chave: `${r.dia}T12:00:00`,
      l: [formatarData(r.dia), n.concurso(r.concursoId), n.disciplina(r.disciplinaId), n.topico(r.disciplinaId, r.topicoId), r.feitas, acertos, (acertos / r.feitas) * 100, r.fonte],
    });
  }
  linhas.sort((a, b) => a.chave.localeCompare(b.chave));
  return paraCsv(['Data', 'Concurso', 'Disciplina', 'Tópico', 'Feitas', 'Acertos', '% de acerto', 'Fonte'], linhas.map((x) => x.l));
}

/** Lembrar do backup: há dados e o último foi há mais de 30 dias (ou nunca). */
export function backupAtrasado(ultimoBackup: string | null, nSessoes: number, agora: Date): boolean {
  if (nSessoes < 10) return false;
  return !ultimoBackup || agora.getTime() - Date.parse(ultimoBackup) > 30 * 86_400_000;
}
