// Extração de texto de PDFs no navegador com o pdf.js (carregado do CDN só
// quando alguém importa um PDF). O worker roda na própria página: o claude.ai
// não deixa criar Worker a partir de outro domínio, e o pdf.js usa o
// `pdfjsWorker` global quando ele existe.

const VERSAO = '3.11.174';
const FONTES = [
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSAO}/`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSAO}/build/`,
];

interface ItemTexto {
  str: string;
  hasEOL?: boolean;
}
interface PaginaPdf {
  getTextContent(): Promise<{ items: ItemTexto[] }>;
}
interface DocumentoPdf {
  numPages: number;
  getPage(n: number): Promise<PaginaPdf>;
  destroy(): Promise<void>;
}
interface PdfJs {
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<DocumentoPdf> };
}

function carregarScript(src: string): Promise<void> {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => {
      s.remove();
      falha(new Error(src));
    };
    document.head.appendChild(s);
  });
}

let carregando: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  const g = globalThis as { pdfjsLib?: PdfJs; __PDFJS_BASE__?: string };
  if (g.pdfjsLib) return Promise.resolve(g.pdfjsLib);
  carregando ??= (async () => {
    const bases = g.__PDFJS_BASE__ ? [g.__PDFJS_BASE__] : FONTES;
    for (const base of bases) {
      try {
        await carregarScript(`${base}pdf.worker.min.js`);
        await carregarScript(`${base}pdf.min.js`);
        if (g.pdfjsLib) return g.pdfjsLib;
      } catch {
        // tenta o próximo CDN
      }
    }
    carregando = null;
    throw { codigo: 'pdf_indisponivel', mensagem: 'Não consegui carregar o leitor de PDF. Confira a conexão ou cole o texto do edital.' };
  })();
  return carregando;
}

/** Texto do PDF, página por página. PDFs escaneados (só imagem) voltam quase vazios. */
export async function extrairTextoPdf(arquivo: File, aoProgresso?: (pagina: number, total: number) => void): Promise<string> {
  const lib = await pdfjs();
  let doc: DocumentoPdf;
  try {
    doc = await lib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  } catch {
    throw { codigo: 'pdf_invalido', mensagem: 'Não consegui abrir este PDF. Ele pode estar protegido ou corrompido.' };
  }
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const conteudo = await (await doc.getPage(n)).getTextContent();
    paginas.push(conteudo.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join(''));
    aoProgresso?.(n, doc.numPages);
  }
  await doc.destroy();
  return paginas
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
