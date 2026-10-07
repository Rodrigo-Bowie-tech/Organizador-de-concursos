import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Modal, Progresso, Selecao, Vazio } from '../componentes/ui';
import { formatarDuracao } from '../dominio/datas';
import { cobertura, segundosPorDisciplina } from '../dominio/painel';
import { CORES_DISCIPLINA, TIPO_DISCIPLINA } from '../dominio/rotulos';
import type { Disciplina, TipoDisciplina } from '../dominio/tipos';
import { useApp } from '../estado';

interface Form {
  id?: string;
  nome: string;
  peso: string;
  numQuestoes: string;
  tipo: TipoDisciplina;
  cor: string;
}

function FormDisciplina({ aberto, aoFechar, inicial }: { aberto: boolean; aoFechar: () => void; inicial: Disciplina | null }) {
  const { repo, executar, concursoAtivo, disciplinas } = useApp();
  const [f, setF] = useState<Form>({ nome: '', peso: '1', numQuestoes: '', tipo: 'especifica', cor: CORES_DISCIPLINA[0] });

  useEffect(() => {
    if (!aberto) return;
    setF(
      inicial
        ? { id: inicial.id, nome: inicial.nome, peso: String(inicial.peso), numQuestoes: inicial.numQuestoes?.toString() ?? '', tipo: inicial.tipo, cor: inicial.cor }
        : { nome: '', peso: '1', numQuestoes: '', tipo: 'especifica', cor: CORES_DISCIPLINA[disciplinas.length % CORES_DISCIPLINA.length] },
    );
  }, [aberto, inicial, disciplinas.length]);

  if (!concursoAtivo) return null;
  const valido = f.nome.trim() && Number(f.peso) > 0;

  async function salvar() {
    if (!valido || !concursoAtivo) return;
    const id = await executar(
      () =>
        repo.salvarDisciplina({
          id: f.id,
          concursoId: concursoAtivo.id,
          nome: f.nome.trim(),
          peso: Number(f.peso),
          numQuestoes: f.numQuestoes === '' ? null : Math.max(0, Math.floor(Number(f.numQuestoes))),
          tipo: f.tipo,
          cor: f.cor,
        }),
      inicial ? 'Disciplina atualizada.' : 'Disciplina cadastrada.',
    );
    if (id) aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar disciplina' : 'Nova disciplina'}
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
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo rotulo="Nome" className="sm:col-span-2">
          {(id) => <Entrada id={id} autoFocus required value={f.nome} placeholder="Ex.: Engenharia Elétrica" onChange={(e) => setF({ ...f, nome: e.target.value })} />}
        </Campo>
        <Campo rotulo="Peso na prova">
          {(id) => <Entrada id={id} type="number" min={0.1} step="0.1" value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} />}
        </Campo>
        <Campo rotulo="Nº de questões" dica="Se o edital informar.">
          {(id) => <Entrada id={id} type="number" min={0} value={f.numQuestoes} onChange={(e) => setF({ ...f, numQuestoes: e.target.value })} />}
        </Campo>
        <Campo rotulo="Tipo">
          {(id) => (
            <Selecao id={id} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoDisciplina })}>
              {Object.entries(TIPO_DISCIPLINA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-bold text-suave">Cor</legend>
          <div className="flex flex-wrap gap-1.5">
            {CORES_DISCIPLINA.map((cor) => (
              <button
                key={cor}
                type="button"
                aria-label={`Cor ${cor}`}
                aria-pressed={f.cor === cor}
                onClick={() => setF({ ...f, cor })}
                className="h-7 w-7 rounded-full ring-offset-2 ring-offset-superficie aria-pressed:ring-2 aria-pressed:ring-texto"
                style={{ background: cor }}
              />
            ))}
          </div>
        </fieldset>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export function Disciplinas() {
  const { dados, disciplinas, concursoAtivo, repo, executar, irPara } = useApp();
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Disciplina | null>(null);
  const [excluir, setExcluir] = useState<Disciplina | null>(null);
  const horas = useMemo(() => segundosPorDisciplina(dados.sessoes, Date.now()), [dados.sessoes]);

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Disciplinas" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso antes das disciplinas." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const abrir = (d: Disciplina | null) => {
    setEditando(d);
    setFormAberto(true);
  };
  const pesoTotal = disciplinas.reduce((t, d) => t + d.peso * (d.numQuestoes ?? 1), 0);

  return (
    <>
      <CabecalhoTela
        titulo="Disciplinas"
        subtitulo={concursoAtivo.nome}
        acoes={
          <Botao onClick={() => abrir(null)}>
            <Plus size={18} /> Nova disciplina
          </Botao>
        }
      />

      {!disciplinas.length ? (
        <Vazio
          titulo="Nenhuma disciplina ainda"
          texto="Cadastre as disciplinas com o peso e o número de questões da prova. Os tópicos entram depois, na tela Edital."
          acao={<Botao onClick={() => abrir(null)}>Cadastrar disciplina</Botao>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {disciplinas.map((d) => {
            const cob = cobertura([d]);
            const valor = d.peso * (d.numQuestoes ?? 1);
            return (
              <Cartao key={d.id} className="!p-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: d.cor }} aria-hidden />
                  <div className="min-w-0 flex-1 basis-48">
                    <button type="button" className="text-left font-extrabold hover:text-verde-forte" onClick={() => irPara('edital')}>
                      {d.nome}
                    </button>
                    <p className="numeros text-sm text-suave">
                      {TIPO_DISCIPLINA[d.tipo]} · peso {d.peso.toLocaleString('pt-BR')}
                      {d.numQuestoes !== null && ` · ${d.numQuestoes} questões`}
                      {pesoTotal > 0 && ` · ${Math.round((valor / pesoTotal) * 100)}% da prova`}
                    </p>
                  </div>
                  <div className="numeros grid w-full grid-cols-2 gap-4 text-sm sm:w-auto sm:min-w-72">
                    <div>
                      <p className="text-suave">Estudado</p>
                      <p className="font-extrabold">{formatarDuracao(horas.get(d.id) ?? 0)}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      <p className="text-suave">
                        {cob.total ? `${cob.concluidos}/${cob.total} tópicos` : 'Sem tópicos'}
                      </p>
                      <Progresso rotulo={`Cobertura de ${d.nome}`} fracao={cob.fracao} cor={d.cor} />
                    </div>
                  </div>
                  <div className="flex">
                    <BotaoIcone rotulo={`Editar ${d.nome}`} onClick={() => abrir(d)}>
                      <Pencil size={17} />
                    </BotaoIcone>
                    <BotaoIcone rotulo={`Excluir ${d.nome}`} onClick={() => setExcluir(d)}>
                      <Trash2 size={17} />
                    </BotaoIcone>
                  </div>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      <FormDisciplina aberto={formAberto} aoFechar={() => setFormAberto(false)} inicial={editando} />
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir disciplina?"
        texto={
          <>
            <strong>{excluir?.nome}</strong> e os {Object.keys(excluir?.topicos ?? {}).length} tópicos dela serão apagados.
            As sessões já estudadas continuam no histórico.
          </>
        }
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirDisciplina(excluir.id), 'Disciplina excluída.')}
      />
    </>
  );
}
