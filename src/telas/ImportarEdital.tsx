import { ArrowLeft, FileUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Entrada, Etiqueta, Selecao, cx } from '../componentes/ui';
import {
  contarTopicos,
  dividirEmPartes,
  juntarPartes,
  localizarConteudoProgramatico,
  montarPedidoEdital,
  normalizar,
  validarEstrutura,
} from '../dominio/edital';
import type { DisciplinaImportada, TopicoImportado } from '../dominio/edital';
import { TIPO_DISCIPLINA } from '../dominio/rotulos';
import type { Id, TipoDisciplina } from '../dominio/tipos';
import { useApp } from '../estado';
import { extrairTextoPdf } from '../pdf';
import { mensagemErroIA } from '../plataforma';

type Etapa = 'fonte' | 'trecho' | 'processando' | 'revisao';
type ItemRevisao = DisciplinaImportada & { incluir: boolean; destinoId: Id | null; chave: number };

// ---------------------------------------------------- edição da árvore

type Caminho = number[];

function alterar(arvore: TopicoImportado[], caminho: Caminho, fn: (t: TopicoImportado) => TopicoImportado | null): TopicoImportado[] {
  const [i, ...resto] = caminho;
  return arvore.flatMap((t, k) => {
    if (k !== i) return [t];
    if (!resto.length) {
      const novo = fn(t);
      return novo ? [novo] : [];
    }
    return [{ ...t, filhos: alterar(t.filhos, resto, fn) }];
  });
}

