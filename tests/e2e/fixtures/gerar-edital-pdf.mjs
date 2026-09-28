// Gera tests/e2e/fixtures/edital-exemplo.pdf: um PDF mínimo, com texto, para
// testar a importação de edital. Uso: node tests/e2e/fixtures/gerar-edital-pdf.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const linhas = [
  'EDITAL DE ABERTURA N 01/2026 - FUNDACAO FLORESTAL',
  'SUMARIO: ANEXO II - Conteudo Programatico',
  'ANEXO I',
  'QUADRO DE PROVAS: Lingua Portuguesa 20 questoes peso 1; Conhecimentos Especificos 40 questoes peso 2.',
  'ANEXO II',
  'CONTEUDO PROGRAMATICO',
  'LINGUA PORTUGUESA: Interpretacao de texto. Ortografia oficial. Crase. Concordancia verbal e nominal.',
  'Regencia verbal e nominal. Colocacao pronominal. Pontuacao. Classes de palavras. Semantica.',
  'CONHECIMENTOS ESPECIFICOS - ENGENHEIRO ELETRICISTA:',
  '1. Circuitos eletricos. 1.1 Leis de Kirchhoff. 1.2 Circuitos trifasicos.',
  '2. Maquinas eletricas. 2.1 Transformadores. 2.2 Motores de inducao.',
  '3. Protecao de sistemas eletricos. 4. Instalacoes eletricas de baixa tensao (NBR 5410).',
  'ANEXO III',
  'MODELO DE REQUERIMENTO',
];

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const conteudo = ['BT', '/F1 10 Tf', '40 800 Td', '14 TL', ...linhas.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');

const objetos = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(conteudo)} >>\nstream\n${conteudo}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objetos.forEach((o, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'edital-exemplo.pdf'), pdf);
console.log('edital-exemplo.pdf gerado');
