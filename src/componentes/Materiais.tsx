import { BookOpen, FileText, Link2, Pencil, PlayCircle, StickyNote, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { achatar } from '../dominio/topicos';
import type { Id, Material, TipoMaterial } from '../dominio/tipos';
import { useApp } from '../estado';
import { AreaTexto, Botao, BotaoIcone, Campo, Confirmar, Entrada, Modal, Selecao, useAoAbrir } from './ui';

export const TIPOS_MATERIAL: Record<TipoMaterial, { rotulo: string; icone: LucideIcon }> = {
  pdf: { rotulo: 'PDF / apostila', icone: FileText },
  video: { rotulo: 'Videoaula', icone: PlayCircle },
  link: { rotulo: 'Link', icone: Link2 },
  livro: { rotulo: 'Livro', icone: BookOpen },
  resumo: { rotulo: 'Resumo / anotação', icone: StickyNote },
};

/** Endereço para abrir o material: o PDF enviado ou o link. */
export function enderecoMaterial(m: Material): string | null {
  if (m.arquivoId) return `/_blob/${m.arquivoId}`;
  return m.url || null;
}

function normalizarUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Materiais de um tópico, incluindo os gerais da disciplina. */
export function materiaisDe(materiais: Material[], disciplinaId: Id | null, topicoId: Id | null): Material[] {
  if (!disciplinaId) return [];
  return materiais.filter((m) => m.disciplinaId === disciplinaId && (m.topicoId === topicoId || m.topicoId === null));
}

export function ListaMateriais({
  materiais,
  aoEditar,
  aoExcluir,
  vazio = 'Nenhum material cadastrado.',
}: {
  materiais: Material[];
  aoEditar?: (m: Material) => void;
  aoExcluir?: (m: Material) => void;
  vazio?: string;
}) {
  if (!materiais.length) return <p className="text-sm text-suave">{vazio}</p>;
  return (
    <ul className="grid grid-cols-1 gap-1">
      {materiais.map((m) => {
        const { icone: Icone, rotulo } = TIPOS_MATERIAL[m.tipo];
        const href = enderecoMaterial(m);
        return (
          <li key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-superficie-2">
            <Icone size={18} className="mt-0.5 shrink-0 text-verde-forte" aria-label={rotulo} />
            <div className="min-w-0 flex-1">
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="font-bold text-verde-forte underline decoration-verde/40 underline-offset-2 hover:decoration-verde">
                  {m.titulo}
                </a>
              ) : (
                <span className="font-bold">{m.titulo}</span>
              )}
              {(m.trecho || m.arquivoNome) && (
                <span className="text-sm text-suave"> · {[m.trecho, m.arquivoNome].filter(Boolean).join(' · ')}</span>
              )}
              {m.observacao && <p className="text-sm whitespace-pre-line text-suave">{m.observacao}</p>}
            </div>
            {aoEditar && (
              <BotaoIcone rotulo={`Editar ${m.titulo}`} onClick={() => aoEditar(m)}>
                <Pencil size={15} />
              </BotaoIcone>
            )}
            {aoExcluir && (
              <BotaoIcone rotulo={`Excluir ${m.titulo}`} onClick={() => aoExcluir(m)}>
                <Trash2 size={15} />
              </BotaoIcone>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Form = {
  disciplinaId: Id;
  topicoId: Id | null;
  tipo: TipoMaterial;
  titulo: string;
  url: string;
  trecho: string;
  observacao: string;
};

/** Cadastro e edição de um material. */
export function ModalMaterial({
  aberto,
  aoFechar,
  inicial,
  disciplinaId,
  topicoId,
}: {
  aberto: boolean;
  aoFechar: () => void;
  inicial?: Material | null;
  disciplinaId?: Id | null;
  topicoId?: Id | null;
}) {
  const { disciplinas, dados, repo, executar, recursos } = useApp();
  const [f, setF] = useState<Form>({ disciplinaId: '', topicoId: null, tipo: 'link', titulo: '', url: '', trecho: '', observacao: '' });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  useAoAbrir(
    aberto,
    () => {
      setArquivo(null);
      setF(
        inicial
          ? { disciplinaId: inicial.disciplinaId, topicoId: inicial.topicoId, tipo: inicial.tipo, titulo: inicial.titulo, url: inicial.url, trecho: inicial.trecho, observacao: inicial.observacao }
          : { disciplinaId: disciplinaId ?? disciplinas[0]?.id ?? '', topicoId: topicoId ?? null, tipo: 'link', titulo: '', url: '', trecho: '', observacao: '' },
      );
    },
    inicial,
  );
  const mudar = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  // Na edição, a disciplina pode ser de outro concurso: procura em todas.
  const opcoesDisciplina = inicial ? dados.disciplinas.filter((d) => d.concursoId === dados.disciplinas.find((x) => x.id === inicial.disciplinaId)?.concursoId) : disciplinas;
  const disciplina = dados.disciplinas.find((d) => d.id === f.disciplinaId);
  const linhas = disciplina ? achatar(disciplina.topicos) : [];
  const podeEnviar = Boolean(recursos.arquivos && repo.arquivos);
  const valido = Boolean(f.disciplinaId && f.titulo.trim());

  async function salvar() {
    if (!valido) return;
    setEnviando(true);
    const ok = await executar(async () => {
      let arquivoId = inicial?.arquivoId ?? null;
      let arquivoNome = inicial?.arquivoNome ?? null;
      if (arquivo && repo.arquivos) {
        if (arquivo.size > 20 * 1024 * 1024) throw { mensagem: 'O arquivo passa de 20 MB, o limite do app.' };
        try {
          arquivoId = (await repo.arquivos.enviar(arquivo)).id;
        } catch {
          throw { mensagem: 'Não foi possível enviar o arquivo. Confira se é um PDF de até 20 MB e tente de novo.' };
        }
        arquivoNome = arquivo.name;
      }
      await repo.salvarMaterial({
        id: inicial?.id,
        criadoEm: inicial?.criadoEm,
        disciplinaId: f.disciplinaId,
        topicoId: f.topicoId,
        tipo: f.tipo,
        titulo: f.titulo.trim(),
        url: normalizarUrl(f.url),
        arquivoId,
        arquivoNome,
        trecho: f.trecho.trim(),
        observacao: f.observacao.trim(),
      });
      // Trocou o PDF: o antigo não é mais usado.
      if (arquivo && inicial?.arquivoId && inicial.arquivoId !== arquivoId) await repo.arquivos?.remover(inicial.arquivoId).catch(() => undefined);
      return true;
    }, inicial ? 'Material atualizado.' : 'Material adicionado.');
    setEnviando(false);
    if (ok) aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar material' : 'Adicionar material'}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!valido || enviando} onClick={() => void salvar()}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo rotulo="Disciplina">
          {(id) => (
            <Selecao id={id} value={f.disciplinaId} onChange={(e) => mudar({ disciplinaId: e.target.value, topicoId: null })}>
              {opcoesDisciplina.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Tópico">
          {(id) => (
            <Selecao id={id} value={f.topicoId ?? ''} onChange={(e) => mudar({ topicoId: e.target.value || null })}>
              <option value="">Disciplina inteira</option>
              {linhas.map((l) => (
                <option key={l.topico.id} value={l.topico.id}>
                  {'  '.repeat(l.nivel)}
                  {l.numero} {l.topico.titulo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Tipo">
          {(id) => (
            <Selecao id={id} value={f.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoMaterial })}>
              {Object.entries(TIPOS_MATERIAL).map(([v, { rotulo }]) => (
                <option key={v} value={v}>
                  {rotulo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Título">
          {(id) => <Entrada id={id} required value={f.titulo} placeholder="Ex.: Aula 01 - Circuitos" onChange={(e) => mudar({ titulo: e.target.value })} />}
        </Campo>
        <Campo rotulo="Link" className="sm:col-span-2" dica={f.tipo === 'pdf' && podeEnviar ? 'Ou envie o arquivo abaixo.' : undefined}>
          {(id) => <Entrada id={id} type="url" inputMode="url" value={f.url} placeholder="https://" onChange={(e) => mudar({ url: e.target.value })} />}
        </Campo>
        {f.tipo === 'pdf' &&
          (podeEnviar ? (
            <Campo
              rotulo="Arquivo PDF"
              className="sm:col-span-2"
              dica={inicial?.arquivoNome ? `Atual: ${inicial.arquivoNome}. Escolha outro para substituir.` : 'Até 20 MB. Fica guardado no app.'}
            >
              {(id) => <Entrada id={id} type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />}
            </Campo>
          ) : (
            <p className="text-sm text-suave sm:col-span-2">Enviar PDF só funciona no app do claude.ai. Aqui, use um link (Drive, site do curso…).</p>
          ))}
        <Campo rotulo="Trecho" dica="Páginas, aula, minuto…">
          {(id) => <Entrada id={id} value={f.trecho} placeholder="p. 45–80" onChange={(e) => mudar({ trecho: e.target.value })} />}
        </Campo>
        <Campo rotulo="Observação">
          {(id) => <AreaTexto id={id} className="min-h-10" maxLength={500} value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />}
        </Campo>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/** Materiais de um tópico, com adicionar, editar e excluir. */
export function PainelMateriais({ disciplinaId, topicoId }: { disciplinaId: Id; topicoId: Id | null }) {
  const { dados, repo, executar } = useApp();
  const [editando, setEditando] = useState<Material | null>(null);
  const [novo, setNovo] = useState(false);
  const [excluir, setExcluir] = useState<Material | null>(null);
  const lista = materiaisDe(dados.materiais, disciplinaId, topicoId);

  return (
    <div className="grid grid-cols-1 gap-2">
      <ListaMateriais materiais={lista} aoEditar={setEditando} aoExcluir={setExcluir} vazio="Nenhum material para este tópico ainda." />
      <Botao tamanho="pequeno" variante="secundario" className="justify-self-start" onClick={() => setNovo(true)}>
        Adicionar material
      </Botao>
      <ModalMaterial
        aberto={novo || Boolean(editando)}
        aoFechar={() => {
          setNovo(false);
          setEditando(null);
        }}
        inicial={editando}
        disciplinaId={disciplinaId}
        topicoId={topicoId}
      />
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir material?"
        texto={excluir && <><strong>{excluir.titulo}</strong> sai da biblioteca{excluir.arquivoId ? ' e o PDF enviado é apagado' : ''}.</>}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.removerMaterial(excluir), 'Material excluído.')}
      />
    </div>
  );
}
