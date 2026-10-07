import { ArrowDown, ArrowUp, ClipboardList, CornerDownRight, FileUp, Library, Link2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PainelMateriais } from '../componentes/Materiais';
import { ModalPratica } from '../componentes/PraticaIA';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Confirmar, Entrada, Modal, Progresso, Selecao, Vazio, cx } from '../componentes/ui';
import { formatarData, formatarDuracao } from '../dominio/datas';
import { lerLote } from '../dominio/lote';
import { cobertura, questoesPorTopico, segundosPorTopico, topicoConcluido } from '../dominio/painel';
import { incidenciaPorTopico } from '../dominio/provas';
import type { Acerto } from '../dominio/painel';
import { PainelEquivalencias } from '../componentes/Equivalencias';
import { todasAsQuestoes } from '../dominio/desempenho';
import { STATUS_TOPICO } from '../dominio/rotulos';
import { achatar, comDescendentes } from '../dominio/topicos';
import type { Disciplina, StatusTopico, Topico } from '../dominio/tipos';
import { useApp } from '../estado';

type Alvo = { disciplina: Disciplina; paiId: string | null };

function ModalTopico({ alvo, editar, aoFechar }: { alvo: Alvo | null; editar: { disciplina: Disciplina; topico: Topico } | null; aoFechar: () => void }) {
  const { repo, executar } = useApp();
  const [titulo, setTitulo] = useState('');
  const [incidencia, setIncidencia] = useState('');
  const [blocos, setBlocos] = useState('');
  const aberto = Boolean(alvo || editar);

  useEffect(() => {
    if (!aberto) return;
    setTitulo(editar?.topico.titulo ?? '');
    setIncidencia(editar?.topico.incidencia?.toString() ?? '');
    setBlocos(editar?.topico.blocosTeoria?.toString() ?? '');
  }, [aberto, editar]);

  const pai = alvo?.paiId ? alvo.disciplina.topicos[alvo.paiId] : null;

  async function salvar() {
    const t = titulo.trim();
    if (!t) return;
    const ok = await executar(async () => {
      if (editar) {
        await repo.atualizarTopico(editar.disciplina.id, editar.topico.id, {
          titulo: t,
          incidencia: incidencia === '' ? null : Math.max(0, Math.floor(Number(incidencia))),
          blocosTeoria: blocos === '' ? null : Math.min(20, Math.max(1, Math.round(Number(blocos)))),
        });
      } else if (alvo) {
        await repo.adicionarTopico(alvo.disciplina.id, t, alvo.paiId);
      }
      return true;
    });
    if (ok) aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editar ? 'Editar tópico' : pai ? 'Novo subtópico' : 'Novo tópico'}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!titulo.trim()} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {pai && <p className="text-sm text-suave">Dentro de: {pai.titulo}</p>}
        <Campo rotulo="Título">
          {(id) => <Entrada id={id} autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>
        {editar && (
          <Campo rotulo="Incidência na banca" dica="Quantas vezes o assunto caiu em provas dessa banca, se souber. Em branco, vale a contagem das provas anteriores importadas.">
            {(id) => <Entrada id={id} type="number" min={0} value={incidencia} onChange={(e) => setIncidencia(e.target.value)} />}
          </Campo>
        )}
        {editar && (
          <Campo rotulo="Blocos de teoria" dica="Quantos blocos do planejamento este tópico pede para a teoria. Em branco: 2 se não iniciado, 1 em estudo.">
            {(id) => <Entrada id={id} type="number" min={1} max={20} placeholder="2" value={blocos} onChange={(e) => setBlocos(e.target.value)} />}
          </Campo>
        )}
      </form>
    </Modal>
  );
}

const EXEMPLO_LOTE = `1. Circuitos elétricos
1.1 Lei de Ohm e leis de Kirchhoff
1.2 Circuitos trifásicos
2. Máquinas elétricas
2.1 Transformadores
2.2 Motores de indução`;

