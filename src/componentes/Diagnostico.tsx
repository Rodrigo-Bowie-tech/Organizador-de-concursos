import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatarDuracao } from '../dominio/datas';
import { todasAsQuestoes } from '../dominio/desempenho';
import { diagnosticoPorAssunto, URGENTE_ABAIXO } from '../dominio/diagnostico';
import type { Acerto, DiagnosticoAssunto } from '../dominio/diagnostico';
import { STATUS_TOPICO } from '../dominio/rotulos';
import { blocosDeTeoriaFeitos } from '../dominio/teoria';
import type { BlocoPlanejado, Disciplina, RegistroQuestoes, Sessao, Simulado } from '../dominio/tipos';
import { Botao, Cartao, Etiqueta } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const numero = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** Quantos assuntos aparecem antes de "mostrar todos" (os que mais caem). */
const PRIMEIROS = 6;

const acerto = (a: Acerto, vazio: string) => (a.feitas ? `${numero(a.acertos)} de ${numero(a.feitas)}` : vazio);
const juntarNomes = (nomes: string[]) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0]);

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-suave" aria-hidden>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm bg-grafico-peso" /> Parte da prova
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm bg-grafico-tempo" /> Parte das horas do plano até a prova
      </span>
    </div>
  );
}

function Assunto({ a, escala }: { a: DiagnosticoAssunto; escala: number }) {
  const [aberto, setAberto] = useState(false);
  const nq = a.disciplina.numQuestoes;
  const largura = (f: number) => `${(Math.min(f, escala) / escala) * 100}%`;
  return (
    <li className="grid grid-cols-1 gap-2 rounded-lg border border-borda p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-extrabold">{a.disciplina.nome}</span>
          {a.urgente && <Etiqueta tom="alerta">Estudar logo</Etiqueta>}
        </span>
        <span className="numeros text-sm text-suave">
          {nq ? `${nq} ${nq === 1 ? 'questão' : 'questões'} · ` : ''}
          {pct(a.fracaoProva)} da prova
        </span>
      </div>
      <div className="grid grid-cols-1 gap-0.5 border-l border-borda" aria-hidden>
        <div className="h-3 rounded-r bg-grafico-peso" style={{ width: largura(a.fracaoProva) }} />
        <div className="h-3 rounded-r bg-grafico-tempo" style={{ width: largura(a.fracaoPlano) }} />
      </div>
      <p className="text-sm">
        No plano até a prova: <strong className="numeros">{formatarDuracao(a.minutosNoPlano * 60)}</strong>{' '}
        <span className="numeros text-suave">({pct(a.fracaoPlano)} das horas)</span>
      </p>
      <p className="text-xs text-suave">
        {[
          a.segundos >= 60 ? `estudou ${formatarDuracao(a.segundos)}` : 'sem estudo ainda',
          `teoria ${numero(a.teoria.feitos)} de ${numero(a.teoria.previstos)} blocos`,
          `questões ${acerto(a.questoes, 'nenhuma ainda')}`,
          `simulados ${acerto(a.simulados, 'não caiu')}`,
        ].join(' · ')}
      </p>
      {a.topicos.length > 0 && (
        <Botao tamanho="pequeno" variante="fantasma" className="justify-self-start" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          {aberto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} Tópicos ({a.topicos.length})
        </Botao>
      )}
      {aberto && (
        <ul className="grid grid-cols-1 gap-1.5 border-t border-borda pt-2" aria-label={`Tópicos de ${a.disciplina.nome}`}>
          {a.topicos.map(({ topico: t, teoria, questoes, segundos }) => (
            <li key={t.id} className="text-sm">
              <span className="block font-bold">{t.titulo}</span>
              <span className="block text-xs text-suave">
                {[
                  STATUS_TOPICO[t.status],
                  `teoria ${numero(teoria.feitos)} de ${numero(teoria.previstos)}`,
                  questoes.feitas ? `questões ${questoes.acertos} de ${questoes.feitas}` : 'sem questões',
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
 * Quanto estudar de cada assunto: a parte dele na prova (incidência, questões × peso) ao lado da
 * parte das horas que o plano reserva até a prova. O desempenho fica como informação e marca o que
 * estudar logo (foi mal no último simulado), sem mudar as horas.
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
      (a, b) => b.valor - a.valor || a.disciplina.ordem - b.disciplina.ordem,
    );
  }, [disciplinas, todasDisciplinas, sessoes, registros, simulados, blocos, blocoMin, agora]);
  const [todos, setTodos] = useState(false);

  if (!lista.length) return null;
  const visiveis = todos ? lista : lista.slice(0, PRIMEIROS);
  const maximo = Math.max(0.1, ...lista.flatMap((a) => [a.fracaoProva, a.fracaoPlano]));
  const escala = Math.min(1, Math.ceil(maximo * 10) / 10);
  const urgentes = lista.filter((a) => a.urgente).map((a) => a.disciplina.nome);

  return (
    <Cartao
      titulo="Quanto estudar por assunto"
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
          O tempo de cada assunto segue a incidência dele na prova (questões × peso): o que mais cai aparece mais no plano. O desempenho não muda as horas,
          só diz o que estudar primeiro.
        </p>
        {urgentes.length > 0 && (
          <p>
            Estudar logo: <strong>{juntarNomes(urgentes)}</strong> (acertou menos da metade no último simulado em que caiu).
          </p>
        )}
        <Legenda />
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Assuntos, do que mais cai para o que menos cai">
          {visiveis.map((a) => (
            <Assunto key={a.disciplina.id} a={a} escala={escala} />
          ))}
        </ol>
        {lista.length > PRIMEIROS && (
          <Botao variante="secundario" className="justify-self-start" aria-expanded={todos} onClick={() => setTodos(!todos)}>
            {todos ? `Mostrar só os ${PRIMEIROS} que mais caem` : `Mostrar os outros ${lista.length - PRIMEIROS} assuntos`}
          </Botao>
        )}
        <p className="text-xs text-suave">
          Escala de 0 a {pct(escala)}. As horas do plano passam da parte da prova quando a teoria do assunto é longa para a incidência (toda a teoria
          precisa caber até uma semana antes da prova) ou quando há blocos fixos, e ficam abaixo quando há tópicos dominados ou revisões de outros
          assuntos. Estudar logo = menos de {pct(URGENTE_ABAIXO)} de acerto no último simulado em que o assunto caiu: o plano o põe antes, sem mais horas.
          Questões dos cadernos, das sessões e de Questões contam no desempenho.
        </p>
      </div>
    </Cartao>
  );
}
