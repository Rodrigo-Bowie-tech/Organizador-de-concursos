import { FileUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Entrada, Etiqueta, Modal, Selecao, Vazio } from '../componentes/ui';
import { acharTopico, agrupar, lerCsvDesempenho, todasAsQuestoes } from '../dominio/desempenho';
import type { LinhaCsv } from '../dominio/desempenho';
import { formatarData, somarDias } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { achatar } from '../dominio/topicos';
import type { Disciplina, Id } from '../dominio/tipos';
import { useApp } from '../estado';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Opções "disciplina › tópico" do concurso ativo, com valor `disciplinaId|topicoId`. */
function OpcoesTopico({ disciplinas }: { disciplinas: Disciplina[] }) {
  return (
    <>
      {disciplinas.map((d) => (
        <optgroup key={d.id} label={d.nome}>
          <option value={`${d.id}|`}>{d.nome} (disciplina inteira)</option>
          {achatar(d.topicos).map((l) => (
            <option key={l.topico.id} value={`${d.id}|${l.topico.id}`}>
              {'  '.repeat(l.nivel)}
              {l.numero} {l.topico.titulo}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

const separar = (v: string): { disciplinaId: Id | null; topicoId: Id | null } => {
  const [d, t] = v.split('|');
  return { disciplinaId: d || null, topicoId: t || null };
};

function ModalCsv({ aoFechar }: { aoFechar: () => void }) {
  const { disciplinas, concursoAtivo, repo, executar, avisar } = useApp();
  const [texto, setTexto] = useState('');
  const [destinos, setDestinos] = useState<Record<number, string>>({});
  const lido = useMemo(() => (texto.trim() ? lerCsvDesempenho(texto) : { linhas: [] as LinhaCsv[], erros: [] as string[] }), [texto]);
  const sugestao = (l: LinhaCsv) => {
    const achado = acharTopico(l.topico, disciplinas);
    return achado ? `${achado.disciplinaId}|${achado.topicoId}` : '';
  };
  const destino = (l: LinhaCsv) => destinos[l.linha] ?? sugestao(l);
  const hoje = hojeSP();

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Importar CSV de desempenho"
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!lido.linhas.length}
            onClick={async () => {
              const n = await executar(() =>
                repo.importarQuestoes(
                  lido.linhas.map((l) => ({
                    concursoId: concursoAtivo?.id ?? null,
                    ...separar(destino(l)),
                    dia: l.dia ?? hoje,
                    feitas: l.feitas,
                    acertos: l.acertos,
                    fonte: l.fonte || 'CSV',
                  })),
                ),
              );
              if (n) {
                avisar(`${n} registros importados.`);
                aoFechar();
              }
            }}
          >
            Importar {lido.linhas.length || ''} {lido.linhas.length === 1 ? 'linha' : 'linhas'}
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-suave">
          Colunas: tópico, questões feitas, acertos e, se quiser, data (dd/mm/aaaa) e fonte. Separadas por ponto e vírgula, vírgula ou tab, com ou sem
          cabeçalho. Serve para o desempenho do QConcursos, do TEC ou de planilhas suas.
        </p>
        <Entrada
          type="file"
          aria-label="Arquivo CSV"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setTexto(await f.text());
          }}
        />
        <AreaTexto aria-label="Conteúdo do CSV" className="min-h-32 font-mono text-xs" placeholder={'Tópico;Feitas;Acertos;Data;Fonte\nTransformadores;20;15;28/09/2026;QConcursos'} value={texto} onChange={(e) => setTexto(e.target.value)} />
        {lido.erros.length > 0 && (
          <ul className="text-sm text-alerta">
            {lido.erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {lido.linhas.length > 0 && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Linhas do CSV">
            <table className="w-full text-sm">
              <thead className="text-left text-suave">
                <tr>
                  <th className="py-1 pr-2">No CSV</th>
                  <th className="py-1 pr-2">Tópico no app</th>
                  <th className="numeros py-1 pr-2 text-right">Acertos</th>
                  <th className="py-1">Data</th>
                </tr>
              </thead>
              <tbody>
                {lido.linhas.map((l) => (
                  <tr key={l.linha} className="border-t border-borda">
                    <td className="py-1 pr-2">{l.topico}</td>
                    <td className="py-1 pr-2">
                      <Selecao aria-label={`Tópico para ${l.topico}`} className="py-1 text-xs" value={destino(l)} onChange={(e) => setDestinos({ ...destinos, [l.linha]: e.target.value })}>
                        <option value="">Sem tópico</option>
                        <OpcoesTopico disciplinas={disciplinas} />
                      </Selecao>
                    </td>
                    <td className="numeros py-1 pr-2 text-right">
                      {l.acertos}/{l.feitas}
                    </td>
                    <td className="numeros py-1">{formatarData(l.dia ?? hoje)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Questoes() {
  const { dados, disciplinas, concursoAtivo, repo, executar, irPara } = useApp();
  const hoje = hojeSP();
  const [alvo, setAlvo] = useState('');
  const [feitas, setFeitas] = useState('');
  const [acertos, setAcertos] = useState('');
  const [fonte, setFonte] = useState('');
  const [dia, setDia] = useState(hoje);
  const [csv, setCsv] = useState(false);

  const questoes = useMemo(() => {
    const ids = new Set(disciplinas.map((d) => d.id));
    return todasAsQuestoes(dados.sessoes, dados.registrosQuestoes).filter((q) => q.disciplinaId && ids.has(q.disciplinaId));
  }, [dados.sessoes, dados.registrosQuestoes, disciplinas]);
  const porDisciplina = agrupar(questoes, (q) => q.disciplinaId);
  const ultimos30 = questoes.filter((q) => q.dia >= somarDias(hoje, -29));
  const total30 = agrupar(ultimos30, () => 'x').get('x');
  const fontes = [...new Set(dados.registrosQuestoes.map((r) => r.fonte).filter(Boolean))];
  const nFeitas = Number(feitas);
  const nAcertos = Number(acertos);
  const valido = nFeitas > 0 && nAcertos >= 0 && nAcertos <= nFeitas && Boolean(dia);

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Questões" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso para lançar questões." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const nomeTopico = (disciplinaId: Id | null, topicoId: Id | null) => {
    const d = dados.disciplinas.find((x) => x.id === disciplinaId);
    return [d?.nome, topicoId ? d?.topicos[topicoId]?.titulo : null].filter(Boolean).join(' › ') || 'Sem disciplina';
  };

  return (
    <>
      <CabecalhoTela
        titulo="Questões"
        subtitulo={`${concursoAtivo.nome}${total30 ? ` · últimos 30 dias: ${total30.feitas} questões, ${pct(total30.taxa)} de acerto` : ''}`}
        acoes={
          <Botao variante="secundario" onClick={() => setCsv(true)}>
            <FileUp size={18} /> Importar CSV
          </Botao>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-4">
          <Cartao titulo="Lançamento rápido">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!valido) return;
                const id = await executar(
                  () => repo.salvarRegistroQuestoes({ concursoId: concursoAtivo.id, ...separar(alvo), dia, feitas: nFeitas, acertos: nAcertos, fonte: fonte.trim() }),
                  'Questões lançadas.',
                );
                if (id) {
                  setFeitas('');
                  setAcertos('');
                }
              }}
            >
              <Campo rotulo="Disciplina e tópico" className="sm:col-span-2">
                {(id) => (
                  <Selecao id={id} value={alvo} onChange={(e) => setAlvo(e.target.value)}>
                    <option value="">Sem disciplina</option>
                    <OpcoesTopico disciplinas={disciplinas} />
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Questões feitas">
                {(id) => <Entrada id={id} type="number" inputMode="numeric" min={1} value={feitas} onChange={(e) => setFeitas(e.target.value)} />}
              </Campo>
              <Campo rotulo="Acertos">
                {(id) => <Entrada id={id} type="number" inputMode="numeric" min={0} value={acertos} onChange={(e) => setAcertos(e.target.value)} />}
              </Campo>
              <Campo rotulo="Fonte" dica="QConcursos, TEC, prova FCC 2023…">
                {(id) => (
                  <>
                    <Entrada id={id} list="fontes-questoes" value={fonte} onChange={(e) => setFonte(e.target.value)} />
                    <datalist id="fontes-questoes">
                      {fontes.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </>
                )}
              </Campo>
              <Campo rotulo="Dia">
                {(id) => <Entrada id={id} type="date" value={dia} onChange={(e) => setDia(e.target.value)} />}
              </Campo>
              {nAcertos > nFeitas && <p className="text-sm text-alerta sm:col-span-2">Os acertos não podem passar das questões feitas.</p>}
              <Botao type="submit" disabled={!valido} className="justify-self-start">
                <Plus size={18} /> Lançar
              </Botao>
            </form>
          </Cartao>

          <Cartao titulo="Lançamentos avulsos">
            {!dados.registrosQuestoes.length ? (
              <p className="text-suave">Nenhum ainda. As questões feitas em sessões do cronômetro aparecem no Histórico.</p>
            ) : (
              <ul className="grid">
                {dados.registrosQuestoes.slice(0, 60).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borda py-2 first:border-t-0">
                    <span className="numeros w-24 text-sm text-suave">{formatarData(r.dia)}</span>
                    <span className="min-w-0 flex-1 basis-48 text-sm">
                      {nomeTopico(r.disciplinaId, r.topicoId)}
                      {r.fonte && <span className="text-suave"> · {r.fonte}</span>}
                    </span>
                    <span className="numeros font-bold">
                      {r.acertos}/{r.feitas} ({pct(r.acertos / r.feitas)})
                    </span>
                    <BotaoIcone rotulo="Excluir lançamento" onClick={() => void executar(() => repo.excluirRegistroQuestoes(r.id), 'Lançamento excluído.')}>
                      <Trash2 size={16} />
                    </BotaoIcone>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <Cartao titulo="Acerto por disciplina" className="content-start">
          {!disciplinas.length ? (
            <p className="text-suave">Cadastre as disciplinas do concurso.</p>
          ) : (
            <ul className="grid gap-2">
              {disciplinas.map((d) => {
                const t = porDisciplina.get(d.id);
                return (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.cor }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                    {t ? (
                      <Etiqueta tom={t.taxa >= 0.7 ? 'verde' : t.taxa >= 0.5 ? 'neutro' : 'alerta'}>
                        {pct(t.taxa)} · {t.feitas}
                      </Etiqueta>
                    ) : (
                      <span className="text-sm text-suave">–</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-suave">Inclui as sessões do cronômetro, a prática com IA e os lançamentos avulsos.</p>
        </Cartao>
      </div>
      {csv && <ModalCsv aoFechar={() => setCsv(false)} />}
    </>
  );
}
