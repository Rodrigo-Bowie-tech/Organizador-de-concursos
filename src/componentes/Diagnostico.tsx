import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatarDuracao } from '../dominio/datas';
import { todasAsQuestoes } from '../dominio/desempenho';
import { diagnosticoPorAssunto, PRIORI_QUESTOES, PRIORI_SIMULADOS } from '../dominio/diagnostico';
import type { DiagnosticoAssunto } from '../dominio/diagnostico';
import { STATUS_TOPICO } from '../dominio/rotulos';
import { blocosDeTeoriaFeitos } from '../dominio/teoria';
import type { BlocoPlanejado, Disciplina, RegistroQuestoes, Sessao, Simulado } from '../dominio/tipos';
import { Botao, Cartao, cx } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Quantos assuntos aparecem antes de "mostrar todos" (os de mais falta). */
const PRIMEIROS = 6;
const numero = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const COLUNAS = 'grid grid-cols-[5.25rem_minmax(0,1fr)_2.75rem] items-center gap-x-2';

/** Barra de 0 a 100%. Hachurada quando a nota é só a estimativa de 50% (ainda sem dados). */
function Barra({ valor, grossa, estimada }: { valor: number; grossa?: boolean; estimada?: boolean }) {
  return (
    <span className={cx('block w-full overflow-hidden rounded-full bg-superficie-2', grossa ? 'h-3' : 'h-2')} aria-hidden>
      <span
        className={cx('block h-full rounded-full', !estimada && 'bg-grafico-tempo')}
        style={{
          width: `${Math.max(0, Math.min(1, valor)) * 100}%`,
          ...(estimada && { backgroundImage: 'repeating-linear-gradient(135deg, var(--grafico-tempo) 0 2px, transparent 2px 5px)' }),
        }}
      />
    </span>
  );
}

function Nota({ rotulo, valor, detalhe, estimada }: { rotulo: string; valor: number; detalhe: string; estimada?: boolean }) {
  return (
    <div className={cx(COLUNAS, 'gap-y-0.5 text-sm')}>
      <span className="text-suave">{rotulo}</span>
      <Barra valor={valor} estimada={estimada} />
      <span className="numeros text-right">{pct(valor)}</span>
      <span className="col-start-2 col-end-4 text-xs text-suave">{detalhe}</span>
    </div>
  );
}

