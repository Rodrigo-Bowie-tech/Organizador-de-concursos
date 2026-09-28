import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

// Dez sessões antigas: o suficiente para o lembrete de backup aparecer.
const sessao = (i: number) => ({
  id: `a${i}`, concursoId: 'ff', disciplinaId: 'ee', topicoId: 't2', tipo: 'questoes',
  inicio: `2026-09-${String(13 + (i % 6)).padStart(2, '0')}T1${i % 10}:00:00.000Z`, fim: `2026-09-${String(13 + (i % 6)).padStart(2, '0')}T1${i % 10}:30:00.000Z`,
  pausas: [], segundosLiquidos: 1800, questoesFeitas: 10, acertos: 7, paginas: 0, anotacoes: '', origem: 'manual', concluiuTeoria: false,
});
const ANTIGAS = { 'sessoes/2026-09-13': { semana: '2026-09-13', itens: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`a${i}`, sessao(i)])) } };

test('backup: lembrete na Home some depois de exportar; planilhas em CSV', async ({ page }) => {
  await preparar(page, { extras: ANTIGAS });
  await expect(page.getByText('Você ainda não exportou um backup.')).toBeVisible();
  await page.getByRole('button', { name: 'Fazer backup' }).click();

  await expect(page.getByText('Nenhum backup exportado ainda.')).toBeVisible();
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar backup' }).click()]);
  expect(backup.suggestedFilename()).toBe('organizador-concursos-backup-2026-09-27.json');
  await expect(page.getByText('Último backup: 27/09/2026')).toBeVisible();

  const [sessoes] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sessões (CSV)' }).click()]);
  expect(sessoes.suggestedFilename()).toBe('organizador-sessoes-2026-09-27.csv');
  const csv = readFileSync(await sessoes.path(), 'utf8');
  expect(csv.startsWith('﻿Data;Início;Fim;Minutos líquidos;Concurso;Disciplina;Tópico')).toBe(true);
  expect(csv.trim().split('\r\n')).toHaveLength(12); // cabeçalho + 10 antigas + a do BANCO
  expect(csv).toContain('25/09/2026;09:00;12:00;180;Fundação Florestal SP;Língua Portuguesa;Crase;Teoria');

  const [questoes] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Questões (CSV)' }).click()]);
  const q = readFileSync(await questoes.path(), 'utf8').trimEnd().split('\r\n');
  expect(q[0]).toBe('﻿Data;Concurso;Disciplina;Tópico;Feitas;Acertos;% de acerto;Fonte');
  expect(q[1]).toBe('13/09/2026;Fundação Florestal SP;Engenharia Elétrica;Circuitos › Lei de Ohm;10;7;70;Sessão (Questões)');

  await menu(page, 'Home');
  await expect(page.getByRole('button', { name: 'Fazer backup' })).toHaveCount(0);
});

test('cronômetro: espaço pausa e retoma, mas não dentro de um campo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'atalho de teclado é para o desktop');
  await preparar(page);
  await menu(page, 'Cronômetro');
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByText('Estudando')).toBeVisible();
  await expect(page.getByText('pausa e retoma')).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.getByText('Pausado')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Estudando')).toBeVisible();

  await page.getByRole('button', { name: 'Trocar tópico ou tipo' }).click().catch(() => undefined);
  const campo = page.locator('select, input').first();
  if (await campo.count()) {
    await campo.focus();
    await page.keyboard.press('Space');
    await expect(page.getByText('Estudando')).toBeVisible();
  }
});
