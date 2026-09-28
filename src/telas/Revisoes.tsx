import { Play } from 'lucide-react';
import { useState } from 'react';
import { PainelMateriais } from '../componentes/Materiais';
import { BotaoPraticar } from '../componentes/PraticaIA';
import { Botao, CabecalhoTela, Cartao, Etiqueta, Modal, Vazio, cx } from '../componentes/ui';
import { formatarData, somarDias } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import { descreverIntervalo, previsao, revisoesAgendadas, separarRevisoes } from '../dominio/revisoes';
import type { Avaliacao, RevisaoPendente } from '../dominio/revisoes';
import { caminhoDoTopico } from '../dominio/topicos';
import { useApp } from '../estado';

const AVALIACOES: { valor: Avaliacao; rotulo: string; dica: string; classe: string }[] = [
  { valor: 'errei', rotulo: 'Errei', dica: 'Não lembrava', classe: 'border-perigo/50 text-perigo hover:bg-perigo-suave' },
  { valor: 'dificil', rotulo: 'Difícil', dica: 'Lembrei com esforço', classe: 'border-alerta/50 text-alerta hover:bg-alerta/10' },
  { valor: 'bom', rotulo: 'Bom', dica: 'Lembrei bem', classe: 'border-verde/60 text-verde-forte hover:bg-verde-suave' },
  { valor: 'facil', rotulo: 'Fácil', dica: 'Sei de cor', classe: 'border-roxo/50 text-roxo hover:bg-roxo/10' },
];