function Assunto({ a }: { a: DiagnosticoAssunto }) {
  const [aberto, setAberto] = useState(false);
  const nq = a.disciplina.numQuestoes;
  const { teoria, questoes, simulados } = a;
  return (
    <li className="grid grid-cols-1 gap-2 rounded-lg border border-borda p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 font-extrabold">{a.disciplina.nome}</span>
        {nq ? (
          <span className="numeros text-sm text-suave">
            falta ≈ {numero(nq * (1 - a.dominio))} de {nq} {nq === 1 ? 'questão' : 'questões'}
          </span>
        ) : null}
      </div>
      <div className={COLUNAS}>
        <span className="text-sm font-bold">Domínio</span>
        <Barra valor={a.dominio} grossa />
        <span className="numeros text-right font-extrabold">{pct(a.dominio)}</span>
      </div>
      <Nota
        rotulo="Teoria"
        valor={a.notas.teoria}
        detalhe={`${numero(teoria.feitos)} de ${numero(teoria.previstos)} blocos · ${a.segundos >= 60 ? `${formatarDuracao(a.segundos)} estudadas` : 'sem estudo ainda'}`}
      />
      <Nota
        rotulo="Questões"
        valor={a.notas.questoes}
        estimada={!questoes.feitas}
        detalhe={questoes.feitas ? `${questoes.acertos} de ${questoes.feitas} certas (${pct(questoes.acertos / questoes.feitas)})` : 'nenhuma ainda: conta 50%'}
      />
      <Nota
        rotulo="Simulados"
        valor={a.notas.simulados}
        estimada={!simulados.feitas}
        detalhe={simulados.feitas ? `${numero(simulados.acertos)} de ${numero(simulados.feitas)} certas` : 'não caiu em simulado: conta 50%'}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          No plano até a prova: <strong className="numeros">{formatarDuracao(a.minutosNoPlano * 60)}</strong>
        </span>
        {a.topicos.length > 0 && (
          <Botao tamanho="pequeno" variante="fantasma" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            {aberto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} Tópicos ({a.topicos.length})
          </Botao>
        )}
      </div>
      {aberto && (
        <ul className="grid grid-cols-1 gap-1.5 border-t border-borda pt-2" aria-label={`Tópicos de ${a.disciplina.nome}`}>
          {a.topicos.map(({ topico: t, teoria: tt, questoes: q, segundos }) => (
            <li key={t.id} className="text-sm">
              <span className="block font-bold">{t.titulo}</span>
              <span className="block text-xs text-suave">
                {[
                  STATUS_TOPICO[t.status],
                  `teoria ${numero(tt.feitos)} de ${numero(tt.previstos)}`,
                  q.feitas ? `questões ${q.acertos} de ${q.feitas}` : 'sem questões',
                  segundos >= 60 && formatarDuracao(segundos),
                  t.cortado && 'cortado do plano',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Quanto falta em cada assunto do concurso: o domínio (média da teoria feita, do acerto nas
 * questões e do acerto nos simulados), as horas que o plano ainda reserva e o detalhe por tópico.
 */
export function CartaoDiagnostico({
  disciplinas,
  todasDisciplinas,
  sessoes,
  registros,
  simulados,
  blocos,
  blocoMin,
  agora,
  aoAbrirCadernos,
}: {
  /** Disciplinas do concurso ativo. */
  disciplinas: Disciplina[];
  /** Todas, para somar a teoria de tópicos vinculados. */
  todasDisciplinas: Disciplina[];
  /** Com a sessão em andamento, se houver. */
  sessoes: Sessao[];
  registros: RegistroQuestoes[];
  simulados: Simulado[];
  blocos: BlocoPlanejado[];
  blocoMin: number;
  agora: Date | number;
  /** Atalho para os cadernos de questões, quando o concurso tem algum. */
  aoAbrirCadernos?: () => void;
}) {
  const lista = useMemo(() => {
    const feitos = blocosDeTeoriaFeitos(sessoes, blocos, todasDisciplinas, blocoMin, agora);
    const questoes = todasAsQuestoes(
      sessoes.filter((s) => s.fim),
      registros,
    );
    return diagnosticoPorAssunto({ disciplinas, sessoes, questoes, simulados, blocos, feitos, blocoMin, agora }).sort(
      (a, b) => b.emRisco - a.emRisco || a.disciplina.ordem - b.disciplina.ordem,
    );
  }, [disciplinas, todasDisciplinas, sessoes, registros, simulados, blocos, blocoMin, agora]);

  const [todos, setTodos] = useState(false);
  if (!lista.length) return null;
  const visiveis = todos ? lista : lista.slice(0, PRIMEIROS);
  const nomes = lista.slice(0, 3).map((a) => a.disciplina.nome);
  const onde = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];

  return (
    <Cartao
      titulo="Quanto falta por assunto"
      acao={
        aoAbrirCadernos && (
          <Botao tamanho="pequeno" variante="secundario" onClick={aoAbrirCadernos}>
            Resolver cadernos
          </Botao>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <p>
          Onde mais falta: <strong>{onde}</strong>. O domínio de cada assunto é a média de três notas: a teoria feita (horas estudadas sobre as previstas), o
          acerto nas questões e o acerto nos simulados.
        </p>
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Domínio por assunto, de onde mais falta para onde menos falta">
          {visiveis.map((a) => (
            <Assunto key={a.disciplina.id} a={a} />
          ))}
        </ol>
        {lista.length > PRIMEIROS && (
          <Botao variante="secundario" className="justify-self-start" aria-expanded={todos} onClick={() => setTodos(!todos)}>
            {todos ? `Mostrar só os ${PRIMEIROS} de mais falta` : `Mostrar os outros ${lista.length - PRIMEIROS} assuntos`}
          </Botao>
        )}
        <p className="text-xs text-suave">
          Falta = questões do assunto na prova × (1 − domínio); o plano divide os blocos de questões nessa proporção, tópico a tópico pelo erro de cada um. Com
          poucas questões, o acerto é puxado para 50%, como se houvesse mais {PRIORI_QUESTOES} questões meio a meio ({PRIORI_SIMULADOS} nos simulados); a
          barra hachurada é essa estimativa, enquanto não há dados. Questões dos cadernos, das sessões e de Questões contam; a teoria vem das sessões de
          teoria e dos blocos marcados.
        </p>
      </div>
    </Cartao>
  );
}
