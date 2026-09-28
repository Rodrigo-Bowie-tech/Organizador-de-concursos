// Modelo de dados do app. Os documentos vivem no banco do Artifact (claude.ai),
// um banco de documentos JSON com limite de 5.000 documentos e 256 KiB por documento.
// Por isso alguns registros ficam agrupados (ver CLAUDE.md, "Banco de dados"):
// - tópicos ficam dentro do documento da disciplina;
// - sessões ficam em documentos semanais (`sessoes/<domingo da semana>`);
// - pausas ficam dentro da sessão.

export type Id = string;
/** Instante em UTC, formato ISO 8601 (`2026-09-27T13:05:00.000Z`). */
export type InstanteISO = string;
/** Dia civil no fuso de São Paulo, formato `AAAA-MM-DD`. */
export type DiaISO = string;

// ---------------------------------------------------------------- Fase 1

export type StatusConcurso = 'previsto' | 'edital_aberto' | 'inscrito' | 'prova_feita';

export interface Concurso {
  id: Id;
  nome: string;
  orgao: string;
  banca: string;
  cargo: string;
  area: string;
  dataProva: DiaISO | null;
  status: StatusConcurso;
  link: string;
  notaCorte: number | null;
  /** 1 (baixa) a 5 (alta). */
  prioridade: number;
  criadoEm: InstanteISO;
}

export type TipoDisciplina = 'basica' | 'especifica' | 'discursiva';

export type StatusTopico =
  | 'nao_iniciado'
  | 'em_estudo'
  | 'teoria_concluida'
  | 'revisado'
  | 'dominado';

export interface Topico {
  id: Id;
  /** Tópico pai, para subtópicos. `null` na raiz da disciplina. */
  paiId: Id | null;
  titulo: string;
  ordem: number;
  status: StatusTopico;
  /** Autoavaliação de 1 a 5. */
  autoavaliacao: number | null;
  /** Quantas vezes o assunto caiu nessa banca, se souber. */
  incidencia: number | null;
  /** Tópicos equivalentes em editais diferentes compartilham o grupo (Fases 2 e 3). */
  grupoEquivalenciaId: Id | null;
  /** Quando a teoria foi concluída (alimenta a projeção de cobertura). */
  concluidoEm?: InstanteISO | null;
  /** Agenda de revisões espaçadas; existe a partir da teoria concluída. */
  revisao?: EstadoRevisao | null;
  /** Cortado do plano (edital não fecha até a prova). Continua no edital, fora do planejador. */
  cortado?: boolean;
}

/** Estado da repetição espaçada de um tópico (ver dominio/revisoes.ts). */
export interface EstadoRevisao {
  proxima: DiaISO;
  ultima: DiaISO | null;
  /** Dias entre a última revisão (ou a conclusão) e a próxima. */
  intervalo: number;
  /** 1,3 a 3,0: quanto maior, mais rápido os intervalos crescem. */
  facilidade: number;
  /** Revisões seguidas sem errar. */
  repeticoes: number;
  /** Quantas vezes errou e recomeçou a escada. */
  lapsos: number;
}

export type AvaliacaoRevisao = 'errei' | 'dificil' | 'bom' | 'facil';

/** Histórico de revisões feitas, agrupado por semana em `revisoes/<domingo>`. */
export interface RegistroRevisao {
  id: Id;
  concursoId: Id | null;
  disciplinaId: Id;
  topicoId: Id;
  dia: DiaISO;
  avaliacao: AvaliacaoRevisao;
  /** Intervalo agendado a partir desta revisão, em dias. */
  intervalo: number;
}

export type TipoMaterial = 'pdf' | 'video' | 'link' | 'livro' | 'resumo';

/** Material da biblioteca, em `biblioteca/<disciplinaId>`. */
export interface Material {
  id: Id;
  disciplinaId: Id;
  /** `null` = material da disciplina inteira. */
  topicoId: Id | null;
  tipo: TipoMaterial;
  titulo: string;
  url: string;
  /** PDF enviado para o armazenamento do app (id do recurso `assets`). */
  arquivoId: string | null;
  arquivoNome: string | null;
  /** Ex.: "p. 45–80", "aula 3, 12:30". */
  trecho: string;
  observacao: string;
  criadoEm: InstanteISO;
}

