import { expect, test } from '@playwright/test';
import { BANCO, menu, preparar } from './apoio';

function sessao(id: string, inicio: string, minutos: number) {
  const fim = new Date(Date.parse(inicio) + minutos * 60_000).toISOString();
  return { id, concursoId: 'ff', disciplinaId: 'pt', topicoId: 'p1', tipo: 'teoria', inicio, fim, pausas: [], segundosLiquidos: minutos * 60, questoesFeitas: 0, acertos: 0, paginas: 0, anotacoes: '', origem: 'manual', concluiuTeoria: false };
}

const noite = [{ inicio: '20:00', fim: '22:00' }];

test('capacidade real ajusta o plano e o edital que não fecha sugere cortes', async ({ page }) => {
  await preparar(page, {
    extras: {
      // Prova no sábado seguinte: não dá tempo de ver tudo.
      'concursos/ff': { ...(BANCO['concursos/ff'] as object), dataProva: '2026-10-03' },
      'disponibilidade/geral': {
        blocoMin: 60,
        excecoes: {},
        dias: { '1': noite, '2': [{ inicio: '18:00', fim: '22:00' }], '3': noite, '4': noite, '5': noite },
      },
      // Histórico: começou há mais de 14 dias; nas terças estudou 2h10.
      'sessoes/2026-09-06': { semana: '2026-09-06', itens: { a: sessao('a', '2026-09-12T12:00:00.000Z', 60) } },
      'sessoes/2026-09-13': { semana: '2026-09-13', itens: { b: sessao('b', '2026-09-15T21:00:00.000Z', 130) } },
      'sessoes/2026-09-20': {
        semana: '2026-09-20',
        itens: { c: sessao('c', '2026-09-22T21:00:00.000Z', 130), s1: (BANCO['sessoes/2026-09-20'] as { itens: { s1: object } }).itens.s1 },
      },
    },
  });

  await menu(page, 'Planejamento');
  await expect(page.getByText('Você planeja 4h00 às terças mas estuda 2h10 em média; ajustei o plano.')).toBeVisible();
  await expect(page.getByText(/o edital de Fundação Florestal SP não fecha até a prova \(03\/10\/2026\)/)).toBeVisible();

  await page.getByRole('button', { name: /Ver cortes sugeridos/ }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('checkbox')).toHaveCount(2);
  await dialogo.getByRole('button', { name: 'Cortar 2 tópicos' }).click();
  await expect(page.getByText('2 tópicos saíram do plano.')).toBeVisible();

  await menu(page, 'Edital');
  await expect(page.getByText('fora do plano · devolver')).toHaveCount(2);
  await page.getByText('fora do plano · devolver').first().click();
  await expect(page.getByText('Tópico de volta ao plano.')).toBeVisible();
  await expect(page.getByText('fora do plano · devolver')).toHaveCount(1);
});
