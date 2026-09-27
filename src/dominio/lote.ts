// Cadastro de tópicos em lote: cola uma lista, um tópico por linha.
// O nível vem da numeração ("1.2.3 Tópico") ou, sem numeração, do recuo
// (tab ou 2 espaços). Marcadores como "-", "•" e "*" são ignorados.

import type { Id, Topico } from './tipos';

export interface ItemLote {
  titulo: string;
  nivel: number;
}

const NUMERACAO = /^(\d+(?:\.\d+)*)\.?\s*[-–—:)]?\s+/;
const MARCADOR = /^[-–—•*·▪◦]\s+/;

export function lerLote(texto: string): ItemLote[] {
  const itens: ItemLote[] = [];
  for (const linhaBruta of texto.replace(/\r/g, '').split('\n')) {
    if (!linhaBruta.trim()) continue;
    const recuo = linhaBruta.match(/^[\t ]*/)?.[0] ?? '';
    const nivelRecuo = [...recuo].reduce((n, c) => n + (c === '\t' ? 2 : 1), 0) >> 1;

    let resto = linhaBruta.trim();
    let nivel = nivelRecuo;
    const numero = resto.match(NUMERACAO);
    if (numero) {
      nivel = numero[1].split('.').length - 1;
      resto = resto.slice(numero[0].length);
    } else {
      resto = resto.replace(MARCADOR, '');
    }

    const titulo = resto.replace(/[;.,\s]+$/, '').trim();
    if (!titulo) continue;

    // Um item não pode pular níveis em relação ao anterior.
    const anterior = itens[itens.length - 1];
    const maximo = anterior ? anterior.nivel + 1 : 0;
    itens.push({ titulo, nivel: Math.min(nivel, maximo) });
  }
  return itens;
}

/**
 * Converte os itens em tópicos, pendurados em `paiRaiz` (ou na raiz da
 * disciplina). `ordemInicial` continua a numeração dos irmãos já existentes.
 */
export function topicosDoLote(
  itens: ItemLote[],
  novoId: () => Id,
  paiRaiz: Id | null = null,
  ordemInicial = 0,
): Topico[] {
  const topicos: Topico[] = [];
  const pilha: Id[] = []; // pilha[n] = último tópico visto no nível n
  const ordens = new Map<Id | null, number>([[paiRaiz, ordemInicial]]);

  for (const item of itens) {
    const paiId = item.nivel === 0 ? paiRaiz : pilha[item.nivel - 1];
    const ordem = ordens.get(paiId) ?? 0;
    ordens.set(paiId, ordem + 1);
    const t: Topico = {
      id: novoId(),
      paiId,
      titulo: item.titulo,
      ordem,
      status: 'nao_iniciado',
      autoavaliacao: null,
      incidencia: null,
      grupoEquivalenciaId: null,
    };
    topicos.push(t);
    pilha[item.nivel] = t.id;
    pilha.length = item.nivel + 1;
  }
  return topicos;
}