export interface Disciplina {
  id: Id;
  concursoId: Id;
  /** Edital de origem, quando importada (Fase 2). Cadastro manual deixa `null`. */
  editalId: Id | null;
  nome: string;
  peso: number;
  numQuestoes: number | null;
  tipo: TipoDisciplina;
  ordem: number;
  /** Cor usada no calendário e nos gráficos. */
  cor: string;
  topicos: Record<Id, Topico>;
}

export type TipoSessao = 'teoria' | 'questoes' | 'revisao' | 'lei_seca' | 'resumo' | 'simulado';

export interface Pausa {
  inicio: InstanteISO;
  /** `null` enquanto a pausa está em andamento. */
  fim: InstanteISO | null;
  motivo?: string;
}

export interface Sessao {
  id: Id;
  concursoId: Id | null;
  disciplinaId: Id | null;
  topicoId: Id | null;
  tipo: TipoSessao;
  inicio: InstanteISO;
  /** `null` enquanto a sessão está em andamento. */
  fim: InstanteISO | null;
  pausas: Pausa[];
  /** Calculado ao finalizar. Enquanto roda, o tempo vem de `inicio` e `pausas`. */
  segundosLiquidos: number | null;
  questoesFeitas: number;
  acertos: number;
  paginas: number;
  anotacoes: string;
  origem: 'cronometro' | 'manual' | 'pratica_ia';
  /** Marcado no fechamento: "concluí a teoria deste tópico". */
  concluiuTeoria: boolean;
}

export interface ConfigPomodoro {
  ativo: boolean;
  focoMin: number;
  pausaCurtaMin: number;
  pausaLongaMin: number;
  /** Quantos ciclos de foco até a pausa longa. */
  ciclosAtePausaLonga: number;
}

export type Tema = 'sistema' | 'claro' | 'escuro';

export interface Configuracao {
  metaDiariaMin: number;
  metaSemanalMin: number;
  metaMensalMin: number;
  pomodoro: ConfigPomodoro;
  tema: Tema;
  /** Fase 4: planejar com a média real dos últimos 14 dias quando ela fica abaixo da disponibilidade. */
  usarCapacidadeReal: boolean;
}

// ------------------------------------------------- Fases seguintes (tipos já definidos)

/** Fase 2: edital importado de PDF ou texto colado, em `editais/<id>`. */
export interface Edital {
  id: Id;
  concursoId: Id;
  /** PDF guardado no armazenamento de arquivos do app (recurso `assets`). */
  arquivoId: string | null;
  arquivoNome: string | null;
  cargo: string;
  /** Trecho do conteúdo programático usado na importação (até 150 mil caracteres). */
  trecho: string;
  importadoEm: InstanteISO;
  dataPublicacao: DiaISO | null;
}

/** Fases 2 e 3: tópicos equivalentes entre editais contam juntos. */
export interface GrupoEquivalencia {
  id: Id;
  rotulo: string;
}

/** Fase 5: questões lançadas fora de uma sessão (QConcursos, CSV...), em `questoes/<domingo>`. */
export interface RegistroQuestoes {
  id: Id;
  concursoId: Id | null;
  disciplinaId: Id | null;
  topicoId: Id | null;
  dia: DiaISO;
  feitas: number;
  acertos: number;
  /** Livre: "QConcursos", "prova FCC 2023"... */
  fonte: string;
}

export type MotivoErro = 'falta_conteudo' | 'pegadinha' | 'desatencao' | 'interpretacao';

/** Fase 5: caderno de erros, em `erros/<disciplinaId>`. Revisões em D+3 e D+14. */
export interface ErroCaderno {
  id: Id;
  disciplinaId: Id;
  topicoId: Id | null;
  /** Enunciado ou resumo da questão. */
  enunciado: string;
  minhaResposta: string;
  respostaCerta: string;
  motivo: MotivoErro;
  comentario: string;
  fonte: string;
  criadoEm: DiaISO;
  /** `null` quando as duas revisões foram feitas sem errar de novo. */
  proximaRevisao: DiaISO | null;
  revisoesFeitas: DiaISO[];
  /** Explicação gerada pela IA, se pedida. */
  explicacaoIA: string;
}

