import { CalendarClock, Flame, Play, RefreshCcw } from 'lucide-react';
import { useMemo } from 'react';
import { Botao, CabecalhoTela, Cartao, Etiqueta, Progresso, Vazio, cx } from '../componentes/ui';
import { estadoDaSessao, segundosLiquidos, segundosPorDia } from '../dominio/cronometro';
import { diaDaSemana, formatarData, formatarDuracao, formatarRelogio } from '../dominio/datas';
import { projecaoCobertura } from '../dominio/balanco';
import { cobertura, hojeSP, provasFuturas, sequenciaDeDias, totaisPorPeriodo, ultimosDias } from '../dominio/painel';
import { revisoesAgendadas, separarRevisoes } from '../dominio/revisoes';
import { useAgora, useApp } from '../estado';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function Meta({ rotulo, segundos, metaMin }: { rotulo: string; segundos: number; metaMin: number }) {
  const fracao = metaMin > 0 ? segundos / (metaMin * 60) : 0;
  return (
    <Cartao className="flex flex-col gap-2">
      <p className="text-sm font-extrabold tracking-wide text-suave uppercase">{rotulo}</p>
      <p className="numeros text-3xl font-extrabold">{formatarDuracao(segundos)}</p>
      <Progresso rotulo={`${rotulo}: progresso da meta`} fracao={fracao} />
      <p className="numeros text-sm text-suave">
        {Math.round(fracao * 100)}% da meta de {formatarDuracao(metaMin * 60)}
      </p>
    </Cartao>
  );
}

