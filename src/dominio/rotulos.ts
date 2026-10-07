import type { StatusConcurso, StatusTopico, TipoDisciplina, TipoSessao } from './tipos';

export const STATUS_CONCURSO: Record<StatusConcurso, string> = {
  previsto: 'Previsto',
  edital_aberto: 'Edital aberto',
  inscrito: 'Inscrito',
  prova_feita: 'Prova feita',
};

export const STATUS_TOPICO: Record<StatusTopico, string> = {
  nao_iniciado: 'Não iniciado',
  em_estudo: 'Em estudo',
  teoria_concluida: 'Teoria concluída',
  revisado: 'Revisado',
  dominado: 'Dominado',
};

export const TIPO_DISCIPLINA: Record<TipoDisciplina, string> = {
  basica: 'Básica',
  especifica: 'Específica',
  discursiva: 'Discursiva',
};

export const TIPO_SESSAO: Record<TipoSessao, string> = {
  teoria: 'Teoria',
  questoes: 'Questões',
  revisao: 'Revisão',
  lei_seca: 'Lei seca',
  resumo: 'Resumo',
  simulado: 'Simulado',
};

/** Cores das disciplinas, na ordem em que são atribuídas. Legíveis nos dois temas. */
export const CORES_DISCIPLINA = [
  '#2bb99a', '#4a90d9', '#e8864a', '#9b6fd0', '#d9577a',
  '#c9a227', '#3fa7b5', '#7f9c3a', '#b5674a', '#5c6fd6',
];

/** Nome do bloco no calendário: a disciplina; sem disciplina, "Simulado" ou "Estudo". */
export function nomeDoBloco(b: { tipo: TipoSessao; disciplinaId: string | null }, disciplina?: { nome: string }): string {
  if (disciplina) return disciplina.nome;
  if (b.tipo === 'simulado') return 'Simulado';
  if (b.tipo === 'revisao' && !b.disciplinaId) return 'Revisões';
  return b.disciplinaId ? 'Disciplina removida' : 'Estudo';
}

/** Títulos dos tópicos de um bloco que junta várias revisões. */
export function titulosDasRevisoes(b: { revisoes?: string[] }, disciplinas: { topicos: Record<string, { titulo: string }> }[]): string[] {
  if (!b.revisoes?.length) return [];
  return b.revisoes.map((id) => disciplinas.find((d) => d.topicos[id])?.topicos[id]?.titulo ?? 'Tópico removido');
}
