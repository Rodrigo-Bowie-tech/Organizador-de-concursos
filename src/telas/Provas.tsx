import { FileUp, ListChecks, Pencil, Play, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Alternativas } from '../componentes/Alternativas';
import { EditorQuestoes, letraDaResposta } from '../componentes/QuestoesProva';
import type { QuestaoEditavel } from '../componentes/QuestoesProva';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Etiqueta, Modal, Selecao, Vazio, cx } from '../componentes/ui';
import { proximaRevisaoErro } from '../dominio/desempenho';
import { hojeSP } from '../dominio/painel';
import { LETRAS } from '../dominio/pratica';
import { incidenciaPorTopico, provasDoConcurso } from '../dominio/provas';
import { caminhoDoTopico } from '../dominio/topicos';
import type { Id, ProvaAnterior, QuestaoProva } from '../dominio/tipos';
import { useApp } from '../estado';

const questoesEmOrdem = (p: ProvaAnterior) => Object.values(p.questoes).sort((a, b) => a.numero - b.numero);
const valeRefazer = (q: QuestaoProva) => !q.anulada && q.correta !== null && q.alternativas.length > 0;

function ModalRevisar({ prova, aoFechar }: { prova: ProvaAnterior; aoFechar: () => void }) {
  const { dados, repo, executar } = useApp();
  const [titulo, setTitulo] = useState(prova.titulo);
  const [banca, setBanca] = useState(prova.banca);
  const [questoes, setQuestoes] = useState<QuestaoEditavel[]>(() => questoesEmOrdem(prova).map((q) => ({ ...q, chave: q.id })));
  const disciplinas = useMemo(() => dados.disciplinas.filter((d) => d.concursoId === prova.concursoId).sort((a, b) => a.ordem - b.ordem), [dados.disciplinas, prova.concursoId]);

  async function salvar() {
    const nova: ProvaAnterior = {
      ...prova,
      titulo: titulo.trim() || prova.titulo,
      banca: banca.trim(),
      questoes: Object.fromEntries(questoes.map(({ chave, ...q }) => [chave, { ...q, id: chave }])),
    };
    const ok = await executar(() => repo.atualizarProva(nova).then(() => true), 'Prova atualizada.');
    if (ok) aoFechar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largo
      titulo="Revisar questões"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()}>Salvar</Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <Campo rotulo="Título">{(id) => <Entrada id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} />}</Campo>
          <Campo rotulo="Banca">{(id) => <Entrada id={id} value={banca} onChange={(e) => setBanca(e.target.value)} />}</Campo>
        </div>
        <EditorQuestoes questoes={questoes} disciplinas={disciplinas} aoMudar={setQuestoes} />
      </div>
    </Modal>
  );
}

type EtapaRefazer = 'configurar' | 'respondendo' | 'resultado';

