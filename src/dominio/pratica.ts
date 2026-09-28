// Prática com IA: monta o pedido de questões no estilo da banca e valida a
// resposta. A chamada em si é feita pela tela, com o recurso de IA do claude.ai.

export type EstiloQuestao = 'multipla' | 'certo_errado';
export type Dificuldade = 'facil' | 'media' | 'dificil';

export interface QuestaoGerada {
  enunciado: string;
  alternativas: string[];
  /** Índice da alternativa correta, a partir de 0. */
  correta: number;
  explicacao: string;
}

export interface PedidoQuestoes {
  banca: string;
  concurso: string;
  cargo: string;
  area: string;
  disciplina: string;
  /** Do tópico mais geral ao mais específico: ["Máquinas elétricas", "Transformadores"]. */
  caminho: string[];
  quantidade: number;
  estilo: EstiloQuestao;
  dificuldade: Dificuldade;
}

/** Cebraspe (antigo Cespe) cobra certo/errado; as demais, múltipla escolha. */
export function estiloDaBanca(banca: string): EstiloQuestao {
  return /cebraspe|cespe/i.test(banca) ? 'certo_errado' : 'multipla';
}

const DIFICULDADE: Record<Dificuldade, string> = {
  facil: 'fácil (conceitos centrais)',
  media: 'média, como numa prova real',
  dificil: 'difícil (detalhes, exceções, cálculos em mais de uma etapa)',
};

export function montarPedido(p: PedidoQuestoes): string {
  const banca = p.banca.trim() || 'de concursos em geral';
  const formato =
    p.estilo === 'certo_errado'
      ? '- Cada questão é uma afirmação para julgar como Certo ou Errado. Equilibre afirmações certas e erradas.\n- "alternativas" é sempre ["Certo", "Errado"].'
      : '- Cada questão tem 5 alternativas (A a E), exatamente uma correta, com distratores plausíveis.\n- Não use "todas as anteriores" nem "nenhuma das anteriores".';
  return `Você elabora questões de concursos públicos brasileiros.

Crie ${p.quantidade} questões inéditas no estilo da banca ${banca}, dificuldade ${DIFICULDADE[p.dificuldade]}.

Concurso: ${p.concurso}${p.cargo ? ` (${p.cargo})` : ''}${p.area ? `, área ${p.area}` : ''}
Disciplina: ${p.disciplina}
Tópico: ${p.caminho.join(' > ')}

Regras:
- Cobre só o tópico indicado; cada questão trata de um aspecto diferente dele.
${formato}
- A explicação diz, em até 4 frases, por que a resposta está certa e, quando ajudar, o erro das outras.
- Português do Brasil. Fórmulas em texto simples (ex.: P = V·I·cos φ).

Responda somente com um array JSON neste formato:
[{"enunciado": "...", "alternativas": ["...", "..."], "correta": 0, "explicacao": "..."}]
"correta" é o índice (começando em 0) da alternativa certa.`;
}

/** Aceita só questões bem formadas; descarta o resto sem quebrar a prática. */
export function validarQuestoes(resposta: unknown, estilo: EstiloQuestao): QuestaoGerada[] {
  const lista = Array.isArray(resposta)
    ? resposta
    : Array.isArray((resposta as { questoes?: unknown })?.questoes)
      ? (resposta as { questoes: unknown[] }).questoes
      : [];
  const validas: QuestaoGerada[] = [];
  for (const item of lista) {
    const q = item as Partial<QuestaoGerada>;
    if (typeof q?.enunciado !== 'string' || !q.enunciado.trim()) continue;
    let alternativas = Array.isArray(q.alternativas) ? q.alternativas.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim()) : [];
    if (estilo === 'certo_errado') alternativas = ['Certo', 'Errado'];
    const correta = Number(q.correta);
    if (alternativas.length < 2 || !Number.isInteger(correta) || correta < 0 || correta >= alternativas.length) continue;
    validas.push({
      enunciado: q.enunciado.trim(),
      alternativas: alternativas.map((a) => a.replace(/^\(?[A-Ea-e][).:-]\s+/, '')),
      correta,
      explicacao: typeof q.explicacao === 'string' ? q.explicacao.trim() : '',
    });
  }
  return validas;
}

export const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
