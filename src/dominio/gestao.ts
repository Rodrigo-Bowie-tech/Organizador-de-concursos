// Gestão semanal dos concursos: um horário por semana (Disponibilidade) para o que não é estudo
// mas decide a preparação. O bloco do Planejamento traz esta lista; cada tarefa leva à tela
// certa e mostra o que pede atenção naquela semana.

import { diasEntre, formatarData, inicioDaSemana, somarDias } from './datas';
import type { BlocoPlanejado, Concurso, DiaISO, Disciplina, GestaoSemanal } from './tipos';

/** Ligada por padrão: domingo à noite, 1 hora, para fechar a semana e preparar a próxima. */
export const GESTAO_PADRAO: GestaoSemanal = { dia: '0', inicio: '19:00', minutos: 60 };

export type TarefaGestao = 'editais' | 'outros' | 'inscricoes' | 'planejamento' | 'resultados';

export const TAREFAS_GESTAO: { id: TarefaGestao; titulo: string; texto: string }[] = [
  { id: 'editais', titulo: 'Analisar editais', texto: 'Editais novos, retificações e mudanças no conteúdo dos concursos que você acompanha.' },
  { id: 'outros', titulo: 'Pesquisar outros concursos', texto: 'O radar e as notícias: o que abriu, foi autorizado ou já tem banca.' },
  { id: 'inscricoes', titulo: 'Verificar inscrições', texto: 'Prazos, boleto pago, isenção, local e horário da prova.' },
  { id: 'planejamento', titulo: 'Revisar o planejamento', texto: 'Como foi a semana, o que ficou para trás e os horários da próxima.' },
  { id: 'resultados', titulo: 'Conferir resultados', texto: 'Gabaritos, notas, recursos e classificação das provas feitas.' },
];

const nomes = (lista: { nome: string }[]) =>
  lista.slice(0, 3).map((c) => c.nome).join(', ') + (lista.length > 3 ? ` e mais ${lista.length - 3}` : '');

/** O que pede atenção em cada tarefa, pelos dados do app (lista vazia = nada a apontar). */
export function pontosDaGestao(e: {
  concursos: Concurso[];
  disciplinas: Disciplina[];
  blocos: BlocoPlanejado[];
  novasNoRadar: number;
  hoje: DiaISO;
}): Record<TarefaGestao, string[]> {
  const ativos = e.concursos.filter((c) => c.status !== 'prova_feita');
  const semEdital = ativos.filter((c) => !e.disciplinas.some((d) => d.concursoId === c.id));
  const abertos = ativos.filter((c) => c.status === 'edital_aberto');
  const proximas = ativos
    .filter((c) => c.dataProva && c.dataProva >= e.hoje && diasEntre(e.hoje, c.dataProva) <= 30)
    .sort((a, b) => (a.dataProva as string).localeCompare(b.dataProva as string));
  const passou = ativos.filter((c) => c.dataProva && c.dataProva < e.hoje);
  const aguardando = e.concursos.filter((c) => c.status === 'prova_feita');

  const semana = somarDias(inicioDaSemana(e.hoje), -7);
  const daSemana = e.blocos.filter((b) => b.motivo !== 'gestao' && b.dia >= semana && b.dia <= somarDias(semana, 6));
  const feitos = daSemana.filter((b) => b.status === 'feito').length;

  return {
    editais: semEdital.length ? [`Sem edital no app: ${nomes(semEdital)}.`] : [],
    outros: e.novasNoRadar ? [e.novasNoRadar === 1 ? '1 oportunidade nova no radar.' : `${e.novasNoRadar} oportunidades novas no radar.`] : [],
    inscricoes: [
      ...(abertos.length ? [`Edital aberto, inscrição a confirmar: ${nomes(abertos)}.`] : []),
      ...proximas.map((c) => `Prova de ${c.nome} em ${formatarData(c.dataProva as string)} (${diasEntre(e.hoje, c.dataProva as string)} dias).`),
    ],
    planejamento: daSemana.length ? [`Semana passada: ${feitos} de ${daSemana.length} blocos feitos.`] : [],
    resultados: [
      ...(passou.length ? [`A prova já passou, atualize o status: ${nomes(passou)}.`] : []),
      ...(aguardando.length ? [`Prova feita, acompanhe o resultado: ${nomes(aguardando)}.`] : []),
    ],
  };
}