export function Home() {
  const { dados, irPara, escolherConcurso } = useApp();
  const ativa = dados.ativa;
  const agora = useAgora(ativa ? 1000 : 60_000);
  const hoje = hojeSP(agora);

  const porDia = useMemo(
    () => segundosPorDia(ativa ? [...dados.sessoes, ativa] : dados.sessoes, agora),
    [dados.sessoes, ativa, agora],
  );
  const totais = totaisPorPeriodo(porDia, hoje);
  const sequencia = sequenciaDeDias(porDia, hoje);
  const provas = provasFuturas(dados.concursos, hoje);
  const faixa = ultimosDias(porDia, hoje, 28);
  const metaDiaSeg = Math.max(1, dados.config.metaDiariaMin * 60);
  const revisoes = separarRevisoes(revisoesAgendadas(dados.disciplinas, hoje));
  const feitasHoje = dados.revisoesFeitas.filter((r) => r.dia === hoje).length;

  if (!dados.concursos.length) {
    return (
      <>
        <CabecalhoTela titulo="Home" subtitulo={`${DIAS[diaDaSemana(hoje)]}, ${formatarData(hoje)}`} />
        <Vazio
          titulo="Comece cadastrando um concurso"
          texto="Cadastre o concurso, as disciplinas e os tópicos do edital. Depois é só ligar o cronômetro."
          acao={<Botao onClick={() => irPara('concursos')}>Cadastrar concurso</Botao>}
        />
      </>
    );
  }

  const discAtiva = ativa ? dados.disciplinas.find((d) => d.id === ativa.disciplinaId) : null;

  return (
    <>
      <CabecalhoTela titulo="Home" subtitulo={`${DIAS[diaDaSemana(hoje)]}, ${formatarData(hoje)}`} />

      <div className="grid gap-4">
        {ativa && (
          <button
            type="button"
            onClick={() => irPara('cronometro')}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-verde px-5 py-4 text-left text-white shadow-cartao transition hover:brightness-95"
          >
            <Play size={22} />
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">
                {estadoDaSessao(ativa) === 'pausada' ? 'Sessão pausada' : 'Sessão em andamento'}
              </span>
              <span className="block truncate text-sm opacity-90">{discAtiva?.nome ?? 'Sem disciplina'}</span>
            </span>
            <span className="numeros font-mono text-2xl font-semibold">{formatarRelogio(segundosLiquidos(ativa, agora))}</span>
          </button>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Meta rotulo="Hoje" segundos={totais.hoje} metaMin={dados.config.metaDiariaMin} />
          <Meta rotulo="Semana" segundos={totais.semana} metaMin={dados.config.metaSemanalMin} />
          <Meta rotulo="Mês" segundos={totais.mes} metaMin={dados.config.metaMensalMin} />
        </div>

        {(revisoes.atrasadas.length > 0 || revisoes.hoje.length > 0 || feitasHoje > 0) && (
          <Cartao
            titulo={<span className="flex items-center gap-2"><RefreshCcw size={18} /> Revisões</span>}
            acao={
              revisoes.atrasadas.length + revisoes.hoje.length > 0 && (
                <Botao tamanho="pequeno" onClick={() => irPara('revisoes')}>
                  Revisar agora
                </Botao>
              )
            }
          >
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {revisoes.atrasadas.length > 0 && (
                <p className="font-bold text-alerta">
                  {revisoes.atrasadas.length} {revisoes.atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}
                </p>
              )}
              <p className="font-bold">{revisoes.hoje.length} para hoje</p>
              <p className="text-suave">{feitasHoje} {feitasHoje === 1 ? 'feita' : 'feitas'} hoje</p>
            </div>
          </Cartao>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo={<span className="flex items-center gap-2"><CalendarClock size={18} /> Provas</span>}>
            {provas.length ? (
              <ul className="grid gap-3">
                {provas.map(({ concurso, dias }) => (
                  <li key={concurso.id} className="flex items-center gap-4">
                    <span className="numeros w-16 shrink-0 rounded-lg bg-verde-suave py-1.5 text-center leading-tight text-verde-forte">
                      <span className="block text-2xl font-extrabold">{dias}</span>
                      <span className="block text-xs font-bold">{dias === 1 ? 'dia' : 'dias'}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{concurso.nome}</span>
                      <span className="block text-sm text-suave">
                        {formatarData(concurso.dataProva!)} · {concurso.banca || 'banca a confirmar'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-suave">
                Nenhuma prova com data definida. Informe a data em{' '}
                <button type="button" className="font-bold text-verde-forte underline" onClick={() => irPara('concursos')}>
                  Concursos
                </button>{' '}
                para ver a contagem regressiva.
              </p>
            )}
          </Cartao>

          <Cartao titulo="Cobertura do edital">
            <ul className="grid gap-4">
              {dados.concursos.map((c) => {
                const discs = dados.disciplinas.filter((d) => d.concursoId === c.id);
                const cob = cobertura(discs);
                const proj = c.dataProva ? projecaoCobertura(discs, dados.sessoes, c.dataProva, hoje) : null;
                return (
                  <li key={c.id} className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <button
                        type="button"
                        className="truncate text-left font-bold hover:text-verde-forte"
                        onClick={() => {
                          escolherConcurso(c.id);
                          irPara('edital');
                        }}
                      >
                        {c.nome}
                      </button>
                      <span className="numeros shrink-0 text-sm text-suave">
                        {cob.total ? `${cob.concluidos} de ${cob.total} tópicos` : 'sem tópicos'}
                      </span>
                    </div>
                    <Progresso rotulo={`Cobertura de ${c.nome}`} fracao={cob.fracao} />
                    {proj && (
                      <p className="text-xs text-suave">
                        No ritmo real, você cobre <strong className={proj.fracaoProjetada < 0.95 ? 'text-alerta' : 'text-verde-forte'}>{Math.round(proj.fracaoProjetada * 100)}%</strong> do edital até a prova.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-suave">Conta os tópicos com teoria concluída, revisados ou dominados.</p>
          </Cartao>
        </div>

        <Cartao
          titulo={<span className="flex items-center gap-2"><Flame size={18} /> Sequência</span>}
          acao={<Etiqueta tom={sequencia ? 'verde' : 'neutro'}>{sequencia} {sequencia === 1 ? 'dia seguido' : 'dias seguidos'}</Etiqueta>}
        >
          <div className="grid max-w-xl grid-cols-7 gap-1.5 sm:gap-2" role="list" aria-label="Últimos 28 dias">
            {faixa.map(({ dia, segundos }) => {
              const nivel = segundos < 60 ? 0 : Math.min(4, Math.ceil((segundos / metaDiaSeg) * 4));
              return (
                <div
                  key={dia}
                  role="listitem"
                  title={`${formatarData(dia)}: ${formatarDuracao(segundos)}`}
                  aria-label={`${formatarData(dia)}: ${formatarDuracao(segundos)}`}
                  className={cx('flex h-9 items-end justify-end rounded-md p-1 text-[10px] font-bold sm:h-10', dia === hoje && 'ring-2 ring-verde')}
                  style={{
                    background: nivel ? `color-mix(in srgb, var(--verde) ${20 + nivel * 20}%, var(--superficie-2))` : 'var(--superficie-2)',
                    color: nivel >= 3 ? '#fff' : 'var(--texto-suave)',
                  }}
                >
                  {Number(dia.slice(8))}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-suave">Últimos 28 dias. Quanto mais escuro, mais perto da meta diária.</p>
        </Cartao>
      </div>
    </>
  );
}
