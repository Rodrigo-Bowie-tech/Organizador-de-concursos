import { ArrowRight } from 'lucide-react';
import { formatarData, nomeDiaCurto } from '../dominio/datas';
import { TAREFAS_GESTAO, pontosDaGestao } from '../dominio/gestao';
import type { TarefaGestao } from '../dominio/gestao';
import { hojeSP } from '../dominio/painel';
import type { BlocoPlanejado } from '../dominio/tipos';
import { useApp } from '../estado';
import type { Tela } from '../estado';
import { oportunidadesNovas } from '../radar/radar';
import { Botao, Modal, cx } from './ui';

const DESTINO: Record<TarefaGestao, { tela: Tela; nome: string }> = {
  editais: { tela: 'concursos', nome: 'Concursos' },
  outros: { tela: 'radar', nome: 'Radar' },
  inscricoes: { tela: 'concursos', nome: 'Concursos' },
  planejamento: { tela: 'planejamento', nome: 'Planejamento' },
  resultados: { tela: 'concursos', nome: 'Concursos' },
};

/** As tarefas da gestão semanal: marcar, ver o que pede atenção e ir à tela certa. */
export function ListaGestao({ bloco }: { bloco: BlocoPlanejado }) {
  const { dados, repo, executar, irPara } = useApp();
  const hoje = hojeSP(new Date());
  const pontos = pontosDaGestao({
    concursos: dados.concursos,
    disciplinas: dados.disciplinas,
    blocos: dados.blocos,
    novasNoRadar: oportunidadesNovas(dados.oportunidades, dados.filtrosRadar, dados.radarVistoAte, hoje).length,
    hoje,
  });
  const feitas = new Set(bloco.tarefas ?? []);
  const marcar = (id: TarefaGestao, feita: boolean) => {
    const vaiFechar = feita && TAREFAS_GESTAO.every((t) => t.id === id || feitas.has(t.id));
    void executar(() => repo.marcarTarefaGestao(bloco.id, id, feita, TAREFAS_GESTAO.length), vaiFechar ? 'Gestão da semana feita.' : undefined);
  };
  return (
    <ul className="grid grid-cols-1 gap-2">
      {TAREFAS_GESTAO.map((t) => (
        <li key={t.id} className={cx('grid grid-cols-1 gap-1.5 rounded-lg border border-borda px-3 py-2.5', feitas.has(t.id) && 'bg-superficie-2')}>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--verde)]" checked={feitas.has(t.id)} onChange={(e) => marcar(t.id, e.target.checked)} />
            <span className="min-w-0">
              <span className={cx('block font-bold', feitas.has(t.id) && 'text-suave line-through')}>{t.titulo}</span>
              <span className="block text-sm text-suave">{t.texto}</span>
            </span>
          </label>
          {pontos[t.id].map((p) => (
            <p key={p} className="pl-6.5 text-sm font-bold text-alerta">
              {p}
            </p>
          ))}
          <Botao tamanho="pequeno" variante="fantasma" className="justify-self-start" onClick={() => irPara(DESTINO[t.id].tela)}>
            {DESTINO[t.id].nome} <ArrowRight size={14} aria-hidden />
          </Botao>
        </li>
      ))}
    </ul>
  );
}

/** O bloco de gestão aberto pela Home. */
export function ModalGestao({ blocoId, aoFechar }: { blocoId: string | null; aoFechar: () => void }) {
  const { dados, repo, executar } = useApp();
  const bloco = blocoId ? dados.blocos.find((b) => b.id === blocoId) : undefined;
  if (!bloco) return null;
  const marcar = async (status: BlocoPlanejado['status']) => {
    const ok = await executar(() => repo.marcarBloco(bloco.id, status).then(() => true), status === 'feito' ? 'Gestão da semana feita.' : 'Bloco pulado.');
    if (ok) aoFechar();
  };
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Gestão dos concursos"
      largo
      rodape={
        <>
          <Botao variante="fantasma" onClick={() => void marcar('pulado')}>
            Pular esta semana
          </Botao>
          <Botao onClick={() => void marcar('feito')}>Marcar como feito</Botao>
        </>
      }
    >
      <p className="mb-3 text-suave">
        <span className="numeros">
          {nomeDiaCurto(bloco.dia)}, {formatarData(bloco.dia)} · {bloco.inicio}–{bloco.fim}
        </span>
        . O horário da semana para cuidar dos concursos (não conta como estudo).
      </p>
      <ListaGestao bloco={bloco} />
    </Modal>
  );
}
