// Operações sobre a árvore de tópicos de uma disciplina.

import type { Id, Topico } from './tipos';

export function filhos(topicos: Record<Id, Topico>, paiId: Id | null): Topico[] {
  return Object.values(topicos)
    .filter((t) => t.paiId === paiId)
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/** O tópico e todos os seus descendentes. */
export function comDescendentes(topicos: Record<Id, Topico>, id: Id): Set<Id> {
  const ids = new Set<Id>([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of Object.values(topicos)) {
      if (t.paiId && ids.has(t.paiId) && !ids.has(t.id)) {
        ids.add(t.id);
        mudou = true;
      }
    }
  }
  return ids;
}

export interface LinhaArvore {
  topico: Topico;
  nivel: number;
  /** Numeração de exibição: 1, 1.1, 1.1.2... */
  numero: string;
  temFilhos: boolean;
}

/** Árvore achatada na ordem de leitura, com nível e numeração. */
export function achatar(topicos: Record<Id, Topico>): LinhaArvore[] {
  const linhas: LinhaArvore[] = [];
  const visitar = (paiId: Id | null, nivel: number, prefixo: string) => {
    filhos(topicos, paiId).forEach((t, i) => {
      const numero = prefixo ? `${prefixo}.${i + 1}` : String(i + 1);
      const sub = filhos(topicos, t.id);
      linhas.push({ topico: t, nivel, numero, temFilhos: sub.length > 0 });
      visitar(t.id, nivel + 1, numero);
    });
  };
  visitar(null, 0, '');
  return linhas;
}

/** Próxima ordem livre entre os filhos de `paiId`. */
export function proximaOrdem(topicos: Record<Id, Topico>, paiId: Id | null): number {
  const irmaos = filhos(topicos, paiId);
  return irmaos.length ? irmaos[irmaos.length - 1].ordem + 1 : 0;
}

/**
 * Troca a ordem do tópico com o irmão acima (-1) ou abaixo (+1). Devolve as
 * novas ordens a gravar, ou `null` se já está na ponta.
 */
export function mover(
  topicos: Record<Id, Topico>,
  id: Id,
  direcao: -1 | 1,
): Record<Id, number> | null {
  const t = topicos[id];
  if (!t) return null;
  const irmaos = filhos(topicos, t.paiId);
  const i = irmaos.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (j < 0 || j >= irmaos.length) return null;
  // Renumera os irmãos para evitar empates de ordem herdados.
  const novas: Record<Id, number> = {};
  const ordenados = irmaos.slice();
  [ordenados[i], ordenados[j]] = [ordenados[j], ordenados[i]];
  ordenados.forEach((x, k) => {
    if (x.ordem !== k) novas[x.id] = k;
  });
  return novas;
}

/** Títulos do tópico mais geral ao próprio tópico: ["Máquinas elétricas", "Transformadores"]. */
export function caminhoDoTopico(topicos: Record<Id, Topico>, id: Id): string[] {
  const caminho: string[] = [];
  let atual: Topico | undefined = topicos[id];
  while (atual && caminho.length < 20) {
    caminho.unshift(atual.titulo);
    atual = atual.paiId ? topicos[atual.paiId] : undefined;
  }
  return caminho;
}
