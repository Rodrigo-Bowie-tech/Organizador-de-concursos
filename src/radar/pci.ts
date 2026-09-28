// Fonte PCI Concursos: parser das páginas públicas de listagem
// (https://www.pciconcursos.com.br/concursos/<região>/). Isolado aqui porque o
// layout do site pode mudar: os testes rodam sobre HTML salvo em
// tests/unit/fixtures/. O parser é tolerante: cada item é o trecho entre dois
// links de notícia, e os campos saem do texto (UF, vagas, salário, datas).

import type { Oportunidade } from '../dominio/tipos';
import { ehUF, idOportunidade, lerData, lerSalario, lerVagas } from './radar.ts';
import type { FonteConcursos } from './radar.ts';

const LINK = /<a\s[^>]*href="(https?:\/\/(?:www\.)?pciconcursos\.com\.br\/noticias\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function texto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|span)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function atributo(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`${nome}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function separarCargos(linha: string): string[] {
  return linha
    .replace(/\s+e outros?$/i, '')
    .split(/,|;|\s+e\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2 && !/vaga|R\$|\d{2}\/\d{2}\/\d{4}/i.test(c));
}

export function extrairPci(html: string, _url: string, coletadoEm: string): Oportunidade[] {
  const achados = [...html.matchAll(LINK)];
  const saida = new Map<string, Oportunidade>();
  achados.forEach((m, i) => {
    const inicio = m.index ?? 0;
    const fim = achados[i + 1]?.index ?? Math.min(html.length, inicio + 4000);
    const trecho = html.slice(inicio, fim);
    const link = m[1];
    const tituloAttr = atributo(m[0], 'title');
    const titulo = (tituloAttr ?? texto(m[2])).trim();
    if (!titulo) return;

    const linhas = texto(trecho.slice(m[0].length)).split('\n');
    const ufTitulo = titulo.match(/[-–]\s*([A-Z]{2})\s*$/)?.[1];
    const uf =
      linhas.find((l) => /^[A-Z]{2}$/.test(l) && ehUF(l)) ??
      (ufTitulo && ehUF(ufTitulo) ? ufTitulo : null) ??
      (/nacional/i.test(trecho) ? 'BR' : '');
    const detalhes = linhas.filter((l) => l !== uf);
    const linhaCargos = detalhes.find((l) => !/vaga|R\$|\d{2}\/\d{2}\/\d{4}|^(superior|m[ée]dio|fundamental|t[ée]cnico)/i.test(l)) ?? '';
    const tudo = detalhes.join(' ');
    const o: Oportunidade = {
      id: '',
      titulo,
      orgao: titulo.replace(/\s*[-–]\s*[A-Z]{2}\s*$/, ''),
      banca: tudo.match(/banca:?\s*([A-ZÀ-Úa-zà-ú0-9 ./-]{2,40}?)(?:\n|$|\s{2}|,)/i)?.[1]?.trim() ?? '',
      cargos: separarCargos(linhaCargos),
      salario: lerSalario(tudo),
      vagas: lerVagas(tudo),
      uf: uf || 'BR',
      inscricoesAte: lerData(tudo),
      link,
      fonte: 'PCI Concursos',
      coletadoEm,
    };
    o.id = idOportunidade(o);
    saida.set(o.id, o);
  });
  return [...saida.values()];
}

export const fontePci: FonteConcursos = {
  id: 'pci',
  nome: 'PCI Concursos',
  paginas: ['https://www.pciconcursos.com.br/concursos/sudeste/', 'https://www.pciconcursos.com.br/concursos/nacional/'],
  extrair: extrairPci,
};

/** O caminho é permitido pelo robots.txt para qualquer agente (`User-agent: *`)? */
export function permitidoPeloRobots(robots: string, caminho: string): boolean {
  let noGrupoGeral = false;
  const bloqueios: string[] = [];
  const liberados: string[] = [];
  for (const bruta of robots.split(/\r?\n/)) {
    const linha = bruta.replace(/#.*/, '').trim();
    const [chave, ...resto] = linha.split(':');
    const valor = resto.join(':').trim();
    if (!chave) continue;
    if (/^user-agent$/i.test(chave)) noGrupoGeral = valor === '*';
    else if (noGrupoGeral && /^disallow$/i.test(chave) && valor) bloqueios.push(valor);
    else if (noGrupoGeral && /^allow$/i.test(chave) && valor) liberados.push(valor);
  }
  const casa = (regra: string) => caminho.startsWith(regra.replace(/\*$/, ''));
  const maiorBloqueio = Math.max(-1, ...bloqueios.filter(casa).map((r) => r.length));
  const maiorLiberado = Math.max(-1, ...liberados.filter(casa).map((r) => r.length));
  return maiorBloqueio < 0 || maiorLiberado >= maiorBloqueio;
}
