import { useMemo } from 'react';
import { CabecalhoTela, Cartao, Etiqueta, Vazio, Botao, cx } from '../componentes/ui';
import { esforcoPorDisciplina } from '../dominio/balanco';
import { segundosPorDia } from '../dominio/cronometro';
import { acertoSemanal, agrupar, heatmapAno, minutosPorHora, planejadoRealizado, rendimentoPorFaixa, todasAsQuestoes } from '../dominio/desempenho';
import { formatarData, formatarDuracao, nomeMes } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { useAgora, useApp } from '../estado';
import { GraficoTempoPeso } from './Balanco';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const horas = (min: number) => formatarDuracao(min * 60);

function Sparkline({ valores }: { valores: (number | null)[] }) {
  const L = 120;
  const A = 28;
  const pts = valores.map((v, i) => (v === null ? null : [4 + (i / Math.max(1, valores.length - 1)) * (L - 8), 4 + (1 - v) * (A - 8)] as const));
  const segmentos: string[] = [];
  let atual: string[] = [];
  for (const p of pts) {
    if (!p) {
      if (atual.length) segmentos.push(atual.join(' '));
      atual = [];
    } else atual.push(`${p[0]},${p[1]}`);
  }
  if (atual.length) segmentos.push(atual.join(' '));
  const ultimo = [...pts].reverse().find(Boolean);
  return (
    <svg viewBox={`0 0 ${L} ${A}`} width={L} height={A} aria-hidden className="shrink-0">
      <line x1={4} x2={L - 4} y1={4 + 0.3 * (A - 8)} y2={4 + 0.3 * (A - 8)} stroke="var(--borda)" strokeWidth={1} />
      {segmentos.map((s, i) =>
        s.includes(' ') ? <polyline key={i} points={s} fill="none" stroke="var(--grafico-tempo)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null,
      )}
      {ultimo && <circle cx={ultimo[0]} cy={ultimo[1]} r={4} fill="var(--grafico-tempo)" stroke="var(--superficie)" strokeWidth={2} />}
    </svg>
  );
}

