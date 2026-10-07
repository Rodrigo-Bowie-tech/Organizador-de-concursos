import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Entrada, Selecao } from '../componentes/ui';
import { formatarData, formatarDuracao } from '../dominio/datas';
import { minutos } from '../dominio/planejador';
import type { BlocoHorario, Disponibilidade as Disp } from '../dominio/tipos';
import { useApp } from '../estado';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function Janelas({ lista, aoMudar, rotulo }: { lista: BlocoHorario[]; aoMudar: (l: BlocoHorario[]) => void; rotulo: string }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {lista.map((b, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Entrada aria-label={`${rotulo}: início ${i + 1}`} type="time" className="w-28" value={b.inicio} onChange={(e) => aoMudar(lista.map((x, k) => (k === i ? { ...x, inicio: e.target.value } : x)))} />
          <span className="text-suave">às</span>
          <Entrada aria-label={`${rotulo}: fim ${i + 1}`} type="time" className="w-28" value={b.fim} onChange={(e) => aoMudar(lista.map((x, k) => (k === i ? { ...x, fim: e.target.value } : x)))} />
          <Entrada aria-label={`${rotulo}: rótulo ${i + 1}`} className="w-40 min-w-0 flex-1" placeholder="Rótulo (opcional)" value={b.rotulo ?? ''} onChange={(e) => aoMudar(lista.map((x, k) => (k === i ? { ...x, rotulo: e.target.value } : x)))} />
          <BotaoIcone rotulo={`Remover horário ${i + 1} de ${rotulo}`} onClick={() => aoMudar(lista.filter((_, k) => k !== i))}>
            <Trash2 size={16} />
          </BotaoIcone>
        </div>
      ))}
      <Botao
        tamanho="pequeno"
        variante="fantasma"
        className="justify-self-start"
        aria-label={`Adicionar horário em ${rotulo}`}
        onClick={() => aoMudar([...lista, { inicio: '20:00', fim: '22:00' }])}
      >
        <Plus size={15} /> Horário
      </Botao>
    </div>
  );
}

export function Disponibilidade() {
  const { dados, repo, executar, irPara } = useApp();
  const [d, setD] = useState<Disp>(dados.disponibilidade);
  const [novaData, setNovaData] = useState('');
  useEffect(() => setD(dados.disponibilidade), [dados.disponibilidade]);

  const total = Object.values(d.dias).flat().reduce((t, b) => t + minutos(b), 0);
  const valido = Object.values(d.dias).flat().concat(Object.values(d.excecoes).flatMap((e) => e.blocos)).every((b) => minutos(b) > 0);

  async function salvar(replanejar: boolean) {
    const limpo: Disp = {
      ...d,
      dias: Object.fromEntries(Object.entries(d.dias).map(([k, l]) => [k, l.map((b) => (b.rotulo?.trim() ? { ...b, rotulo: b.rotulo.trim() } : { inicio: b.inicio, fim: b.fim }))])),
    };
    const ok = await executar(async () => {
      await repo.salvarDisponibilidade(limpo);
      if (replanejar) await repo.replanejar();
      return true;
    }, replanejar ? 'Disponibilidade salva e plano refeito.' : 'Disponibilidade salva.');
    if (ok && replanejar) irPara('planejamento');
  }

  return (
    <>
      <CabecalhoTela
        titulo="Disponibilidade"
        subtitulo={`Horários livres para estudar na semana: ${formatarDuracao(total * 60)}. O planejador distribui os tópicos nesses blocos.`}
        acoes={
          <Botao variante="secundario" onClick={() => irPara('planejamento')}>
            <ArrowLeft size={18} /> Planejamento
          </Botao>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <Cartao titulo="Grade semanal">
          <div className="grid grid-cols-1 gap-4">
            {DIAS.map((nome, i) => (
              <section key={nome} className="grid grid-cols-1 gap-2 border-b border-borda pb-4 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">{nome}</h3>
                  {i === 1 && (d.dias['1'] ?? []).length > 0 && (
                    <Botao tamanho="pequeno" variante="fantasma" onClick={() => setD({ ...d, dias: { ...d.dias, '2': d.dias['1'], '3': d.dias['1'], '4': d.dias['1'], '5': d.dias['1'] } })}>
                      <Copy size={15} /> Copiar para terça a sexta
                    </Botao>
                  )}
                </div>
                <Janelas rotulo={nome} lista={d.dias[String(i)] ?? []} aoMudar={(l) => setD({ ...d, dias: { ...d.dias, [String(i)]: l } })} />
              </section>
            ))}
          </div>
        </Cartao>

        <div className="grid grid-cols-1 content-start gap-4">
          <Cartao titulo="Blocos">
            <Campo rotulo="Duração de cada bloco de estudo">
              {(id) => (
                <Selecao id={id} value={d.blocoMin} onChange={(e) => setD({ ...d, blocoMin: Number(e.target.value) })}>
                  {[30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {formatarDuracao(m * 60)}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          </Cartao>

          <Cartao titulo="Exceções">
            <p className="mb-3 text-sm text-suave">Plantão, viagem ou folga: nesse dia valem só os horários da exceção.</p>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(d.excecoes)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dia, ex]) => (
                  <section key={dia} className="grid grid-cols-1 gap-2 rounded-lg bg-superficie-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="numeros">{formatarData(dia)}</strong>
                      <BotaoIcone
                        rotulo={`Remover exceção de ${formatarData(dia)}`}
                        onClick={() => setD({ ...d, excecoes: Object.fromEntries(Object.entries(d.excecoes).filter(([k]) => k !== dia)) })}
                      >
                        <Trash2 size={16} />
                      </BotaoIcone>
                    </div>
                    <Entrada aria-label={`Motivo da exceção de ${formatarData(dia)}`} value={ex.motivo} placeholder="Motivo" onChange={(e) => setD({ ...d, excecoes: { ...d.excecoes, [dia]: { ...ex, motivo: e.target.value } } })} />
                    {ex.blocos.length === 0 && <p className="text-sm font-bold text-alerta">Sem estudo neste dia.</p>}
                    <Janelas rotulo={`Exceção de ${formatarData(dia)}`} lista={ex.blocos} aoMudar={(l) => setD({ ...d, excecoes: { ...d.excecoes, [dia]: { ...ex, blocos: l } } })} />
                  </section>
                ))}
              <div className="flex flex-wrap items-end gap-2">
                <Campo rotulo="Nova exceção" className="flex-1">
                  {(id) => <Entrada id={id} type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />}
                </Campo>
                <Botao
                  variante="secundario"
                  disabled={!novaData || Boolean(d.excecoes[novaData])}
                  onClick={() => {
                    setD({ ...d, excecoes: { ...d.excecoes, [novaData]: { blocos: [], motivo: '' } } });
                    setNovaData('');
                  }}
                >
                  Adicionar
                </Botao>
              </div>
            </div>
          </Cartao>

          <Cartao>
            {!valido && <p className="mb-2 text-sm font-bold text-perigo">Há horário com fim antes do início.</p>}
            <div className="flex flex-wrap gap-2">
              <Botao disabled={!valido} onClick={() => void salvar(true)}>
                Salvar e replanejar
              </Botao>
              <Botao variante="secundario" disabled={!valido} onClick={() => void salvar(false)}>
                Só salvar
              </Botao>
            </div>
          </Cartao>
        </div>
      </div>
    </>
  );
}
