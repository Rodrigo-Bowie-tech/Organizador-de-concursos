import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

const noite = [{ inicio: '20:00', fim: '21:00' }];

test('cronograma: rodízio de assuntos, simulado marcado e plano até a prova', async ({ page }) => {
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

  await menu(page, 'Configurações');
  await page.getByLabel('Intercalar assuntos').selectOption('2');
  await expect(page.getByText('Planejamento atualizado.')).toBeVisible();

  await menu(page, 'Planejamento');
  await page.getByRole('button', { name: 'Replanejar' }).click();
  await expect(page.getByText(/Plano refeito: \d+ blocos\./)).toBeVisible();
  await page.getByLabel('Visão').selectOption('semana');

  // Rodízio: as duas disciplinas se alternam noite a noite. Português foi estudado em 25/09, então
  // Elétrica abre o rodízio hoje.
  const cartoes = page.getByRole('region', { name: /Semana/ }).getByRole('button', { name: /^20:00 / });
  await expect(cartoes.nth(0)).toHaveAccessibleName(/^20:00 Engenharia Elétrica/);
  await expect(cartoes.nth(1)).toHaveAccessibleName(/^20:00 Língua Portuguesa/);
  await expect(cartoes.nth(2)).toHaveAccessibleName(/^20:00 Engenharia Elétrica/);
  // O simulado fixo do sábado aparece com o nome certo e o planejador não pôs nada por cima.
  await expect(page.getByRole('button', { name: /^20:00 Simulado/ })).toBeVisible();

  // O plano vai até a semana da prova, além das 4 semanas.
  await page.getByLabel('Visão').selectOption('mes');
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await page.getByRole('button', { name: 'Próximo' }).first().click();
  await expect(page.getByRole('heading', { name: 'Novembro, 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^02\/11\/2026: [1-9]\d* blocos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '09/11/2026: 0 blocos' })).toBeVisible(); // depois da prova, nada
});
