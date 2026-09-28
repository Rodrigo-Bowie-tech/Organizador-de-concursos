import { CalendarClock, CalendarDays, Check, Flame, Play, Radar, RefreshCcw } from 'lucide-react';
import { useMemo } from 'react';
import { AvisosPlano } from '../componentes/AvisosPlano';
import { Botao, CabecalhoTela, Cartao, Etiqueta, Progresso, Vazio, cx } from '../componentes/ui';
import { estadoDaSessao, segundosLiquidos, segundosPorDia } from '../dominio/cronometro';
import { diaDaSemana, formatarData, formatarDuracao, formatarRelogio } from '../dominio/datas';
import { projecaoCobertura } from '../dominio/balanco';
import { cobertura, hojeSP, provasFuturas, sequenciaDeDias, totaisPorPeriodo, ultimosDias } from '../dominio/painel';
import { minutos } from '../dominio/planejador';
import { revisoesAgendadas, separarRevisoes } from '../dominio/revisoes';
import { errosParaRevisar } from '../dominio/desempenho';
import { TIPO_SESSAO } from '../dominio/rotulos';
import { useAgora, useApp } from '../estado';
import { oportunidadesNovas } from '../radar/radar';
import { backupAtrasado } from '../dominio/exportacao';

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

/** Alerta de oportunidades novas do radar que batem com os filtros. */
function AlertaRadar({ hoje }: { hoje: string }) {
  const { dados, irPara } = useApp();
  const novas = oportunidadesNovas(dados.oportunidades, dados.filtrosRadar, dados.radarVistoAte, hoje);
  if (!novas.length) return null;
  return (
    <button
      type="button"
      onClick={() => irPara('radar')}
      className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-roxo/40 bg-superficie px-5 py-4 text-left shadow-cartao transition hover:border-roxo"
    >
      <Radar size={22} className="text-roxo" />
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-roxo">
          {novas.length === 1 ? '1 concurso novo no radar' : `${novas.length} concursos novos no radar`}
        </span>
        <span className="block truncate text-sm text-suave">
          {novas
            .slice(0, 3)
            .map((o) => `${o.orgao} (${o.uf})`)
            .join(' · ')}
          {novas.length > 3 && ` e mais ${novas.length - 3}`}
        </span>
      </span>
      <span className="text-sm font-bold text-roxo">Ver radar</span>
    </button>
  );
}

function BlocosDeHoje({ hoje }: { hoje: string }) {
  const { dados, repo, executar, irPara } = useApp();
  const blocos = dados.blocos.filter((b) => b.dia === hoje);
  if (!blocos.length) return null;
  return (
    <Cartao
      titulo={<span className="flex items-center gap-2"><CalendarDays size={18} /> Blocos de hoje</span>}
      acao={
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => irPara('planejamento')}>
          Ver planejamento
        </Botao>
      }
    >
      <ul className="grid gap-2">
        {blocos.map((b) => {
          const d = dados.disciplinas.find((x) => x.id === b.disciplinaId);
          const t = d && b.topicoId ? d.topicos[b.topicoId] : undefined;
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border-l-4 bg-superficie-2 px-3 py-2" style={{ borderLeftColor: d?.cor }}>
              <span className="numeros w-24 shrink-0 font-bold">
                {b.inicio}–{b.fim}
              </span>
              <span className="min-w-0 flex-1 basis-48">
                <span className={b.status === 'feito' ? 'block font-bold text-suave line-through' : 'block font-bold'}>{d?.nome ?? 'Disciplina'}</span>
                <span className="block truncate text-sm text-suave">
                  {t?.titulo ?? 'Disciplina inteira'} · {TIPO_SESSAO[b.tipo]} · {Math.round(minutos(b))} min
                </span>
              </span>
              {b.status === 'planejado' ? (
                <Botao
                  tamanho="pequeno"
                  disabled={Boolean(dados.ativa)}
                  onClick={async () => {
                    const s = await executar(() => repo.iniciarSessao({ concursoId: b.concursoId, disciplinaId: b.disciplinaId, topicoId: b.topicoId, tipo: b.tipo }));
                    if (s) irPara('cronometro');
                  }}
                >
                  <Play size={15} /> Começar
                </Botao>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-verde-forte">
                  <Check size={15} /> {b.status === 'feito' ? 'Feito' : b.status === 'parcial' ? 'Parcial' : 'Pulado'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
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
  const errosHoje = errosParaRevisar(dados.erros, hoje).length;
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
            className="flex flex-wrap items-center gap-3 rounded-xl bg-verde-botao px-5 py-4 text-left text-sobre-verde shadow-cartao transition hover:brightness-95"
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

        <AlertaRadar hoje={hoje} />
        {backupAtrasado(dados.ultimoBackup, dados.sessoes.length, agora) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-alerta/12 px-4 py-2.5 text-sm font-bold text-alerta">
            {dados.ultimoBackup ? `O último backup foi em ${formatarData(dados.ultimoBackup)}.` : 'Você ainda não exportou um backup.'} Os dados ficam na
            nuvem do app, mas uma cópia no seu computador não custa nada.
            <button type="button" className="underline" onClick={() => irPara('configuracoes')}>
              Fazer backup
            </button>
          </p>
        )}
        <BlocosDeHoje hoje={hoje} />
        <AvisosPlano compacto />

        <div className="grid gap-4 sm:grid-cols-3">
          <Meta rotulo="Hoje" segundos={totais.hoje} metaMin={dados.config.metaDiariaMin} />
          <Meta rotulo="Semana" segundos={totais.semana} metaMin={dados.config.metaSemanalMin} />
          <Meta rotulo="Mês" segundos={totais.mes} metaMin={dados.config.metaMensalMin} />
        </div>

        {(revisoes.atrasadas.length > 0 || revisoes.hoje.length > 0 || feitasHoje > 0 || errosHoje > 0) && (
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
              {errosHoje > 0 && (
                <button type="button" className="font-bold text-roxo underline" onClick={() => irPara('erros')}>
                  {errosHoje} {errosHoje === 1 ? 'erro' : 'erros'} do caderno para revisar
                </button>
              )}
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
                    // Níveis 1–2 claros com texto escuro; 3–4 cheios com a cor de texto sobre o verde (contraste ≥ 4,5).
                    background: [
                      'var(--superficie-2)',
                      'color-mix(in srgb, var(--verde) 25%, var(--superficie-2))',
                      'color-mix(in srgb, var(--verde) 45%, var(--superficie-2))',
                      'var(--verde-botao)',
                      'var(--verde-forte)',
                    ][nivel],
                    color: nivel >= 3 ? 'var(--sobre-verde)' : nivel ? 'var(--texto)' : 'var(--texto-suave)',
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
