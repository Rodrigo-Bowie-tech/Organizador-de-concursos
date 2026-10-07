import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Etiqueta, Modal, Selecao, Vazio } from '../componentes/ui';
import { errosParaRevisar, proximaRevisaoErro } from '../dominio/desempenho';
import { formatarData } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { achatar, caminhoDoTopico } from '../dominio/topicos';
import type { ErroCaderno, MotivoErro } from '../dominio/tipos';
import { useApp } from '../estado';
import { mensagemErroIA } from '../plataforma';

export const MOTIVOS: Record<MotivoErro, string> = {
  falta_conteudo: 'Falta de conteúdo',
  pegadinha: 'Pegadinha',
  desatencao: 'Desatenção',
  interpretacao: 'Interpretação',
};

type Form = Omit<ErroCaderno, 'id' | 'criadoEm' | 'proximaRevisao' | 'revisoesFeitas' | 'explicacaoIA'>;

function ModalErro({ inicial, aoFechar }: { inicial: ErroCaderno | null; aoFechar: () => void }) {
  const { disciplinas, dados, repo, executar } = useApp();
  const vazio: Form = { disciplinaId: disciplinas[0]?.id ?? '', topicoId: null, enunciado: '', minhaResposta: '', respostaCerta: '', motivo: 'falta_conteudo', comentario: '', fonte: '' };
  const [f, setF] = useState<Form>(inicial ?? vazio);
  const opcoes = inicial ? dados.disciplinas.filter((d) => d.concursoId === dados.disciplinas.find((x) => x.id === inicial.disciplinaId)?.concursoId) : disciplinas;
  const disciplina = dados.disciplinas.find((d) => d.id === f.disciplinaId);
  const valido = Boolean(f.disciplinaId && f.enunciado.trim() && f.respostaCerta.trim());

  async function salvar() {
    const hoje = hojeSP();
    const ok = await executar(async () => {
      await repo.salvarErro({
        ...f,
        enunciado: f.enunciado.trim(),
        id: inicial?.id,
        criadoEm: inicial?.criadoEm ?? hoje,
        revisoesFeitas: inicial?.revisoesFeitas ?? [],
        proximaRevisao: inicial ? inicial.proximaRevisao : proximaRevisaoErro(hoje, []),
        explicacaoIA: inicial?.explicacaoIA ?? '',
      });
      return true;
    }, inicial ? 'Erro atualizado.' : 'Erro anotado. Revisão em 3 dias.');
    if (ok) aoFechar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar erro' : 'Anotar erro'}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!valido} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Disciplina">
          {(id) => (
            <Selecao id={id} value={f.disciplinaId} onChange={(e) => setF({ ...f, disciplinaId: e.target.value, topicoId: null })}>
              {opcoes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Tópico">
          {(id) => (
            <Selecao id={id} value={f.topicoId ?? ''} onChange={(e) => setF({ ...f, topicoId: e.target.value || null })}>
              <option value="">Disciplina inteira</option>
              {disciplina &&
                achatar(disciplina.topicos).map((l) => (
                  <option key={l.topico.id} value={l.topico.id}>
                    {'  '.repeat(l.nivel)}
                    {l.numero} {l.topico.titulo}
                  </option>
                ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Enunciado ou resumo da questão" className="sm:col-span-2">
          {(id) => <AreaTexto id={id} maxLength={3000} value={f.enunciado} onChange={(e) => setF({ ...f, enunciado: e.target.value })} />}
        </Campo>
        <Campo rotulo="Minha resposta">
          {(id) => <Entrada id={id} value={f.minhaResposta} onChange={(e) => setF({ ...f, minhaResposta: e.target.value })} />}
        </Campo>
        <Campo rotulo="Resposta certa">
          {(id) => <Entrada id={id} value={f.respostaCerta} onChange={(e) => setF({ ...f, respostaCerta: e.target.value })} />}
        </Campo>
        <Campo rotulo="Por que errei">
          {(id) => (
            <Selecao id={id} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value as MotivoErro })}>
              {Object.entries(MOTIVOS).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Fonte">
          {(id) => <Entrada id={id} value={f.fonte} placeholder="QConcursos, prova FCC 2023…" onChange={(e) => setF({ ...f, fonte: e.target.value })} />}
        </Campo>
        <Campo rotulo="Comentário" className="sm:col-span-2">
          {(id) => <AreaTexto id={id} className="min-h-16" maxLength={1500} value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} />}
        </Campo>
      </div>
    </Modal>
  );
}

function CartaoErro({ e, revisar, aoEditar, aoExcluir }: { e: ErroCaderno; revisar?: boolean; aoEditar: () => void; aoExcluir: () => void }) {
  const { dados, recursos, repo, executar, avisar } = useApp();
  const [mostrar, setMostrar] = useState(!revisar);
  const [explicando, setExplicando] = useState(false);
  const d = dados.disciplinas.find((x) => x.id === e.disciplinaId);
  const caminho = d && e.topicoId && d.topicos[e.topicoId] ? caminhoDoTopico(d.topicos, e.topicoId) : [];

  async function explicar() {
    if (!recursos.ia || !d) return;
    setExplicando(true);
    try {
      const { text } = await recursos.ia(
        `Você é professor de cursinho para concursos. Explique, em português do Brasil e em até 8 frases, por que a resposta certa é a certa e onde está o erro da resposta do aluno. Dê uma dica para não errar de novo.\n\nDisciplina: ${d.nome}${caminho.length ? `\nTópico: ${caminho.join(' > ')}` : ''}\nQuestão: ${e.enunciado}\nResposta do aluno: ${e.minhaResposta || '(não informada)'}\nResposta certa: ${e.respostaCerta}${e.comentario ? `\nObservação do aluno: ${e.comentario}` : ''}`,
        { cache: false },
      );
      await repo.salvarErro({ ...e, explicacaoIA: text.trim() });
      setMostrar(true);
    } catch (err) {
      avisar(mensagemErroIA((err as { code?: string }).code), 'erro');
    } finally {
      setExplicando(false);
    }
  }

  return (
    <li className="grid grid-cols-1 gap-2 border-t border-borda py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: d?.cor }} aria-hidden />
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm text-suave">
            {[d?.nome, ...caminho].filter(Boolean).join(' › ')} · {MOTIVOS[e.motivo]}
            {e.fonte && ` · ${e.fonte}`}
          </p>
          <p className="font-bold whitespace-pre-line">{e.enunciado}</p>
        </div>
        <Etiqueta tom={e.proximaRevisao ? (e.proximaRevisao <= hojeSP() ? 'alerta' : 'neutro') : 'verde'}>
          {e.proximaRevisao ? `revisão ${formatarData(e.proximaRevisao)}` : 'revisado'}
        </Etiqueta>
        <BotaoIcone rotulo="Editar erro" onClick={aoEditar}>
          <Pencil size={16} />
        </BotaoIcone>
        <BotaoIcone rotulo="Excluir erro" onClick={aoExcluir}>
          <Trash2 size={16} />
        </BotaoIcone>
      </div>
      {mostrar ? (
        <div className="grid grid-cols-1 gap-1 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
          {e.minhaResposta && (
            <p>
              <span className="font-bold text-perigo">Minha resposta:</span> {e.minhaResposta}
            </p>
          )}
          <p>
            <span className="font-bold text-ok">Resposta certa:</span> {e.respostaCerta}
          </p>
          {e.comentario && <p className="text-suave whitespace-pre-line">{e.comentario}</p>}
          {e.explicacaoIA && (
            <p className="mt-1 whitespace-pre-line">
              <span className="font-bold text-roxo">Explicação (IA):</span> {e.explicacaoIA}
            </p>
          )}
        </div>
      ) : (
        <Botao tamanho="pequeno" variante="secundario" className="justify-self-start" onClick={() => setMostrar(true)}>
          Mostrar resposta
        </Botao>
      )}
      <div className="flex flex-wrap gap-2">
        {revisar && mostrar && (
          <>
            <Botao tamanho="pequeno" onClick={() => void executar(async () => { const n = await repo.revisarErroCaderno(e, true); avisar(n.proximaRevisao ? `Próxima revisão em ${formatarData(n.proximaRevisao)}.` : 'Erro revisado duas vezes: saiu da fila.'); })}>
              Acertei
            </Botao>
            <Botao tamanho="pequeno" variante="secundario" onClick={() => void executar(() => repo.revisarErroCaderno(e, false), 'Volta em 3 dias.')}>
              Errei de novo
            </Botao>
          </>
        )}
        {recursos.ia && !e.explicacaoIA && (
          <Botao tamanho="pequeno" variante="fantasma" disabled={explicando} onClick={() => void explicar()}>
            <Sparkles size={15} /> {explicando ? 'Explicando…' : 'Explicar com IA'}
          </Botao>
        )}
      </div>
    </li>
  );
}

export function CadernoErros() {
  const { dados, disciplinas, concursoAtivo, repo, executar, irPara } = useApp();
  const [filtroDisc, setFiltroDisc] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [editando, setEditando] = useState<ErroCaderno | null | 'novo'>(null);
  const [excluir, setExcluir] = useState<ErroCaderno | null>(null);
  const hoje = hojeSP();

  if (!concursoAtivo || !disciplinas.length) {
    return (
      <>
        <CabecalhoTela titulo="Caderno de erros" />
        <Vazio titulo="Cadastre as disciplinas primeiro" texto="Cada erro fica ligado a uma disciplina e, se quiser, a um tópico." acao={<Botao onClick={() => irPara('disciplinas')}>Ir para Disciplinas</Botao>} />
      </>
    );
  }

  const ids = new Set(disciplinas.map((d) => d.id));
  const doConcurso = dados.erros.filter((e) => ids.has(e.disciplinaId));
  const filtrados = doConcurso.filter((e) => (!filtroDisc || e.disciplinaId === filtroDisc) && (!filtroMotivo || e.motivo === filtroMotivo));
  const paraHoje = errosParaRevisar(filtrados, hoje);
  const outros = filtrados.filter((e) => !paraHoje.includes(e));
  const porMotivo = Object.keys(MOTIVOS).map((m) => [m, doConcurso.filter((e) => e.motivo === m).length] as const).filter(([, n]) => n);

  return (
    <>
      <CabecalhoTela
        titulo="Caderno de erros"
        subtitulo={`${doConcurso.length} erros anotados${porMotivo.length ? ` · ${porMotivo.map(([m, n]) => `${MOTIVOS[m as MotivoErro].toLowerCase()} ${n}`).join(', ')}` : ''}`}
        acoes={
          <Botao onClick={() => setEditando('novo')}>
            <Plus size={18} /> Anotar erro
          </Botao>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Selecao aria-label="Filtrar por disciplina" value={filtroDisc} onChange={(e) => setFiltroDisc(e.target.value)}>
          <option value="">Todas as disciplinas</option>
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </Selecao>
        <Selecao aria-label="Filtrar por motivo" value={filtroMotivo} onChange={(e) => setFiltroMotivo(e.target.value)}>
          <option value="">Todos os motivos</option>
          {Object.entries(MOTIVOS).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </div>

      {!doConcurso.length ? (
        <Vazio
          titulo="Nenhum erro anotado"
          texto="Anote as questões que errou (ou mande da prática com IA). Cada erro volta para revisão em 3 e em 14 dias."
          acao={<Botao onClick={() => setEditando('novo')}>Anotar erro</Botao>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {paraHoje.length > 0 && (
            <Cartao titulo={`Para revisar hoje (${paraHoje.length})`}>
              <ul>
                {paraHoje.map((e) => (
                  <CartaoErro key={e.id} e={e} revisar aoEditar={() => setEditando(e)} aoExcluir={() => setExcluir(e)} />
                ))}
              </ul>
            </Cartao>
          )}
          {outros.length > 0 && (
            <Cartao titulo={`Todos (${outros.length})`}>
              <ul>
                {outros.map((e) => (
                  <CartaoErro key={e.id} e={e} aoEditar={() => setEditando(e)} aoExcluir={() => setExcluir(e)} />
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      )}

      {editando && <ModalErro inicial={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir erro?"
        texto="O erro sai do caderno e das revisões."
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirErro(excluir), 'Erro excluído.')}
      />
    </>
  );
}
