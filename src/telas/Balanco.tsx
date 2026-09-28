import { useMemo } from 'react';
import { Botao, CabecalhoTela, Cartao, Etiqueta, Progresso, Vazio, cx } from '../componentes/ui';
import { disciplinasEsquecidas, esforcoPorDisciplina, JANELA_DIAS, projecaoCobertura, topicosParados } from '../dominio/balanco';
import type { EsforcoDisciplina } from '../dominio/balanco';
import { segundosPorDia } from '../dominio/cronometro';
import { diaSP, formatarData, formatarDuracao, inicioDaSemana, somarDias } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { useAgora, useApp } from '../estado';

const pct = (f: number) => `${Math.round(f * 100)}%`;

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Cartao className="flex flex-col gap-1">
      <p className="text-sm font-extrabold tracking-wide text-suave uppercase">{rotulo}</p>
      <p className="numeros text-2xl font-extrabold">{valor}</p>
      {detalhe && <p className="text-sm text-suave">{detalhe}</p>}
    </Cartao>
  );
}

/** Barras pareadas: parte do tempo estudado × parte da prova, por disciplina. */
function GraficoTempoPeso({ linhas }: { linhas: EsforcoDisciplina[] }) {
  const maximo = Math.max(0.1, ...linhas.flatMap((l) => [l.fracaoTempo, l.fracaoPeso]));
  const escala = Math.min(1, Math.ceil(maximo * 10) / 10);
  const largura = (f: number) => `${(f / escala) * 100}%`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-suave" aria-hidden>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm bg-grafico-tempo" /> Tempo estudado (últimas 4 semanas)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-sm bg-grafico-peso" /> Peso na prova
        </span>
      </div>
      <ul className="grid gap-3">
        {linhas.map((l) => {
          const abaixo = l.fracaoPeso - l.fracaoTempo >= 0.1;
          const resumo = `${l.disciplina.nome}: ${pct(l.fracaoTempo)} do tempo, ${pct(l.fracaoPeso)} da prova`;
          return (
            <li key={l.disciplina.id} className="group grid gap-1 rounded-lg px-2 py-1.5 hover:bg-superficie-2" title={resumo} aria-label={resumo}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-bold">{l.disciplina.nome}</span>
                <span className="numeros text-sm text-suave">
                  {pct(l.fracaoTempo)} do tempo · {pct(l.fracaoPeso)} da prova
                  {abaixo && (
                    <span className="ml-2">
                      <Etiqueta tom="alerta">abaixo do peso</Etiqueta>
                    </span>
                  )}
                </span>
              </div>
              <div className="grid gap-0.5 border-l border-borda" aria-hidden>
                <div className="h-3 rounded-r bg-grafico-tempo transition-[width]" style={{ width: largura(l.fracaoTempo) }} />
                <div className="h-3 rounded-r bg-grafico-peso transition-[width]" style={{ width: largura(l.fracaoPeso) }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-suave">
        Peso na prova = peso × número de questões da disciplina. Escala de 0 a {pct(escala)}.
      </p>
    </div>
  );
}

export function Balanco() {
  const { dados, disciplinas, concursoAtivo, irPara } = useApp();
  const agora = useAgora(60_000);
  const hoje = hojeSP(agora);
  const inicioSemana = inicioDaSemana(hoje);
  const semanaPassada = somarDias(inicioSemana, -7);
  const todas = useMemo(() => (dados.ativa ? [...dados.sessoes, dados.ativa] : dados.sessoes), [dados.sessoes, dados.ativa]);

  const porDia = useMemo(() => segundosPorDia(todas, agora), [todas, agora]);
  let estaSemana = 0;
  let anterior = 0;
  for (const [dia, seg] of porDia) {
    if (dia >= inicioSemana && dia <= hoje) estaSemana += seg;
    else if (dia >= semanaPassada && dia < inicioSemana) anterior += seg;
  }
  const daSemana = todas.filter((s) => diaSP(s.inicio) >= inicioSemana);
  const feitas = daSemana.reduce((t, s) => t + s.questoesFeitas, 0);
  const acertos = daSemana.reduce((t, s) => t + s.acertos, 0);
  const revisoes = dados.revisoesFeitas.filter((r) => r.dia >= inicioSemana).length;

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Balanço" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso para ver o balanço da semana." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const linhas = esforcoPorDisciplina(disciplinas, todas, agora);
  const esquecidas = disciplinasEsquecidas(linhas);
  const parados = topicosParados(disciplinas, todas, hoje);
  const projecao = concursoAtivo.dataProva ? projecaoCobertura(disciplinas, todas, concursoAtivo.dataProva, hoje) : null;
  const meta = dados.config.metaSemanalMin * 60;

  return (
    <>
      <CabecalhoTela
        titulo="Balanço"
        subtitulo={`${concursoAtivo.nome} · semana de ${formatarData(inicioSemana)} a ${formatarData(somarDias(inicioSemana, 6))}`}
      />

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Numero rotulo="Esta semana" valor={formatarDuracao(estaSemana)} detalhe={meta ? `${pct(estaSemana / meta)} da meta de ${formatarDuracao(meta)}` : undefined} />
          <Numero
            rotulo="Semana passada"
            valor={formatarDuracao(anterior)}
            detalhe={anterior ? `esta semana já tem ${pct(estaSemana / anterior)} disso` : undefined}
          />
          <Numero rotulo="Revisões" valor={String(revisoes)} detalhe="feitas nesta semana" />
          <Numero rotulo="Questões" valor={String(feitas)} detalhe={feitas ? `${pct(acertos / feitas)} de acerto` : 'nenhuma nesta semana'} />
        </div>

        <Cartao
          titulo="Projeção até a prova"
          acao={
            projecao && (
              <Etiqueta tom={projecao.fracaoProjetada >= 0.95 ? 'verde' : 'alerta'}>
                {projecao.fracaoProjetada >= 0.95 ? 'no ritmo para fechar o edital' : 'abaixo do ritmo necessário'}
              </Etiqueta>
            )
          }
        >
          {!concursoAtivo.dataProva ? (
            <p className="text-suave">Informe a data da prova em Concursos para ver a projeção.</p>
          ) : !projecao ? (
            <p className="text-suave">Cadastre os tópicos do edital para ver a projeção.</p>
          ) : (
            <div className="grid gap-3">
              <p>
                No ritmo das últimas 4 semanas ({projecao.ritmoSemanal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{' '}
                {projecao.ritmoSemanal === 1 ? 'tópico' : 'tópicos'} por semana), você cobre{' '}
                <strong>{pct(projecao.fracaoProjetada)} do edital</strong> até {formatarData(concursoAtivo.dataProva)}, daqui a{' '}
                {projecao.diasAteProva} {projecao.diasAteProva === 1 ? 'dia' : 'dias'}.
              </p>
              <div className="grid gap-1">
                <div className="numeros flex justify-between text-sm text-suave">
                  <span>Hoje: {projecao.concluidos} de {projecao.total} tópicos ({pct(projecao.concluidos / projecao.total)})</span>
                  <span>Na prova: {pct(projecao.fracaoProjetada)}</span>
                </div>
                <Progresso rotulo="Cobertura projetada na data da prova" fracao={projecao.fracaoProjetada} />
              </div>
              {projecao.fracaoProjetada < 0.95 && (
                <p className="text-sm">
                  Para fechar o edital, conclua{' '}
                  <strong>{Math.ceil(projecao.necessarioPorSemana)} {Math.ceil(projecao.necessarioPorSemana) === 1 ? 'tópico' : 'tópicos'} por semana</strong>.
                </p>
              )}
            </div>
          )}
        </Cartao>

        {disciplinas.length > 0 && (
          <Cartao titulo="Tempo × peso na prova">
            {linhas.every((l) => l.segundos === 0) ? (
              <p className="text-suave">Nenhum estudo nas últimas {JANELA_DIAS / 7} semanas para comparar.</p>
            ) : (
              <GraficoTempoPeso linhas={linhas} />
            )}
          </Cartao>
        )}

        <Cartao titulo="Pontos de atenção">
          {!esquecidas.length && !parados.length ? (
            <p className="text-suave">Nada esquecido: as disciplinas de peso alto foram estudadas nos últimos 7 dias e nenhum tópico está parado.</p>
          ) : (
            <ul className="grid gap-2">
              {esquecidas.map((l) => (
                <li key={l.disciplina.id} className={cx('flex flex-wrap items-center gap-2')}>
                  <Etiqueta tom="alerta">disciplina esquecida</Etiqueta>
                  <span>
                    <strong>{l.disciplina.nome}</strong> vale {pct(l.fracaoPeso)} da prova e{' '}
                    {l.diasSemEstudo === null ? 'ainda não foi estudada' : `está sem estudo há ${l.diasSemEstudo} dias`}.
                  </span>
                </li>
              ))}
              {parados.slice(0, 8).map((p) => (
                <li key={p.topico.id} className="flex flex-wrap items-center gap-2">
                  <Etiqueta>tópico parado</Etiqueta>
                  <span>
                    <strong>{p.topico.titulo}</strong> ({p.disciplina.nome}) está em estudo, mas sem sessão há {p.dias} dias.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
