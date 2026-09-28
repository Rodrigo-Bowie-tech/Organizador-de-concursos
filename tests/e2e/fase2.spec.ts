import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { menu, preparar, topico } from './apoio';

const PDF = join(import.meta.dirname, 'fixtures', 'edital-exemplo.pdf');

test('importar edital em PDF: acha o conteúdo programático, estrutura com IA, revisa e salva', async ({ page }) => {
  await preparar(page, { ia: true });
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Importar edital' }).click();

  await page.getByLabel('PDF do edital').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Ler o PDF' }).click();

  const trecho = page.getByLabel('Trecho do conteúdo programático');
  await expect(trecho).toHaveValue(/^CONTEUDO PROGRAMATICO/);
  await expect(trecho).not.toHaveValue(/MODELO DE REQUERIMENTO/);
  await expect(page.getByText('1 chamada à IA do seu plano')).toBeVisible();
  await page.getByRole('button', { name: 'Estruturar com IA' }).click();

  // Revisão: as disciplinas com o mesmo nome vão para as existentes.
  await expect(page.getByLabel('Nome da disciplina')).toHaveCount(2);
  await expect(page.getByLabel('Salvar em').nth(1)).toHaveValue('ee');
  await page.getByRole('textbox', { name: 'Tópico 1.2' }).fill('Geradores síncronos e assíncronos');
  await page.getByRole('button', { name: 'Remover Proteção de sistemas elétricos' }).click();
  await expect(page.getByText('2 disciplinas e 5 tópicos serão salvos')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar edital' }).click();

  await expect(page.getByText('Edital importado: 2 disciplinas e 5 tópicos.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edital' })).toBeVisible();
  await expect(page.getByText('Edital importado em 27/09/2026')).toBeVisible();
  await expect(page.getByText('Geradores síncronos e assíncronos')).toBeVisible();
  await expect(page.getByText('Regência verbal e nominal')).toBeVisible();
  await expect(page.getByText('Proteção de sistemas elétricos')).toHaveCount(0);
});

test('fora do claude.ai, a importação avisa que precisa da IA', async ({ page }) => {
  await preparar(page);
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Importar edital' }).click();
  await expect(page.getByText('A estruturação com IA só funciona no app aberto no claude.ai')).toBeVisible();
});

test('tópicos equivalentes: vincular faz o estudo de um contar para o outro', async ({ page }) => {
  await preparar(page, {
    extras: {
      'concursos/petro': {
        id: 'petro',
        nome: 'Petrobras',
        orgao: 'Petrobras',
        banca: 'Cebraspe',
        cargo: '',
        area: 'Engenharia Elétrica',
        dataProva: null,
        status: 'previsto',
        link: '',
        notaCorte: null,
        prioridade: 4,
        criadoEm: '2026-09-02T12:00:00.000Z',
      },
      'disciplinas/pe': {
        id: 'pe',
        concursoId: 'petro',
        editalId: null,
        nome: 'Conhecimentos Específicos',
        peso: 1,
        numQuestoes: 70,
        tipo: 'especifica',
        ordem: 0,
        cor: '#e8864a',
        topicos: { x1: topico('x1', 'Transformadores', 0), x2: topico('x2', 'Eletrônica de potência', 1) },
      },
    },
  });
  await menu(page, 'Edital');
  await expect(page.getByText('Tópicos parecidos em outros editais (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Vincular' }).click();
  await expect(page.getByText('Tópicos vinculados.')).toBeVisible();
  await expect(page.getByLabel('Vinculado a: Petrobras › Transformadores')).toBeVisible();

  await page.getByLabel('Teoria concluída: Transformadores').check();
  await page.getByLabel('Concurso ativo').selectOption({ label: 'Petrobras' });
  await expect(page.getByLabel('Teoria concluída: Transformadores')).toBeChecked();
  await expect(page.getByLabel('Teoria concluída: Eletrônica de potência')).not.toBeChecked();
});