function ModalLote({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { disciplinas, repo, executar, avisar } = useApp();
  const [disciplinaId, setDisciplinaId] = useState('');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (aberto) {
      setTexto('');
      setDisciplinaId((atual) => (disciplinas.some((d) => d.id === atual) ? atual : disciplinas[0]?.id ?? ''));
    }
  }, [aberto, disciplinas]);

  const itens = useMemo(() => lerLote(texto), [texto]);

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Colar lista de tópicos"
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!itens.length || !disciplinaId}
            onClick={async () => {
              const n = await executar(() => repo.adicionarLote(disciplinaId, texto));
              if (n) {
                aoFechar();
                avisar(`${n} ${n === 1 ? 'tópico cadastrado' : 'tópicos cadastrados'}.`);
              }
            }}
          >
            Cadastrar {itens.length || ''} {itens.length === 1 ? 'tópico' : 'tópicos'}
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <p className="text-sm text-suave">
          Um tópico por linha. A numeração do edital (1., 1.1, 1.1.1) define os subtópicos; sem numeração, use recuo
          (tab ou dois espaços).
        </p>
        <Campo rotulo="Disciplina">
          {(id) => (
            <Selecao id={id} value={disciplinaId} onChange={(e) => setDisciplinaId(e.target.value)}>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Lista de tópicos">
          {(id) => <AreaTexto id={id} className="min-h-48 font-mono text-sm" value={texto} placeholder={EXEMPLO_LOTE} onChange={(e) => setTexto(e.target.value)} />}
        </Campo>
        {itens.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg bg-superficie-2 p-3 text-sm">
            <p className="mb-1 font-bold text-suave">Prévia</p>
            {itens.map((i, k) => (
              <p key={k} style={{ paddingLeft: `${i.nivel * 1.25}rem` }}>
                {i.nivel > 0 && '↳ '}
                {i.titulo}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function LinhaTopico({
  disciplina,
  topico,
  nivel,
  numero,
  segundos,
  acerto,
  incidencia,
  vinculos,
  nMateriais,
  aoMateriais,
  aoPraticar,
  aoAdicionarSub,
  aoEditar,
  aoExcluir,
}: {
  disciplina: Disciplina;
  topico: Topico;
  nivel: number;
  numero: string;
  segundos: number;
  acerto: Acerto | undefined;
  /** Vezes que caiu na banca: informada à mão ou contada nas provas anteriores. */
  incidencia: { n: number; manual: boolean } | null;
  /** Onde este tópico aparece em outros editais (tópicos vinculados). */
  vinculos: string[];
  nMateriais: number;
  aoMateriais: () => void;
  aoPraticar: (() => void) | null;
  aoAdicionarSub: () => void;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  const { repo, executar } = useApp();
  const concluido = topicoConcluido(topico);
  const atualizar = (patch: Parameters<typeof repo.atualizarTopico>[2]) =>
    void executar(() => repo.atualizarTopico(disciplina.id, topico.id, patch));

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-borda py-2.5 last:border-b-0" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
      <label className="flex min-w-0 flex-1 basis-64 items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--verde)]"
          checked={concluido}
          aria-label={`Teoria concluída: ${topico.titulo}`}
          onChange={(e) => atualizar({ status: e.target.checked ? 'teoria_concluida' : 'em_estudo' })}
        />
        <span className={cx('min-w-0', nivel === 0 && 'font-bold', concluido && 'text-suave', topico.cortado && 'text-suave line-through')}>
          <span className="numeros mr-1.5 text-suave">{numero}</span>
          {topico.titulo}
          {vinculos.length > 0 && (
            <span className="ml-1.5 inline-flex translate-y-0.5 text-roxo" title={`Vinculado a: ${vinculos.join('; ')}`} aria-label={`Vinculado a: ${vinculos.join('; ')}`}>
              <Link2 size={15} />
            </span>
          )}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 pl-6 text-sm sm:pl-0">
        <select
          aria-label={`Status de ${topico.titulo}`}
          value={topico.status}
          onChange={(e) => atualizar({ status: e.target.value as StatusTopico })}
          className={cx(
            'rounded-md border border-borda bg-superficie px-1.5 py-1 text-xs font-bold',
            topico.status === 'nao_iniciado' ? 'text-suave' : 'text-verde-forte',
          )}
        >
          {Object.entries(STATUS_TOPICO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
        <select
          aria-label={`Autoavaliação de ${topico.titulo}`}
          value={topico.autoavaliacao ?? ''}
          onChange={(e) => atualizar({ autoavaliacao: e.target.value ? Number(e.target.value) : null })}
          className="rounded-md border border-borda bg-superficie px-1.5 py-1 text-xs font-bold text-suave"
          title="Autoavaliação de 1 a 5"
        >
          <option value="">Nota –</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Nota {n}
            </option>
          ))}
        </select>
        <span className="numeros w-16 text-right text-xs text-suave" title="Tempo líquido estudado">
          {segundos ? formatarDuracao(segundos) : '–'}
        </span>
        <span className="numeros w-12 text-right text-xs text-suave" title={acerto ? `${acerto.acertos} acertos em ${acerto.feitas} questões` : 'Sem questões'}>
          {acerto ? `${Math.round((acerto.acertos / acerto.feitas) * 100)}%` : '–'}
        </span>
        {incidencia && incidencia.n > 0 && (
          <span
            className="numeros rounded-full bg-roxo/12 px-2 py-0.5 text-xs font-bold text-roxo"
            title={incidencia.manual ? 'Incidência informada por você' : `Caiu ${incidencia.n} ${incidencia.n === 1 ? 'vez' : 'vezes'} nas provas anteriores da banca`}
          >
            caiu {incidencia.n}×
          </span>
        )}
        {topico.revisao && (
          <span
            className="numeros text-xs font-bold text-roxo"
            title={`Próxima revisão${topico.revisao.ultima ? ` · última em ${formatarData(topico.revisao.ultima)}` : ''}`}
          >
            rev. {formatarData(topico.revisao.proxima).slice(0, 5)}
          </span>
        )}
        {topico.cortado && (
          <button
            type="button"
            className="rounded-full bg-alerta/15 px-2 py-0.5 text-xs font-bold text-alerta hover:brightness-95"
            title="Cortado do plano. Clique para devolver."
            onClick={() => void executar(() => repo.cortarTopicos([{ disciplinaId: disciplina.id, topicoId: topico.id }], false), 'Tópico de volta ao plano.')}
          >
            fora do plano · devolver
          </button>
        )}
        <span className="flex">
          <BotaoIcone rotulo={`Materiais (${nMateriais})`} onClick={aoMateriais} className={nMateriais ? 'text-verde-forte' : undefined}>
            <Library size={15} />
          </BotaoIcone>
          {aoPraticar && (
            <BotaoIcone rotulo="Praticar com IA" onClick={aoPraticar}>
              <Sparkles size={15} />
            </BotaoIcone>
          )}
          <BotaoIcone rotulo="Subir" onClick={() => void executar(() => repo.moverTopico(disciplina.id, topico.id, -1))}>
            <ArrowUp size={15} />
          </BotaoIcone>
          <BotaoIcone rotulo="Descer" onClick={() => void executar(() => repo.moverTopico(disciplina.id, topico.id, 1))}>
            <ArrowDown size={15} />
          </BotaoIcone>
          <BotaoIcone rotulo="Adicionar subtópico" onClick={aoAdicionarSub}>
            <CornerDownRight size={15} />
          </BotaoIcone>
          <BotaoIcone rotulo="Editar" onClick={aoEditar}>
            <Pencil size={15} />
          </BotaoIcone>
          <BotaoIcone rotulo="Excluir" onClick={aoExcluir}>
            <Trash2 size={15} />
          </BotaoIcone>
        </span>
      </div>
    </li>
  );
}

export function Edital() {
  const { dados, disciplinas, concursoAtivo, repo, executar, irPara, recursos } = useApp();
  const [novo, setNovo] = useState<Alvo | null>(null);
  const [editar, setEditar] = useState<{ disciplina: Disciplina; topico: Topico } | null>(null);
  const [excluir, setExcluir] = useState<{ disciplina: Disciplina; topico: Topico } | null>(null);
  const [lote, setLote] = useState(false);
  const [materiais, setMateriais] = useState<{ disciplina: Disciplina; topico: Topico } | null>(null);
  const [praticar, setPraticar] = useState<{ disciplina: Disciplina; topico: Topico } | null>(null);
  const porTopico = useMemo(() => segundosPorTopico(dados.sessoes, Date.now()), [dados.sessoes]);
  const acertos = useMemo(
    () => questoesPorTopico(todasAsQuestoes(dados.sessoes, dados.registrosQuestoes).map((q) => ({ topicoId: q.topicoId, feitas: q.feitas, acertos: q.acertos }))),
    [dados.sessoes, dados.registrosQuestoes],
  );
  // Tópicos vinculados somam horas e questões entre si e mostram onde mais aparecem.
  const grupos = useMemo(() => {
    const membros = new Map<string, { concurso: string; topicoId: string; titulo: string }[]>();
    for (const d of dados.disciplinas) {
      const concurso = dados.concursos.find((c) => c.id === d.concursoId)?.nome ?? '';
      for (const t of Object.values(d.topicos)) {
        if (!t.grupoEquivalenciaId) continue;
        membros.set(t.grupoEquivalenciaId, [...(membros.get(t.grupoEquivalenciaId) ?? []), { concurso, topicoId: t.id, titulo: t.titulo }]);
      }
    }
    return membros;
  }, [dados.disciplinas, dados.concursos]);
  const doGrupo = (t: Topico) => (t.grupoEquivalenciaId ? grupos.get(t.grupoEquivalenciaId) ?? [] : []);
  const somaSegundos = (t: Topico) => {
    const m = doGrupo(t);
    return m.length ? m.reduce((s, x) => s + (porTopico.get(x.topicoId) ?? 0), 0) : porTopico.get(t.id) ?? 0;
  };
  const somaAcerto = (t: Topico): Acerto | undefined => {
    const ids = doGrupo(t).length ? doGrupo(t).map((x) => x.topicoId) : [t.id];
    const total = ids.reduce((a, id) => {
      const x = acertos.get(id);
      return x ? { feitas: a.feitas + x.feitas, acertos: a.acertos + x.acertos } : a;
    }, { feitas: 0, acertos: 0 });
    return total.feitas ? total : undefined;
  };
  const incProvas = useMemo(
    () => (concursoAtivo ? incidenciaPorTopico(dados.provas, concursoAtivo, dados.disciplinas) : new Map<string, number>()),
    [dados.provas, dados.disciplinas, concursoAtivo],
  );
  const incidenciaDe = (t: Topico) =>
    t.incidencia !== null ? { n: t.incidencia, manual: true } : incProvas.has(t.id) ? { n: incProvas.get(t.id) as number, manual: false } : null;
  const editalImportado = concursoAtivo ? dados.editais.find((e) => e.concursoId === concursoAtivo.id) : undefined;

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Edital" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso para montar o edital verticalizado." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const cob = cobertura(disciplinas);

  return (
    <>
      <CabecalhoTela
        titulo="Edital"
        subtitulo={`${concursoAtivo.nome} · ${cob.total ? `${cob.concluidos} de ${cob.total} tópicos com teoria concluída` : 'edital verticalizado'}`}
        acoes={
          <>
            <Botao onClick={() => irPara('importar')}>
              <FileUp size={18} /> Importar edital
            </Botao>
            {disciplinas.length > 0 && (
              <Botao variante="secundario" onClick={() => setLote(true)}>
                <ClipboardList size={18} /> Colar lista de tópicos
              </Botao>
            )}
          </>
        }
      />

      {editalImportado && (
        <p className="-mt-2 mb-4 text-sm text-suave">
          Edital importado em {formatarData(editalImportado.importadoEm)}
          {editalImportado.cargo && ` · cargo ${editalImportado.cargo}`}
          {editalImportado.arquivoId && (
            <>
              {' · '}
              <a className="font-bold text-verde-forte underline" href={`/_blob/${editalImportado.arquivoId}`} target="_blank" rel="noreferrer">
                abrir o PDF
              </a>
            </>
          )}
        </p>
      )}

      {!disciplinas.length ? (
        <Vazio
          titulo="Cadastre as disciplinas primeiro"
          texto="O edital verticalizado organiza os tópicos dentro de cada disciplina."
          acao={<Botao onClick={() => irPara('disciplinas')}>Ir para Disciplinas</Botao>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {disciplinas.map((d) => {
            const linhas = achatar(d.topicos);
            const c = cobertura([d]);
            return (
              <div key={d.id} className="relative">
              <details open className="group rounded-xl bg-superficie shadow-cartao">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4 pr-28 [&::-webkit-details-marker]:hidden">
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: d.cor }} aria-hidden />
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block font-extrabold">{d.nome}</span>
                    <span className="numeros block text-sm text-suave">
                      {c.total ? `${c.concluidos}/${c.total} tópicos · ${Math.round(c.fracao * 100)}%` : 'Sem tópicos'}
                    </span>
                  </span>
                  <span className="w-full sm:w-40">
                    <Progresso rotulo={`Cobertura de ${d.nome}`} fracao={c.fracao} cor={d.cor} />
                  </span>
                </summary>
                <div className="border-t border-borda px-4">
                  {linhas.length ? (
                    <ul>
                      {linhas.map((l) => (
                        <LinhaTopico
                          key={l.topico.id}
                          disciplina={d}
                          topico={l.topico}
                          nivel={l.nivel}
                          numero={l.numero}
                          segundos={somaSegundos(l.topico)}
                          acerto={somaAcerto(l.topico)}
                          incidencia={incidenciaDe(l.topico)}
                          vinculos={doGrupo(l.topico).filter((x) => x.topicoId !== l.topico.id).map((x) => `${x.concurso} › ${x.titulo}`)}
                          nMateriais={dados.materiais.filter((m) => m.topicoId === l.topico.id).length}
                          aoMateriais={() => setMateriais({ disciplina: d, topico: l.topico })}
                          aoPraticar={recursos.ia ? () => setPraticar({ disciplina: d, topico: l.topico }) : null}
                          aoAdicionarSub={() => setNovo({ disciplina: d, paiId: l.topico.id })}
                          aoEditar={() => setEditar({ disciplina: d, topico: l.topico })}
                          aoExcluir={() => setExcluir({ disciplina: d, topico: l.topico })}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="py-4 text-suave">
                      Nenhum tópico. Use <strong>+ Tópico</strong> ou <strong>Colar lista de tópicos</strong>.
                    </p>
                  )}
                </div>
              </details>
              {/* Fora do <summary>: botão dentro dele é "interativo aninhado" para leitores de tela. */}
              <Botao tamanho="pequeno" variante="secundario" className="absolute top-4 right-4" onClick={() => setNovo({ disciplina: d, paiId: null })}>
                <Plus size={16} /> Tópico
              </Botao>
              </div>
            );
          })}
        </div>
      )}

      {disciplinas.length > 0 && <PainelEquivalencias />}

      <ModalTopico alvo={novo} editar={editar} aoFechar={() => { setNovo(null); setEditar(null); }} />
      <ModalLote aberto={lote} aoFechar={() => setLote(false)} />
      <Modal aberto={Boolean(materiais)} aoFechar={() => setMateriais(null)} titulo={`Materiais: ${materiais?.topico.titulo ?? ''}`} largo>
        {materiais && <PainelMateriais disciplinaId={materiais.disciplina.id} topicoId={materiais.topico.id} />}
      </Modal>
      {praticar && <ModalPratica disciplinaId={praticar.disciplina.id} topicoId={praticar.topico.id} aoFechar={() => setPraticar(null)} />}
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir tópico?"
        texto={
          excluir && (
            <>
              <strong>{excluir.topico.titulo}</strong>
              {comDescendentes(excluir.disciplina.topicos, excluir.topico.id).size > 1 &&
                ` e os ${comDescendentes(excluir.disciplina.topicos, excluir.topico.id).size - 1} subtópicos dele`}{' '}
              serão apagados.
            </>
          )
        }
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.removerTopico(excluir.disciplina.id, excluir.topico.id), 'Tópico excluído.')}
      />
    </>
  );
}
