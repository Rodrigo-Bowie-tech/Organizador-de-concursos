import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { lerArquivoDados } from '../../src/dados/juntar';
import { GitHubFalso } from '../github-falso';
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

async function semViolacoes(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
}

async function ligarSincronizacao(page: Page, token: string) {
  await menu(page, 'Configurações');
  await page.getByLabel('Token do GitHub').fill(token);
  await page.getByRole('button', { name: 'Ligar sincronização' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado com o GitHub' })).toBeVisible();
}

test('sincronização pelo GitHub: dois aparelhos, um sem internet, juntam o que cada um fez', async ({ page, context, browser }, info) => {
  const gh = new GitHubFalso();
  await context.route('https://api.github.com/**', (r) => gh.atender(r));

  // Aparelho 1 (com os dados de apoio) liga a sincronização e envia tudo.
  await preparar(page);
  await menu(page, 'Configurações');
  await expect(page.getByLabel('Repositório (dono/nome)')).toHaveValue('Rodrigo-Bowie-tech/organizador-dados');
  await semViolacoes(page);
  await page.getByLabel('Token do GitHub').fill('token-errado');
  await page.getByRole('button', { name: 'Ligar sincronização' }).click();
  await expect(page.getByRole('status')).toContainText('recusou o token');
  await page.getByRole('button', { name: 'Trocar token' }).click();
  await page.getByLabel('Token do GitHub').fill(gh.token);
  await page.getByRole('button', { name: 'Salvar token' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado com o GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sincronizado\./ })).toBeVisible();
  await semViolacoes(page);
  expect(gh.arquivos().has('dados/disciplinas/ee.json')).toBe(true);
  for (const texto of gh.arquivos().values()) expect(texto).not.toContain(gh.token);

  // Aparelho 2: outro navegador (outro banco), começa vazio e recebe tudo.
  const pc = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1366, height: 860 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  let semInternet = false;
  await pc.route('https://api.github.com/**', (r) => (semInternet ? r.abort('internetdisconnected') : gh.atender(r)));
  const outro = await pc.newPage();
  await outro.clock.install({ time: new Date('2026-09-27T23:00:00Z') });
  await outro.goto('./');
  await ligarSincronizacao(outro, gh.token);
  await menu(outro, 'Edital');
  await expect(outro.getByLabel('Teoria concluída: Lei de Ohm')).not.toBeChecked();

  // Sem internet no aparelho 2, cada um conclui um tópico diferente da mesma disciplina.
  semInternet = true;
  await outro.getByLabel('Teoria concluída: Lei de Ohm').check();
  await expect(outro.getByRole('button', { name: /^Sem internet/ })).toBeVisible({ timeout: 10_000 });
  await menu(page, 'Edital');
  await page.getByLabel('Teoria concluída: Transformadores').check();
  const status = (t: string | undefined) => (lerArquivoDados(t ?? '')?.dado.topicos as Record<string, { status: string }> | undefined) ?? {};
  await expect.poll(() => status(gh.arquivos().get('dados/disciplinas/ee.json')).t3?.status, { timeout: 10_000 }).toBe('teoria_concluida');

  // A internet volta: o aparelho 2 junta as duas mudanças e o 1 recebe a do 2.
  semInternet = false;
  await menu(outro, 'Configurações');
  await outro.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(outro.getByRole('status').filter({ hasText: 'Sincronizado com o GitHub' })).toBeVisible();
  await menu(outro, 'Edital');
  await expect(outro.getByLabel('Teoria concluída: Lei de Ohm')).toBeChecked();
  await expect(outro.getByLabel('Teoria concluída: Transformadores')).toBeChecked();
  expect(status(gh.arquivos().get('dados/disciplinas/ee.json')).t2?.status).toBe('teoria_concluida');

  await menu(page, 'Configurações');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado com o GitHub' })).toBeVisible();
  await menu(page, 'Edital');
  await expect(page.getByLabel('Teoria concluída: Lei de Ohm')).toBeChecked();
  await expect(page.getByLabel('Teoria concluída: Transformadores')).toBeChecked();
  await pc.close();
});
