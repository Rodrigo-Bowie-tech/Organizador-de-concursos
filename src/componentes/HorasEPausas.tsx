import { useMemo } from 'react';
import { PAUSA_ESQUECIDA_SEG } from '../dominio/cronometro';
import { formatarData, formatarDuracao, nomeDiaCurto } from '../dominio/datas';
import { estudoEPausaPorDia, estudoEPausaPorDisciplina, totaisEstudoEPausa } from '../dominio/desempenho';
import type { EstudoPausa } from '../dominio/desempenho';
import type { DiaISO, Disciplina, Sessao } from '../dominio/tipos';
import { Cartao, cx } from './ui';

const DIAS = 14;
const HORA = 3600;
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Menos de um minuto não aparece no gráfico (são cliques de pausar e voltar). */
const visivel = (seg: number) => seg >= 60;

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-suave" aria-hidden>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm bg-grafico-tempo" /> Estudado
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm bg-grafico-pausa" /> Pausado
      </span>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: 'tempo' | 'pausa' }) {
  return (
    <div className="rounded-lg bg-superficie-2 px-3 py-2">
      <dt className="flex items-center gap-2 text-sm text-suave">
        {cor && <span className={cx('h-2.5 w-2.5 shrink-0 rounded-sm', cor === 'tempo' ? 'bg-grafico-tempo' : 'bg-grafico-pausa')} aria-hidden />}
        {rotulo}
      </dt>
      <dd className="text-2xl font-extrabold">{valor}</dd>
      {detalhe && <dd className="text-xs text-suave">{detalhe}</dd>}
    </div>
  );
}