export interface BlocoHorario {
  /** `HH:mm` no fuso de São Paulo. */
  inicio: string;
  fim: string;
  rotulo?: string;
}

/** Plantão, viagem, folga: blocos daquele dia no lugar da grade (lista vazia = sem estudo). */
export interface ExcecaoDisponibilidade {
  blocos: BlocoHorario[];
  motivo: string;
}

/** Fase 3: grade semanal e exceções, em `disponibilidade/geral`. */
export interface Disponibilidade {
  /** Chave "0" (domingo) a "6" (sábado). */
  dias: Record<string, BlocoHorario[]>;
  excecoes: Record<DiaISO, ExcecaoDisponibilidade>;
  /** Duração de cada bloco de estudo, em minutos. */
  blocoMin: number;
}

export type StatusBloco = 'planejado' | 'feito' | 'parcial' | 'pulado';

/** Fase 3: bloco do calendário com o tópico planejado, em `plano/<domingo>`. */
export interface BlocoPlanejado {
  id: Id;
  dia: DiaISO;
  /** `HH:mm` no fuso de São Paulo. */
  inicio: string;
  fim: string;
  concursoId: Id | null;
  disciplinaId: Id | null;
  topicoId: Id | null;
  tipo: TipoSessao;
  status: StatusBloco;
  /** Por que o planejador escolheu este bloco. */
  motivo: 'teoria' | 'revisao' | 'revisao_atrasada' | 'questoes';
  /** Movido por você: replanejar não mexe nele. */
  fixo?: boolean;
}

/** Fase 5: simulado, em `simulados/<id>`. */
export interface Simulado {
  id: Id;
  concursoId: Id;
  titulo: string;
  dia: DiaISO;
  duracaoMin: number;
  notas: { disciplinaId: Id | null; nome: string; nota: number; maximo: number }[];
  notaTotal: number;
  notaMaxima: number;
  observacoes: string;
}

/** Fase 6: concurso aberto ou previsto, em `oportunidades/<UF>` (itens por id). */
export interface Oportunidade {
  /** Derivado do link (ou do órgão + cargos) para não duplicar entre coletas. */
  id: Id;
  titulo: string;
  orgao: string;
  banca: string;
  cargos: string[];
  /** Maior salário anunciado, em reais. */
  salario: number | null;
  vagas: number | null;
  /** Sigla da UF ou "BR" para nacional. */
  uf: string;
  inscricoesAte: DiaISO | null;
  link: string;
  /** "PCI Concursos", "texto colado", "manual"... */
  fonte: string;
  coletadoEm: InstanteISO;
  /** Escondida por você no radar. */
  ignorada?: boolean;
}

/** Fase 6: filtro salvo do radar (já criado no seed). */
export interface FiltroRadar {
  id: Id;
  nome: string;
  areas: string[];
  ufs: string[];
  bancas: string[];
  salarioMinimo: number | null;
}

/** Fase 7: questão de uma prova anterior, já ligada a um tópico do edital. */
export interface QuestaoProva {
  id: Id;
  numero: number;
  enunciado: string;
  /** Texto das alternativas, sem a letra ("Certo"/"Errado" nas provas de certo ou errado). */
  alternativas: string[];
  /** Índice da alternativa do gabarito, a partir de 0; `null` se o gabarito não foi informado. */
  correta: number | null;
  disciplinaId: Id | null;
  topicoId: Id | null;
  anulada: boolean;
}

/** Fase 7: prova anterior importada, em `provas/<id>` (questões dentro). */
export interface ProvaAnterior {
  id: Id;
  /** Concurso cujo edital foi usado para ligar as questões aos tópicos. */
  concursoId: Id;
  titulo: string;
  banca: string;
  orgao: string;
  ano: number | null;
  cargo: string;
  arquivoId: string | null;
  arquivoNome: string | null;
  importadaEm: InstanteISO;
  questoes: Record<Id, QuestaoProva>;
}
