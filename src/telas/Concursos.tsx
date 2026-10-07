import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Etiqueta, Modal, Progresso, Selecao, Vazio } from '../componentes/ui';
import { diasEntre, formatarData } from '../dominio/datas';
import { cobertura, hojeSP } from '../dominio/painel';
import { STATUS_CONCURSO } from '../dominio/rotulos';
import type { Concurso, StatusConcurso } from '../dominio/tipos';
import { useApp } from '../estado';

type Form = Omit<Concurso, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string };

const VAZIO: Form = {
  nome: '',
  orgao: '',
  banca: '',
  cargo: '',
  area: 'Engenharia Elétrica',
  dataProva: null,
  status: 'previsto',
  link: '',
  notaCorte: null,
  prioridade: 3,
};

function FormConcurso({ aberto, aoFechar, inicial }: { aberto: boolean; aoFechar: () => void; inicial: Concurso | null }) {
  const { repo, executar, escolherConcurso } = useApp();
  const [f, setF] = useState<Form>(VAZIO);
  useEffect(() => {
    if (aberto) setF(inicial ? { ...inicial } : VAZIO);
  }, [aberto, inicial]);
  const mudar = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    if (!f.nome.trim()) return;
    const id = await executar(
      () => repo.salvarConcurso({ ...f, nome: f.nome.trim() }),
      inicial ? 'Concurso atualizado.' : 'Concurso cadastrado.',
    );
    if (id) {
      if (!inicial) escolherConcurso(id);
      aoFechar();
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar concurso' : 'Novo concurso'}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!f.nome.trim()} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => void salvar(e)}>
        <Campo rotulo="Nome do concurso" className="sm:col-span-2">
          {(id) => <Entrada id={id} required autoFocus value={f.nome} placeholder="Ex.: Fundação Florestal SP" onChange={(e) => mudar({ nome: e.target.value })} />}
        </Campo>
        <Campo rotulo="Órgão">
          {(id) => <Entrada id={id} value={f.orgao} onChange={(e) => mudar({ orgao: e.target.value })} />}
        </Campo>
        <Campo rotulo="Banca">
          {(id) => <Entrada id={id} value={f.banca} placeholder="Ex.: FCC" onChange={(e) => mudar({ banca: e.target.value })} />}
        </Campo>
        <Campo rotulo="Cargo">
          {(id) => <Entrada id={id} value={f.cargo} onChange={(e) => mudar({ cargo: e.target.value })} />}
        </Campo>
        <Campo rotulo="Área">
          {(id) => <Entrada id={id} value={f.area} onChange={(e) => mudar({ area: e.target.value })} />}
        </Campo>
        <Campo rotulo="Data da prova" dica="Deixe em branco se ainda não saiu.">
          {(id) => <Entrada id={id} type="date" value={f.dataProva ?? ''} onChange={(e) => mudar({ dataProva: e.target.value || null })} />}
        </Campo>
        <Campo rotulo="Situação">
          {(id) => (
            <Selecao id={id} value={f.status} onChange={(e) => mudar({ status: e.target.value as StatusConcurso })}>
              {Object.entries(STATUS_CONCURSO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Prioridade">
          {(id) => (
            <Selecao id={id} value={f.prioridade} onChange={(e) => mudar({ prioridade: Number(e.target.value) })}>
              <option value={5}>5 · máxima</option>
              <option value={4}>4 · alta</option>
              <option value={3}>3 · média</option>
              <option value={2}>2 · baixa</option>
              <option value={1}>1 · mínima</option>
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Nota de corte histórica" dica="Opcional.">
          {(id) => (
            <Entrada id={id} type="number" step="0.01" min={0} value={f.notaCorte ?? ''}
              onChange={(e) => mudar({ notaCorte: e.target.value === '' ? null : Number(e.target.value) })} />
          )}
        </Campo>
        <Campo rotulo="Link do edital ou da página do concurso" className="sm:col-span-2">
          {(id) => <Entrada id={id} type="url" value={f.link} placeholder="https://" onChange={(e) => mudar({ link: e.target.value })} />}
        </Campo>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export function Concursos() {
  const { dados, repo, executar, escolherConcurso, irPara, concursoAtivo } = useApp();
  const [editando, setEditando] = useState<Concurso | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [excluir, setExcluir] = useState<Concurso | null>(null);
  const hoje = hojeSP();

  const abrir = (c: Concurso | null) => {
    setEditando(c);
    setFormAberto(true);
  };

  return (
    <>
      <CabecalhoTela
        titulo="Concursos"
        subtitulo="Seus planos de estudo. O concurso escolhido no topo da tela define as disciplinas e o edital mostrados."
        acoes={
          <Botao onClick={() => abrir(null)}>
            <Plus size={18} /> Novo concurso
          </Botao>
        }
      />

      {!dados.concursos.length ? (
        <Vazio
          titulo="Nenhum concurso cadastrado"
          texto="Cadastre o primeiro concurso para montar as disciplinas e o edital."
          acao={<Botao onClick={() => abrir(null)}>Cadastrar concurso</Botao>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {dados.concursos.map((c) => {
            const disciplinas = dados.disciplinas.filter((d) => d.concursoId === c.id);
            const cob = cobertura(disciplinas);
            const dias = c.dataProva ? diasEntre(hoje, c.dataProva) : null;
            return (
              <Cartao key={c.id} className={concursoAtivo?.id === c.id ? 'ring-2 ring-verde' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold">{c.nome}</h2>
                    <p className="text-sm text-suave">
                      {[c.cargo, c.orgao].filter(Boolean).join(' · ') || c.area || 'Cargo a definir'}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <BotaoIcone rotulo={`Editar ${c.nome}`} onClick={() => abrir(c)}>
                      <Pencil size={17} />
                    </BotaoIcone>
                    <BotaoIcone rotulo={`Excluir ${c.nome}`} onClick={() => setExcluir(c)}>
                      <Trash2 size={17} />
                    </BotaoIcone>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Etiqueta tom={c.status === 'inscrito' || c.status === 'edital_aberto' ? 'verde' : 'neutro'}>{STATUS_CONCURSO[c.status]}</Etiqueta>
                  <Etiqueta tom="roxo">{c.banca || 'Banca a confirmar'}</Etiqueta>
                  <Etiqueta>Prioridade {c.prioridade}</Etiqueta>
                  {c.notaCorte !== null && <Etiqueta>Corte {c.notaCorte.toLocaleString('pt-BR')}</Etiqueta>}
                </div>

                <p className="numeros mt-3 text-sm">
                  {c.dataProva ? (
                    <>
                      Prova em <strong>{formatarData(c.dataProva)}</strong>
                      {dias !== null && dias >= 0 && ` · faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                    </>
                  ) : (
                    <span className="text-suave">Data da prova a confirmar</span>
                  )}
                </p>

                <div className="mt-3 grid grid-cols-1 gap-1">
                  <div className="numeros flex justify-between text-sm text-suave">
                    <span>
                      {disciplinas.length} {disciplinas.length === 1 ? 'disciplina' : 'disciplinas'}
                    </span>
                    <span>{cob.total ? `${Math.round(cob.fracao * 100)}% do edital` : 'sem tópicos'}</span>
                  </div>
                  <Progresso rotulo={`Cobertura de ${c.nome}`} fracao={cob.fracao} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Botao tamanho="pequeno" onClick={() => { escolherConcurso(c.id); irPara('edital'); }}>
                    Abrir edital
                  </Botao>
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => { escolherConcurso(c.id); irPara('disciplinas'); }}>
                    Disciplinas
                  </Botao>
                  {c.link && (
                    <a href={c.link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-verde-forte underline">
                      Página <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      <FormConcurso aberto={formAberto} aoFechar={() => setFormAberto(false)} inicial={editando} />
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir concurso?"
        texto={
          <>
            <strong>{excluir?.nome}</strong> e as disciplinas e tópicos dele serão apagados. As sessões já estudadas
            continuam no histórico.
          </>
        }
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirConcurso(excluir.id), 'Concurso excluído.')}
      />
    </>
  );
}
