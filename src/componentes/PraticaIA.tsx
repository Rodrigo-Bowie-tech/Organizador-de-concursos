import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { estiloDaBanca, LETRAS, montarPedido, validarQuestoes } from '../dominio/pratica';
import type { Dificuldade, EstiloQuestao, QuestaoGerada } from '../dominio/pratica';
import { hojeSP } from '../dominio/painel';
import { caminhoDoTopico } from '../dominio/topicos';
import { proximaRevisaoErro } from '../dominio/desempenho';
import type { Id } from '../dominio/tipos';
import { useApp } from '../estado';
import { mensagemErroIA } from '../plataforma';
import { Alternativas } from './Alternativas';
import { Botao, Campo, Entrada, Etiqueta, Modal, Selecao, cx } from './ui';

type Etapa = 'configurar' | 'gerando' | 'respondendo' | 'resultado';

/** Botão "Praticar com IA", visível só quando a IA do claude.ai está disponível. */
export function BotaoPraticar({
  disciplinaId,
  topicoId,
  tamanho = 'pequeno',
  variante = 'secundario',
}: {
  disciplinaId: Id;
  topicoId: Id | null;
  tamanho?: 'pequeno' | 'normal';
  variante?: 'primario' | 'secundario';
}) {
  const { recursos } = useApp();
  const [aberto, setAberto] = useState(false);
  if (!recursos.ia) return null;
  return (
    <>
      <Botao tamanho={tamanho} variante={variante} onClick={() => setAberto(true)}>
        <Sparkles size={16} /> Praticar com IA
      </Botao>
      {aberto && <ModalPratica disciplinaId={disciplinaId} topicoId={topicoId} aoFechar={() => setAberto(false)} />}
    </>
  );
}

