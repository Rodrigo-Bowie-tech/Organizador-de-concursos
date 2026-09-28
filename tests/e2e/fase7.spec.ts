import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

// Edital do BANCO: D1 Engenharia Elétrica (T1 Lei de Ohm, T2 Transformadores), D2 Língua Portuguesa (T3 Crase).
const PROVA = {
  questoes: [
    { numero: 1, enunciado: 'Num transformador ideal com relação 2:1, se V1 = 220 V, V2 vale:', alternativas: ['A) 440 V', 'B) 110 V', 'C) 220 V', 'D) 55 V'], correta: 'B', topico: 'T2' },
    { numero: 2, enunciado: 'O ensaio a vazio do transformador mede principalmente:', alternativas: ['Perdas no cobre', 'Regulação', 'Perdas no núcleo', 'Rendimento'], correta: null, topico: 'T2' },
    { numero: 3, enunciado: 'Um resistor de 10 Ω com 2 A dissipa:', alternativas: ['40 W', '20 W', '5 W', '10 W'], correta: 'A', topico: 'T1' },
    { numero: 4, enunciado: 'Assinale a alternativa em que a crase está correta:', alternativas: ['Vou à pé', 'Refiro-me à você', 'Chegou às 8h', 'Andou à cavalo'], correta: null, topico: null },
  ],
};

test('provas anteriores: importar com IA, incidência no edital e refazer', async ({ page }) => {
  await preparar(page, { ia: true, respostasIA: { 'Você organiza provas': PROVA } });
  await menu(page, 'Provas anteriores');
  await expect(page.getByText('Nenhuma prova')).toBeVisible();
  await page.getByRole('button', { name: 'Importar prova' }).first().click();

  await expect(page.getByLabel('Banca')).toHaveValue('FCC');
  await page.getByLabel('Órgão da prova').fill('Sabesp');
  await page.getByLabel('Ano').fill('2023');
  await page.getByLabel('Texto das questões').fill('PROVA OBJETIVA\n1. Num transformador ideal...\n2. O ensaio a vazio...\n3. Um resistor...\n4. Assinale...');
  await page.getByLabel('Gabarito (opcional)').fill('01-B 02-C 03-A');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('1 chamada à IA do seu plano')).toBeVisible();
  await page.getByRole('button', { name: 'Separar questões com IA' }).click();

  await expect(page.getByText('4 questões', { exact: true })).toBeVisible();
  await expect(page.getByText('1 sem assunto')).toBeVisible();
  await expect(page.getByText('1 sem gabarito')).toBeVisible();
  await expect(page.getByLabel('Gabarito da questão 2')).toHaveValue('2');
  await page.getByLabel('Assunto da questão 4').selectOption({ label: 'Crase' });
  await page.getByLabel('Gabarito da questão 4').selectOption({ index: 3 });
  await expect(page.getByText('0 sem assunto')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar prova' }).click();

  await expect(page.getByText('Prova salva com 4 questões. A incidência já entra no planejamento.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provas anteriores' })).toBeVisible();
  const ranking = page.getByRole('list', { name: 'Assuntos que mais caem' }).getByRole('listitem');
  await expect(ranking).toHaveCount(3);
  await expect(ranking.first()).toContainText('Transformadores');
  await expect(ranking.first()).toContainText('2');
  const prova = page.getByRole('list', { name: 'Provas' }).getByRole('listitem');
  await expect(prova).toContainText('FCC · 2023 · Sabesp');
  await expect(prova).toContainText('4 com gabarito');

  // Anular a 4 na revisão tira a Crase da incidência.
  await prova.getByRole('button', { name: 'Revisar questões' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByRole('checkbox', { name: 'Anulada' }).nth(3).check();
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(ranking).toHaveCount(2);
  await expect(prova).toContainText('1 anuladas');

  await menu(page, 'Edital');
  await expect(page.getByTitle('Caiu 2 vezes nas provas anteriores da banca')).toHaveText('caiu 2×');
  await expect(page.getByTitle('Caiu 1 vez nas provas anteriores da banca')).toHaveText('caiu 1×');

  // Refazer: acerta a 1, erra a 2, acerta a 3.
  await menu(page, 'Provas anteriores');
  await prova.getByRole('button', { name: 'Refazer' }).click();
  await expect(dialogo.getByText('3 questões com gabarito')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Começar' }).click();
  await dialogo.getByRole('button', { name: /110 V/ }).click();
  await expect(dialogo.getByText('Acertou!')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Próxima' }).click();
  await dialogo.getByRole('button', { name: /Perdas no cobre/ }).click();
  await expect(dialogo.getByText('Errou. Gabarito: C')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Próxima' }).click();
  await dialogo.getByRole('button', { name: /40 W/ }).click();
  await dialogo.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(dialogo.getByText('2 de 3')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Mandar para o caderno de erros' }).click();
  await expect(page.getByText('Questão anotada no caderno de erros.')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Salvar em Questões' }).click();
  await expect(page.getByText('2 de 3 registradas em Questões.')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Fechar' }).click();

  await menu(page, 'Edital');
  await expect(page.getByTitle('1 acertos em 2 questões')).toHaveText('50%');
  await menu(page, 'Caderno de erros');
  await expect(page.getByText('FCC · 2023 · Sabesp, questão 2')).toBeVisible();
});
