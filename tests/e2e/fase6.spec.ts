import { expect, test } from '@playwright/test';
import { menu, preparar } from './apoio';

const op = (id: string, extra: Record<string, unknown>) => ({
  id,
  titulo: id,
  orgao: id,
  banca: '',
  cargos: ['Engenheiro Eletricista'],
  salario: 9800,
  vagas: 2,
  uf: 'SP',
  inscricoesAte: '2026-10-20',
  link: `https://www.pciconcursos.com.br/noticias/${id.toLowerCase().replace(/\W+/g, '-')}`,
  fonte: 'PCI Concursos',
  coletadoEm: '2026-09-27T12:00:00.000Z',
  ...extra,
});

const RADAR = {
  'radar_filtros/padrao': { id: 'padrao', nome: 'Elétrica SP/RJ', areas: ['Engenharia Elétrica'], ufs: ['SP', 'RJ'], bancas: [], salarioMinimo: null },
  'estado/radar': { vistoAte: '2026-09-26T00:00:00.000Z' },
  'oportunidades/SP': {
    uf: 'SP',
    itens: {
      Sabesp: op('Sabesp', { banca: 'FCC', salario: 11874.15, vagas: 12 }),
      Campinas: op('Campinas', { titulo: 'Prefeitura de Campinas', orgao: 'Prefeitura de Campinas', cargos: ['Engenheiro Civil'] }),
      Metro: op('Metro', { titulo: 'Metrô SP', orgao: 'Metrô SP', inscricoesAte: '2026-09-10', coletadoEm: '2026-09-01T12:00:00.000Z' }),
    },
  },
  'oportunidades/MG': { uf: 'MG', itens: { Cemig: op('Cemig', { uf: 'MG' }) } },
};

test('radar: alerta na Home, filtros, ignorar e transformar em concurso', async ({ page }) => {
  await preparar(page, { extras: RADAR });

  const alerta = page.getByRole('button', { name: /1 concurso novo no radar/ });
  await expect(alerta).toContainText('Sabesp (SP)');
  await alerta.click();

  await expect(page.getByRole('heading', { name: 'Radar de concursos' })).toBeVisible();
  await expect(page.getByText('Última coleta do PCI: 27/09/2026 às 09:00')).toBeVisible();
  const lista = page.getByRole('list', { name: 'Oportunidades' });
  await expect(lista.getByRole('listitem')).toHaveCount(1);
  const sabesp = lista.getByRole('listitem').filter({ hasText: 'Sabesp' });
  await expect(sabesp).toContainText('nova');
  await expect(sabesp).toContainText('R$ 11.874,15');
  await expect(sabesp).toContainText('12 vagas');
  await expect(sabesp).toContainText('inscrições até 20/10/2026');

  // Sem o filtro aparecem as outras abertas; a encerrada só com "Mostrar encerradas".
  await page.getByLabel('Só o que bate com meus filtros').uncheck();
  await expect(lista.getByRole('listitem')).toHaveCount(3);
  await page.getByLabel('Mostrar encerradas').check();
  await expect(lista.getByRole('listitem')).toHaveCount(4);
  await expect(lista.getByRole('listitem').filter({ hasText: 'Metrô SP' })).toContainText('encerrada');
  await page.getByLabel('Mostrar encerradas').uncheck();

  await lista.getByRole('listitem').filter({ hasText: 'Prefeitura de Campinas' }).getByRole('button', { name: 'Ignorar' }).click();
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Só o que bate com meus filtros').check();

  // Novo filtro para MG traz a Cemig.
  await page.getByRole('button', { name: 'Novo filtro' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome').fill('Minas');
  await dialogo.getByLabel('Áreas').fill('Engenharia Elétrica');
  await dialogo.getByLabel('UFs').fill('XX');
  await expect(dialogo.getByText('Sigla inválida: XX')).toBeVisible();
  await dialogo.getByLabel('UFs').fill('mg');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(lista.getByRole('listitem')).toHaveCount(2);

  await sabesp.getByRole('button', { name: 'Transformar em concurso' }).click();
  await expect(page.getByText('Concurso criado. Agora importe o edital.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Importar edital' })).toBeVisible();
  await expect(page.getByLabel('Concurso ativo')).toHaveValue(/.+/);
  await expect(page.getByLabel('Concurso ativo').locator('option:checked')).toHaveText('Sabesp');

  await menu(page, 'Radar');
  await expect(lista.getByRole('listitem').filter({ hasText: 'Sabesp' })).toContainText('já está em Concursos');

  // A visita marcou tudo como visto: o alerta sai da Home.
  await menu(page, 'Home');
  await expect(page.getByRole('button', { name: /novo no radar/ })).toHaveCount(0);
});

test('radar: colar a página e a IA separa os concursos', async ({ page }) => {
  await preparar(page, {
    ia: true,
    extras: { 'radar_filtros/padrao': RADAR['radar_filtros/padrao'] },
    respostasIA: {
      'Você extrai concursos': [
        { orgao: 'Furnas', titulo: 'Furnas - RJ', cargos: ['Engenheiro Eletricista', 'Técnico'], salario: 12500, vagas: 5, uf: 'RJ', inscricoesAte: '2026-10-15', banca: 'Cesgranrio', link: 'https://exemplo.gov.br/furnas' },
        { orgao: 'Prefeitura de Recife', cargos: ['Engenheiro Eletricista'], salario: null, vagas: null, uf: 'PE', inscricoesAte: null, banca: '', link: '' },
      ],
    },
  });
  await menu(page, 'Radar');
  await expect(page.getByText('Radar vazio')).toBeVisible();

  await page.getByRole('button', { name: 'Colar página' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Texto da página').fill('Furnas abre concurso para engenheiro eletricista no RJ com salário de R$ 12.500. Prefeitura de Recife...');
  await dialogo.getByRole('button', { name: 'Extrair com IA' }).click();
  await expect(dialogo.getByText('Furnas - RJ')).toBeVisible();
  await dialogo.getByRole('checkbox', { name: /Prefeitura de Recife/ }).uncheck();
  await dialogo.getByRole('button', { name: 'Salvar 1 oportunidade' }).click();
  await expect(page.getByText('1 nova no radar.')).toBeVisible();

  const item = page.getByRole('list', { name: 'Oportunidades' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Furnas - RJ');
  await expect(item).toContainText('Banca Cesgranrio');
  await expect(item).toContainText('via texto colado');
  await expect(item.getByRole('link', { name: 'Abrir anúncio' })).toHaveAttribute('href', 'https://exemplo.gov.br/furnas');

  // Cadastro manual.
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await dialogo.getByLabel('Órgão').fill('Light S.A.');
  await dialogo.getByLabel('Cargos').fill('Engenheiro Eletricista');
  await dialogo.getByLabel('UF').fill('RJ');
  await dialogo.getByLabel('Inscrições até').fill('2026-10-02');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(item).toHaveCount(2);
  await expect(item.filter({ hasText: 'Light S.A.' })).toContainText('inscrições até 02/10/2026');
});
