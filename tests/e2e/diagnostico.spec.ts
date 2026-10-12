import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

// Engenharia Elétrica (peso 2, 40 questões): nenhuma teoria, 7 de 10 em Transformadores e 2 de 10
// questões no simulado (4 de 20 pontos). Português (20 questões): 3 h de teoria em Crase.
const EXTRAS = {
  'questoes/2026-09-20': {
    semana: '2026-09-20',
    itens: { r1: { id: 'r1', concursoId: 'ff', disciplinaId: 'ee', topicoId: 't3', dia: '2026-09-26', feitas: 10, acertos: 7, fonte: 'QConcursos' } },
  },
  'simulados/s1': {
    id: 's1', concursoId: 'ff', titulo: 'Simulado 1', dia: '2026-09-26', duracaoMin: 180, observacoes: '', notaTotal: 4, notaMaxima: 20,
    notas: [{ disciplinaId: 'ee', nome: 'Engenharia Elétrica', nota: 4, maximo: 20 }],
  },
};

const questao = (id: string, numero: number, rotulo: string, grupo: string, topicoId: string) => ({
  id, numero, rotulo, grupo, enunciado: `(FCC · 2023) Questão ${rotulo}`, alternativas: ['110 V', '220 V', '440 V', '55 V'], correta: 1,
  disciplinaId: 'ee', topicoId, anulada: false, comentario: `Comentário da ${rotulo}: V2 = V1 · N2/N1.`,
});
const CADERNO = {
  'provas/cad': {
    id: 'cad', concursoId: 'ff', caderno: true, titulo: 'Caderno de elétrica', banca: 'FCC', orgao: '', ano: 2026, cargo: '', arquivoId: null, arquivoNome: null,
    importadaEm: '2026-09-20T12:00:00Z',
    questoes: {
      a: questao('a', 1, '01.D1', 'Bloco 01 · Diagnóstico', 't3'),
      b: questao('b', 2, '01.D2', 'Bloco 01 · Diagnóstico', 't2'),
      c: questao('c', 3, '01.1', 'Bloco 01 · Questões', 't3'),
    },
  },
};

test('quanto estudar por assunto: o tempo segue a incidência; o desempenho só marca o que estudar logo', async ({ page }) => {
  await preparar(page, { extras: EXTRAS });
  await menu(page, 'Estatísticas');
  const cartao = page.getByRole('heading', { name: 'Quanto estudar por assunto' }).locator('xpath=ancestor::section[1]');
  await expect(cartao).toContainText('Estudar logo: Engenharia Elétrica (acertou menos da metade no último simulado em que caiu).');
  const itens = cartao.getByRole('list', { name: 'Assuntos, do que mais cai para o que menos cai' }).locator(':scope > li');
  // Do que mais cai para o que menos cai: 40 × 2 = 80 de 100 pontos; 20 × 1 = 20.
  await expect(itens.nth(0)).toContainText('Engenharia Elétrica');
  const [ee, pt] = [itens.nth(0), itens.nth(1)];
  await expect(ee).toContainText('Estudar logo');
  await expect(ee).toContainText('40 questões · 80% da prova');
  await expect(ee).toContainText('No plano até a prova: 0h00min (0% das horas)');
  await expect(ee).toContainText('sem estudo ainda · teoria 0 de 4 blocos · questões 7 de 10 · simulados 2 de 10');
  await expect(pt).toContainText('20 questões · 20% da prova');
  await expect(pt).toContainText('estudou 3h00min · teoria 2 de 2 blocos · questões nenhuma ainda · simulados não caiu');
  await expect(pt.getByText('Estudar logo')).toHaveCount(0);
  await ee.getByRole('button', { name: 'Tópicos (2)' }).click();
  await expect(ee.getByRole('list', { name: 'Tópicos de Engenharia Elétrica' })).toContainText('Transformadores');
  await expect(ee.getByRole('list', { name: 'Tópicos de Engenharia Elétrica' })).toContainText('Não iniciado · teoria 0 de 2 · questões 7 de 10');
});

test('cadernos: refazer por partes, com o número do caderno e o comentário; o acerto entra no diagnóstico', async ({ page }) => {
  await preparar(page, { extras: CADERNO });
  await menu(page, 'Provas anteriores');
  // Caderno não é prova da banca: fica na seção dele e fora dos assuntos que mais caem.
  const cadernos = page.getByRole('list', { name: 'Cadernos de questões' });
  await expect(cadernos).toContainText('0 de 2 partes feitas');
  await expect(page.getByRole('heading', { name: /Assuntos que mais caem/ })).toHaveCount(0);

  await cadernos.getByRole('button', { name: 'Refazer' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Parte do caderno')).toHaveValue('Bloco 01 · Diagnóstico');
  await expect(modal.getByLabel('Questões de')).toHaveCount(0); // uma disciplina só
  await modal.getByRole('button', { name: 'Começar' }).click();
  await expect(modal.getByText('Questão 01.D1 · 1 de 2')).toBeVisible();
  await modal.getByRole('button', { name: /^A\)/ }).click();
  await expect(modal.getByText('Errou. Gabarito: B')).toBeVisible();
  await expect(modal.getByText('Comentário da 01.D1: V2 = V1 · N2/N1.')).toBeVisible(); // aberto depois de errar
  await modal.getByRole('button', { name: 'Próxima' }).click();
  await modal.getByRole('button', { name: /^B\)/ }).click();
  await expect(modal.getByText('Acertou!')).toBeVisible();
  await modal.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(modal.getByText('1 de 2', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Salvar em Questões' }).click();
  await expect(page.getByText('1 de 2 registradas em Questões.')).toBeVisible();
  await modal.getByRole('button', { name: 'Fechar' }).click();

  await expect(cadernos).toContainText('1 de 2 partes feitas');
  await expect(page.getByRole('list', { name: 'Partes feitas de Caderno de elétrica' })).toContainText('Bloco 01 · Diagnóstico: 1 de 2');
  // A próxima vez começa pela parte que falta.
  await cadernos.getByRole('button', { name: 'Refazer' }).click();
  await expect(page.getByRole('dialog').getByLabel('Parte do caderno')).toHaveValue('Bloco 01 · Questões');
  await page.keyboard.press('Escape');

  await menu(page, 'Estatísticas');
  const ee = page.getByRole('heading', { name: 'Quanto estudar por assunto' }).locator('xpath=ancestor::section[1]').getByRole('listitem').filter({ hasText: 'Engenharia Elétrica' }).first();
  await expect(ee).toContainText('questões 1 de 2');
});