export function Estatisticas() {
  const { dados, disciplinas, concursoAtivo, irPara } = useApp();
  const agora = useAgora(60_000);
  const hoje = hojeSP(agora);
  const sessoes = useMemo(() => (dados.ativa ? [...dados.sessoes, dados.ativa] : dados.sessoes), [dados.sessoes, dados.ativa]);
  const questoes = useMemo(() => todasAsQuestoes(dados.sessoes, dados.registrosQuestoes), [dados.sessoes, dados.registrosQuestoes]);
  const porDia = useMemo(() => segundosPorDia(sessoes, agora), [sessoes, agora]);

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Estatísticas" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso para ver as estatísticas." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const ids = new Set(disciplinas.map((d) => d.id));
  const doConcurso = questoes.filter((q) => q.disciplinaId && ids.has(q.disciplinaId));
  const porDisc = agrupar(doConcurso, (q) => q.disciplinaId);
  const porTopico = agrupar(doConcurso, (q) => q.topicoId);
  const piores = [...porTopico.entries()]
    .filter(([, t]) => t.feitas >= 5)
    .sort((a, b) => a[1].taxa - b[1].taxa)
    .slice(0, 8)
    .map(([id, t]) => {
      const d = disciplinas.find((x) => x.topicos[id]);
      return { titulo: d?.topicos[id]?.titulo ?? 'Tópico', disciplina: d?.nome ?? '', ...t };
    });
  const esforco = esforcoPorDisciplina(disciplinas, sessoes, agora, 3650);
  const semanas = planejadoRealizado(dados.blocos, sessoes, hoje, 8, agora);
  const maxSemana = Math.max(60, ...semanas.flatMap((s) => [s.planejado, s.realizado]));
  const mapa = heatmapAno(porDia, hoje);
  const metaDia = Math.max(1, dados.config.metaDiariaMin * 60);
  const porHora = minutosPorHora(sessoes, agora);
  const maxHora = Math.max(1, ...porHora);
  const faixas = rendimentoPorFaixa(sessoes, agora);
  const comAcerto = faixas.filter((f) => f.taxa !== null && f.feitas >= 10);
  const melhor = comAcerto.length ? comAcerto.reduce((a, b) => ((b.taxa ?? 0) > (a.taxa ?? 0) ? b : a)) : faixas.reduce((a, b) => (b.minutos > a.minutos ? b : a));
  const totalAno = mapa.flat().filter((c) => c.segundos >= 60).length;

  return (
    <>
      <CabecalhoTela titulo="Estatísticas" subtitulo={concursoAtivo.nome} />
      <div className="grid grid-cols-1 gap-4">
        <Cartao titulo="Dias estudados no último ano" acao={<Etiqueta tom="verde">{totalAno} {totalAno === 1 ? 'dia' : 'dias'}</Etiqueta>}>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Dias estudados no último ano (role para os lados)">
            <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `2rem repeat(${mapa.length}, 11px)` }} role="img" aria-label={`Heatmap: ${totalAno} ${totalAno === 1 ? 'dia' : 'dias'} com estudo no último ano`}>
              <span />
              {mapa.map((semana, w) => {
                const primeiro = semana.find((c) => c.dia.slice(8) === '01');
                return (
                  <span key={w} className="h-4 text-[10px] leading-4 whitespace-nowrap text-suave">
                    {primeiro ? nomeMes(primeiro.dia).slice(0, 3) : ''}
                  </span>
                );
              })}
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <FragmentoLinha key={d} d={d} mapa={mapa} metaDia={metaDia} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-suave">Cada quadrado é um dia; quanto mais escuro, mais perto da meta diária.</p>
        </Cartao>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Cartao titulo="Planejado × realizado por semana">
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-suave" aria-hidden>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-4 rounded-sm bg-grafico-peso" /> Planejado
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-4 rounded-sm bg-grafico-tempo" /> Realizado
              </span>
            </div>
            <div className="flex h-44 items-end gap-2 border-b border-borda" role="list" aria-label="Horas planejadas e realizadas nas últimas 8 semanas">
              {semanas.map((s, i) => (
                <div
                  key={s.semana}
                  role="listitem"
                  aria-label={`Semana de ${formatarData(s.semana)}: planejado ${horas(s.planejado)}, realizado ${horas(s.realizado)}`}
                  title={`Semana de ${formatarData(s.semana)}: planejado ${horas(s.planejado)}, realizado ${horas(s.realizado)}`}
                  className="relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-t hover:bg-superficie-2"
                >
                  <div className="w-full max-w-3 rounded-t bg-grafico-peso" style={{ height: `${(s.planejado / maxSemana) * 100}%` }} />
                  <div className="w-full max-w-3 rounded-t bg-grafico-tempo" style={{ height: `${(s.realizado / maxSemana) * 100}%` }} />
                  {i === semanas.length - 1 && s.realizado > 0 && (
                    <span className="numeros absolute -top-5 text-xs font-bold whitespace-nowrap">{horas(s.realizado)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="numeros mt-1 flex gap-2 text-[11px] text-suave" aria-hidden>
              {semanas.map((s) => (
                <span key={s.semana} className="flex-1 text-center">
                  {formatarData(s.semana).slice(0, 5)}
                </span>
              ))}
            </div>
          </Cartao>

          <Cartao titulo="Melhor horário do dia">
            <div className="flex h-32 items-end gap-[2px] border-b border-borda" role="list" aria-label="Minutos estudados por hora do dia">
              {porHora.map((m, h) => (
                <div key={h} role="listitem" aria-label={`${h}h: ${horas(m)}`} title={`${String(h).padStart(2, '0')}h: ${horas(m)}`} className="flex h-full flex-1 items-end hover:bg-superficie-2">
                  <div className="w-full rounded-t bg-grafico-tempo" style={{ height: `${(m / maxHora) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="numeros mt-1 flex text-[11px] text-suave" aria-hidden>
              {porHora.map((_, h) => (
                <span key={h} className="flex-1 text-center">
                  {h % 6 === 0 ? `${h}h` : ''}
                </span>
              ))}
            </div>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-suave">
                <tr>
                  <th className="py-1">Faixa</th>
                  <th className="numeros py-1 text-right">Horas</th>
                  <th className="numeros py-1 text-right">Acerto</th>
                </tr>
              </thead>
              <tbody>
                {faixas.map((f) => (
                  <tr key={f.nome} className={cx('border-t border-borda', f.nome === melhor.nome && 'font-bold')}>
                    <td className="py-1">
                      {f.nome} <span className="text-suave">({f.de}h–{f.ate}h)</span>
                    </td>
                    <td className="numeros py-1 text-right">{horas(f.minutos)}</td>
                    <td className="numeros py-1 text-right">{f.taxa === null ? '–' : `${pct(f.taxa)} (${f.feitas})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {melhor.minutos > 0 && (
              <p className="mt-2 text-sm">
                Você rende mais {melhor.nome === 'Manhã' ? 'de manhã' : melhor.nome === 'Tarde' ? 'à tarde' : melhor.nome === 'Noite' ? 'à noite' : 'de madrugada'}
                {melhor.taxa !== null && comAcerto.length ? `: ${pct(melhor.taxa)} de acerto nas questões.` : ', onde concentra mais horas.'}
              </p>
            )}
          </Cartao>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Cartao titulo="Acerto por disciplina">
            {!doConcurso.length ? (
              <p className="text-suave">Sem questões ainda. Lance em Questões, no fim das sessões ou na prática com IA.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {disciplinas.map((d) => {
                  const t = porDisc.get(d.id);
                  const serie = acertoSemanal(doConcurso, hoje, 12, d.id).map((x) => x.taxa);
                  return (
                    <li key={d.id} className="flex items-center gap-3" aria-label={`${d.nome}: ${t ? `${pct(t.taxa)} em ${t.feitas} questões` : 'sem questões'}`}>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.cor }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{d.nome}</span>
                      <Sparkline valores={serie} />
                      <span className="numeros w-24 text-right text-sm">{t ? `${pct(t.taxa)} · ${t.feitas}` : '–'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-suave">A linha mostra o acerto semanal das últimas 12 semanas; a faixa cinza marca 70%.</p>
          </Cartao>

          <Cartao titulo="Tópicos com menor acerto">
            {!piores.length ? (
              <p className="text-suave">Aparecem aqui os tópicos com pelo menos 5 questões.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {piores.map((p) => (
                  <li key={p.titulo + p.disciplina} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{p.titulo}</span>
                      <span className="block truncate text-xs text-suave">{p.disciplina}</span>
                    </span>
                    <Etiqueta tom={p.taxa < 0.5 ? 'alerta' : 'neutro'}>
                      {pct(p.taxa)} · {p.feitas}
                    </Etiqueta>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        {disciplinas.length > 0 && esforco.some((l) => l.segundos > 0) && (
          <Cartao titulo="Horas por disciplina × peso na prova (todo o período)">
            <GraficoTempoPeso linhas={esforco} periodo="todo o período" />
          </Cartao>
        )}
      </div>
    </>
  );
}

function FragmentoLinha({ d, mapa, metaDia }: { d: number; mapa: ReturnType<typeof heatmapAno>; metaDia: number }) {
  return (
    <>
      <span className="text-[10px] leading-[11px] text-suave">{d === 1 ? 'Seg' : d === 3 ? 'Qua' : d === 5 ? 'Sex' : ''}</span>
      {mapa.map((semana) => {
        const c = semana[d];
        const nivel = c.segundos < 60 ? 0 : Math.min(4, Math.ceil((c.segundos / metaDia) * 4));
        return (
          <span
            key={c.dia}
            title={c.futuro ? undefined : `${formatarData(c.dia)}: ${formatarDuracao(c.segundos)}`}
            className="h-[11px] w-[11px] rounded-[2px]"
            style={{
              background: c.futuro ? 'transparent' : nivel ? `color-mix(in srgb, var(--grafico-tempo) ${20 + nivel * 20}%, var(--superficie-2))` : 'var(--superficie-2)',
            }}
          />
        );
      })}
    </>
  );
}
