import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ModalSessao } from '../componentes/ModaisSessao';
import { Botao, BotaoIcone, CabecalhoTela, Cartao, Confirmar, Etiqueta, Selecao, Vazio } from '../componentes/ui';
import { segundosLiquidos } from '../dominio/cronometro';
import { diaDaSemana, diaSP, formatarData, formatarDuracao, formatarHora } from '../dominio/datas';
import { TIPO_SESSAO } from '../dominio/rotulos';
import type { Sessao } from '../dominio/tipos';
import { useApp } from '../estado';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const PAGINA = 80;

export function Historico() {
  const { dados, repo, executar } = useApp();
  const [filtroConcurso, setFiltroConcurso] = useState('');
  const [filtroDisciplina, setFiltroDisciplina] = useState('');
  const [limite, setLimite] = useState(PAGINA);
  const [modal, setModal] = useState<{ sessao: Sessao | null } | null>(null);
  const [excluir, setExcluir] = useState<Sessao | null>(null);

  const disciplinasPorId = useMemo(() => new Map(dados.disciplinas.map((d) => [d.id, d])), [dados.disciplinas]);
  const disciplinasFiltro = dados.disciplinas.filter((d) => !filtroConcurso || d.concursoId === filtroConcurso);

  const filtradas = dados.sessoes.filter(
    (s) => (!filtroConcurso || s.concursoId === filtroConcurso) && (!filtroDisciplina || s.disciplinaId === filtroDisciplina),
  );
  const visiveis = filtradas.slice(0, limite);

  const grupos = useMemo(() => {
    const m = new Map<string, Sessao[]>();
    for (const s of visiveis) {
      const dia = diaSP(s.inicio);
      m.set(dia, [...(m.get(dia) ?? []), s]);
    }
    return [...m.entries()];
  }, [visiveis]);

  const total = filtradas.reduce((t, s) => t + segundosLiquidos(s, Date.now()), 0);

  return (
    <>
      <CabecalhoTela
        titulo="Histórico"
        subtitulo={filtradas.length ? `${filtradas.length} sessões · ${formatarDuracao(total)} líquidas` : undefined}
        acoes={
          <Botao onClick={() => setModal({ sessao: null })}>
            <Plus size={18} /> Registrar estudo manual
          </Botao>
        }
      />

      {dados.sessoes.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Selecao aria-label="Filtrar por concurso" value={filtroConcurso} onChange={(e) => { setFiltroConcurso(e.target.value); setFiltroDisciplina(''); }}>
            <option value="">Todos os concursos</option>
            {dados.concursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <Selecao aria-label="Filtrar por disciplina" value={filtroDisciplina} onChange={(e) => setFiltroDisciplina(e.target.value)}>
            <option value="">Todas as disciplinas</option>
            {disciplinasFiltro.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Selecao>
        </div>
      )}

      {!filtradas.length ? (
        <Vazio
          titulo={dados.sessoes.length ? 'Nada com esses filtros' : 'Nenhuma sessão ainda'}
          texto={dados.sessoes.length ? 'Troque os filtros para ver outras sessões.' : 'As sessões do cronômetro aparecem aqui. Estudou sem cronômetro? Registre manualmente.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {grupos.map(([dia, sessoes]) => (
            <Cartao
              key={dia}
              titulo={
                <span className="numeros">
                  {formatarData(dia)} <span className="font-bold text-suave">· {DIAS[diaDaSemana(dia)]}</span>
                </span>
              }
              acao={<Etiqueta tom="verde">{formatarDuracao(sessoes.reduce((t, s) => t + segundosLiquidos(s, Date.now()), 0))}</Etiqueta>}
            >
              <ul className="grid grid-cols-1">
                {sessoes.map((s) => {
                  const d = s.disciplinaId ? disciplinasPorId.get(s.disciplinaId) : undefined;
                  const topico = d && s.topicoId ? d.topicos[s.topicoId] : undefined;
                  return (
                    <li key={s.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-borda py-3 first:border-t-0 first:pt-0">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d?.cor ?? 'var(--borda)' }} aria-hidden />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="font-bold">
                          {d?.nome ?? (s.disciplinaId ? 'Disciplina removida' : 'Sem disciplina')}
                          {topico && <span className="font-normal text-suave"> · {topico.titulo}</span>}
                        </p>
                        <p className="numeros text-sm text-suave">
                          {formatarHora(s.inicio)}–{s.fim ? formatarHora(s.fim) : '…'} · {TIPO_SESSAO[s.tipo]}
                          {s.pausas.length > 0 && ` · ${s.pausas.length} ${s.pausas.length === 1 ? 'pausa' : 'pausas'}`}
                          {s.questoesFeitas > 0 && ` · ${s.acertos}/${s.questoesFeitas} questões (${Math.round((s.acertos / s.questoesFeitas) * 100)}%)`}
                          {s.paginas > 0 && ` · ${s.paginas} págs.`}
                        </p>
                        {s.anotacoes && <p className="mt-1 text-sm whitespace-pre-line">{s.anotacoes}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {s.origem === 'manual' && <Etiqueta>manual</Etiqueta>}
                        {s.origem === 'pratica_ia' && <Etiqueta tom="roxo">prática IA</Etiqueta>}
                        {s.concluiuTeoria && <Etiqueta tom="verde">teoria concluída</Etiqueta>}
                        <span className="numeros ml-1 font-extrabold">{formatarDuracao(segundosLiquidos(s, Date.now()))}</span>
                        <BotaoIcone rotulo="Editar sessão" onClick={() => setModal({ sessao: s })}>
                          <Pencil size={16} />
                        </BotaoIcone>
                        <BotaoIcone rotulo="Excluir sessão" onClick={() => setExcluir(s)}>
                          <Trash2 size={16} />
                        </BotaoIcone>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          ))}
          {filtradas.length > limite && (
            <Botao variante="secundario" className="justify-self-center" onClick={() => setLimite((l) => l + PAGINA)}>
              Mostrar mais
            </Botao>
          )}
        </div>
      )}

      <ModalSessao aberto={Boolean(modal)} aoFechar={() => setModal(null)} sessao={modal?.sessao ?? null} />
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir sessão?"
        texto={excluir && `A sessão de ${formatarData(diaSP(excluir.inicio))} às ${formatarHora(excluir.inicio)} (${formatarDuracao(segundosLiquidos(excluir, Date.now()))}) sai do histórico.`}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirSessao(excluir.id), 'Sessão excluída.')}
      />
    </>
  );
}
