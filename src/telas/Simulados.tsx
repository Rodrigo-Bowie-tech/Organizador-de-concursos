import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Etiqueta, Modal, Vazio } from '../componentes/ui';
import { distanciaCorte, evolucaoSimulados, percentual } from '../dominio/desempenho';
import { formatarData, formatarDuracao } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import type { Simulado } from '../dominio/tipos';
import { useApp } from '../estado';

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

type Linha = { disciplinaId: string | null; nome: string; nota: string; maximo: string };

function ModalSimulado({ inicial, aoFechar }: { inicial: Simulado | null; aoFechar: () => void }) {
  const { concursoAtivo, disciplinas, dados, repo, executar } = useApp();
  const concursoId = inicial?.concursoId ?? concursoAtivo?.id ?? '';
  const [titulo, setTitulo] = useState(inicial?.titulo ?? `Simulado ${dados.simulados.filter((s) => s.concursoId === concursoId).length + 1}`);
  const [dia, setDia] = useState(inicial?.dia ?? hojeSP());
  const [duracao, setDuracao] = useState(String(inicial?.duracaoMin ?? 240));
  const [obs, setObs] = useState(inicial?.observacoes ?? '');
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial
      ? inicial.notas.map((n) => ({ disciplinaId: n.disciplinaId, nome: n.nome, nota: String(n.nota), maximo: String(n.maximo) }))
      : disciplinas.map((d) => ({ disciplinaId: d.id, nome: d.nome, nota: '', maximo: d.numQuestoes ? String(d.numQuestoes * d.peso) : '' })),
  );
  const validas = linhas.filter((l) => l.nota !== '' && Number(l.maximo) > 0);
  const total = validas.reduce((t, l) => t + Number(l.nota), 0);
  const maximo = validas.reduce((t, l) => t + Number(l.maximo), 0);
  const ok = Boolean(titulo.trim() && dia && validas.length && validas.every((l) => Number(l.nota) >= 0 && Number(l.nota) <= Number(l.maximo)));

  async function salvar() {
    const id = await executar(
      () =>
        repo.salvarSimulado({
          id: inicial?.id,
          concursoId,
          titulo: titulo.trim(),
          dia,
          duracaoMin: Math.max(0, Number(duracao) || 0),
          notas: validas.map((l) => ({ disciplinaId: l.disciplinaId, nome: l.nome, nota: Number(l.nota), maximo: Number(l.maximo) })),
          notaTotal: Math.round(total * 100) / 100,
          notaMaxima: Math.round(maximo * 100) / 100,
          observacoes: obs.trim(),
        }),
      inicial ? 'Simulado atualizado.' : 'Simulado registrado.',
    );
    if (id) aoFechar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar simulado' : 'Registrar simulado'}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!ok} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Título" className="sm:col-span-3">
            {(id) => <Entrada id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
          </Campo>
          <Campo rotulo="Dia">
            {(id) => <Entrada id={id} type="date" value={dia} onChange={(e) => setDia(e.target.value)} />}
          </Campo>
          <Campo rotulo="Duração (min)">
            {(id) => <Entrada id={id} type="number" min={0} value={duracao} onChange={(e) => setDuracao(e.target.value)} />}
          </Campo>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-suave">Nota por disciplina (deixe em branco o que não caiu)</p>
          <div className="grid grid-cols-1 gap-2">
            {linhas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2">
                <span className="truncate text-sm font-bold">{l.nome}</span>
                <Entrada aria-label={`Nota em ${l.nome}`} type="number" min={0} step="0.01" placeholder="nota" value={l.nota} onChange={(e) => setLinhas(linhas.map((x, k) => (k === i ? { ...x, nota: e.target.value } : x)))} />
                <Entrada aria-label={`Máximo em ${l.nome}`} type="number" min={0} step="0.01" placeholder="de" value={l.maximo} onChange={(e) => setLinhas(linhas.map((x, k) => (k === i ? { ...x, maximo: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <p className="numeros mt-2 font-bold">
            Total: {num(total)} de {num(maximo)} {maximo > 0 && `(${Math.round((total / maximo) * 100)}%)`}
          </p>
        </div>
        <Campo rotulo="Observações">
          {(id) => <AreaTexto id={id} className="min-h-16" value={obs} onChange={(e) => setObs(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  );
}

/** Evolução da nota total, com a linha da nota de corte. */
function GraficoEvolucao({ pontos, corte }: { pontos: { rotulo: string; valor: number; maximo: number }[]; corte: number | null }) {
  const L = 560;
  const A = 200;
  const m = { e: 40, d: 16, t: 14, b: 28 };
  const topo = Math.max(corte ?? 0, ...pontos.map((p) => p.maximo), ...pontos.map((p) => p.valor)) || 1;
  const x = (i: number) => m.e + (pontos.length === 1 ? (L - m.e - m.d) / 2 : (i / (pontos.length - 1)) * (L - m.e - m.d));
  const y = (v: number) => m.t + (1 - v / topo) * (A - m.t - m.b);
  const grade = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(topo * f));
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Evolução da nota total nos simulados">
      {grade.map((g) => (
        <g key={g}>
          <line x1={m.e} x2={L - m.d} y1={y(g)} y2={y(g)} stroke="var(--borda)" strokeWidth={1} />
          <text x={m.e - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--texto-suave)">
            {g}
          </text>
        </g>
      ))}
      {corte !== null && (
        <g>
          <line x1={m.e} x2={L - m.d} y1={y(corte)} y2={y(corte)} stroke="var(--alerta)" strokeWidth={2} strokeDasharray="6 4" />
          <text x={L - m.d} y={y(corte) - 6} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--texto)">
            Nota de corte {num(corte)}
          </text>
        </g>
      )}
      <polyline points={pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ')} fill="none" stroke="var(--grafico-tempo)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.valor)} r={5} fill="var(--grafico-tempo)" stroke="var(--superficie)" strokeWidth={2}>
            <title>{`${p.rotulo}: ${num(p.valor)} de ${num(p.maximo)}`}</title>
          </circle>
          <text x={x(i)} y={A - 8} textAnchor="middle" fontSize={11} fill="var(--texto-suave)">
            {p.rotulo}
          </text>
        </g>
      ))}
      {pontos.length > 0 && (
        <text x={x(pontos.length - 1)} y={y(pontos[pontos.length - 1].valor) - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--texto)">
          {num(pontos[pontos.length - 1].valor)}
        </text>
      )}
    </svg>
  );
}

export function Simulados() {
  const { dados, concursoAtivo, repo, executar, irPara } = useApp();
  const [editando, setEditando] = useState<Simulado | null | 'novo'>(null);
  const [excluir, setExcluir] = useState<Simulado | null>(null);

  if (!concursoAtivo) {
    return (
      <>
        <CabecalhoTela titulo="Simulados" />
        <Vazio titulo="Nenhum concurso" texto="Cadastre um concurso para registrar simulados." acao={<Botao onClick={() => irPara('concursos')}>Ir para Concursos</Botao>} />
      </>
    );
  }

  const evolucao = evolucaoSimulados(dados.simulados, concursoAtivo.id);
  const lista = [...evolucao].reverse().map((e) => e.simulado);
  const corte = concursoAtivo.notaCorte;

  return (
    <>
      <CabecalhoTela
        titulo="Simulados"
        subtitulo={`${concursoAtivo.nome}${corte !== null ? ` · nota de corte histórica ${num(corte)}` : ' · cadastre a nota de corte em Concursos para comparar'}`}
        acoes={
          <Botao onClick={() => setEditando('novo')}>
            <Plus size={18} /> Registrar simulado
          </Botao>
        }
      />
      {!lista.length ? (
        <Vazio titulo="Nenhum simulado" texto="Registre as notas por disciplina de cada simulado para acompanhar a evolução e a distância até a nota de corte." acao={<Botao onClick={() => setEditando('novo')}>Registrar simulado</Botao>} />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {evolucao.length > 1 && (
            <Cartao titulo="Evolução da nota total">
              <GraficoEvolucao pontos={evolucao.map((e) => ({ rotulo: formatarData(e.simulado.dia).slice(0, 5), valor: e.simulado.notaTotal, maximo: e.simulado.notaMaxima }))} corte={corte} />
            </Cartao>
          )}
          {lista.map((s) => {
            const dist = distanciaCorte(s, corte);
            return (
              <Cartao
                key={s.id}
                titulo={s.titulo}
                acao={
                  <span className="flex items-center gap-1">
                    {dist !== null && <Etiqueta tom={dist >= 0 ? 'verde' : 'alerta'}>{dist >= 0 ? `${num(dist)} acima do corte` : `faltam ${num(-dist)} para o corte`}</Etiqueta>}
                    <BotaoIcone rotulo={`Editar ${s.titulo}`} onClick={() => setEditando(s)}>
                      <Pencil size={16} />
                    </BotaoIcone>
                    <BotaoIcone rotulo={`Excluir ${s.titulo}`} onClick={() => setExcluir(s)}>
                      <Trash2 size={16} />
                    </BotaoIcone>
                  </span>
                }
              >
                <p className="numeros mb-3 text-suave">
                  {formatarData(s.dia)} · {formatarDuracao(s.duracaoMin * 60)} ·{' '}
                  <strong className="text-texto">
                    {num(s.notaTotal)} de {num(s.notaMaxima)} ({Math.round(percentual(s) * 100)}%)
                  </strong>
                </p>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {s.notas.map((n, i) => (
                    <li key={i} className="grid grid-cols-1 gap-1">
                      <div className="numeros flex justify-between gap-2 text-sm">
                        <span className="truncate">{n.nome}</span>
                        <span className="font-bold">
                          {num(n.nota)}/{num(n.maximo)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-superficie-2 ring-1 ring-borda ring-inset" aria-hidden>
                        <div className="h-full rounded-r bg-grafico-tempo" style={{ width: `${(n.nota / n.maximo) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {s.observacoes && <p className="mt-3 text-sm whitespace-pre-line text-suave">{s.observacoes}</p>}
              </Cartao>
            );
          })}
        </div>
      )}
      {editando && <ModalSimulado inicial={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir simulado?"
        texto={excluir && `${excluir.titulo} (${formatarData(excluir.dia)}) sai do histórico de simulados.`}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirSimulado(excluir.id), 'Simulado excluído.')}
      />
    </>
  );
}
