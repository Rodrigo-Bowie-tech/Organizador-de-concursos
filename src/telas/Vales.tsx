import { Dumbbell, Music, Plus, Ticket, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Entrada, Selecao } from '../componentes/ui';
import { formatarData, formatarDuracao, formatarHora } from '../dominio/datas';
import type { ConfigVales } from '../dominio/tipos';
import { estadoDosVales, VALES_PADRAO } from '../dominio/vales';
import type { EstadoVales } from '../dominio/vales';
import { useApp } from '../estado';
import { tocarAlerta } from '../plataforma';

/** Ícone da atividade: nota para música, haltere para exercícios, vale para o resto. */
export function IconeVale({ nome, size = 18 }: { nome: string; size?: number }) {
  const n = nome.toLowerCase();
  if (n.includes('músic') || n.includes('music')) return <Music size={size} aria-hidden />;
  if (n.includes('exerc') || n.includes('físic') || n.includes('treino')) return <Dumbbell size={size} aria-hidden />;
  return <Ticket size={size} aria-hidden />;
}

const relogio = (seg: number) => {
  const s = Math.max(0, seg);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
};

/** O estado dos vales, recalculado a cada `passoMs` (a sessão em andamento e a contagem andam). */
export function useVales(passoMs = 1000): EstadoVales {
  const { dados } = useApp();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(t);
  }, [passoMs]);
  return estadoDosVales(dados.config.vales, dados.sessoes, dados.ativa, dados.usosVales, agora);
}

