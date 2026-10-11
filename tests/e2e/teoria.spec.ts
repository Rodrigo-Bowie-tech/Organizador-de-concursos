import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { menu, preparar, topico } from './apoio';

async function semViolacoes(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
}

const sessaoTeoria = (id: string, topicoId: string, inicio: string, horas: number) => ({
  id, concursoId: 'ff', disciplinaId: 'ee', topicoId, tipo: 'teoria', inicio,
  fim: new Date(Date.parse(inicio) + horas * 3_600_000).toISOString(),
  pausas: [], segundosLiquidos: horas * 3600, questoesFeitas: 0, acertos: 0, paginas: 0, anotacoes: '', origem: 'manual', concluiuTeoria: false,
});

// Transformadores levou 3 blocos dos 2 previstos; Lei de Ohm tem 1 previsto; Motores ainda não começou.
const ELETRICA = {
  'disciplinas/ee': {
    id: 'ee', concursoId: 'ff', editalId: null, nome: 'Engenharia Elétrica', peso: 2, numQuestoes: 40, tipo: 'especifica', ordem: 0, cor: '#2bb99a',
    topicos: {
      t1: topico('t1', 'Circuitos', 0),
      t2: { ...topico('t2', 'Lei de Ohm', 0, 't1'), status: 'em_estudo', blocosTeoria: 1 },
      t3: { ...topico('t3', 'Transformadores', 1), status: 'teoria_concluida', blocosTeoria: 2, concluidoEm: '2026-09-18T12:00:00.000Z' },
      t4: { ...topico('t4', 'Motores', 2), blocosTeoria: 2 },
    },
  },
  'sessoes/2026-09-13': { semana: '2026-09-13', itens: { s9: sessaoTeoria('s9', 't3', '2026-09-15T12:00:00.000Z', 3) } },
};

test('último bloco previsto: pergunta se terminou, mais blocos e ajuste do assunto', async ({ page }) => {
  await preparar(page, { extras: ELETRICA });
  await menu(page, 'Edital');
  await expect(page.getByText('0/1 blocos')).toBeVisible(); // Lei de Ohm

  // Registrar 1 h de teoria em Lei de Ohm usa o único bloco previsto: o app pergunta.
  await menu(page, 'Histórico');
  await page.getByRole('button', { name: 'Registrar estudo manual' }).click();
  const registro = page.getByRole('dialog');
  await registro.getByLabel('Disciplina').selectOption('ee');
  await registro.getByLabel('Tópico').selectOption('t2');
  await registro.getByLabel('Dia').fill('2026-09-27');
  await registro.getByLabel('Começou às').fill('18:00');
  await registro.getByLabel('Horas líquidas').fill('1');
  await registro.getByLabel('Minutos').fill('0');
  await registro.getByRole('button', { name: 'Registrar' }).click();

  const pergunta = page.getByRole('dialog', { name: 'Terminou a teoria?' });
  await expect(pergunta).toContainText('Os blocos previstos para Lei de Ohm (Engenharia Elétrica) acabaram: 1 bloco de 1.');
  await semViolacoes(page);
  await pergunta.getByRole('button', { name: 'Ainda não' }).click();
  await pergunta.getByRole('button', { name: '+2' }).click();

  // O assunto está levando 2× o previsto: oferece ajustar Motores (2 → 4).
  const ajuste = page.getByRole('dialog', { name: 'Ajustar Engenharia Elétrica?' });
  await expect(ajuste).toContainText('Engenharia Elétrica está levando 2× o previsto: 6 blocos em vez de 3 blocos em 2 tópicos.');
  await expect(ajuste.getByRole('listitem')).toHaveText(['Motores2 → 4 blocos']);
  await semViolacoes(page);
  await ajuste.getByRole('button', { name: 'Ajustar 1 tópico' }).click();
  await expect(page.getByText('Estimativas ajustadas e plano refeito.')).toBeVisible();

  await menu(page, 'Edital');
  await expect(page.getByText('1/3 blocos')).toBeVisible(); // Lei de Ohm: feito 1, agora 3
  await expect(page.getByText('0/4 blocos')).toBeVisible(); // Motores
});

test('Home: tópicos a confirmar; "terminei" conclui a teoria e agenda a revisão', async ({ page }) => {
  // Crase (Português) tem 3 h de teoria para os 2 blocos previstos.
  await preparar(page);
  const cartao = page.getByRole('heading', { name: 'Terminou a teoria?' }).locator('..').locator('..');
  await expect(cartao).toContainText('Língua Portuguesa');
  await expect(cartao).toContainText('3 blocos de 2 previstos');
  // Ao abrir o app, nada abre sozinho: o que já estava pendente fica no cartão.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Responder sobre Crase' }).click();
  await page.getByRole('dialog', { name: 'Terminou a teoria?' }).getByRole('button', { name: 'Terminei' }).click();
  await expect(page.getByText('Teoria de Crase concluída. A revisão vem amanhã.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terminou a teoria?' })).toHaveCount(0);
  await menu(page, 'Edital');
  await expect(page.getByLabel('Teoria concluída: Crase')).toBeChecked();
});

test('gestão semanal dos concursos: bloco com a lista, tarefas marcadas e desligar na Disponibilidade', async ({ page }) => {
  // Domingo, 27/09/2026, 09:00 em SP; estudo às 20h todo dia. A gestão vem ligada (domingo, 19h).
  const noite = [{ inicio: '20:00', fim: '22:00' }];
  await preparar(page, {
    agora: '2026-09-27T12:00:00Z',
    extras: { 'disponibilidade/geral': { blocoMin: 60, excecoes: {}, dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, noite])) } },
  });
  const linha = page.getByRole('listitem').filter({ hasText: 'Gestão dos concursos' });
  await expect(linha).toContainText('19:00–20:00');
  await expect(linha).toContainText('0 de 5 feitas');
  await linha.getByRole('button', { name: 'Abrir' }).click();

  const gestao = page.getByRole('dialog', { name: 'Gestão dos concursos' });
  for (const tarefa of ['Analisar editais', 'Pesquisar outros concursos', 'Verificar inscrições', 'Revisar o planejamento', 'Conferir resultados']) {
    await expect(gestao.getByText(tarefa, { exact: true })).toBeVisible();
  }
  await expect(gestao).toContainText('Edital aberto, inscrição a confirmar: Fundação Florestal SP.');
  await semViolacoes(page);
  await gestao.getByLabel('Analisar editais').check();
  await expect(linha).toContainText('1 de 5 feitas');
  await gestao.getByRole('button', { name: 'Marcar como feito' }).click();
  await expect(page.getByText('Gestão da semana feita.')).toBeVisible();
  await expect(linha).toContainText('Feito');

  // Na semana que vem (domingo, 04/10) também há gestão, até desligar; a feita fica no histórico.
  await menu(page, 'Planejamento');
  await page.getByLabel('Visão', { exact: true }).selectOption('semana');
  await expect(page.getByRole('button', { name: /^19:00 Gestão dos concursos.*\(Feito\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^19:00 Gestão dos concursos.*\(Planejado\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Disponibilidade' }).click();
  await page.getByLabel('Reservar um horário por semana').uncheck();
  await page.getByRole('button', { name: 'Salvar e replanejar' }).click();
  await expect(page.getByText('Disponibilidade salva e plano refeito.')).toBeVisible();
  await page.getByLabel('Visão', { exact: true }).selectOption('semana');
  await page.getByRole('button', { name: 'Próximo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^20:00 / }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Gestão dos concursos/ })).toHaveCount(0);
});
