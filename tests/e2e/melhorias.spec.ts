import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const CHAVE = 'organizador-concursos:banco-local';

function topico(id: string, titulo: string, ordem: number, paiId: string | null = null) {
  return { id, paiId, titulo, ordem, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null };
}

/** Banco local já com um concurso, duas disciplinas e tópicos. */
const BANCO = {
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

async function preparar(page: Page, opcoes: { ia?: boolean } = {}) {
  // Domingo, 27/09/2026, 20:00 em São Paulo.
  await page.clock.install({ time: new Date('2026-09-27T23:00:00Z') });
  await page.addInitScript(
    ([chave, banco]) => {
      if (!localStorage.getItem(chave as string)) localStorage.setItem(chave as string, JSON.stringify(banco));
    },
    [CHAVE, BANCO] as const,
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
      const amostra = Object.assign(async () => ({ text: JSON.stringify(questoes), truncated: false }), {
        json: async (_: string, op?: { onText?: (u: { text: string; delta: string }) => void }) => {
          const texto = JSON.stringify(questoes);
          op?.onText?.({ text: texto, delta: texto });
          return questoes;
        },
      });
      (window as unknown as { claude: unknown }).claude = { use: async (nome: string) => (nome === 'sample' ? amostra : null) };
    });
  }
  await page.goto('/');
}

async function menu(page: Page, item: string) {
  const abrir = page.getByRole('button', { name: 'Abrir menu' });
  if (await abrir.isVisible()) await abrir.click();
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: new RegExp(`^${item}`) }).click();
}

test('concluir a teoria agenda a revisão; revisar com "Bom" leva a próxima para D+7', async ({ page }) => {
  await preparar(page);
  await menu(page, 'Edital');
  await page.getByLabel('Teoria concluída: Lei de Ohm').check();
  await expect(page.getByTitle('Próxima revisão')).toHaveText('rev. 28/09');

  await page.clock.fastForward('24:00:00');
  await menu(page, 'Revisões');
  await expect(page.getByRole('heading', { name: 'Hoje (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('button', { name: /Bom.*em 6 dias/ })).toBeVisible();
  await dialogo.getByRole('button', { name: /Bom/ }).click();
  await expect(page.getByText('Próxima em 6 dias (04/10/2026)')).toBeVisible();
  await expect(page.getByText('Nenhuma revisão para hoje')).toBeVisible();
});

test('biblioteca: material cadastrado no tópico aparece na Biblioteca', async ({ page }) => {
  await preparar(page);
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Materiais (0)' }).nth(2).click(); // Transformadores
  await page.getByRole('button', { name: 'Adicionar material' }).click();
  const form = page.getByRole('dialog', { name: 'Adicionar material' });
  await form.getByLabel('Tipo').selectOption('video');
  await form.getByLabel('Título').fill('Aula 07 - Transformadores');
  await form.getByLabel('Link').fill('youtube.com/watch?v=exemplo');
  await form.getByLabel('Trecho').fill('12:30 a 48:00');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: 'Aula 07 - Transformadores' }).first()).toHaveAttribute('href', 'https://youtube.com/watch?v=exemplo');

  await page.getByRole('dialog', { name: /Materiais/ }).getByRole('button', { name: 'Fechar' }).click();
  await menu(page, 'Biblioteca');
  await expect(page.getByText('2 Transformadores')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aula 07 - Transformadores' })).toBeVisible();
});

test('prática com IA: gera questões, corrige e salva no histórico', async ({ page }) => {
  await preparar(page, { ia: true });
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Praticar com IA' }).nth(2).click(); // Transformadores
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByLabel('Banca')).toHaveValue('FCC');
  await dialogo.getByRole('button', { name: 'Gerar questões' }).click();

  await expect(dialogo.getByText('Questão 1 de 2')).toBeVisible();
  await dialogo.getByRole('button', { name: /110 V/ }).click();
  await expect(dialogo.getByText('Acertou!')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Próxima' }).click();
  await dialogo.getByRole('button', { name: /perdas no cobre/ }).click();
  await expect(dialogo.getByText('Errou. Resposta: B')).toBeVisible();
  await page.clock.fastForward('05:00');
  await dialogo.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(dialogo.getByText('1 de 2')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Salvar no histórico' }).click();
  await expect(page.getByText('Prática salva no histórico.')).toBeVisible();

  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await menu(page, 'Histórico');
  await expect(page.getByText('prática IA')).toBeVisible();
  await expect(page.getByText('1/2 questões (50%)', { exact: false })).toBeVisible();
});

test('balanço: aponta a disciplina de peso alto esquecida e projeta a cobertura', async ({ page }, info) => {
  await preparar(page);
  await menu(page, 'Balanço');
  await expect(page.getByText('abaixo do peso')).toBeVisible();
  await expect(page.getByText(/Engenharia Elétrica.*vale 80% da prova e ainda não foi estudada/)).toBeVisible();
  await expect(page.getByText(/você cobre 0% do edital até 08\/11\/2026/)).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-balanco.png`, fullPage: true });
});
