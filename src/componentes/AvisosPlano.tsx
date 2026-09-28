import { AlertTriangle, Gauge } from 'lucide-react';
import { useMemo, useState } from 'react';
import { avisoCapacidade, capacidadeReal, viabilidade } from '../dominio/adaptacao';
import type { Viabilidade } from '../dominio/adaptacao';
import { diaSP, formatarData } from '../dominio/datas';
import { acertoRecente } from '../dominio/planejador';
import { useApp } from '../estado';
import { Botao, Modal, cx } from './ui';

/** Capacidade real e edital que não fecha: os avisos da seção 5.4. */
export function AvisosPlano({ compacto }: { compacto?: boolean }) {
  const { dados, repo } = useApp();
  const [cortes, setCortes] = useState<Viabilidade | null>(null);

  const { capacidade, inviaveis } = useMemo(() => {
    if (!repo.temDisponibilidade()) return { capacidade: [], inviaveis: [] };
    const agora = new Date();
    const todas = dados.ativa ? [...dados.sessoes, dados.ativa] : dados.sessoes;
    const capacidade = dados.config.usarCapacidadeReal
      ? capacidadeReal(todas, dados.disponibilidade, agora).filter((c) => c.ajustado)
      : [];
    const acertos = acertoRecente(
      dados.sessoes.map((s) => ({ topicoId: s.topicoId, feitas: s.questoesFeitas, acertos: s.acertos, dia: diaSP(s.inicio) })),
      diaSP(agora),
    );
    const cap = repo.capacidadeDoPlano();
    const inviaveis = dados.concursos
      .filter((c) => c.status !== 'prova_feita')
      .map((c) => viabilidade(c, dados.disciplinas, dados.disponibilidade, agora, acertos, cap))
      .filter((v): v is Viabilidade => Boolean(v && !v.fecha));
    return { capacidade, inviaveis };
  }, [dados, repo]);

  if (!capacidade.length && !inviaveis.length) return null;

  return (
    <div className={cx('grid gap-2', !compacto && 'mb-4')}>
      {capacidade.map((c) => (
        <p key={c.diaSemana} className="flex items-start gap-2 rounded-lg bg-roxo/10 px-3 py-2 text-sm font-bold text-roxo">
          <Gauge size={18} className="mt-0.5 shrink-0" aria-hidden />
          {avisoCapacidade(c)}
        </p>
      ))}
      {inviaveis.map((v) => (
        <div key={v.concurso.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-alerta/15 px-3 py-2 text-sm">
          <AlertTriangle size={18} className="shrink-0 text-alerta" aria-hidden />
          <p className="min-w-0 flex-1 basis-64 font-bold text-alerta">
            No seu ritmo, o edital de {v.concurso.nome} não fecha até a prova ({formatarData(v.concurso.dataProva as string)}): faltam {v.necessarios} blocos
            de teoria e cabem {v.disponiveis}.
          </p>
          {v.cortes.length > 0 && (
            <Botao tamanho="pequeno" variante="secundario" onClick={() => setCortes(v)}>
              Ver cortes sugeridos ({v.cortes.length})
            </Botao>
          )}
        </div>
      ))}
      {cortes && <ModalCortes v={cortes} aoFechar={() => setCortes(null)} />}
    </div>
  );
}

function ModalCortes({ v, aoFechar }: { v: Viabilidade; aoFechar: () => void }) {
  const { repo, executar } = useApp();
  const [marcados, setMarcados] = useState(() => new Set(v.cortes.map((i) => i.topico.id)));
  const escolhidos = v.cortes.filter((i) => marcados.has(i.topico.id));
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Cortes sugeridos: ${v.concurso.nome}`}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={!escolhidos.length}
            onClick={async () => {
              const ok = await executar(async () => {
                await repo.cortarTopicos(escolhidos.map((i) => ({ disciplinaId: i.disciplina.id, topicoId: i.topico.id })));
                return true;
              }, `${escolhidos.length} tópicos saíram do plano.`);
              if (ok) aoFechar();
            }}
          >
            Cortar {escolhidos.length} {escolhidos.length === 1 ? 'tópico' : 'tópicos'}
          </Botao>
        </>
      }
    >
      <p className="mb-3 text-sm text-suave">
        Os tópicos de menor prioridade (peso e incidência baixos), do menos ao mais importante. Cortados saem do plano, mas continuam no edital, e
        dá para devolvê-los a qualquer momento.
      </p>
      <ul className="grid gap-1">
        {v.cortes.map((i) => (
          <li key={i.topico.id}>
            <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-superficie-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--verde)]"
                checked={marcados.has(i.topico.id)}
                onChange={(e) => {
                  const n = new Set(marcados);
                  if (e.target.checked) n.add(i.topico.id);
                  else n.delete(i.topico.id);
                  setMarcados(n);
                }}
              />
              <span>
                <span className="font-bold">{i.topico.titulo}</span>
                <span className="text-sm text-suave">
                  {' '}
                  · {i.disciplina.nome} · {i.blocos} {i.blocos === 1 ? 'bloco' : 'blocos'}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
