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
}

// ------------------------------------------------- Fases seguintes (tipos já definidos)

/** Fase 2: edital importado de PDF ou texto colado. */
export interface Edital {
  id: Id;
  concursoId: Id;
  /** Id do arquivo no armazenamento de arquivos do Artifact. */
  arquivoId: string | null;
  textoExtraido: string;
  dataPublicacao: DiaISO | null;
}

/** Fases 2 e 3: tópicos equivalentes entre editais contam juntos. */
export interface GrupoEquivalencia {
  id: Id;
  rotulo: string;
}

/** Fase 5: questões lançadas fora de uma sessão (QConcursos, prova antiga...). */
export interface RegistroQuestoes {
  id: Id;
  topicoId: Id;
  dia: DiaISO;
  feitas: number;
  acertos: number;
  fonte: string;
}

export type MotivoErro = 'falta_conteudo' | 'pegadinha' | 'desatencao' | 'interpretacao';

/** Fase 5: caderno de erros. */
export interface ErroCaderno {
  id: Id;
  topicoId: Id;
  resumo: string;
  motivo: MotivoErro;
  respostaCerta: string;
  proximaRevisao: DiaISO | null;
}

export interface BlocoHorario {
  /** `HH:mm` no fuso de São Paulo. */
  inicio: string;
  fim: string;
  rotulo?: string;
}

/** Fase 3: grade semanal. `diaSemana` 0 = domingo. */
export interface Disponibilidade {
  diaSemana: number;
  blocos: BlocoHorario[];
}

/** Fase 3: plantão, viagem, folga. */
export interface ExcecaoDisponibilidade {
  dia: DiaISO;
  blocos: BlocoHorario[];
  motivo: string;
}

export type StatusBloco = 'planejado' | 'feito' | 'parcial' | 'pulado' | 'remanejado';

/** Fase 3: bloco do calendário com o tópico planejado. */
export interface BlocoPlanejado {
  id: Id;
  dia: DiaISO;
  inicio: string;
  fim: string;
  topicoId: Id | null;
  disciplinaId: Id | null;
  tipo: TipoSessao;
  status: StatusBloco;
}

/** Fase 5. */
export interface Simulado {
  id: Id;
  concursoId: Id;
  dia: DiaISO;
  duracaoMin: number;
  notas: { disciplinaId: Id; nota: number; maximo: number }[];
  notaTotal: number;
  observacoes: string;
}

/** Fase 6: radar de concursos. */
export interface Oportunidade {
  id: Id;
  titulo: string;
  orgao: string;
  banca: string;
  cargos: string[];
  salario: number | null;
  vagas: number | null;
  uf: string;
  inscricoesAte: DiaISO | null;
  link: string;
  fonte: string;
  coletadoEm: InstanteISO;
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
