import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { menu, preparar } from './apoio';

// Fase 8: nenhuma violação WCAG 2.1 A/AA do axe em nenhuma tela, nos dois temas.
const TELAS = ['Home', 'Concursos', 'Disciplinas', 'Edital', 'Planejamento', 'Revisões', 'Questões', 'Caderno de erros', 'Simulados', 'Provas anteriores', 'Histórico', 'Estatísticas', 'Balanço', 'Biblioteca', 'Radar', 'Cronômetro', 'Configurações'];

const questao = (n: number, topicoId: string) => ({ id: `q${n}`, numero: n, enunciado: `Questão ${n}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, disciplinaId: 'ee', topicoId, anulada: false });
const EXTRAS = {
  'provas/p1': { id: 'p1', concursoId: 'ff', titulo: 'FCC · 2023', banca: 'FCC', orgao: '', ano: 2023, cargo: '', arquivoId: null, arquivoNome: null, importadaEm: '2026-09-20T12:00:00Z', questoes: { q1: questao(1, 't3'), q2: questao(2, 't2') } },
  'radar_filtros/padrao': { id: 'padrao', nome: 'Elétrica SP/RJ', areas: ['Engenharia Elétrica'], ufs: ['SP', 'RJ'], bancas: [], salarioMinimo: null },
  'oportunidades/SP': { uf: 'SP', itens: { sabesp: { id: 'sabesp', titulo: 'Sabesp', orgao: 'Sabesp', banca: 'FCC', cargos: ['Engenheiro Eletricista'], salario: 11874.15, vagas: 12, uf: 'SP', inscricoesAte: '2026-10-20', link: 'https://exemplo.gov.br/sabesp', fonte: 'PCI Concursos', coletadoEm: '2026-09-27T12:00:00.000Z' } } },
};

async function violacoes(page: Page, onde: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${onde} · ${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`));
}

for (const tema of ['claro', 'escuro'] as const) {
  test(`acessibilidade: todas as telas no tema ${tema}`, async ({ page }, info) => {
    test.skip(tema === 'escuro' && info.project.name !== 'desktop', 'tema escuro: basta um tamanho de tela');
    await preparar(page, { extras: { ...EXTRAS, 'config/geral': { tema } } });
    const achadas: string[] = [];
    for (const t of TELAS) {
      await menu(page, t);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      achadas.push(...(await violacoes(page, t)));
      // Nada pode passar da largura da tela (no celular, rolagem lateral só dentro das regiões próprias).
      const largura = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (largura[0] > largura[1]) achadas.push(`${t} · página mais larga que a tela (${largura[0]} > ${largura[1]} px)`);
    }
    // Um modal aberto (registro manual de sessão).
    await menu(page, 'Histórico');
    await page.getByRole('button', { name: /Registrar/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    achadas.push(...(await violacoes(page, 'Modal de registro')));
    expect(achadas).toEqual([]);
  });
}