/** Colunas empilhadas por dia: estudo embaixo, pausa em cima, com linhas de hora em hora. */
function PorDia({ dias, hoje }: { dias: (EstudoPausa & { dia: DiaISO })[]; hoje: DiaISO }) {
  const maior = Math.max(0, ...dias.map((d) => d.estudo + d.pausa));
  const passo = maior <= 4 * HORA ? HORA : 2 * HORA;
  const topo = Math.max(passo, Math.ceil(maior / passo) * passo);
  const marcas = Array.from({ length: topo / passo + 1 }, (_, i) => i * passo);
  const altura = (seg: number) => `${(seg / topo) * 100}%`;
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1">
      <div className="relative h-40" aria-hidden>
        {marcas.map((m) => (
          <span key={m} className="numeros absolute right-1 translate-y-1/2 text-[11px] text-suave" style={{ bottom: altura(m) }}>
            {m / HORA}h
          </span>
        ))}
      </div>
      <div className="relative h-40 border-b border-borda">
        {marcas.slice(1).map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-borda" style={{ bottom: altura(m) }} aria-hidden />
        ))}
        <ol className="relative flex h-full items-end gap-1" aria-label={`Horas estudadas e pausadas nos últimos ${DIAS} dias`}>
          {dias.map((d) => {
            const resumo = `${nomeDiaCurto(d.dia)}, ${formatarData(d.dia)}: estudou ${formatarDuracao(d.estudo)} e pausou ${formatarDuracao(d.pausa)}`;
            return (
              <li key={d.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[2px] rounded-t hover:bg-superficie-2" title={resumo} aria-label={resumo}>
                {visivel(d.pausa) && <div className="w-full max-w-6 rounded-t bg-grafico-pausa" style={{ height: altura(d.pausa) }} />}
                {visivel(d.estudo) && <div className={cx('w-full max-w-6 bg-grafico-tempo', !visivel(d.pausa) && 'rounded-t')} style={{ height: altura(d.estudo) }} />}
              </li>
            );
          })}
        </ol>
      </div>
      <span />
      <div className="numeros mt-1 flex gap-1 text-[11px] text-suave" aria-hidden>
        {dias.map((d) => (
          <span key={d.dia} className={cx('min-w-0 flex-1 text-center', d.dia === hoje && 'font-bold text-texto')}>
            {d.dia.slice(8)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface Linha extends EstudoPausa {
  chave: string;
  nome: string;
}

/** Barras deitadas por assunto: estudo e pausa lado a lado, na mesma escala. */
function PorAssunto({ linhas }: { linhas: Linha[] }) {
  const maior = Math.max(1, ...linhas.map((l) => l.estudo + l.pausa));
  // 98%: sobra para o vão de 2 px entre as duas partes.
  const largura = (seg: number) => `${(seg / maior) * 98}%`;
  return (
    <ul className="grid grid-cols-1 gap-2">
      {linhas.map((l) => {
        const resumo = `${l.nome}: estudou ${formatarDuracao(l.estudo)} e pausou ${formatarDuracao(l.pausa)}`;
        return (
          <li key={l.chave} className="grid grid-cols-1 gap-1 rounded-lg px-2 py-1.5 hover:bg-superficie-2" title={resumo} aria-label={resumo}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 font-bold">{l.nome}</span>
              <span className="numeros text-sm text-suave">
                {formatarDuracao(l.estudo)}
                {visivel(l.pausa) && ` · ${formatarDuracao(l.pausa)} em pausa`}
              </span>
            </div>
            <div className="flex h-3 gap-[2px] border-l border-borda" aria-hidden>
              {visivel(l.estudo) && <div className={cx('h-full bg-grafico-tempo', !visivel(l.pausa) && 'rounded-r')} style={{ width: largura(l.estudo) }} />}
              {visivel(l.pausa) && <div className="h-full rounded-r bg-grafico-pausa" style={{ width: largura(l.pausa) }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Horas estudadas (líquidas) e pausadas: totais, por dia e por assunto. Mostra quanto
 * daria para estudar se as pausas virassem estudo.
 */
export function CartaoHorasEPausas({ sessoes, disciplinas, agora, hoje }: { sessoes: Sessao[]; disciplinas: Disciplina[]; agora: Date | number; hoje: DiaISO }) {
  const total = useMemo(() => totaisEstudoEPausa(sessoes, agora), [sessoes, agora]);
  const dias = useMemo(() => estudoEPausaPorDia(sessoes, agora, hoje, DIAS), [sessoes, agora, hoje]);
  const linhas = useMemo(() => {
    const porDisciplina = estudoEPausaPorDisciplina(sessoes, agora);
    const ids = new Set(disciplinas.map((d) => d.id));
    const saida: Linha[] = disciplinas.map((d) => ({ chave: d.id, nome: d.nome, ...(porDisciplina.get(d.id) ?? { estudo: 0, pausa: 0 }) }));
    const sem = porDisciplina.get('');
    if (sem) saida.push({ chave: '', nome: 'Sem assunto', ...sem });
    const outros = { estudo: 0, pausa: 0 };
    for (const [id, v] of porDisciplina) {
      if (id && !ids.has(id)) {
        outros.estudo += v.estudo;
        outros.pausa += v.pausa;
      }
    }
    if (outros.estudo + outros.pausa) saida.push({ chave: '*', nome: 'Outros concursos', ...outros });
    return saida.filter((l) => l.estudo + l.pausa >= 60).sort((a, b) => b.estudo + b.pausa - (a.estudo + a.pausa));
  }, [sessoes, agora, disciplinas]);

  if (total.estudo + total.pausa < 60) {
    return (
      <Cartao titulo="Horas estudadas e pausadas">
        <p className="text-suave">Sem sessões ainda. Estude com o cronômetro: as horas e as pausas aparecem aqui.</p>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Horas estudadas e pausadas">
      <div className="grid grid-cols-1 gap-5">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero rotulo="Estudadas" valor={formatarDuracao(total.estudo)} detalhe="tempo líquido, todo o período" cor="tempo" />
          <Numero rotulo="Pausadas" valor={formatarDuracao(total.pausa)} detalhe="com o cronômetro aberto" cor="pausa" />
          <Numero rotulo="Sem as pausas" valor={formatarDuracao(total.estudo + total.pausa)} detalhe="se as pausas virassem estudo" />
          <Numero rotulo="Em pausa" valor={total.fracaoPausa === null ? '–' : pct(total.fracaoPausa)} detalhe="do tempo de cronômetro aberto" />
        </dl>
        {total.pausa > 0 && total.estudo > 0 && (
          <p>
            Se as pausas tivessem virado estudo, seriam <strong>{formatarDuracao(total.pausa)} a mais</strong> ({pct(total.pausa / total.estudo)} a mais do que você
            estudou).
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          <h3 className="font-bold">Por dia, nos últimos {DIAS} dias</h3>
          <Legenda />
          <PorDia dias={dias} hoje={hoje} />
        </div>
        {linhas.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            <h3 className="font-bold">Por assunto, em todo o período</h3>
            <Legenda />
            <PorAssunto linhas={linhas} />
          </div>
        )}
        <p className="text-xs text-suave">
          Pausas de mais de {PAUSA_ESQUECIDA_SEG / HORA} horas não entram: é o cronômetro esquecido em pausa. Sessões registradas à mão não têm pausas. O tempo
          planejado que nem começou aparece em “Planejado × realizado por semana”.
        </p>
      </div>
    </Cartao>
  );
}
