import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

const noite = [{ inicio: '20:00', fim: '21:00' }];

test('cronograma: o assunto que mais cai aparece mais, simulado marcado e plano até a prova', async ({ page }) => {
  // Domingo, 27/09/2026, 20:00 em SP. Prova em 08/11 (mais de 4 semanas).
  await preparar(page, {
    extras: {
      'concursos/ff': {
        id: 'ff', nome: 'Fundação Florestal SP', orgao: 'Fundação Florestal', banca: 'FCC', cargo: 'Engenheiro Eletricista', area: 'Engenharia Elétrica',
        dataProva: '2026-11-08', status: 'inscrito', link: '', notaCorte: null, prioridade: 5, criadoEm: '2026-09-01T12:00:00.000Z',
      },
      'disponibilidade/geral': { blocoMin: 60, excecoes: {}, dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, noite])) },
      'plano/2026-09-27': {
        semana: '2026-09-27',
        itens: {
          sim: { id: 'sim', dia: '2026-10-03', inicio: '20:00', fim: '21:00', concursoId: 'ff', disciplinaId: null, topicoId: null, tipo: 'simulado', status: 'planejado', motivo: 'simulado', fixo: true },
        },
      },
    },
  });

  await menu(page, 'Planejamento');
  await page.getByRole('button', { name: 'Replanejar' }).click();
  await expect(page.getByText(/Plano refeito: \d+ blocos\./)).toBeVisible();
  await page.getByLabel('Visão').selectOption('semana');

  // Pela incidência: Elétrica (40 questões × peso 2) vale 4 vezes Português (20 × 1) e aparece mais. Ela
  // nunca foi estudada e abre a semana; Português, com 3 h em 25/09 (o estudo dos últimos 14 dias conta),
  // espera a Elétrica chegar perto da parte dela e volta na semana seguinte.
  const cartoes = page.getByRole('region', { name: /Semana/ }).getByRole('button', { name: /^20:00 / });
  const nomesDaSemana = () => cartoes.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent ?? ''));
  await expect(cartoes.nth(0)).toHaveAccessibleName(/^20:00 Engenharia Elétrica/);
  const semana1 = await nomesDaSemana();
  const conta = (nomes: string[], nome: string) => nomes.filter((n) => n.includes(nome)).length;
  expect(conta(semana1, 'Engenharia Elétrica')).toBeGreaterThanOrEqual(4);
  expect(conta(semana1, 'Língua Portuguesa')).toBe(0);
  // O simulado fixo do sábado aparece com o nome certo e o planejador não pôs nada por cima.
  await expect(page.getByRole('button', { name: /^20:00 Simulado/ })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await expect(page.getByRole('heading', { name: '04/10 a 10/10/2026' })).toBeVisible();
  const semana2 = await nomesDaSemana();
  expect(conta(semana2, 'Língua Portuguesa')).toBeGreaterThan(0);
  const duas = [...semana1, ...semana2];
  expect(conta(duas, 'Engenharia Elétrica')).toBeGreaterThan(conta(duas, 'Língua Portuguesa'));

  // O plano vai até a semana da prova, além das 4 semanas.
  await page.getByLabel('Visão').selectOption('mes');
  await expect(page.getByRole('heading', { name: 'Outubro, 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await expect(page.getByRole('heading', { name: 'Novembro, 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^02\/11\/2026: [1-9]\d* blocos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '09/11/2026: 0 blocos' })).toBeVisible(); // depois da prova, nada
});
