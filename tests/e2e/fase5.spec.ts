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

test('estatísticas: horas estudadas e pausadas no total, por dia e por assunto', async ({ page }) => {
  // Além das 3 h de Português registradas à mão (25/09), 1h30 de cronômetro em Elétrica no
  // sábado, 26/09 (20:00–21:30 em SP), com 30 min de pausa; e uma pausa esquecida por 2 dias.
  const base = (BANCO['sessoes/2026-09-20'] as { itens: Record<string, Record<string, unknown>> }).itens.s1;
  const cronometro = (id: string, inicio: string, fim: string, pausas: { inicio: string; fim: string | null }[]) => ({
    ...base, id, disciplinaId: 'ee', topicoId: 't3', inicio, fim, pausas, segundosLiquidos: null, origem: 'cronometro',
  });
  await preparar(page, {
    extras: {
      'sessoes/2026-09-20': {
        semana: '2026-09-20',
        itens: {
          s1: base,
          s2: cronometro('s2', '2026-09-26T23:00:00Z', '2026-09-27T00:30:00Z', [{ inicio: '2026-09-26T23:30:00Z', fim: '2026-09-27T00:00:00Z' }]),
          s3: cronometro('s3', '2026-09-24T12:00:00Z', '2026-09-26T12:00:00Z', [{ inicio: '2026-09-24T12:00:30Z', fim: null }]),
        },
      },
    },
  });
  await menu(page, 'Estatísticas');
  const cartao = page.getByRole('heading', { name: 'Horas estudadas e pausadas' }).locator('..').locator('..');
  const numero = (rotulo: string) => cartao.locator('dl > div').filter({ hasText: rotulo }).locator('dd').first();
  await expect(numero('Estudadas')).toHaveText('4h00min');
  await expect(numero('Pausadas')).toHaveText('0h30min');
  await expect(numero('Sem as pausas')).toHaveText('4h30min');
  await expect(numero('Em pausa')).toHaveText('33%');
  await expect(cartao).toContainText('seriam 0h30min a mais (12% a mais do que você estudou)');
  await expect(cartao.getByRole('listitem', { name: 'Sáb, 26/09/2026: estudou 1h00min e pausou 0h30min' })).toBeVisible();
  await expect(cartao.getByRole('listitem', { name: 'Língua Portuguesa: estudou 3h00min e pausou 0h00min' })).toBeVisible();
  await expect(cartao.getByRole('listitem', { name: 'Engenharia Elétrica: estudou 1h00min e pausou 0h30min' })).toBeVisible();
});

test('estatísticas: heatmap, planejado × realizado e melhor horário', async ({ page }, info) => {
  await preparar(page);
  await menu(page, 'Estatísticas');
  await expect(page.getByRole('img', { name: /Heatmap: 1 dia com estudo/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Melhor horário do dia' })).toBeVisible();
  await expect(page.getByText('Você rende mais de manhã, onde concentra mais horas.')).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-estatisticas.png`, fullPage: true });
});
