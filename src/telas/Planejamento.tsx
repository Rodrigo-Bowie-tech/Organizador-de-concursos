import { Check, ChevronLeft, ChevronRight, Clock, Play, RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { AvisosPlano } from '../componentes/AvisosPlano';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Modal, Selecao, Vazio, cx } from '../componentes/ui';
import { segundosLiquidos } from '../dominio/cronometro';
import { diaSP, diasEntre, formatarData, formatarDuracao, formatarHora, inicioDaSemana, inicioDoMes, nomeDiaCurto, nomeMes, somarDias } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { minutos, segundosNoBloco, statusSugerido } from '../dominio/planejador';
import { TIPO_SESSAO, nomeDoBloco, titulosDasRevisoes } from '../dominio/rotulos';
import type { BlocoPlanejado, DiaISO, Sessao } from '../dominio/tipos';
import { useAgora, useApp } from '../estado';
import { gravarLocal, lerLocal } from '../plataforma';

type Visao = 'semana' | 'dia' | 'mes';
type Camadas = { revisoes: boolean; historico: boolean; planejamento: boolean };

const CHAVE_CAMADAS = 'organizador-concursos:agendas';
const CHAVE_VISAO = 'organizador-concursos:visao-planejamento';
const STATUS: Record<BlocoPlanejado['status'], string> = { planejado: 'Planejado', feito: 'Feito', parcial: 'Parcial', pulado: 'Pulado' };

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lerCamadas(): Camadas {
  try {
    return { revisoes: true, historico: true, planejamento: true, ...JSON.parse(lerLocal(CHAVE_CAMADAS) ?? '{}') };
  } catch {
    return { revisoes: true, historico: true, planejamento: true };
  }
}

// ------------------------------------------------------------- dados do dia

