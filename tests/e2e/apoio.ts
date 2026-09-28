import type { Page } from '@playwright/test';

export const CHAVE = 'organizador-concursos:banco-local';

export function topico(id: string, titulo: string, ordem: number, paiId: string | null = null) {
  return { id, paiId, titulo, ordem, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null };
}

/** Banco local já com um concurso, duas disciplinas e tópicos. */
export const BANCO: Record<string, unknown> = {
  'concursos/ff': {
    id: 'ff',
    nome: 'Fundação Florestal SP',
    orgao: 'Fundação Florestal',
    banca: 'FCC',
    cargo: 'Engenheiro Eletricista',
    area: 'Engenharia Elétrica',
    dataProva: '2026-11-08',
    status: 'edital_aberto',
    link: '',
    notaCorte: null,
    prioridade: 5,
    criadoEm: '2026-09-01T12:00:00.000Z',
  },
  'disciplinas/ee': {
    id: 'ee',
    concursoId: 'ff',
    editalId: null,
    nome: 'Engenharia Elétrica',
    peso: 2,
    numQuestoes: 40,
    tipo: 'especifica',
    ordem: 0,
    cor: '#2bb99a',
    topicos: {
      t1: topico('t1', 'Circuitos', 0),
      t2: topico('t2', 'Lei de Ohm', 0, 't1'),
      t3: topico('t3', 'Transformadores', 1),
    },
  },
  'disciplinas/pt': {
    id: 'pt',
    concursoId: 'ff',
    editalId: null,
    nome: 'Língua Portuguesa',
    peso: 1,
    numQuestoes: 20,
    tipo: 'basica',
    ordem: 1,
    cor: '#4a90d9',
    topicos: { p1: topico('p1', 'Crase', 0) },
  },
  'sessoes/2026-09-20': {
    semana: '2026-09-20',
    itens: {
      s1: {
        id: 's1',
        concursoId: 'ff',
        disciplinaId: 'pt',
        topicoId: 'p1',
        tipo: 'teoria',
        inicio: '2026-09-25T12:00:00.000Z',
        fim: '2026-09-25T15:00:00.000Z',
        pausas: [],
        segundosLiquidos: 10800,
        questoesFeitas: 0,
        acertos: 0,
        paginas: 0,
        anotacoes: '',
        origem: 'manual',
        concluiuTeoria: false,
      },
    },
  },
};

export async function preparar(page: Page, opcoes: { ia?: boolean; extras?: Record<string, unknown> } = {}) {
  // Domingo, 27/09/2026, 20:00 em São Paulo.
  await page.clock.install({ time: new Date('2026-09-27T23:00:00Z') });
  await page.addInitScript(
    ([chave, banco]) => {
      if (!localStorage.getItem(chave as string)) localStorage.setItem(chave as string, JSON.stringify(banco));
    },
    [CHAVE, { ...BANCO, ...opcoes.extras }] as const,
  );
  if (opcoes.ia) {
    // Simula o runtime do claude.ai só com a IA: o banco continua local.
    await page.addInitScript(() => {
      const questoes = [
        {
          enunciado: 'Em um transformador ideal com N1 = 200 e N2 = 100 espiras, se V1 = 220 V, V2 vale:',
          alternativas: ['A) 440 V', 'B) 110 V', 'C) 220 V', 'D) 55 V', 'E) 100 V'],
          correta: 1,
          explicacao: 'V2 = V1 · N2/N1 = 220 · 100/200 = 110 V.',
        },
        {
          enunciado: 'O ensaio a vazio de um transformador determina principalmente:',
          alternativas: ['As perdas no cobre', 'As perdas no núcleo', 'A impedância de curto', 'A regulação', 'O rendimento máximo'],
          correta: 1,
          explicacao: 'A vazio, a corrente é pequena e as perdas medidas são as do núcleo.',
        },
      ];
      const edital = {
        disciplinas: [
          { nome: 'Língua Portuguesa', peso: 1, numQuestoes: 20, tipo: 'basica', topicos: [{ titulo: 'Interpretação de texto' }, { titulo: 'Regência verbal e nominal' }] },
          {
            nome: 'Engenharia Elétrica',
            peso: 2,
            numQuestoes: 40,
            tipo: 'especifica',
            topicos: [
              { titulo: 'Máquinas elétricas', subtopicos: [{ titulo: 'Motores de indução' }, { titulo: 'Geradores síncronos' }] },
              { titulo: 'Proteção de sistemas elétricos' },
            ],
          },
        ],
      };
      const w = window as unknown as { __respostasIA?: Record<string, unknown> };
      const responder = (pedido: string) => {
        for (const [chave, resposta] of Object.entries(w.__respostasIA ?? {})) if (pedido.includes(chave)) return resposta;
        return pedido.includes('edital verticalizado') ? edital : questoes;
      };
      const amostra = Object.assign(async (pedido: string) => ({ text: JSON.stringify(responder(pedido)), truncated: false }), {
        json: async (pedido: string, op?: { onText?: (u: { text: string; delta: string }) => void }) => {
          const resposta = responder(pedido);
          const texto = JSON.stringify(resposta);
          op?.onText?.({ text: texto, delta: texto });
          return resposta;
        },
      });
      (window as unknown as { claude: unknown }).claude = { use: async (nome: string) => (nome === 'sample' ? amostra : null) };
    });
  }
  await page.goto('/');
}

export async function menu(page: Page, item: string) {
  const abrir = page.getByRole('button', { name: 'Abrir menu' });
  if (await abrir.isVisible()) await abrir.click();
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: new RegExp(`^${item}`) }).click();
}