export function ModalPratica({ disciplinaId, topicoId, aoFechar }: { disciplinaId: Id; topicoId: Id | null; aoFechar: () => void }) {
  const { dados, recursos, repo, executar, avisar } = useApp();
  const disciplina = dados.disciplinas.find((d) => d.id === disciplinaId);
  const concurso = dados.concursos.find((c) => c.id === disciplina?.concursoId);
  const topico = topicoId ? disciplina?.topicos[topicoId] : undefined;

  const [etapa, setEtapa] = useState<Etapa>('configurar');
  const [banca, setBanca] = useState(concurso?.banca ?? '');
  const [estilo, setEstilo] = useState<EstiloQuestao>(estiloDaBanca(concurso?.banca ?? ''));
  const [quantidade, setQuantidade] = useState(5);
  const [dificuldade, setDificuldade] = useState<Dificuldade>('media');
  const [recebido, setRecebido] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [questoes, setQuestoes] = useState<QuestaoGerada[]>([]);
  const [respostas, setRespostas] = useState<(number | null)[]>([]);
  const [atual, setAtual] = useState(0);
  const [salvo, setSalvo] = useState(false);
  const [noCaderno, setNoCaderno] = useState<Set<number>>(new Set());
  const inicio = useRef(new Date());
  const controle = useRef<AbortController | null>(null);

  useEffect(() => () => controle.current?.abort(), []);

  if (!disciplina) return null;
  const caminho = topico ? caminhoDoTopico(disciplina.topicos, topico.id) : [disciplina.nome];

  async function gerar() {
    if (!recursos.ia || !disciplina) return;
    setErro(null);
    setRecebido(0);
    setEtapa('gerando');
    const ctl = new AbortController();
    controle.current = ctl;
    try {
      const resposta = await recursos.ia.json(
        montarPedido({
          banca,
          concurso: concurso?.nome ?? '',
          cargo: concurso?.cargo ?? '',
          area: concurso?.area ?? '',
          disciplina: disciplina.nome,
          caminho,
          quantidade,
          estilo,
          dificuldade,
        }),
        { signal: ctl.signal, cache: false, onText: ({ text }) => setRecebido(text.length) },
      );
      const validas = validarQuestoes(resposta, estilo);
      if (!validas.length) throw { code: 'invalid_json' };
      setQuestoes(validas);
      setRespostas(validas.map(() => null));
      setAtual(0);
      setSalvo(false);
      setNoCaderno(new Set());
      inicio.current = new Date();
      setEtapa('respondendo');
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      setEtapa('configurar');
      if (codigo !== 'cancelled') setErro(mensagemErroIA(codigo));
    }
  }

  const acertos = respostas.filter((r, i) => r !== null && r === questoes[i]?.correta).length;
  const respondidas = respostas.filter((r) => r !== null).length;

  async function salvar() {
    if (!disciplina) return;
    const onde = await executar(() =>
      repo.registrarPratica({
        concursoId: disciplina.concursoId,
        disciplinaId: disciplina.id,
        topicoId: topico?.id ?? null,
        feitas: respondidas,
        acertos,
        inicio: inicio.current,
        descricao: `Prática com IA · ${banca || 'sem banca'} · ${respondidas} questões`,
      }),
    );
    if (onde) {
      setSalvo(true);
      avisar(onde === 'ativa' ? 'Questões somadas à sessão em andamento.' : 'Prática salva no histórico.');
    }
  }

  async function mandarParaCaderno(i: number) {
    if (!disciplina) return;
    const x = questoes[i];
    const letra = (k: number) => (estilo === 'certo_errado' ? x.alternativas[k] : `${LETRAS[k]}) ${x.alternativas[k]}`);
    const hoje = hojeSP();
    const enunciado = estilo === 'certo_errado' ? x.enunciado : `${x.enunciado}\n${x.alternativas.map((a, k) => `${LETRAS[k]}) ${a}`).join('\n')}`;
    const id = await executar(
      () =>
        repo.salvarErro({
          disciplinaId: disciplina.id,
          topicoId: topico?.id ?? null,
          enunciado,
          minhaResposta: respostas[i] === null ? '' : letra(respostas[i] as number),
          respostaCerta: letra(x.correta),
          motivo: 'falta_conteudo',
          comentario: '',
          fonte: `Prática com IA (${banca || 'sem banca'})`,
          criadoEm: hoje,
          revisoesFeitas: [],
          proximaRevisao: proximaRevisaoErro(hoje, []),
          explicacaoIA: x.explicacao,
        }),
      'Questão anotada no caderno de erros.',
    );
    if (id) setNoCaderno(new Set(noCaderno).add(i));
  }

  const q = questoes[atual];
  const escolhida = respostas[atual];

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largo
      titulo={`Praticar: ${topico?.titulo ?? disciplina.nome}`}
      rodape={
        etapa === 'configurar' ? (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao onClick={() => void gerar()}>
              <Sparkles size={16} /> Gerar questões
            </Botao>
          </>
        ) : etapa === 'gerando' ? (
          <Botao variante="secundario" onClick={() => controle.current?.abort()}>
            Parar
          </Botao>
        ) : etapa === 'respondendo' ? (
          <Botao
            disabled={escolhida === null}
            onClick={() => (atual + 1 < questoes.length ? setAtual(atual + 1) : setEtapa('resultado'))}
          >
            {atual + 1 < questoes.length ? 'Próxima' : 'Ver resultado'}
          </Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={() => setEtapa('configurar')}>
              Gerar outras
            </Botao>
            <Botao disabled={salvo || !respondidas} onClick={() => void salvar()}>
              {salvo ? 'Salvo' : 'Salvar no histórico'}
            </Botao>
          </>
        )
      }
    >
      {etapa === 'configurar' && (
        <div className="grid gap-4">
          <p className="text-sm text-suave">{caminho.join(' › ')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Banca">
              {(id) => (
                <Entrada
                  id={id}
                  value={banca}
                  placeholder="Ex.: FCC"
                  onChange={(e) => {
                    setBanca(e.target.value);
                    setEstilo(estiloDaBanca(e.target.value));
                  }}
                />
              )}
            </Campo>
            <Campo rotulo="Formato">
              {(id) => (
                <Selecao id={id} value={estilo} onChange={(e) => setEstilo(e.target.value as EstiloQuestao)}>
                  <option value="multipla">Múltipla escolha (A a E)</option>
                  <option value="certo_errado">Certo ou errado</option>
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Quantidade">
              {(id) => (
                <Selecao id={id} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))}>
                  <option value={5}>5 questões</option>
                  <option value={10}>10 questões</option>
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Dificuldade">
              {(id) => (
                <Selecao id={id} value={dificuldade} onChange={(e) => setDificuldade(e.target.value as Dificuldade)}>
                  <option value="facil">Fácil</option>
                  <option value="media">Média</option>
                  <option value="dificil">Difícil</option>
                </Selecao>
              )}
            </Campo>
          </div>
          {erro && (
            <p role="alert" className="rounded-lg bg-perigo-suave px-3 py-2 text-sm font-bold text-perigo">
              {erro}
            </p>
          )}
          <p className="text-xs text-suave">
            Usa o seu plano do Claude. As questões são geradas por IA e podem conter erros: confira no seu material.
          </p>
        </div>
      )}

      {etapa === 'gerando' && (
        <div className="grid place-items-center gap-2 py-8 text-center" aria-live="polite">
          <Sparkles className="animate-pulse text-verde" size={32} />
          <p className="font-extrabold">Gerando {quantidade} questões no estilo {banca || 'da banca'}…</p>
          <p className="text-sm text-suave">
            {recebido ? `Recebendo a resposta (${recebido.toLocaleString('pt-BR')} caracteres)…` : 'O Claude pensa antes de responder. Pode levar até um minuto.'}
          </p>
        </div>
      )}

      {etapa === 'respondendo' && q && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <Etiqueta tom="roxo">
              Questão {atual + 1} de {questoes.length}
            </Etiqueta>
            <Etiqueta>Gerada por IA</Etiqueta>
          </div>
          <p className="font-bold whitespace-pre-line">{q.enunciado}</p>
          <Alternativas
            alternativas={q.alternativas}
            correta={q.correta}
            escolhida={escolhida}
            comLetras={estilo !== 'certo_errado'}
            aoEscolher={(i) => setRespostas((r) => r.map((x, k) => (k === atual ? i : x)))}
          />
          {escolhida !== null && (
            <div className="rounded-lg bg-superficie-2 px-3 py-2.5">
              <p className={cx('font-extrabold', escolhida === q.correta ? 'text-ok' : 'text-perigo')}>
                {escolhida === q.correta ? 'Acertou!' : `Errou. Resposta: ${estilo === 'certo_errado' ? q.alternativas[q.correta] : LETRAS[q.correta]}`}
              </p>
              {q.explicacao && <p className="mt-1 text-sm">{q.explicacao}</p>}
            </div>
          )}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="grid gap-4">
          <div className="text-center">
            <p className="numeros text-4xl font-extrabold">
              {acertos} de {questoes.length}
            </p>
            <p className="text-suave">{Math.round((acertos / Math.max(1, questoes.length)) * 100)}% de acerto</p>
          </div>
          {acertos < questoes.length && (
            <div>
              <p className="mb-2 font-extrabold">Para revisar</p>
              <ul className="grid gap-2">
                {questoes.map((x, i) =>
                  respostas[i] !== x.correta ? (
                    <li key={i} className="rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                      <p className="font-bold">{x.enunciado}</p>
                      <p className="mt-1 text-ok">Resposta: {x.alternativas[x.correta]}</p>
                      {x.explicacao && <p className="mt-1 text-suave">{x.explicacao}</p>}
                      <Botao tamanho="pequeno" variante="fantasma" className="mt-1" disabled={noCaderno.has(i)} onClick={() => void mandarParaCaderno(i)}>
                        {noCaderno.has(i) ? 'No caderno de erros' : 'Mandar para o caderno de erros'}
                      </Botao>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
          <p className="text-xs text-suave">
            {dados.ativa ? 'Salvar soma as questões na sessão do cronômetro em andamento.' : 'Salvar cria uma sessão de questões no histórico, com o tempo desta prática.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