/** Barra do próximo vale (Home e tela Vales). */
export function ProximoVale({ estado }: { estado: EstadoVales }) {
  const p = estado.proximo;
  if (!p) return null;
  const pct = Math.round(p.progresso * 100);
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <p className="flex items-center gap-2 font-bold">
        <IconeVale nome={p.atividade} /> Próximo vale: {p.atividade} ({formatarDuracao(p.minutos * 60)})
      </p>
      <div
        role="progressbar"
        aria-label={`Estudo para o vale de ${p.atividade}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-3 overflow-hidden rounded-full bg-superficie-2"
      >
        <div className="h-full rounded-full bg-verde" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-suave">Faltam {formatarDuracao(p.faltaSeg)} de estudo.</p>
    </div>
  );
}

function Configurar({ cfg }: { cfg: ConfigVales }) {
  const { dados, repo, executar } = useApp();
  const [rascunho, setRascunho] = useState(cfg);
  const gravado = JSON.stringify(cfg);
  useEffect(() => setRascunho(JSON.parse(gravado) as ConfigVales), [gravado]);
  const mudar = (atividades: ConfigVales['atividades']) => setRascunho({ ...rascunho, atividades });
  const valido = rascunho.atividades.length > 0 && rascunho.atividades.every((a) => a.nome.trim() && a.minutos > 0);
  return (
    <Cartao titulo="Como os vales são ganhos">
      <div className="grid grid-cols-1 gap-3">
        <Campo rotulo="Um vale a cada">
          {(id) => (
            <Selecao id={id} value={rascunho.estudoMin} onChange={(e) => setRascunho({ ...rascunho, estudoMin: Number(e.target.value) })}>
              {[30, 45, 60, 90, 120, 150, 180].map((m) => (
                <option key={m} value={m}>
                  {formatarDuracao(m * 60)} de estudo
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <p className="text-sm text-suave">Os vales saem nesta ordem e a lista continua de um dia para o outro.</p>
        <ol className="grid grid-cols-1 gap-2">
          {rascunho.atividades.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="numeros w-5 shrink-0 font-bold text-suave">{i + 1}.</span>
              <Entrada
                aria-label={`Vale ${i + 1}: atividade`}
                className="w-40 min-w-0 flex-1"
                placeholder="Atividade"
                value={a.nome}
                onChange={(e) => mudar(rascunho.atividades.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))}
              />
              <Selecao
                aria-label={`Vale ${i + 1}: duração`}
                className="w-28"
                value={a.minutos}
                onChange={(e) => mudar(rascunho.atividades.map((x, k) => (k === i ? { ...x, minutos: Number(e.target.value) } : x)))}
              >
                {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {formatarDuracao(m * 60)}
                  </option>
                ))}
              </Selecao>
              <BotaoIcone rotulo={`Remover o vale ${i + 1}`} onClick={() => mudar(rascunho.atividades.filter((_, k) => k !== i))}>
                <Trash2 size={16} />
              </BotaoIcone>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="pequeno" variante="fantasma" onClick={() => mudar([...rascunho.atividades, { nome: '', minutos: 60 }])}>
            <Plus size={15} /> Atividade
          </Botao>
          <Botao
            tamanho="pequeno"
            disabled={!valido}
            onClick={() =>
              void executar(
                () => repo.salvarConfig({ ...dados.config, vales: { ...rascunho, atividades: rascunho.atividades.map((a) => ({ nome: a.nome.trim(), minutos: a.minutos })) } }),
                'Vales atualizados.',
              )
            }
          >
            Salvar
          </Botao>
          <Botao tamanho="pequeno" variante="secundario" onClick={() => void executar(() => repo.salvarConfig({ ...dados.config, vales: null }), 'Vales desligados.')}>
            Desligar os vales
          </Botao>
        </div>
        <p className="text-xs text-suave">Contando o estudo desde {formatarData(new Date(cfg.desde))}.</p>
      </div>
    </Cartao>
  );
}

export function Vales() {
  const { dados, repo, executar } = useApp();
  const estado = useVales();
  const cfg = dados.config.vales ?? null;
  // Bipe quando a contagem de um vale chega ao fim com a tela aberta.
  const emUsoAntes = useRef<string | null>(null);
  useEffect(() => {
    const atual = estado.emUso?.id ?? null;
    if (emUsoAntes.current && !atual && dados.usosVales.some((u) => u.id === emUsoAntes.current && !u.fim)) tocarAlerta();
    emUsoAntes.current = atual;
  }, [estado.emUso?.id, dados.usosVales]);

  if (!cfg) {
    return (
      <>
        <CabecalhoTela titulo="Vales" subtitulo="Horas de estudo viram vales para música, exercícios ou o que você quiser." />
        <Cartao>
          <p className="mb-3">
            A cada 2 h de estudo você ganha um vale de 1 h: primeiro Música, depois Exercícios físicos, e assim por diante. Conta o cronômetro, o
            registro manual e a prática com IA.
          </p>
          <Botao onClick={() => void executar(() => repo.salvarConfig({ ...dados.config, vales: { ...VALES_PADRAO, desde: new Date().toISOString() } }), 'Vales ligados.')}>
            <Ticket size={18} /> Ligar os vales
          </Botao>
        </Cartao>
      </>
    );
  }

  const ordem = cfg.atividades.map((a) => a.nome).join(', depois ');
  return (
    <>
      <CabecalhoTela
        titulo="Vales"
        subtitulo={`A cada ${formatarDuracao(cfg.estudoMin * 60)} de estudo, um vale: ${ordem}, e assim por diante.`}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="grid grid-cols-1 content-start gap-4">
          {estado.emUso && (
            <Cartao titulo="Vale em uso">
              <div className="grid grid-cols-1 gap-3">
                <p className="flex items-center gap-2 text-lg font-extrabold">
                  <IconeVale nome={estado.emUso.atividade} size={22} /> {estado.emUso.atividade}
                </p>
                <p className="numeros text-4xl font-extrabold text-verde-forte" aria-live="off">
                  {relogio(estado.emUso.restaSeg)}
                </p>
                <p className="text-sm text-suave">
                  Começou às {formatarHora(estado.emUso.inicio)}; termina às {formatarHora(Date.parse(estado.emUso.inicio) + estado.emUso.minutos * 60_000)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="secundario" onClick={() => void executar(() => repo.terminarVale(estado.emUso!.id), 'Vale terminado.')}>
                    Terminar agora
                  </Botao>
                  <Botao variante="fantasma" onClick={() => void executar(() => repo.desfazerVale(estado.emUso!.id), 'O vale voltou para os disponíveis.')}>
                    Desfazer (usei sem querer)
                  </Botao>
                </div>
              </div>
            </Cartao>
          )}

          <Cartao titulo={`Vales disponíveis (${estado.disponiveis.length})`}>
            {estado.disponiveis.length === 0 ? (
              <p className="text-suave">Nenhum vale guardado. Estude para ganhar o próximo.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {estado.disponiveis.map((v) => (
                  <li key={v.numero} className="flex flex-wrap items-center gap-3 rounded-lg bg-superficie-2 px-3 py-2">
                    <IconeVale nome={v.atividade} />
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block font-bold">
                        {v.atividade} · {formatarDuracao(v.minutos * 60)}
                      </span>
                      <span className="block text-sm text-suave">
                        Ganho em {formatarData(new Date(v.ganhoEm))} às {formatarHora(v.ganhoEm)}
                      </span>
                    </span>
                    <Botao tamanho="pequeno" disabled={Boolean(estado.emUso)} onClick={() => void executar(() => repo.usarVale(v), `Bom proveito: ${v.atividade}.`)}>
                      Usar vale
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao>
            <ProximoVale estado={estado} />
            <p className="mt-2 text-sm text-suave">
              Estudo contado desde {formatarData(new Date(cfg.desde))}: {formatarDuracao(estado.estudadoSeg)} · {estado.ganhos.length}{' '}
              {estado.ganhos.length === 1 ? 'vale ganho' : 'vales ganhos'}.
            </p>
          </Cartao>

          <Cartao titulo="Vales usados">
            {dados.usosVales.length === 0 ? (
              <p className="text-suave">Nenhum ainda.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 text-sm">
                {dados.usosVales.slice(0, 30).map((u) => {
                  const fim = u.fim ? Date.parse(u.fim) : Math.min(Date.now(), Date.parse(u.inicio) + u.minutos * 60_000);
                  return (
                    <li key={u.id} className="flex flex-wrap items-center gap-2">
                      <IconeVale nome={u.atividade} size={15} />
                      <span className="font-bold">{u.atividade}</span>
                      <span className="numeros text-suave">
                        {formatarData(new Date(u.inicio))} · {formatarHora(u.inicio)}–{formatarHora(fim)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>
        <Configurar cfg={cfg} />
      </div>
    </>
  );
}
