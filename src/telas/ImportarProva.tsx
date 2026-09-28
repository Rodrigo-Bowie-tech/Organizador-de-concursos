import { ArrowLeft, FileUp, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { EditorQuestoes } from '../componentes/QuestoesProva';
import type { QuestaoEditavel } from '../componentes/QuestoesProva';
import { AreaTexto, Botao, CabecalhoTela, Campo, Cartao, Entrada, Etiqueta, Selecao, cx } from '../componentes/ui';
import { aplicarGabarito, codigosDoEdital, dividirProva, juntarQuestoes, lerGabarito, montarPedidoProva, validarQuestoesProva } from '../dominio/provas';
import type { QuestaoImportada } from '../dominio/provas';
import { useApp } from '../estado';
import { extrairTextoPdf } from '../pdf';
import { mensagemErroIA } from '../plataforma';

type Etapa = 'fonte' | 'texto' | 'processando' | 'revisao';

export function ImportarProva() {
  const { dados, concursoAtivo, recursos, repo, executar, avisar, irPara } = useApp();
  const [etapa, setEtapa] = useState<Etapa>('fonte');
  const [concursoId, setConcursoId] = useState(concursoAtivo?.id ?? dados.concursos[0]?.id ?? '');
  const concurso = dados.concursos.find((c) => c.id === concursoId);
  const [banca, setBanca] = useState(concurso?.banca ?? '');
  const [orgao, setOrgao] = useState('');
  const [ano, setAno] = useState('');
  const [cargo, setCargo] = useState(concurso?.cargo ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [colado, setColado] = useState('');
  const [gabarito, setGabarito] = useState('');
  const [texto, setTexto] = useState('');
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState({ parte: 0, total: 0, achadas: 0 });
  const [questoes, setQuestoes] = useState<QuestaoEditavel[]>([]);
  const [guardarPdf, setGuardarPdf] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const controle = useRef<AbortController | null>(null);

  const disciplinas = useMemo(() => dados.disciplinas.filter((d) => d.concursoId === concursoId).sort((a, b) => a.ordem - b.ordem), [dados.disciplinas, concursoId]);
  const partes = useMemo(() => dividirProva(texto), [texto]);
  const titulo = [banca.trim() || 'Prova', ano.trim(), orgao.trim()].filter(Boolean).join(' · ');

  function escolherConcurso(id: string) {
    setConcursoId(id);
    const c = dados.concursos.find((x) => x.id === id);
    setBanca(c?.banca ?? '');
    setCargo(c?.cargo ?? '');
  }

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
        setErro('O PDF quase não tem texto (pode ser escaneado). Copie as questões e cole no campo de texto.');
        return;
      }
    }
    setTexto(bruto.trim());
    setEtapa('texto');
  }

  async function separar() {
    if (!recursos.ia || !concurso) return;
    setErro(null);
    setEtapa('processando');
    const ctl = new AbortController();
    controle.current = ctl;
    const codigos = codigosDoEdital(disciplinas);
    const resultados: QuestaoImportada[][] = [];
    try {
      for (let i = 0; i < partes.length; i++) {
        setProgresso({ parte: i + 1, total: partes.length, achadas: resultados.flat().length });
        const resposta = await recursos.ia.json(
          montarPedidoProva(partes[i], { banca, concurso: concurso.nome, cargo, codigos, parte: i + 1, totalPartes: partes.length }),
          { signal: ctl.signal, modelTier: 'default' },
        );
        resultados.push(validarQuestoesProva(resposta, codigos));
      }
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      setEtapa('texto');
      if (codigo !== 'cancelled') setErro(mensagemErroIA(codigo));
      return;
    }
    let juntas = juntarQuestoes(resultados);
    if (!juntas.length) {
      setEtapa('texto');
      setErro('A IA não encontrou questões neste texto. Confira se é o caderno de questões.');
      return;
    }
    const g = lerGabarito(gabarito);
    if (g.size) juntas = aplicarGabarito(juntas, g);
    setQuestoes(juntas.map((q) => ({ ...q, chave: String(q.numero) })));
    setEtapa('revisao');
  }

  async function salvar() {
    if (!concurso) return;
    setSalvando(true);
    const id = await executar(() =>
      repo.importarProva({
        concursoId: concurso.id,
        titulo,
        banca: banca.trim(),
        orgao: orgao.trim(),
        ano: Number(ano) > 1900 ? Number(ano) : null,
        cargo: cargo.trim(),
        arquivo: guardarPdf ? arquivo : null,
        questoes: questoes.map(({ chave: _, ...q }) => q),
      }),
    );
    setSalvando(false);
    if (id) {
      avisar(`Prova salva com ${questoes.length} questões. A incidência já entra no planejamento.`);
      irPara('provas');
    }
  }

  if (!dados.concursos.length) {
    return (
      <>
        <CabecalhoTela titulo="Importar prova anterior" />
        <Cartao>
          <p className="text-suave">Cadastre o concurso e o edital antes de importar provas.</p>
        </Cartao>
      </>
    );
  }

  return (
    <>
      <CabecalhoTela
        titulo="Importar prova anterior"
        subtitulo="A IA separa as questões e liga cada uma a um assunto do seu edital. Nada é salvo antes da sua revisão."
        acoes={
          <Botao variante="secundario" onClick={() => irPara('provas')}>
            <ArrowLeft size={18} /> Voltar às provas
          </Botao>
        }
      />

      <ol className="mb-4 flex flex-wrap gap-2 text-sm font-bold" aria-label="Etapas">
        {(['fonte', 'texto', 'revisao'] as const).map((e, i) => {
          const atual = etapa === e || (etapa === 'processando' && e === 'texto');
          return (
            <li key={e} className={cx('rounded-full px-3 py-1', atual ? 'bg-verde text-white' : 'bg-superficie-2 text-suave')} aria-current={atual ? 'step' : undefined}>
              {i + 1}. {e === 'fonte' ? 'Arquivo ou texto' : e === 'texto' ? 'Questões' : 'Revisão'}
            </li>
          );
        })}
      </ol>

      {!recursos.ia && (
        <p className="mb-4 rounded-lg bg-alerta/15 px-4 py-2 text-sm font-bold text-alerta">A separação das questões com IA só funciona no app aberto no claude.ai.</p>
      )}
      {!disciplinas.length && (
        <p className="mb-4 rounded-lg bg-alerta/15 px-4 py-2 text-sm font-bold text-alerta">
          Este concurso ainda não tem disciplinas: importe o edital antes, para as questões terem onde se encaixar.
        </p>
      )}
      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-perigo-suave px-4 py-2 text-sm font-bold text-perigo">
          {erro}
        </p>
      )}

      {etapa === 'fonte' && (
        <Cartao>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Edital de referência" dica="As questões são ligadas aos tópicos deste concurso.">
                {(id) => (
                  <Selecao id={id} value={concursoId} onChange={(e) => escolherConcurso(e.target.value)}>
                    {dados.concursos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Banca" dica="A incidência vale para os concursos desta banca.">
                {(id) => <Entrada id={id} value={banca} placeholder="Ex.: FCC" onChange={(e) => setBanca(e.target.value)} />}
              </Campo>
              <Campo rotulo="Órgão da prova">{(id) => <Entrada id={id} value={orgao} placeholder="Ex.: Sabesp" onChange={(e) => setOrgao(e.target.value)} />}</Campo>
              <Campo rotulo="Ano">{(id) => <Entrada id={id} type="number" min={1990} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} />}</Campo>
              <Campo rotulo="Cargo da prova" className="sm:col-span-2">
                {(id) => <Entrada id={id} value={cargo} onChange={(e) => setCargo(e.target.value)} />}
              </Campo>
            </div>
            <Campo rotulo="PDF da prova">
              {(id) => <Entrada id={id} type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />}
            </Campo>
            <p className="text-center text-sm font-bold text-suave">ou</p>
            <Campo rotulo="Texto das questões" dica="Copie do PDF da banca e cole aqui.">
              {(id) => <AreaTexto id={id} className="min-h-40 text-sm" value={colado} disabled={Boolean(arquivo)} onChange={(e) => setColado(e.target.value)} />}
            </Campo>
            <Campo rotulo="Gabarito (opcional)" dica="Ex.: 1-A 2-C 3-E. Dá para colar depois, na revisão.">
              {(id) => <AreaTexto id={id} className="min-h-16 font-mono text-sm" value={gabarito} onChange={(e) => setGabarito(e.target.value)} />}
            </Campo>
            {lendo && (
              <p className="text-sm font-bold text-verde-forte" aria-live="polite">
                {lendo}
              </p>
            )}
            <Botao className="justify-self-start" disabled={Boolean(lendo) || !concurso || (!arquivo && colado.trim().length < 20)} onClick={() => void lerFonte()}>
              <FileUp size={18} /> {arquivo ? 'Ler o PDF' : 'Continuar'}
            </Botao>
          </div>
        </Cartao>
      )}

      {(etapa === 'texto' || etapa === 'processando') && (
        <Cartao>
          <div className="grid gap-3">
            <p className="text-sm text-suave">Confira o texto: pode apagar capa, instruções e redação. Questões cortadas no meio são ignoradas.</p>
            <AreaTexto aria-label="Texto da prova" className="min-h-72 font-mono text-xs" value={texto} disabled={etapa === 'processando'} onChange={(e) => setTexto(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-suave">
              <Etiqueta>{texto.length.toLocaleString('pt-BR')} caracteres</Etiqueta>
              <Etiqueta tom="roxo">
                {partes.length} {partes.length === 1 ? 'chamada' : 'chamadas'} à IA do seu plano
              </Etiqueta>
            </div>
            {etapa === 'processando' ? (
              <div className="flex flex-wrap items-center gap-3" aria-live="polite">
                <Sparkles className="animate-pulse text-verde" />
                <span className="font-bold">
                  Separando a parte {progresso.parte} de {progresso.total}
                  {progresso.achadas ? ` (${progresso.achadas} questões até agora)` : ''}… Pode levar alguns minutos.
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
                <Botao disabled={!recursos.ia || !texto.trim()} onClick={() => void separar()}>
                  <Sparkles size={18} /> Separar questões com IA
                </Botao>
              </div>
            )}
          </div>
        </Cartao>
      )}

      {etapa === 'revisao' && (
        <div className="grid gap-4">
          <Cartao titulo={titulo}>
            <EditorQuestoes questoes={questoes} disciplinas={disciplinas} aoMudar={setQuestoes} />
          </Cartao>
          <Cartao>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <p className="font-bold">
                  {questoes.length} questões serão salvas, ligadas ao edital de {concurso?.nome}.
                </p>
                {arquivo && recursos.arquivos && (
                  <label className="flex items-center gap-2 text-sm text-suave">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={guardarPdf} onChange={(e) => setGuardarPdf(e.target.checked)} />
                    Guardar o PDF da prova no app
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" onClick={() => setEtapa('texto')}>
                  Voltar ao texto
                </Botao>
                <Botao disabled={salvando || !questoes.length} onClick={() => void salvar()}>
                  {salvando ? 'Salvando…' : 'Salvar prova'}
                </Botao>
              </div>
            </div>
          </Cartao>
        </div>
      )}
    </>
  );
}
