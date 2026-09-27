import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function menu(page: Page, item: string) {
  const abrir = page.getByRole('button', { name: 'Abrir menu' });
  if (await abrir.isVisible()) await abrir.click();
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: item }).click();
}

test('cadastrar concurso, estudar com o cronômetro e ver as horas no painel', async ({ page }, info) => {
  // Domingo, 27/09/2026, 20:00 em São Paulo.
  await page.clock.install({ time: new Date('2026-09-27T23:00:00Z') });
  await page.goto('/');

  // Painel vazio convida a cadastrar o concurso.
  await expect(page.getByText('Comece cadastrando um concurso')).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar concurso' }).click();

  // Concurso
  await page.getByRole('button', { name: 'Cadastrar concurso' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome do concurso').fill('Fundação Florestal SP');
  await dialogo.getByLabel('Banca').fill('FCC');
  await dialogo.getByLabel('Data da prova').fill('2026-11-08');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Fundação Florestal SP' })).toBeVisible();
  await expect(page.getByText('faltam 42 dias')).toBeVisible();

  // Disciplina
  await page.getByRole('button', { name: 'Disciplinas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cadastrar disciplina' }).click();
  await dialogo.getByLabel('Nome').fill('Engenharia Elétrica');
  await dialogo.getByLabel('Peso na prova').fill('2');
  await dialogo.getByLabel('Nº de questões').fill('40');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('button', { name: 'Engenharia Elétrica', exact: true })).toBeVisible();

  // Edital: tópicos em lote
  await page.getByRole('button', { name: 'Engenharia Elétrica', exact: true }).click();
  await page.getByRole('button', { name: 'Colar lista de tópicos' }).click();
  await dialogo.getByLabel('Lista de tópicos').fill('1 Circuitos\n1.1 Lei de Ohm\n1.2 Leis de Kirchhoff\n2 Máquinas elétricas');
  await dialogo.getByRole('button', { name: 'Cadastrar 4 tópicos' }).click();
  await expect(page.getByText('Lei de Ohm')).toBeVisible();
  await expect(page.getByText('0/3 tópicos · 0%')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-edital.png`, fullPage: true });

  // Cronômetro: iniciar, pausar, recarregar, retomar, finalizar
  await page.getByRole('button', { name: 'Abrir cronômetro' }).click();
  await page.getByLabel('Disciplina').selectOption({ label: 'Engenharia Elétrica' });
  await page.getByLabel('Tópico').selectOption({ label: '  1.1 Lei de Ohm' });
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByText('Estudando')).toBeVisible();
  await page.clock.fastForward('25:00');
  await expect(page.getByLabel('Tempo líquido')).toHaveText('00:25:00');
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.clock.fastForward('10:00');
  await page.screenshot({ path: `test-results/${info.project.name}-cronometro.png`, fullPage: true });

  await page.reload();
  await menu(page, 'Cronômetro');
  await expect(page.getByText('Pausado')).toBeVisible();
  await expect(page.getByLabel('Tempo líquido')).toHaveText('00:25:00');

  await page.getByRole('button', { name: 'Retomar' }).click();
  await page.clock.fastForward('20:00');
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await dialogo.getByLabel('Questões feitas').fill('10');
  await dialogo.getByLabel('Acertos').fill('8');
  await dialogo.getByLabel('Concluí a teoria deste tópico').check();
  await dialogo.getByRole('button', { name: 'Salvar sessão' }).click();
  await expect(page.getByText('Sessão salva: 0h45min líquidas.')).toBeVisible();

  // Painel
  await menu(page, 'Home');
  await expect(page.getByText('0h45min').first()).toBeVisible();
  await expect(page.getByText('1 de 3 tópicos')).toBeVisible();
  await expect(page.getByText('1 dia seguido')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-home.png`, fullPage: true });

  // Histórico
  await menu(page, 'Histórico');
  await expect(page.getByText('8/10 questões (80%)', { exact: false })).toBeVisible();
  await expect(page.getByText('teoria concluída')).toBeVisible();
});

test('registro manual retroativo aparece no histórico', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-27T23:00:00Z') });
  await page.goto('/');
  await menu(page, 'Histórico');
  await page.getByRole('button', { name: 'Registrar estudo manual' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Dia').fill('2026-09-26');
  await dialogo.getByLabel('Começou às').fill('06:00');
  await dialogo.getByLabel('Horas líquidas').fill('1');
  await dialogo.getByLabel('Minutos').fill('30');
  await dialogo.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('26/09/2026')).toBeVisible();
  await expect(page.getByText('1h30min').first()).toBeVisible();
});