function ModalRefazer({ prova, aoFechar }: { prova: ProvaAnterior; aoFechar: () => void }) {
  const { dados, repo, executar, avisar } = useApp();
  const todas = useMemo(() => questoesEmOrdem(prova).filter(valeRefazer), [prova]);
  const disciplinas = dados.disciplinas.filter((d) => todas.some((q) => q.disciplinaId === d.id));
  const [etapa, setEtapa] = useState<EtapaRefazer>('configurar');
  const [filtro, setFiltro] = useState('');
  const [questoes, setQuestoes] = useState<QuestaoProva[]>([]);
  const [respostas, setRespostas] = useState<Record<Id, number>>({});
  const [atual, setAtual] = useState(0);
  const [salvo, setSalvo] = useState(false);
  const [noCaderno, setNoCaderno] = useState<Set<Id>>(new Set());
  const inicio = useRef(new Date());

  const q = questoes[atual];
  const escolhida = q ? (respostas[q.id] ?? null) : null;
  const respondidas = questoes.filter((x) => respostas[x.id] !== undefined);
  const acertos = respondidas.filter((x) => respostas[x.id] === x.correta).length;
  const onde = (x: QuestaoProva) => {
    const d = dados.disciplinas.find((y) => y.id === x.disciplinaId);
    if (!d) return 'Sem assunto';
    return x.topicoId && d.topicos[x.topicoId] ? [d.nome, ...caminhoDoTopico(d.topicos, x.topicoId)].join(' › ') : d.nome;
  };

  function comecar() {
    setQuestoes(filtro ? todas.filter((x) => x.disciplinaId === filtro) : todas);
    setRespostas({});
    setAtual(0);
    setSalvo(false);
    setNoCaderno(new Set());
    inicio.current = new Date();
    setEtapa('respondendo');
  }

  async function salvar() {
    const r = await executar(() => repo.registrarProvaRefeita(prova, respostas));
    if (r) {
      setSalvo(true);
      avisar(`${r.acertos} de ${r.feitas} registradas em Questões.`);
    }
  }

  async function mandarParaCaderno(x: QuestaoProva) {
    if (!x.disciplinaId) return;
    const hoje = hojeSP();
    const comLetras = letraDaResposta(x, 0) === LETRAS[0];
    const texto = (i: number) => (comLetras ? `${LETRAS[i]}) ${x.alternativas[i]}` : x.alternativas[i]);
    const id = await executar(
      () =>
        repo.salvarErro({
          disciplinaId: x.disciplinaId as Id,
          topicoId: x.topicoId,
          enunciado: comLetras ? `${x.enunciado}\n${x.alternativas.map((a, i) => `${LETRAS[i]}) ${a}`).join('\n')}` : x.enunciado,
          minhaResposta: respostas[x.id] === undefined ? '' : texto(respostas[x.id]),
          respostaCerta: texto(x.correta as number),
          motivo: 'falta_conteudo',
          comentario: '',
          fonte: `${prova.titulo}, questão ${x.numero}`,
          criadoEm: hoje,
          revisoesFeitas: [],
          proximaRevisao: proximaRevisaoErro(hoje, []),
          explicacaoIA: '',
        }),
      'Questão anotada no caderno de erros.',
    );
    if (id) setNoCaderno(new Set(noCaderno).add(x.id));
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largo
      titulo={`Refazer: ${prova.titulo}`}
      rodape={
        etapa === 'configurar' ? (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao disabled={!todas.length} onClick={comecar}>
              <Play size={16} /> Começar
            </Botao>
          </>
        ) : etapa === 'respondendo' ? (
          <>
            <Botao variante="fantasma" onClick={() => setEtapa('resultado')}>
              Encerrar
            </Botao>
            <Botao disabled={escolhida === null} onClick={() => (atual + 1 < questoes.length ? setAtual(atual + 1) : setEtapa('resultado'))}>
              {atual + 1 < questoes.length ? 'Próxima' : 'Ver resultado'}
            </Botao>
          </>
        ) : (
          <>
            <Botao variante="secundario" onClick={() => setEtapa('configurar')}>
              Refazer de novo
            </Botao>
            <Botao disabled={salvo || !respondidas.length} onClick={() => void salvar()}>
              {salvo ? 'Salvo' : 'Salvar em Questões'}
            </Botao>
          </>
        )
      }
    >
      {etapa === 'configurar' && (
        <div className="grid gap-3">
          <p className="text-sm text-suave">
            {todas.length} questões com gabarito (anuladas e sem gabarito ficam de fora). O resultado entra no acerto por tópico e no planejamento.
          </p>
          <Campo rotulo="Questões de">
            {(id) => (
              <Selecao id={id} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="">Todas as disciplinas ({todas.length})</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome} ({todas.filter((x) => x.disciplinaId === d.id).length})
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        </div>
      )}

      {etapa === 'respondendo' && q && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Etiqueta tom="roxo">
              Questão {q.numero} · {atual + 1} de {questoes.length}
            </Etiqueta>
            <span className="text-xs text-suave">{onde(q)}</span>
          </div>
          <p className="font-bold whitespace-pre-line">{q.enunciado}</p>
          <Alternativas
            alternativas={q.alternativas}
            correta={q.correta}
            escolhida={escolhida}
            comLetras={letraDaResposta(q, 0) === LETRAS[0]}
            aoEscolher={(i) => setRespostas({ ...respostas, [q.id]: i })}
          />
          {escolhida !== null && (
            <p className={cx('rounded-lg bg-superficie-2 px-3 py-2.5 font-extrabold', escolhida === q.correta ? 'text-ok' : 'text-perigo')}>
              {escolhida === q.correta ? 'Acertou!' : `Errou. Gabarito: ${letraDaResposta(q, q.correta as number)}`}
            </p>
          )}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="grid gap-4">
          <div className="text-center">
            <p className="numeros text-4xl font-extrabold">
              {acertos} de {respondidas.length}
            </p>
            <p className="text-suave">{respondidas.length ? `${Math.round((acertos / respondidas.length) * 100)}% de acerto` : 'Nenhuma questão respondida'}</p>
          </div>
          {acertos < respondidas.length && (
            <div>
              <p className="mb-2 font-extrabold">Para revisar</p>
              <ul className="grid gap-2">
                {respondidas
                  .filter((x) => respostas[x.id] !== x.correta)
                  .map((x) => (
                    <li key={x.id} className="rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                      <p className="text-xs text-suave">
                        Questão {x.numero} · {onde(x)}
                      </p>
                      <p className="line-clamp-3 font-bold">{x.enunciado}</p>
                      <p className="mt-1 text-ok">
                        Gabarito: {letraDaResposta(x, x.correta as number)}
                        {letraDaResposta(x, 0) === LETRAS[0] && `) ${x.alternativas[x.correta as number]}`}
                      </p>
                      {x.disciplinaId && (
                        <Botao tamanho="pequeno" variante="fantasma" className="mt-1" disabled={noCaderno.has(x.id)} onClick={() => void mandarParaCaderno(x)}>
                          {noCaderno.has(x.id) ? 'No caderno de erros' : 'Mandar para o caderno de erros'}
                        </Botao>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Os assuntos que mais caem nas provas da banca (barras horizontais). */
function GraficoIncidencia({ itens, legenda }: { itens: { rotulo: string; detalhe: string; n: number }[]; legenda: string }) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-center gap-2 text-sm text-suave">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--grafico-peso)' }} aria-hidden />
        {legenda}
      </figcaption>
      <ol className="grid gap-2.5" aria-label="Assuntos que mais caem">
        {itens.map((i) => (
          <li key={i.rotulo + i.detalhe} className="grid gap-1 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-center sm:gap-3">
            <span className="min-w-0 text-sm">
              <span className="block truncate font-bold" title={i.rotulo}>
                {i.rotulo}
              </span>
              <span className="block truncate text-xs text-suave">{i.detalhe}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-4 rounded-full" style={{ width: `${Math.max(4, (i.n / max) * 100)}%`, background: 'var(--grafico-peso)' }} />
              <span className="numeros shrink-0 text-sm font-bold">{i.n}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Provas() {
  const { dados, concursoAtivo, repo, executar, irPara } = useApp();
  const [revisar, setRevisar] = useState<ProvaAnterior | null>(null);
  const [refazer, setRefazer] = useState<ProvaAnterior | null>(null);
  const [excluir, setExcluir] = useState<ProvaAnterior | null>(null);
  const [outras, setOutras] = useState(false);

  const daBanca = useMemo(() => (concursoAtivo ? provasDoConcurso(dados.provas, concursoAtivo) : []), [dados.provas, concursoAtivo]);
  const ranking = useMemo(() => {
    if (!concursoAtivo) return [];
    const inc = incidenciaPorTopico(dados.provas, concursoAtivo, dados.disciplinas);
    const itens: { rotulo: string; detalhe: string; n: number }[] = [];
    for (const d of dados.disciplinas.filter((x) => x.concursoId === concursoAtivo.id)) {
      for (const [id, n] of inc) {
        const t = d.topicos[id];
        if (t) itens.push({ rotulo: t.titulo, detalhe: [d.nome, ...caminhoDoTopico(d.topicos, id).slice(0, -1)].join(' › '), n });
      }
    }
    return itens.sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR')).slice(0, 10);
  }, [dados.provas, dados.disciplinas, concursoAtivo]);

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Provas anteriores" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso e importe o edital para ligar as questões das provas aos tópicos." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const banca = concursoAtivo.banca.trim();
  const lista = outras ? dados.provas : daBanca;
  const nQuestoes = daBanca.reduce((t, p) => t + Object.values(p.questoes).filter((q) => !q.anulada).length, 0);

  return (
    <>
      <CabecalhoTela
        titulo="Provas anteriores"
        subtitulo={
          daBanca.length
            ? `${banca || concursoAtivo.nome} · ${daBanca.length} ${daBanca.length === 1 ? 'prova' : 'provas'} · ${nQuestoes} questões válidas`
            : `Importe provas ${banca ? `da ${banca}` : 'da banca'} para saber quais assuntos mais caem.`
        }
        acoes={
          <Botao onClick={() => irPara('importarProva')}>
            <FileUp size={18} /> Importar prova
          </Botao>
        }
      />

      <div className="grid gap-4">
        {ranking.length > 0 && (
          <Cartao titulo={`Assuntos que mais caem${banca ? ` na ${banca}` : ''}`}>
            <GraficoIncidencia
              itens={ranking}
              legenda={`Questões por tópico do edital de ${concursoAtivo.nome}, em ${daBanca.length} ${daBanca.length === 1 ? 'prova' : 'provas'}. Entra na prioridade do planejamento.`}
            />
          </Cartao>
        )}

        {dados.provas.length > daBanca.length && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={outras} onChange={(e) => setOutras(e.target.checked)} />
            Mostrar provas de outras bancas ({dados.provas.length - daBanca.length})
          </label>
        )}

        {!lista.length ? (
          <Vazio
            titulo="Nenhuma prova"
            texto="Baixe as provas anteriores no site da banca (PDF com texto) e importe aqui. A IA separa as questões pelos tópicos do seu edital."
            acao={<Botao onClick={() => irPara('importarProva')}>Importar prova</Botao>}
          />
        ) : (
          <ul className="grid gap-3" aria-label="Provas">
            {lista.map((p) => {
              const qs = Object.values(p.questoes);
              const ligadas = qs.filter((q) => q.disciplinaId).length;
              const comGabarito = qs.filter(valeRefazer).length;
              const anuladas = qs.filter((q) => q.anulada).length;
              const conta = daBanca.includes(p);
              return (
                <li key={p.id} className="rounded-xl bg-superficie p-4 shadow-cartao">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="font-extrabold">{p.titulo}</p>
                      <p className="text-sm text-suave">
                        {[p.banca && `Banca ${p.banca}`, p.ano, p.cargo, `edital de ${dados.concursos.find((c) => c.id === p.concursoId)?.nome ?? '—'}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {!conta && <Etiqueta>outra banca</Etiqueta>}
                  </div>
                  <p className="numeros mt-2 flex flex-wrap gap-2 text-sm">
                    <Etiqueta tom="verde">{qs.length} questões</Etiqueta>
                    <Etiqueta tom={ligadas < qs.length ? 'alerta' : 'neutro'}>{ligadas} com assunto</Etiqueta>
                    <Etiqueta tom={comGabarito ? 'neutro' : 'alerta'}>{comGabarito} com gabarito</Etiqueta>
                    {anuladas > 0 && <Etiqueta>{anuladas} anuladas</Etiqueta>}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Botao tamanho="pequeno" disabled={!comGabarito} onClick={() => setRefazer(p)}>
                      <ListChecks size={16} /> Refazer
                    </Botao>
                    <Botao tamanho="pequeno" variante="secundario" onClick={() => setRevisar(p)}>
                      <Pencil size={16} /> Revisar questões
                    </Botao>
                    <BotaoIcone rotulo={`Excluir ${p.titulo}`} className="ml-auto" onClick={() => setExcluir(p)}>
                      <Trash2 size={16} />
                    </BotaoIcone>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {revisar && <ModalRevisar prova={revisar} aoFechar={() => setRevisar(null)} />}
      {refazer && <ModalRefazer prova={refazer} aoFechar={() => setRefazer(null)} />}
      <Confirmar
        aberto={Boolean(excluir)}
        titulo="Excluir prova"
        texto={`Excluir “${excluir?.titulo}” e as questões dela? A incidência dos tópicos é recalculada. O que você já registrou em Questões fica.`}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirProva(excluir), 'Prova excluída.')}
        aoFechar={() => setExcluir(null)}
      />
    </>
  );
}
