import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

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
