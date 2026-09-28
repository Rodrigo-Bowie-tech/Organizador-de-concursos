import { expect, test } from '@playwright/test';
import { BANCO, menu, preparar } from './apoio';

test('questões: lançamento rápido e CSV aparecem no acerto do edital', async ({ page }) => {
  await preparar(page);
  await menu(page, 'Questões');
  await page.getByLabel('Disciplina e tópico').selectOption({ label: '  1.1 Lei de Ohm' });
  await page.getByLabel('Questões feitas').fill('10');
  await page.getByLabel('Acertos').fill('7');
  await page.getByLabel('Fonte').fill('QConcursos');
  await page.getByRole('button', { name: 'Lançar' }).click();
  await expect(page.getByText('Questões lançadas.')).toBeVisible();
  await expect(page.getByText('7/10 (70%)')).toBeVisible();

  await page.getByRole('button', { name: 'Importar CSV' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Conteúdo do CSV').fill('Tópico;Feitas;Acertos;Data;Fonte\nTransformadores;20;10;26/09/2026;TEC\nlei de ohm;10;10;;TEC');
  await expect(dialogo.getByLabel('Tópico para Transformadores')).toHaveValue('ee|t3');
  await dialogo.getByRole('button', { name: 'Importar 2 linhas' }).click();
  await expect(page.getByText('2 registros importados.')).toBeVisible();

  await menu(page, 'Edital');
  await expect(page.getByTitle('17 acertos em 20 questões')).toHaveText('85%');
  await expect(page.getByTitle('10 acertos em 20 questões')).toHaveText('50%');
});

test('caderno de erros: da prática com IA para a revisão em D+3', async ({ page }) => {
  await preparar(page, { ia: true });
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Praticar com IA' }).nth(2).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByRole('button', { name: 'Gerar questões' }).click();
  await dialogo.getByRole('button', { name: /440 V/ }).click();
  await dialogo.getByRole('button', { name: 'Próxima' }).click();
  await dialogo.getByRole('button', { name: /perdas no núcleo/ }).click();
  await dialogo.getByRole('button', { name: 'Ver resultado' }).click();
  await dialogo.getByRole('button', { name: 'Mandar para o caderno de erros' }).click();
  await expect(page.getByText('Questão anotada no caderno de erros.')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Fechar' }).click();

  await menu(page, 'Caderno de erros');
  await expect(page.getByText('revisão 30/09/2026')).toBeVisible();
  await expect(page.getByText(/Em um transformador ideal/)).toBeVisible();

  await page.clock.fastForward(3 * 24 * 60 * 60 * 1000);
  await menu(page, 'Home');
  await page.getByRole('button', { name: '1 erro do caderno para revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Para revisar hoje (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar resposta' }).click();
  await expect(page.getByText(/Resposta certa: B\) 110 V/)).toBeVisible();
  await page.getByRole('button', { name: 'Acertei' }).click();
  await expect(page.getByText('Próxima revisão em 11/10/2026.')).toBeVisible();
});

test('simulados: nota por disciplina, distância do corte e evolução', async ({ page }) => {
  await preparar(page, { extras: { 'concursos/ff': { ...(BANCO['concursos/ff'] as object), notaCorte: 60 } } });
  await menu(page, 'Simulados');
  for (const [dia, ee, pt] of [
    ['2026-09-06', '40', '10'],
    ['2026-09-20', '52', '14'],
  ]) {
    await page.getByRole('button', { name: 'Registrar simulado' }).first().click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Dia').fill(dia);
    await d.getByLabel('Nota em Engenharia Elétrica').fill(ee);
    await d.getByLabel('Nota em Língua Portuguesa').fill(pt);
    await d.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Simulado registrado.').last()).toBeVisible();
    await expect(d).toBeHidden();
  }
  await expect(page.getByText('faltam 10 para o corte')).toBeVisible();
  await expect(page.getByText('6 acima do corte')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Evolução da nota total nos simulados' })).toBeVisible();
});

test('estatísticas: heatmap, planejado × realizado e melhor horário', async ({ page }, info) => {
  await preparar(page);
  await menu(page, 'Estatísticas');
  await expect(page.getByRole('img', { name: /Heatmap: 1 dia com estudo/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Melhor horário do dia' })).toBeVisible();
  await expect(page.getByText('Você rende mais de manhã, onde concentra mais horas.')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-estatisticas.png`, fullPage: true });
});
