import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

// Contando desde 25/09: a sessão do BANCO (25/09, 9h–12h) vale 3 h = 1 vale de Música e metade do próximo.
const VALES = {
  'config/geral': {
    vales: { estudoMin: 120, desde: '2026-09-25T03:00:00.000Z', atividades: [{ nome: 'Música', minutos: 60 }, { nome: 'Exercícios físicos', minutos: 60 }] },
  },
};

test('vales: ganhos com horas de estudo, na Home e na tela, usar e desfazer', async ({ page }) => {
  await preparar(page, { extras: VALES });
  await expect(page.getByText('1 vale guardado:')).toBeVisible();
  await expect(page.getByText('Próximo vale: Exercícios físicos (1h00min)')).toBeVisible();

  await menu(page, 'Vales');
  await expect(page.getByRole('heading', { name: 'Vales disponíveis (1)' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Estudo para o vale de Exercícios físicos' })).toHaveAttribute('aria-valuenow', '50');
  await page.getByRole('button', { name: 'Usar vale' }).click();
  await expect(page.getByRole('heading', { name: 'Vale em uso' })).toBeVisible();
  await expect(page.getByText(/^(1:00:00|59:5\d)$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vales disponíveis (0)' })).toBeVisible();

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'Desfazer (usei sem querer)' }).click();
  await expect(page.getByRole('heading', { name: 'Vales disponíveis (1)' })).toBeVisible();
});