function ArvoreEditavel({ topicos, aoMudar, nivel = 0, prefixo = [] }: { topicos: TopicoImportado[]; aoMudar: (t: TopicoImportado[]) => void; nivel?: number; prefixo?: Caminho }) {
  return (
    <ul className={cx('grid gap-1', nivel > 0 && 'mt-1 border-l border-borda pl-3')}>
      {topicos.map((t, i) => {
        const caminho = [...prefixo, i];
        return (
          <li key={caminho.join('.')}>
            <div className="flex items-center gap-1">
              <Entrada
                aria-label={`Tópico ${caminho.map((x) => x + 1).join('.')}`}
                className="py-1 text-sm"
                value={t.titulo}
                onChange={(e) => aoMudar(alterar(topicos, [i], (x) => ({ ...x, titulo: e.target.value })))}
              />
              {nivel < 2 && (
                <BotaoIcone rotulo="Adicionar subtópico" onClick={() => aoMudar(alterar(topicos, [i], (x) => ({ ...x, filhos: [...x.filhos, { titulo: 'Novo subtópico', filhos: [] }] })))}>
                  <Plus size={15} />
                </BotaoIcone>
              )}
              <BotaoIcone rotulo={`Remover ${t.titulo}`} onClick={() => aoMudar(alterar(topicos, [i], () => null))}>
                <Trash2 size={15} />
              </BotaoIcone>
            </div>
            {t.filhos.length > 0 && (
              <ArvoreEditavel
                topicos={t.filhos}
                nivel={nivel + 1}
                prefixo={caminho}
                aoMudar={(filhos) => aoMudar(alterar(topicos, [i], (x) => ({ ...x, filhos })))}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- tela

export function ImportarEdital() {
  const { dados, concursoAtivo, recursos, repo, executar, avisar, irPara, escolherConcurso } = useApp();
  const [etapa, setEtapa] = useState<Etapa>('fonte');
  const [concursoId, setConcursoId] = useState(concursoAtivo?.id ?? dados.concursos[0]?.id ?? '');
  const concurso = dados.concursos.find((c) => c.id === concursoId);
  const [cargo, setCargo] = useState(concurso?.cargo ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [colado, setColado] = useState('');
  const [texto, setTexto] = useState('');
  const [trecho, setTrecho] = useState('');
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState({ parte: 0, total: 0 });
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [guardarPdf, setGuardarPdf] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const controle = useRef<AbortController | null>(null);

  const partes = useMemo(() => dividirEmPartes(trecho), [trecho]);
  const existentes = dados.disciplinas.filter((d) => d.concursoId === concursoId);

  async function lerFonte() {
    setErro(null);
    let bruto = colado;
    if (arquivo) {
      setLendo('Abrindo o PDF…');
      try {
        bruto = await extrairTextoPdf(arquivo, (p, t) => setLendo(`Lendo página ${p} de ${t}…`));
      } catch (e) {
        setLendo(null);
        setErro((e as { mensagem?: string }).mensagem ?? 'Não consegui ler o PDF.');
        return;
      }
      setLendo(null);
      if (bruto.replace(/\s/g, '').length < 200) {
        setErro('O PDF quase não tem texto (pode ser escaneado). Copie o conteúdo programático e cole no campo de texto.');
        return;
      }
    }
    const achado = localizarConteudoProgramatico(bruto);
    setTexto(bruto);
    setTrecho(achado ? bruto.slice(achado.inicio, achado.fim).trim() : bruto.trim());
    setEtapa('trecho');
  }

  async function estruturar() {
    if (!recursos.ia || !concurso) return;
    setErro(null);
    setEtapa('processando');
    const ctl = new AbortController();
    controle.current = ctl;
    const resultados: DisciplinaImportada[][] = [];
    try {
      for (let i = 0; i < partes.length; i++) {
        setProgresso({ parte: i + 1, total: partes.length });
        const resposta = await recursos.ia.json(
          montarPedidoEdital(partes[i], { concurso: concurso.nome, cargo, banca: concurso.banca, parte: i + 1, totalPartes: partes.length }),
          { signal: ctl.signal, modelTier: 'default' },
        );
        resultados.push(validarEstrutura(resposta));
      }
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      setEtapa('trecho');
      if (codigo !== 'cancelled') setErro(mensagemErroIA(codigo));
      return;
    }
    const juntas = juntarPartes(resultados);
    if (!juntas.length) {
      setEtapa('trecho');
      setErro('A IA não encontrou disciplinas neste trecho. Confira se o texto é o conteúdo programático.');
      return;
    }
    setItens(
      juntas.map((d, k) => ({
        ...d,
        incluir: true,
        chave: k,
        destinoId: existentes.find((x) => normalizar(x.nome) === normalizar(d.nome))?.id ?? null,
      })),
    );
    setEtapa('revisao');
  }

  async function salvar() {
    if (!concurso) return;
    setSalvando(true);
    const escolhidas = itens.filter((i) => i.incluir && i.nome.trim());
    const r = await executar(() =>
      repo.importarEdital({
        concursoId: concurso.id,
        cargo,
        trecho,
        arquivo: guardarPdf ? arquivo : null,
        disciplinas: escolhidas.map((i) => ({
          nome: i.nome.trim(),
          peso: i.peso,
          numQuestoes: i.numQuestoes,
          tipo: i.tipo,
          topicos: limparVazios(i.topicos),
          destinoId: i.destinoId,
        })),
      }),
    );
    setSalvando(false);
    if (r) {
      avisar(`Edital importado: ${r.disciplinas} disciplinas e ${r.topicos} tópicos.`);
      escolherConcurso(concurso.id);
      irPara('edital');
    }
  }

  const mudarItem = (chave: number, patch: Partial<ItemRevisao>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  const totalTopicos = itens.filter((i) => i.incluir).reduce((n, i) => n + contarTopicos(i.topicos), 0);

  if (!dados.concursos.length) {
    return (
      <>
        <CabecalhoTela titulo="Importar edital" />
        <Cartao>
          <p className="text-suave">Cadastre o concurso antes de importar o edital.</p>
          <Botao className="mt-3" onClick={() => irPara('concursos')}>
            Ir para Concursos
          </Botao>
        </Cartao>
      </>
    );
  }

  return (
    <>
      <CabecalhoTela
        titulo="Importar edital"
        subtitulo="A IA separa o conteúdo programático em disciplinas, tópicos e subtópicos. Nada é salvo antes da sua revisão."
        acoes={
          <Botao variante="secundario" onClick={() => irPara('edital')}>
            <ArrowLeft size={18} /> Voltar ao edital
          </Botao>
        }
      />

      <ol className="mb-4 flex flex-wrap gap-2 text-sm font-bold" aria-label="Etapas">
        {(['fonte', 'trecho', 'revisao'] as const).map((e, i) => {
          const atual = etapa === e || (etapa === 'processando' && e === 'trecho');
          return (
            <li key={e} className={cx('rounded-full px-3 py-1', atual ? 'bg-verde-botao text-sobre-verde' : 'bg-superficie-2 text-suave')} aria-current={atual ? 'step' : undefined}>
              {i + 1}. {e === 'fonte' ? 'Arquivo ou texto' : e === 'trecho' ? 'Conteúdo programático' : 'Revisão'}
            </li>
          );
        })}
      </ol>

      {!recursos.ia && (
        <p className="mb-4 rounded-lg bg-alerta/15 px-4 py-2 text-sm font-bold text-alerta">
          A estruturação com IA só funciona no app aberto no claude.ai. Aqui, use "Colar lista de tópicos" no Edital.
        </p>
      )}
      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-perigo-suave px-4 py-2 text-sm font-bold text-perigo">
          {erro}
        </p>
      )}

      {etapa === 'fonte' && (
        <Cartao>
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Concurso">
                {(id) => (
                  <Selecao id={id} value={concursoId} onChange={(e) => { setConcursoId(e.target.value); setCargo(dados.concursos.find((c) => c.id === e.target.value)?.cargo ?? ''); }}>
                    {dados.concursos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Seu cargo" dica="A IA usa só os conteúdos deste cargo (e os comuns a todos).">
                {(id) => <Entrada id={id} value={cargo} placeholder="Ex.: Engenheiro Eletricista" onChange={(e) => setCargo(e.target.value)} />}
              </Campo>
            </div>
            <Campo rotulo="PDF do edital">
              {(id) => <Entrada id={id} type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />}
            </Campo>
            <p className="text-center text-sm font-bold text-suave">ou</p>
            <Campo rotulo="Texto do conteúdo programático" dica="Copie do PDF ou do site da banca e cole aqui.">
              {(id) => <AreaTexto id={id} className="min-h-40 text-sm" value={colado} disabled={Boolean(arquivo)} onChange={(e) => setColado(e.target.value)} />}
            </Campo>
            {lendo && <p className="text-sm font-bold text-verde-forte" aria-live="polite">{lendo}</p>}
            <Botao className="justify-self-start" disabled={Boolean(lendo) || (!arquivo && colado.trim().length < 20)} onClick={() => void lerFonte()}>
              <FileUp size={18} /> {arquivo ? 'Ler o PDF' : 'Continuar'}
            </Botao>
          </div>
        </Cartao>
      )}

      {(etapa === 'trecho' || etapa === 'processando') && (
        <Cartao>
          <div className="grid grid-cols-1 gap-3">
            <p className="text-sm text-suave">
              Confira o trecho: apague o que não for do seu cargo. Se o edital tem a tabela de provas (peso e número de questões), cole-a no final.
            </p>
            <AreaTexto aria-label="Trecho do conteúdo programático" className="min-h-72 font-mono text-xs" value={trecho} disabled={etapa === 'processando'} onChange={(e) => setTrecho(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-suave">
              <Etiqueta>{trecho.length.toLocaleString('pt-BR')} caracteres</Etiqueta>
              <Etiqueta tom="roxo">
                {partes.length} {partes.length === 1 ? 'chamada' : 'chamadas'} à IA do seu plano
              </Etiqueta>
              {texto && trecho.length < texto.length && (
                <button type="button" className="font-bold text-verde-forte underline" onClick={() => setTrecho(texto)}>
                  Usar o texto inteiro
                </button>
              )}
            </div>
            {etapa === 'processando' ? (
              <div className="flex flex-wrap items-center gap-3" aria-live="polite">
                <Sparkles className="animate-pulse text-verde" />
                <span className="font-bold">
                  Estruturando a parte {progresso.parte} de {progresso.total}… O Claude pensa antes de responder; pode levar alguns minutos.
                </span>
                <Botao variante="secundario" tamanho="pequeno" onClick={() => controle.current?.abort()}>
                  Parar
                </Botao>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" onClick={() => setEtapa('fonte')}>
                  Voltar
                </Botao>
                <Botao disabled={!recursos.ia || !trecho.trim()} onClick={() => void estruturar()}>
                  <Sparkles size={18} /> Estruturar com IA
                </Botao>
              </div>
            )}
          </div>
        </Cartao>
      )}

      {etapa === 'revisao' && (
        <div className="grid grid-cols-1 gap-4">
          {itens.map((item) => (
            <Cartao key={item.chave} className={item.incluir ? '' : 'opacity-60'}>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 font-bold">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={item.incluir} onChange={(e) => mudarItem(item.chave, { incluir: e.target.checked })} />
                    Importar
                  </label>
                  <Entrada aria-label="Nome da disciplina" className="min-w-0 flex-1 font-bold" value={item.nome} onChange={(e) => mudarItem(item.chave, { nome: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Campo rotulo="Peso">
                    {(id) => <Entrada id={id} type="number" min={0} step="0.1" value={item.peso ?? ''} placeholder="1" onChange={(e) => mudarItem(item.chave, { peso: e.target.value ? Number(e.target.value) : null })} />}
                  </Campo>
                  <Campo rotulo="Nº de questões">
                    {(id) => <Entrada id={id} type="number" min={0} value={item.numQuestoes ?? ''} onChange={(e) => mudarItem(item.chave, { numQuestoes: e.target.value ? Number(e.target.value) : null })} />}
                  </Campo>
                  <Campo rotulo="Tipo">
                    {(id) => (
                      <Selecao id={id} value={item.tipo} onChange={(e) => mudarItem(item.chave, { tipo: e.target.value as TipoDisciplina })}>
                        {Object.entries(TIPO_DISCIPLINA).map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </Campo>
                  <Campo rotulo="Salvar em">
                    {(id) => (
                      <Selecao id={id} value={item.destinoId ?? ''} onChange={(e) => mudarItem(item.chave, { destinoId: e.target.value || null })}>
                        <option value="">Nova disciplina</option>
                        {existentes.map((d) => (
                          <option key={d.id} value={d.id}>
                            Juntar em: {d.nome}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </Campo>
                </div>
                <div>
                  <p className="mb-1 text-sm font-bold text-suave">{contarTopicos(item.topicos)} tópicos</p>
                  <ArvoreEditavel topicos={item.topicos} aoMudar={(topicos) => mudarItem(item.chave, { topicos })} />
                  <Botao tamanho="pequeno" variante="fantasma" className="mt-1" onClick={() => mudarItem(item.chave, { topicos: [...item.topicos, { titulo: 'Novo tópico', filhos: [] }] })}>
                    <Plus size={15} /> Tópico
                  </Botao>
                </div>
              </div>
            </Cartao>
          ))}
          <Cartao>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid grid-cols-1 gap-1">
                <p className="font-bold">
                  {itens.filter((i) => i.incluir).length} disciplinas e {totalTopicos} tópicos serão salvos em {concurso?.nome}.
                </p>
                {arquivo && recursos.arquivos && (
                  <label className="flex items-center gap-2 text-sm text-suave">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={guardarPdf} onChange={(e) => setGuardarPdf(e.target.checked)} />
                    Guardar o PDF do edital no app
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" onClick={() => setEtapa('trecho')}>
                  Voltar ao trecho
                </Botao>
                <Botao disabled={salvando || !itens.some((i) => i.incluir)} onClick={() => void salvar()}>
                  {salvando ? 'Salvando…' : 'Salvar edital'}
                </Botao>
              </div>
            </div>
          </Cartao>
        </div>
      )}
    </>
  );
}

function limparVazios(topicos: TopicoImportado[]): TopicoImportado[] {
  return topicos
    .filter((t) => t.titulo.trim())
    .map((t) => ({ titulo: t.titulo.trim(), filhos: limparVazios(t.filhos) }));
}
