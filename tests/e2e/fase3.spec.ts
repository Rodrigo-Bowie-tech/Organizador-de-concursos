import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

test('disponibilidade, plano semanal e bloco do dia: começar, estudar e marcar feito', async ({ page }, info) => {
  // Segunda, 28/09/2026, 19:00 em São Paulo.
  await preparar(page, { agora: '2026-09-28T22:00:00Z' });
  await menu(page, 'Planejamento');
  await expect(page.getByText('Defina seus horários de estudo')).toBeVisible();
  await page.getByRole('button', { name: 'Configurar disponibilidade' }).click();

  // Segunda 20:00–22:00, copiada para terça a sexta; blocos de 60 min.
  await page.getByRole('button', { name: 'Adicionar horário em Segunda' }).click();
  await page.getByRole('button', { name: 'Copiar para terça a sexta' }).click();
  await page.getByRole('button', { name: 'Salvar e replanejar' }).click();
  await expect(page.getByText('Disponibilidade salva e plano refeito.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planejamento' })).toBeVisible();
  await page.getByLabel('Visão').selectOption('semana');
  await expect(page.getByRole('button', { name: /^20:00 Engenharia Elétrica/ }).first()).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-planejamento.png`, fullPage: true });

  // Às 20:00, o bloco de hoje aparece na Home com "Começar".
  await page.clock.fastForward('01:00:00');
  await menu(page, 'Home');
  const blocos = page.getByRole('heading', { name: 'Blocos de hoje' });
  await expect(blocos).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).first().click();
  await expect(page.getByText('Estudando')).toBeVisible();
  await page.clock.fastForward('50:00');
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar sessão' }).click();
  await expect(page.getByText('Sessão salva: 0h50min líquidas.')).toBeVisible();

  // O bloco sugere "feito" pelo tempo cronometrado no horário.
  await menu(page, 'Planejamento');
  await page.getByLabel('Visão').selectOption('dia');
  await page.getByRole('button', { name: /^20:00 .*\(Planejado\)/ }).click();
  await expect(page.getByText('Você estudou 0h50min nesse horário. Marcar como feito?')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar feito' }).click();
  await expect(page.getByText('Bloco marcado como feito.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^20:00 .*\(Feito\)/ })).toBeVisible();
});