export function ModalRevisao({ item, aoFechar }: { item: RevisaoPendente | null; aoFechar: () => void }) {
  const { dados, repo, executar, avisar, irPara } = useApp();
  if (!item) return null;
  const { disciplina, topico, estado } = item;
  const concurso = dados.concursos.find((c) => c.id === disciplina.concursoId);

  async function avaliar(a: Avaliacao) {
    if (!item) return;
    const novo = await executar(() => repo.registrarRevisao(disciplina.id, topico.id, a));
    if (novo) {
      avisar(`Revisão registrada. Próxima ${descreverIntervalo(novo.intervalo)} (${formatarData(novo.proxima)}).`);
      aoFechar();
    }
  }

  async function estudar() {
    const s = await executar(() =>
      repo.iniciarSessao({ concursoId: disciplina.concursoId, disciplinaId: disciplina.id, topicoId: topico.id, tipo: 'revisao' }),
    );
    if (s) {
      aoFechar();
      irPara('cronometro');
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Revisar: ${topico.titulo}`} largo>
      <div className="grid gap-5">
        <p className="text-sm text-suave">
          {[concurso?.nome, disciplina.nome, ...caminhoDoTopico(disciplina.topicos, topico.id).slice(0, -1)].filter(Boolean).join(' › ')}
          {' · '}
          {estado.ultima ? `última revisão em ${formatarData(estado.ultima)}` : 'primeira revisão'}
        </p>

        <section className="grid gap-2">
          <h3 className="font-extrabold">Materiais</h3>
          <PainelMateriais disciplinaId={disciplina.id} topicoId={topico.id} />
        </section>

        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" tamanho="pequeno" disabled={Boolean(dados.ativa)} onClick={() => void estudar()}
            title={dados.ativa ? 'Já existe uma sessão em andamento' : undefined}>
            <Play size={16} /> Revisar com cronômetro
          </Botao>
          <BotaoPraticar disciplinaId={disciplina.id} topicoId={topico.id} />
        </div>

        <section className="grid gap-2">
          <h3 className="font-extrabold">Como foi a revisão?</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AVALIACOES.map((a) => (
              <button
                key={a.valor}
                type="button"
                onClick={() => void avaliar(a.valor)}
                className={cx('flex flex-col items-center rounded-lg border-2 px-2 py-2.5 transition', a.classe)}
              >
                <span className="font-extrabold">{a.rotulo}</span>
                <span className="text-xs opacity-80">{a.dica}</span>
                <span className="mt-1 text-xs font-bold">{descreverIntervalo(previsao(estado, a.valor))}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function ItemRevisao({ item, aoRevisar }: { item: RevisaoPendente; aoRevisar: () => void }) {
  const { dados } = useApp();
  const concurso = dados.concursos.find((c) => c.id === item.disciplina.concursoId);
  const { estado, atraso } = item;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-borda py-3 first:border-t-0 first:pt-0">
      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: item.disciplina.cor }} aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-bold">{item.topico.titulo}</p>
        <p className="text-sm text-suave">
          {item.disciplina.nome}
          {concurso && ` · ${concurso.nome}`} · {estado.repeticoes + 1}ª revisão
          {estado.lapsos > 0 && ` · ${estado.lapsos} ${estado.lapsos === 1 ? 'erro' : 'erros'}`}
        </p>
      </div>
      {atraso > 0 && <Etiqueta tom="alerta">atrasada há {atraso} {atraso === 1 ? 'dia' : 'dias'}</Etiqueta>}
      {atraso === 0 && <Etiqueta tom="verde">hoje</Etiqueta>}
      {atraso < 0 && <Etiqueta>{formatarData(estado.proxima)}</Etiqueta>}
      <Botao tamanho="pequeno" variante={atraso >= 0 ? 'primario' : 'secundario'} onClick={aoRevisar}>
        Revisar
      </Botao>
    </li>
  );
}

export function Revisoes() {
  const { dados, repo, executar } = useApp();
  const [aberta, setAberta] = useState<RevisaoPendente | null>(null);
  const hoje = hojeSP();
  const todas = revisoesAgendadas(dados.disciplinas, hoje);
  const { atrasadas, hoje: deHoje, proximas } = separarRevisoes(todas);
  const semRevisao = repo.concluidosSemRevisao().length;
  const feitasHoje = dados.revisoesFeitas.filter((r) => r.dia === hoje).length;
  const proximaFutura = todas.find((r) => r.atraso < 0);

  const secao = (titulo: string, lista: RevisaoPendente[]) =>
    lista.length > 0 && (
      <Cartao titulo={`${titulo} (${lista.length})`}>
        <ul>
          {lista.map((r) => (
            <ItemRevisao key={`${r.disciplina.id}:${r.topico.id}`} item={r} aoRevisar={() => setAberta(r)} />
          ))}
        </ul>
      </Cartao>
    );

  return (
    <>
      <CabecalhoTela
        titulo="Revisões"
        subtitulo="Revisões espaçadas a partir da teoria concluída: D+1, D+7, D+30 e D+90, ajustadas pela sua avaliação."
        acoes={feitasHoje > 0 && <Etiqueta tom="verde">{feitasHoje} feitas hoje</Etiqueta>}
      />

      <div className="grid gap-4">
        {semRevisao > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-verde-suave px-4 py-3">
            <p className="font-bold text-verde-forte">
              {semRevisao} {semRevisao === 1 ? 'tópico concluído ainda não tem' : 'tópicos concluídos ainda não têm'} revisão agendada.
            </p>
            <Botao tamanho="pequeno" onClick={() => void executar(() => repo.agendarRevisoesPendentes(), 'Revisões agendadas para amanhã.')}>
              Agendar para amanhã
            </Botao>
          </div>
        )}

        {atrasadas.length + deHoje.length === 0 && (
          <Vazio
            titulo={todas.length ? 'Nenhuma revisão para hoje' : 'Nenhuma revisão agendada'}
            texto={
              todas.length
                ? `Tudo em dia.${proximaFutura ? ` A próxima é em ${formatarData(proximaFutura.estado.proxima)}.` : ''}`
                : 'Marque a teoria de um tópico como concluída no Edital (ou ao finalizar uma sessão) e a primeira revisão aparece aqui no dia seguinte.'
            }
          />
        )}
        {secao('Atrasadas', atrasadas)}
        {secao('Hoje', deHoje)}
        {secao(`Próximos 7 dias (até ${formatarData(somarDias(hoje, 7))})`, proximas)}
      </div>

      <ModalRevisao item={aberta} aoFechar={() => setAberta(null)} />
    </>
  );
}
