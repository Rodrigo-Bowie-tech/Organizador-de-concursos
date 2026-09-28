// Oportunidades a partir de um texto colado (página do PCI, notícia, edital):
// a IA do claude.ai lê o texto e devolve a lista; aqui ficam o pedido e a validação.

import type { Oportunidade } from '../dominio/tipos';
import { ehUF, idOportunidade } from './radar.ts';

export function montarPedidoRadar(texto: string, hoje: string): string {
  return `Você extrai concursos públicos brasileiros de páginas de notícias e listagens (como a do PCI Concursos).
Hoje é ${hoje}.

Liste cada concurso ou processo seletivo do texto abaixo. Regras:
- "orgao": nome do órgão ou empresa; "titulo": como o texto chama o concurso.
- "cargos": lista dos cargos citados (ex.: "Engenheiro Eletricista").
- "salario": o maior salário citado, só o número em reais (ex.: 11874.15), ou null.
- "vagas": número total de vagas, ou null se for cadastro reserva ou não disser.
- "uf": sigla do estado; "BR" se for nacional.
- "inscricoesAte": data final das inscrições no formato AAAA-MM-DD, ou null.
- "banca": organizadora, se o texto disser; senão "".
- "link": endereço da notícia ou do edital, se aparecer no texto; senão "".
- Não invente dados que não estão no texto.

Responda somente com um array JSON:
[{"orgao": "", "titulo": "", "cargos": [], "salario": null, "vagas": null, "uf": "SP", "inscricoesAte": null, "banca": "", "link": ""}]

Texto:
"""
${texto}
"""`;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

export function validarOportunidades(resposta: unknown, fonte: string, coletadoEm: string): Oportunidade[] {
  const lista = Array.isArray(resposta) ? resposta : (resposta as { concursos?: unknown })?.concursos;
  if (!Array.isArray(lista)) return [];
  const saida: Oportunidade[] = [];
  for (const item of lista) {
    const r = item as Record<string, unknown>;
    const orgao = typeof r.orgao === 'string' ? r.orgao.trim() : '';
    const titulo = typeof r.titulo === 'string' && r.titulo.trim() ? r.titulo.trim() : orgao;
    if (!orgao && !titulo) continue;
    const uf = typeof r.uf === 'string' && (ehUF(r.uf) || r.uf.toUpperCase() === 'BR') ? r.uf.toUpperCase() : 'BR';
    const data = typeof r.inscricoesAte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.inscricoesAte) ? r.inscricoesAte : null;
    const link = typeof r.link === 'string' && /^https?:\/\//.test(r.link.trim()) ? r.link.trim() : '';
    const o: Oportunidade = {
      id: '',
      titulo,
      orgao: orgao || titulo,
      banca: typeof r.banca === 'string' ? r.banca.trim() : '',
      cargos: Array.isArray(r.cargos) ? r.cargos.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())).map((c) => c.trim()) : [],
      salario: numero(r.salario),
      vagas: numero(r.vagas) === null ? null : Math.round(numero(r.vagas) as number),
      uf,
      inscricoesAte: data,
      link,
      fonte,
      coletadoEm,
    };
    o.id = idOportunidade(o);
    saida.push(o);
  }
  return saida;
}
