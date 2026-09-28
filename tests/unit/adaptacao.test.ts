import { describe, expect, it } from 'vitest';
import { avisoCapacidade, capacidadeParaPlano, capacidadeReal, viabilidade } from '../../src/dominio/adaptacao';
import { gerarPlano } from '../../src/dominio/planejador';
import type { Concurso, Disciplina, Disponibilidade, Sessao, Topico } from '../../src/dominio/tipos';

// Segunda, 12/10/2026, 08:00 em SP.
const AGORA = new Date('2026-10-12T11:00:00Z');

const GRADE: Disponibilidade = {
  blocoMin: 60,
  excecoes: {},
  dias: {
    '1': [{ inicio: '20:00', fim: '22:00' }],
    '2': [{ inicio: '18:00', fim: '22:00' }], // terça: 4h declaradas
    '3': [{ inicio: '20:00', fim: '22:00' }],
    '4': [{ inicio: '20:00', fim: '22:00' }],
    '5': [{ inicio: '20:00', fim: '22:00' }],
  },
};

function sessao(dia: string, minutos: number): Sessao {
  const inicio = new Date(`${dia}T23:00:00Z`); // 20:00 em SP
  return {
    id: `s-${dia}`,
    concursoId: null,
    disciplinaId: null,
    topicoId: null,
    tipo: 'teoria',
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
    pausas: [],
    segundosLiquidos: minutos * 60,
    questoesFeitas: 0,
    acertos: 0,
    paginas: 0,
    anotacoes: '',
    origem: 'manual',
    concluiuTeoria: false,
  };
}

// Duas semanas de histórico: nas terças estudou 2h10 (130 min); nos outros dias, o combinado.
const HISTORICO = [
  sessao('2026-09-25', 60), // primeiro registro há mais de 14 dias
  ...['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => sessao(d, 120)),
  sessao('2026-09-29', 130),
  sessao('2026-10-06', 130),
];

describe('capacidade real (média móvel de 14 dias por dia da semana)', () => {
  it('detecta a terça abaixo do declarado e gera o aviso', () => {
    const c = capacidadeReal(HISTORICO, GRADE, AGORA);
    const terca = c[2];
    expect(terca).toMatchObject({ declarado: 240, real: 130, ajustado: true });
    expect(c[1].ajustado).toBe(false);
    expect(avisoCapacidade(terca)).toBe('Você planeja 4h00 às terças mas estuda 2h10 em média; ajustei o plano.');
  });

  it('sem 14 dias de uso, não ajusta nada', () => {
    const c = capacidadeReal(HISTORICO.filter((s) => s.inicio >= '2026-10-05'), GRADE, AGORA);
    expect(c.some((x) => x.ajustado)).toBe(false);
  });

  it('a capacidade real reduz a carga planejada das terças', () => {
    const cap = capacidadeParaPlano(capacidadeReal(HISTORICO, GRADE, AGORA), GRADE);
    expect(cap).toEqual({ '2': 130 });
    const d: Disciplina = {
      id: 'd', concursoId: 'c', editalId: null, nome: 'd', peso: 1, numQuestoes: null, tipo: 'especifica', ordem: 0, cor: '#000',
      topicos: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`t${i}`, { id: `t${i}`, paiId: null, titulo: `t${i}`, ordem: i, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null }])),
    };
    const c: Concurso = { id: 'c', nome: 'c', orgao: '', banca: '', cargo: '', area: '', dataProva: null, status: 'inscrito', link: '', notaCorte: null, prioridade: 3, criadoEm: '' };
    const base = { agora: AGORA, concursos: [c], disciplinas: [d], disponibilidade: GRADE, existentes: [], novoId: () => Math.random().toString(36), horizonteDias: 7 };
    const terca = (p: { dia: string }[]) => p.filter((b) => b.dia === '2026-10-13').length;
    expect(terca(gerarPlano(base))).toBe(4);
    expect(terca(gerarPlano({ ...base, capacidadeMin: cap }))).toBe(3); // 130 min → 3 blocos (60+60+corte)
  });
});

describe('viabilidade do edital', () => {
  const topico = (id: string, peso: Partial<Topico> = {}): Topico => ({ id, paiId: null, titulo: id, ordem: 0, status: 'nao_iniciado', autoavaliacao: null, incidencia: null, grupoEquivalenciaId: null, ...peso });
  const disciplina = (id: string, peso: number, n: number): Disciplina => ({
    id, concursoId: 'c', editalId: null, nome: id, peso, numQuestoes: 10, tipo: 'especifica', ordem: 0, cor: '#000',
    topicos: Object.fromEntries(Array.from({ length: n }, (_, i) => [`${id}${i}`, topico(`${id}${i}`)])),
  });
  const concurso = (dataProva: string): Concurso => ({ id: 'c', nome: 'Petrobras', orgao: '', banca: '', cargo: '', area: '', dataProva, status: 'inscrito', link: '', notaCorte: null, prioridade: 3, criadoEm: '' });

  it('com tempo de sobra, fecha e não sugere cortes', () => {
    const v = viabilidade(concurso('2027-06-01'), [disciplina('a', 2, 10)], GRADE, AGORA)!;
    expect(v.fecha).toBe(true);
    expect(v.cortes).toEqual([]);
  });

  it('sem tempo, não fecha e sugere cortar os de menor prioridade até caber', () => {
    // Prova em 2 semanas: ~ 9 blocos de teoria (60% vai para revisão); 30 tópicos pedem 60 blocos.
    const v = viabilidade(concurso('2026-10-26'), [disciplina('alta', 3, 15), disciplina('baixa', 1, 15)], GRADE, AGORA)!;
    expect(v.fecha).toBe(false);
    expect(v.necessarios).toBe(60);
    const blocosCortados = v.cortes.reduce((t, i) => t + i.blocos, 0);
    expect(v.necessarios - blocosCortados).toBeLessThanOrEqual(v.disponiveis);
    // Os primeiros cortes são da disciplina de peso baixo.
    expect(v.cortes.slice(0, 15).every((i) => i.disciplina.id === 'baixa')).toBe(true);
  });
});