function useDiaInfo() {
  const { dados } = useApp();
  const agora = useAgora(60_000);
  const hoje = hojeSP(agora);
  const sessoes = useMemo(() => (dados.ativa ? [...dados.sessoes, dados.ativa] : dados.sessoes), [dados.sessoes, dados.ativa]);
  const porDia = useMemo(() => {
    const m = new Map<DiaISO, Sessao[]>();
    for (const s of sessoes) {
      const d = diaSP(s.inicio);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [sessoes]);
  const blocosPorDia = useMemo(() => {
    const m = new Map<DiaISO, BlocoPlanejado[]>();
    for (const b of dados.blocos) m.set(b.dia, [...(m.get(b.dia) ?? []), b]);
    return m;
  }, [dados.blocos]);
  const revisoesDoDia = (dia: DiaISO) => {
    if (dia < hoje) {
      return dados.revisoesFeitas
        .filter((r) => r.dia === dia)
        .map((r) => ({ id: r.id, titulo: dados.disciplinas.find((d) => d.id === r.disciplinaId)?.topicos[r.topicoId]?.titulo ?? 'Tópico', feita: true, atrasada: false }));
    }
    return dados.disciplinas.flatMap((d) =>
      Object.values(d.topicos)
        .filter((t) => t.revisao && (t.revisao.proxima === dia || (dia === hoje && t.revisao.proxima < hoje)))
        .map((t) => ({ id: t.id, titulo: t.titulo, feita: false, atrasada: (t.revisao?.proxima ?? '') < hoje })),
    );
  };
  return { agora, hoje, porDia, blocosPorDia, revisoesDoDia };
}

// ------------------------------------------------------------------- bloco

function CartaoBloco({ b, sessoesDoDia, agora, aoAbrir, arrastavel }: { b: BlocoPlanejado; sessoesDoDia: Sessao[]; agora: Date; aoAbrir: () => void; arrastavel?: boolean }) {
  const { dados } = useApp();
  const d = dados.disciplinas.find((x) => x.id === b.disciplinaId);
  const t = d && b.topicoId ? d.topicos[b.topicoId] : undefined;
  const estudado = segundosNoBloco(b, sessoesDoDia, agora);
  const feito = b.status === 'feito';
  const cor = d?.cor ?? 'var(--verde)';
  return (
    <button
      type="button"
      onClick={aoAbrir}
      draggable={arrastavel && b.status === 'planejado'}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}
      aria-label={`${b.inicio} ${nomeDoBloco(b, d)}: ${t?.titulo ?? ''} (${STATUS[b.status]})`}
      className={cx(
        'grid w-full gap-1 rounded-lg border-l-4 p-2 text-left text-sm transition hover:brightness-95',
        b.status === 'pulado' && 'border-dashed opacity-60',
      )}
      style={{ borderLeftColor: cor, background: feito ? 'var(--superficie-2)' : `color-mix(in srgb, ${cor} 16%, var(--superficie))` }}
    >
      <span className={cx('flex items-start gap-1 font-bold leading-tight', feito && 'text-suave line-through')}>
        {feito && <Check size={15} className="mt-0.5 shrink-0 text-verde-forte" aria-hidden />}
        {nomeDoBloco(b, d)}
      </span>
      <span className="flex flex-wrap gap-1">
        <span className="numeros rounded-full bg-superficie px-1.5 text-xs font-bold">{b.inicio}</span>
        <span className="numeros rounded-full bg-superficie px-1.5 text-xs font-bold">{formatarDuracao(minutos(b) * 60)}</span>
        {b.tipo !== 'teoria' && <span className="rounded-full bg-superficie px-1.5 text-xs font-bold text-roxo">{b.motivo === 'revisao_atrasada' ? 'Revisão atrasada' : TIPO_SESSAO[b.tipo]}</span>}
      </span>
      {t && <span className={cx('line-clamp-2 text-xs', feito && 'text-suave line-through')}>{t.titulo}</span>}
      {!t && b.revisoes && b.revisoes.length > 0 && (
        <span className={cx('line-clamp-3 text-xs', feito && 'text-suave line-through')}>{titulosDasRevisoes(b, dados.disciplinas).join(' · ')}</span>
      )}
      {estudado > 0 && (
        <span className="numeros inline-flex items-center gap-1 justify-self-end rounded-full bg-verde-suave px-1.5 text-xs font-bold text-verde-forte">
          <Clock size={12} aria-hidden /> {formatarDuracao(estudado)}
        </span>
      )}
      {b.status === 'parcial' && <span className="text-xs font-bold text-alerta">Parcial</span>}
    </button>
  );
}

function ModalBloco({ bloco, aoFechar }: { bloco: BlocoPlanejado | null; aoFechar: () => void }) {
  const { dados, repo, executar, irPara } = useApp();
  const { agora, porDia } = useDiaInfo();
  const [dia, setDia] = useState('');
  const [inicio, setInicio] = useState('');
  if (!bloco) return null;
  const d = dados.disciplinas.find((x) => x.id === bloco.disciplinaId);
  const t = d && bloco.topicoId ? d.topicos[bloco.topicoId] : undefined;
  const concurso = dados.concursos.find((c) => c.id === bloco.concursoId);
  const estudado = segundosNoBloco(bloco, porDia.get(bloco.dia) ?? [], agora);
  const sugestao = bloco.status === 'planejado' ? statusSugerido(bloco, estudado) : null;

  const marcar = async (status: BlocoPlanejado['status']) => {
    const ok = await executar(async () => {
      await repo.marcarBloco(bloco.id, status);
      return true;
    }, `Bloco marcado como ${STATUS[status].toLowerCase()}.`);
    if (ok) aoFechar();
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={t?.titulo ?? nomeDoBloco(bloco, d)} largo>
      <div className="grid grid-cols-1 gap-4">
        <p className="text-suave">
          {[concurso?.nome, d?.nome].filter(Boolean).join(' › ')} · {TIPO_SESSAO[bloco.tipo]}
          <br />
          <span className="numeros">
            {nomeDiaCurto(bloco.dia)}, {formatarData(bloco.dia)} · {bloco.inicio}–{bloco.fim} ({formatarDuracao(minutos(bloco) * 60)})
          </span>
          {estudado > 0 && <> · estudou {formatarDuracao(estudado)} nesse horário</>}
        </p>
        {bloco.revisoes && bloco.revisoes.length > 1 && (
          <div>
            <p className="mb-1 font-bold">Revise neste bloco (cerca de 20 min cada):</p>
            <ul className="list-disc pl-5 text-sm">
              {titulosDasRevisoes(bloco, dados.disciplinas).map((titulo, i) => (
                <li key={i}>{titulo}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-suave">Avalie cada uma na tela Revisões para o app marcar a próxima.</p>
          </div>
        )}
        {sugestao && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-verde-suave px-3 py-2">
            <span className="font-bold text-verde-forte">
              Você estudou {formatarDuracao(estudado)} nesse horário. Marcar como {STATUS[sugestao].toLowerCase()}?
            </span>
            <Botao tamanho="pequeno" onClick={() => void marcar(sugestao)}>
              Marcar {STATUS[sugestao].toLowerCase()}
            </Botao>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Botao
            disabled={Boolean(dados.ativa)}
            title={dados.ativa ? 'Já existe uma sessão em andamento' : undefined}
            onClick={async () => {
              const s = await executar(() => repo.iniciarSessao({ concursoId: bloco.concursoId, disciplinaId: bloco.disciplinaId, topicoId: bloco.topicoId, tipo: bloco.tipo }));
              if (s) {
                aoFechar();
                irPara('cronometro');
              }
            }}
          >
            <Play size={16} /> Começar
          </Botao>
          {(['feito', 'parcial', 'pulado'] as const).map((s) => (
            <Botao key={s} variante={bloco.status === s ? 'primario' : 'secundario'} onClick={() => void marcar(s)}>
              {STATUS[s]}
            </Botao>
          ))}
          {bloco.status !== 'planejado' && (
            <Botao variante="fantasma" onClick={() => void marcar('planejado')}>
              Voltar a planejado
            </Botao>
          )}
        </div>
        {bloco.status === 'planejado' && (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-borda pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await executar(async () => {
                await repo.moverBloco(bloco.id, dia || bloco.dia, inicio || bloco.inicio);
                return true;
              }, 'Bloco movido.');
              if (ok) aoFechar();
            }}
          >
            <Campo rotulo="Mover para o dia">
              {(id) => <Entrada id={id} type="date" value={dia || bloco.dia} onChange={(e) => setDia(e.target.value)} />}
            </Campo>
            <Campo rotulo="Às">
              {(id) => <Entrada id={id} type="time" value={inicio || bloco.inicio} onChange={(e) => setInicio(e.target.value)} />}
            </Campo>
            <Botao type="submit" variante="secundario">
              Mover
            </Botao>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- visões

function ItensDoDia({ dia, camadas, aoAbrir, arrastavel, compacto }: { dia: DiaISO; camadas: Camadas; aoAbrir: (b: BlocoPlanejado) => void; arrastavel?: boolean; compacto?: boolean }) {
  const { dados } = useApp();
  const { agora, porDia, blocosPorDia, revisoesDoDia } = useDiaInfo();
  const sessoes = porDia.get(dia) ?? [];
  const blocos = blocosPorDia.get(dia) ?? [];
  const revisoes = camadas.revisoes ? revisoesDoDia(dia) : [];
  return (
    <div className="grid grid-cols-1 content-start gap-1.5">
      {camadas.planejamento && blocos.map((b) => <CartaoBloco key={b.id} b={b} sessoesDoDia={sessoes} agora={agora} aoAbrir={() => aoAbrir(b)} arrastavel={arrastavel} />)}
      {revisoes.map((r) => (
        <span key={r.id} className={cx('rounded-md px-2 py-1 text-xs font-bold', r.atrasada ? 'bg-alerta/15 text-alerta' : 'bg-roxo/10 text-roxo', r.feita && 'opacity-70')}>
          {r.feita ? 'Revisado' : r.atrasada ? 'Revisão atrasada' : 'Revisão'}: {r.titulo}
        </span>
      ))}
      {camadas.historico &&
        sessoes.map((s) => {
          const d = dados.disciplinas.find((x) => x.id === s.disciplinaId);
          return (
            <span key={s.id} className="rounded-md border border-borda bg-superficie-2 px-2 py-1 text-xs text-suave">
              <span className="numeros font-bold">
                {formatarHora(s.inicio)} · {formatarDuracao(segundosLiquidos(s, agora))}
              </span>{' '}
              {d?.nome ?? 'Estudo'}
              {!s.fim && ' (agora)'}
            </span>
          );
        })}
      {!compacto && !blocos.length && !revisoes.length && !sessoes.length && <span className="py-2 text-center text-xs text-suave">—</span>}
    </div>
  );
}

function VisaoSemana({ base: dataRef, camadas, aoAbrir }: { base: DiaISO; camadas: Camadas; aoAbrir: (b: BlocoPlanejado) => void }) {
  const { repo, executar } = useApp();
  const { hoje } = useDiaInfo();
  const inicio = inicioDaSemana(dataRef);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const soltar = (dia: DiaISO) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const b = repo.atual.blocos.find((x) => x.id === id);
    if (b && b.dia !== dia) void executar(() => repo.moverBloco(id, dia, b.inicio), 'Bloco movido.');
  };
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Semana (role para os lados)">
      <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border border-borda lg:min-w-0">
        {dias.map((dia) => (
          <div key={dia} className="border-r border-borda last:border-r-0" onDragOver={(e) => e.preventDefault()} onDrop={soltar(dia)}>
            <div className={cx('border-b border-borda py-2 text-center font-bold', dia === hoje ? 'bg-verde-botao text-sobre-verde' : 'text-texto')}>
              {nomeDiaCurto(dia)}, {Number(dia.slice(8))}
            </div>
            <div className="min-h-64 p-1.5">
              <ItensDoDia dia={dia} camadas={camadas} aoAbrir={aoAbrir} arrastavel />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisaoMes({ base: dataRef, aoEscolher }: { base: DiaISO; aoEscolher: (dia: DiaISO) => void }) {
  const { dados } = useApp();
  const { hoje, blocosPorDia } = useDiaInfo();
  const mes = dataRef.slice(0, 7);
  const inicio = inicioDaSemana(inicioDoMes(dataRef));
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-borda text-sm">
      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => (
        <div key={i} className="border-b border-borda bg-superficie-2 py-1 text-center text-xs font-extrabold text-suave">
          {l}
        </div>
      ))}
      {dias.map((dia) => {
        const blocos = blocosPorDia.get(dia) ?? [];
        return (
          <button
            key={dia}
            type="button"
            onClick={() => aoEscolher(dia)}
            aria-label={`${formatarData(dia)}: ${blocos.length} blocos`}
            className={cx('grid min-h-20 content-start gap-1 border-r border-b border-borda p-1.5 text-left hover:bg-superficie-2', dia.slice(0, 7) !== mes && 'opacity-40')}
          >
            <span className={cx('numeros grid h-6 w-6 place-items-center rounded-full text-xs font-bold', dia === hoje && 'bg-verde-botao text-sobre-verde')}>{Number(dia.slice(8))}</span>
            {blocos.slice(0, 3).map((b) => (
              <span
                key={b.id}
                className={cx('h-1.5 rounded-full', b.status === 'feito' && 'opacity-40')}
                style={{ background: dados.disciplinas.find((x) => x.id === b.disciplinaId)?.cor ?? 'var(--verde)' }}
              />
            ))}
            {blocos.length > 3 && <span className="text-xs text-suave">+{blocos.length - 3}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MiniCalendario({ base: dataRef, aoEscolher }: { base: DiaISO; aoEscolher: (dia: DiaISO) => void }) {
  const { hoje } = useDiaInfo();
  const [mesVisto, setMesVisto] = useState(inicioDoMes(dataRef));
  const inicio = inicioDaSemana(mesVisto);
  const semanaRef = inicioDaSemana(dataRef);
  const semanas = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => somarDias(inicio, w * 7 + i)));
  const mover = (n: number) => {
    const [a, m] = mesVisto.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setMesVisto(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-extrabold tracking-wide text-suave uppercase">
          {nomeMes(mesVisto).slice(0, 3)}. {mesVisto.slice(0, 4)}
        </span>
        <span className="flex">
          <BotaoIcone rotulo="Mês anterior" onClick={() => mover(-1)}>
            <ChevronLeft size={16} />
          </BotaoIcone>
          <BotaoIcone rotulo="Próximo mês" onClick={() => mover(1)}>
            <ChevronRight size={16} />
          </BotaoIcone>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => (
          <span key={i} className="py-1 font-extrabold text-suave">
            {l}
          </span>
        ))}
        {semanas.map((semana) =>
          semana.map((dia) => (
            <button
              key={dia}
              type="button"
              onClick={() => aoEscolher(dia)}
              className={cx(
                'numeros py-1.5 font-bold',
                semana[0] === semanaRef && 'bg-verde-suave',
                dia.slice(0, 7) !== mesVisto.slice(0, 7) && 'text-suave opacity-50',
              )}
            >
              <span className={cx('inline-grid h-6 w-6 place-items-center rounded-md', dia === hoje && 'bg-verde-botao text-sobre-verde')}>{Number(dia.slice(8))}</span>
            </button>
          )),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- tela

export function Planejamento() {
  const { dados, repo, executar, irPara, avisar } = useApp();
  const { hoje } = useDiaInfo();
  const [visao, setVisaoEstado] = useState<Visao>(() => (lerLocal(CHAVE_VISAO) as Visao) ?? (window.innerWidth < 640 ? 'dia' : 'semana'));
  const [dataRef, setDataRef] = useState<DiaISO>(hoje);
  const [camadas, setCamadasEstado] = useState<Camadas>(lerCamadas);
  const [aberto, setAberto] = useState<BlocoPlanejado | null>(null);
  const [remover, setRemover] = useState(false);

  const setVisao = (v: Visao) => {
    setVisaoEstado(v);
    gravarLocal(CHAVE_VISAO, v);
  };
  const setCamadas = (c: Camadas) => {
    setCamadasEstado(c);
    gravarLocal(CHAVE_CAMADAS, JSON.stringify(c));
  };
  const semDisponibilidade = !Object.values(dados.disponibilidade.dias).some((l) => l.length) && !Object.keys(dados.disponibilidade.excecoes).length;
  const passo = visao === 'dia' ? 1 : visao === 'semana' ? 7 : 0;
  const navegar = (n: number) => {
    if (passo) return setDataRef(somarDias(dataRef, n * passo));
    const [a, m] = dataRef.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setDataRef(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
  };
  const blocoAtual = aberto ? dados.blocos.find((b) => b.id === aberto.id) ?? null : null;
  const semana = inicioDaSemana(dataRef);
  const titulo =
    visao === 'dia'
      ? `${nomeDiaCurto(dataRef)}, ${formatarData(dataRef)}`
      : visao === 'semana'
        ? `${formatarData(semana).slice(0, 5)} a ${formatarData(somarDias(semana, 6))}`
        : `${capitalizar(nomeMes(dataRef))}, ${dataRef.slice(0, 4)}`;

  return (
    <>
      <CabecalhoTela
        titulo="Planejamento"
        acoes={
          <>
            <Botao variante="secundario" onClick={() => irPara('disponibilidade')}>
              <Settings2 size={18} /> Disponibilidade
            </Botao>
            <Botao
              disabled={semDisponibilidade}
              onClick={async () => {
                const n = await executar(() => repo.replanejar());
                if (n !== undefined) avisar(n ? `Plano refeito: ${n} blocos.` : 'Nada a planejar: cadastre tópicos ou horários livres.');
              }}
            >
              <RefreshCcw size={18} /> Replanejar
            </Botao>
            <Botao variante="secundario" disabled={!dados.blocos.length} onClick={() => setRemover(true)}>
              <Trash2 size={18} /> Remover
            </Botao>
          </>
        }
      />

      {semDisponibilidade ? (
        <Vazio
          titulo="Defina seus horários de estudo"
          texto="Informe os blocos livres de cada dia da semana (ex.: seg 06:00–07:30 e 20:00–22:30). O planejador distribui os tópicos neles, alternando as disciplinas."
          acao={<Botao onClick={() => irPara('disponibilidade')}>Configurar disponibilidade</Botao>}
        />
      ) : (
        <>
        <AvisosPlano />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_17rem]">
          <Cartao className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <BotaoIcone rotulo="Anterior" onClick={() => navegar(-1)}>
                  <ChevronLeft size={18} />
                </BotaoIcone>
                <h2 className="numeros min-w-40 text-center text-lg font-bold text-verde-forte sm:text-xl">{titulo}</h2>
                <BotaoIcone rotulo="Próximo" onClick={() => navegar(1)}>
                  <ChevronRight size={18} />
                </BotaoIcone>
                {dataRef !== hoje && (
                  <Botao tamanho="pequeno" variante="fantasma" onClick={() => setDataRef(hoje)}>
                    Hoje
                  </Botao>
                )}
              </div>
              <div className="w-36">
                <Selecao aria-label="Visão" className="border-2 border-roxo/60 font-bold text-roxo" value={visao} onChange={(e) => setVisao(e.target.value as Visao)}>
                  <option value="dia">Diária</option>
                  <option value="semana">Semanal</option>
                  <option value="mes">Mensal</option>
                </Selecao>
              </div>
            </div>

            {!dados.blocos.some((b) => b.dia >= hoje) && (
              <p className="mb-3 rounded-lg bg-verde-suave px-3 py-2 text-sm font-bold text-verde-forte">
                Nenhum bloco planejado daqui para a frente. Use "Replanejar" para montar o plano.
              </p>
            )}

            {visao === 'semana' && <VisaoSemana base={dataRef} camadas={camadas} aoAbrir={setAberto} />}
            {visao === 'mes' && (
              <VisaoMes
                base={dataRef}
                aoEscolher={(dia) => {
                  setDataRef(dia);
                  setVisao('dia');
                }}
              />
            )}
            {visao === 'dia' && (
              <div className="grid grid-cols-1 gap-2">
                <ItensDoDia dia={dataRef} camadas={camadas} aoAbrir={setAberto} />
                {dataRef >= hoje && !(dados.blocos.some((b) => b.dia === dataRef)) && (
                  <p className="text-sm text-suave">
                    {diasEntre(hoje, dataRef) > 28 && !dados.blocos.some((b) => b.dia > dataRef)
                      ? 'O plano vai até a data da prova (ou 4 semanas, se faltar a data).'
                      : 'Nenhum bloco neste dia.'}
                  </p>
                )}
              </div>
            )}
          </Cartao>

          <Cartao className="grid grid-cols-1 content-start gap-5">
            <MiniCalendario base={dataRef} aoEscolher={setDataRef} />
            <div>
              <p className="mb-2 text-sm font-extrabold tracking-wide text-suave uppercase">Minhas agendas</p>
              {(
                [
                  ['revisoes', 'Revisões'],
                  ['historico', 'Histórico'],
                  ['planejamento', 'Planejamento'],
                ] as const
              ).map(([k, r]) => (
                <label key={k} className="flex items-center gap-2 py-1 text-sm font-bold tracking-wide text-suave uppercase">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={camadas[k]} onChange={(e) => setCamadas({ ...camadas, [k]: e.target.checked })} />
                  {r}
                </label>
              ))}
            </div>
          </Cartao>
        </div>
        </>
      )}

      <ModalBloco bloco={blocoAtual} aoFechar={() => setAberto(null)} />
      <Confirmar
        aberto={remover}
        aoFechar={() => setRemover(false)}
        titulo="Remover o plano?"
        texto="Os blocos planejados de agora em diante são apagados. Os blocos já marcados (feito, parcial, pulado) continuam no histórico."
        rotuloAcao="Remover"
        aoConfirmar={() => void executar(() => repo.removerPlanoFuturo(), 'Plano removido.')}
      />
    </>
  );
}
