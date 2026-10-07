import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

// App instalável (dist/web), servido em /Organizador-de-concursos/ como no GitHub Pages.
// Os dados de apoio entram pelo localStorage e o app os leva para o IndexedDB na primeira abertura.

const swPronto = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return r.active?.state;
  });

test('instalável: manifest com ícones e service worker ativo', async ({ page, request }) => {
  await preparar(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href ?? '', page.url()).href)).json();
  expect(manifest).toMatchObject({ name: 'Organizador de Concursos', short_name: 'Concursos', display: 'standalone', start_url: './', lang: 'pt-BR' });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable');
  for (const icone of manifest.icons as { src: string }[]) expect((await request.get(new URL(icone.src, page.url()).href)).ok()).toBe(true);
  await expect.poll(() => swPronto(page)).toBe('activated');

  await menu(page, 'Configurações');
  await expect(page.getByText('Os dados ficam neste aparelho e funcionam sem internet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instalar o app' })).toBeVisible();
  // Sem o aviso amarelo do modo de desenvolvimento.
  await expect(page.getByText(/Modo local/)).toHaveCount(0);
});

test('sem internet: o app abre do cache e grava no aparelho', async ({ page, context }) => {
  await preparar(page);
  await expect.poll(() => swPronto(page)).toBe('activated');
  await context.setOffline(true);
  // A rede caiu também para o service worker: um arquivo fora do cache não chega.
  expect(await page.evaluate(() => fetch('manifest.webmanifest?sem-cache').then((r) => r.status, () => 'falhou'))).toBe('falhou');

  const resposta = await page.reload();
  expect(resposta?.fromServiceWorker()).toBe(true);
  await menu(page, 'Edital');
  await page.getByLabel('Teoria concluída: Lei de Ohm').check();
  await expect(page.getByTitle('Próxima revisão')).toHaveText('rev. 28/09');

  await page.reload();
  await menu(page, 'Edital');
  await expect(page.getByLabel('Teoria concluída: Lei de Ohm')).toBeChecked();
});

test('duas abas: a mudança chega na outra sem apagar o formulário aberto', async ({ page, context }) => {
  await preparar(page);
  await menu(page, 'Edital');
  await page.getByRole('button', { name: 'Materiais (0)' }).nth(2).click(); // Transformadores
  await page.getByRole('button', { name: 'Adicionar material' }).click();
  const form = page.getByRole('dialog', { name: 'Adicionar material' });
  await form.getByLabel('Título').fill('Aula 07 - Transformadores');

  const outra = await context.newPage();
  await outra.goto('./');
  await menu(outra, 'Edital');
  await outra.getByLabel('Teoria concluída: Lei de Ohm').check();

  // A primeira aba recebe a mudança (o Edital por trás do modal) e o título continua lá.
  await expect(page.getByLabel('Teoria concluída: Lei de Ohm')).toBeChecked();
  await expect(form.getByLabel('Título')).toHaveValue('Aula 07 - Transformadores');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Aula 07 - Transformadores').first()).toBeVisible();

  await menu(outra, 'Biblioteca');
  await expect(outra.getByText('Aula 07 - Transformadores')).toBeVisible();
});
